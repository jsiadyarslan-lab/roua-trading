// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — News Context Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// يجمع سياق الأخبار: حديثة + خاصة بالسوق + ملخص المشاعر
// يعتمد على NewsService + NewsIntegrationService الموجودين
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NewsService } from '../../news/news.service';
import { NewsIntegrationService } from '../../news/news-integration.service';
import { NewsContext, NewsItemDTO } from '../types/context.types';

@Injectable()
export class NewsContextBuilder {
  private readonly logger = new Logger(NewsContextBuilder.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly newsService?: NewsService,
    @Optional() private readonly newsIntegration?: NewsIntegrationService,
  ) {
    this.logger.log('📰 NewsContextBuilder initialized');
  }

  async build(symbol?: string): Promise<NewsContext> {
    const startTime = Date.now();
    try {
      const [recentNewsRaw, marketNewsRaw, sentimentSummary] = await Promise.all([
        this._getRecentNewsSafe(15),
        this._getMarketNewsSafe(symbol, 10),
        this._getSentimentSummarySafe(),
      ]);

      const recentNews = recentNewsRaw.map((n: any) => this._mapNews(n));
      const marketNews = marketNewsRaw.map((n: any) => this._mapNews(n));

      const durationMs = Date.now() - startTime;
      this.logger.debug(
        `✅ NewsContext built in ${durationMs}ms — ${recentNews.length} recent, ${marketNews.length} market`,
      );

      return {
        recentNews,
        marketNews,
        sentimentSummary,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to build NewsContext: ${error.message}`);
      return {
        recentNews: [],
        marketNews: [],
        sentimentSummary: {
          positive: 0,
          negative: 0,
          neutral: 0,
          dominantSentiment: 'NEUTRAL',
        },
      };
    }
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async _getRecentNewsSafe(limit: number): Promise<any[]> {
    try {
      // V458: NewsArticle schema:
      //   source, title, translatedTitle, content, summary,
      //   sentiment (Decimal -1..1), sentimentLabel (string lowercase),
      //   impactLevel (string: "high"/"medium"/"low"),
      //   affectedAssets (JSON string array), publishedAt, url
      return await this.prisma.newsArticle.findMany({
        orderBy: { publishedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          translatedTitle: true,
          summary: true,
          source: true,
          sentimentLabel: true,
          sentiment: true,
          impactLevel: true,
          publishedAt: true,
          affectedAssets: true,
          url: true,
        },
      });
    } catch (e) {
      this.logger.warn(`getRecentNewsSafe failed: ${e.message}`);
      return [];
    }
  }

  private async _getMarketNewsSafe(symbol: string | undefined, limit: number): Promise<any[]> {
    try {
      const where: any = {};
      if (symbol) where.affectedAssets = { contains: symbol };

      return await this.prisma.newsArticle.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          translatedTitle: true,
          summary: true,
          source: true,
          sentimentLabel: true,
          sentiment: true,
          impactLevel: true,
          publishedAt: true,
          affectedAssets: true,
          url: true,
        },
      });
    } catch (e) {
      this.logger.warn(`getMarketNewsSafe failed: ${e.message}`);
      return [];
    }
  }

  private async _getSentimentSummarySafe(): Promise<NewsContext['sentimentSummary']> {
    try {
      // احسب من آخر 50 خبر
      const recent = await this.prisma.newsArticle.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 50,
        select: { sentimentLabel: true },
      });

      // sentimentLabel stored lowercase: "positive", "negative", "neutral"
      const positive = recent.filter(
        (n) => (n.sentimentLabel ?? '').toLowerCase() === 'positive',
      ).length;
      const negative = recent.filter(
        (n) => (n.sentimentLabel ?? '').toLowerCase() === 'negative',
      ).length;
      const neutral = recent.filter(
        (n) =>
          !n.sentimentLabel ||
          (n.sentimentLabel ?? '').toLowerCase() === 'neutral',
      ).length;

      let dominantSentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = 'NEUTRAL';
      if (positive > negative && positive > neutral) dominantSentiment = 'POSITIVE';
      else if (negative > positive && negative > neutral) dominantSentiment = 'NEGATIVE';

      return { positive, negative, neutral, dominantSentiment };
    } catch (e) {
      this.logger.warn(`getSentimentSummarySafe failed: ${e.message}`);
      return {
        positive: 0,
        negative: 0,
        neutral: 0,
        dominantSentiment: 'NEUTRAL',
      };
    }
  }

  private _mapNews(n: any): NewsItemDTO {
    // تحليل الرموز المتأثرة (JSON string أو array)
    let symbols: string[] = [];
    if (n.affectedAssets) {
      try {
        if (typeof n.affectedAssets === 'string') {
          symbols = JSON.parse(n.affectedAssets);
        } else if (Array.isArray(n.affectedAssets)) {
          symbols = n.affectedAssets;
        }
      } catch {
        symbols = [];
      }
    }

    // V458: sentimentLabel lowercase → uppercase for DTO
    const labelLower = (n.sentimentLabel ?? '').toLowerCase();
    const sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' =
      labelLower === 'positive' ? 'POSITIVE' :
      labelLower === 'negative' ? 'NEGATIVE' : 'NEUTRAL';

    // impactLevel lowercase → uppercase
    const impactLower = (n.impactLevel ?? 'medium').toLowerCase();
    const impact: 'HIGH' | 'MEDIUM' | 'LOW' =
      impactLower === 'high' ? 'HIGH' :
      impactLower === 'low' ? 'LOW' : 'MEDIUM';

    return {
      id: n.id,
      title: n.translatedTitle ?? n.title, // prefer Arabic if available
      summary: n.summary ?? undefined,
      source: n.source ?? 'unknown',
      sentiment,
      sentimentScore: n.sentiment ? Number(n.sentiment) : undefined,
      impact,
      publishedAt: new Date(n.publishedAt),
      symbols,
      url: n.url ?? undefined,
    };
  }
}
