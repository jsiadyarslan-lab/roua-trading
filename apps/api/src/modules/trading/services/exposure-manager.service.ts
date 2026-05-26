// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Exposure Manager Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// مدير التعرض الموحد — ينسق التعرض الكلي بين
// المنفذ الذكي والوكيل المستقل.
//
// المشكلة التي يحلها:
//   - المنفذ الذكي يحسب المراكز المفتوحة بنفسه (source='smart_executor')
//   - الوكيل يحسب المراكز المفتوحة بنفسه (source='agent')
//   - لو كل واحد فتح 5 مراكز، المستخدم عنده 10 مراكز مفتوحة
//   - لكن كل نظام يرى فقط 5 — يتجاوز حدود المخاطر!
//
// الحل:
//   - Exposure Manager يقرأ جميع المراكز المفتوحة من DB بغض النظر عن المصدر
//   - يوفر فحص موحد: canOpenPosition()
//   - يحسب التعرض الكلي والعدد الكلي للمراكز
//   - يستخدم من قبل كلا النظامين قبل فتح أي مركز جديد
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

/** نتيجة فحص التعرض */
export interface ExposureCheckResult {
  /** هل يمكن فتح المركز؟ */
  allowed: boolean;
  /** سبب الرفض إن وُجد */
  reason?: string;
  /** إجمالي المراكز المفتوحة حالياً (من كل المصادر) */
  totalOpenPositions: number;
  /** إجمالي التعرض بالدولار */
  totalExposure: number;
  /** المراكز المفتوحة مصنفة حسب المصدر */
  positionsBySource: Record<string, number>;
  /** هل يوجد مركز مفتوح على نفس الزوج؟ */
  existingPositionOnSymbol: boolean;
}

/** حدود التعرض القابلة للتكوين */
export interface ExposureLimits {
  /** الحد الأقصى لعدد المراكز المفتوحة (من كل المصادر) */
  maxTotalPositions: number;
  /** الحد الأقصى للتعرض الكلي كنسبة من المحفظة (0-100) */
  maxExposurePercent: number;
  /** هل يُسمح بمركز واحد فقط لكل زوج؟ */
  onePositionPerSymbol: boolean;
}

/** القيم الافتراضية — V132: Increased maxTotalPositions from 10 to 20 */
const DEFAULT_LIMITS: ExposureLimits = {
  maxTotalPositions: 20,
  maxExposurePercent: 80,
  onePositionPerSymbol: true,
};

@Injectable()
export class ExposureManagerService {
  private readonly logger = new Logger(ExposureManagerService.name);

