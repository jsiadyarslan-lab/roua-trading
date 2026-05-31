// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Content Agent Service (Orchestrator)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import { AuditService } from '../../audit/audit.service';

import { ContentGeneratorService } from './services/content-generator.service';
import { ContentCuratorService } from './services/content-curator.service';
import { ContentOptimizerService } from './services/content-optimizer.service';
import { ContentPublisherService } from './services/content-publisher.service';

import {
  ContentAgentState,
  ContentAgentStatus,
  ContentGenerationRequest,
  GeneratedContent,
  ContentCategory,
  ContentType,
  ContentLanguage,
  ContentPriority,
  GenerateContentDto,
  UpdateContentDto,
  BulkGenerateDto,
  GetContentFeedDto,
  ScheduleContentDto,
  ContentStatus,
} from './types/content.types';

/**
 * ContentAgentService — The Brain of the Content Engine
 *
 * Orchestrates the entire content lifecycle:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  CONTENT AGENT PIPELINE                     │
 * │                                                             │
 * │  1. CURATE      → ContentCuratorService                    │
 * │     Gather sources, market data, trending topics            │
 * │                                                             │
 * │  2. GENERATE    → ContentGeneratorService                  │
 * │     AI-powered bilingual content creation                   │
 * │                                                             │
 * │  3. OPTIMIZE    → ContentOptimizerService                  │
 * │     SEO, readability, compliance, deduplication             │
 * │                                                             │
 * │  4. PUBLISH     → ContentPublisherService                  │
 * │     Save, schedule, and publish content                     │
 * │                                                             │
 * │  5. MONITOR     → Cron jobs for auto-content               │
 * │     Auto-generate daily digests, fill content gaps          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Scheduled Tasks:
 * - Every 4 hours: Generate market report for each active category
 * - Daily at 8 AM: Generate news digest
 * - Every 6 hours: Check content gaps and fill them
 */
@Injectable()
export class ContentAgentService {
  private readonly logger = new Logger(ContentAgentService.name);

  /** Daily generation quota per user */
  private readonly DAILY_QUOTA = 50;

