// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Position Intelligence Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// نظام إدارة ذكي للمراكز المفتوحة — يعيد تحليل كل مركز كل 2 دقيقة
//
// المنهجية المهنية:
//   حلل → قرر → ادخل
//             ↓
//       أعد التحليل كل 2 دقيقة
//             ↓
//       هل الفرضية ما زالت صحيحة؟
//             ↓
//       هل الزخم يضعف؟
//             ↓
//       هل تغيرت السيولة؟
//             ↓
//       هل يجب تعديل الهدف؟
//             ↓
//       هل يجب الخروج الآن؟
//
// القرارات المتاحة:
//   1. HOLD — لا تغيير (الفرضية صحيحة، الزخم قوي)
//   2. TIGHTEN_SL — شدّ SL أقرب للسعر (حماية الربح)
//   3. ADJUST_TP — قرّب TP (الزخم يضعف، خذ ربح أسرع)
//   4. EXIT_EARLY — أغلق المركز (الفرضية فشلت)
//
// الأمان:
//   - SL يتحرك فقط في اتجاه الربح (never widens loss)
//   - TP يتحرك فقط أقرب (never extends risk)
//   - كل قرار مسجّل في Redis للـ audit trail
//   - @Optional — لا يُعطّل النظام لو فشل
//   - لا تعديل على DB schema
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { TradingService } from '../../trading/trading.service';

export type PositionAction = 'HOLD' | 'TIGHTEN_SL' | 'ADJUST_TP' | 'EXIT_EARLY';

export interface PositionAnalysis {
  positionId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  action: PositionAction;
  reason: string;
  newSL?: number;
  newTP?: number;
  confidence: number; // 0-100, كم من الفرضية ما زال صحيحاً
  momentumScore: number; // -100 to +100
  analyzedAt: number;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

@Injectable()
export class PositionIntelligenceService {
  private readonly logger = new Logger('PositionIntel');
  private readonly REDIS_KEY_PREFIX = 'pos_intel:';
  private readonly CHECK_INTERVAL_MS = 2 * 60 * 1000; // كل 2 دقيقة
  private readonly ANALYSIS_TTL_MS = 10 * 60 * 1000; // 10 دقائق TTL

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly exchangeService: ExchangeService,
    @Optional() private readonly tradingService?: TradingService,
  ) {
    this.logger.log('🧠 Position Intelligence Service initialized — active position management');
  }

