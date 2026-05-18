// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — News Integration Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// جسر الربط بين موقع rouatradingnews الأخباري ومنصة روعة.
// يجلب مشاعر السوق (الخوف والطمع، المشاعر العربية، المخاطر الجيوسياسية)
// ويخزنها في Redis للاستخدام السريع من قبل المجلس الاستراتيجي والمنفذ الذكي.
//
// V145: This service bridges the gap between the external news website
// and the trading platform. The Python agents (content-agent, sentiment-agent)
// already connect to rouatradingnews, but that data was never reaching
// the NestJS trading pipeline. Now it does.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

interface MarketSentiment {
  fearGreedIndex: {
    value: number;
    label: string;
    labelAr: string;
  };
  arabSentimentIndex: {
    value: number;
    label: string;
    majorityVote: string;
  };
  geopoliticalRiskIndex: {
    value: number;
    label: string;
    impacts: Record<string, { trend: string; value: string }>;
  };
  aiSummary?: string;
  fetchedAt: string;
}

export type { MarketSentiment };

@Injectable()
export class NewsIntegrationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NewsIntegrationService.name);
  private fetchInterval: NodeJS.Timeout | null = null;

  private readonly NEWS_SITE_URL: string;
  private readonly NEWS_API_KEY: string;
  private readonly NEWS_ADMIN_SECRET: string;

  /** Redis keys for cached market sentiment data */
  private readonly REDIS_SENTIMENT_KEY = 'news:market_sentiment';
  private readonly REDIS_SENTIMENT_TTL_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.NEWS_SITE_URL = this.configService.get<string>('NEWS_SITE_URL', '').replace(/\/$/, '');
    this.NEWS_API_KEY = this.configService.get<string>('NEWS_API_KEY', '');
    this.NEWS_ADMIN_SECRET = this.configService.get<string>('NEWS_ADMIN_SECRET', '') ||
                              this.configService.get<string>('CRON_SECRET', '');

    if (this.NEWS_SITE_URL) {
      this.logger.log(`📰 News Integration Service initialized — connected to ${this.NEWS_SITE_URL}`);
    } else {
      this.logger.warn('📰 NEWS_SITE_URL not set — rouatradingnews integration disabled');
    }
  }

  async onModuleInit() {
    if (!this.NEWS_SITE_URL) return;

    // Initial fetch after 10 seconds (don't block startup)
    setTimeout(() => this._fetchMarketSentiment(), 10000);

    // Refresh every 15 minutes
    this.fetchInterval = setInterval(() => {
      this._fetchMarketSentiment();
    }, 15 * 60 * 1000);
  }

  async onModuleDestroy() {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }
  }

  /**
   * Get the latest market sentiment from Redis cache.
   * Used by the Strategic Council and Smart Executor to factor
   * in Fear & Greed, Arab sentiment, and geopolitical risk.
   */
  async getMarketSentiment(): Promise<MarketSentiment | null> {
    try {
      const cached = await this.redis.get(this.REDIS_SENTIMENT_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch { /* cache miss */ }

    // If not in cache, try to fetch fresh
    if (this.NEWS_SITE_URL) {
      return await this._fetchMarketSentiment();
    }

    return null;
  }

  /**
   * Get a simplified sentiment summary suitable for injection
   * into AI prompts (for the Strategic Council).
   */
  async getSentimentForAI(): Promise<string> {
    const sentiment = await this.getMarketSentiment();
    if (!sentiment) return '';

    const parts: string[] = [];

    // Fear & Greed
    if (sentiment.fearGreedIndex) {
      const fg = sentiment.fearGreedIndex;
      const fgDir = fg.value > 60 ? 'جشع (صعودي)' : fg.value < 40 ? 'خوف (هبوطي)' : 'محايد';
      parts.push(`مؤشر الخوف والطمع: ${fg.value} (${fg.labelAr || fg.label}) — ${fgDir}`);
    }

    // Arab sentiment
    if (sentiment.arabSentimentIndex) {
      const ar = sentiment.arabSentimentIndex;
      parts.push(`مؤشر المشاعر العربية: ${ar.value} (${ar.label}) — تصويت: ${ar.majorityVote}`);
    }

    // Geopolitical risk
    if (sentiment.geopoliticalRiskIndex) {
      const geo = sentiment.geopoliticalRiskIndex;
      parts.push(`المخاطر الجيوسياسية: ${geo.value} (${geo.label})`);
      if (geo.impacts) {
        const impactStrs = Object.entries(geo.impacts)
          .map(([key, val]) => `${key}: ${val.trend === 'up' ? '↑' : '↓'} ${val.value}`)
          .join(', ');
        parts.push(`تأثيرات الأصول: ${impactStrs}`);
      }
    }

    // AI summary
    if (sentiment.aiSummary) {
      parts.push(`ملخص AI: ${sentiment.aiSummary}`);
    }

    return parts.length > 0 ? `📊 مشاعر السوق العالمية:\n${parts.join('\n')}` : '';
  }

  // ── Private Methods ──

  /**
   * Fetch market sentiment from rouatradingnews API
   * and store in Redis for quick access.
   */
  private async _fetchMarketSentiment(): Promise<MarketSentiment | null> {
    if (!this.NEWS_SITE_URL) return null;

    try {
      const url = `${this.NEWS_SITE_URL}/api/markets/sentiment`;
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      // Add auth if available
      if (this.NEWS_API_KEY) {
        headers['Authorization'] = `Bearer ${this.NEWS_API_KEY}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch(url, { headers, signal: controller.signal });

        if (!res.ok) {
          this.logger.warn(`📰 Market sentiment fetch failed: HTTP ${res.status}`);
          return null;
        }

        const data = await res.json();

        // Transform to our format
        const sentiment: MarketSentiment = {
          fearGreedIndex: data.fearGreedIndex || { value: 50, label: 'Neutral', labelAr: 'محايد' },
          arabSentimentIndex: data.arabSentimentIndex || { value: 50, label: 'Neutral', majorityVote: 'HOLD' },
          geopoliticalRiskIndex: data.geopoliticalRiskIndex || { value: 35, label: 'Low', impacts: {} },
          aiSummary: data.aiSummary || '',
          fetchedAt: new Date().toISOString(),
        };

        // Store in Redis
        try {
          await this.redis.set(
            this.REDIS_SENTIMENT_KEY,
            JSON.stringify(sentiment),
            this.REDIS_SENTIMENT_TTL_MS,
          );
        } catch { /* non-critical */ }

        this.logger.log(
          `📰 Market sentiment updated: Fear&Greed=${sentiment.fearGreedIndex.value} ` +
          `(${sentiment.fearGreedIndex.labelAr}), Arab=${sentiment.arabSentimentIndex.value} ` +
          `(${sentiment.arabSentimentIndex.majorityVote}), Geo=${sentiment.geopoliticalRiskIndex.value}`
        );

        return sentiment;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error: any) {
      this.logger.warn(`📰 Market sentiment fetch error: ${error.message}`);
      return null;
    }
  }

  /**
   * Trigger the news pipeline on the external news site.
   * This causes rouatradingnews to generate new analyzed articles.
   */
  async triggerNewsPipeline(maxItems: number = 15): Promise<any> {
    if (!this.NEWS_SITE_URL) return null;

    try {
      const url = `${this.NEWS_SITE_URL}/api/news/pipeline`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (this.NEWS_ADMIN_SECRET) {
        headers['Authorization'] = `Bearer ${this.NEWS_ADMIN_SECRET}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout for pipeline

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ maxItems, minImpactLevel: 4 }),
          signal: controller.signal,
        });

        if (!res.ok) {
          this.logger.warn(`📰 Pipeline trigger failed: HTTP ${res.status}`);
          return null;
        }

        const data = await res.json();
        this.logger.log(`📰 Pipeline triggered: ${JSON.stringify(data?.summary || 'ok')}`);
        return data;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error: any) {
      this.logger.warn(`📰 Pipeline trigger error: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch news articles from rouatradingnews API.
   * These are in ADDITION to the RSS-fetched articles in NewsService.
   */
  async fetchExternalNews(limit: number = 20): Promise<any[]> {
    if (!this.NEWS_SITE_URL) return [];

    try {
      const url = `${this.NEWS_SITE_URL}/api/v1/news?type=live&limit=${limit}&lang=ar`;
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      if (this.NEWS_API_KEY) {
        headers['Authorization'] = `Bearer ${this.NEWS_API_KEY}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch(url, { headers, signal: controller.signal });

        if (!res.ok) {
          this.logger.warn(`📰 External news fetch failed: HTTP ${res.status}`);
          return [];
        }

        const data = await res.json();
        const articles = data?.data || [];
        this.logger.log(`📰 Fetched ${articles.length} articles from rouatradingnews`);
        return articles;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error: any) {
      this.logger.warn(`📰 External news fetch error: ${error.message}`);
      return [];
    }
  }
}
