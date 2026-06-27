// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Market Context Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// يجمع السياق السوقي اللحظي: أسعار الرموز الرئيسية + رموز المستخدم
// يعتمد على ExchangeService الموجود
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExchangeService } from '../../exchange/exchange.service';
import { getSymbolMetadata, AssetClass } from '../../trading/services/symbol-metadata';
import { MarketContext, MarketPriceDTO } from '../types/context.types';

// رموز مرجعية عالمية (تُحدّث دوريًا حسب السيولة)
const TOP_SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSDT', 'ETHUSDT',
];

@Injectable()
export class MarketContextBuilder {
  private readonly logger = new Logger(MarketContextBuilder.name);

  constructor(
    @Optional() private readonly exchangeService?: ExchangeService,
  ) {
    this.logger.log('🌍 MarketContextBuilder initialized');
  }

  async build(userSymbols: string[] = []): Promise<MarketContext> {
    const startTime = Date.now();
    try {
      // دمج الرموز الرئيسية + رموز المستخدم (بدون تكرار)
      const uniqueUserSymbols = Array.from(
        new Set(userSymbols.filter((s) => !TOP_SYMBOLS.includes(s))),
      ).slice(0, 6); // حد أقصى 6 رموز مستخدم

      const [topQuotes, userQuotes] = await Promise.all([
        this._fetchQuotesSafe(TOP_SYMBOLS),
        this._fetchQuotesSafe(uniqueUserSymbols),
      ]);

      const topSymbols = topQuotes.filter(Boolean) as MarketPriceDTO[];
      const userSymbolsData = userQuotes.filter(Boolean) as MarketPriceDTO[];

      // V531: احسب المؤشرات الفنية لكل رمز (RSI, MACD, EMA50, Support, Resistance)
      const allSymbols = [...topSymbols, ...userSymbolsData];
      await Promise.all(
        allSymbols.map(async (s) => {
          try {
            s.technicals = await this._computeTechnicals(s.symbol);
          } catch {
            // تجاهل — المؤشرات اختيارية
          }
        }),
      );

      const marketSentiment = this._calculateSentiment(topSymbols);
      const volatilityIndex = this._calculateVolatilityIndex(topSymbols);

      const durationMs = Date.now() - startTime;
      this.logger.debug(
        `✅ MarketContext built in ${durationMs}ms — ${topSymbols.length} top, ${userSymbolsData.length} user`,
      );

      return {
        topSymbols,
        userSymbols: userSymbolsData,
        marketSentiment,
        volatilityIndex,
        fetchedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`❌ Failed to build MarketContext: ${error.message}`);
      return {
        topSymbols: [],
        userSymbols: [],
        marketSentiment: 'NEUTRAL',
        fetchedAt: new Date(),
      };
    }
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async _fetchQuotesSafe(symbols: string[]): Promise<(MarketPriceDTO | null)[]> {
    if (!this.exchangeService || symbols.length === 0) return [];
    // تنفيذ متوازي مع timeout قصير
    const results = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 3000),
        );
        const quotePromise = this.exchangeService!.getQuote(symbol);
        const quote = await Promise.race([quotePromise, timeoutPromise]);
        if (!quote) return null;
        return this._mapQuote(symbol, quote);
      }),
    );
    return results.map((r) => (r.status === 'fulfilled' ? r.value : null));
  }

  private _mapQuote(symbol: string, quote: any): MarketPriceDTO {
    const meta = getSymbolMetadata(symbol);
    const price = Number(quote.price ?? quote.lastPrice) || 0;
    const change24h = Number(quote.change24h ?? quote.change) || 0;
    const changePercent24h = Number(quote.changePercent24h ?? quote.changePercent) || 0;
    const high24h = Number(quote.high24h ?? quote.high) || 0;
    const low24h = Number(quote.low24h ?? quote.low) || 0;
    const volume24h = Number(quote.volume24h ?? quote.volume) || 0;

    return {
      symbol,
      price,
      change24h,
      changePercent24h,
      high24h,
      low24h,
      volume24h,
      bid: quote.bid ? Number(quote.bid) : undefined,
      ask: quote.ask ? Number(quote.ask) : undefined,
      assetClass: meta.assetClass as any,
      fetchedAt: new Date(),
    };
  }

  private _calculateSentiment(quotes: MarketPriceDTO[]): MarketContext['marketSentiment'] {
    if (quotes.length === 0) return 'NEUTRAL';

    const changing = quotes.filter((q) => q.changePercent24h !== 0);
    if (changing.length === 0) return 'CALM';

    const positive = changing.filter((q) => q.changePercent24h > 0).length;
    const negative = changing.filter((q) => q.changePercent24h < 0).length;
    const total = changing.length;

    // حساب متوسط التغير المطلق للتقلب
    const avgAbsChange =
      changing.reduce((sum, q) => sum + Math.abs(q.changePercent24h), 0) / total;

    if (avgAbsChange > 2.5) return 'VOLATILE';
    if (positive > total * 0.65) return 'BULLISH';
    if (negative > total * 0.65) return 'BEARISH';
    return 'NEUTRAL';
  }

  private _calculateVolatilityIndex(quotes: MarketPriceDTO[]): number | undefined {
    if (quotes.length === 0) return undefined;
    const changing = quotes.filter((q) => q.changePercent24h !== 0);
    if (changing.length === 0) return 0;
    const avgAbsChange =
      changing.reduce((sum, q) => sum + Math.abs(q.changePercent24h), 0) /
      changing.length;
    return Math.round(avgAbsChange * 100) / 100;
  }

  // ─── V531: حساب المؤشرات الفنية من الشموع التاريخية ───────────
  private async _computeTechnicals(symbol: string): Promise<NonNullable<MarketPriceDTO['technicals']>> {
    if (!this.exchangeService) return {};
    try {
      const candles = await this.exchangeService.getHistoricalData(symbol, '1day');
      if (!candles || candles.length < 20) return {};

      const closes = candles.map(c => Number(c.close)).filter(Boolean);
      if (closes.length < 20) return {};

      const result: NonNullable<MarketPriceDTO['technicals']> = {};

      // RSI (14)
      result.rsi14 = this._calcRSI(closes, 14);

      // MACD (12, 26, 9)
      result.macd = this._calcMACD(closes);

      // EMA-50
      if (closes.length >= 50) {
        const ema50 = this._calcEMA(closes, 50);
        if (ema50 !== undefined) {
          result.ema50 = ema50;
          result.priceVsEma50 = closes[closes.length - 1] > ema50 ? 'above' : 'below';
        }
      }

      // SMA-20
      if (closes.length >= 20) {
        const last20 = closes.slice(-20);
        result.sma20 = last20.reduce((a, b) => a + b, 0) / 20;
      }

      // Support / Resistance (آخر 20 شمعة)
      const last20Candles = candles.slice(-20);
      const highs = last20Candles.map(c => Number(c.high)).filter(Boolean);
      const lows = last20Candles.map(c => Number(c.low)).filter(Boolean);
      if (highs.length > 0) result.resistance = Math.max(...highs);
      if (lows.length > 0) result.support = Math.min(...lows);

      // Trend
      if (result.rsi14 !== undefined && result.macd && result.priceVsEma50) {
        const bullSignals = [
          result.rsi14 > 50,
          result.macd.histogram > 0,
          result.priceVsEma50 === 'above',
        ].filter(Boolean).length;
        result.trend = bullSignals >= 2 ? 'bullish' : bullSignals <= 1 ? 'bearish' : 'neutral';
      }

      return result;
    } catch {
      return {};
    }
  }

  private _calcRSI(closes: number[], period: number = 14): number | undefined {
    if (closes.length < period + 1) return undefined;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
  }

  private _calcEMA(data: number[], period: number): number | undefined {
    if (data.length < period) return undefined;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return Math.round(ema * 100) / 100;
  }

  private _calcMACD(closes: number[]): { value: number; signal: number; histogram: number; crossover: 'bullish' | 'bearish' | 'none' } | undefined {
    if (closes.length < 35) return undefined;
    const ema12 = this._calcEMASeries(closes, 12);
    const ema26 = this._calcEMASeries(closes, 26);
    if (!ema12 || !ema26) return undefined;
    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const signalLine = this._calcEMASeries(macdLine, 9);
    if (!signalLine || macdLine.length < 2) return undefined;
    const value = macdLine[macdLine.length - 1];
    const signal = signalLine[signalLine.length - 1];
    const prevValue = macdLine[macdLine.length - 2];
    const prevSignal = signalLine[signalLine.length - 2] || signal;
    const histogram = value - signal;
    let crossover: 'bullish' | 'bearish' | 'none' = 'none';
    if (prevValue < prevSignal && value > signal) crossover = 'bullish';
    else if (prevValue > prevSignal && value < signal) crossover = 'bearish';
    return {
      value: Math.round(value * 100) / 100,
      signal: Math.round(signal * 100) / 100,
      histogram: Math.round(histogram * 100) / 100,
      crossover,
    };
  }

  private _calcEMASeries(data: number[], period: number): number[] | undefined {
    if (data.length < period) return undefined;
    const k = 2 / (period + 1);
    const result: number[] = [];
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(ema);
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
      result.push(ema);
    }
    return result;
  }
}
