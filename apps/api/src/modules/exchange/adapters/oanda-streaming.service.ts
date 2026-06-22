import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import * as https from 'https';
import { EventEmitter } from 'events';

/**
 * V355: OANDA Streaming Service — Real-time price stream via OANDA v20 Streaming API.
 *
 * This is the ROOT SOLUTION for live forex/metals/indices prices.
 * Instead of polling REST API every 30-60 seconds, this service maintains
 * a long-lived HTTP connection to OANDA's streaming endpoint and receives
 * price updates in real-time (<1 second latency, same as Binance WS for crypto).
 *
 * OANDA Streaming API:
 *   GET https://stream-fxpractice.oanda.com/v3/accounts/{accountID}/pricing/stream
 *   ?instruments=EUR_USD,GBP_USD,XAU_USD,...
 *   Authorization: Bearer {token}
 *
 * Response: chunked HTTP transfer, each chunk is newline-delimited JSON:
 *   {"type":"PRICE","instrument":"EUR_USD","time":"...","bids":[...],"asks":[...],...}
 *   {"type":"HEARTBEAT","time":"..."}
 *
 * Architecture:
 *   OANDA Stream → OandaStreamingService → EventEmitter → ExchangeGateway → Socket.IO → Frontend
 *
 * Usage:
 *   streamingService.on('price', (data) => { ... });
 *   streamingService.subscribe('EUR/USD');
 *   streamingService.unsubscribe('EUR/USD');
 */
