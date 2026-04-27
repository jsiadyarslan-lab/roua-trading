import { Injectable, Logger, HttpException, HttpStatus, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import { UnifiedQuoteDto, UnifiedCandleDto } from '../exchange/exchange.types';
import { IExchangeAdapter } from '../exchange/exchange.types';
import { FinnhubQuoteDto } from './analytics.types';
import axios from 'axios';
import { Observable, Subject, from, of } from 'rxjs';
import { switchMap, catchError, map, filter, debounceTime, tap } from 'rxjs/operators';

/**
 * Finnhub Adapter — Stock, Forex & Crypto Market Data
 *
 * Implements IExchangeAdapter for the Finnhub market data API.
 * Provides real-time quotes, WebSocket streaming, and company news.
 *
 * Rate Limits:
 * - Free tier: 60 API calls/minute
 * - Premium: varies by plan
 *
 * Features:
 * - Real-time quote via REST
 * - WebSocket price streaming (via RxJS Observable)
 * - Company news & sentiment data
 * - Basic financials (peers, earnings)
 */
@Injectable()
export class FinnhubAdapter implements IExchangeAdapter, OnModuleDestroy {
  readonly name = 'Finnhub';
  private readonly logger = new Logger(FinnhubAdapter.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://finnhub.io/api/v1';

  // Cache TTLs
  private readonly QUOTE_CACHE_TTL = 10_000;       // 10 seconds
  private readonly HISTORY_CACHE_TTL = 300_000;     // 5 minutes

  // Rate limit: 60 calls per minute for free tier
  private readonly RATE_LIMIT_WINDOW = 60_000;
  private readonly RATE_LIMIT_MAX = 55; // Leave some margin

  // WebSocket streaming
  private wsConnection: any = null;
  private readonly priceSubject = new Subject<FinnhubQuoteDto>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.apiKey = this.configService.get<string>('FINNHUB_API_KEY', '');

    if (!this.apiKey) {
      this.logger.warn('⚠️ FINNHUB_API_KEY is not set — Finnhub data will not be available');
    } else {
      this._initWebSocket();
    }
  }

  /**
   * Fetch real-time quote for a symbol
   * Finnhub symbol format: AAPL, BINANCE:BTCUSDT, OANDA:EUR_USD
   */
  async fetchQuote(symbol: string): Promise<UnifiedQuoteDto> {
    const cacheKey = `finnhub:quote:${symbol}`;

    try {
      return await this.redisService.cacheOrGet<UnifiedQuoteDto>(
        cacheKey,
        () => this._fetchQuoteFromApi(symbol),
        this.QUOTE_CACHE_TTL,
      );
    } catch (error: any) {
      this.logger.error(`Failed to fetch Finnhub quote for ${symbol}: ${error.message}`);
      throw new HttpException(
        `فشل في جلب بيانات ${symbol} من Finnhub: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Fetch historical OHLCV candle data
   * Finnhub supports stock candles and crypto candles
   */
  async fetchHistoricalData(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]> {
    const cacheKey = `finnhub:history:${symbol}:${interval}:${start.toISOString().split('T')[0]}:${end.toISOString().split('T')[0]}`;

    try {
      return await this.redisService.cacheOrGet<UnifiedCandleDto[]>(
        cacheKey,
        () => this._fetchCandlesFromApi(symbol, interval, start, end),
        this.HISTORY_CACHE_TTL,
      );
    } catch (error: any) {
      this.logger.error(`Failed to fetch Finnhub candles for ${symbol}: ${error.message}`);
      throw new HttpException(
        `فشل في جلب البيانات التاريخية لـ ${symbol} من Finnhub: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Get real-time price stream as RxJS Observable
   * Subscribes to Finnhub WebSocket for live price updates
   */
  getPriceStream(symbol: string): Observable<FinnhubQuoteDto> {
    return this.priceSubject.asObservable().pipe(
      filter((quote) => quote.symbol === symbol),
    );
  }

  /**
   * Fetch company news for a symbol
   * Returns recent news articles from Finnhub
   */
  async getCompanyNews(symbol: string, days: number = 7): Promise<any[]> {
    if (!this.apiKey) return [];

    try {
      await this._checkRateLimit();

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const response = await axios.get(`${this.baseUrl}/company-news`, {
        params: {
          symbol,
          from: startDate.toISOString().split('T')[0],
          to: endDate.toISOString().split('T')[0],
          token: this.apiKey,
        },
        timeout: 10000,
      });

      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      this.logger.warn(`Failed to fetch news for ${symbol}: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch company peers (similar companies)
   */
  async getPeers(symbol: string): Promise<string[]> {
    if (!this.apiKey) return [];

    try {
      await this._checkRateLimit();

      const response = await axios.get(`${this.baseUrl}/stock/peers`, {
        params: { symbol, token: this.apiKey },
        timeout: 10000,
      });

      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      this.logger.warn(`Failed to fetch peers for ${symbol}: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if Finnhub is available (API key configured)
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  // ── Private: API Calls ──

  private async _fetchQuoteFromApi(symbol: string): Promise<UnifiedQuoteDto> {
    await this._checkRateLimit();

    this.logger.debug(`📡 Fetching Finnhub quote: ${symbol}`);

    // Convert symbol format for Finnhub
    const finnhubSymbol = this._convertSymbol(symbol);

    const response = await axios.get(`${this.baseUrl}/quote`, {
      params: { symbol: finnhubSymbol, token: this.apiKey },
      timeout: 10000,
    });

    const data = response.data;

    // Finnhub returns { c: current, d: change, dp: changePercent, h: high, l: low, o: open, pc: previousClose }
    if (!data || data.c === 0 && data.h === 0 && data.l === 0) {
      throw new Error(`No data available for ${symbol}`);
    }

    return {
      symbol,
      name: symbol,
      exchange: 'Finnhub',
      currency: 'USD',
      price: data.c ?? 0,
      change: data.d ?? 0,
      changePercent: data.dp ?? 0,
      open: data.o ?? 0,
      high: data.h ?? 0,
      low: data.l ?? 0,
      close: data.c ?? 0,
      volume: 0, // Finnhub quote doesn't include volume
      marketCap: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      timestamp: new Date(),
      source: this.name,
    };
  }

  private async _fetchCandlesFromApi(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]> {
    await this._checkRateLimit();

    this.logger.debug(`📡 Fetching Finnhub candles: ${symbol} (${interval})`);

    const finnhubSymbol = this._convertSymbol(symbol);
    const resolution = this._mapResolution(interval);

    const response = await axios.get(`${this.baseUrl}/stock/candle`, {
      params: {
        symbol: finnhubSymbol,
        resolution,
        from: Math.floor(start.getTime() / 1000),
        to: Math.floor(end.getTime() / 1000),
        token: this.apiKey,
      },
      timeout: 15000,
    });

    const data = response.data;

    if (data.s !== 'ok' || !data.t || !data.c) {
      return [];
    }

    const candles: UnifiedCandleDto[] = [];
    for (let i = 0; i < data.t.length; i++) {
      candles.push({
        symbol,
        timestamp: new Date(data.t[i] * 1000),
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v?.[i] ?? 0,
        source: this.name,
      });
    }

    return candles;
  }

  // ── Private: WebSocket ──

  private _initWebSocket(): void {
    try {
      const WebSocket = require('ws');
      this.wsConnection = new WebSocket(`wss://ws.finnhub.io?token=${this.apiKey}`);

      this.wsConnection.on('open', () => {
        this.reconnectAttempts = 0; // Reset on successful connection
        this.logger.log('🔌 Finnhub WebSocket connected');
      });

      this.wsConnection.on('message', (data: any) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'trade' && parsed.data) {
            for (const trade of parsed.data) {
              this.priceSubject.next({
                symbol: trade.s,
                currentPrice: trade.p,
                change: 0,
                changePercent: 0,
                high: trade.p,
                low: trade.p,
                open: trade.p,
                previousClose: trade.p,
                timestamp: trade.t,
              });
            }
          }
        } catch (error: any) {
          // Ignore parse errors
        }
      });

      this.wsConnection.on('error', (error: any) => {
        this.logger.warn(`Finnhub WebSocket error: ${error.message}`);
      });

      this.wsConnection.on('close', () => {
        this.logger.warn('🔌 Finnhub WebSocket closed');
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
            60000,
          );
          this.reconnectAttempts++;
          this.logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          this.reconnectTimer = setTimeout(() => this._initWebSocket(), delay);
        } else {
          this.logger.error('Max Finnhub WebSocket reconnect attempts reached');
        }
      });
    } catch (error: any) {
      this.logger.warn(`Finnhub WebSocket unavailable: ${error.message}`);
    }
  }

  onModuleDestroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.wsConnection) {
      try {
        this.wsConnection.close();
      } catch {
        // Ignore close errors
      }
      this.wsConnection = null;
    }
    this.priceSubject.complete();
  }

  // ── Private: Helpers ──

  private async _checkRateLimit(): Promise<void> {
    const key = 'ratelimit:finnhub';

    const result = await this.redisService.checkRateLimit(
      key,
      this.RATE_LIMIT_MAX,
      this.RATE_LIMIT_WINDOW,
    );

    if (!result.allowed) {
      throw new HttpException(
        `تم تجاوز حد الطلبات لـ Finnhub. يرجى المحاولة بعد ${Math.ceil((result.resetIn || 60000) / 1000)} ثوانٍ`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Convert symbol format to Finnhub format
   * BTC/USDT → BINANCE:BTCUSDT
   * AAPL → AAPL (no change)
   * EUR/USD → OANDA:EUR_USD
   */
  private _convertSymbol(symbol: string): string {
    // Crypto pairs: BTC/USDT → BINANCE:BTCUSDT
    if (symbol.includes('/USDT') || symbol.includes('/USDC') || symbol.includes('/BTC')) {
      const parts = symbol.split('/');
      return `BINANCE:${parts[0]}${parts[1]}`;
    }

    // Forex pairs: EUR/USD → OANDA:EUR_USD
    if (symbol.includes('/') && !symbol.includes('USDT')) {
      const parts = symbol.split('/');
      return `OANDA:${parts[0]}_${parts[1]}`;
    }

    // Stocks: AAPL → AAPL (no change needed)
    return symbol;
  }

  /**
   * Map interval to Finnhub resolution
   * Finnhub resolutions: 1, 5, 15, 30, 60, D, W, M
   */
  private _mapResolution(interval: string): string {
    const mapping: Record<string, string> = {
      '1min': '1',
      '5min': '5',
      '15min': '15',
      '30min': '30',
      '1h': '60',
      '2h': '60',
      '4h': '60',
      '1day': 'D',
      '1week': 'W',
      '1month': 'M',
    };
    return mapping[interval] || 'D';
  }
}
