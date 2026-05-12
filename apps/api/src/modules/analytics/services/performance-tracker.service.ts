// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Performance Tracker Service — المرحلة 4
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// يتتبع أداء كل مصدر (smart_executor / agent / user_manual)
// ويحسب: win rate، Sharpe، max drawdown، Kelly criterion
// ويُوقف النظام تلقائياً عند تجاوز 5% خسارة يومية

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

export interface SourcePerformance {
  source: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalPnL: number;
  maxDrawdown: number;
  sharpeRatio: number | null;
  kellyPercent: number;        // Kelly criterion — حجم المركز الأمثل
  dailyPnL: number;
  dailyPnLPercent: number;
  autoStopTriggered: boolean;
  lastUpdated: Date;
}

export interface SystemHealthStatus {
  smart_executor: SourcePerformance;
  agent: SourcePerformance;
  combined: SourcePerformance;
  autoStopActive: boolean;
  recommendation: string;
}

@Injectable()
export class PerformanceTrackerService {
  private readonly logger = new Logger(PerformanceTrackerService.name);
  private readonly DAILY_LOSS_LIMIT_PCT = 0.05; // 5% خسارة يومية → إيقاف تلقائي
  private readonly MIN_TRADES_FOR_KELLY = 20;   // نحتاج 20+ صفقة قبل استخدام Kelly

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── تشغيل كل 30 دقيقة ──
  @Cron('*/30 * * * *')
  async updatePerformanceCache(): Promise<void> {
    try {
      const userId = await this._getFirstActiveUser();
      if (!userId) return;
      await this.getSystemHealth(userId);
    } catch (err: any) {
      this.logger.debug(`Performance cache update: ${err.message}`);
    }
  }