  /** Redis lock prefix for atomic position-open check across both systems */
  private readonly POSITION_LOCK_PREFIX = 'position-lock:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('🛡️ Exposure Manager initialized — unified cross-system exposure tracking with Redis locks');
  }

  /**
   * فحص هل يمكن فتح مركز جديد
   *
   * هذا هو الفحص الموحد الذي يجب أن يستخدمه كلا النظامين
   * (المنفذ الذكي والوكيل) قبل محاولة فتح أي مركز جديد.
   *
   * @param userId معرف المستخدم
   * @param symbol زوج التداول (مثل BTC/USDT)
   * @param side اتجاه الصفقة (BUY/SELL)
   * @param estimatedValue القيمة المقدرة للمركز بالدولار
   * @param limits حدود التعرض (اختياري — يستخدم القيم الافتراضية)
   */
  async canOpenPosition(
    userId: string,
    symbol: string,
    side: string,
    estimatedValue: number,
    limits: Partial<ExposureLimits> = {},
  ): Promise<ExposureCheckResult> {
    const effectiveLimits = { ...DEFAULT_LIMITS, ...limits };

    // ── V129: Atomic Redis lock per user+symbol to prevent TOCTOU race ──
    // Both SmartExecutor (10s tick) and Agent (1min cron) can concurrently
    // pass the DB check and open duplicate positions. This lock serializes
    // concurrent attempts for the same user+symbol.
    const lockKey = `${this.POSITION_LOCK_PREFIX}${userId}:${symbol}`;
    const lockTtlMs = 30000; // 30 seconds — must outlast the full check+create cycle
    let lockAcquired = false;

    try {
      // Try to acquire lock — SET NX is atomic in Redis
      lockAcquired = await this.redis.setIfNotExists(lockKey, `${side}:${Date.now()}`, Math.ceil(lockTtlMs / 1000));
      if (!lockAcquired) {
        this.logger.warn(`🛡️ Position lock contention: ${userId}:${symbol} — another system is already opening a position`);
        return {
          allowed: false,
          reason: `نظام آخر يفتح مركزاً على ${symbol} حالياً — يُعاد المحاولة لاحقاً`,
          totalOpenPositions: -1,
          totalExposure: 0,
          positionsBySource: {},
          existingPositionOnSymbol: true, // assume yes since locked
        };
      }

      // ── جلب جميع المراكز المفتوحة بغض النظر عن المصدر ──
      const openPositions = await this.prisma.position.findMany({
        where: {
          userId,
          status: 'OPEN',
          entryPrice: { gt: 0 }, // استبعاد المراكز الوهمية
        },
        select: {
          id: true,
          symbol: true,
          side: true,
          quantity: true,
          entryPrice: true,
          source: true,
        },
      });

      // ── حساب إجمالي المراكز المفتوحة ──
      const totalOpenPositions = openPositions.length;

      // ── تصنيف المراكز حسب المصدر ──
      const positionsBySource: Record<string, number> = {};
      for (const pos of openPositions) {
        const src = pos.source || 'unknown';
        positionsBySource[src] = (positionsBySource[src] || 0) + 1;
      }

      // ── حساب إجمالي التعرض ──
      const totalExposure = openPositions.reduce((sum, pos) => {
        return sum + Number(pos.quantity) * Number(pos.entryPrice);
      }, 0);

      // ── فحص: هل يوجد مركز مفتوح على نفس الزوج؟ ──
      const existingPositionOnSymbol = openPositions.some(
        (pos) => pos.symbol === symbol,
      );

      // ── فحص 1: الحد الأقصى لعدد المراكز ──
      if (totalOpenPositions >= effectiveLimits.maxTotalPositions) {
        return {
          allowed: false,
          reason: `تم الوصول للحد الأقصى للمراكز المفتوحة (${totalOpenPositions}/${effectiveLimits.maxTotalPositions}) — عبر كل المصادر: ${JSON.stringify(positionsBySource)}`,
          totalOpenPositions,
          totalExposure,
          positionsBySource,
          existingPositionOnSymbol,
        };
      }

      // ── فحص 2: مركز واحد لكل زوج ──
      if (effectiveLimits.onePositionPerSymbol && existingPositionOnSymbol) {
        const existingOnSymbol = openPositions.find(p => p.symbol === symbol);
        const positionsOnSymbol = openPositions.filter(p => p.symbol === symbol).length;

        // Paper trading: Allow up to 2 positions per symbol (BUY+SELL hedge)
        if (positionsOnSymbol < 2) {
          this.logger.debug(`🛡️ Hedge allowed: ${symbol} has ${positionsOnSymbol} position(s), allowing 1 more`);
        } else {
          const existingSource = existingOnSymbol?.source || 'unknown';
          return {
            allowed: false,
            reason: `يوجد مركز مفتوح بالفعل على ${symbol} (من ${existingSource}) — القاعدة: مركز واحد لكل زوج`,
            totalOpenPositions,
            totalExposure,
            positionsBySource,
            existingPositionOnSymbol,
          };
        }
      }

      // ── فحص 3: الحد الأقصى للتعرض ──
      const portfolioValue = await this._getPortfolioValue(userId);
      if (portfolioValue > 0) {
        const maxExposure = portfolioValue * (effectiveLimits.maxExposurePercent / 100);
        const newTotalExposure = totalExposure + estimatedValue;
        if (newTotalExposure > maxExposure) {
          return {
            allowed: false,
            reason: `التعرض الكلي سيتجاوز الحد: $${newTotalExposure.toFixed(2)} > $${maxExposure.toFixed(2)} (${effectiveLimits.maxExposurePercent}% من المحفظة $${portfolioValue.toFixed(2)})`,
            totalOpenPositions,
            totalExposure,
            positionsBySource,
            existingPositionOnSymbol,
          };
        }
      }

      // ── جميع الفحوصات اجتازت ──
      // NOTE: Lock remains held for 30s — caller must call releasePositionLock() after
      // position creation succeeds or fails. If they don't, it auto-expires.
      return {
        allowed: true,
        totalOpenPositions,
        totalExposure,
        positionsBySource,
        existingPositionOnSymbol,
      };
    } catch (error: any) {
      // V129 FIX: Fail-CLOSED — if DB/Redis fails, block the trade.
      // Previous code was fail-open, allowing both systems to pass simultaneously
      // during outages, causing duplicate positions on the same symbol.
      this.logger.error(`🛡️ Exposure check FAILED (fail-closed): ${error.message}`);
      return {
        allowed: false,
        reason: `فشل فحص التعرض (مرفوض احتياطياً): ${error.message}`,
        totalOpenPositions: -1,
        totalExposure: 0,
        positionsBySource: {},
        existingPositionOnSymbol: true, // assume yes for safety
      };
    }
  }

  /**
   * تحرير قفل المركز بعد إنشاء المركز (أو فشل الإنشاء)
   * يجب استدعاؤها بعد محاولة إنشاء المركز بغض النظر عن النتيجة
   */
  async releasePositionLock(userId: string, symbol: string): Promise<void> {
    try {
      const lockKey = `${this.POSITION_LOCK_PREFIX}${userId}:${symbol}`;
      await this.redis.del(lockKey);
    } catch { /* non-critical */ }
  }

  /**
   * الحصول على ملخص التعرض الكلي لمستخدم
   * يشمل المراكز من كل المصادر (المنفذ الذكي + الوكيل + يدوي)
   */
  async getExposureSummary(userId: string): Promise<{
    totalOpenPositions: number;
    totalExposure: number;
    positionsBySource: Record<string, number>;
    dailyPnL: number;
    symbols: string[];
  }> {
    try {
      const openPositions = await this.prisma.position.findMany({
        where: {
          userId,
          status: 'OPEN',
          entryPrice: { gt: 0 },
        },
        select: {
          symbol: true,
          quantity: true,
          entryPrice: true,
          source: true,
        },
      });

      const positionsBySource: Record<string, number> = {};
      const symbols: string[] = [];
      let totalExposure = 0;

      for (const pos of openPositions) {
        const src = pos.source || 'unknown';
        positionsBySource[src] = (positionsBySource[src] || 0) + 1;
        totalExposure += Number(pos.quantity) * Number(pos.entryPrice);
        if (!symbols.includes(pos.symbol)) {
          symbols.push(pos.symbol);
        }
      }

      // حساب الخسارة/الربح اليومي
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      let dailyPnL = 0;
      try {
        const todayTrades = await this.prisma.trade.findMany({
          where: {
            userId,
            executedAt: { gte: todayStart },
            type: { in: ['EXIT', 'PARTIAL_EXIT'] },
            pnl: { not: null },
          },
          select: { pnl: true },
        });
        dailyPnL = todayTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
      } catch { /* non-critical */ }

      return {
        totalOpenPositions: openPositions.length,
        totalExposure,
        positionsBySource,
        dailyPnL,
        symbols,
      };
    } catch (error: any) {
      this.logger.warn(`🛡️ Failed to get exposure summary: ${error.message}`);
      return {
        totalOpenPositions: 0,
        totalExposure: 0,
        positionsBySource: {},
        dailyPnL: 0,
        symbols: [],
      };
    }
  }

  /**
   * الحصول على قيمة المحفظة
   * يقرأ من AgentSettings.paperBalance للتداول الورقي
   * أو من جدول Portfolio للتداول الحقيقي
   */
  private async _getPortfolioValue(userId: string): Promise<number> {
    try {
      // محاولة قراءة رصيد التداول الورقي أولاً
      const agentSettings = await this.prisma.agentSettings.findUnique({
        where: { userId },
        select: { paperBalance: true },
      });
      if (agentSettings && Number(agentSettings.paperBalance) > 0) {
        return Number(agentSettings.paperBalance);
      }

      // محاولة قراءة قيمة المحفظة الحقيقية
      const portfolio = await this.prisma.portfolio.aggregate({
        where: { userId },
        _sum: { totalValue: true },
      });
      const totalValue = Number(portfolio._sum.totalValue || 0);
      if (totalValue > 0) {
        return totalValue;
      }

      // قيمة افتراضية
      return 10000;
    } catch {
      return 10000;
    }
  }
}
