// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Daily Brief Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "الموجز اليومي" — ملخص ذكي يصل كل صباح
// يلخّص: أداء الأمس + حالة اليوم + توصيات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ContextAggregatorService } from './context-aggregator.service';
import { RedisService } from '../../../common/redis/redis.service';

export interface DailyBrief {
  userId: string;
  date: string; // YYYY-MM-DD
  generatedAt: Date;
  language: string;

  greeting: string;
  yesterdaySummary: {
    tradesOpened: number;
    tradesClosed: number;
    wins: number;
    losses: number;
    winRate: number;
    netPnl: number;
    bestTrade?: { symbol: string; pnl: number };
    worstTrade?: { symbol: string; pnl: number };
  };
  todaySetup: {
    openPositions: number;
    unrealizedPnl: number;
    activeBriefs: number;
    councilSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    marketSentiment: string;
  };
  riskStatus: {
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    exposurePercent: number;
    cooldownActive: boolean;
  };
  recommendations: string[];
  watchlist: string[];
  motivationalNote: string;
}

@Injectable()
export class DailyBriefService {
  private readonly logger = new Logger(DailyBriefService.name);
  private readonly CACHE_PREFIX = 'assistant:daily-brief:';
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 ساعة

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextAggregator: ContextAggregatorService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('📅 DailyBriefService initialized');
  }

  async generate(userId: string, language: string = 'ar'): Promise<DailyBrief> {
    const startTime = Date.now();
    this.logger.log(`📅 Generating daily brief for user ${userId} (lang=${language})`);

    // تحقق من cache (يتجدّد كل ساعة)
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `${this.CACHE_PREFIX}${userId}:${today}:${language}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug(`📅 Daily brief cache HIT for user ${userId}`);
        return JSON.parse(cached);
      }
    } catch {
      // cache fail — continue
    }

    // اجلب السياق الكامل
    const context = await this.contextAggregator.getContext({
      userId,
      language,
      skipCache: false,
    });

    // بيانات الأمس
    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date();
    yesterdayEnd.setHours(0, 0, 0, 0);

    const yesterdayTrades = await this.prisma.position.findMany({
      where: {
        userId,
        status: 'CLOSED',
        closedAt: { gte: yesterdayStart, lt: yesterdayEnd },
      },
      select: {
        symbol: true,
        realizedPnl: true,
        side: true,
        openedAt: true,
        closedAt: true,
      },
      orderBy: { closedAt: 'desc' },
    });

    const todayOpened = await this.prisma.position.count({
      where: {
        userId,
        openedAt: { gte: yesterdayEnd },
      },
    });

    const wins = yesterdayTrades.filter((t) => Number(t.realizedPnl) > 0);
    const losses = yesterdayTrades.filter((t) => Number(t.realizedPnl) < 0);
    const netPnl = yesterdayTrades.reduce(
      (sum, t) => sum + (Number(t.realizedPnl) || 0),
      0,
    );
    const winRate =
      yesterdayTrades.length > 0 ? (wins.length / yesterdayTrades.length) * 100 : 0;

    const best = [...yesterdayTrades].sort(
      (a, b) => Number(b.realizedPnl) - Number(a.realizedPnl),
    )[0];
    const worst = [...yesterdayTrades].sort(
      (a, b) => Number(a.realizedPnl) - Number(b.realizedPnl),
    )[0];

    // حالة اليوم
    const openPositions = context.userTrading.openPositions.length;
    const unrealizedPnl = context.userTrading.positionSummary.totalUnrealizedPnl;
    const activeBriefs = context.council.activeBriefs.length;
    const councilSentiment =
      context.council.consensusStats.bullishCount > context.council.consensusStats.bearishCount
        ? 'BULLISH'
        : context.council.consensusStats.bearishCount > context.council.consensusStats.bullishCount
        ? 'BEARISH'
        : 'NEUTRAL';

    // المخاطر
    const riskLevel = context.systemHealth.riskLevel;
    const exposurePercent = context.userTrading.positionSummary.riskExposurePercent;
    const cooldownActive = context.systemHealth.cooldownActive;

    // التوصيات
    const recommendations = this._generateRecommendations(
      yesterdayTrades.length,
      winRate,
      netPnl,
      openPositions,
      exposurePercent,
      cooldownActive,
      activeBriefs,
      language,
    );

    // watchlist: رموز ذات briefs نشطة
    const watchlist = context.council.activeBriefs
      .slice(0, 5)
      .map((b) => b.symbol);

    // greeting
    const greeting = this._generateGreeting(language, winRate, netPnl);
    const motivationalNote = this._generateMotivationalNote(language, netPnl, winRate);

    const brief: DailyBrief = {
      userId,
      date: today,
      generatedAt: new Date(),
      language,
      greeting,
      yesterdaySummary: {
        tradesOpened: 0, // سيحسبها استعلام آخر لو أردت
        tradesClosed: yesterdayTrades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: Math.round(winRate * 10) / 10,
        netPnl: Math.round(netPnl * 100) / 100,
        bestTrade: best
          ? { symbol: best.symbol, pnl: Math.round(Number(best.realizedPnl) * 100) / 100 }
          : undefined,
        worstTrade: worst
          ? { symbol: worst.symbol, pnl: Math.round(Number(worst.realizedPnl) * 100) / 100 }
          : undefined,
      },
      todaySetup: {
        openPositions,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        activeBriefs,
        councilSentiment,
        marketSentiment: context.market.marketSentiment,
      },
      riskStatus: {
        level: riskLevel,
        exposurePercent: Math.round(exposurePercent * 10) / 10,
        cooldownActive,
      },
      recommendations,
      watchlist,
      motivationalNote,
    };

    // خزّن في cache
    try {
      await this.redis.set(cacheKey, JSON.stringify(brief), this.CACHE_TTL_MS);
    } catch {
      // ignore cache errors
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `✅ Daily brief generated in ${durationMs}ms — yesterday: ${yesterdayTrades.length} trades, ${winRate}% WR`,
    );

    return brief;
  }

  private _generateGreeting(
    language: string,
    winRate: number,
    netPnl: number,
  ): string {
    const isAr = language === 'ar' || !['en', 'fr', 'es', 'de'].includes(language);

    const hour = new Date().getHours();
    let timeOfDay: string;
    if (isAr) {
      timeOfDay = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء الخير';
    } else {
      timeOfDay = hour < 12 ? 'Good morning' : 'Good afternoon';
    }

    if (isAr) {
      if (netPnl > 50) {
        return `${timeOfDay}! 🌅 يوم ممتاز — ربح ${netPnl.toFixed(0)}$ أمس (${winRate.toFixed(0)}% فوز). استمر!`;
      } else if (netPnl > 0) {
        return `${timeOfDay}! 📈 يوم إيجابي — ربح متواضع ${netPnl.toFixed(2)}$. حافظ على الزخم.`;
      } else if (netPnl < -50) {
        return `${timeOfDay}. 📉 يوم صعب أمس — خسارة ${Math.abs(netPnl).toFixed(0)}$. خذ نفسًا، كل متداول يمر بهذا.`;
      } else if (netPnl < 0) {
        return `${timeOfDay}. خسارة بسيطة ${Math.abs(netPnl).toFixed(2)}$ أمس — لا بأس، راجع وارتقِ.`;
      }
      return `${timeOfDay}! يوم بدون تداول أمس — جاهز لليوم؟`;
    }

    if (netPnl > 50) {
      return `${timeOfDay}! 🌅 Excellent day — earned $${netPnl.toFixed(0)} yesterday (${winRate.toFixed(0)}% win rate). Keep it up!`;
    } else if (netPnl > 0) {
      return `${timeOfDay}! 📈 Positive day — small gain $${netPnl.toFixed(2)}. Maintain momentum.`;
    } else if (netPnl < -50) {
      return `${timeOfDay}. 📉 Tough day — lost $${Math.abs(netPnl).toFixed(0)} yesterday. Take a breath, every trader goes through this.`;
    }
    return `${timeOfDay}! Ready for today?`;
  }

  private _generateMotivationalNote(language: string, netPnl: number, winRate: number): string {
    const isAr = language === 'ar' || !['en', 'fr', 'es', 'de'].includes(language);

    if (isAr) {
      if (netPnl > 0) {
        return 'الانضباط اليومي يصنع الفرق. استمر في خطتك. 🎯';
      }
      if (netPnl < 0 && winRate >= 50) {
        return 'نسبة الفوز جيدة لكن الخسائر أكبر من الأرباح. راجع إدارة المخاطر. 💪';
      }
      if (netPnl < 0) {
        return 'كل خسارة درس. حلّل، تعلّم، وعُد أقوى. 🔥';
      }
      return 'يوم جديد، فرص جديدة. ثق بعملية التعلّم. ⭐';
    }

    if (netPnl > 0) {
      return 'Daily discipline makes the difference. Stick to your plan. 🎯';
    }
    if (netPnl < 0) {
      return 'Every loss is a lesson. Analyze, learn, return stronger. 🔥';
    }
    return 'New day, new opportunities. Trust the learning process. ⭐';
  }

  private _generateRecommendations(
    tradesCount: number,
    winRate: number,
    netPnl: number,
    openPositions: number,
    exposurePercent: number,
    cooldownActive: boolean,
    activeBriefs: number,
    language: string,
  ): string[] {
    const isAr = language === 'ar' || !['en', 'fr', 'es', 'de'].includes(language);
    const recs: string[] = [];

    if (isAr) {
      if (cooldownActive) {
        recs.push('⏸️ النظام في وضع تبريد — انتظر قبل فتح صفقات جديدة');
      }
      if (exposurePercent > 30) {
        recs.push(`⚠️ مخاطرة عالية (${exposurePercent.toFixed(0)}%) — فكر في تقليل الصفقات`);
      }
      if (openPositions === 0 && activeBriefs > 0) {
        recs.push(`👁️ راجع ${activeBriefs} brief نشط من المجلس`);
      }
      if (openPositions === 0 && activeBriefs === 0) {
        recs.push('⏳ لا إشارات حاليًا — انتظر الفرص المناسبة');
      }
      if (openPositions >= 6) {
        recs.push(`📊 ${openPositions} صفقات مفتوحة — راقب عن كثب`);
      }
      if (winRate < 40 && tradesCount >= 3) {
        recs.push('📉 نسبة فوز منخفضة — راجع استراتيجيتك قبل الاستمرار');
      }
      if (netPnl < -50) {
        recs.push('💔 خسارة كبيرة أمس — خذ وقتًا لمراجعة الأسباب قبل التداول اليوم');
      }
      if (recs.length === 0) {
        recs.push('✅ كل شيء طبيعي — تداول بثقة وحافظ على الانضباط');
      }
    } else {
      if (cooldownActive) {
        recs.push('⏸️ System in cooldown — wait before opening new trades');
      }
      if (exposurePercent > 30) {
        recs.push(`⚠️ High risk (${exposurePercent.toFixed(0)}%) — consider reducing positions`);
      }
      if (openPositions === 0 && activeBriefs > 0) {
        recs.push(`👁️ Review ${activeBriefs} active council briefs`);
      }
      if (recs.length === 0) {
        recs.push('✅ All normal — trade with confidence and stay disciplined');
      }
    }

    return recs;
  }
}
