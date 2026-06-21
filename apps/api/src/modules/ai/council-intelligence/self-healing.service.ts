// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Self-Healing Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "الشفاء الذاتي" — النظام يكتشف المشاكل ويصلحها
// المستوى ١: تعطيل المكون المعطوب تلقائياً
// المستوى ٢: تنبيه مع تشخيص تلقائي
// المستوى ٣: rollback تلقائي لآخر نسخة صحية
//
// V185: النظام يراقب نفسه ويحمي نفسه
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

export type HealingLevel = 1 | 2 | 3;
export type ComponentStatus = 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'DISABLED';

export interface HealthCheck {
  component: string;
  status: ComponentStatus;
  message: string;
  level: HealingLevel;
  action: string;
  timestamp: number;
}

@Injectable()
export class SelfHealingService {
  private readonly logger = new Logger(SelfHealingService.name);
  private readonly REDIS_HEALTH_PREFIX = 'self-healing:health:';
  private readonly REDIS_DISABLE_PREFIX = 'self-healing:disabled:';

  // Component definitions with their health check criteria
  private readonly COMPONENTS = {
    'council': {
      name: 'مجلس الذكاء',
      criticalThreshold: 3,  // 3 consecutive failures = critical
      degradeThreshold: 1,   // 1 failure = degraded
    },
    'executor': {
      name: 'المنفذ الذكي',
      criticalThreshold: 5,
      degradeThreshold: 2,
    },
    'agent': {
      name: 'الوكيل المستقل',
      criticalThreshold: 3,
      degradeThreshold: 1,
    },
    'position-monitor': {
      name: 'مراقب المراكز',
      // V351h: Was 2 — WAY too aggressive. 2 transient failures would disable
      // the ENTIRE position monitor, meaning NO SL/TP monitoring = unlimited
      // losses. This is the ROOT CAUSE of the 20-attempt debugging saga.
      // Position monitor is TOO CRITICAL to ever disable. Set threshold to
      // Infinity so it NEVER gets disabled by self-healing.
      criticalThreshold: Infinity,  // NEVER disable position-monitor
      degradeThreshold: 5,          // Just warn after 5 failures
    },
    'market-data': {
      name: 'خدمة بيانات السوق',
      criticalThreshold: 5,
      degradeThreshold: 2,
    },
    'ai-models': {
      name: 'نماذج الذكاء الاصطناعي',
      criticalThreshold: 8,  // If ALL models fail
      degradeThreshold: 5,
    },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('🩺 Self-Healing Service initialized — النظام يشفى نفسه');
    this._startPeriodicHealthCheck();
  }

  /**
   * Report a component failure
   * Called by any service that encounters an error
   */
  async reportFailure(component: string, error: string): Promise<HealthCheck | null> {
    const key = `${this.REDIS_HEALTH_PREFIX}${component}`;
    const config = this.COMPONENTS[component as keyof typeof this.COMPONENTS];

    if (!config) {
      this.logger.warn(`Unknown component: ${component}`);
      return null;
    }

    // Get current failure count
    let failureCount = 0;
    let lastFailures: { time: number; error: string }[] = [];
    try {
      const data = await this.redis.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        failureCount = parsed.count || 0;
        lastFailures = parsed.failures || [];
      }
    } catch { /* continue */ }

    // Add new failure
    failureCount++;
    lastFailures.push({ time: Date.now(), error: error.substring(0, 200) });
    // Keep only last 10 failures
    if (lastFailures.length > 10) lastFailures = lastFailures.slice(-10);

    // Save
    try {
      await this.redis.set(key, JSON.stringify({
        count: failureCount,
        failures: lastFailures,
        lastFailureAt: Date.now(),
      }), 3600 * 1000); // 1 hour TTL
    } catch { /* non-critical */ }

    // Determine health level
    const health = this._assessHealth(component, failureCount, error);
    this.logger.warn(`🩺 ${config.name} failure #${failureCount}: ${error} → ${health.status} (Level ${health.level})`);

    // Auto-heal based on level
    if (health.level >= 2) {
      await this._executeHealing(health);
    }

