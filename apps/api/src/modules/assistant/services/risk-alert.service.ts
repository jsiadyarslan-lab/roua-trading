// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Risk Alert Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "حارس المخاطر" — تنبيهات استباقية للمخاطر
// يفحص باستمرار: الصفقات، المخاطر، صحة النظام
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ContextAggregatorService } from './context-aggregator.service';
import { RedisService } from '../../../common/redis/redis.service';
import { t } from '../../../i18n/i18n.helper';

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type AlertCategory = 'RISK' | 'POSITION' | 'SYSTEM' | 'MARKET' | 'PERFORMANCE';

export interface RiskAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  recommendation: string;
  detectedAt: Date;
  expiresAt?: Date;
  acknowledged?: boolean;
  metadata?: Record<string, any>;
}

export interface RiskAlertSummary {
  userId: string;
  generatedAt: Date;
  totalAlerts: number;
  bySeverity: Record<AlertSeverity, number>;
  byCategory: Record<AlertCategory, number>;
  alerts: RiskAlert[];
  topPriority: RiskAlert | null;
  overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

@Injectable()
export class RiskAlertService {
  private readonly logger = new Logger(RiskAlertService.name);
  private readonly CACHE_PREFIX = 'assistant:risk-alerts:';
  private readonly CACHE_TTL_MS = 30 * 1000; // 30 ثانية

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextAggregator: ContextAggregatorService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('🚨 RiskAlertService initialized');
  }

