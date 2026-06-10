// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Adaptive Scheduling Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "جدول زمني ذكي" — لا يجلس المجلس كل ١٥ دقيقة
// سواء السوق متحرك أو نائم
//
// V185: تقلبات عالية → جلسة كل ٥ دقائق
//       تقلبات منخفضة → كل ٣٠ دقيقة
//       بعد حدث إخباري → جلسة طارئة فورية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketRegimeService } from './market-regime.service';

export interface ScheduleAdjustment {
  symbol: string;
  currentIntervalMs: number;
  recommendedIntervalMs: number;
  adjustmentReason: string;
  volatilityScore: number;   // 0-100
  newsImpactScore: number;   // 0-100
  recentActivity: number;    // 0-100
}

// Schedule boundaries
const MIN_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes (fastest)
const MAX_INTERVAL_MS = 60 * 60 * 1000;   // 60 minutes (slowest)
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes (default)

@Injectable()
export class AdaptiveScheduleService {
  private readonly logger = new Logger(AdaptiveScheduleService.name);
  private readonly REDIS_SCHEDULE_PREFIX = 'adaptive-schedule:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly regimeService: MarketRegimeService,
  ) {
    this.logger.log('⏰ Adaptive Scheduling initialized — جدول ذكي');
  }

  /**
   * Get the recommended session interval for a symbol
   * Called by StrategicCouncilService before scheduling sessions
   */
  async getRecommendedInterval(symbol: string): Promise<ScheduleAdjustment> {
    const cacheKey = `${this.REDIS_SCHEDULE_PREFIX}${symbol}`;

    // Check cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* continue */ }

    // Get current schedule from DB
    let currentIntervalMs = DEFAULT_INTERVAL_MS;
    try {
      const schedule = await this.prisma.adaptiveSchedule.findUnique({
        where: { symbol },
      });
      if (schedule) currentIntervalMs = schedule.currentIntervalMs;
    } catch { /* continue */ }

    // Calculate adjustment factors
    let volatilityScore = 50;
    let newsImpactScore = 0;
    let recentActivity = 50;
    let recommendedIntervalMs = currentIntervalMs;
    const reasons: string[] = [];

    // ── Factor 1: Market Regime Volatility ──
    try {
      const regime = await this.regimeService.getCurrentRegime(symbol);
      volatilityScore = regime.volatilityIndex;

      if (regime.regime === 'VOLATILE') {
        recommendedIntervalMs = Math.max(MIN_INTERVAL_MS, currentIntervalMs * 0.33);
        reasons.push(`سوق متقلب جداً → جلسات أسرع`);
      } else if (volatilityScore > 60) {
        recommendedIntervalMs = Math.max(MIN_INTERVAL_MS, currentIntervalMs * 0.5);
        reasons.push(`تقلب عالي ${volatilityScore}% → جلسات كل ${Math.round(recommendedIntervalMs / 60000)} د`);
      } else if (volatilityScore < 30) {
        recommendedIntervalMs = Math.min(MAX_INTERVAL_MS, currentIntervalMs * 1.5);
        reasons.push(`سوق هادئ ${volatilityScore}% → جلسات أقل`);
      }

      // If regime just changed, schedule an emergency session
      if (regime.previousRegime && regime.previousRegime !== regime.regime) {
        recommendedIntervalMs = MIN_INTERVAL_MS;
        reasons.push(`⚠️ تغيير وضع السوق ${regime.previousRegime} → ${regime.regime} → جلسة طارئة!`);
      }
    } catch {
      reasons.push('وضع السوق غير متاح → جدول عادي');
    }

    // ── Factor 2: News Impact ──
    try {
      const newsKey = `news:impact:${symbol}`;
      const newsScore = await this.redis.get(newsKey);
      if (newsScore) {
        newsImpactScore = Number(newsScore);
        if (newsImpactScore > 70) {
          recommendedIntervalMs = Math.max(MIN_INTERVAL_MS, recommendedIntervalMs * 0.5);
          reasons.push(`حدث إخباري مهم (${newsImpactScore}%) → جلسة فورية`);
        }
      }
    } catch { /* non-critical */ }

    // ── Factor 3: Recent Activity ──
    try {
      const activityKey = `market:activity:${symbol}`;
      const activityData = await this.redis.get(activityKey);
      if (activityData) {
        const activity = JSON.parse(activityData);
        recentActivity = activity.score || 50;

        if (recentActivity > 80) {
          recommendedIntervalMs = Math.max(MIN_INTERVAL_MS, recommendedIntervalMs * 0.7);
          reasons.push(`نشاط سوقي عالي → جلسات أسرع`);
        } else if (recentActivity < 20) {
          recommendedIntervalMs = Math.min(MAX_INTERVAL_MS, recommendedIntervalMs * 1.3);
          reasons.push(`نشاط سوقي منخفض → جلسات أقل`);
        }
      }
    } catch { /* non-critical */ }

    // Clamp to boundaries
    recommendedIntervalMs = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, recommendedIntervalMs));

    // Smooth transition (don't change more than 50% at once)
    if (recommendedIntervalMs < currentIntervalMs * 0.5) {
      recommendedIntervalMs = currentIntervalMs * 0.5;
    } else if (recommendedIntervalMs > currentIntervalMs * 1.5) {
      recommendedIntervalMs = currentIntervalMs * 1.5;
    }

    const adjustmentReason = reasons.length > 0
      ? reasons.join(' | ')
      : 'لا تعديل — جدول عادي';

    const result: ScheduleAdjustment = {
      symbol,
      currentIntervalMs,
      recommendedIntervalMs: Math.round(recommendedIntervalMs),
      adjustmentReason,
      volatilityScore,
      newsImpactScore,
      recentActivity,
    };

    // Save to DB
    try {
      await this.prisma.adaptiveSchedule.upsert({
        where: { symbol },
        create: {
          symbol,
          currentIntervalMs: result.recommendedIntervalMs,
          baseIntervalMs: DEFAULT_INTERVAL_MS,
          volatilityScore,
          newsImpactScore,
          recentActivity,
          recommendedIntervalMs: result.recommendedIntervalMs,
          adjustmentReason,
          lastAdjustmentAt: new Date(),
        },
        update: {
          currentIntervalMs: result.recommendedIntervalMs,
          volatilityScore,
          newsImpactScore,
          recentActivity,
          recommendedIntervalMs: result.recommendedIntervalMs,
          adjustmentReason,
          lastAdjustmentAt: new Date(),
        },
      });
    } catch { /* non-critical */ }

    // Cache for 5 minutes
    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 300 * 1000);
    } catch { /* non-critical */ }

    return result;
  }

  /**
   * Trigger an emergency session for a symbol
   * Called when a major news event or regime change is detected
   */
  async triggerEmergencySession(symbol: string, reason: string): Promise<void> {
    try {
      // Set Redis flag for emergency session
      await this.redis.set(
        `council:emergency:${symbol}`,
        JSON.stringify({ reason, triggeredAt: Date.now() }),
        300 * 1000, // 5 min TTL — must be processed quickly
      );

      // Also update the schedule
      await this.prisma.adaptiveSchedule.upsert({
        where: { symbol },
        create: {
          symbol,
          currentIntervalMs: MIN_INTERVAL_MS,
          baseIntervalMs: DEFAULT_INTERVAL_MS,
          recommendedIntervalMs: MIN_INTERVAL_MS,
          adjustmentReason: `⚠️ جلسة طارئة: ${reason}`,
          lastAdjustmentAt: new Date(),
        },
        update: {
          currentIntervalMs: MIN_INTERVAL_MS,
          recommendedIntervalMs: MIN_INTERVAL_MS,
          adjustmentReason: `⚠️ جلسة طارئة: ${reason}`,
          lastAdjustmentAt: new Date(),
        },
      });

      this.logger.warn(`⏰ EMERGENCY session triggered for ${symbol}: ${reason}`);
    } catch (error) {
      this.logger.error(`Failed to trigger emergency session: ${error.message}`);
    }
  }

  /**
   * Check if there's an emergency session pending for a symbol
   */
  async hasEmergencySession(symbol: string): Promise<{ pending: boolean; reason?: string }> {
    try {
      const data = await this.redis.get(`council:emergency:${symbol}`);
      if (data) {
        const parsed = JSON.parse(data);
        return { pending: true, reason: parsed.reason };
      }
    } catch { /* non-critical */ }
    return { pending: false };
  }

  /**
   * Get all schedule adjustments for monitoring
   */
  async getAllSchedules(): Promise<ScheduleAdjustment[]> {
    const schedules = await this.prisma.adaptiveSchedule.findMany({
      orderBy: { lastAdjustmentAt: 'desc' },
    });

    return schedules.map(s => ({
      symbol: s.symbol,
      currentIntervalMs: s.currentIntervalMs,
      recommendedIntervalMs: s.recommendedIntervalMs,
      adjustmentReason: s.adjustmentReason || '',
      volatilityScore: s.volatilityScore,
      newsImpactScore: s.newsImpactScore,
      recentActivity: s.recentActivity,
    }));
  }
}
