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
}
