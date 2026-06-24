// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Context Aggregator Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "العقل الجامع" — يجمع كل طبقات السياق الـ 6 في كائن واحد
// مع caching ذكي (Redis TTL 30s) لتجنب إعادة الحساب
//
// لا يحلل، لا يفسّر — فقط يجمع البيانات الجاهزة
// التحليل والتفسير مهمة LLM في الـ AssistantService (مرحلة لاحقة)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { UserTradingContextBuilder } from '../builders/user-trading-context.builder';
import { CouncilContextBuilder } from '../builders/council-context.builder';
import { LearningContextBuilder } from '../builders/learning-context.builder';
import { MarketContextBuilder } from '../builders/market-context.builder';
import { NewsContextBuilder } from '../builders/news-context.builder';
import { SystemHealthContextBuilder } from '../builders/system-health-context.builder';
import {
  AssistantContext,
  ContextRequest,
  AssistantContextSummary,
  CONTEXT_CACHE_PREFIX,
  CONTEXT_CACHE_TTL_MS,
} from '../types/context.types';

@Injectable()
export class ContextAggregatorService {
  private readonly logger = new Logger(ContextAggregatorService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly userTradingBuilder: UserTradingContextBuilder,
    private readonly councilBuilder: CouncilContextBuilder,
    private readonly learningBuilder: LearningContextBuilder,
    private readonly marketBuilder: MarketContextBuilder,
    private readonly newsBuilder: NewsContextBuilder,
    private readonly systemHealthBuilder: SystemHealthContextBuilder,
  ) {
    this.logger.log('🧩 ContextAggregatorService initialized — 6 layers');
  }

  /**
   * يجمع السياق الكامل للمستخدم — مع caching 30s
   */
  async getContext(request: ContextRequest): Promise<AssistantContext> {
    const cacheKey = this._buildCacheKey(request);

    // 1. تحقق من cache (إلا إذا skipCache=true)
    if (!request.skipCache) {
      const cached = await this._getCached(cacheKey);
      if (cached) {
        this.logger.debug(`✅ Context cache HIT: ${cacheKey}`);
        return { ...cached, cacheHit: true };
      }
    }

    // 2. اجمع كل الطبقات بالتوازي
    const generatedAt = new Date();
    const startTime = Date.now();

    const [
      userTrading,
      council,
      learning,
      market,
      news,
      systemHealth,
    ] = await Promise.all([
      this.userTradingBuilder.build(request.userId),
      this.councilBuilder.build(request.userId, request.language),
      this.learningBuilder.build(request.userId, request.symbol),
      this.marketBuilder.build(this._extractUserSymbols(/* from userTrading — will pass */ )),
      this.newsBuilder.build(request.symbol),
      this.systemHealthBuilder.build(request.userId),
    ]);

    // 3. أعد بناء market برموز المستخدم الفعلية (من الصفقات المفتوحة)
    const userSymbols = userTrading.openPositions.map((p) => p.symbol);
    const marketWithUserSymbols = await this.marketBuilder.build(userSymbols);

    // 4. ابنِ summary ذكي
    const summary = this._buildSummary(
      request,
      userTrading,
      council,
      learning,
      marketWithUserSymbols,
      news,
      systemHealth,
    );

    const context: AssistantContext = {
      userId: request.userId,
      generatedAt,
      cacheTtlMs: CONTEXT_CACHE_TTL_MS,
      cacheKey,
      cacheHit: false,
      userTrading,
      council,
      learning,
      market: marketWithUserSymbols,
      news,
      systemHealth,
      summary,
    };

    // 5. خزّن في cache
    await this._setCached(cacheKey, context);

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `✅ Context aggregated in ${durationMs}ms — cacheKey=${cacheKey}`,
    );

