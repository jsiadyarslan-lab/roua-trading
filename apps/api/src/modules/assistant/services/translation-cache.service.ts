// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Translation Cache Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "ذاكرة الترجمة" — يخزّن الترجمات المتكررة في Redis
// لتقليل استدعاءات LLM وتسريع الردود
//
// المبدأ:
//   نفس السؤال + نفس اللغة + نفس السياق المختصر = رد مخزّن
//   مع TTL متدرّج حسب نوع المحتوى
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import * as crypto from 'crypto';

// ─── Cache Entry Types ───────────────────────────────────────
export interface CacheEntry {
  reply: string;
  model: string;
  language: string;
  cachedAt: number;
  originalHash: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  errors: number;
  hitRatePercent: number;
}

// ─── TTL Strategy (milliseconds) ─────────────────────────────
const TTL_STRATEGY = {
  // ردود قصيرة ثابتة (تحيات، أسئلة شائعة) — 24 ساعة
  STATIC: 24 * 60 * 60 * 1000,
  // ردود تعتمد على سياق شبه ثابت (إحصائيات قديمة) — 1 ساعة
  SEMI_STATIC: 60 * 60 * 1000,
  // ردود تعتمد على سياق متغيّر (صفقات مفتوحة، أسعار) — 5 دقائق
  DYNAMIC: 5 * 60 * 1000,
  // ردود تعتمد على وقت لحظي (سعر حالي) — 30 ثانية
  REALTIME: 30 * 1000,
} as const;

type CacheCategory = keyof typeof TTL_STRATEGY;

@Injectable()
export class TranslationCacheService {
  private readonly logger = new Logger(TranslationCacheService.name);
  private readonly CACHE_PREFIX = 'assistant:cache:v574:'; // V574: version bump يُبطل كل cache القديم (Markdown → HTML)

