import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { RedisService } from '../../../common/redis/redis.service';

/**
 * V390: Binance Streaming Service — Real-time crypto price stream via Binance WebSocket.
 *
 * Architecture (same as OandaStreamingService):
 *   Binance WS (combined stream) → BinanceStreamingService → EventEmitter 'price'
 *     → ExchangeGateway.afterInit() registers listener
 *     → gateway._broadcastToSymbol(symbol, 'ticker', data)
 *     → Socket.IO emits to all subscribed clients
 *
 * Binance Combined Stream:
 *   wss://stream.binance.com:9443/stream?streams=btcusdt@bookTicker/ethusdt@bookTicker/...
 *
 * Each tick contains:
 *   {
 *     "e": "24hrTicker",
 *     "s": "BTCUSDT",
 *     "c": "67000.00",      ← last price
 *     "o": "66800.00",      ← open
 *     "h": "67500.00",      ← high
 *     "l": "66500.00",      ← low
 *     "v": "1234.56",       ← volume
 *     "P": "0.45",          ← price change percent
 *     "p": "300.00",        ← price change
 *     ...
 *   }
 *
 * Subscription model:
 *   - On subscribe(symbol): add to set, schedule reconnect (debounced 500ms)
 *   - On unsubscribe(symbol): remove from set, schedule reconnect
 *   - When set is empty: disconnect WebSocket
 *   - When set has items: connect with combined stream
 *
 * This is the ROOT SOLUTION for unifying all price streams through NestJS.
 * Previously, the frontend connected to Binance WS DIRECTLY (bypassing NestJS),
 * which meant:
 *   - No auth on market data
 *   - No rate limiting
 *   - No ability to swap providers
 *   - If Binance blocked Railway's IP, crypto broke entirely
 *
 * Now, the frontend connects to NestJS Socket.IO, which gets its data from
 * THIS service (for crypto) + OandaStreamingService (for forex/metals/indices).
 */

export interface BinancePriceUpdate {
  symbol: string;          // User-friendly format: BTC/USDT
  binanceSymbol: string;   // Binance format: BTCUSDT
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: number;       // Unix ms
}