    return context;
  }

  /**
   * يبني ملخصًا نصيًّا مختصرًا للـ LLM (200-400 حرف)
   * + ملاحظات + تحذيرات
   */
  private _buildSummary(
    request: ContextRequest,
    userTrading: any,
    council: any,
    learning: any,
    market: any,
    news: any,
    systemHealth: any,
  ): AssistantContextSummary {
    const notes: string[] = [];
    const warnings: string[] = [];

    // ملاحظات: صفقات نشطة
    if (userTrading.openPositions.length > 0) {
      notes.push(
        `لدى المستخدم ${userTrading.openPositions.length} صفقة مفتوحة، إجمالي PnL: ${userTrading.positionSummary.totalUnrealizedPnl.toFixed(2)}$`,
      );
    } else {
      notes.push('لا توجد صفقات مفتوحة حاليًا');
    }

    // ملاحظات: إجماع المجلس
    if (council.activeBriefs.length > 0) {
      notes.push(
        `${council.consensusStats.bullishCount} BUY / ${council.consensusStats.bearishCount} SELL / ${council.consensusStats.neutralCount} NEUTRAL (avg confidence ${council.consensusStats.avgConfidence}%)`,
      );
    }

    // ملاحظات: حلقة التعلم
    if (learning.tradeStats.totalTrades > 0) {
      notes.push(
        `آخر 30 يوم: ${learning.tradeStats.totalTrades} صفقة، winRate ${learning.tradeStats.winRate}%، إجمالي PnL ${learning.tradeStats.totalPnl}$`,
      );
    }

    // ملاحظات: ذاكرة النظام
    if (learning.activeMemories.length > 0) {
      notes.push(`${learning.activeMemories.length} ذاكرة نشطة في النظام`);
    }

    // تحذيرات: مخاطر
    if (userTrading.positionSummary.riskExposurePercent > 30) {
      warnings.push(
        `مخاطرة عالية: ${userTrading.positionSummary.riskExposurePercent.toFixed(1)}% من رأس المال مستثمرة`,
      );
    }

    // تحذيرات: تبريد
    if (systemHealth.cooldownActive) {
      warnings.push(
        `النظام في وضع تبريد حتى ${systemHealth.cooldownEndsAt?.toISOString() ?? 'غير معروف'}`,
      );
    }

    // تحذيرات: صحة النظام
    if (systemHealth.systemStatus === 'ERROR') {
      warnings.push('النظام في حالة خطأ — قد لا يستجيب بشكل صحيح');
    } else if (systemHealth.systemStatus === 'DEGRADED') {
      warnings.push('النظام في حالة تدهور — بعض المكوّنات قد لا تعمل');
    }

    // تحذيرات: صفقة خاسرة بشدة
    const bigLoss = userTrading.openPositions.find(
      (p: any) => p.unrealizedPnlPercent < -5,
    );
    if (bigLoss) {
      warnings.push(
        `صفقة ${bigLoss.symbol} خاسرة ${bigLoss.unrealizedPnlPercent.toFixed(2)}% — قد تحتاج لإغلاق`,
      );
    }

    // بناء الملخص المختصر
    const briefParts: string[] = [
      `المستخدم لديه ${userTrading.openPositions.length} صفقة مفتوحة`,
      `رصيد ${userTrading.positionSummary.displayedBalance.toFixed(2)}$`,
      `${council.activeBriefs.length} brief نشط في المجلس`,
      `نسبة Win آخر 30 يوم ${learning.tradeStats.winRate}%`,
      `حالة السوق: ${market.marketSentiment}`,
      `حالة النظام: ${systemHealth.systemStatus}`,
    ];
    const brief = briefParts.join('، ');

    // استنتاج مستوى الخبرة
    const experienceLevel = this._inferExperienceLevel(learning.tradeStats.totalTrades);

    // اللغة المفضلة
    const preferredLanguage = request.language ?? 'ar';

    return {
      brief,
      notes,
      warnings,
      preferredLanguage,
      experienceLevel,
    };
  }

  private _inferExperienceLevel(totalTrades: number): 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' {
    if (totalTrades < 30) return 'BEGINNER';
    if (totalTrades < 200) return 'INTERMEDIATE';
    return 'ADVANCED';
  }

  private _extractUserSymbols(): string[] {
    // placeholder — تم استبداله بالمنطق الفعلي في getContext
    return [];
  }

  private _buildCacheKey(request: ContextRequest): string {
    const parts = [
      CONTEXT_CACHE_PREFIX,
      request.userId,
      request.symbol ?? '_',
      request.language ?? '_',
    ];
    return parts.join(':');
  }

  private async _getCached(key: string): Promise<AssistantContext | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed as AssistantContext;
    } catch (e) {
      this.logger.warn(`Cache read failed for ${key}: ${e.message}`);
      return null;
    }
  }

  private async _setCached(key: string, context: AssistantContext): Promise<void> {
    try {
      // V458: RedisService.set(key, value, ttlMs) — ttlMs = milliseconds
      await this.redis.set(key, JSON.stringify(context), CONTEXT_CACHE_TTL_MS);
    } catch (e) {
      this.logger.warn(`Cache write failed for ${key}: ${e.message}`);
    }
  }

  /**
   * يدخل سياقًا محدّثًا في cache (للاستخدام عند وقوع حدث مهم)
   */
  async invalidateContext(userId: string, symbol?: string): Promise<void> {
    try {
      // V458: استخدم scanKeys للبحث عن المفاتيح المطابقة
      const pattern = `${CONTEXT_CACHE_PREFIX}${userId}:*`;
      const keys = await this.redis.scanKeys(pattern, 100);
      if (keys.length === 0) return;
      // del يأخذ key واحدًا فقط في RedisService — ن loops
      for (const k of keys) {
        await this.redis.del(k);
      }
      this.logger.debug(`🗑️ Invalidated ${keys.length} cache entries for user ${userId}`);
    } catch (e) {
      this.logger.warn(`Cache invalidation failed: ${e.message}`);
    }
  }
}
