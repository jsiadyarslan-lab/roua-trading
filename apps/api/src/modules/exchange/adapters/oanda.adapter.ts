import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from '../exchange.types';

/**
 * OANDA v20 Adapter
 * 
 * Implements IExchangeAdapter for forex, metals, indices, and commodities
 * via OANDA's v20 REST API. Works with both Practice and Live accounts.
 *
 * Practice Account (FREE):
 *   - Sign up at oanda.com → Practice Account
 *   - Get API Token from account settings
 *   - Base URL: https://api-fxpractice.oanda.com
 *
 * Live Account:
 *   - Base URL: https://api-fxtrade.oanda.com
 *
 * Supported instruments:
 *   - Forex: EUR_USD, GBP_USD, USD_JPY, AUD_USD, etc.
 *   - Metals: XAU_USD, XAG_USD
 *   - Indices: US30_USD, NAS100_USD, SPX500_USD
 *   - Commodities: WTI_USD, BRENT_USD
 *
 * Rate Limits (Practice):
 *   - 120 requests/sec per token
 *   - We conservatively limit to 30 requests/sec
 *
 * Symbol conversion:
 *   - User input: EUR/USD → OANDA: EUR_USD
 *   - User input: XAU/USD → OANDA: XAU_USD
 *   - User input: US30/USD → OANDA: US30_USD
 */
@Injectable()
export class OandaAdapter implements IExchangeAdapter {
  readonly name = 'OANDA';
  private readonly logger = new Logger(OandaAdapter.name);

  // OANDA API base URLs
  private readonly PRACTICE_URL = 'https://api-fxpractice.oanda.com';
  private readonly LIVE_URL = 'https://api-fxtrade.oanda.com';

  // Cache TTLs
  // V361: Reverted to 2s — this was working fine before V358-V359 changes.
  // OANDA stream writes to the same Redis key with 5s TTL.
  // cacheOrGet checks Redis first — if stream wrote a price, it returns it.
  // If not (stream down), it calls REST API and caches for 2s.
  private readonly QUOTE_CACHE_TTL = 2_000;       // 2 seconds
  private readonly HISTORY_CACHE_TTL = 60_000;   // 1 minute