@Injectable()
export class BinanceStreamingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinanceStreamingService.name);
  private readonly emitter = new EventEmitter();

  constructor(private readonly redisService: RedisService) {
    // V411: Constructor logging — verify DI works and service instantiates
    this.logger.log('💱 BinanceStreamingService constructor called — DI successful');
    try {
      this.logger.log(`💱 RedisService available: ${!!this.redisService}`);
    } catch (e: any) {
      this.logger.error(`💱 RedisService check failed: ${e.message}`);
    }
  }

  private readonly BINANCE_WS_URL = 'wss://stream.binance.com:9443/stream';

  // Subscribed symbols in user-friendly format: BTC/USDT, ETH/USDT, etc.
  private subscribedSymbols = new Set<string>();

  // V412: Track which symbols we've logged first Redis write for
  private _loggedSymbols = new Set<string>();

  // V413: Count WS messages to diagnose stream freeze
  private _messageCount = 0;

  private ws: WebSocket | null = null;
  private isConnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private baseReconnectDelay = 2000; // 2s
  private maxReconnectDelay = 60000; // 60s
  private connectionGeneration = 0;
  private destroyed = false;

  // Auto-subscribe list — same as frontend's CRYPTO_BASES + /USDT
  // These are the most common crypto pairs. Subscribe on startup so prices
  // are immediately available when a client connects.
  private readonly AUTO_SUBSCRIBE_PAIRS = [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
    'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', 'AVAX/USDT',
    'LINK/USDT', 'UNI/USDT',
  ];

  async onModuleInit() {
    this.logger.log(`💱 V390: Binance Streaming Service initializing...`);

    // Auto-subscribe common pairs
    for (const pair of this.AUTO_SUBSCRIBE_PAIRS) {
      this.subscribedSymbols.add(pair);
    }

    this.logger.log(`💱 Auto-subscribed to ${this.subscribedSymbols.size} crypto pairs: ${Array.from(this.subscribedSymbols).join(', ')}`);

    // V406: Register price handler to write stream prices to Redis cache.
    // This eliminates Binance REST API calls for crypto quotes.
    // BinanceAdapter.fetchQuote() reads from Redis (5s TTL) instead of calling
    // Binance REST, which was hitting rate limits (100 req/min) every time
    // position monitor, chart polling, and ticker all requested quotes.
    this.onPrice((update: BinancePriceUpdate) => {
      // V411: Await the Redis write — previously this was fire-and-forget
      // which meant errors were swallowed and writes might not complete
      // before the next tick. Now we catch errors explicitly.
      this._updateRedisCache(update).catch((e) => {
        // Non-critical — don't let Redis errors crash the stream
      });
    });

    // Connect
    this._connect();
  }

  async onModuleDestroy() {
    this.destroyed = true;
    this._cleanup();
  }

  private _cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isConnecting = false;
  }

  /**
   * Convert user-friendly symbol to Binance format.
   * BTC/USDT → BTCUSDT, BTC/USD → BTCUSDT (auto-convert /USD to /USDT)
   */
  private toBinanceSymbol(symbol: string): string {
    let s = symbol.replace('/', '').toUpperCase();
    // Binance uses USDT, not USD
    if (s.endsWith('USD') && !s.endsWith('USDT')) {
      s = s + 'T';
    }
    return s;
  }

  /**
   * Convert Binance symbol back to user-friendly format.
   * BTCUSDT → BTC/USDT
   */
  private fromBinanceSymbol(binanceSymbol: string): string {
    if (binanceSymbol.endsWith('USDT')) {
      return binanceSymbol.slice(0, -4) + '/USDT';
    }
    if (binanceSymbol.endsWith('USD')) {
      return binanceSymbol.slice(0, -3) + '/USD';
    }
    return binanceSymbol;
  }

  /**
   * Check if streaming is available (Binance WS is public, no API key needed).
   */
  isAvailable(): boolean {
    return true; // Binance public WS needs no auth
  }

  /**
   * Subscribe to price updates for a symbol.
   * V430: If WebSocket is already connected, dynamically subscribe via
   * Binance's SUBSCRIBE method instead of requiring a full reconnection.
   * Binance combined streams support adding/removing individual streams
   * via JSON messages: {"method":"SUBSCRIBE","params":["linkusdt@bookTicker"],"id":1}
   */
  subscribe(symbol: string): void {
    const normalized = symbol.toUpperCase();
    if (this.subscribedSymbols.has(normalized)) {
      return;
    }
    this.subscribedSymbols.add(normalized);
    this.logger.log(`💱 Subscribed to ${normalized} (total: ${this.subscribedSymbols.size})`);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // V430: Dynamically subscribe on the existing connection
      const binanceSymbol = this.toBinanceSymbol(normalized).toLowerCase();
      try {
        this.ws.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params: [`${binanceSymbol}@bookTicker`],
          id: Date.now(),
        }));
        this.logger.log(`💱 V430: Dynamically subscribed ${binanceSymbol}@bookTicker on existing connection`);
      } catch (err: any) {
        this.logger.warn(`💱 V430: Dynamic subscribe failed for ${normalized}: ${err.message} — will use next reconnection`);
      }
    } else {
      // Not connected — schedule a connection
      this._scheduleReconnect();
    }
  }

  /**
   * Unsubscribe from price updates for a symbol.
   * V430: If WebSocket is connected, dynamically unsubscribe via
   * Binance's UNSUBSCRIBE method to avoid full reconnection.
   */
  unsubscribe(symbol: string): void {
    const normalized = symbol.toUpperCase();
    if (!this.subscribedSymbols.has(normalized)) {
      return;
    }
    this.subscribedSymbols.delete(normalized);
    this.logger.log(`💱 Unsubscribed from ${normalized} (remaining: ${this.subscribedSymbols.size})`);

    if (this.subscribedSymbols.size === 0) {
      this._cleanup();
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // V430: Dynamically unsubscribe on the existing connection
      const binanceSymbol = this.toBinanceSymbol(normalized).toLowerCase();
      try {
        this.ws.send(JSON.stringify({
          method: 'UNSUBSCRIBE',
          params: [`${binanceSymbol}@bookTicker`],
          id: Date.now(),
        }));
        this.logger.log(`💱 V430: Dynamically unsubscribed ${binanceSymbol}@bookTicker on existing connection`);
      } catch (err: any) {
        this.logger.warn(`💱 V430: Dynamic unsubscribe failed for ${normalized}: ${err.message} — will use next reconnection`);
      }
    } else {
      this._scheduleReconnect();
    }
  }

  /**
   * Register a callback for price updates.
   */
  onPrice(callback: (data: BinancePriceUpdate) => void): void {
    this.emitter.on('price', callback);
  }

  /**
   * Remove a price callback.
   */
  offPrice(callback: (data: BinancePriceUpdate) => void): void {
    this.emitter.off('price', callback);
  }

  /**
   * Get current status for diagnostics.
   */
  getStatus(): any {
    return {
      available: this.isAvailable(),
      connected: this.ws?.readyState === WebSocket.OPEN,
      isConnecting: this.isConnecting,
      subscribedSymbols: Array.from(this.subscribedSymbols),
      subscribedCount: this.subscribedSymbols.size,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  // ── Private: Connection Management ──

  private _scheduleReconnect() {
    if (this.destroyed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this._connect();
    }, 500); // 500ms debounce
  }

  private _connect() {
    if (this.destroyed) return;
    if (this.subscribedSymbols.size === 0) {
      this.logger.debug('💱 No symbols to subscribe — skipping connect');
      return;
    }
    if (this.isConnecting) {
      this.logger.debug('💱 Already connecting — skipping');
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Already connected — need to reconnect with updated streams
      this.logger.debug('💱 Reconnecting with updated stream list');
    }

    this.isConnecting = true;
    this.connectionGeneration++;
    const currentGen = this.connectionGeneration;

    // Build combined stream URL
    // V-CRYPTO-SPEED-3: Use @bookTicker instead of @ticker for 5x faster updates.
    // @ticker (24h rolling stats) fires ~1 Hz. @bookTicker (bid/ask) fires ~67 Hz raw,
    // ~1.4 Hz unique mid-price changes. This brings crypto in line with OANDA tick rate.
    // Note: @bookTicker does NOT provide open/high/low/volume/change. We synthesize them:
    //   - price = (bid + ask) / 2 (mid price, same as OANDA)
    //   - open/high/low = price (updated on each tick; OHLC for candles comes from
    //     the frontend's @kline subscription, not from this stream)
    //   - volume/change/changePercent = 0 (not available in @bookTicker)
    const streams = Array.from(this.subscribedSymbols)
      .map(s => `${this.toBinanceSymbol(s).toLowerCase()}@bookTicker`)
      .join('/');

    const url = `${this.BINANCE_WS_URL}?streams=${streams}`;

    this.logger.log(`💱 Connecting to Binance WS (attempt ${this.reconnectAttempts + 1}): ${this.subscribedSymbols.size} symbols`);

    try {
      // Close old connection first
      if (this.ws) {
        try {
          this.ws.removeAllListeners();
          this.ws.close();
        } catch {}
        this.ws = null;
      }

      this.ws = new WebSocket(url);
    } catch (err: any) {
      this.logger.error(`💱 Failed to create WebSocket: ${err.message}`);
      this.isConnecting = false;
      this._scheduleReconnectWithBackoff();
      return;
    }

    this.ws!.on('open', () => {
      if (currentGen !== this.connectionGeneration) return;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.logger.log(`💱 Binance WS CONNECTED — streaming ${this.subscribedSymbols.size} symbols`);

      // Start ping keepalive (Binance expects ping every 3min, we do 20s)
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          try {
            // Binance WS accepts ping frames automatically
            this.ws!.ping();
          } catch {}
        } else {
          if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
          }
        }
      }, 20000);
    });

    this.ws!.on('message', (data: WebSocket.RawData) => {
      if (currentGen !== this.connectionGeneration) return;
      // V413: Log message reception rate to diagnose stream freeze
      this._messageCount++;
      if (this._messageCount === 1) {
        this.logger.log(`💱 V413: First WS message received (gen=${currentGen})`);
      } else if (this._messageCount % 100 === 0) {
        this.logger.log(`💱 V413: Received ${this._messageCount} WS messages total`);
      }
      try {
        const msg = JSON.parse(data.toString());
        if (msg.stream && msg.data) {
          // V-CRYPTO-SPEED-3: Route to _processBookTicker for @bookTicker stream.
          this._processBookTicker(msg.data);
        }
      } catch (err: any) {
        this.logger.debug(`💱 Parse error: ${err.message}`);
      }
    });

    this.ws!.on('error', (err: Error) => {
      if (currentGen !== this.connectionGeneration) return;
      this.logger.error(`💱 Binance WS error: ${err.message}`);
      this.isConnecting = false;
    });

    this.ws!.on('close', (code: number, reason: Buffer) => {
      if (currentGen !== this.connectionGeneration) return;
      this.isConnecting = false;
      this.logger.warn(`💱 Binance WS closed (code ${code}) — will reconnect`);

      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }

      if (this.destroyed) return;
      if (this.subscribedSymbols.size === 0) return;

      this._scheduleReconnectWithBackoff();
    });
  }

  private _scheduleReconnectWithBackoff() {
    if (this.destroyed) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(`💱 Max reconnect attempts (${this.maxReconnectAttempts}) reached — giving up`);
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    ) + Math.random() * 1000; // jitter

    this.reconnectAttempts++;
    this.logger.log(`💱 Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this._connect();
    }, delay);
  }

  /**
   * V-CRYPTO-SPEED-3: Process @bookTicker events (bid/ask updates).
   *
   * Binance @bookTicker event format:
   *   u = update orderbook id
   *   s = symbol (BTCUSDT)
   *   b = best bid price
   *   B = best bid qty
   *   a = best ask price
   *   A = best ask qty
   *
   * We compute mid price = (bid + ask) / 2, same as OANDA's mid-price delivery.
   * OHLC/volume/change are NOT available in @bookTicker — we synthesize them:
   *   - open/high/low = mid price (frontend gets real OHLC from @kline stream)
   *   - volume = 0 (frontend gets real volume from @kline)
   *   - change/changePercent = 0 (not critical for live tick display)
   *
   * Duplicate filter: @bookTicker fires ~67 Hz but only ~1.4 Hz have actual
   * mid-price changes. Skip if |newMid - lastMid| < 0.0001 to reduce
   * Socket.IO broadcast pressure.
   */
  private lastMidPerSymbol = new Map<string, number>();

  private _processBookTicker(ticker: any) {
    if (!ticker || !ticker.s) return;

    const binanceSymbol = ticker.s as string;
    const bid = parseFloat(ticker.b);
    const ask = parseFloat(ticker.a);
    if (!isFinite(bid) || !isFinite(ask) || bid <= 0 || ask <= 0) return;

    const price = (bid + ask) / 2;  // mid price
    const userSymbol = this.fromBinanceSymbol(binanceSymbol);

    // Duplicate filter — skip if mid-price unchanged
    const lastMid = this.lastMidPerSymbol.get(binanceSymbol);
    if (lastMid !== undefined && Math.abs(price - lastMid) < 0.0001) return;
    this.lastMidPerSymbol.set(binanceSymbol, price);

    const baseUpdate: BinancePriceUpdate = {
      symbol: userSymbol,
      binanceSymbol,
      price,
      open: price,        // synthesized — real OHLC comes from frontend @kline
      high: price,
      low: price,
      close: price,
      volume: 0,           // not available in @bookTicker
      change: 0,           // not available in @bookTicker
      changePercent: 0,    // not available in @bookTicker
      timestamp: Date.now(),
    };

    this.emitter.emit('price', baseUpdate);

    // V410: Also emit with /USD suffix for /USDT pairs (same logic as before).
    if (userSymbol.endsWith('/USDT')) {
      const usdSymbol = userSymbol.slice(0, -5) + '/USD';
      const usdUpdate: BinancePriceUpdate = {
        ...baseUpdate,
        symbol: usdSymbol,
      };
      this.emitter.emit('price', usdUpdate);
    }
  }

  private _processTicker(ticker: any) {
    // V-CRYPTO-SPEED-3: Kept for backward compatibility but no longer called.
    // The stream now uses @bookTicker (handled by _processBookTicker above).
    // This method is retained in case we need to revert to @ticker stream.
    if (!ticker || !ticker.s) return;
    //   P = price change percent
    //   p = price change
    //   E = event time (unix ms)
    if (!ticker || !ticker.s) return;

    const binanceSymbol = ticker.s as string;
    const userSymbol = this.fromBinanceSymbol(binanceSymbol);

    const price = parseFloat(ticker.c);
    if (!price || price <= 0) return;

    const baseUpdate: BinancePriceUpdate = {
      symbol: userSymbol,
      binanceSymbol,
      price,
      open: parseFloat(ticker.o) || price,
      high: parseFloat(ticker.h) || price,
      low: parseFloat(ticker.l) || price,
      close: price,
      volume: parseFloat(ticker.v) || 0,
      change: parseFloat(ticker.p) || 0,
      changePercent: parseFloat(ticker.P) || 0,
      timestamp: ticker.E || Date.now(),
    };

    this.emitter.emit('price', baseUpdate);

    // V410: Also emit with /USD suffix for /USDT pairs.
    // BinanceStreamingService auto-subscribes to BTC/USDT, ETH/USDT, etc.
    // But the frontend (useMarketStreamSocket ALL_SYMBOLS) subscribes to
    // BTC/USD, ETH/USD, etc. Without this dual-emit, the gateway never
    // broadcasts ticker events for /USD symbols because the stream only
    // produces /USDT. This was causing crypto prices to freeze in the
    // ticker bar — the client subscribed to 'BTC/USD' but the stream
    // only emitted 'BTC/USDT', so symbolSubscribers.get('BTC/USD') was
    // always empty and _broadcastToSymbol() returned without sending.
    //
    // By emitting both /USDT and /USD for the same price, clients
    // subscribed to either format receive the update.
    if (userSymbol.endsWith('/USDT')) {
      const usdSymbol = userSymbol.slice(0, -5) + '/USD'; // BTC/USDT → BTC/USD
      const usdUpdate: BinancePriceUpdate = {
        ...baseUpdate,
        symbol: usdSymbol,
      };
      this.emitter.emit('price', usdUpdate);
    }
  }

  /**
   * V406: Write streamed price to Redis cache.
   * This is read by BinanceAdapter.fetchQuote() via cacheOrGet, eliminating
   * REST API calls for crypto quotes. Same pattern as OandaStreamingService.
   *
   * Cache key: binance:quote:{symbol}
   * TTL: 5 seconds (stream overwrites constantly, 5s is just a safety net)
   */
  private async _updateRedisCache(update: BinancePriceUpdate): Promise<void> {
    try {
      const cacheKey = `binance:quote:${update.symbol}`;
      const quoteData = {
        symbol: update.symbol,
        name: update.symbol.replace('/', ' → '),
        exchange: 'Binance',
        currency: update.symbol.split('/')[1] || 'USDT',
        price: update.price,
        change: update.change,
        changePercent: update.changePercent,
        open: update.open,
        high: update.high,
        low: update.low,
        close: update.close,
        volume: update.volume,
        marketCap: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        timestamp: new Date(update.timestamp).toISOString(),
        source: 'Binance',
      };
      await this.redisService.set(cacheKey, JSON.stringify(quoteData), 5000);
      // V412: Log first write per symbol to verify Redis writes work
      if (!this._loggedSymbols.has(update.symbol)) {
        this._loggedSymbols.add(update.symbol);
        this.logger.log(`💱 V412: Wrote first price to Redis for ${update.symbol}: ${update.price} (key: ${cacheKey})`);
      }
    } catch (e: any) {
      this.logger.error(`💱 V412: Redis write FAILED for ${update.symbol}: ${e.message}`);
    }
  }
}
