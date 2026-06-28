// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Pattern Detection Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "العيّن الإحصائي" — يكتشف الأنماط الخفية في تداول المستخدم
//
// الميزات:
//   1. أنماط زمنية (أيام/ساعات/أشهر أفضل وأسوأ)
//   2. أنماط الرموز (أفضل/أسوأ أزواج)
//   3. أنماط الاتجاه (BUY vs SELL)
//   4. أنماط المصدر (agent vs smart_executor vs manual)
//   5. أنماط الإجماع (هل يربح أكثر عند توافق المجلس؟)
//   6. أنماط المدة (مدة الصفقة الرابحة vs الخاسرة)
//   7. أنماط الموقف السوقي (Bull vs Bear vs Range)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface Pattern {
  type: 'TIME' | 'SYMBOL' | 'DIRECTION' | 'SOURCE' | 'CONSENSUS' | 'DURATION' | 'REGIME';
  name: string;
  description: string;
  confidence: number; // 0-100
  evidence: {
    metric: string;
    value: string;
  }[];
  insight: string;
  actionable: boolean;
}

export interface PatternReport {
  userId: string;
  generatedAt: Date;
  analysisPeriod: { from: Date; to: Date; days: number };
  totalTradesAnalyzed: number;
  patterns: Pattern[];
  topStrength: Pattern | null;
  topWeakness: Pattern | null;
  summary: string;
}

@Injectable()
export class PatternDetectionService {
  private readonly logger = new Logger(PatternDetectionService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('🔍 PatternDetectionService initialized');
  }

  /**
   * RC-4: يحوّل UTC timestamp إلى التوقيت المحلي للمستخدم
   * @param dateUtc التاريخ بـ UTC
   * @param userTimezone timezone IANA (مثل 'Asia/Dubai', 'Europe/Berlin')
   * @returns التاريخ المحلي
   */
  private _toUserLocalTime(dateUtc: Date, userTimezone?: string): Date {
    if (!userTimezone) return dateUtc; // fallback: استخدم UTC (السلوك السابق)
    try {
      // استخدم Intl.DateTimeFormat لتحويل UTC → local time
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
      return dateUtc; // timezone غير صالح → fallback UTC
    }
  }

  /**
   * RC-5: حساب Wilson score interval lower bound للثقة الإحصائية
   * الصيغة السابقة (50 + wins * 10) كانت تعطي ثقة أعلى لعينات أصغر — عكس المنطق.
   * Wilson: ثقة تنخفض مع العينات الصغيرة (مثلاً 5/5 = 48% لا 95%).
   * @param successes عدد النجاحات (wins)
   * @param total إجمالي العينة
   * @param z Z-score (1.96 لـ 95% CI, 1.44 لـ 85% CI)
   * @returns قيمة بين 0-100 تمثل الثقة الإحصائية
   */
  private _wilsonConfidence(successes: number, total: number, z: number = 1.96): number {
    if (total === 0) return 0;
    const p = successes / total;
    const n = total;
    const z2 = z * z;
    const denominator = 1 + z2 / n;
    const numerator = p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    // النتيجة lower bound (0-1) → حوّل لنسبة مئوية (0-100)
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
  }

  async detect(userId: string, days: number = 60, userTimezone?: string): Promise<PatternReport> {
    const startTime = Date.now();
    this.logger.log(`🔍 Detecting patterns for user ${userId} (${days} days, tz=${userTimezone || 'UTC'})`);

    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const positions = await this.prisma.position.findMany({
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
        realizedPnl: true,
        openedAt: true,
        closedAt: true,
        source: true,
        closeReason: true,
      },
      orderBy: { closedAt: 'desc' },
    });

    const journals = await this.prisma.tradeJournal.findMany({
      where: {
        userId,
        createdAt: { gte: from, lte: to },
      },
      select: {
        symbol: true,
        side: true,
        pnl: true,
        result: true,
        councilVotes: true,
        consensusScore: true,
        regimeAtEntry: true,
        source: true,
        openedAt: true,
      },
    });

    const patterns: Pattern[] = [];

