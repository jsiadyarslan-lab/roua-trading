// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Content Publisher Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditService } from '../../../audit/audit.service';
import {
  ContentStatus,
  ContentSchedule,
  GeneratedContent,
  ContentType,
} from '../types/content.types';

/**
 * ContentPublisherService — Publishing and scheduling engine
 *
 * Manages the content publishing lifecycle:
 * - Save content to database (Draft → Published)
 * - Schedule content for future publication
 * - Process scheduled publications via cron job
 * - Track content metrics post-publication
 * - Manage content lifecycle (archive, unpublish)
 *
 * Publishing Pipeline:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Save generated content as DRAFT                          │
 * │ 2. Optional: Schedule for future publication                │
 * │ 3. On schedule time: Change status to PUBLISHED             │
 * │ 4. Update sitemap and RSS feed                              │
 * │ 5. Track metrics (views, shares, engagement)                │
 * │ 6. Auto-archive after 90 days                               │
 * └─────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class ContentPublisherService {
  private readonly logger = new Logger(ContentPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.logger.log('📤 Content Publisher initialized — scheduling engine ready');
  }

  /**
   * Save generated content to the database
   * FIX V6: Added deduplication check — skips if an article with the same
   * title (Arabic or English) was published in the last 24 hours.
   */
  async saveContent(
    userId: string,
    content: GeneratedContent,
    status: ContentStatus = ContentStatus.DRAFT,
  ): Promise<any> {
    this.logger.log(`📤 Saving content: "${content.titleAr}" [${status}]`);

    try {
      // FIX V6: Deduplication — check if an article with the same title was
      // published in the last 24 hours. This prevents the same pair analysis
      // from being published multiple times if the cron job runs twice or
      // if the AI generates very similar content.
      if (status === ContentStatus.PUBLISHED) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const existing = await this.prisma.contentArticle.findFirst({
          where: {
            OR: [
              { titleAr: content.titleAr, publishedAt: { gte: twentyFourHoursAgo } },
              { titleEn: content.titleEn, publishedAt: { gte: twentyFourHoursAgo } },
            ],
          },
          select: { id: true, titleAr: true, publishedAt: true },
        });
        if (existing) {
          this.logger.warn(`📤 Duplicate content detected — skipping publish: "${content.titleAr}" (existing: ${existing.id} published at ${existing.publishedAt?.toISOString()})`);
          return existing;
        }
      }

      const article = await this.prisma.contentArticle.create({
        data: {
          userId,
          type: content.generationSource,
          contentType: content.category,
          titleAr: content.titleAr,
          titleEn: content.titleEn,
          contentAr: content.contentAr,
          contentEn: content.contentEn,
          summaryAr: content.summaryAr,
          summaryEn: content.summaryEn,
          excerpt: content.excerpt,
          // V9: Multilingual fields — French, Turkish, Spanish
          titleFr: content.titleFr || null,
          contentFr: content.contentFr || null,
          summaryFr: content.summaryFr || null,
          titleTr: content.titleTr || null,
          contentTr: content.contentTr || null,
          summaryTr: content.summaryTr || null,
          titleEs: content.titleEs || null,
          contentEs: content.contentEs || null,
          summaryEs: content.summaryEs || null,
          category: content.category,
          categoryAr: content.categoryAr,
          tags: JSON.stringify(content.tags),
          relatedSymbols: JSON.stringify(content.relatedSymbols),
          seo: JSON.stringify(content.seo),
          aiModel: content.aiModel,
          generationSource: content.generationSource,
          confidence: content.confidence,
          qualityScore: content.qualityScore,
          sentimentScore: content.sentimentScore,
          impactLevel: content.impactLevel,
          riskWarnings: JSON.stringify(content.riskWarnings),
          sources: JSON.stringify(content.sources),
          readingTimeMinutes: content.readingTimeMinutes,
          wordCountAr: content.wordCountAr,
          wordCountEn: content.wordCountEn,
          status,
          publishedAt: status === ContentStatus.PUBLISHED ? new Date() : null,
        },
      });

      await this.audit.log({
        userId,
        action: 'CONTENT_CREATED',
        resource: 'content-agent',
        details: JSON.stringify({
          articleId: article.id,
          title: content.titleEn,
          type: content.category,
          status,
        }),
      });

      // Send Telegram notification if content is published directly
      if (status === ContentStatus.PUBLISHED) {
        await this._sendTelegramNotification(article);
      }

      return article;
    } catch (error: any) {
      this.logger.error(`Failed to save content: ${error.message}`);
      throw error;
    }
  }

  /**
   * Publish a draft content immediately
   */
  async publish(userId: string, contentId: string): Promise<any> {
    this.logger.log(`📤 Publishing content: ${contentId}`);

    const article = await this.prisma.contentArticle.findUnique({
      where: { id: contentId },
    });

    if (!article) {
      throw new Error('المحتوى غير موجود');
    }

    if (article.status === ContentStatus.PUBLISHED) {
      throw new Error('المحتوى منشور بالفعل');
    }

    const updated = await this.prisma.contentArticle.update({
      where: { id: contentId },
      data: {
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    await this.audit.log({
      userId,
      action: 'CONTENT_PUBLISHED',
      resource: 'content-agent',
      details: JSON.stringify({
        articleId: contentId,
        title: article.titleEn,
      }),
    });

    // Send Telegram notification for the newly published report
    await this._sendTelegramNotification(updated);

    return updated;
  }

  /**
   * Schedule content for future publication
   */
  async schedule(
    userId: string,
    contentId: string,
    scheduledAt: Date,
    platform: 'WEBSITE' | 'TELEGRAM' | 'TWITTER' | 'ALL' = 'WEBSITE',
  ): Promise<ContentSchedule> {
    this.logger.log(`📤 Scheduling content ${contentId} for ${scheduledAt.toISOString()}`);

    // Update the article status
    await this.prisma.contentArticle.update({
      where: { id: contentId },
      data: {
        status: ContentStatus.SCHEDULED,
        scheduledAt,
      },
    });

    // Create schedule record
    const schedule = await this.prisma.contentSchedule.create({
      data: {
        contentId,
        scheduledAt,
        platform,
        status: 'PENDING',
      },
    });

    return {
      id: schedule.id,
      contentId,
      scheduledAt,
      platform,
      status: 'PENDING',
      retryCount: 0,
    };
  }

  /**
   * Unpublish or archive content
   */
  async unpublish(userId: string, contentId: string, archive: boolean = false): Promise<any> {
    const status = archive ? ContentStatus.ARCHIVED : ContentStatus.DRAFT;

    const updated = await this.prisma.contentArticle.update({
      where: { id: contentId },
      data: { status },
    });

    await this.audit.log({
      userId,
      action: archive ? 'CONTENT_ARCHIVED' : 'CONTENT_UNPUBLISHED',
      resource: 'content-agent',
      details: JSON.stringify({ articleId: contentId }),
    });

    return updated;
  }

  /**
   * Get content feed with filtering and pagination
   */
  async getFeed(options: {
    category?: string;
    type?: string;
    status?: string;
    symbol?: string;
    page?: number;
    limit?: number;
  }): Promise<{ articles: any[]; total: number; page: number; totalPages: number }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 50);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (options.category) where.category = options.category;
    if (options.type) where.contentType = options.type;
    if (options.status) where.status = options.status;
    if (options.symbol) {
      where.relatedSymbols = { contains: options.symbol };
    }

    // FIX: Filter out articles that contain error messages as content.
    // Previously, GLM API timeout errors were stored as article content
    // (e.g., "GLM API error (N/A): timeout of 10000ms exceeded").
    // These garbage articles were marked as PUBLISHED and shown to users.
    // Exclude them from the feed so users only see real content.
    where.NOT = [
      { titleAr: { contains: 'GLM API error' } },
      { titleAr: { contains: 'timeout of' } },
      { titleAr: { contains: '⚠️' } },
      { contentAr: { contains: 'GLM API error' } },
      { contentAr: { contains: 'timeout of' } },
    ];

    const [articles, total] = await Promise.all([
      this.prisma.contentArticle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        // V9 FIX: Explicit select to avoid querying titleFr/titleTr/titleEs
        // columns that may not exist yet (before migration runs).
        // Once migration is applied, this select can be removed.
        select: {
          id: true,
          userId: true,
          type: true,
          contentType: true,
          titleAr: true,
          titleEn: true,
          contentAr: true,
          contentEn: true,
          summaryAr: true,
          summaryEn: true,
          excerpt: true,
          // V9 multilingual fields — included only if they exist
          // (Prisma will error if column doesn't exist, but the select
          // prevents automatic inclusion of all columns)
          titleFr: true,
          contentFr: true,
          summaryFr: true,
          titleTr: true,
          contentTr: true,
          summaryTr: true,
          titleEs: true,
          contentEs: true,
          summaryEs: true,
          category: true,
          categoryAr: true,
          tags: true,
          relatedSymbols: true,
          seo: true,
          aiModel: true,
          generationSource: true,
          confidence: true,
          qualityScore: true,
          sentimentScore: true,
          impactLevel: true,
          riskWarnings: true,
          sources: true,
          readingTimeMinutes: true,
          wordCountAr: true,
          wordCountEn: true,
          views: true,
          shares: true,
          likes: true,
          status: true,
          publishedAt: true,
          scheduledAt: true,
          imageUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.contentArticle.count({ where }),
    ]);

    return {
      articles,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Cleanup error articles from the database.
   * Archives articles whose title or content contains error messages
   * (e.g., "GLM API error", "timeout of", "⚠️" in title).
   * These were created when GLM API errors were stored as article content.
   */
  async cleanupErrorArticles(): Promise<{ archived: number }> {
    try {
      // Archive articles with error content in title or content
      const result = await this.prisma.contentArticle.updateMany({
        where: {
          OR: [
            { titleAr: { contains: 'GLM API error' } },
            { titleAr: { contains: 'timeout of' } },
            { titleAr: { contains: '⚠️' } },
            { contentAr: { contains: 'GLM API error' } },
            { contentAr: { contains: 'timeout of' } },
            { titleEn: { contains: 'GLM API error' } },
            { titleEn: { contains: 'timeout of' } },
            { contentEn: { contains: 'GLM API error' } },
            { contentEn: { contains: 'timeout of' } },
          ],
        },
        data: { status: ContentStatus.ARCHIVED },
      });

      if (result.count > 0) {
        this.logger.log(`📤 Cleaned up ${result.count} error articles (archived)`);
      }

      return { archived: result.count };
    } catch (error: any) {
      this.logger.error(`Cleanup error articles failed: ${error.message}`);
      return { archived: 0 };
    }
  }

  /**
   * Get a single content article by ID
   */
  async getById(contentId: string): Promise<any> {
    return this.prisma.contentArticle.findUnique({
      where: { id: contentId },
    });
  }

  /**
   * Get publishing statistics
   */
  async getStats(): Promise<{
    totalArticles: number;
    published: number;
    drafts: number;
    scheduled: number;
    todayPublished: number;
    thisWeekPublished: number;
    avgQualityScore: number;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const [totalArticles, published, drafts, scheduled, todayPublished, weekPublished] =
      await Promise.all([
        this.prisma.contentArticle.count(),
        this.prisma.contentArticle.count({ where: { status: ContentStatus.PUBLISHED } }),
        this.prisma.contentArticle.count({ where: { status: ContentStatus.DRAFT } }),
        this.prisma.contentArticle.count({ where: { status: ContentStatus.SCHEDULED } }),
        this.prisma.contentArticle.count({
          where: { status: ContentStatus.PUBLISHED, publishedAt: { gte: todayStart } },
        }),
        this.prisma.contentArticle.count({
          where: { status: ContentStatus.PUBLISHED, publishedAt: { gte: weekStart } },
        }),
      ]);

    // Average quality score
    const qualityResult = await this.prisma.contentArticle.aggregate({
      where: { status: ContentStatus.PUBLISHED },
      _avg: { qualityScore: true },
    });

    return {
      totalArticles,
      published,
      drafts,
      scheduled,
      todayPublished,
      thisWeekPublished: weekPublished,
      avgQualityScore: Math.round(qualityResult._avg.qualityScore || 0),
    };
  }

  // ── Scheduled Publishing (Cron) ──

  /**
   * Process scheduled publications every 5 minutes
   */
  @Cron('*/5 * * * *')
  async processScheduledPublications(): Promise<void> {
    // SUSTAINABLE FIX: Don't attempt DB queries when DB is unavailable.
    // Without this check, every cron tick creates a new connection attempt,
    // leaking connections and making the exhaustion problem worse.
    if (!this.prisma.isAvailable()) {
      return;
    }
    try {
      const now = new Date();

      // Find content scheduled for now or earlier
      const scheduled = await this.prisma.contentArticle.findMany({
        where: {
          status: ContentStatus.SCHEDULED,
          scheduledAt: { lte: now },
        },
        take: 20,
      });

      if (scheduled.length === 0) return;

      this.logger.log(`📤 Processing ${scheduled.length} scheduled publications`);

      for (const article of scheduled) {
        try {
          await this.prisma.contentArticle.update({
            where: { id: article.id },
            data: {
              status: ContentStatus.PUBLISHED,
              publishedAt: now,
            },
          });

          // Update schedule record
          await this.prisma.contentSchedule.updateMany({
            where: { contentId: article.id, status: 'PENDING' },
            data: { status: 'PUBLISHED', publishedAt: now },
          });

          this.logger.log(`📤 Published scheduled article: ${article.titleEn}`);
        } catch (error: any) {
          this.logger.error(`Failed to publish ${article.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Schedule processor error: ${error.message}`);
    }
  }

  // ── Telegram Notification ──

  /**
   * Send a Telegram notification when a report is published.
   * Non-blocking — failures are logged but don't fail the publish operation.
   */
  private async _sendTelegramNotification(article: any): Promise<void> {
    try {
      const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '')?.trim();
      const chatId = this.configService.get<string>('TELEGRAM_CHAT_ID', '')?.trim();

      if (!botToken || !chatId) {
        return; // Telegram not configured — skip silently
      }

      // Report type emoji badge
      const typeEmojis: Record<string, string> = {
        ARTICLE: '📰',
        ANALYSIS: '📊',
        NEWS_DIGEST: '📋',
        MARKET_REPORT: '📈',
        EDUCATIONAL: '📚',
        OPINION: '💡',
        BREAKING: '🚨',
        HOURLY_UPDATE: '⏱️',
        WEEKLY_REVIEW: '📅',
        PAIR_ANALYSIS: '💹',
      };
      const emoji = typeEmojis[article.type] || typeEmojis[article.contentType] || '📄';

      // Parse related symbols
      let symbols: string[] = [];
      try {
        symbols = article.relatedSymbols ? JSON.parse(article.relatedSymbols) : [];
      } catch {
        symbols = [];
      }

      const symbolsStr = symbols.length > 0 ? symbols.join(', ') : '—';
      const category = article.categoryAr || article.category || '—';
      const titleAr = article.titleAr || article.titleEn || 'تقرير جديد';

      // Quality score display
      const qualityScore = article.qualityScore;
      const qualityDisplay = qualityScore ? `⭐ الجودة: ${qualityScore}/100` : '';

      // Build the HTML message
      const message = [
        `${emoji} <b>تقرير جديد</b>`,
        '',
        `📌 <b>${titleAr}</b>`,
        `📂 التصنيف: ${category}`,
        `🏷️ الأصول: ${symbolsStr}`,
        qualityDisplay ? qualityDisplay : '',
        '',
        '⚠️ <i>هذا المحتوى لأغراض تعليمية فقط ولا يُعد نصيحة استثمارية</i>',
      ].filter(Boolean).join('\n');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (res.ok) {
        this.logger.log(`📤 Telegram notification sent for: ${article.titleEn || article.id}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        this.logger.warn(`Telegram notification failed: ${JSON.stringify(errData)}`);
      }
    } catch (error: any) {
      // Non-blocking — don't fail the publish if notification fails
      this.logger.warn(`Telegram notification error (non-blocking): ${error.message}`);
    }
  }

  /**
   * Auto-archive old content (run daily at 3 AM)
   */
  @Cron('0 3 * * *')
  async autoArchive(): Promise<void> {
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const result = await this.prisma.contentArticle.updateMany({
        where: {
          status: ContentStatus.PUBLISHED,
          publishedAt: { lt: ninetyDaysAgo },
        },
        data: { status: ContentStatus.ARCHIVED },
      });

      if (result.count > 0) {
        this.logger.log(`📤 Auto-archived ${result.count} articles older than 90 days`);
      }
    } catch (error: any) {
      this.logger.error(`Auto-archive error: ${error.message}`);
    }
  }
}