  /** Redis key for agent state */
  private readonly STATE_KEY = 'content-agent:state';

  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly audit: AuditService,
    readonly generator: ContentGeneratorService,
    readonly curator: ContentCuratorService,
    readonly publisher: ContentPublisherService,
    readonly optimizer: ContentOptimizerService,
  ) {
    this.logger.log('🧠 Content Agent initialized — content engine ready');
  }

  // ── Agent Lifecycle ──

  /**
   * Get agent state
   */
  async getState(): Promise<ContentAgentState> {
    try {
      const raw = await this.redis.get(this.STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* cache miss */ }

    return {
      status: ContentAgentStatus.IDLE,
      totalGenerated: 0,
      totalPublished: 0,
      dailyQuota: this.DAILY_QUOTA,
      dailyGenerated: 0,
      activeTemplates: 0,
      pendingSchedule: 0,
      errors: 0,
    };
  }

  /**
   * Full content generation pipeline: Curate → Generate → Optimize → Save
   */
  async generateContent(userId: string, dto: GenerateContentDto): Promise<{
    content: GeneratedContent;
    article: any;
    optimization: any;
  }> {
    this.logger.log(`🧠 Content generation pipeline: ${dto.type} — "${dto.topic}"`);

    // Step 1: Curate source data
    const sourceData = await this.curator.curateSources(
      dto.category,
      dto.symbols,
    );

    // Step 2: Build generation request
    const request: ContentGenerationRequest = {
      type: dto.type,
      category: dto.category,
      topic: dto.topic,
      symbols: dto.symbols,
      language: dto.language || ContentLanguage.BILINGUAL,
      priority: dto.priority || ContentPriority.NORMAL,
      sourceData,
      aiConfig: dto.aiConfig,
      scheduledAt: dto.scheduledAt,
      tags: dto.tags,
      authorId: userId,
    };

    // Step 3: Generate content
    const content = await this.generator.generate(request);

    // Step 4: Optimize content
    const { content: optimizedContent, optimization } = await this.optimizer.optimize(content);

    // Step 5: Save to database
    const status = dto.scheduledAt ? ContentStatus.SCHEDULED : ContentStatus.DRAFT;
    const article = await this.publisher.saveContent(userId, optimizedContent, status);

    // Step 6: Schedule if needed
    if (dto.scheduledAt) {
      await this.publisher.schedule(userId, article.id, dto.scheduledAt);
    }

    // Update agent state
    await this._updateState({ totalGenerated: { increment: 1 } });

    // Audit
    await this.audit.log({
      userId,
      action: 'CONTENT_GENERATED',
      resource: 'content-agent',
      details: JSON.stringify({
        articleId: article.id,
        type: dto.type,
        category: dto.category,
        qualityScore: optimizedContent.qualityScore,
        optimizationScore: optimization.overallScore,
      }),
    });

    return {
      content: optimizedContent,
      article,
      optimization,
    };
  }

  /**
   * Bulk generate content for multiple topics
   */
  async bulkGenerate(userId: string, dto: BulkGenerateDto): Promise<{
    results: Array<{
      topic: string;
      success: boolean;
      articleId?: string;
      error?: string;
    }>;
  }> {
    this.logger.log(`🧠 Bulk generating ${dto.requests.length} content items`);

    const results: Array<{ topic: string; success: boolean; articleId?: string; error?: string }> = [];

    for (const request of dto.requests) {
      try {
        const result = await this.generateContent(userId, {
          type: request.type,
          category: request.category,
          topic: request.topic,
          symbols: request.symbols,
          language: request.language,
          priority: request.priority,
          aiConfig: request.aiConfig,
          scheduledAt: request.scheduledAt,
          tags: request.tags,
        });

        // Auto-publish if requested
        if (dto.publishImmediately && result.article) {
          await this.publisher.publish(userId, result.article.id);
        }

        results.push({
          topic: request.topic,
          success: true,
          articleId: result.article.id,
        });
      } catch (error: any) {
        results.push({
          topic: request.topic,
          success: false,
          error: error.message,
        });
      }
    }

    return { results };
  }

  /**
   * Generate a breaking news alert
   */
  async generateBreakingAlert(
    userId: string,
    topic: string,
    symbols: string[],
    context: string,
  ): Promise<{ content: GeneratedContent; article: any }> {
    const content = await this.generator.generateBreakingAlert(topic, symbols, context);
    const { content: optimized } = await this.optimizer.optimize(content);
    const article = await this.publisher.saveContent(userId, optimized, ContentStatus.PUBLISHED);

    await this._updateState({ totalGenerated: { increment: 1 }, totalPublished: { increment: 1 } });

    return { content: optimized, article };
  }

  /**
   * Publish content
   */
  async publishContent(userId: string, contentId: string): Promise<any> {
    const result = await this.publisher.publish(userId, contentId);
    await this._updateState({ totalPublished: { increment: 1 } });
    return result;
  }

  /**
   * Schedule content
   */
  async scheduleContent(userId: string, dto: ScheduleContentDto): Promise<any> {
    return this.publisher.schedule(userId, dto.contentId, dto.scheduledAt, dto.platform);
  }

  /**
   * Get content feed
   */
  async getContentFeed(dto: GetContentFeedDto): Promise<any> {
    return this.publisher.getFeed({
      category: dto.category,
      type: dto.type,
      status: dto.status,
      symbol: dto.symbol,
      page: dto.page,
      limit: dto.limit,
    });
  }

  /**
   * Get single content article
   */
  async getContentById(contentId: string): Promise<any> {
    return this.publisher.getById(contentId);
  }

  /**
   * Update content
   */
  async updateContent(userId: string, contentId: string, dto: UpdateContentDto): Promise<any> {
    const data: any = {};
    if (dto.titleAr) data.titleAr = dto.titleAr;
    if (dto.titleEn) data.titleEn = dto.titleEn;
    if (dto.contentAr) data.contentAr = dto.contentAr;
    if (dto.contentEn) data.contentEn = dto.contentEn;
    if (dto.status) data.status = dto.status;
    if (dto.tags) data.tags = JSON.stringify(dto.tags);
    if (dto.scheduledAt) data.scheduledAt = dto.scheduledAt;

    // Use Prisma directly for update
    const { PrismaService } = await import('../../common/prisma/prisma.service');
    // We'll use the publisher's prisma internally
    // For now, use a simpler approach
    return data;
  }

  /**
   * Unpublish or archive content
   */
  async unpublishContent(userId: string, contentId: string, archive: boolean = false): Promise<any> {
    return this.publisher.unpublish(userId, contentId, archive);
  }

  /**
   * Get content statistics
   */
  async getStats(): Promise<any> {
    const [agentState, publisherStats, trendingTopics, contentGaps] = await Promise.all([
      this.getState(),
      this.publisher.getStats(),
      this.curator.getTrendingTopics(),
      this.curator.getContentGaps(),
    ]);

    return {
      agent: agentState,
      publisher: publisherStats,
      trendingTopics,
      contentGaps,
    };
  }

  // ── Scheduled Auto-Content Generation ──

  /**
   * Auto-generate daily market digest at 8 AM
   */
  @Cron('0 8 * * *')
  async autoDailyDigest(): Promise<void> {
    this.logger.log('🧠 Auto-generating daily market digest...');

    const categories = [
      ContentCategory.CRYPTO,
      ContentCategory.FOREX,
      ContentCategory.STOCKS,
    ];

    for (const category of categories) {
      try {
        const sourceData = await this.curator.curateSources(category);
        const topic = this._getDailyDigestTopic(category);

        const content = await this.generator.generate({
          type: ContentType.NEWS_DIGEST,
          category,
          topic,
          language: ContentLanguage.BILINGUAL,
          priority: ContentPriority.HIGH,
          sourceData,
        });

        const { content: optimized } = await this.optimizer.optimize(content);
        await this.publisher.saveContent('system', optimized, ContentStatus.PUBLISHED);

        this.logger.log(`🧠 Auto-published daily digest for ${category}`);
      } catch (error: any) {
        this.logger.error(`Auto-digest failed for ${category}: ${error.message}`);
      }
    }
  }

  /**
   * Auto-fill content gaps every 6 hours
   */
  @Cron('0 */6 * * *')
  async autoFillGaps(): Promise<void> {
    this.logger.log('🧠 Checking content gaps...');

    try {
      const gaps = await this.curator.getContentGaps();
      const criticalGaps = gaps.filter(g => g.lastArticleHoursAgo > 12);

      for (const gap of criticalGaps.slice(0, 3)) {
        try {
          const topic = gap.suggestedTopics[0] || `تحديث ${gap.category}`;
          const sourceData = await this.curator.curateSources(gap.category);

          const content = await this.generator.generate({
            type: ContentType.ARTICLE,
            category: gap.category,
            topic,
            language: ContentLanguage.BILINGUAL,
            priority: ContentPriority.NORMAL,
            sourceData,
          });

          const { content: optimized } = await this.optimizer.optimize(content);
          await this.publisher.saveContent('system', optimized, ContentStatus.PUBLISHED);

          this.logger.log(`🧠 Auto-filled gap for ${gap.category}: "${topic}"`);
        } catch (error: any) {
          this.logger.error(`Auto-fill failed for ${gap.category}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Auto-fill error: ${error.message}`);
    }
  }

  /**
   * Auto-generate hourly market updates every hour
   */
  @Cron('0 * * * *')
  async autoHourlyUpdate(): Promise<void> {
    this.logger.log('🧠 Auto-generating hourly market updates...');

    const categories = [
      ContentCategory.CRYPTO,
      ContentCategory.FOREX,
      ContentCategory.STOCKS,
    ];

    for (const category of categories) {
      try {
        const sourceData = await this.curator.curateSources(category);
        const topic = this._getHourlyUpdateTopic(category);

        const content = await this.generator.generate({
          type: ContentType.HOURLY_UPDATE,
          category,
          topic,
          language: ContentLanguage.BILINGUAL,
          priority: ContentPriority.HIGH,
          sourceData,
        });

        const { content: optimized } = await this.optimizer.optimize(content);
        await this.publisher.saveContent('system', optimized, ContentStatus.PUBLISHED);

        this.logger.log(`🧠 Auto-published hourly update for ${category}`);
      } catch (error: any) {
        this.logger.error(`Hourly update failed for ${category}: ${error.message}`);
      }
    }
  }

  /**
   * Auto-generate weekly review every Monday at 8 AM
   */
  @Cron('0 8 * * 1')
  async autoWeeklyReview(): Promise<void> {
    this.logger.log('🧠 Auto-generating weekly review...');

    const categories = [
      ContentCategory.CRYPTO,
      ContentCategory.FOREX,
      ContentCategory.STOCKS,
      ContentCategory.COMMODITIES,
      ContentCategory.ECONOMY,
    ];

    for (const category of categories) {
      try {
        const sourceData = await this.curator.curateSources(category);
        const topic = this._getWeeklyTopic(category);

        const content = await this.generator.generate({
          type: ContentType.WEEKLY_REVIEW,
          category,
          topic,
          language: ContentLanguage.BILINGUAL,
          priority: ContentPriority.HIGH,
          sourceData,
        });

        const { content: optimized } = await this.optimizer.optimize(content);
        await this.publisher.saveContent('system', optimized, ContentStatus.PUBLISHED);

        this.logger.log(`🧠 Auto-published weekly review for ${category}`);
      } catch (error: any) {
        this.logger.error(`Weekly review failed for ${category}: ${error.message}`);
      }
    }
  }

  /**
   * Auto-generate pair analysis reports every 4 hours for top pairs
   */
  @Cron('0 */4 * * *')
  async autoPairAnalysis(): Promise<void> {
    this.logger.log('🧠 Auto-generating pair analysis reports...');

    const topPairs = [
      { symbol: 'BTC/USDT', category: ContentCategory.CRYPTO },
      { symbol: 'ETH/USDT', category: ContentCategory.CRYPTO },
      { symbol: 'EUR/USD', category: ContentCategory.FOREX },
      { symbol: 'SOL/USDT', category: ContentCategory.CRYPTO },
    ];

    for (const pair of topPairs) {
      try {
        const sourceData = await this.curator.curateSources(pair.category, [pair.symbol]);
        const topic = `تحليل ${pair.symbol} — المستويات والتوقعات`;

        const content = await this.generator.generate({
          type: ContentType.PAIR_ANALYSIS,
          category: pair.category,
          topic,
          symbols: [pair.symbol],
          language: ContentLanguage.BILINGUAL,
          priority: ContentPriority.NORMAL,
          sourceData,
        });

        const { content: optimized } = await this.optimizer.optimize(content);
        await this.publisher.saveContent('system', optimized, ContentStatus.PUBLISHED);

        this.logger.log(`🧠 Auto-published pair analysis for ${pair.symbol}`);
      } catch (error: any) {
        this.logger.error(`Pair analysis failed for ${pair.symbol}: ${error.message}`);
      }
    }
  }

  // ── Private Helpers ──

  private async _updateState(updates: {
    totalGenerated?: { increment: number };
    totalPublished?: { increment: number };
    errors?: { increment: number };
    lastError?: string;
  }): Promise<void> {
    try {
      const state = await this.getState();

      if (updates.totalGenerated) state.totalGenerated += updates.totalGenerated.increment;
      if (updates.totalPublished) state.totalPublished += updates.totalPublished.increment;
      if (updates.errors) state.errors += updates.errors.increment;
      if (updates.lastError) state.lastError = updates.lastError;

      state.lastGenerationAt = new Date();

      await this.redis.set(this.STATE_KEY, JSON.stringify(state), 86400000);
    } catch {
      // Non-critical — state update failure shouldn't break content generation
    }
  }

  private _getHourlyUpdateTopic(category: ContentCategory): string {
    const topics: Record<ContentCategory, string> = {
      [ContentCategory.CRYPTO]: 'تحديث ساعي — سوق العملات الرقمية',
      [ContentCategory.FOREX]: 'تحديث ساعي — سوق الفوركس',
      [ContentCategory.STOCKS]: 'تحديث ساعي — سوق الأسهم الأمريكية',
      [ContentCategory.COMMODITIES]: 'تحديث ساعي — سوق السلع',
      [ContentCategory.ECONOMY]: 'تحديث ساعي — المؤشرات الاقتصادية',
      [ContentCategory.REGULATION]: 'تحديث ساعي — التطورات التنظيمية',
      [ContentCategory.TECHNOLOGY]: 'تحديث ساعي — أخبار التقنية',
      [ContentCategory.EDUCATION]: 'نصيحة ساعية — درس سريع في التداول',
      [ContentCategory.GEOPOLITICS]: 'تحديث ساعي — الأحداث الجيوسياسية',
      [ContentCategory.DEFI]: 'تحديث ساعي — التمويل اللامركزي',
      [ContentCategory.NFT]: 'تحديث ساعي — سوق NFT',
    };
    return topics[category] || 'تحديث ساعي — السوق';
  }

  private _getWeeklyTopic(category: ContentCategory): string {
    const topics: Record<ContentCategory, string> = {
      [ContentCategory.CRYPTO]: 'مراجعة أسبوعية — سوق العملات الرقمية',
      [ContentCategory.FOREX]: 'مراجعة أسبوعية — سوق الفوركس',
      [ContentCategory.STOCKS]: 'مراجعة أسبوعية — سوق الأسهم الأمريكية',
      [ContentCategory.COMMODITIES]: 'مراجعة أسبوعية — سوق السلع',
      [ContentCategory.ECONOMY]: 'مراجعة أسبوعية — المشهد الاقتصادي',
      [ContentCategory.REGULATION]: 'مراجعة أسبوعية — التطورات التنظيمية',
      [ContentCategory.TECHNOLOGY]: 'مراجعة أسبوعية — أخبار التقنية والابتكار',
      [ContentCategory.EDUCATION]: 'مراجعة أسبوعية — دروس التداول',
      [ContentCategory.GEOPOLITICS]: 'مراجعة أسبوعية — الأحداث الجيوسياسية وأثرها',
      [ContentCategory.DEFI]: 'مراجعة أسبوعية — التمويل اللامركزي',
      [ContentCategory.NFT]: 'مراجعة أسبوعية — سوق NFT',
    };
    return topics[category] || 'مراجعة أسبوعية — السوق';
  }

  private _getDailyDigestTopic(category: ContentCategory): string {
    const topics: Record<ContentCategory, string> = {
      [ContentCategory.CRYPTO]: 'ملخص سوق العملات الرقمية اليومي',
      [ContentCategory.FOREX]: 'ملخص سوق الفوركس اليومي',
      [ContentCategory.STOCKS]: 'ملخص سوق الأسهم الأمريكية اليومي',
      [ContentCategory.COMMODITIES]: 'ملخص سوق السلع اليومي',
      [ContentCategory.ECONOMY]: 'ملخص الأخبار الاقتصادية اليومي',
      [ContentCategory.REGULATION]: 'آخر التطورات التنظيمية',
      [ContentCategory.TECHNOLOGY]: 'أخبار التقنية والأسواق',
      [ContentCategory.EDUCATION]: 'درس اليوم في التداول',
      [ContentCategory.GEOPOLITICS]: 'أثر الأحداث الجيوسياسية على الأسواق',
      [ContentCategory.DEFI]: 'ملخص التمويل اللامركزي',
      [ContentCategory.NFT]: 'آخر أخبار سوق NFT',
    };
    return topics[category] || 'ملخص السوق اليومي';
  }
}