  async getAlerts(userId: string): Promise<RiskAlertSummary> {
    const startTime = Date.now();

    // cache قصير (30s)
    const cacheKey = `${this.CACHE_PREFIX}${userId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // ignore
    }

    const context = await this.contextAggregator.getContext({
      userId,
      skipCache: false,
    });

    const alerts: RiskAlert[] = [];
    const now = new Date();

    // 1. صفقات خاسرة بشدّة
    for (const p of context.userTrading.openPositions) {
      if (p.unrealizedPnlPercent < -8) {
        alerts.push({
          id: `risk-bigloss-${p.id}`,
          severity: 'CRITICAL',
          category: 'POSITION',
          title: `صفقة ${p.symbol} خاسرة ${p.unrealizedPnlPercent.toFixed(1)}%`,
          message: t('risk_alert_service.msg_b7c8370f', { side: p.side, symbol: p.symbol }),
          recommendation: 'راجع هذه الصفقة فورًا — فكّر في الإغلاق إذا كان السوق تغيّر',
          detectedAt: now,
          metadata: {
            positionId: p.id,
            symbol: p.symbol,
            side: p.side,
            entryPrice: p.entryPrice,
            currentPrice: p.currentPrice,
            unrealizedPnl: p.unrealizedPnl,
            unrealizedPnlPercent: p.unrealizedPnlPercent,
          },
        });
      } else if (p.unrealizedPnlPercent < -5) {
        alerts.push({
          id: `risk-loss-${p.id}`,
          severity: 'HIGH',
          category: 'POSITION',
          title: `صفقة ${p.symbol} خاسرة ${p.unrealizedPnlPercent.toFixed(1)}%`,
          message: `${p.symbol} ${p.side}: ${p.unrealizedPnl.toFixed(2)}$ (${p.unrealizedPnlPercent.toFixed(2)}%)`,
          recommendation: 'راقب عن كثب — حدّد نقطة إغلاق واضحة',
          detectedAt: now,
          metadata: { positionId: p.id, symbol: p.symbol },
        });
      }
    }

    // 2. مخاطرة عالية
    if (context.userTrading.positionSummary.riskExposurePercent > 40) {
      alerts.push({
        id: 'risk-high-exposure',
        severity: 'CRITICAL',
        category: 'RISK',
        title: `مخاطرة مرتفعة جدًا (${context.userTrading.positionSummary.riskExposurePercent.toFixed(0)}%)`,
        message: t('risk_alert_service.msg_265ce9d7'),
        recommendation: 'قلّل المخاطرة فورًا — أغلق بعض الصفقات',
        detectedAt: now,
        metadata: { exposurePercent: context.userTrading.positionSummary.riskExposurePercent },
      });
    } else if (context.userTrading.positionSummary.riskExposurePercent > 25) {
      alerts.push({
        id: 'risk-medium-exposure',
        severity: 'HIGH',
        category: 'RISK',
        title: `مخاطرة عالية (${context.userTrading.positionSummary.riskExposurePercent.toFixed(0)}%)`,
        message: t('risk_alert_service.msg_265ce9d7'),
        recommendation: 'راقب المخاطرة — تجنّب فتح صفقات جديدة كبيرة',
        detectedAt: now,
        metadata: { exposurePercent: context.userTrading.positionSummary.riskExposurePercent },
      });
    }

    // 3. عدد كبير من الصفقات المفتوحة
    if (context.userTrading.positionSummary.count >= 8) {
      alerts.push({
        id: 'risk-too-many-positions',
        severity: 'HIGH',
        category: 'RISK',
        title: `${context.userTrading.positionSummary.count} صفقات مفتوحة`,
        message: t('risk_alert_service.trades_risk'),
        recommendation: 'حدّ أقصى موصى به: 5-6 صفقات. أغلق بعض الصفقات.',
        detectedAt: now,
        metadata: { count: context.userTrading.positionSummary.count },
      });
    }

    // 4. تبريد النظام
    if (context.systemHealth.cooldownActive) {
      alerts.push({
        id: 'risk-cooldown',
        severity: 'HIGH',
        category: 'SYSTEM',
        title: 'النظام في وضع تبريد',
        message: `التبريد نشط حتى ${context.systemHealth.cooldownEndsAt?.toLocaleString() ?? 'غير معروف'}`,
        recommendation: 'انتظر انتهاء التبريد قبل فتح صفقات جديدة',
        detectedAt: now,
        expiresAt: context.systemHealth.cooldownEndsAt,
      });
    }

    // 5. صحة النظام متدهورة
    if (context.systemHealth.systemStatus === 'ERROR') {
      alerts.push({
        id: 'risk-system-error',
        severity: 'CRITICAL',
        category: 'SYSTEM',
        title: 'النظام في حالة خطأ',
        message: t('risk_alert_service.system_valid'),
        recommendation: 'لا تفتح صفقات جديدة حتى تستقر الحالة. تواصل مع الدعم إن لزم.',
        detectedAt: now,
      });
    } else if (context.systemHealth.systemStatus === 'DEGRADED') {
      alerts.push({
        id: 'risk-system-degraded',
        severity: 'MEDIUM',
        category: 'SYSTEM',
        title: 'النظام في حالة تدهور',
        message: t('risk_alert_service.msg_b4390acf'),
        recommendation: 'كن حذرًا — راجع الصفقات يدويًا',
        detectedAt: now,
      });
    }

    // 6. صفقة معلّقة طويلًا (> 24 ساعة)
    for (const p of context.userTrading.openPositions) {
      if (p.durationMs > 24 * 60 * 60 * 1000) {
        const hours = Math.round(p.durationMs / (60 * 60 * 1000));
        alerts.push({
          id: `risk-long-position-${p.id}`,
          severity: 'MEDIUM',
          category: 'POSITION',
          title: `صفقة ${p.symbol} معلّقة ${hours} ساعة`,
          message: t('risk_alert_service.msg_9ec1c295', { symbol: p.symbol, side: p.side, hours: hours }),
          recommendation: 'راجع السبب — هل تنتظر هدفًا بعيدًا؟ هل السوق تغيّر؟',
          detectedAt: now,
          metadata: { positionId: p.id, symbol: p.symbol, durationHours: hours },
        });
      }
    }

    // 7. أداء اليوم ضعيف
    if (
      context.userTrading.todayStats.tradesClosed >= 3 &&
      context.userTrading.todayStats.winRate < 30
    ) {
      alerts.push({
        id: 'risk-poor-today',
        severity: 'HIGH',
        category: 'PERFORMANCE',
        title: `أداء ضعيف اليوم (${context.userTrading.todayStats.winRate.toFixed(0)}% فوز)`,
        message: t('risk_alert_service.today', { wins: context.userTrading.todayStats.wins, losses: context.userTrading.todayStats.losses }),
        recommendation: 'فكّر في إيقاف التداول لبقية اليوم — راجع ما حدث',
        detectedAt: now,
        metadata: {
          winRate: context.userTrading.todayStats.winRate,
          trades: context.userTrading.todayStats.tradesClosed,
        },
      });
    }

    // 8. سلسلة خسائر
    if (context.userTrading.todayStats.losses >= 3 && context.userTrading.todayStats.wins === 0) {
      alerts.push({
        id: 'risk-loss-streak',
        severity: 'HIGH',
        category: 'PERFORMANCE',
        title: `${context.userTrading.todayStats.losses} خسائر متتالية اليوم`,
        message: t('risk_alert_service.msg_3b879a09'),
        recommendation: 'خذ استراحة — لا تطارد الخسائر. عُد غدًا بحالة أفضل.',
        detectedAt: now,
      });
    }

    // 9. السوق متقلّب
    if (context.market.marketSentiment === 'VOLATILE') {
      alerts.push({
        id: 'risk-volatile-market',
        severity: 'MEDIUM',
        category: 'MARKET',
        title: 'السوق متقلّب',
        message: `تقلّب مرتفع (${context.market.volatilityIndex ?? '?'})`,
        recommendation: 'كن حذرًا — اقلل أحجام الصفقات ووسّع SL',
        detectedAt: now,
        metadata: { volatilityIndex: context.market.volatilityIndex },
      });
    }

    // 10. أخبار سلبية كثيرة
    if (context.news.sentimentSummary.dominantSentiment === 'NEGATIVE') {
      const total = context.news.sentimentSummary.positive + context.news.sentimentSummary.negative;
      const negPercent = total > 0 ? (context.news.sentimentSummary.negative / total) * 100 : 0;
      if (negPercent > 65) {
        alerts.push({
          id: 'risk-negative-news',
          severity: 'MEDIUM',
          category: 'MARKET',
          title: 'مشاعر سوقية سلبية',
          message: t('risk_alert_service.msg_80b95403', { negative: context.news.sentimentSummary.negative }),
          recommendation: 'كن حذرًا في فتح صفقات BUY — المشاعر سلبية',
          detectedAt: now,
          metadata: { negativePercent: negPercent },
        });
      }
    }

    // رتّب + صنّف
    const severityOrder: Record<AlertSeverity, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFO: 4,
    };

    const sortedAlerts = alerts.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
    );

    const bySeverity: Record<AlertSeverity, number> = {
      CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0,
    };
    const byCategory: Record<AlertCategory, number> = {
      RISK: 0, POSITION: 0, SYSTEM: 0, MARKET: 0, PERFORMANCE: 0,
    };

    for (const a of sortedAlerts) {
      bySeverity[a.severity]++;
      byCategory[a.category]++;
    }

    // overall risk level
    let overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (bySeverity.CRITICAL > 0) overallRiskLevel = 'CRITICAL';
    else if (bySeverity.HIGH >= 2) overallRiskLevel = 'HIGH';
    else if (bySeverity.HIGH >= 1 || bySeverity.MEDIUM >= 3) overallRiskLevel = 'MEDIUM';

    const summary: RiskAlertSummary = {
      userId,
      generatedAt: now,
      totalAlerts: alerts.length,
      bySeverity,
      byCategory,
      alerts: sortedAlerts,
      topPriority: sortedAlerts[0] ?? null,
      overallRiskLevel,
    };

    // cache
    try {
      await this.redis.set(cacheKey, JSON.stringify(summary), this.CACHE_TTL_MS);
    } catch {
      // ignore
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `🚨 Risk alerts generated in ${durationMs}ms — ${alerts.length} alerts (overall: ${overallRiskLevel})`,
    );

    return summary;
  }

  /**
   * يرجع فقط التنبيهات الحرجة (للـ push notifications مثلاً)
   */
  async getCriticalAlerts(userId: string): Promise<RiskAlert[]> {
    const summary = await this.getAlerts(userId);
    return summary.alerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH');
  }
}