  /**
   * الحساب الرئيسي: أداء كل مصدر
   */
  async getSourcePerformance(
    userId: string,
    source: string,
    daysSince = 30,
  ): Promise<SourcePerformance> {
    const since = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // جلب الصفقات المغلقة
    const trades = await this.prisma.trade.findMany({
      where: {
        userId,
        source,
        executedAt: { gte: since },
        pnl: { not: null },
      },
      orderBy: { executedAt: 'asc' },
    });

    // حساب الأداء اليومي
    const dailyTrades = await this.prisma.trade.findMany({
      where: { userId, source, executedAt: { gte: today }, pnl: { not: null } },
    });

    const dailyPnL = dailyTrades.reduce((s, t) => s + Number(t.pnl || 0), 0);

    // حساب رصيد المحفظة
    const portfolio = await this.prisma.portfolio.findFirst({ where: { userId } });
    const portfolioValue = Number(portfolio?.totalValue || 10000);
    const dailyPnLPercent = portfolioValue > 0 ? dailyPnL / portfolioValue : 0;

    if (trades.length === 0) {
      return this._emptyPerformance(source, dailyPnL, dailyPnLPercent);
    }

    // ── حساب المقاييس ──
    const pnls = trades.map(t => Number(t.pnl || 0));
    const winners = pnls.filter(p => p > 0);
    const losers = pnls.filter(p => p < 0);

    const totalPnL = pnls.reduce((s, p) => s + p, 0);
    const winRate = winners.length / pnls.length;
    const avgWin = winners.length > 0 ? winners.reduce((s, p) => s + p, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s, p) => s + p, 0) / losers.length) : 0;
    const profitFactor = avgLoss > 0 ? (winRate * avgWin) / ((1 - winRate) * avgLoss) : 0;

    // ── Max Drawdown ──
    let peak = 0, maxDrawdown = 0, cumPnl = 0;
    for (const pnl of pnls) {
      cumPnl += pnl;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // ── Sharpe Ratio ──
    let sharpeRatio: number | null = null;
    if (pnls.length >= 10) {
      const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length;
      const variance = pnls.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / pnls.length;
      const stdDev = Math.sqrt(variance);
      sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : null;
    }

    // ── Kelly Criterion ──
    // Kelly% = W - (1-W)/R حيث W=win rate، R=avg win/avg loss
    let kellyPercent = 0;
    if (trades.length >= this.MIN_TRADES_FOR_KELLY && avgLoss > 0) {
      const R = avgWin / avgLoss;
      kellyPercent = Math.max(0, Math.min(25, (winRate - (1 - winRate) / R) * 100));
      // نستخدم نصف Kelly للأمان (Half Kelly)
      kellyPercent = kellyPercent / 2;
    } else {
      kellyPercent = 2; // افتراضي آمن: 2% per trade
    }

    const autoStopTriggered = dailyPnLPercent <= -this.DAILY_LOSS_LIMIT_PCT;

    return {
      source,
      totalTrades: trades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: Math.round(winRate * 1000) / 10,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      totalPnL: Math.round(totalPnL * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      sharpeRatio: sharpeRatio !== null ? Math.round(sharpeRatio * 100) / 100 : null,
      kellyPercent: Math.round(kellyPercent * 10) / 10,
      dailyPnL: Math.round(dailyPnL * 100) / 100,
      dailyPnLPercent: Math.round(dailyPnLPercent * 10000) / 100,
      autoStopTriggered,
      lastUpdated: new Date(),
    };
  }

  /**
   * صحة النظام الكاملة + التوصية
   */
  async getSystemHealth(userId: string): Promise<SystemHealthStatus> {
    const [executorPerf, agentPerf] = await Promise.all([
      this.getSourcePerformance(userId, 'smart_executor'),
      this.getSourcePerformance(userId, 'agent'),
    ]);

    // أداء مجمّع
    const combined = await this.getSourcePerformance(userId, 'combined_all', 30);

    const autoStopActive = executorPerf.autoStopTriggered || agentPerf.autoStopTriggered;

    // توصية ذكية
    let recommendation = '';
    if (autoStopActive) {
      recommendation = '🚨 تجاوزت خسارة 5% اليوم — النظام متوقف تلقائياً. راجع الاستراتيجية.';
    } else if (executorPerf.winRate > 55 && agentPerf.winRate < 45 && agentPerf.totalTrades > 20) {
      recommendation = '📊 المنفذ الذكي يتفوق على الوكيل. فكّر في تقليل مخاطر الوكيل.';
    } else if (agentPerf.winRate > 55 && executorPerf.winRate < 45 && executorPerf.totalTrades > 20) {
      recommendation = '📊 الوكيل يتفوق على المنفذ الذكي. تحقق من إعدادات M5/M15.';
    } else if (executorPerf.kellyPercent > 0 || agentPerf.kellyPercent > 0) {
      recommendation = `💡 حجم المركز الأمثل: المنفذ ${executorPerf.kellyPercent}%، الوكيل ${agentPerf.kellyPercent}% (Half Kelly).`;
    } else {
      recommendation = '⏳ تحتاج إلى 20+ صفقة لحساب توصيات دقيقة.';
    }

    // تخزين في Redis للسرعة
    try {
      await this.redis.set(
        `performance:health:${userId}`,
        JSON.stringify({ executorPerf, agentPerf, combined, autoStopActive, recommendation }),
        1800, // 30 دقيقة
      );
    } catch {}

    return { smart_executor: executorPerf, agent: agentPerf, combined, autoStopActive, recommendation };
  }

  /**
   * Kelly-based position size — يُستخدم من OrderDispatcher
   */
  async getKellyPositionSize(
    userId: string,
    source: string,
    portfolioValue: number,
  ): Promise<number> {
    try {
      const perf = await this.getSourcePerformance(userId, source);
      const kellyPct = perf.kellyPercent / 100;
      return Math.max(10, portfolioValue * kellyPct);
    } catch {
      return portfolioValue * 0.02; // 2% افتراضي
    }
  }

  /**
   * هل وصلنا لحد الخسارة اليومية؟
   */
  async isDailyLossLimitReached(userId: string): Promise<boolean> {
    try {
      const cached = await this.redis.get(`performance:health:${userId}`);
      if (cached) {
        const data = JSON.parse(cached);
        return data.autoStopActive === true;
      }
      const health = await this.getSystemHealth(userId);
      return health.autoStopActive;
    } catch {
      return false;
    }
  }

  private _emptyPerformance(source: string, dailyPnL: number, dailyPnLPercent: number): SourcePerformance {
    return {
      source, totalTrades: 0, winningTrades: 0, losingTrades: 0,
      winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
      totalPnL: 0, maxDrawdown: 0, sharpeRatio: null,
      kellyPercent: 2, dailyPnL, dailyPnLPercent,
      autoStopTriggered: dailyPnLPercent <= -this.DAILY_LOSS_LIMIT_PCT,
      lastUpdated: new Date(),
    };
  }

  private async _getFirstActiveUser(): Promise<string | null> {
    try {
      const user = await this.prisma.user.findFirst({ where: { status: 'ACTIVE' } });
      return user?.id || null;
    } catch { return null; }
  }
}
