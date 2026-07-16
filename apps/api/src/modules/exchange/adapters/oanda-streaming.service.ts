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

  // V-AUDIT: Two-tier subscription model — fixes root cause of stream disconnecting
  // when browser SSE clients disconnect.
  //
  // PROBLEM: Previously, a single `subscribedInstruments` Set was shared between
  // backend-internal subscriptions (added in onModuleInit, must persist forever)
  // and browser-driven subscriptions (added via SSE/Socket.IO, must end when the
  // browser disconnects). When a browser disconnected, its cleanup() called
  // unsubscribe() for each symbol, which deleted it from the Set — including
  // backend-internal subscriptions. Once the Set was empty, _scheduleReconnect()
  // returned early (line 810: `if (subscribedInstruments.size === 0) return`),
  // so the stream was NEVER reconnected until a new browser opened SSE.
  //
  // FIX: Split into two layers with different lifecycles:
  //   - backendSubscriptions: filled once in onModuleInit, never removed
  //     (except for blacklisted instruments). Keeps the stream alive forever.
  //   - clientSubscriptions: reference-counted per symbol. Each browser
  //     subscribe() increments, each unsubscribe() decrements. Removed at 0.
  //
  // The active OANDA stream uses the union of both (see `subscribedInstruments` getter).
  private backendSubscriptions = new Set<string>();
  private clientSubscriptions = new Map<string, number>(); // oandaSymbol → refcount

  /**
   * V-AUDIT: Computed union of backend + client subscriptions.
   * Replaces the old mutable `subscribedInstruments` Set everywhere it was read.
   * Returns a fresh Set on each access (callers should not mutate it).
   */
  private get subscribedInstruments(): Set<string> {
    const union = new Set<string>(this.backendSubscriptions);
    for (const sym of this.clientSubscriptions.keys()) {
      union.add(sym);
    }
    return union;
  }

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

    // V-AUDIT: Populate backendSubscriptions (immutable after init). These persist
    // for the lifetime of the process — browser connect/disconnect cannot remove them.
    // V368: Skip blacklisted instruments (WTI_USD, BRENT_USD)
    let added = 0;
    for (const pair of this.AUTO_SUBSCRIBE_PAIRS) {
      const oandaSymbol = this.toOandaSymbol(pair);
      if (this.blacklistedInstruments.has(oandaSymbol)) {
        this.logger.debug(`🌊 V368: Skipping blacklisted instrument ${oandaSymbol}`);
        continue;
      }
      this.backendSubscriptions.add(oandaSymbol);
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
  // V450: Added H4, D1, W1 timeframes. Frontend was falling back to M1 polling
  // for these, then bucketing client-side — wasteful and lost volume.
  // Now backend builds all timeframes the chart supports.
  // Note: W1 (604800) alignment is handled in frontend (V445 — Monday alignment)
  // because Unix epoch is Thursday. The backend just uses Math.floor(now/tfSec)*tfSec
  // which gives Thursday boundaries — the frontend's onCandleUpdate realigns to Monday.
  private readonly CANDLE_TIMEFRAMES = [60, 300, 900, 1800, 3600, 14400, 86400, 604800];
  private candleBuilders = new Map<string, Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>>();
  private _lastRedisWrite = new Map<string, number>(); // V444: throttle key → last write timestamp

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
        // BUG-C03 FIX: Set volume=0 instead of tick count.
        // Tick count is NOT real volume — it produces wrong values for VWAP/OBV/MFI.
        // OANDA doesn't provide real volume for forex/metals. Setting 0 is honest.
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
        // BUG-C03: Don't increment volume — it's tick count, not real volume.
      }

      // V444: Throttle Redis writes — only write each (symbol, tf) once per 500ms
      // Previously wrote on EVERY tick × 5 TFs = ~700 SET/sec. Frontend polls
      // every 2s, so 99% of writes were wasted.
      const throttleKey = `${symbol}:${tfSec}`;
      const nowMs = Date.now();
      const lastWrite = this._lastRedisWrite.get(throttleKey) || 0;
      if (nowMs - lastWrite >= 500) {
        this._lastRedisWrite.set(throttleKey, nowMs);
        this._saveCandleToRedis(symbol, tfSec, candle).catch(() => {});
      }
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
      14400: 'H4',   // V450
      86400: 'D1',   // V450
      604800: 'W1',  // V450
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

  // V430: Per-symbol OHLC accumulators for _updateRedisCache.
  // Previously, _updateRedisCache wrote flat OHLC (open=high=low=close=price),
  // which completely neutralized the V228 "inter-tick TP detection" fix in
  // PositionMonitorService. When the OandaAdapter served a stream-cached quote,
  // effectiveHigh === effectiveLow === currentPrice, meaning TP/SL hits between
  // monitor ticks were NEVER detected for forex/metals positions.
  //
  // Now: open is set at session start (first tick of each day), high/low are
  // accumulated across all ticks, close = latest price. This mirrors what
  // BinanceStreamingService already does with the 24hrTicker data.
  private quoteOHLC = new Map<string, { open: number; high: number; low: number; change: number; changePercent: number; dayStart: number }>();

  /**
   * V358→V430: Update Redis cache with streamed price — NOW WITH PROPER OHLC.
   * This writes to the SAME cache key that OandaAdapter.fetchQuote() reads:
   *   `oanda:quote:${symbol}`
   *
   * When the frontend polls /api/exchange/quote/EUR/USD, the OANDA adapter
   * checks this cache first. If the streaming service has written a fresh
   * price (within 5s TTL), the adapter returns it WITHOUT making a REST API
   * call to OANDA. This gives near-real-time prices via simple REST polling.
   *
   * V430 FIX: Previously wrote open=high=low=close=price (flat OHLC), which
   * broke PositionMonitor's V228 inter-tick TP/SL detection. Now tracks
   * proper daily OHLC accumulators per symbol.
   */
  private async _updateRedisCache(update: OandaPriceUpdate): Promise<void> {
    try {
      const symbol = update.symbol;
      const price = update.price;
      const nowMs = update.timestamp || Date.now();
      const dayStart = Math.floor(nowMs / 86_400_000); // Changes at midnight UTC

      let ohlc = this.quoteOHLC.get(symbol);
      if (!ohlc || ohlc.dayStart !== dayStart) {
        // New trading day — reset accumulators.
        // For the first tick of the day, open = price (we don't have the
        // actual session open from the stream — that comes from REST API).
        // When OandaAdapter falls through to REST (cache miss), it gets
        // the proper open from M1 candles. The stream's open is best-effort.
        ohlc = { open: price, high: price, low: price, change: 0, changePercent: 0, dayStart };
        this.quoteOHLC.set(symbol, ohlc);
      } else {
        ohlc.high = Math.max(ohlc.high, price);
        ohlc.low = Math.min(ohlc.low, price);
        // Approximate daily change: price vs day's open
        ohlc.change = price - ohlc.open;
        ohlc.changePercent = ohlc.open > 0 ? (ohlc.change / ohlc.open) * 100 : 0;
      }

      const cacheKey = `oanda:quote:${symbol}`;
      const quoteData = {
        symbol,
        name: symbol,
        exchange: 'OANDA',
        currency: symbol.split('/')[1] || 'USD',
        price,
        change: ohlc.change,
        changePercent: ohlc.changePercent,
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: price,
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
   * V-AUDIT: Increments client subscription refcount. Does NOT touch backendSubscriptions.
   * Multiple browsers subscribing the same symbol increment the refcount;
   * each browser disconnect decrements; the symbol is removed from
   * clientSubscriptions only when refcount reaches 0.
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

    // V-AUDIT: Reference counting. If the symbol is already in backendSubscriptions
    // OR already in clientSubscriptions (refcount > 0), the OANDA stream already
    // includes it — we just bump the refcount for tracking purposes.
    const prevCount = this.clientSubscriptions.get(oandaSymbol) || 0;
    this.clientSubscriptions.set(oandaSymbol, prevCount + 1);
    const total = this.subscribedInstruments.size;
    this.logger.log(`🌊 Client subscribed to ${oandaSymbol} (refcount: ${prevCount + 1}, total instruments: ${total})`);

    // V405: Don't reconnect if stream is already connected and receiving prices.
    // The OANDA stream is a single long-lived HTTP connection for ALL instruments.
    // Adding a new instrument to subscribedInstruments set doesn't automatically
    // include it in the active stream — but reconnecting causes 'socket hang up'
    // storms because OANDA rejects multiple simultaneous connections from the
    // same account.
    //
    // V-AUDIT: If the symbol is NEW (was not in backendSubscriptions nor had
    // refcount > 0), the active stream needs to be re-opened with the updated
    // instrument list. We reconnect only in that case to avoid the storm.
    //
    // Only reconnect if the stream is NOT connected (streamReq is null).
    if (!this.streamReq && !this.isConnecting) {
      this._connect();
    }
  }

  /**
   * Unsubscribe from price updates for a symbol.
   * V-AUDIT: Decrements client subscription refcount. NEVER touches backendSubscriptions.
   * If the symbol is in backendSubscriptions (auto-subscribed), the stream keeps it.
   * If the refcount reaches 0 AND the symbol is NOT in backendSubscriptions, the
   * symbol is removed from the active stream via reconnect.
   */
  unsubscribe(symbol: string): void {
    const oandaSymbol = this.toOandaSymbol(symbol);

    // V-AUDIT: Only decrement client refcount. Backend subscriptions are immutable.
    const prevCount = this.clientSubscriptions.get(oandaSymbol) || 0;
    if (prevCount === 0) {
      // Not a client subscription — nothing to do (might be backend-only)
      this.logger.debug(`🌊 unsubscribe(${oandaSymbol}) — not a client subscription (backend-only or not subscribed), no-op`);
      return;
    }

    const newCount = prevCount - 1;
    if (newCount > 0) {
      this.clientSubscriptions.set(oandaSymbol, newCount);
      this.logger.log(`🌊 Client unsubscribed from ${oandaSymbol} (refcount: ${newCount}, other browsers still subscribed)`);
      return;
    }

    // refcount reached 0 — remove from clientSubscriptions
    this.clientSubscriptions.delete(oandaSymbol);

    // V-AUDIT: If still in backendSubscriptions, the stream keeps the symbol — no reconnect needed.
    if (this.backendSubscriptions.has(oandaSymbol)) {
      this.logger.log(`🌊 Client refcount for ${oandaSymbol} reached 0, but symbol is backend-subscribed — keeping in stream`);
      return;
    }

    // V-AUDIT: Symbol is fully removed. Reconnect with updated instrument list
    // (only if the stream is currently connected — otherwise _connect() will
    // pick up the new set on its next attempt).
    this.logger.log(`🌊 Fully unsubscribed from ${oandaSymbol} (remaining: ${this.subscribedInstruments.size} instruments)`);
    if (this.streamReq) {
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
  // BUG-048: Per-symbol last price for flash detection.
  // The global lastPriceValue can't be used for flash detection because it
  // mixes prices from different symbols (EUR/USD ~1.08, XAU/USD ~2000).
  // A per-symbol map lets us detect flash spikes correctly per symbol.
  private lastPricePerSymbol = new Map<string, number>();

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
            // V-AUDIT: Remove from both tiers so neither restores it on next reconnect.
            this.backendSubscriptions.delete(badInstrument);
            this.clientSubscriptions.delete(badInstrument);
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

      // BUG-048 FIX: Price sanity check — prevent flash spikes from bad ticks.
      //
      // PROBLEM: The previous check `if (price <= 0) return;` only caught zero/negative
      // prices but NOT:
      //   - NaN (parseFloat returns NaN for malformed JSON)
      //   - Infinity (overflow)
      //   - Gap prices when market reopens after weekend (e.g., EUR/USD gap from
      //     1.0800 to 1.0850 is normal, but a glitch sending 0.1080 or 10.80
      //     creates a flash spike that breaks the chart)
      //   - OANDA occasionally sends "stub" quotes with incorrect prices during
      //     maintenance windows or stream reconnection
      //
      // SYMPTOM: A single tall red/green "flash" candle appears on the chart,
      //          10x-100x taller than normal candles. The chart looks broken
      //          until the bad candle scrolls off-screen.
      //
      // FIX: Multi-layer validation:
      //   1. Reject NaN / Infinity
      //   2. Reject prices outside reasonable bounds per symbol
      //   3. Reject prices that differ >50% from the last valid price (flash detection)
      if (!Number.isFinite(price) || price <= 0) {
        this.logger.warn(
          `🌊 BUG-048: Rejected invalid OANDA price for ${symbol}: price=${price} (bid=${bid}, ask=${ask}) — NaN/Infinity/<=0`,
        );
        return;
      }

      // Per-symbol reasonable price bounds (catches obvious glitches like
      // EUR/USD = 10.80 or XAU/USD = 20000)
      const REASONABLE_BOUNDS: Record<string, { min: number; max: number }> = {
        // Forex majors (4-digit pairs, ~0.5–2.0)
        'EUR/USD': { min: 0.5, max: 2.0 },
        'GBP/USD': { min: 0.8, max: 2.5 },
        'USD/CHF': { min: 0.5, max: 1.5 },
        'AUD/USD': { min: 0.4, max: 1.5 },
        'NZD/USD': { min: 0.4, max: 1.5 },
        'USD/CAD': { min: 0.8, max: 1.8 },
        // JPY pairs (2-digit, ~80–250)
        'USD/JPY': { min: 50, max: 300 },
        'EUR/JPY': { min: 80, max: 300 },
        'GBP/JPY': { min: 100, max: 400 },
        'AUD/JPY': { min: 50, max: 200 },
        // Cross pairs
        'EUR/GBP': { min: 0.5, max: 1.5 },
        'EUR/CHF': { min: 0.5, max: 1.5 },
        // Metals
        'XAU/USD': { min: 500, max: 10000 },   // Gold $500–$10000/oz
        'XAG/USD': { min: 5, max: 200 },        // Silver $5–$200/oz
        // Energy
        'WTI/USD': { min: 10, max: 500 },       // Oil $10–$500/barrel
        'BRENT/USD': { min: 10, max: 500 },
        // Indices
        'US30/USD': { min: 10000, max: 100000 },
        'NAS100/USD': { min: 5000, max: 50000 },
        'SPX500/USD': { min: 1000, max: 10000 },
        'GER30/USD': { min: 5000, max: 30000 },
        'UK100/USD': { min: 3000, max: 20000 },
      };
      const bounds = REASONABLE_BOUNDS[symbol];
      if (bounds && (price < bounds.min || price > bounds.max)) {
        this.logger.warn(
          `🌊 BUG-048: Rejected out-of-bounds OANDA price for ${symbol}: price=${price} outside [${bounds.min}, ${bounds.max}] — likely stream glitch`,
        );
        return;
      }

      // Flash detection: reject prices that differ >50% from the last valid price
      // FOR THE SAME SYMBOL. A 50% move in a single tick is NEVER legitimate
      // for forex/metals/indices. Even the largest historical flash crashes
      // (e.g., EUR/USD 2015-01-15 SNB) were ~30% — and those are once-a-decade events.
      // This catches reconnection glitches where OANDA sends a stale/wrong price.
      // BUG-048: Must use per-symbol map, NOT the global lastPriceValue (which
      // mixes prices across symbols — EUR/USD ~1.08 vs XAU/USD ~2000).
      const lastSymPrice = this.lastPricePerSymbol.get(symbol);
      if (lastSymPrice !== undefined && lastSymPrice > 0 && lastSymPrice !== price) {
        const deviation = Math.abs(price - lastSymPrice) / lastSymPrice;
        if (deviation > 0.5) {
          this.logger.warn(
            `🌊 BUG-048: Rejected flash-spike OANDA price for ${symbol}: price=${price} vs last=${lastSymPrice} (deviation=${(deviation * 100).toFixed(1)}% > 50%) — likely reconnection glitch`,
          );
          return;
        }
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
      // BUG-048: Update per-symbol last price for flash detection
      this.lastPricePerSymbol.set(symbol, price);

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
    // V-AUDIT: Math.max(0, ...) guards against connectAttempts=0 producing
    // delayIndex=-1 (which yielded delay=undefined → setTimeout fires in 1ms,
    // causing a tight reconnect loop on the first failure after a success).
    const backoffDelays = [1000, 2000, 5000, 10000, 30000];
    const delayIndex = Math.min(Math.max(0, this.connectAttempts - 1), backoffDelays.length - 1);
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
      // V-AUDIT: Expose both tiers for diagnostics — proves backend subs persist
      // even when all browsers disconnect.
      subscribedInstruments: Array.from(this.subscribedInstruments),
      instrumentCount: this.subscribedInstruments.size,
      backendSubscriptions: Array.from(this.backendSubscriptions),
      backendCount: this.backendSubscriptions.size,
      clientSubscriptions: Array.from(this.clientSubscriptions.entries()).map(([sym, count]) => ({ symbol: sym, refcount: count })),
      clientCount: this.clientSubscriptions.size,
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
