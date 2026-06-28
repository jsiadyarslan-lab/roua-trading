// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Auto Diagnosis Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "الطبيب المالي" — يحلّل صفقات المستخدم تلقائيًا
// ويشخّص أسباب الخسائر ويقترح علاجات
//
// الميزات:
//   1. تحليل آخر N صفقة (مفتوحة + مغلقة)
//   2. كشف الأنماط الخاسرة (SL ضيق، إدخال سيء، إلخ)
//   3. مقارنة الأداء بين الرموز/الأطر الزمنية
//   4. تشخيص الأسباب الجذرية
//   5. توصيات قابلة للتنفيذ
//
// Phase 5 — Intelligence Layer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ContextAggregatorService } from './context-aggregator.service';

export interface DiagnosisFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: 'RISK' | 'STRATEGY' | 'TIMING' | 'EXECUTION' | 'PSYCHOLOGY' | 'MARKET';
  title: string;
  description: string;
  evidence: string[];
  recommendation: string;
  affectedTrades?: number;
  estimatedImpact?: string;
}

export interface DiagnosisReport {
  userId: string;
  generatedAt: Date;
  analysisPeriod: {
    from: Date;
    to: Date;
    days: number;
  };
  summary: {
    totalTradesAnalyzed: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number;
    totalPnl: number;
    profitFactor: number;
    healthScore: number; // 0-100
  };
  findings: DiagnosisFinding[];
  topIssues: DiagnosisFinding[];
  recommendations: string[];
  actionableSteps: Array<{
    priority: 'IMMEDIATE' | 'WEEKLY' | 'MONTHLY';
    action: string;
    expectedImpact: string;
  }>;
}

@Injectable()
export class AutoDiagnosisService {
  private readonly logger = new Logger(AutoDiagnosisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextAggregator: ContextAggregatorService,
  ) {
    this.logger.log('🔬 AutoDiagnosisService initialized');
  }