@Injectable()
export class OandaStreamingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OandaStreamingService.name);
  private readonly emitter = new EventEmitter();

  // OANDA streaming endpoints
  private readonly PRACTICE_STREAM_URL = 'stream-fxpractice.oanda.com';
  private readonly LIVE_STREAM_URL = 'stream-fxtrade.oanda.com';

  // Active stream connection
  private streamReq: any | null = null;

  // Currently subscribed instruments (OANDA format: EUR_USD)
  private subscribedInstruments = new Set<string>();

  // Buffer for incomplete JSON chunks
  private lineBuffer = '';

  // Reconnect state
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly RECONNECT_DELAY_MS = 5000;
  private isConnecting = false;
  private shouldReconnect = true;

  // V363: Fixed instrument list — removed WTI_USD and BRENT_USD which are invalid
  // on OANDA Practice accounts. OANDA rejects the ENTIRE stream if ANY instrument
  // is invalid (HTTP 400), so one bad instrument kills all 17 pairs.
  //
  // OANDA Practice supported instruments (verified):
  // - Forex majors: EUR_USD, GBP_USD, USD_JPY, AUD_USD, USD_CHF, USD_CAD, NZD_USD
  // - Forex crosses: EUR_GBP, EUR_JPY, GBP_JPY
  // - Metals: XAU_USD, XAG_USD
  // - Indices: US30_USD, NAS100_USD, SPX500_USD
  //
  // NOT supported on Practice (causes HTTP 400):
  // - WTI_USD (oil) — OANDA uses different name or not available on Practice
  // - BRENT_USD (oil) — same
  private readonly AUTO_SUBSCRIBE_PAIRS = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'NZD/USD',
    'EUR/GBP', 'EUR/JPY', 'GBP/JPY',
    'XAU/USD', 'XAG/USD',
    'US30/USD', 'NAS100/USD', 'SPX500/USD',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const hasToken = !!this.configService.get<string>('OANDA_API_TOKEN');
    const hasAccountId = !!this.configService.get<string>('OANDA_ACCOUNT_ID');

    if (hasToken && hasAccountId) {
      this.logger.log('🌊 V358: OANDA Streaming Service initialized — ready for live price stream');
    } else {
      this.logger.warn(`🌊 V358: OANDA Streaming Service initialized but NOT active — missing ${!hasToken ? 'OANDA_API_TOKEN' : ''} ${!hasAccountId ? 'OANDA_ACCOUNT_ID' : ''}`);
    }
  }

  /**
   * V361: On module init, add ALL instruments to the set FIRST, then connect ONCE.
   *
   * V358 BUG: Called subscribe() 17 times in a loop. Each subscribe() triggered
   * _connect() or _reconnect(), creating a connect/disconnect storm:
   *   subscribe('EUR/USD') → _connect() → streamReq set
   *   subscribe('GBP/USD') → _reconnect() → _disconnect() → setTimeout 500ms
   *   subscribe('USD/JPY') → _connect() again → streamReq set
   *   subscribe('AUD/USD') → _reconnect() → _disconnect() → setTimeout 500ms
   *   ... 17 times
   * Result: connected: false — never stabilized.
   *
   * FIX: Add all instruments to the Set first (synchronous, no connections),
   * then call _connect() ONCE with all instruments.
   */
  async onModuleInit() {
    if (!this.isAvailable()) {
      this.logger.warn('🌊 V361: OANDA streaming not available — OANDA_API_TOKEN or OANDA_ACCOUNT_ID not configured');
      return;
    }

    this.logger.log(`🌊 V361: Adding ${this.AUTO_SUBSCRIBE_PAIRS.length} OANDA instruments...`);

    // Step 1: Add ALL instruments to the set (synchronous — no connections)
    // V368: Skip blacklisted instruments (WTI_USD, BRENT_USD)
    let added = 0;
    for (const pair of this.AUTO_SUBSCRIBE_PAIRS) {
      const oandaSymbol = this.toOandaSymbol(pair);
      if (this.blacklistedInstruments.has(oandaSymbol)) {
        this.logger.debug(`🌊 V368: Skipping blacklisted instrument ${oandaSymbol}`);
        continue;
      }
      this.subscribedInstruments.add(oandaSymbol);
      added++;
    }

    this.logger.log(`🌊 V361: Instruments ready: ${Array.from(this.subscribedInstruments).join(', ')}`);

    // Step 2: Register price handlers
    // V402: Each listener wrapped in try/catch to prevent one failing listener
    // from blocking price delivery to other listeners. The OANDA stream was
    // receiving prices but a bug in one listener (likely ExchangeGateway's
    // broadcast) was throwing "Cannot read properties of undefined (reading 'get')"
    // which prevented ALL listeners from executing.
    this.onPrice((update: OandaPriceUpdate) => {
      try { this._updateRedisCache(update); } catch (e) { /* non-critical */ }
    });

    this.onPrice((update: OandaPriceUpdate) => {
      try { this._buildCandles(update); } catch (e) { /* non-critical */ }
    });

    // Step 3: Connect ONCE with all instruments
    this._connect();
  }

  // V384: Backend candle builder — builds OHLC from OANDA stream prices.
  // Same concept as Binance kline: the server builds candles from individual ticks.
  // The frontend fetches ready-made OHLC candles instead of building from single prices.
  //
  // Timeframes: M1 (60s), M5 (300s), M15 (900s), M30 (1800s), H1 (3600s)
  private readonly CANDLE_TIMEFRAMES = [60, 300, 900, 1800, 3600];
  private candleBuilders = new Map<string, Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>>();

  private _buildCandles(update: OandaPriceUpdate): void {
    const symbol = update.symbol;
    const price = update.price;
    const now = Math.floor(update.timestamp / 1000);

    // Get or create the symbol's candle builder map
    let symbolBuilders = this.candleBuilders.get(symbol);
    if (!symbolBuilders) {
      symbolBuilders = new Map();
      this.candleBuilders.set(symbol, symbolBuilders);
    }

    for (const tfSec of this.CANDLE_TIMEFRAMES) {
      const candleTime = now - (now % tfSec);

      let candle = symbolBuilders.get(tfSec);
      if (!candle || candle.time !== candleTime) {
        // New candle period — commit old one to Redis if exists
        if (candle) {
          this._saveCandleToRedis(symbol, tfSec, candle).catch(() => {});
        }
        // Start new candle
        candle = {
          time: candleTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0,
        };
        symbolBuilders.set(tfSec, candle);
      } else {
        // Update existing candle
        candle.high = Math.max(candle.high, price);
        candle.low = Math.min(candle.low, price);
        candle.close = price;
      }

      // Always write the forming candle to Redis (frontend reads it for live updates)
      this._saveCandleToRedis(symbol, tfSec, candle).catch(() => {});
    }
  }

  /**
   * V384: Save a candle to Redis for the frontend to fetch.
   * Key format: oanda:candle:EUR/USD:M1
   * Value: JSON { time, open, high, low, close, volume }
   * TTL: 10 minutes (enough for the frontend to poll)
   */
  private async _saveCandleToRedis(
    symbol: string,
    tfSec: number,
    candle: { time: number; open: number; high: number; low: number; close: number; volume: number },
  ): Promise<void> {
    try {
      const tfName = this._secondsToTimeframeName(tfSec);
      const key = `oanda:candle:${symbol}:${tfName}`;
      await this.redisService.set(key, JSON.stringify(candle), 600_000); // 10 min TTL
    } catch {
      // Non-critical
    }
  }

  private _secondsToTimeframeName(seconds: number): string {
    const map: Record<number, string> = {
      60: 'M1',
      300: 'M5',
      900: 'M15',
      1800: 'M30',
      3600: 'H1',
    };
    return map[seconds] || 'M1';
  }

  /**
   * V384: Get the latest built candle for a symbol + timeframe.
   * Called by the API endpoint when the frontend polls for live candle updates.
   */
  async getLatestCandle(symbol: string, timeframe: string): Promise<any | null> {
    try {
      const key = `oanda:candle:${symbol}:${timeframe}`;
      const data = await this.redisService.get(key);
      if (data) {
        return JSON.parse(data);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * V358: Update Redis cache with streamed price.
   * This writes to the SAME cache key that OandaAdapter.fetchQuote() reads:
   *   `oanda:quote:${symbol}`
   *
   * When the frontend polls /api/exchange/quote/EUR/USD, the OANDA adapter
   * checks this cache first. If the streaming service has written a fresh
   * price (within 2s TTL), the adapter returns it WITHOUT making a REST API
   * call to OANDA. This gives near-real-time prices via simple REST polling.
   */
  private async _updateRedisCache(update: OandaPriceUpdate): Promise<void> {
    try {
      const cacheKey = `oanda:quote:${update.symbol}`;
      const quoteData = {
        symbol: update.symbol,
        name: update.symbol,
        exchange: 'OANDA',
        currency: update.symbol.split('/')[1] || 'USD',
        price: update.price,
        change: 0,
        changePercent: 0,
        open: update.price,
        high: update.price,
        low: update.price,
        close: update.price,
        volume: 0,
        marketCap: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        timestamp: new Date(update.time).toISOString(),
        source: 'oanda-stream',
      };

      // Write to Redis with 5s TTL — if stream stops, cache expires and
      // adapter falls back to REST API
      await this.redisService.set(cacheKey, JSON.stringify(quoteData), 5000);
    } catch {
      // Non-critical — if Redis write fails, adapter will use REST API
    }
  }

  /**
   * Get the streaming hostname (practice or live)
   */
  private get streamHost(): string {
    const accountType = this.configService.get<string>('OANDA_ACCOUNT_TYPE', 'practice');
    return accountType === 'live' ? this.LIVE_STREAM_URL : this.PRACTICE_STREAM_URL;
  }

  /**
   * Get API token
   */
  private get apiToken(): string {
    return this.configService.get<string>('OANDA_API_TOKEN') || '';
  }

  /**
   * Get account ID
   */
  private get accountId(): string {
    return this.configService.get<string>('OANDA_ACCOUNT_ID') || '';
  }

  /**
   * Check if streaming is available (token + account ID configured)
   */
  isAvailable(): boolean {
    return !!this.apiToken && !!this.accountId;
  }

  /**
   * Convert user-friendly symbol to OANDA format
   * EUR/USD → EUR_USD, XAU/USD → XAU_USD, US30/USD → US30_USD
   */
  private toOandaSymbol(symbol: string): string {
    return symbol.replace('/', '_').toUpperCase();
  }

  /**
   * Convert OANDA symbol back to user-friendly format
   * EUR_USD → EUR/USD
   */
  private fromOandaSymbol(oandaSymbol: string): string {
    return oandaSymbol.replace('_', '/');
  }

  /**
   * Subscribe to price updates for a symbol.
   * V367: Reject blacklisted instruments (prevents reconnect loops).
   */
  subscribe(symbol: string): void {
    if (!this.isAvailable()) {
      this.logger.warn(`🌊 Cannot subscribe to ${symbol} — OANDA streaming not configured`);
      return;
    }

    const oandaSymbol = this.toOandaSymbol(symbol);

    // V367: Reject blacklisted instruments
    if (this.blacklistedInstruments.has(oandaSymbol)) {
      this.logger.debug(`🌊 ${oandaSymbol} is blacklisted (previously rejected by OANDA) — skipping`);
      return;
    }

    if (this.subscribedInstruments.has(oandaSymbol)) {
      this.logger.debug(`🌊 Already subscribed to ${oandaSymbol}`);
      return;
    }

    this.subscribedInstruments.add(oandaSymbol);
    this.logger.log(`🌊 Subscribed to ${oandaSymbol} (total: ${this.subscribedInstruments.size} instruments)`);

    // V405: Don't reconnect if stream is already connected and receiving prices.
    // The OANDA stream is a single long-lived HTTP connection for ALL instruments.
    // Adding a new instrument to subscribedInstruments set doesn't automatically
    // include it in the active stream — but reconnecting causes 'socket hang up'
    // storms because OANDA rejects multiple simultaneous connections from the
    // same account.
    //
    // The AUTO_SUBSCRIBE_PAIRS list already includes all 21 instruments we need.
    // New subscribe() calls for those instruments are no-ops (already in the set).
    // For instruments NOT in AUTO_SUBSCRIBE_PAIRS, they won't be in the active
    // stream — but reconnecting won't help because the stream was opened with
    // the initial instrument list.
    //
    // Only reconnect if the stream is NOT connected (streamReq is null).
    if (!this.streamReq && !this.isConnecting) {
      this._connect();
    }
  }

  /**
   * Unsubscribe from price updates for a symbol.
   * If no subscriptions remain, closes the stream connection.
   */
  unsubscribe(symbol: string): void {
    const oandaSymbol = this.toOandaSymbol(symbol);
    if (!this.subscribedInstruments.has(oandaSymbol)) {
      return;
    }

    this.subscribedInstruments.delete(oandaSymbol);
    this.logger.log(`🌊 Unsubscribed from ${oandaSymbol} (remaining: ${this.subscribedInstruments.size} instruments)`);

    if (this.subscribedInstruments.size === 0) {
      // No more subscriptions — close the stream
      this._disconnect();
    } else {
      // Still have subscriptions — reconnect with updated instrument list
      this._reconnect();
    }
  }

  /**
   * Register a callback for price updates.
   * Callback receives: { symbol, price, bid, ask, time, oandaSymbol }
   */
  onPrice(callback: (data: OandaPriceUpdate) => void): void {
    this.emitter.on('price', callback);
  }

  /**
   * Remove a price callback
   */
  offPrice(callback: (data: OandaPriceUpdate) => void): void {
    this.emitter.off('price', callback);
  }

  // V362: Track last connection error for diagnostics
  private lastConnectError: string | null = null;
  private lastConnectAttempt: Date | null = null;
  private connectAttempts: number = 0;

  // V367: Blacklist of instruments that OANDA Practice rejected.
  // Auto-populated when OANDA returns HTTP 400 "Invalid Instrument X".
  // Prevents reconnect loops where one bad instrument kills the entire stream.
  private blacklistedInstruments = new Set<string>();

  // V365: Track actual price reception — proves the stream is delivering data
  private pricesReceived: number = 0;
  private lastPriceSymbol: string | null = null;
  private lastPriceValue: number | null = null;
  private lastPriceTime: Date | null = null;

  /**
   * Connect to OANDA streaming API
   * V368: Guard against empty instruments + exponential backoff + never empty the set.
   */
  private _connect(): void {
    // V368: NEVER connect with empty instruments — causes "aborted" errors
    if (this.subscribedInstruments.size === 0) {
      this.logger.warn('🌊 V368: No instruments to subscribe — skipping connect (prevents empty stream abort)');
      return;
    }

    if (this.isConnecting || !this.isAvailable()) {
      this.logger.warn(`🌊 _connect() skipped: isConnecting=${this.isConnecting}, available=${this.isAvailable()}`);
      return;
    }

    this.isConnecting = true;
    this.connectAttempts++;
    this.lastConnectAttempt = new Date();
    const instruments = Array.from(this.subscribedInstruments).join(',');
    const path = `/v3/accounts/${this.accountId}/pricing/stream?instruments=${encodeURIComponent(instruments)}`;

    this.logger.log(`🌊 V362: Connecting to OANDA stream (attempt #${this.connectAttempts}): ${this.streamHost}${path.substring(0, 80)}...`);
    this.logger.log(`🌊 V362: Account ID: ${this.accountId}, Token length: ${this.apiToken.length}`);

    const options: https.RequestOptions = {
      hostname: this.streamHost,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Accept-Datetime-Format': 'RFC3339',
      },
      timeout: 10000, // V362: 10s connection timeout — was 0 (infinite)
    };

    this.streamReq = https.request(options, (res) => {
      this.isConnecting = false;

      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          this.lastConnectError = `HTTP ${res.statusCode}: ${body.substring(0, 300)}`;
          this.logger.error(`🌊 OANDA stream failed: ${this.lastConnectError}`);

          // V367: Auto-blacklist invalid instruments
          // OANDA returns: {"errorMessage":"Invalid Instrument WTI_USD"}
          const invalidMatch = body.match(/Invalid Instrument (\w+)/);
          if (invalidMatch && invalidMatch[1]) {
            const badInstrument = invalidMatch[1];
            this.subscribedInstruments.delete(badInstrument);
            this.blacklistedInstruments.add(badInstrument);
            this.logger.warn(`🌊 V367: Blacklisted invalid instrument "${badInstrument}" — removed from subscriptions. Remaining: ${this.subscribedInstruments.size}`);

            // If we still have valid instruments, reconnect immediately
            if (this.subscribedInstruments.size > 0) {
              this.streamReq = null;
              this.isConnecting = false;
              // Immediate reconnect (no delay) — we just removed the bad instrument
              setTimeout(() => this._connect(), 100);
              return;
            }
          }

          this.streamReq = null;
          this._scheduleReconnect();
        });
        return;
      }

      this.lastConnectError = null;
      // V404: Reset connectAttempts on successful connection.
      // Without this, connectAttempts keeps growing (was at #36 in production),
      // causing the exponential backoff to always use 30s delay even after
      // a successful reconnection. Now each disconnection starts fresh at 1s.
      this.connectAttempts = 0;
      this.logger.log(`🌊 OANDA stream CONNECTED — receiving live prices for ${this.subscribedInstruments.size} instruments`);

      // Reset line buffer for new connection
      this.lineBuffer = '';

      // V404: Guard flag — prevents duplicate _scheduleReconnect() calls.
      // When "socket hang up" occurs, BOTH res.on('error') AND streamReq.on('error')
      // fire for the same event. Without this guard, _scheduleReconnect() runs
      // twice, clearing the first timer and scheduling a second — creating
      // a storm of duplicate reconnect attempts.
      let reconnectScheduled = false;
      const scheduleReconnectOnce = () => {
        if (reconnectScheduled) return;
        reconnectScheduled = true;
        this.streamReq = null;
        this._scheduleReconnect();
      };

      res.on('data', (chunk: Buffer) => {
        this._processStreamData(chunk.toString());
      });

      res.on('end', () => {
        this.lastConnectError = 'Stream ended by server';
        this.logger.warn('🌊 OANDA stream ended — will reconnect');
        scheduleReconnectOnce();
      });

      res.on('error', (err: Error) => {
        this.lastConnectError = `Stream error: ${err.message}`;
        this.logger.error(`🌊 OANDA stream error: ${err.message}`);
        scheduleReconnectOnce();
      });
    });

    // V362: Connection timeout handler
    this.streamReq.on('timeout', () => {
      this.lastConnectError = 'Connection timeout (10s)';
      this.logger.error(`🌊 OANDA stream connection timeout — destroying request`);
      try { this.streamReq?.destroy(); } catch {}
      this.isConnecting = false;
      this.streamReq = null;
      this._scheduleReconnect();
    });

    // V404: Guard against duplicate error handling.
    // When "socket hang up" occurs, this fires in addition to res.on('error').
    // Both call _scheduleReconnect(), creating duplicate reconnect storms.
    let reqErrorHandled = false;
    this.streamReq.on('error', (err: Error) => {
      if (reqErrorHandled) return;
      reqErrorHandled = true;
      this.isConnecting = false;
      this.lastConnectError = `Connection error: ${err.message}`;
      this.logger.error(`🌊 OANDA stream connection error: ${err.message}`);
      this.streamReq = null;
      this._scheduleReconnect();
    });

    this.streamReq.end();
  }

  /**
   * Process raw stream data — parses newline-delimited JSON
   */
  private _processStreamData(data: string): void {
    this.lineBuffer += data;

    // Split by newlines — each line is a complete JSON object
    const lines = this.lineBuffer.split('\n');

    // Last element may be incomplete — keep it in buffer
    this.lineBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed);
        this._handleStreamEvent(event);
      } catch (err: any) {
        // Ignore parse errors — OANDA may send partial or heartbeat data
        this.logger.debug(`🌊 Stream parse error (non-critical): ${err.message} — line: ${trimmed.substring(0, 100)}`);
      }
    }
  }

  /**
   * Handle a parsed stream event (PRICE or HEARTBEAT)
   */
  private _handleStreamEvent(event: any): void {
    if (event.type === 'HEARTBEAT') {
      // Heartbeat — connection is alive, no action needed
      return;
    }

    if (event.type === 'PRICE') {
      const oandaSymbol = event.instrument;
      const symbol = this.fromOandaSymbol(oandaSymbol);

      // OANDA returns bids and asks arrays. Use the first bid/ask.
      const bid = event.bids?.[0] ? parseFloat(event.bids[0].price) : null;
      const ask = event.asks?.[0] ? parseFloat(event.asks[0].price) : null;

      // Mid price = (bid + ask) / 2
      const price = bid !== null && ask !== null ? (bid + ask) / 2 : bid ?? ask ?? 0;

      if (price <= 0) {
        return;
      }

      const update: OandaPriceUpdate = {
        symbol,
        oandaSymbol,
        price,
        bid: bid ?? price,
        ask: ask ?? price,
        time: event.time,
        timestamp: Date.now(),
      };

      // V365: Track price reception
      this.pricesReceived++;
      this.lastPriceSymbol = symbol;
      this.lastPriceValue = price;
      this.lastPriceTime = new Date();

      // Emit to all registered callbacks
      this.emitter.emit('price', update);
    }
  }

  /**
   * Reconnect the stream (used when instruments change)
   * V368: Guard against empty instruments before reconnecting.
   */
  private _reconnect(): void {
    this._disconnect();

    // V368: Don't reconnect if no instruments left
    if (this.subscribedInstruments.size === 0) {
      this.logger.warn('🌊 V368: _reconnect() called with 0 instruments — skipping (prevents empty stream)');
      return;
    }

    // V368: Use exponential backoff for reconnect too (not fixed 500ms)
    const backoffDelays = [500, 1000, 2000, 5000];
    const delayIndex = Math.min(this.connectAttempts, backoffDelays.length - 1);
    const delay = backoffDelays[delayIndex];
    setTimeout(() => this._connect(), delay);
  }

  /**
   * Schedule a reconnect after failure
   * V368: Exponential backoff + guard against empty instruments.
   */
  private _scheduleReconnect(): void {
    // V368: Stop if no instruments left (prevents empty stream reconnect loop)
    if (!this.shouldReconnect || this.subscribedInstruments.size === 0) {
      this.logger.warn('🌊 V368: No valid instruments remaining — stopping reconnect loop');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // V368: Exponential backoff: 1s → 2s → 5s → 10s → 30s → 30s → ...
    const backoffDelays = [1000, 2000, 5000, 10000, 30000];
    const delayIndex = Math.min(this.connectAttempts - 1, backoffDelays.length - 1);
    const delay = backoffDelays[delayIndex];

    this.logger.log(`🌊 V368: Scheduling reconnect in ${delay / 1000}s (attempt ${this.connectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, delay);
  }

  /**
   * Disconnect the stream
   */
  private _disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.streamReq) {
      this.logger.debug('🌊 Disconnecting OANDA stream');
      try {
        this.streamReq.destroy();
      } catch { /* ignore */ }
      this.streamReq = null;
    }

    this.lineBuffer = '';
    this.isConnecting = false;
  }

  /**
   * Get current subscription status for diagnostics
   */
  getStatus(): any {
    return {
      available: this.isAvailable(),
      connected: !!this.streamReq,
      isConnecting: this.isConnecting,
      subscribedInstruments: Array.from(this.subscribedInstruments),
      instrumentCount: this.subscribedInstruments.size,
      // V362: Diagnostic fields
      lastConnectError: this.lastConnectError,
      lastConnectAttempt: this.lastConnectAttempt?.toISOString() || null,
      connectAttempts: this.connectAttempts,
      streamHost: this.streamHost,
      accountIdPrefix: this.accountId ? this.accountId.substring(0, 12) + '...' : null,
      // V365: Price reception tracking — proves data is flowing
      pricesReceived: this.pricesReceived,
      lastPriceSymbol: this.lastPriceSymbol,
      lastPriceValue: this.lastPriceValue,
      lastPriceTime: this.lastPriceTime?.toISOString() || null,
      priceFlowing: this.pricesReceived > 0,
      // V367: Blacklist info
      blacklistedInstruments: Array.from(this.blacklistedInstruments),
    };
  }

  onModuleDestroy(): void {
    this.logger.log('🌊 OANDA Streaming Service shutting down');
    this.shouldReconnect = false;
    this._disconnect();
    this.emitter.removeAllListeners();
  }
}

/**
 * Price update from OANDA stream
 */
export interface OandaPriceUpdate {
  symbol: string;      // User-friendly: EUR/USD
  oandaSymbol: string; // OANDA format: EUR_USD
  price: number;       // Mid price
  bid: number;
  ask: number;
  time: string;        // OANDA timestamp (RFC3339)
  timestamp: number;   // Unix ms
}