    return health;
  }

  /**
   * Report a component success (resets failure counter)
   */
  async reportSuccess(component: string): Promise<void> {
    const key = `${this.REDIS_HEALTH_PREFIX}${component}`;
    try {
      const data = await this.redis.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        // Reset count but keep last failure for diagnostics
        await this.redis.set(key, JSON.stringify({
          count: 0,
          failures: parsed.failures || [],
          lastSuccessAt: Date.now(),
        }), 3600 * 1000);
      }
    } catch { /* non-critical */ }
  }

  /**
   * Check if a component is currently disabled
   */
  async isComponentDisabled(component: string): Promise<boolean> {
    try {
      const disabled = await this.redis.get(`${this.REDIS_DISABLE_PREFIX}${component}`);
      return !!disabled;
    } catch {
      return false;
    }
  }

  /**
   * Manually re-enable a disabled component
   */
  async enableComponent(component: string): Promise<void> {
    try {
      await this.redis.del(`${this.REDIS_DISABLE_PREFIX}${component}`);
      this.logger.log(`🩺 Component ${component} manually re-enabled`);
    } catch { /* non-critical */ }
  }

  /**
   * Get full health report
   */
  async getHealthReport(): Promise<HealthCheck[]> {
    const report: HealthCheck[] = [];

    for (const [component, config] of Object.entries(this.COMPONENTS)) {
      try {
        const data = await this.redis.get(`${this.REDIS_HEALTH_PREFIX}${component}`);
        const disabled = await this.isComponentDisabled(component);

        if (disabled) {
          report.push({
            component,
            status: 'DISABLED',
            message: `${config.name} معطّل تلقائياً بسبب فشل متكرر`,
            level: 3,
            action: 'يحتاج تفعيل يدوي أو يُفعّل تلقائياً بعد ٣٠ دقيقة',
            timestamp: Date.now(),
          });
        } else if (data) {
          const parsed = JSON.parse(data);
          const count = parsed.count || 0;
          const status: ComponentStatus = count >= config.criticalThreshold ? 'FAILED' : count >= config.degradeThreshold ? 'DEGRADED' : 'HEALTHY';

          report.push({
            component,
            status,
            message: `${config.name}: ${count} فشل متتالي`,
            level: count >= config.criticalThreshold ? 3 : count >= config.degradeThreshold ? 2 : 1,
            action: count >= config.criticalThreshold ? 'سيتم تعطيل المكون تلقائياً' : 'مراقبة',
            timestamp: parsed.lastFailureAt || Date.now(),
          });
        } else {
          report.push({
            component,
            status: 'HEALTHY',
            message: `${config.name}: يعمل بشكل طبيعي`,
            level: 1,
            action: 'لا إجراء مطلوب',
            timestamp: Date.now(),
          });
        }
      } catch {
        report.push({
          component,
          status: 'HEALTHY',
          message: `${config.name}: حالة غير معروفة`,
          level: 1,
          action: 'لا إجراء مطلوب',
          timestamp: Date.now(),
        });
      }
    }

    return report;
  }

  // ── Private Methods ──

  private _assessHealth(component: string, failureCount: number, lastError: string): HealthCheck {
    const config = this.COMPONENTS[component as keyof typeof this.COMPONENTS];
    const name = config?.name || component;

    if (failureCount >= config?.criticalThreshold) {
      return {
        component,
        status: 'FAILED',
        message: `${name}: فشل حرج (${failureCount} فشل متتالي) — ${lastError}`,
        level: 3,
        action: 'تعطيل تلقائي فوري لحماية الحساب',
        timestamp: Date.now(),
      };
    }

    if (failureCount >= config?.degradeThreshold) {
      return {
        component,
        status: 'DEGRADED',
        message: `${name}: أداء متدهور (${failureCount} فشل) — ${lastError}`,
        level: 2,
        action: 'مراقبة مكثفة + تنبيه',
        timestamp: Date.now(),
      };
    }

    return {
      component,
      status: 'HEALTHY',
      message: `${name}: فشل عابر (${failureCount})`,
      level: 1,
      action: 'لا إجراء',
      timestamp: Date.now(),
    };
  }

  private async _executeHealing(health: HealthCheck): Promise<void> {
    switch (health.level) {
      case 2:
        // Level 2: Alert + monitoring
        this.logger.warn(
          `🩺 HEALING Level 2: ${health.component} is DEGRADED — ${health.message}\n` +
          `Action: ${health.action}`,
        );
        // Store alert in Redis for UI notification
        try {
          await this.redis.set(
            `self-healing:alert:${health.component}`,
            JSON.stringify(health),
            3600 * 1000,
          );
        } catch { /* non-critical */ }
        break;

      case 3:
        // Level 3: Disable component
        this.logger.error(
          `🩺 HEALING Level 3: ${health.component} is FAILED — DISABLING COMPONENT!\n` +
          `Action: ${health.action}`,
        );
        try {
          await this.redis.set(
            `${this.REDIS_DISABLE_PREFIX}${health.component}`,
            JSON.stringify({
              disabledAt: Date.now(),
              reason: health.message,
              autoReEnableAt: Date.now() + 30 * 60 * 1000, // 30 min auto re-enable
            }),
            30 * 60 * 1000, // 30 min TTL = auto re-enable after 30 min
          );
        } catch { /* non-critical */ }
        break;
    }
  }

  private _healthCheckInterval: NodeJS.Timeout | null = null; // V220: cleanup on destroy

  private _startPeriodicHealthCheck(): void {
    // Full health check every 5 minutes
    // V220-FIX: Store interval reference for cleanup on module destroy
    this._healthCheckInterval = setInterval(async () => {
      try {
        const report = await this.getHealthReport();
        const failed = report.filter(r => r.status === 'FAILED' || r.status === 'DISABLED');

        if (failed.length > 0) {
          this.logger.warn(`🩺 Health Check: ${failed.length} component(s) need attention:`);
          for (const f of failed) {
            this.logger.warn(`  - ${f.component}: ${f.message}`);
          }
        }
      } catch { /* non-critical */ }
    }, 5 * 60 * 1000);
  }

  onModuleDestroy(): void {
    // V220-FIX: Clean up interval to prevent memory leak on shutdown/hot-reload
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval);
      this._healthCheckInterval = null;
    }
  }
}