  // Rate limit: 30 requests/sec (conservative)
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 33; // ~30 req/sec

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const hasToken = !!this.configService.get<string>('OANDA_API_TOKEN');
    const accountType = this.configService.get<string>('OANDA_ACCOUNT_TYPE', 'practice');
    this.logger.log(`📈 OANDA Adapter initialized (${accountType}) — token: ${hasToken ? '✅' : '❌ missing'}`);
  }

  /**
   * Get the API base URL (practice or live)
   */
  private get baseUrl(): string {
    const accountType = this.configService.get<string>('OANDA_ACCOUNT_TYPE', 'practice');
    return accountType === 'live' ? this.LIVE_URL : this.PRACTICE_URL;
  }

  /**
   * Get the API token
   */
  private get apiToken(): string {
    return this.configService.get<string>('OANDA_API_TOKEN') || '';
  }

  /**
   * Get the account ID
   */
  private get accountId(): string {
    return this.configService.get<string>('OANDA_ACCOUNT_ID') || '';
  }

  /**
   * Convert user-friendly symbol to OANDA format
   * EUR/USD → EUR_USD
   * XAU/USD → XAU_USD
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
   * Rate limit: ensure minimum interval between requests
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Make an authenticated request to OANDA v20 API
   */
  private async apiRequest(path: string): Promise<any> {
    if (!this.apiToken) {
      throw new Error('OANDA_API_TOKEN is not configured. Get a free token from oanda.com Practice Account settings.');
    }

    await this.rateLimit();

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'Accept-Datetime-Format': 'RFC3339',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`OANDA API error ${response.status}: ${errorText}`);
      throw new Error(`OANDA API ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Fetch real-time quote for a forex/metal/index symbol
   * Symbol format: EUR/USD, XAU/USD, US30/USD, etc.
   *
   * V361: Reverted to original cacheOrGet — this was working fine before V358-V359.
   * OANDA stream writes to the same Redis key ('oanda:quote:EUR/USD').
   * cacheOrGet checks Redis first:
   *   - If stream wrote a price (5s TTL) → returns it (live, fresh)
   *   - If not (stream down) → calls REST API, caches for 2s
   */
  async fetchQuote(symbol: string): Promise<UnifiedQuoteDto> {
    const cacheKey = `oanda:quote:${symbol}`;

    try {
      return await this.redisService.cacheOrGet<UnifiedQuoteDto>(
        cacheKey,
        () => this._fetchQuoteFromOanda(symbol),
        this.QUOTE_CACHE_TTL,
      );
    } catch (error: any) {
      this.logger.error(`Failed to fetch OANDA quote for ${symbol}: ${error.message}`);
      throw new HttpException(
        `فشل في جلب بيانات ${symbol} من OANDA: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async _fetchQuoteFromOanda(symbol: string): Promise<UnifiedQuoteDto> {
    const oandaSymbol = this.toOandaSymbol(symbol);

    // V327: Fetch last 3 candles to ensure we get:
    // 1. A complete candle (not in-progress) for OHLC
    // 2. The previous complete candle's close for change calculation
    // 
    // Previous bug: mixed data from 2 candles — open from previous,
    // high/low/close from latest. This caused impossible values like
    // High < Open when the latest candle just started.
    //
    // Fix: use ONLY the latest COMPLETE candle for all OHLC fields.
    // Use the close of the candle before it as "previous close" for change.
    const data = await this.apiRequest(
      `/v3/instruments/${oandaSymbol}/candles?count=3&price=M&granularity=M1`
    );

    const candles = data?.candles || [];
    if (candles.length === 0) {
      throw new Error(`No candle data for ${oandaSymbol}`);
    }

    // Find the latest COMPLETE candle (complete: true)
    // The most recent candle may still be forming — its high/low are incomplete
    let latestComplete: any = null;
    let previousComplete: any = null;

    for (let i = candles.length - 1; i >= 0; i--) {
      if (candles[i].complete !== false) {
        if (!latestComplete) {
          latestComplete = candles[i];
        } else if (!previousComplete) {
          previousComplete = candles[i];
          break;
        }
      }
    }

    // Fallback: if no complete candle, use the latest one
    if (!latestComplete) {
      latestComplete = candles[candles.length - 1];
    }
    if (!previousComplete) {
      previousComplete = latestComplete;
    }

    // All OHLC from the SAME complete candle — no mixing
    const price = parseFloat(latestComplete.mid.c);
    const open = parseFloat(latestComplete.mid.o);
    const high = parseFloat(latestComplete.mid.h);
    const low = parseFloat(latestComplete.mid.l);
    const close = parseFloat(latestComplete.mid.c);

    // Change = current close - previous candle's close
    const prevClose = parseFloat(previousComplete.mid.c);
    const change = close - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    // Also fetch instrument info for display name
    let displayName = symbol;
    try {
      const instData = await this.apiRequest(`/v3/instruments/${oandaSymbol}`);
      displayName = instData?.instrument?.displayName || symbol;
    } catch {
      // Non-critical — use symbol as display name
    }

    return {
      symbol,
      name: displayName,
      exchange: 'OANDA',
      currency: symbol.split('/')[1] || 'USD',
      price,
      change,
      changePercent,
      open,
      high,
      low,
      close,
      volume: parseFloat(latestComplete.volume || '0'),
      marketCap: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      timestamp: new Date(latestComplete.time),
      source: 'oanda-v20',
    };
  }

  /**
   * Fetch historical OHLCV candles
   * Symbol: EUR/USD, XAU/USD, etc.
   * Interval: 1min, 5min, 15min, 30min, 1h, 4h, 1day, 1week
   */
  async fetchHistoricalData(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]> {
    const cacheKey = `oanda:history:${symbol}:${interval}:${start.getTime()}:${end.getTime()}`;

    try {
      return await this.redisService.cacheOrGet<UnifiedCandleDto[]>(
        cacheKey,
        () => this._fetchHistoryFromOanda(symbol, interval, start, end),
        this.HISTORY_CACHE_TTL,
      );
    } catch (error: any) {
      this.logger.error(`Failed to fetch OANDA history for ${symbol}: ${error.message}`);
      throw new HttpException(
        `فشل في جلب بيانات ${symbol} التاريخية من OANDA: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async _fetchHistoryFromOanda(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]> {
    const oandaSymbol = this.toOandaSymbol(symbol);
    const granularity = this._mapIntervalToGranularity(interval);

    // OANDA v20: GET /v3/instruments/{instrument}/candles
    const from = start.toISOString();
    const to = end.toISOString();

    const data = await this.apiRequest(
      `/v3/instruments/${oandaSymbol}/candles?price=M&granularity=${granularity}&from=${from}&to=${to}`
    );

    const candles = data?.candles || [];

    return candles
      .filter((c: any) => c.complete !== false) // Only complete candles
      .map((c: any) => ({
        symbol,
        timestamp: new Date(c.time),
        open: parseFloat(c.mid.o),
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
        close: parseFloat(c.mid.c),
        volume: parseFloat(c.volume || '0'),
        source: 'oanda-v20',
      }));
  }

  /**
   * Map platform interval to OANDA granularity
   * Platform: 1min, 5min, 15min, 30min, 1h, 4h, 1day, 1week
   * OANDA: S5, S10, S15, S30, M1, M2, M4, M5, M10, M15, M30, H1, H2, H4, H6, H8, H12, D, W, M
   */
  private _mapIntervalToGranularity(interval: string): string {
    const map: Record<string, string> = {
      '1min': 'M1',
      '5min': 'M5',
      '15min': 'M15',
      '30min': 'M30',
      '1h': 'H1',
      '2h': 'H2',
      '4h': 'H4',
      '1day': 'D',
      '1week': 'W',
      '1month': 'M',
    };
    return map[interval] || 'H1';
  }

  /**
   * Get list of available instruments from OANDA
   * Useful for populating the symbol picker in the UI
   */
  async getAvailableInstruments(): Promise<Array<{ symbol: string; name: string; type: string }>> {
    if (!this.accountId) {
      this.logger.warn('OANDA_ACCOUNT_ID not configured — cannot fetch instrument list');
      return [];
    }

    try {
      const data = await this.apiRequest(`/v3/accounts/${this.accountId}/instruments`);
      const instruments = data?.instruments || [];

      return instruments
        .filter((inst: any) => inst.type === 'CURRENCY' || inst.type === 'METAL' || inst.type === 'CFD')
        .map((inst: any) => ({
          symbol: this.fromOandaSymbol(inst.name),
          name: inst.displayName || inst.name,
          type: inst.type,
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
    } catch (error: any) {
      this.logger.error(`Failed to fetch OANDA instruments: ${error.message}`);
      return [];
    }
  }
}
