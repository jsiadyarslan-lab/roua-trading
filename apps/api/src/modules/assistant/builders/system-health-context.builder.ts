// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — System Health Context Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// يجمع سياق صحة النظام: حالة + آخر أخطاء + تبريد + أحداث self-healing
// يعتمد على SelfHealingService + Prisma (للأحداث الأخيرة)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { SelfHealingService } from '../../ai/council-intelligence/self-healing.service';
import { SystemHealthContext } from '../types/context.types';

@Injectable()
export class SystemHealthContextBuilder {
  private readonly logger = new Logger(SystemHealthContextBuilder.name);

  // RC-2: تتبع آخر خطأ
  private _lastError: string | null = null;
  get lastError(): string | null { return this._lastError; }

  private readonly COOLDOWN_REDIS_KEY = 'system:cooldown:active';
  private readonly COOLDOWN_UNTIL_KEY = 'system:cooldown:until';
  private readonly COOLDOWN_REASON_KEY = 'system:cooldown:reason';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() private readonly selfHealing?: SelfHealingService,
  ) {
    this.logger.log('🩺 SystemHealthContextBuilder initialized');
  }

  async build(userId: string): Promise<SystemHealthContext> {
    // RC-2: إعادة التهيئة قبل كل build
    this._lastError = null;
    const startTime = Date.now();
    try {
      const [
        lastTrade,
        activeBriefsCount,
        pendingOrdersCount,
        cooldownInfo,
        healthReport,
        recentEvents,
      ] = await Promise.all([
        this._getLastTradeSafe(userId),
        this._getActiveBriefsCountSafe(userId),
        this._getPendingOrdersCountSafe(userId),
        this._getCooldownInfoSafe(),
        this._getHealthReportSafe(),
        this._getRecentSelfHealingEventsSafe(),
      ]);

      // حساب مستوى المخاطرة من عدد الصفقات + التبريد + صحة النظام
      const riskLevel = this._calculateRiskLevel(
        activeBriefsCount,
        cooldownInfo.active,
        healthReport,
      );

      const systemStatus = this._determineSystemStatus(
        cooldownInfo.active,
        healthReport,
        recentEvents,
      );

      const durationMs = Date.now() - startTime;
      this.logger.debug(`✅ SystemHealthContext built in ${durationMs}ms`);

      return {
        systemStatus,
        lastTradeAt: lastTrade?.openedAt,
        lastErrorAt: recentEvents.find((e) => e.severity === 'ERROR')?.timestamp,
        lastError: recentEvents.find((e) => e.severity === 'ERROR')?.message,
        activeBriefsCount,
        pendingOrdersCount,
        riskLevel,
        cooldownActive: cooldownInfo.active,
        cooldownEndsAt: cooldownInfo.until,
        selfHealingEvents: recentEvents,
      };
    } catch (error: any) {
      // RC-2: سجّل الخطأ — SystemHealth فاشل يعني المساعد لا يرى التبريد/الأخطاء
      this._lastError = `SystemHealthContext build: ${error?.message || 'unknown'}`;
      this.logger.error(`❌ Failed to build SystemHealthContext: ${this._lastError}`);
      return {
        systemStatus: 'DEGRADED',
        activeBriefsCount: 0,
        pendingOrdersCount: 0,
        riskLevel: 'MEDIUM',
        cooldownActive: false,
        selfHealingEvents: [],
      };
    }
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async _getLastTradeSafe(userId: string): Promise<any | null> {
    try {
      // V458: استخدم Position (لديها openedAt) بدلًا من Trade (لا يوجد openedAt)
      return await this.prisma.position.findFirst({
        where: { userId },
        orderBy: { openedAt: 'desc' },
        select: { openedAt: true, symbol: true, side: true },
      });
    } catch (e) {
      this.logger.warn(`getLastTradeSafe failed: ${e.message}`);
      return null;
    }
  }

  private async _getActiveBriefsCountSafe(userId: string): Promise<number> {
    try {
      // V458: TradingBrief يستخدم isActive (Boolean) و reviewStatus — لا يوجد status
      return await this.prisma.tradingBrief.count({
        where: {
          userId,
          isActive: true,
          reviewStatus: 'ACTIVE',
        },
      });
    } catch (e) {
      this.logger.warn(`getActiveBriefsCountSafe failed: ${e.message}`);
      return 0;
    }
  }

  private async _getPendingOrdersCountSafe(userId: string): Promise<number> {
    try {
      return await this.prisma.order.count({
        where: { userId, status: 'PENDING' },
      });
    } catch (e) {
      this.logger.warn(`getPendingOrdersCountSafe failed: ${e.message}`);
      return 0;
    }
  }

  private async _getCooldownInfoSafe(): Promise<{
    active: boolean;
    until?: Date;
    reason?: string;
  }> {
    try {
      const [active, until, reason] = await Promise.all([
        this.redis.get(this.COOLDOWN_REDIS_KEY),
        this.redis.get(this.COOLDOWN_UNTIL_KEY),
        this.redis.get(this.COOLDOWN_REASON_KEY),
      ]);
      return {
        active: active === 'true' || active === '1',
        until: until ? new Date(Number(until)) : undefined,
        reason: reason ?? undefined,
      };
    } catch (e) {
      this.logger.warn(`getCooldownInfoSafe failed: ${e.message}`);
      return { active: false };
    }
  }

  private async _getHealthReportSafe(): Promise<any[]> {
    if (!this.selfHealing) return [];
    try {
      return await this.selfHealing.getHealthReport();
    } catch (e) {
      this.logger.warn(`getHealthReportSafe failed: ${e.message}`);
      return [];
    }
  }

  private async _getRecentSelfHealingEventsSafe(): Promise<
    Array<{
      type: string;
      message: string;
      timestamp: Date;
      severity: 'INFO' | 'WARN' | 'ERROR';
    }>
  > {
    try {
      // V458: AuditLog schema: action, resource, details (no level field)
      // نستخدم AuditLog + RiskEvent كأحداث نظام
      const [auditLogs, riskEvents] = await Promise.all([
        this.prisma.auditLog.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { action: true, resource: true, details: true, createdAt: true },
        }).catch(() => []),
        this.prisma.riskEvent.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { decision: true, reason: true, symbol: true, createdAt: true },
        }).catch(() => []),
      ]);

      const events: Array<{
        type: string;
        message: string;
        timestamp: Date;
        severity: 'INFO' | 'WARN' | 'ERROR';
      }> = [];

      // AuditLogs
      for (const l of auditLogs as any[]) {
        events.push({
          type: l.action ?? 'AUDIT',
          message: `${l.resource ?? ''}: ${l.details ?? ''}`.trim(),
          timestamp: new Date(l.createdAt),
          severity: this._mapSeverityFromAction(l.action),
        });
      }

      // RiskEvents
      for (const r of riskEvents as any[]) {
        events.push({
          type: `RISK_${r.decision ?? 'EVENT'}`,
          message: `${r.symbol ?? 'GLOBAL'}: ${r.reason ?? ''}`.trim(),
          timestamp: new Date(r.createdAt),
          severity:
            r.decision === 'REJECT' ? 'ERROR' :
            r.decision === 'WARN' ? 'WARN' : 'INFO',
        });
      }

      // رتّب تنازليًا وأخذ آخر 10
      return events
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 10);
    } catch (e) {
      this.logger.warn(`getRecentSelfHealingEventsSafe failed: ${e.message}`);
      return [];
    }
  }

  private _mapSeverityFromAction(action: string | undefined): 'INFO' | 'WARN' | 'ERROR' {
    if (!action) return 'INFO';
    const a = action.toUpperCase();
    if (a.includes('FAIL') || a.includes('ERROR') || a.includes('REJECT')) return 'ERROR';
    if (a.includes('WARN') || a.includes('BLOCK')) return 'WARN';
    return 'INFO';
  }

  private _calculateRiskLevel(
    activeBriefs: number,
    cooldownActive: boolean,
    healthReport: any[],
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (cooldownActive) return 'HIGH';
    const failing = healthReport.filter(
      (h: any) => h.status === 'FAILING' || h.status === 'DISABLED',
    ).length;
    if (failing >= 3) return 'CRITICAL';
    if (failing >= 1) return 'HIGH';
    if (activeBriefs >= 8) return 'MEDIUM';
    return 'LOW';
  }

  private _determineSystemStatus(
    cooldownActive: boolean,
    healthReport: any[],
    recentEvents: any[],
  ): 'OPERATIONAL' | 'DEGRADED' | 'COOLDOWN' | 'ERROR' {
    if (cooldownActive) return 'COOLDOWN';
    const failing = healthReport.filter(
      (h: any) => h.status === 'FAILING' || h.status === 'DISABLED',
    ).length;
    if (failing >= 3) return 'ERROR';
    if (failing >= 1) return 'DEGRADED';
    const recentErrors = recentEvents.filter((e) => e.severity === 'ERROR');
    if (recentErrors.length >= 3) return 'DEGRADED';
    return 'OPERATIONAL';
  }
}