  /**
   * RC-4: يحوّل UTC timestamp إلى التوقيت المحلي للمستخدم
   */
  private _toUserLocalTime(dateUtc: Date, userTimezone?: string): Date {
    if (!userTimezone) return dateUtc;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(dateUtc);
      const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
      const localStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`;
      return new Date(localStr);
    } catch {
      return dateUtc;
    }
  }

  /**
   * يولّد تقرير تشخيص شامل لمستخدم
   */
  async diagnose(userId: string, days: number = 30, userTimezone?: string): Promise<DiagnosisReport> {
    const startTime = Date.now();
    this.logger.log(`🔬 Starting diagnosis for user ${userId} (${days} days, tz=${userTimezone || 'UTC'})`);

    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    // 1. اجمع كل الصفقات المغلقة في الفترة
    const closedPositions = await this.prisma.position.findMany({
      where: {
        userId,
        status: 'CLOSED',
        closedAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        symbol: true,
        side: true,
        entryPrice: true,
        exitPrice: true,
        stopLoss: true,
        takeProfit: true,
        realizedPnl: true,
        closeReason: true,
        openedAt: true,
        closedAt: true,
        source: true,
        highestPrice: true,
        lowestPrice: true,
        quantity: true,
      },
      orderBy: { closedAt: 'desc' },
    });

    // 2. اجمع الصفقات المفتوحة الحالية
    const openPositions = await this.prisma.position.findMany({
      where: { userId, status: 'OPEN' },
      select: {
        id: true,
        symbol: true,
        side: true,
        entryPrice: true,
        currentPrice: true,
        unrealizedPnl: true,
        stopLoss: true,
        takeProfit: true,
        openedAt: true,
        source: true,
      },
    });

    // 3. اجلب TradeJournal entries للصفقات (إن وُجدت)
    const journals = await this.prisma.tradeJournal.findMany({
      where: {
        userId,
        createdAt: { gte: from, lte: to },
      },
      select: {
        symbol: true,
        side: true,
        pnl: true,
        pnlPercent: true,
        result: true,
        councilVotes: true,
        consensusScore: true,
        regimeAtEntry: true,
        rejectionReasons: true,
        aiReasoning: true,
        source: true,
        openedAt: true,
        closedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    this.logger.debug(
      `📊 Analyzing ${closedPositions.length} closed + ${openPositions.length} open + ${journals.length} journals`,
    );

    // 4. تحليل النتائج
    const findings: DiagnosisFinding[] = [];
    const wins = closedPositions.filter((p) => Number(p.realizedPnl) > 0);
    const losses = closedPositions.filter((p) => Number(p.realizedPnl) < 0);
    const breakeven = closedPositions.filter((p) => Number(p.realizedPnl) === 0);
    const totalPnl = closedPositions.reduce(
      (sum, p) => sum + (Number(p.realizedPnl) || 0),
      0,
    );
    const winRate =
      closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;

    const grossProfit = wins.reduce(
      (s, p) => s + Math.abs(Number(p.realizedPnl) || 0),
      0,
    );
    const grossLoss = Math.abs(
      losses.reduce((s, p) => s + (Number(p.realizedPnl) || 0), 0),
    );
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? 99 : 0;

    // 5. كشف المشاكل
    findings.push(...this._detectStopLossIssues(closedPositions));
    findings.push(...this._detectSymbolConcentration(closedPositions, openPositions));
    // RC-4: مرر userTimezone لتحليلات الوقت
    findings.push(...this._detectTimingIssues(closedPositions, userTimezone));
    findings.push(...this._detectRiskExposure(openPositions));
    findings.push(...this._detectStreakIssues(losses, wins));
    findings.push(...this._detectHoldingTimeIssues(closedPositions));
    findings.push(...this._detectDirectionalBias(closedPositions));
    findings.push(...this._detectCloseReasonIssues(closedPositions));
    findings.push(...this._detectJournalPatterns(journals));

    // 6. احسب health score
    const healthScore = this._calculateHealthScore(
      winRate,
      profitFactor,
      totalPnl,
      findings,
    );

    // 7. رتّب النتائج + استخرج الأهم
    const sortedFindings = findings.sort((a, b) => {
      const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
    const topIssues = sortedFindings.slice(0, 5);

    // 8. توصيات عامة
    const recommendations = this._generateRecommendations(findings, winRate, profitFactor);

    // 9. خطوات قابلة للتنفيذ
    const actionableSteps = this._generateActionableSteps(findings);

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `✅ Diagnosis complete in ${durationMs}ms — health=${healthScore}/100, ${findings.length} findings`,
    );

    return {
      userId,
      generatedAt: new Date(),
      analysisPeriod: { from, to, days },
      summary: {
        totalTradesAnalyzed: closedPositions.length,
        wins: wins.length,
        losses: losses.length,
        breakeven: breakeven.length,
        winRate: Math.round(winRate * 10) / 10,
        totalPnl: Math.round(totalPnl * 100) / 100,
        profitFactor: profitFactor === 99 ? 99 : Math.round(profitFactor * 100) / 100,
        healthScore,
      },
      findings: sortedFindings,
      topIssues,
      recommendations,
      actionableSteps,
    };
  }

  // ─── Detection Methods ──────────────────────────────────────

  private _detectStopLossIssues(positions: any[]): DiagnosisFinding[] {
    const findings: DiagnosisFinding[] = [];

    // صفقات خاسرة بسبب SL ضيق جدًا
    const tightSlLosses = positions.filter((p) => {
      if (Number(p.realizedPnl) >= 0 || !p.stopLoss || !p.entryPrice) return false;
      const entry = Number(p.entryPrice);
      const sl = Number(p.stopLoss);
      const slPercent = Math.abs((sl - entry) / entry) * 100;
      return slPercent < 0.3; // SL أقل من 0.3%
    });

    if (tightSlLosses.length >= 3) {
      findings.push({
        severity: 'HIGH',
        category: 'RISK',
        title: 'Stop-Loss ضيق جدًا',
        description: `${tightSlLosses.length} صفقات خسرت بسبب SL ضيق جدًا (< 0.3%). هذا يسبب إغلاق الصفقات قبل أن تتحقق.`,
        evidence: tightSlLosses.slice(0, 3).map((p) =>
          `${p.symbol}: SL ${(Math.abs((Number(p.stopLoss) - Number(p.entryPrice)) / Number(p.entryPrice)) * 100).toFixed(2)}% → خسارة ${Number(p.realizedPnl).toFixed(2)}$`,
        ),
        recommendation: 'وسّع الـ SL إلى 0.5-1% على الأقل للفوركس، و2-3% للكريبتو. اترك للصفقة مجال للتنفّس.',
        affectedTrades: tightSlLosses.length,
        estimatedImpact: `~${(tightSlLosses.reduce((s, p) => s + Math.abs(Number(p.realizedPnl)), 0)).toFixed(0)}$ خسائر يمكن تجنبها`,
      });
    }

    // صفقات بدون SL
    const noSlPositions = positions.filter((p) => !p.stopLoss);
    if (noSlPositions.length >= 2) {
      findings.push({
        severity: 'CRITICAL',
        category: 'RISK',
        title: 'صفقات بدون Stop-Loss',
        description: `${noSlPositions.length} صفقات بدون SL — مخاطرة عالية جدًا على رأس المال.`,
        evidence: noSlPositions.slice(0, 3).map((p) => p.symbol),
        recommendation: 'لا تفتح أي صفقة بدون SL. استخدم SL إلزامي لكل صفقة.',
        affectedTrades: noSlPositions.length,
        estimatedImpact: 'مخاطرة فقدان كامل الرصيد',
      });
    }

    return findings;
  }

  private _detectSymbolConcentration(closed: any[], open: any[]): DiagnosisFinding[] {
    const findings: DiagnosisFinding[] = [];

    // تركّز مفتوح حاليًا
    if (open.length >= 3) {
      const bySymbol: Record<string, number> = {};
      for (const p of open) {
        bySymbol[p.symbol] = (bySymbol[p.symbol] || 0) + 1;
      }
      const maxConcentration = Math.max(...Object.values(bySymbol));
      if (maxConcentration >= 3) {
        const symbol = Object.entries(bySymbol).find(([_, c]) => c === maxConcentration)?.[0];
        findings.push({
          severity: 'HIGH',
          category: 'RISK',
          title: `تركّز عالي في ${symbol}`,
          description: `لديك ${maxConcentration} صفقات مفتوحة على ${symbol} — تركّز مخاطرة.`,
          evidence: [`إجمالي الصفقات المفتوحة: ${open.length}`, `على ${symbol}: ${maxConcentration}`],
          recommendation: 'قلّل التركّز — لا تفتح أكثر من 2 صفقة على نفس الرمز في نفس الوقت.',
          affectedTrades: maxConcentration,
        });
      }
    }

    // رمز خاسر بشكل متكرر
    if (closed.length >= 10) {
      const bySymbol: Record<string, { wins: number; losses: number; pnl: number }> = {};
      for (const p of closed) {
        if (!bySymbol[p.symbol]) bySymbol[p.symbol] = { wins: 0, losses: 0, pnl: 0 };
        if (Number(p.realizedPnl) > 0) bySymbol[p.symbol].wins++;
        else if (Number(p.realizedPnl) < 0) bySymbol[p.symbol].losses++;
        bySymbol[p.symbol].pnl += Number(p.realizedPnl) || 0;
      }

      for (const [symbol, stats] of Object.entries(bySymbol)) {
        const total = stats.wins + stats.losses;
        if (total >= 5 && stats.losses > stats.wins * 2 && stats.pnl < -50) {
          findings.push({
            severity: 'HIGH',
            category: 'STRATEGY',
            title: `${symbol} رمز خاسر بشكل متكرر`,
            description: `${stats.losses} خسارة vs ${stats.wins} فوز على ${symbol} — صافي ${stats.pnl.toFixed(2)}$`,
            evidence: [`${symbol}: ${stats.wins}W / ${stats.losses}L`, `PnL: ${stats.pnl.toFixed(2)}$`],
            recommendation: `أوقف التداول على ${symbol} مؤقتًا. راجع سبب الخسارة (إعدادات، توقيت، حجم) قبل العودة.`,
            affectedTrades: total,
            estimatedImpact: `${stats.pnl.toFixed(0)}$ خسائر حالية`,
          });
        }
      }
    }

    return findings;
  }

  private _detectTimingIssues(positions: any[], userTimezone?: string): DiagnosisFinding[] {
    const findings: DiagnosisFinding[] = [];

    if (positions.length < 10) return findings;

    // خسائر في أيام محددة
    const byDay: Record<string, { wins: number; losses: number; pnl: number }> = {
      '0': { wins: 0, losses: 0, pnl: 0 }, // Sunday
      '1': { wins: 0, losses: 0, pnl: 0 }, // Monday
      '2': { wins: 0, losses: 0, pnl: 0 },
      '3': { wins: 0, losses: 0, pnl: 0 },
      '4': { wins: 0, losses: 0, pnl: 0 },
      '5': { wins: 0, losses: 0, pnl: 0 },
      '6': { wins: 0, losses: 0, pnl: 0 },
    };

    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    for (const p of positions) {
      // RC-4: استخدم التوقيت المحلي بدل UTC
      const localDate = this._toUserLocalTime(new Date(p.openedAt), userTimezone);
      const day = localDate.getDay().toString();
      if (Number(p.realizedPnl) > 0) byDay[day].wins++;
      else if (Number(p.realizedPnl) < 0) byDay[day].losses++;
      byDay[day].pnl += Number(p.realizedPnl) || 0;
    }

    // ابحث عن يوم خاسر بشدّة
    for (const [day, stats] of Object.entries(byDay)) {
      const total = stats.wins + stats.losses;
      if (total >= 3 && stats.pnl < -50) {
        findings.push({
          severity: 'MEDIUM',
          category: 'TIMING',
          title: `خسائر متكررة يوم ${dayNames[Number(day)]}`,
          description: `${stats.wins}W / ${stats.losses}L يوم ${dayNames[Number(day)]} — صافي ${stats.pnl.toFixed(2)}$`,
          evidence: [`يوم ${dayNames[Number(day)]}: ${stats.wins} فوز / ${stats.losses} خسارة`],
          recommendation: `تجنّب التداول يوم ${dayNames[Number(day)]} أو قلّل حجم الصفقات. راجع سبب الخسارة (سيولة أقل؟ أخبار؟).`,
          affectedTrades: total,
          estimatedImpact: `${stats.pnl.toFixed(0)}$ خسائر`,
        });
      }
    }

    // ساعات خاسرة
    const byHour: Record<string, { wins: number; losses: number; pnl: number }> = {};
    for (const p of positions) {
      // RC-4: استخدم التوقيت المحلي بدل UTC
      const localDate = this._toUserLocalTime(new Date(p.openedAt), userTimezone);
      const hour = localDate.getHours().toString();
      if (!byHour[hour]) byHour[hour] = { wins: 0, losses: 0, pnl: 0 };
      if (Number(p.realizedPnl) > 0) byHour[hour].wins++;
      else if (Number(p.realizedPnl) < 0) byHour[hour].losses++;
      byHour[hour].pnl += Number(p.realizedPnl) || 0;
    }

    // ابحث عن ساعة خاسرة بشدّة (4+ صفقات و PnL سالب)
    for (const [hour, stats] of Object.entries(byHour)) {
      const total = stats.wins + stats.losses;
      if (total >= 4 && stats.pnl < -30 && stats.losses > stats.wins) {
        findings.push({
          severity: 'LOW',
          category: 'TIMING',
          title: `ساعة ${hour}:00 خاسرة`,
          description: `${stats.wins}W / ${stats.losses}L في ساعة ${hour}:00 — صافي ${stats.pnl.toFixed(2)}$`,
          evidence: [`ساعة ${hour}:00: ${stats.wins} فوز / ${stats.losses} خسارة`],
          recommendation: `تجنّب فتح صفقات جديدة في ساعة ${hour}:00 أو راجع نشاط السوق في هذا التوقيت.`,
          affectedTrades: total,
        });
      }
    }

    return findings;
  }

  private _detectRiskExposure(openPositions: any[]): DiagnosisFinding[] {
    const findings: DiagnosisFinding[] = [];

    if (openPositions.length === 0) return findings;

    // عدد كبير من الصفقات المفتوحة
    if (openPositions.length >= 8) {
      findings.push({
        severity: 'HIGH',
        category: 'RISK',
        title: `${openPositions.length} صفقات مفتوحة`,
        description: 'عدد كبير من الصفقات المفتوحة يزيد المخاطرة ويصعّب الإدارة.',
        evidence: [`عدد الصفقات: ${openPositions.length}`],
        recommendation: 'أغلق بعض الصفقات الخاسرة لتقليل المخاطرة. حدّ أقصى موصى به: 5-6 صفقات.',
        affectedTrades: openPositions.length,
      });
    }

    // صفقات خاسرة بشدّة
    const bigLosses = openPositions.filter((p) => Number(p.unrealizedPnl) < -50);
    if (bigLosses.length >= 1) {
      findings.push({
        severity: 'CRITICAL',
        category: 'RISK',
        title: `${bigLosses.length} صفقة بخسارة كبيرة`,
        description: 'صفقات بخسارة > 50$ — تحتاج مراجعة فورية.',
        evidence: bigLosses.map((p) =>
          `${p.symbol}: ${Number(p.unrealizedPnl).toFixed(2)}$`,
        ),
        recommendation: 'راجع هذه الصفقات فورًا. هل السوق تغيّر؟ هل SL بعيد؟ فكّر في الإغلاق.',
        affectedTrades: bigLosses.length,
        estimatedImpact: `${bigLosses.reduce((s, p) => s + Math.abs(Number(p.unrealizedPnl)), 0).toFixed(0)}$ خسارة حالية`,
      });
    }

    return findings;
  }

  private _detectStreakIssues(losses: any[], wins: any[]): DiagnosisFinding[] {
    const findings: DiagnosisFinding[] = [];

    // سلسلة خسائر متتالية
    if (losses.length >= 4) {
      findings.push({
        severity: 'HIGH',
        category: 'PSYCHOLOGY',
        title: `${losses.length} خسائر في الفترة`,
        description: 'سلسلة خسائر قد تؤثر على الحالة النفسية وقرارات التداول.',
        evidence: [`${losses.length} خسائر vs ${wins.length} أرباح`],
        recommendation: 'خذ استراحة من التداول. راجع استراتيجيتك. ابدأ بحجم صغير عند العودة.',
        affectedTrades: losses.length,
      });
    }

    return findings;
  }

  private _detectHoldingTimeIssues(positions: any[]): DiagnosisFinding[] {
    const findings: DiagnosisFinding[] = [];

    if (positions.length < 5) return findings;

    // صفقات أُغلقت بسرعة (أقل من 5 دقائق)
    const tooQuick = positions.filter((p) => {
      if (!p.closedAt) return false;
      const durationMs = new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime();
      return durationMs < 5 * 60 * 1000;
    });

    if (tooQuick.length >= 3) {
      findings.push({
        severity: 'MEDIUM',
        category: 'EXECUTION',
        title: `${tooQuick.length} صفقات أُغلقت بسرعة (< 5 دقائق)`,
        description: 'إغلاق سريع قد يشير إلى: SL ضيق، تشغيل SL/TP خاطئ، أو تقلّب شديد.',
        evidence: tooQuick.slice(0, 3).map((p) => {
          const dur = Math.round(
            (new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime()) / 1000 / 60,
          );
          return `${p.symbol}: ${dur} دقيقة`;
        }),
        recommendation: 'راجع إعدادات SL/TP. تأكّد من أن النظام لا يغلق الصفقات مبكرًا.',
        affectedTrades: tooQuick.length,
      });
    }

    // صفقات معلّقة طويلًا (> 24 ساعة)
    const tooLong = positions.filter((p) => {
      if (!p.closedAt) return false;
      const durationMs = new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime();
      return durationMs > 24 * 60 * 60 * 1000;
    });

    if (tooLong.length >= 3) {
      findings.push({
        severity: 'LOW',
        category: 'TIMING',
        title: `${tooLong.length} صفقات استمرت > 24 ساعة`,
        description: 'صفقات طويلة المدى قد تكلف swap fees وتربط رأس المال.',
        evidence: tooLong.slice(0, 3).map((p) => {
          const dur = Math.round(
            (new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime()) / 1000 / 3600,
          );
          return `${p.symbol}: ${dur} ساعة`;
        }),
        recommendation: 'اضبط TP/SL أقرب، أو استخدم time-based exit (مثلًا إغلاق بعد 4 ساعات).',
        affectedTrades: tooLong.length,
      });
    }

    return findings;
  }

  private _detectDirectionalBias(positions: any[]): DiagnosisFinding[] {
    const findings: DiagnosisFinding[] = [];

    if (positions.length < 10) return findings;

    const buys = positions.filter((p) => p.side === 'BUY');
    const sells = positions.filter((p) => p.side === 'SELL');

    const buyWins = buys.filter((p) => Number(p.realizedPnl) > 0);
    const sellWins = sells.filter((p) => Number(p.realizedPnl) > 0);

    const buyWinRate = buys.length > 0 ? (buyWins.length / buys.length) * 100 : 0;
    const sellWinRate = sells.length > 0 ? (sellWins.length / sells.length) * 100 : 0;

    // تحيّز BUY لكن SELL أكثر ربحًا
    if (buys.length > sells.length * 2 && sellWinRate > buyWinRate + 15) {
      findings.push({
        severity: 'MEDIUM',
        category: 'STRATEGY',
        title: 'تحيّز نحو BUY لكن SELL أكثر ربحًا',
        description: `${buys.length} BUY vs ${sells.length} SELL، لكن win rate SELL (${sellWinRate.toFixed(0)}%) > BUY (${buyWinRate.toFixed(0)}%)`,
        evidence: [
          `BUY: ${buys.length} صفقة، ${buyWinRate.toFixed(0)}% فوز`,
          `SELL: ${sells.length} صفقة، ${sellWinRate.toFixed(0)}% فوز`,
        ],
        recommendation: 'وسّع استراتيجيتك لتشمل صفقات SELL أكثر. السوق صعودي وهبوطي — لا تتجاهل الجانب الهبوطي.',
        affectedTrades: positions.length,
      });
    }

    return findings;
  }

  private _detectCloseReasonIssues(positions: any[]): DiagnosisFinding[] {
    const findings: DiagnosisFinding[] = [];

    if (positions.length < 5) return findings;

    // إغلاق يدوي كثير (Manual)
    const manualCloses = positions.filter((p) =>
      (p.closeReason || '').toLowerCase().includes('manual'),
    );

    if (manualCloses.length >= positions.length * 0.5 && manualCloses.length >= 5) {
      findings.push({
        severity: 'MEDIUM',
        category: 'EXECUTION',
        title: `${manualCloses.length} إغلاق يدوي (${Math.round((manualCloses.length / positions.length) * 100)}%)`,
        description: 'إغلاق يدوي كثير قد يشير إلى: عدم ثقة في SL/TP، تدخل عاطفي، أو قرارات متهوّرة.',
        evidence: [`${manualCloses.length} من ${positions.length} صفقات أُغلقت يدويًا`],
        recommendation: 'اترك للنظام يدير الصفقات (SL/TP). قلّل التدخل اليدوي خاصة في الصفقات الرابحة.',
        affectedTrades: manualCloses.length,
      });
    }

    return findings;
  }

  private _detectJournalPatterns(journals: any[]): DiagnosisFinding[] {
    const findings: DiagnosisFinding[] = [];

    if (journals.length < 10) return findings;

    // توصيات مرفوضة كثيرة
    const rejected = journals.filter((j) => {
      try {
        const reasons = typeof j.rejectionReasons === 'string'
          ? JSON.parse(j.rejectionReasons)
          : j.rejectionReasons;
        return Array.isArray(reasons) && reasons.length > 0;
      } catch {
        return false;
      }
    });

    if (rejected.length >= journals.length * 0.5) {
      findings.push({
        severity: 'LOW',
        category: 'STRATEGY',
        title: `${rejected.length} توصية مرفوضة`,
        description: 'نسبة عالية من التوصيات تُرفض — قد يكون النظام متحفّظًا جدًا أو شروط السوق غير مناسبة.',
        evidence: [`${rejected.length} من ${journals.length} توصية رُفضت`],
        recommendation: 'راجع أسباب الرفض. هل النظام يرفض فرصًا جيدة؟ قد تحتاج لتعديل الحدود.',
        affectedTrades: rejected.length,
      });
    }

    return findings;
  }

  // ─── Scoring & Recommendations ──────────────────────────────

  private _calculateHealthScore(
    winRate: number,
    profitFactor: number,
    totalPnl: number,
    findings: DiagnosisFinding[],
  ): number {
    let score = 50; // base

    // win rate contribution (max +25)
    if (winRate >= 60) score += 25;
    else if (winRate >= 50) score += 15;
    else if (winRate >= 40) score += 5;
    else if (winRate < 30) score -= 15;

    // profit factor (max +15)
    if (profitFactor >= 2) score += 15;
    else if (profitFactor >= 1.5) score += 10;
    else if (profitFactor >= 1) score += 5;
    else if (profitFactor < 0.8) score -= 10;

    // PnL contribution (max +10)
    if (totalPnl > 200) score += 10;
    else if (totalPnl > 0) score += 5;
    else if (totalPnl < -200) score -= 10;

    // findings penalties
    const critical = findings.filter((f) => f.severity === 'CRITICAL').length;
    const high = findings.filter((f) => f.severity === 'HIGH').length;
    score -= critical * 10;
    score -= high * 5;

    return Math.max(0, Math.min(100, score));
  }

  private _generateRecommendations(
    findings: DiagnosisFinding[],
    winRate: number,
    profitFactor: number,
  ): string[] {
    const recs: string[] = [];

    if (winRate < 40) {
      recs.push('نسبة الفوز منخفضة (< 40%) — أوقف التداول مؤقتًا وراجع استراتيجيتك.');
    } else if (winRate >= 60) {
      recs.push('نسبة فوز ممتازة (≥ 60%) — حافظ على استراتيجيتك مع زيادة تدريجية للحجم.');
    }

    if (profitFactor < 1) {
      recs.push('Profit Factor < 1 — الخسائر تتجاوز الأرباح. أوقف النظام وراجع إعدادات SL/TP.');
    } else if (profitFactor >= 2) {
      recs.push('Profit Factor ممتاز (≥ 2) — استراتيجية مربحة. حافظ عليها.');
    }

    // إضافة توصيات من findings
    for (const f of findings.slice(0, 5)) {
      recs.push(f.recommendation);
    }

    if (recs.length === 0) {
      recs.push('الأداء مستقر — استمر في المراقبة والتحسين المستمر.');
    }

    return recs;
  }

  private _generateActionableSteps(
    findings: DiagnosisFinding[],
  ): Array<{ priority: 'IMMEDIATE' | 'WEEKLY' | 'MONTHLY'; action: string; expectedImpact: string }> {
    const steps: Array<{ priority: 'IMMEDIATE' | 'WEEKLY' | 'MONTHLY'; action: string; expectedImpact: string }> = [];

    const critical = findings.filter((f) => f.severity === 'CRITICAL');
    const high = findings.filter((f) => f.severity === 'HIGH');

    // IMMEDIATE: critical issues
    for (const f of critical) {
      steps.push({
        priority: 'IMMEDIATE',
        action: f.recommendation,
        expectedImpact: f.estimatedImpact ?? 'تقليل المخاطرة',
      });
    }

    // WEEKLY: high issues
    for (const f of high.slice(0, 2)) {
      steps.push({
        priority: 'WEEKLY',
        action: f.recommendation,
        expectedImpact: f.estimatedImpact ?? 'تحسين الأداء',
      });
    }

    // MONTHLY: review
    steps.push({
      priority: 'MONTHLY',
      action: 'راجع كل الصفقات المغلقة هذا الشهر — حدّد أفضل/أسوأ 3 صفقات',
      expectedImpact: 'تحسين استراتيجية طويلة المدى',
    });

    return steps;
  }
}