  // إحصائيات في الذاكرة (تُصفّر عند الـ restart)
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    errors: 0,
    hitRatePercent: 0,
  };

  constructor(private readonly redis: RedisService) {
    this.logger.log('💾 TranslationCacheService initialized');
  }

  /**
   * يبني مفتاح cache ذكي:
   *   assistant:cache:{userId}:{language}:{category}:{hash}
   * الـ hash يعتمد على:
   *   - رسالة المستخدم (normalized)
   *   - ملخص السياق (لتفادي رد قديم بعد تغيّر الوضع)
   */
  buildCacheKey(
    userId: string,
    message: string,
    language: string,
    contextSummary: string,
    category: CacheCategory = 'DYNAMIC',
  ): string {
    // normalize الرسالة: lowercase + trim + collapse whitespace
    const normalizedMessage = message
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');

    // hash محتوى: message + contextSummary
    const hashInput = `${normalizedMessage}|${contextSummary}|${language}`;
    const hash = crypto
      .createHash('sha256')
      .update(hashInput, 'utf8')
      .digest('hex')
      .slice(0, 16); // 16 chars كافية

    return `${this.CACHE_PREFIX}${userId}:${language}:${category}:${hash}`;
  }

  /**
   * يجلب ردًّا من cache
   */
  async get(cacheKey: string): Promise<CacheEntry | null> {
    try {
      const raw = await this.redis.get(cacheKey);
      if (!raw) {
        this.stats.misses++;
        this._updateHitRate();
        return null;
      }

      const entry: CacheEntry = JSON.parse(raw);
      this.stats.hits++;
      this._updateHitRate();
      this.logger.debug(`💾 Cache HIT: ${cacheKey.slice(-16)}`);
      return entry;
    } catch (e) {
      this.stats.errors++;
      this.logger.warn(`Cache get failed: ${e.message}`);
      return null;
    }
  }

  /**
   * يخزّن ردًّا في cache
   */
  async set(
    cacheKey: string,
    reply: string,
    model: string,
    language: string,
    category: CacheCategory = 'DYNAMIC',
  ): Promise<void> {
    try {
      const entry: CacheEntry = {
        reply,
        model,
        language,
        cachedAt: Date.now(),
        originalHash: cacheKey.slice(-16),
      };

      const ttlMs = TTL_STRATEGY[category];
      await this.redis.set(cacheKey, JSON.stringify(entry), ttlMs);
      this.stats.sets++;
      this.logger.debug(
        `💾 Cache SET (${category}, TTL=${ttlMs / 1000}s): ${cacheKey.slice(-16)}`,
      );
    } catch (e) {
      this.stats.errors++;
      this.logger.warn(`Cache set failed: ${e.message}`);
    }
  }

  /**
   * يجلب أو يُنشئ — pattern شائع
   */
  async getOrSet(
    cacheKey: string,
    factory: () => Promise<{ reply: string; model: string; category?: CacheCategory }>,
    language: string,
    defaultCategory: CacheCategory = 'DYNAMIC',
  ): Promise<{ reply: string; model: string; cached: boolean }> {
    // 1. حاول cache أولًا
    const cached = await this.get(cacheKey);
    if (cached) {
      return {
        reply: cached.reply,
        model: `${cached.model} (cached)`,
        cached: true,
      };
    }

    // 2. نفّذ factory
    const result = await factory();

    // 3. خزّن في cache
    await this.set(
      cacheKey,
      result.reply,
      result.model,
      language,
      result.category ?? defaultCategory,
    );

    return {
      reply: result.reply,
      model: result.model,
      cached: false,
    };
  }

  /**
   * يلغي كل cache لمستخدم محدد
   */
  async invalidateUser(userId: string): Promise<number> {
    try {
      const pattern = `${this.CACHE_PREFIX}${userId}:*`;
      const keys = await this.redis.scanKeys(pattern, 200);
      if (keys.length === 0) return 0;

      for (const k of keys) {
        await this.redis.del(k);
      }
      this.logger.log(`🗑️ Invalidated ${keys.length} cache entries for user ${userId}`);
      return keys.length;
    } catch (e) {
      this.stats.errors++;
      this.logger.warn(`Cache invalidation failed: ${e.message}`);
      return 0;
    }
  }

  /**
   * يصنّف نوع الرسالة لاختيار TTL المناسب
   */
  classifyMessage(message: string): CacheCategory {
    const lower = message.toLowerCase().trim();

    // REALTIME: أسعار حالية
    if (
      lower.match(/price|current|live|سعر|حالي|الآن|now/) &&
      lower.match(/btc|eth|eurusd|gbpusd|xauusd|gold|silver|oil/)
    ) {
      return 'REALTIME';
    }

    // DYNAMIC: صفقات مفتوحة، PnL، أداء اليوم
    if (
      lower.match(/open position|my position|pnl|today|صفقاتي|مفتوحة|اليوم|ربح/)
    ) {
      return 'DYNAMIC';
    }

    // SEMI_STATIC: إحصائيات قديمة، سجل تاريخي
    if (
      lower.match(/history|last month|performance|سجل|آخر شهر|أداء|تاريخ/)
    ) {
      return 'SEMI_STATIC';
    }

    // STATIC: أسئلة عامة، تحيات
    if (
      lower.match(/^(hi|hello|hey|مرحبا|السلام|أهلا|صباح|مساء|thank|شكرا)/) ||
      lower.length < 20
    ) {
      return 'STATIC';
    }

    // افتراضي: DYNAMIC
    return 'DYNAMIC';
  }

  /**
   * يرجع إحصائيات الـ cache
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * يصفّر الإحصائيات (للـ testing)
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      errors: 0,
      hitRatePercent: 0,
    };
  }

  /**
   * يرجع استراتيجية TTL (للـ admin UI)
   */
  getTtlStrategy(): Record<CacheCategory, number> {
    return { ...TTL_STRATEGY };
  }

  // ─── Helpers ────────────────────────────────────────────────

  private _updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRatePercent =
      total > 0 ? Math.round((this.stats.hits / total) * 1000) / 10 : 0;
  }
}
