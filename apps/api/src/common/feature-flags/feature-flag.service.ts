/**
 * V271: Feature Flag Service — كل إصلاح V261-V270 قابل للتعطيل بـ env var.
 *
 * الاستخدام في Railway:
 *   DISABLE_V261=true → يُعطّل منع forceClose TIME_EXPIRED
 *   DISABLE_V265=true → يُعطّل SL ≥ 2% (يرجع للقيم القديمة)
 *   DISABLE_V270=true → يُعطّل Regime-Aware Position Manager
 *
 * الاستخدام في الكود:
 *   if (this.featureFlags.isEnabled('V261')) { ... }
 *
 * الميزات:
 *   - قراءة من env vars عند الإقلاع (سريع، لا Redis)
 *   - تحديث عند الطلب عبر Redis (hot-reload بدون redeploy)
 *   - default: مُفعّل (الإصلاح يعمل ما لم يُعطَّل صراحة)
 */
import { Injectable, Logger, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

export type FeatureFlag =
  | 'V261' // منع forceClose TIME_EXPIRED
  | 'V262' // paperBalance من DB
  | 'V263' // backend margin أولاً
  | 'V264' // SL close price دقيق
  | 'V265' // SL ≥ 2%
  | 'V266' // WebSocket للمراكز
  | 'V267' // AI بـ 32 لغة
  | 'V268' // ChartPreference schema fix
  | 'V269' // TIMEFRAME_RR في Smart Executor recalc
  | 'V270'; // Regime-Aware Position Manager

@Injectable()
export class FeatureFlagService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeatureFlagService.name);
  private readonly flags = new Map<FeatureFlag, boolean>();
  private readonly REDIS_PREFIX = 'feature-flag:';
  private refreshInterval: NodeJS.Timeout | null = null;

  private readonly ENV_MAP: Record<FeatureFlag, string> = {
    V261: 'DISABLE_V261',
    V262: 'DISABLE_V262',
    V263: 'DISABLE_V263',
    V264: 'DISABLE_V264',
    V265: 'DISABLE_V265',
    V266: 'DISABLE_V266',
    V267: 'DISABLE_V267',
    V268: 'DISABLE_V268',
    V269: 'DISABLE_V269',
    V270: 'DISABLE_V270',
  };

  constructor(@Optional() private readonly redis?: RedisService) {}

  onModuleInit() {
    this._loadFromEnv();
    this._startRedisRefresh();
    this.logger.log(`🏁 Feature Flags loaded: ${this._summary()}`);
  }

  onModuleDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  /**
   * تحقق هل الميزة مُفعّلة.
   * default: true (مُفعّل) — يجب تعطيلها صراحة بـ env var أو Redis.
   */
  isEnabled(flag: FeatureFlag): boolean {
    return this.flags.get(flag) ?? true;
  }

  /**
   * عطّل ميزة وقتياً (عبر Redis — بدون redeploy).
   * TTL: 24 ساعة (بعدها يرجع للحالة الافتراضية).
   */
  async disable(flag: FeatureFlag, ttlMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      await this.redis?.set(`${this.REDIS_PREFIX}${flag}`, 'false', ttlMs);
      this.flags.set(flag, false);
      this.logger.warn(`🚩 Feature flag ${flag} DISABLED (Redis, TTL=${Math.round(ttlMs / 1000)}s)`);
    } catch {
      this.flags.set(flag, false);
      this.logger.warn(`🚩 Feature flag ${flag} DISABLED (in-memory only — Redis unavailable)`);
    }
  }

  /**
   * أعد تفعيل ميزة وقتياً.
   */
  async enable(flag: FeatureFlag): Promise<void> {
    try {
      await this.redis?.del(`${this.REDIS_PREFIX}${flag}`);
    } catch { /* non-critical */ }
    this.flags.set(flag, true);
    this.logger.log(`🚩 Feature flag ${flag} ENABLED`);
  }

  /**
   * اقرأ كل الميزات (للـ /api/health endpoint).
   */
  getAll(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const flag of Object.keys(this.ENV_MAP) as FeatureFlag[]) {
      result[flag] = this.isEnabled(flag);
    }
    return result;
  }

  // ── Private ──

  private _loadFromEnv(): void {
    for (const [flag, envVar] of Object.entries(this.ENV_MAP) as [FeatureFlag, string][]) {
      const disabled = process.env[envVar] === 'true' || process.env[envVar] === '1';
      this.flags.set(flag, !disabled);
    }
  }

  private _startRedisRefresh(): void {
    this.refreshInterval = setInterval(async () => {
      try {
        if (!this.redis) return;
        for (const flag of Object.keys(this.ENV_MAP) as FeatureFlag[]) {
          const redisValue = await this.redis.get(`${this.REDIS_PREFIX}${flag}`);
          if (redisValue === 'false') {
            this.flags.set(flag, false);
          } else if (redisValue === 'true') {
            this.flags.set(flag, true);
          }
        }
      } catch { /* non-critical */ }
    }, 60_000);
  }

  private _summary(): string {
    const entries = Object.entries(this.getAll());
    const enabled = entries.filter(([, v]) => v).map(([k]) => k).join(',');
    const disabled = entries.filter(([, v]) => !v).map(([k]) => k).join(',');
    return `enabled=[${enabled || 'none'}] disabled=[${disabled || 'none'}]`;
  }
}