    // RC-4: مرر userTimezone لـ _detectTimePatterns لاستخدام التوقيت المحلي
    patterns.push(...this._detectTimePatterns(positions, userTimezone));
    patterns.push(...this._detectSymbolPatterns(positions));
    patterns.push(...this._detectDirectionPatterns(positions));
    patterns.push(...this._detectSourcePatterns(positions));
    patterns.push(...this._detectConsensusPatterns(journals));
    patterns.push(...this._detectDurationPatterns(positions));
    patterns.push(...this._detectRegimePatterns(journals));

    // حدّد أعلى قوة وأعلى ضعف
    const sorted = patterns.sort((a, b) => b.confidence - a.confidence);
    const positive = sorted.filter((p) => p.insight.includes('أفضل') || p.insight.includes('مربح') || p.insight.includes('ناجح'));
    const negative = sorted.filter((p) => p.insight.includes('أسوأ') || p.insight.includes('خاسر') || p.insight.includes('ضعيف'));

    const topStrength = positive[0] ?? null;
    const topWeakness = negative[0] ?? null;

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `✅ Pattern detection complete in ${durationMs}ms — ${patterns.length} patterns found`,
    );

    return {
      userId,
      generatedAt: new Date(),
      analysisPeriod: { from, to, days },
      totalTradesAnalyzed: positions.length,
      patterns: sorted,
      topStrength,
      topWeakness,
      summary: this._generateSummary(patterns, positions.length),
    };
  }

  // ─── Time Patterns ──────────────────────────────────────────

  private _detectTimePatterns(positions: any[], userTimezone?: string): Pattern[] {
    const patterns: Pattern[] = [];
    if (positions.length < 5) return patterns;

    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const byDay: Record<number, { wins: number; losses: number; pnl: number }> = {};

    for (const p of positions) {
      // RC-4: استخدم التوقيت المحلي للمستخدم بدل UTC
      const localDate = this._toUserLocalTime(new Date(p.openedAt), userTimezone);
      const day = localDate.getDay();
      if (!byDay[day]) byDay[day] = { wins: 0, losses: 0, pnl: 0 };
      if (Number(p.realizedPnl) > 0) byDay[day].wins++;
      else if (Number(p.realizedPnl) < 0) byDay[day].losses++;
      byDay[day].pnl += Number(p.realizedPnl) || 0;
    }

    // أفضل يوم
    let bestDay = -1;
    let bestPnl = -Infinity;
    for (const [day, stats] of Object.entries(byDay)) {
      const total = stats.wins + stats.losses;
      if (total >= 2 && stats.pnl > bestPnl) {
        bestPnl = stats.pnl;
        bestDay = Number(day);
      }
    }

    if (bestDay >= 0 && bestPnl > 20) {
      const stats = byDay[bestDay];
      patterns.push({
        type: 'TIME',
        name: `أفضل يوم: ${dayNames[bestDay]}`,
        description: `تداولات يوم ${dayNames[bestDay]} هي الأكثر ربحًا`,
        // RC-5: استخدم Wilson score بدل 50+wins*10 (كان يعطي ثقة أعلى لعينات أصغر)
        confidence: this._wilsonConfidence(stats.wins, stats.wins + stats.losses, 1.96),
        evidence: [
          { metric: 'الفوز', value: `${stats.wins}` },
          { metric: 'الخسارة', value: `${stats.losses}` },
          { metric: 'PnL', value: `${stats.pnl.toFixed(2)}$` },
        ],
        insight: `أفضل يوم للتداول هو ${dayNames[bestDay]} — ركّز عليه`,
        actionable: true,
      });
    }

    // أسوأ يوم
    let worstDay = -1;
    let worstPnl = Infinity;
    for (const [day, stats] of Object.entries(byDay)) {
      const total = stats.wins + stats.losses;
      if (total >= 2 && stats.pnl < worstPnl) {
        worstPnl = stats.pnl;
        worstDay = Number(day);
      }
    }

    if (worstDay >= 0 && worstPnl < -20) {
      const stats = byDay[worstDay];
      patterns.push({
        type: 'TIME',
        name: `أسوأ يوم: ${dayNames[worstDay]}`,
        description: `تداولات يوم ${dayNames[worstDay]} خاسرة`,
        // RC-5: استخدم Wilson score لثقة إحصائية صحيحة
        confidence: this._wilsonConfidence(stats.losses, stats.wins + stats.losses, 1.96),
        evidence: [
          { metric: 'الفوز', value: `${stats.wins}` },
          { metric: 'الخسارة', value: `${stats.losses}` },
          { metric: 'PnL', value: `${stats.pnl.toFixed(2)}$` },
        ],
        insight: `تجنّب التداول يوم ${dayNames[worstDay]}`,
        actionable: true,
      });
    }

    // أفضل ساعة
    const byHour: Record<number, { wins: number; losses: number; pnl: number }> = {};
    for (const p of positions) {
      const hour = new Date(p.openedAt).getHours();
      if (!byHour[hour]) byHour[hour] = { wins: 0, losses: 0, pnl: 0 };
      if (Number(p.realizedPnl) > 0) byHour[hour].wins++;
      else if (Number(p.realizedPnl) < 0) byHour[hour].losses++;
      byHour[hour].pnl += Number(p.realizedPnl) || 0;
    }

    let bestHour = -1;
    let bestHourPnl = -Infinity;
    for (const [hour, stats] of Object.entries(byHour)) {
      const total = stats.wins + stats.losses;
      if (total >= 3 && stats.pnl > bestHourPnl) {
        bestHourPnl = stats.pnl;
        bestHour = Number(hour);
      }
    }

    if (bestHour >= 0 && bestHourPnl > 30) {
      patterns.push({
        type: 'TIME',
        name: `أفضل ساعة: ${bestHour}:00`,
        description: `التداول في ساعة ${bestHour}:00 أكثر ربحًا`,
        confidence: 70,
        evidence: [
          { metric: 'الفوز', value: `${byHour[bestHour].wins}` },
          { metric: 'PnL', value: `${bestHourPnl.toFixed(2)}$` },
        ],
        insight: `ساعة ${bestHour}:00 توقيت ممتاز للدخول`,
        actionable: true,
      });
    }

    return patterns;
  }

  // ─── Symbol Patterns ────────────────────────────────────────

  private _detectSymbolPatterns(positions: any[]): Pattern[] {
    const patterns: Pattern[] = [];
    if (positions.length < 5) return patterns;

    const bySymbol: Record<string, { wins: number; losses: number; pnl: number; total: number }> = {};

    for (const p of positions) {
      if (!bySymbol[p.symbol]) bySymbol[p.symbol] = { wins: 0, losses: 0, pnl: 0, total: 0 };
      bySymbol[p.symbol].total++;
      if (Number(p.realizedPnl) > 0) bySymbol[p.symbol].wins++;
      else if (Number(p.realizedPnl) < 0) bySymbol[p.symbol].losses++;
      bySymbol[p.symbol].pnl += Number(p.realizedPnl) || 0;
    }

    // أفضل رمز
    const symbolEntries = Object.entries(bySymbol).filter(([_, s]) => s.total >= 3);
    if (symbolEntries.length > 0) {
      const best = symbolEntries.sort((a, b) => b[1].pnl - a[1].pnl)[0];
      if (best[1].pnl > 30) {
        patterns.push({
          type: 'SYMBOL',
          name: `أفضل رمز: ${best[0]}`,
          description: `${best[0]} يحقّق أفضل أداء`,
          // RC-5: استخدم Wilson score
          confidence: this._wilsonConfidence(best[1].wins, best[1].wins + best[1].losses, 1.44),
          evidence: [
            { metric: 'صفقات', value: `${best[1].total}` },
            { metric: 'Win Rate', value: `${Math.round((best[1].wins / best[1].total) * 100)}%` },
            { metric: 'PnL', value: `${best[1].pnl.toFixed(2)}$` },
          ],
          insight: `${best[0]} نقطة قوتك — ركّز عليه`,
          actionable: true,
        });
      }

      const worst = symbolEntries.sort((a, b) => a[1].pnl - b[1].pnl)[0];
      if (worst[1].pnl < -30) {
        patterns.push({
          type: 'SYMBOL',
          name: `أسوأ رمز: ${worst[0]}`,
          description: `${worst[0]} خاسر بشكل متكرر`,
          // RC-5: استخدم Wilson score
          confidence: this._wilsonConfidence(worst[1].losses, worst[1].wins + worst[1].losses, 1.44),
          evidence: [
            { metric: 'صفقات', value: `${worst[1].total}` },
            { metric: 'Win Rate', value: `${Math.round((worst[1].wins / worst[1].total) * 100)}%` },
            { metric: 'PnL', value: `${worst[1].pnl.toFixed(2)}$` },
          ],
          insight: `${worst[0]} ضعفك — أوقِفه أو راجع إعداداته`,
          actionable: true,
        });
      }
    }

    return patterns;
  }

  // ─── Direction Patterns ─────────────────────────────────────

  private _detectDirectionPatterns(positions: any[]): Pattern[] {
    const patterns: Pattern[] = [];
    if (positions.length < 8) return patterns;

    const buys = positions.filter((p) => p.side === 'BUY');
    const sells = positions.filter((p) => p.side === 'SELL');

    const buyWins = buys.filter((p) => Number(p.realizedPnl) > 0);
    const sellWins = sells.filter((p) => Number(p.realizedPnl) > 0);

    const buyWinRate = buys.length > 0 ? (buyWins.length / buys.length) * 100 : 0;
    const sellWinRate = sells.length > 0 ? (sellWins.length / sells.length) * 100 : 0;
    const buyPnl = buys.reduce((s, p) => s + Number(p.realizedPnl || 0), 0);
    const sellPnl = sells.reduce((s, p) => s + Number(p.realizedPnl || 0), 0);

    if (buys.length >= 3 && sells.length >= 3) {
      if (buyWinRate > sellWinRate + 20) {
        patterns.push({
          type: 'DIRECTION',
          name: 'تفوّق صفقات BUY',
          description: `BUY (${buyWinRate.toFixed(0)}%) أفضل بكثير من SELL (${sellWinRate.toFixed(0)}%)`,
          confidence: 75,
          evidence: [
            { metric: 'BUY WR', value: `${buyWinRate.toFixed(0)}% (${buyWins.length}/${buys.length})` },
            { metric: 'SELL WR', value: `${sellWinRate.toFixed(0)}% (${sellWins.length}/${sells.length})` },
            { metric: 'BUY PnL', value: `${buyPnl.toFixed(2)}$` },
            { metric: 'SELL PnL', value: `${sellPnl.toFixed(2)}$` },
          ],
          insight: 'استراتيجيتك BUY أقوى — ركّز عليها',
          actionable: true,
        });
      } else if (sellWinRate > buyWinRate + 20) {
        patterns.push({
          type: 'DIRECTION',
          name: 'تفوّق صفقات SELL',
          description: `SELL (${sellWinRate.toFixed(0)}%) أفضل بكثير من BUY (${buyWinRate.toFixed(0)}%)`,
          confidence: 75,
          evidence: [
            { metric: 'SELL WR', value: `${sellWinRate.toFixed(0)}%` },
            { metric: 'BUY WR', value: `${buyWinRate.toFixed(0)}%` },
            { metric: 'SELL PnL', value: `${sellPnl.toFixed(2)}$` },
          ],
          insight: 'استراتيجيتك SELL أقوى — ركّز عليها',
          actionable: true,
        });
      }
    }

    return patterns;
  }

  // ─── Source Patterns ────────────────────────────────────────

  private _detectSourcePatterns(positions: any[]): Pattern[] {
    const patterns: Pattern[] = [];
    if (positions.length < 8) return patterns;

    const bySource: Record<string, { wins: number; losses: number; pnl: number; total: number }> = {};

    for (const p of positions) {
      const source = p.source || 'unknown';
      if (!bySource[source]) bySource[source] = { wins: 0, losses: 0, pnl: 0, total: 0 };
      bySource[source].total++;
      if (Number(p.realizedPnl) > 0) bySource[source].wins++;
      else if (Number(p.realizedPnl) < 0) bySource[source].losses++;
      bySource[source].pnl += Number(p.realizedPnl) || 0;
    }

    const sourceLabels: Record<string, string> = {
      agent: 'الوكيل الذكي',
      smart_executor: 'المنفذ الذكي',
      user_manual: 'تداول يدوي',
      council: 'المجلس',
      auto_paper: 'تلقائي (ورقي)',
    };

    for (const [source, stats] of Object.entries(bySource)) {
      if (stats.total < 3) continue;
      const winRate = (stats.wins / stats.total) * 100;
      const label = sourceLabels[source] ?? source;

      if (winRate >= 60 && stats.pnl > 0) {
        patterns.push({
          type: 'SOURCE',
          name: `${label} ناجح`,
          description: `صفقات ${label} تحقق ${winRate.toFixed(0)}% فوز`,
          // RC-5: استخدم Wilson score
          confidence: this._wilsonConfidence(stats.wins, stats.wins + stats.losses, 1.44),
          evidence: [
            { metric: 'صفقات', value: `${stats.total}` },
            { metric: 'Win Rate', value: `${winRate.toFixed(0)}%` },
            { metric: 'PnL', value: `${stats.pnl.toFixed(2)}$` },
          ],
          insight: `${label} مصدر مربح — اتركه يعمل`,
          actionable: false,
        });
      } else if (winRate < 40 && stats.pnl < -30) {
        patterns.push({
          type: 'SOURCE',
          name: `${label} خاسر`,
          description: `صفقات ${label} تحقق فقط ${winRate.toFixed(0)}% فوز`,
          // RC-5: استخدم Wilson score
          confidence: this._wilsonConfidence(stats.losses, stats.wins + stats.losses, 1.44),
          evidence: [
            { metric: 'صفقات', value: `${stats.total}` },
            { metric: 'Win Rate', value: `${winRate.toFixed(0)}%` },
            { metric: 'PnL', value: `${stats.pnl.toFixed(2)}$` },
          ],
          insight: `${label} يخسر — راجع إعداداته أو أوقفه`,
          actionable: true,
        });
      }
    }

    return patterns;
  }

  // ─── Consensus Patterns ─────────────────────────────────────

  private _detectConsensusPatterns(journals: any[]): Pattern[] {
    const patterns: Pattern[] = [];
    if (journals.length < 8) return patterns;

    // هل يربح أكثر عند توافق المجلس (consensusScore > 70)?
    const highConsensus = journals.filter((j) => Number(j.consensusScore) >= 70);
    const lowConsensus = journals.filter((j) => Number(j.consensusScore) < 50);

    const highWins = highConsensus.filter((j) => j.result === 'WIN');
    const lowWins = lowConsensus.filter((j) => j.result === 'WIN');

    if (highConsensus.length >= 3 && lowConsensus.length >= 3) {
      const highWinRate = (highWins.length / highConsensus.length) * 100;
      const lowWinRate = (lowWins.length / lowConsensus.length) * 100;

      if (highWinRate > lowWinRate + 20) {
        patterns.push({
          type: 'CONSENSUS',
          name: 'التوافق العالي = ربح أكبر',
          description: `عند consensusScore ≥ 70: ${highWinRate.toFixed(0)}% فوز، أما < 50: ${lowWinRate.toFixed(0)}% فقط`,
          confidence: 80,
          evidence: [
            { metric: 'توافق عالي', value: `${highWinRate.toFixed(0)}% (${highWins.length}/${highConsensus.length})` },
            { metric: 'توافق منخفض', value: `${lowWinRate.toFixed(0)}% (${lowWins.length}/${lowConsensus.length})` },
          ],
          insight: 'تجارة فقط عند توافق ≥ 70% — تجاهل الإشارات الضعيفة',
          actionable: true,
        });
      }
    }

    return patterns;
  }

  // ─── Duration Patterns ──────────────────────────────────────

  private _detectDurationPatterns(positions: any[]): Pattern[] {
    const patterns: Pattern[] = [];
    if (positions.length < 8) return patterns;

    const withDuration = positions
      .filter((p) => p.closedAt)
      .map((p) => ({
        ...p,
        durationMs: new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime(),
      }));

    const wins = withDuration.filter((p) => Number(p.realizedPnl) > 0);
    const losses = withDuration.filter((p) => Number(p.realizedPnl) < 0);

    if (wins.length >= 3 && losses.length >= 3) {
      const avgWinDuration = wins.reduce((s, p) => s + p.durationMs, 0) / wins.length;
      const avgLossDuration = losses.reduce((s, p) => s + p.durationMs, 0) / losses.length;

      const winMinutes = Math.round(avgWinDuration / 60000);
      const lossMinutes = Math.round(avgLossDuration / 60000);

      if (winMinutes > lossMinutes * 2 && winMinutes > 60) {
        patterns.push({
          type: 'DURATION',
          name: 'الصبر يربح',
          description: `الصفقات الرابحة تستمر ${winMinutes} دقيقة، الخاسرة ${lossMinutes} دقيقة فقط`,
          confidence: 70,
          evidence: [
            { metric: 'مدة الرابحة', value: `${winMinutes} دقيقة` },
            { metric: 'مدة الخاسرة', value: `${lossMinutes} دقيقة` },
          ],
          insight: 'اصبر على الصفقات الرابحة — اتركها تنمو',
          actionable: true,
        });
      } else if (lossMinutes > winMinutes * 2 && lossMinutes > 120) {
        patterns.push({
          type: 'DURATION',
          name: 'تعلّق بالخاسرة',
          description: `الصفقات الخاسرة تستمر ${lossMinutes} دقيقة — طويل جدًا`,
          confidence: 75,
          evidence: [
            { metric: 'مدة الخاسرة', value: `${lossMinutes} دقيقة` },
            { metric: 'مدة الرابحة', value: `${winMinutes} دقيقة` },
          ],
          insight: 'أغلق الخاسرة مبكرًا — لا تنتظر تهرّبًا',
          actionable: true,
        });
      }
    }

    return patterns;
  }

  // ─── Regime Patterns ────────────────────────────────────────

  private _detectRegimePatterns(journals: any[]): Pattern[] {
    const patterns: Pattern[] = [];
    if (journals.length < 8) return patterns;

    const byRegime: Record<string, { wins: number; losses: number; total: number; pnl: number }> = {};

    for (const j of journals) {
      const regime = j.regimeAtEntry || 'UNKNOWN';
      if (!byRegime[regime]) byRegime[regime] = { wins: 0, losses: 0, total: 0, pnl: 0 };
      byRegime[regime].total++;
      if (j.result === 'WIN') byRegime[regime].wins++;
      else if (j.result === 'LOSS') byRegime[regime].losses++;
      byRegime[regime].pnl += Number(j.pnl) || 0;
    }

    const regimeLabels: Record<string, string> = {
      BULL: 'صعودي',
      BEAR: 'هبوطي',
      RANGE: 'عرضي',
      VOLATILE: 'متقلّب',
      UNKNOWN: 'غير معروف',
    };

    for (const [regime, stats] of Object.entries(byRegime)) {
      if (stats.total < 3) continue;
      const winRate = (stats.wins / stats.total) * 100;
      const label = regimeLabels[regime] ?? regime;

      if (winRate >= 60 && stats.pnl > 0) {
        patterns.push({
          type: 'REGIME',
          name: `أداء ممتاز في السوق ${label}`,
          description: `في السوق ${label}: ${winRate.toFixed(0)}% فوز`,
          confidence: 75,
          evidence: [
            { metric: 'صفقات', value: `${stats.total}` },
            { metric: 'Win Rate', value: `${winRate.toFixed(0)}%` },
            { metric: 'PnL', value: `${stats.pnl.toFixed(2)}$` },
          ],
          insight: `استراتيجيتك تناسب السوق ${label} — كرّرها في نفس الظروف`,
          actionable: true,
        });
      } else if (winRate < 40 && stats.pnl < -30) {
        patterns.push({
          type: 'REGIME',
          name: `ضعف في السوق ${label}`,
          description: `في السوق ${label}: فقط ${winRate.toFixed(0)}% فوز`,
          confidence: 75,
          evidence: [
            { metric: 'صفقات', value: `${stats.total}` },
            { metric: 'Win Rate', value: `${winRate.toFixed(0)}%` },
          ],
          insight: `استراتيجيتك لا تناسب السوق ${label} — قلّل التداول في هذه الظروف`,
          actionable: true,
        });
      }
    }

    return patterns;
  }

  // ─── Summary ────────────────────────────────────────────────

  private _generateSummary(patterns: Pattern[], totalTrades: number): string {
    if (patterns.length === 0) {
      return `لم نجد أنماطًا واضحة بعد (${totalTrades} صفقة محلّلة). تحتاج المزيد من البيانات.`;
    }

    const actionable = patterns.filter((p) => p.actionable).length;
    const parts: string[] = [
      `اكتشفنا ${patterns.length} نمط (${actionable} قابل للتنفيذ) من ${totalTrades} صفقة محلّلة.`,
    ];

    return parts.join(' ');
  }
}