  /**
   * تحليل مركز مفتوح واتخاذ قرار.
   * يُستدعى من PositionMonitor كل دورة.
   *
   * BUG-064 SAFETY: Throttled to 1 analysis per 2 minutes per position.
   * The throttle is CRITICAL because analyzePosition fetches candles via
   * REST API (1-3 seconds). Without throttle, 10 open positions × 10s
   * monitor cycle = 30+ seconds per cycle → SL/TP detection delays.
   */
  async analyzePosition(position: any, currentPrice: number): Promise<PositionAnalysis | null> {
    const positionId = position.id;
    const symbol = position.symbol;
    const side = position.side as 'BUY' | 'SELL';
    const entryPrice = position.entryPrice?.toNumber?.() ?? Number(position.entryPrice);
    const stopLoss = position.stopLoss?.toNumber?.() ?? Number(position.stopLoss) ?? 0;
    const takeProfit = position.takeProfit?.toNumber?.() ?? Number(position.takeProfit) ?? 0;

    // تخطي المراكز بدون SL/TP
    if (!stopLoss || !takeProfit) return null;

    // BUG-064 CRITICAL: Throttle — لا تحلّل نفس المركز أكثر من مرة كل 2 دقيقة
    // بدون هذا، كل دورة مراقبة (10 ثوان) ستجلب شموع من REST API لكل مركز
    // → 10 مراكز × 2 ثانية = 20 ثانية تأخير في SL/TP detection
    const lastAnalysisKey = `${this.REDIS_KEY_PREFIX}last:${positionId}`;
    try {
      const lastRaw = await this.redis.get(lastAnalysisKey);
      if (lastRaw) {
        const last = JSON.parse(lastRaw);
        if (Date.now() - last.analyzedAt < this.CHECK_INTERVAL_MS) {
          // ليس وقت التحليل بعد — استخدم آخر قرار مسجّل
          // لكن تحقق: هل تغير السعر بشكل كبير منذ آخر تحليل؟
          const lastPrice = last.currentPrice || 0;
          const priceChange = lastPrice > 0 ? Math.abs(currentPrice - lastPrice) / lastPrice : 0;
          // لو السعر تحرك > 1% منذ آخر تحليل → حلّل فوراً (طوارئ)
          if (priceChange < 0.01) return null;
          this.logger.debug(`🧠 ${symbol}: Price moved ${(priceChange * 100).toFixed(2)}% since last analysis — emergency re-analysis`);
        }
      }
    } catch {}

    // جلب الشموع الأخيرة (15min, آخر 50 شمعة)
    let candles: Candle[] = [];
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 2 * 24 * 60 * 60 * 1000); // يومين
      const raw = await this.exchangeService.getHistoricalData(symbol, '15min', startDate, endDate);
      candles = raw.map((c: any) => ({
        time: Math.floor(new Date(c.timestamp).getTime() / 1000),
        open: c.open, high: c.high, low: c.low, close: c.close,
        volume: c.volume || 0,
      })).filter((c: Candle) => c.close > 0 && c.high > 0 && c.low > 0);
    } catch (err: any) {
      this.logger.warn(`🧠 Failed to fetch candles for ${symbol}: ${err?.message}`);
      return null;
    }

    if (candles.length < 20) return null;

    // ── 1. حساب المؤشرات ──
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    // EMA9 و EMA21 للزخم
    const ema9 = this._calcEMA(closes, 9);
    const ema21 = this._calcEMA(closes, 21);

    // RSI للزخم
    const rsi = this._calcRSI(closes, 14);

    // ATR للتقلب
    const atr = this._calcATR(candles, 14);

    // Volume trend
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, volumes.length);
    const volumeRatio = avgVolume > 0 ? recentVolume / avgVolume : 1;

    // ── 2. حساب النقاط ──

    // Momentum Score (-100 to +100)
    let momentumScore = 0;
    // EMA trend: EMA9 > EMA21 = bullish
    if (ema9 > ema21) momentumScore += 25; else momentumScore -= 25;
    // EMA9 slope (آخر 3 شموع)
    const ema9Slope = ema9 - this._calcEMA(closes.slice(0, -3), 9);
    if (side === 'BUY') {
      if (ema9Slope > 0) momentumScore += 20; else momentumScore -= 20;
    } else {
      if (ema9Slope < 0) momentumScore += 20; else momentumScore -= 20;
    }
    // RSI
    if (side === 'BUY') {
      if (rsi > 50 && rsi < 70) momentumScore += 15;
      else if (rsi >= 70) momentumScore -= 10; // تشبع شرائي
      else if (rsi < 30) momentumScore += 10; // فرصة شراء
      else momentumScore -= 10;
    } else {
      if (rsi < 50 && rsi > 30) momentumScore += 15;
      else if (rsi <= 30) momentumScore -= 10; // تشبع بيعي
      else if (rsi > 70) momentumScore += 10; // فرصة بيع
      else momentumScore -= 10;
    }
    // Volume
    if (volumeRatio > 1.2) momentumScore += 15; // سيولة قوية
    else if (volumeRatio < 0.6) momentumScore -= 20; // سيولة ضعيفة
    else momentumScore += 0;

    // ATR relative to price (تقلب)
    const atrPercent = atr / currentPrice;

    // ── 3. حساب التقدم نحو TP ──
    const tpDistance = Math.abs(takeProfit - entryPrice);
    const slDistance = Math.abs(entryPrice - stopLoss);
    const currentProgress = side === 'BUY'
      ? (currentPrice - entryPrice) / tpDistance
      : (entryPrice - currentPrice) / tpDistance;
    // currentProgress: 0 = at entry, 1 = at TP, negative = losing

    // ── 4. هل الفرضية ما زالت صحيحة؟ ──
    // الفرضية صحيحة إذا: الزخم في نفس اتجاه الصفقة
    const isMomentumAligned = side === 'BUY'
      ? momentumScore > 0
      : momentumScore < 0;

    // ── 5. اتخاذ القرار ──
    let action: PositionAction = 'HOLD';
    let reason = 'الفرضية صحيحة، الزخم قوي';
    let newSL: number | undefined;
    let newTP: number | undefined;
    let confidence = Math.abs(momentumScore); // 0-100ish

    // القرار 1: EXIT_EARLY — الفرضية فشلت
    // لو الزخم معاكس بقوة AND المركز في خسارة
    if (!isMomentumAligned && momentumScore < -40 && currentProgress < 0) {
      action = 'EXIT_EARLY';
      reason = `الفرضية فشلت — الزخم معاكس (${momentumScore.toFixed(0)}) والمركز في خسارة`;
      confidence = 100 - Math.abs(momentumScore);
    }
    // القرار 2: EXIT_EARLY — RSI متطرف معاكس
    else if (side === 'BUY' && rsi > 75 && currentProgress > 0.3) {
      action = 'EXIT_EARLY';
      reason = `تشبع شرائي (RSI=${rsi.toFixed(0)}) — خذ الربح قبل الارتداد`;
      confidence = 70;
    }
    else if (side === 'SELL' && rsi < 25 && currentProgress > 0.3) {
      action = 'EXIT_EARLY';
      reason = `تشبع بيعي (RSI=${rsi.toFixed(0)}) — خذ الربح قبل الارتداد`;
      confidence = 70;
    }
    // القرار 3: TIGHTEN_SL — الزخم يضعف لكن الفرضية صحيحة
    else if (isMomentumAligned && Math.abs(momentumScore) < 20 && currentProgress > 0.3) {
      // شدّ SL لنصف المسافة بين الحالي والـ entry
      const tightenSL = side === 'BUY'
        ? entryPrice + (currentPrice - entryPrice) * 0.5
        : entryPrice - (entryPrice - currentPrice) * 0.5;

      // تحقق أن SL الجديد أفضل من الحالي
      const shouldMove = side === 'BUY'
        ? tightenSL > stopLoss
        : tightenSL < stopLoss;

      if (shouldMove) {
        action = 'TIGHTEN_SL';
        newSL = tightenSL;
        reason = `الزخم يضعف (${momentumScore.toFixed(0)}) — شدّ SL لحماية الربح`;
        confidence = 60;
      }
    }
    // القرار 4: ADJUST_TP — الزخم قوي جداً، قرّب TP
    else if (isMomentumAligned && Math.abs(momentumScore) > 50 && currentProgress > 0.5) {
      // قرّب TP بنسبة 20%
      const adjustedTP = side === 'BUY'
        ? entryPrice + tpDistance * 0.8
        : entryPrice - tpDistance * 0.8;

      // تحقق أن TP الجديد أقرب (أقل مخاطرة)
      const shouldMove = side === 'BUY'
        ? adjustedTP < takeProfit
        : adjustedTP > takeProfit;

      if (shouldMove) {
        action = 'ADJUST_TP';
        newTP = adjustedTP;
        reason = `الزخم قوي (${momentumScore.toFixed(0)}) لكن TP بعيد — قرّبه لـ80%`;
        confidence = 75;
      }
    }
    // القرار 5: HOLD — كل شيء جيد
    else {
      action = 'HOLD';
      if (isMomentumAligned) {
        reason = `الفرضية صحيحة — الزخم ${side === 'BUY' ? 'صعودي' : 'هبوطي'} (${momentumScore.toFixed(0)})، RSI=${rsi.toFixed(0)}`;
      } else {
        reason = `الزخم محايد (${momentumScore.toFixed(0)}) — مراقبة`;
      }
    }

    const analysis: PositionAnalysis = {
      positionId, symbol, side, action, reason,
      newSL, newTP, confidence, momentumScore,
      analyzedAt: Date.now(),
    };

    // سجّل التحليل في Redis (مع currentPrice للـ emergency re-analysis)
    try {
      await this.redis.set(
        lastAnalysisKey,
        JSON.stringify({ ...analysis, currentPrice }),
        this.ANALYSIS_TTL_MS,
      );
    } catch {}

    // سجّل في audit trail
    if (action !== 'HOLD') {
      this.logger.log(
        `🧠 Position Intel: ${symbol} ${side} → ${action} | ${reason} | ` +
        `progress=${(currentProgress * 100).toFixed(0)}% | momentum=${momentumScore.toFixed(0)} | ` +
        `RSI=${rsi.toFixed(0)} | vol×${volumeRatio.toFixed(1)} | ATR=${(atrPercent * 100).toFixed(2)}%`,
      );
    } else {
      this.logger.debug(
        `🧠 Position Intel: ${symbol} ${side} → HOLD | ${reason} | progress=${(currentProgress * 100).toFixed(0)}%`,
      );
    }

    return analysis;
  }

  /**
   * تنفيذ قرار إدارة المركز.
   * يُستدعى من PositionMonitor بعد analyzePosition.
   */
  async executeDecision(
    analysis: PositionAnalysis,
    position: any,
  ): Promise<boolean> {
    const { action, positionId, symbol } = analysis;

    if (action === 'HOLD') return true;

    try {
      // EXIT_EARLY: أغلق المركز كلياً
      if (action === 'EXIT_EARLY' && this.tradingService) {
        const currentPrice = position.currentPrice?.toNumber?.() ?? Number(position.currentPrice);
        await this.tradingService.closePosition(position.userId, {
          positionId: position.id,
          closeReason: `INTEL_EXIT: ${analysis.reason.substring(0, 60)}`,
          source: 'position_intelligence',
        } as any);
        this.logger.log(`🧠 EXIT_EARLY executed: ${symbol} — ${analysis.reason}`);
        return true;
      }

      // TIGHTEN_SL: حدّث SL فقط
      if (action === 'TIGHTEN_SL' && analysis.newSL) {
        const stillOpen = await this.prisma.position.findFirst({
          where: { id: positionId, status: 'OPEN' },
          select: { id: true, stopLoss: true },
        });
        if (!stillOpen) return false;

        const currentSL = stillOpen.stopLoss?.toNumber?.() ?? Number(stillOpen.stopLoss);
        const side = position.side;
        const shouldMove = side === 'BUY'
          ? !currentSL || analysis.newSL > currentSL
          : !currentSL || analysis.newSL < currentSL;

        if (shouldMove) {
          await this.prisma.position.update({
            where: { id: positionId },
            data: { stopLoss: analysis.newSL },
          });
          this.logger.log(`🧠 TIGHTEN_SL executed: ${symbol} SL → ${analysis.newSL.toFixed(5)}`);
        }
        return true;
      }

      // ADJUST_TP: حدّث TP فقط
      if (action === 'ADJUST_TP' && analysis.newTP) {
        const stillOpen = await this.prisma.position.findFirst({
          where: { id: positionId, status: 'OPEN' },
          select: { id: true, takeProfit: true },
        });
        if (!stillOpen) return false;

        const currentTP = stillOpen.takeProfit?.toNumber?.() ?? Number(stillOpen.takeProfit);
        const side = position.side;
        // TP يتحرك فقط أقرب (تقليل المخاطرة)
        const shouldMove = side === 'BUY'
          ? analysis.newTP < currentTP
          : analysis.newTP > currentTP;

        if (shouldMove) {
          await this.prisma.position.update({
            where: { id: positionId },
            data: { takeProfit: analysis.newTP },
          });
          this.logger.log(`🧠 ADJUST_TP executed: ${symbol} TP → ${analysis.newTP.toFixed(5)}`);
        }
        return true;
      }

      return true;
    } catch (err: any) {
      this.logger.error(`🧠 Decision execution failed for ${symbol}: ${err?.message}`);
      return false;
    }
  }

  // ══════════════════════════════════════════
  // Technical Indicators
  // ══════════════════════════════════════════

  private _calcEMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1] || 0;
    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }

  private _calcRSI(closes: number[], period: number = 14): number {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private _calcATR(candles: Candle[], period: number = 14): number {
    if (candles.length < 2) return 0;
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close),
      );
      trs.push(tr);
    }
    const slice = trs.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length);
  }
}
