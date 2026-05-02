// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Content Curator Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeService } from '../../../modules/exchange/exchange.service';
import {
  ContentCategory,
  NewsSourceItem,
  MarketDataSource,
  ContentSourceData,
} from '../types/content.types';

/**
 * ContentCuratorService — Intelligent content aggregation and curation
 *
 * Aggregates news and market data from multiple sources, deduplicates,
 * ranks by relevance, and prepares source data for content generation.
 *
 * Curation Pipeline:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Fetch news from DB (NewsArticle) and external sources   │
 * │ 2. Fetch market data (prices, trends, volatility)          │
 * │ 3. Deduplicate and rank by relevance and freshness         │
 * │ 4. Group by category and sentiment                          │
 * │ 5. Identify trending topics and breaking news               │
 * │ 6. Prepare structured ContentSourceData for generator       │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Data Sources:
 * - NewsArticle (Prisma DB) — already fetched by NewsModule
 * - Exchange rates and market data (ExchangeService)
 * - Redis cache for trending topics
 */
@Injectable()
export class ContentCuratorService {
  private readonly logger = new Logger(ContentCuratorService.name);

  /** Cache TTL for curated topics */
  private readonly TRENDING_CACHE_TTL = 300000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly exchangeService: ExchangeService,
  ) {
    this.logger.log('🔍 Content Curator initialized — aggregation engine ready');
  }

  /**
   * Curate news source data for a given category
   * Aggregates recent articles, market data, and sentiment
   */
  async curateSources(
    category: ContentCategory,
    symbols?: string[],
  ): Promise<ContentSourceData> {
    this.logger.log(`🔍 Curating sources for ${category} (${symbols?.join(',') || 'all'})`);

    // Fetch recent news articles
    const newsArticles = await this._fetchRecentNews(category, symbols);

    // Fetch market data for related symbols
    const marketDataArray = await this._fetchMarketData(symbols || this._getDefaultSymbols(category));

    // Identify trending topics
    const trendingTopics = await this._identifyTrendingTopics(category);

    // Build custom context from trending topics
    const customContext = trendingTopics.length > 0
      ? `المواضيع الرائجة: ${trendingTopics.join(', ')}`
      : undefined;

    return {
      newsArticles,
      marketData: marketDataArray[0] || undefined,
      customContext,
    };
  }

  /**
   * Get trending topics across all categories
   */
  async getTrendingTopics(): Promise<Array<{
    topic: string;
    category: ContentCategory;
    articleCount: number;
    avgSentiment: number;
    symbols: string[];
  }>> {
    try {
      const cached = await this.redis.get('content:trending');
      if (cached) return JSON.parse(cached);
    } catch { /* cache miss */ }

    const trends = await this._computeTrendingTopics();

    try {
      await this.redis.set('content:trending', JSON.stringify(trends), this.TRENDING_CACHE_TTL);
    } catch { /* cache write failure — non-critical */ }

    return trends;
  }

  /**
   * Get content gaps — categories that haven't had recent coverage
   */
  async getContentGaps(): Promise<Array<{
    category: ContentCategory;
    lastArticleHoursAgo: number;
    suggestedTopics: string[];
  }>> {
    const gaps: Array<{
      category: ContentCategory;
      lastArticleHoursAgo: number;
      suggestedTopics: string[];
    }> = [];

    for (const category of Object.values(ContentCategory)) {
      const lastArticle = await this.prisma.newsArticle.findFirst({
        where: { category: category as string },
        orderBy: { publishedAt: 'desc' },
        select: { publishedAt: true },
      });

      const hoursAgo = lastArticle
        ? (Date.now() - lastArticle.publishedAt.getTime()) / 3600000
        : 999;

      if (hoursAgo > 6) { // More than 6 hours without content
        gaps.push({
          category: category as ContentCategory,
          lastArticleHoursAgo: Math.round(hoursAgo),
          suggestedTopics: this._suggestTopics(category as ContentCategory),
        });
      }
    }

    return gaps.sort((a, b) => b.lastArticleHoursAgo - a.lastArticleHoursAgo);
  }

  // ── Private: News Fetching ──

  private async _fetchRecentNews(
    category: ContentCategory,
    symbols?: string[],
  ): Promise<NewsSourceItem[]> {
    try {
      const where: any = {
        publishedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
      };

      if (category) where.category = category;

      if (symbols?.length) {
        where.OR = symbols.map(s => ({
          affectedAssets: { contains: s },
        }));
      }

      const articles = await this.prisma.newsArticle.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: 10,
      });

      return articles.map(a => ({
        title: a.translatedTitle || a.title,
        content: a.translatedContent || a.content || '',
        source: a.source,
        url: a.url || undefined,
        publishedAt: a.publishedAt,
        sentiment: a.sentiment ? Number(a.sentiment) : undefined,
      }));
    } catch (error: any) {
      this.logger.warn(`Failed to fetch news: ${error.message}`);
      return [];
    }
  }

  // ── Private: Market Data ──

  private async _fetchMarketData(symbols: string[]): Promise<MarketDataSource[]> {
    const results: MarketDataSource[] = [];

    for (const symbol of symbols.slice(0, 5)) { // Limit to 5 symbols
      try {
        const quote = await this.exchangeService.getQuote(symbol);
        if (quote?.price) {
          results.push({
            symbol,
            price: quote.price,
            change24h: quote.changePercent || 0,
            volume24h: quote.volume || 0,
            trend: (quote.changePercent || 0) > 0.5
              ? 'BULLISH'
              : (quote.changePercent || 0) < -0.5
                ? 'BEARISH'
                : 'SIDEWAYS',
          });
        }
      } catch {
        // Skip unavailable symbols
      }
    }

    return results;
  }

  // ── Private: Trending Topics ──

  private async _identifyTrendingTopics(category: ContentCategory): Promise<string[]> {
    try {
      const articles = await this.prisma.newsArticle.findMany({
        where: {
          category: category as string,
          publishedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) }, // Last 6h
        },
        select: { title: true, translatedTitle: true },
        take: 20,
      });

      // Extract keywords from titles (simple approach)
      const words: Record<string, number> = {};
      for (const a of articles) {
        const title = (a.translatedTitle || a.title).toLowerCase();
        const tokens = title.split(/\s+/).filter(w => w.length > 3);
        for (const t of tokens) {
          words[t] = (words[t] || 0) + 1;
        }
      }

      return Object.entries(words)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([word]) => word);
    } catch {
      return [];
    }
  }

  private async _computeTrendingTopics(): Promise<Array<{
    topic: string;
    category: ContentCategory;
    articleCount: number;
    avgSentiment: number;
    symbols: string[];
  }>> {
    try {
      const categories = Object.values(ContentCategory);
      const results: any[] = [];

      for (const category of categories) {
        const articles = await this.prisma.newsArticle.findMany({
          where: {
            category: category as string,
            publishedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          select: { sentiment: true, affectedAssets: true, title: true },
          take: 50,
        });

        if (articles.length === 0) continue;

        const avgSentiment = articles.reduce((sum, a) => sum + (Number(a.sentiment) || 0), 0) / articles.length;

        // Extract most common symbols
        const symbolCounts: Record<string, number> = {};
        for (const a of articles) {
          try {
            const symbols = JSON.parse(a.affectedAssets || '[]');
            for (const s of symbols) {
              symbolCounts[s] = (symbolCounts[s] || 0) + 1;
            }
          } catch { /* skip invalid JSON */ }
        }

        const topSymbols = Object.entries(symbolCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([s]) => s);

        results.push({
          topic: this._getCategoryLabel(category),
          category,
          articleCount: articles.length,
          avgSentiment: parseFloat(avgSentiment.toFixed(4)),
          symbols: topSymbols,
        });
      }

      return results.sort((a, b) => b.articleCount - a.articleCount);
    } catch {
      return [];
    }
  }

  // ── Private: Utilities ──

  private _getDefaultSymbols(category: ContentCategory): string[] {
    const map: Record<ContentCategory, string[]> = {
      [ContentCategory.CRYPTO]: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      [ContentCategory.FOREX]: ['EUR/USD', 'GBP/USD', 'USD/JPY'],
      [ContentCategory.STOCKS]: ['AAPL', 'TSLA', 'NVDA'],
      [ContentCategory.COMMODITIES]: ['XAU/USD', 'XAG/USD'],
      [ContentCategory.ECONOMY]: ['EUR/USD', 'XAU/USD'],
      [ContentCategory.REGULATION]: ['BTC/USDT'],
      [ContentCategory.TECHNOLOGY]: ['NVDA', 'MSFT', 'AAPL'],
      [ContentCategory.EDUCATION]: ['BTC/USDT'],
      [ContentCategory.GEOPOLITICS]: ['XAU/USD', 'EUR/USD'],
      [ContentCategory.DEFI]: ['ETH/USDT', 'SOL/USDT'],
      [ContentCategory.NFT]: ['ETH/USDT'],
    };
    return map[category] || ['BTC/USDT'];
  }

  private _suggestTopics(category: ContentCategory): string[] {
    const map: Record<ContentCategory, string[]> = {
      [ContentCategory.CRYPTO]: ['تحليل بيتكوين الأسبوعي', 'أثر التراجع على ألتفكوينز', 'مؤشرات الخوف والجشع'],
      [ContentCategory.FOREX]: ['توقعات دولار-يورو', 'أثر بيانات التضخم', 'تحليل زوج جنيه-دولار'],
      [ContentCategory.STOCKS]: ['أداء قطاع التكنولوجيا', 'توقعات أرباح الشركات', 'مؤشر S&P 500'],
      [ContentCategory.COMMODITIES]: ['تحليل الذهب', 'النفط وأوبك+', 'توقعات الفضة'],
      [ContentCategory.ECONOMY]: ['قرارات الفائدة', 'التضخم العالمي', 'النمو الاقتصادي'],
      [ContentCategory.REGULATION]: ['تنظيم العملات الرقمية', 'قوانين التداول الجديدة'],
      [ContentCategory.TECHNOLOGY]: ['الذكاء الاصطناعي والأسواق', 'بلوكشين الجيل القادم'],
      [ContentCategory.EDUCATION]: ['كيف تقرأ الشارت', 'إدارة المخاطر للمبتدئين', 'استراتيجيات السوينغ'],
      [ContentCategory.GEOPOLITICS]: ['أثر التوترات على الأسواق', 'العقوبات والطاقة'],
      [ContentCategory.DEFI]: ['أرباح السيولة', 'مخاطر العقود الذكية', 'Staking مقابل التداول'],
      [ContentCategory.NFT]: ['سوق NFT الحالي', 'التحول نحو الأداة'],
    };
    return map[category] || ['تحديثات السوق'];
  }

  private _getCategoryLabel(category: ContentCategory): string {
    const map: Record<ContentCategory, string> = {
      [ContentCategory.CRYPTO]: 'العملات الرقمية',
      [ContentCategory.FOREX]: 'الفوركس',
      [ContentCategory.STOCKS]: 'الأسهم',
      [ContentCategory.COMMODITIES]: 'السلع',
      [ContentCategory.ECONOMY]: 'الاقتصاد',
      [ContentCategory.REGULATION]: 'التنظيمات',
      [ContentCategory.TECHNOLOGY]: 'التقنية',
      [ContentCategory.EDUCATION]: 'التعليم',
      [ContentCategory.GEOPOLITICS]: 'الجيوسياسة',
      [ContentCategory.DEFI]: 'التمويل اللامركزي',
      [ContentCategory.NFT]: 'NFTs',
    };
    return map[category] || category;
  }
}
