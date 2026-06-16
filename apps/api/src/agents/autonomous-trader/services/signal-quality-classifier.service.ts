// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Signal Quality Classifier
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V-PHASE4: نموذج تصنيف جودة الإشارة
//
// يقيّم كل إشارة تداول عبر أبعاد متعددة ويعطي درجة جودة شاملة.
// هذا يساعد في تصفية الإشارات الضعيفة وتحسين نسبة الأرباح.
//
// أبعاد التقييم (6 أبعاد × وزن):
// ┌────────────────────────────────────────────────────────────────┐
// │ 1. توافق الاتجاه (30%)  — هل الإشارة مع الاتجاه العام؟     │
// │ 2. قوة المؤشرات (25%)   — كم مؤشر فني يدعم الإشارة؟        │
// │ 3. تأكيد MTF (20%)      — هل الأطر الزمنية العليا توافق؟    │
// │ 4. جودة السوق (10%)     — سيولة + فروق سعرية ضيقة          │
// │ 5. إدارة المخاطر (10%)  — نسبة R:R + مسافة وقف الخسارة     │
// │ 6. أداء تاريخي (5%)     — نسبة فوز الاستراتيجية سابقاً      │
// └────────────────────────────────────────────────────────────────┘
//
// درجة الجودة: A+ (95-100) → F (<30)
// - A/A+: تنفيذ فوري بأحجام كاملة
// - B: تنفيذ مع حجم مخفض 80%
// - C: تنفيذ مع حجم مخفض 50%
// - D: تنفيذ مع حجم مخفض 25% (فقط إذا كانت الثقة عالية)
// - F: رفض الإشارة

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import {
  MarketAnalysis,
  EvaluatedSignal,
} from '../types/agent.types';

// ── Types ──

export type QualityGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface SignalQualityDimensions {
  /** هل الإشارة مع الاتجاه العام؟ (0-100) */
  trendAlignment: number;
  /** كم مؤشر فني يدعم الإشارة؟ (0-100) */
  indicatorStrength: number;
  /** هل الأطر الزمنية العليا توافق؟ (0-100) */
  mtfConfirmation: number;
  /** سيولة + فروق سعرية (0-100) */
  marketQuality: number;
  /** نسبة R:R + مسافة SL (0-100) */
  riskQuality: number;
  /** أداء الاستراتيجية التاريخي (0-100) */
  historicalPerformance: number;
}

export interface SignalQualityAssessment {
  /** Overall quality score (0-100) */
  qualityScore: number;
  /** Quality grade */
  grade: QualityGrade;
  /** Per-dimension scores */
  dimensions: SignalQualityDimensions;
  /** Recommended position size multiplier (0.0-1.0) */
  sizeMultiplier: number;
  /** Whether to execute this signal */
  shouldExecute: boolean;
  /** Reasoning for the quality assessment */
  reasoning: string[];
  /** Timestamp */
  assessedAt: Date;
}

@Injectable()
export class SignalQualityClassifierService {
  private readonly logger = new Logger(SignalQualityClassifierService.name);

  /** Dimension weights */
  private static readonly WEIGHTS = {
    trendAlignment: 0.30,
    indicatorStrength: 0.25,
    mtfConfirmation: 0.20,
    marketQuality: 0.10,
    riskQuality: 0.10,
    historicalPerformance: 0.05,
  };

  /** Grade thresholds */
  private static readonly GRADE_THRESHOLDS: Array<{ min: number; grade: QualityGrade; sizeMultiplier: number }> = [
    { min: 95, grade: 'A+', sizeMultiplier: 1.0 },
    { min: 85, grade: 'A',  sizeMultiplier: 1.0 },
    { min: 70, grade: 'B',  sizeMultiplier: 0.8 },
    { min: 55, grade: 'C',  sizeMultiplier: 0.5 },
    { min: 40, grade: 'D',  sizeMultiplier: 0.25 },
    { min: 0,  grade: 'F',  sizeMultiplier: 0.0 },
  ];

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {
    this.logger.log('🎯 Signal Quality Classifier initialized (6-dimension grading)');
  }

  // ── Public API ──

  /**
   * Classify the quality of a trading signal
   */
  async classify(
    signal: EvaluatedSignal,
    market: MarketAnalysis,
  ): Promise<SignalQualityAssessment> {
    const dimensions = this._assessDimensions(signal, market);
    const qualityScore = this._computeWeightedScore(dimensions);
    const { grade, sizeMultiplier } = this._getGrade(qualityScore);

    const shouldExecute = grade !== 'F' && (grade !== 'D' || signal.confidence >= 70);

    const reasoning = this._buildReasoning(dimensions, grade, qualityScore);

    const assessment: SignalQualityAssessment = {
      qualityScore,
      grade,
      dimensions,
      sizeMultiplier,
      shouldExecute,
      reasoning,
      assessedAt: new Date(),
    };

    // Store for ML training data (best-effort — table may not exist yet)
    if (this.prisma) {
      try {
        // Store in Redis instead of DB (signalQualityAssessment table doesn't exist yet)
        if (this.redis) {
          const key = `signal-quality:${signal.id}`;
          await this.redis.set(key, JSON.stringify({
            signalId: signal.id,
            symbol: signal.symbol,
            strategy: signal.strategy,
            qualityScore,
            grade,
            dimensions,
            sizeMultiplier,
            shouldExecute,
            assessedAt: new Date().toISOString(),
          }), 30 * 24 * 60 * 60 * 1000); // 30 days
        }
      } catch { /* non-critical */ }
    }

    this.logger.debug(
      `🎯 Signal quality: ${signal.symbol} ${signal.action} ` +
      `→ ${grade} (${qualityScore.toFixed(0)}) size=${(sizeMultiplier * 100).toFixed(0)}% ` +
      `execute=${shouldExecute}`
    );

    return assessment;
  }

  // ── Dimension Assessment ──

  private _assessDimensions(
    signal: EvaluatedSignal,
    market: MarketAnalysis,
  ): SignalQualityDimensions {
    return {
      trendAlignment: this._assessTrendAlignment(signal, market),
      indicatorStrength: this._assessIndicatorStrength(signal, market),
      mtfConfirmation: this._assessMTFConfirmation(market),
      marketQuality: this._assessMarketQuality(market),
      riskQuality: this._assessRiskQuality(signal, market),
      historicalPerformance: this._assessHistoricalPerformance(signal),
    };
  }

  /**
   * 1. Trend Alignment (30%) — Is the signal aligned with the market trend?
   */
  private _assessTrendAlignment(signal: EvaluatedSignal, market: MarketAnalysis): number {
    let score = 50; // Base

    const isBuy = signal.action === 'BUY';
    const trendMatch =
      (isBuy && market.trend === 'BULLISH') ||
      (!isBuy && market.trend === 'BEARISH');

    if (trendMatch) {
      score += 30; // Signal with trend
      if (market.trendStrength > 60) score += 15; // Strong trend
      if (market.trendStrength > 80) score += 5;  // Very strong trend
    } else if (market.trend === 'SIDEWAYS') {
      score += 5; // Sideways is OK for mean-reversion
    } else {
      score -= 30; // Signal against trend — risky
    }

    // EMA alignment bonus
    if (market.ema.ema9 > market.ema.ema21 && isBuy) score += 5;
    if (market.ema.ema9 < market.ema.ema21 && !isBuy) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 2. Indicator Strength (25%) — How many indicators agree?
   */
  private _assessIndicatorStrength(signal: EvaluatedSignal, market: MarketAnalysis): number {
    let score = 0;
    let indicators = 0;

    // RSI confirmation
    const isBuy = signal.action === 'BUY';
    if (isBuy && market.rsi < 40) { score += 20; indicators++; }
    else if (isBuy && market.rsi < 55) { score += 10; indicators++; }
    else if (!isBuy && market.rsi > 60) { score += 20; indicators++; }
    else if (!isBuy && market.rsi > 45) { score += 10; indicators++; }

    // MACD confirmation
    if (isBuy && market.macd.histogram > 0) { score += 20; indicators++; }
    else if (isBuy && market.macd.crossover === 'BULLISH') { score += 25; indicators++; }
    else if (!isBuy && market.macd.histogram < 0) { score += 20; indicators++; }
    else if (!isBuy && market.macd.crossover === 'BEARISH') { score += 25; indicators++; }

    // Bollinger Band position
    if (isBuy && market.bollingerBands.percentB < 0.3) { score += 15; indicators++; }
    else if (!isBuy && market.bollingerBands.percentB > 0.7) { score += 15; indicators++; }

    // EMA alignment
    if (isBuy && market.ema.ema9 > market.ema.ema21) { score += 10; indicators++; }
    else if (!isBuy && market.ema.ema9 < market.ema.ema21) { score += 10; indicators++; }

    // AI signal agreement
    if (isBuy && (market.aiSignal === 'BUY' || market.aiSignal === 'STRONG_BUY')) { score += 10; indicators++; }
    else if (!isBuy && (market.aiSignal === 'SELL' || market.aiSignal === 'STRONG_SELL')) { score += 10; indicators++; }

    // More indicators = higher quality
    if (indicators >= 4) score += 10;
    if (indicators >= 5) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 3. MTF Confirmation (20%) — Do higher timeframes agree?
   */
  private _assessMTFConfirmation(market: MarketAnalysis): number {
    const mtf = market.mtfContext;
    if (!mtf) return 50; // No MTF data = neutral

    const isBuy = market.aiSignal === 'BUY' || market.aiSignal === 'STRONG_BUY' ||
                  market.trend === 'BULLISH';

    // Use MTF alignment score
    let score = mtf.mtfAlignmentScore; // 0-100 (50 = neutral)

    // Boost if clearly aligned
    if (isBuy && mtf.mtfAlignment === 'ALIGNED_BULLISH') score = Math.max(score, 85);
    else if (!isBuy && mtf.mtfAlignment === 'ALIGNED_BEARISH') score = Math.max(score, 85);
    else if (mtf.mtfAlignment === 'MIXED') score = Math.min(score, 40);
    else if (mtf.mtfAlignment === 'NEUTRAL') score = 50;

    // Check individual higher timeframes
    let confirmingTFs = 0;
    let opposingTFs = 0;
    for (const htf of mtf.higherTimeframes) {
      if ((isBuy && htf.trend === 'BULLISH') || (!isBuy && htf.trend === 'BEARISH')) {
        confirmingTFs++;
      } else if ((isBuy && htf.trend === 'BEARISH') || (!isBuy && htf.trend === 'BULLISH')) {
        opposingTFs++;
      }
    }

    if (opposingTFs > 0) score -= opposingTFs * 15;
    if (confirmingTFs >= 2) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 4. Market Quality (10%) — Liquidity, spread, volatility
   */
  private _assessMarketQuality(market: MarketAnalysis): number {
    let score = 70; // Base

    // Volatility assessment
    if (market.volatility === 'EXTREME') score -= 40;
    else if (market.volatility === 'HIGH') score -= 20;
    else if (market.volatility === 'LOW') score += 10; // Low vol = tight spreads

    // Volume check
    if (market.volume24h > 0) score += 10;

    // ATR reasonableness (not too wide, not too narrow)
    const atrPercent = market.atr > 0 && market.price > 0 ? (market.atr / market.price) * 100 : 0;
    if (atrPercent > 0.5 && atrPercent < 3) score += 10; // Healthy volatility
    if (atrPercent > 5) score -= 15; // Too volatile

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 5. Risk Quality (10%) — R:R ratio, SL distance
   */
  private _assessRiskQuality(signal: EvaluatedSignal, market: MarketAnalysis): number {
    let score = 50;

    // R:R ratio assessment
    const rr = signal.riskRewardRatio;
    if (rr >= 3.0) score += 30;
    else if (rr >= 2.0) score += 20;
    else if (rr >= 1.5) score += 10;
    else if (rr >= 1.0) score += 0;
    else score -= 20; // Negative R:R

    // SL distance (too close = stopped out easily, too far = big loss)
    if (signal.stopLoss > 0 && market.price > 0) {
      const slDistance = Math.abs(signal.stopLoss - market.price) / market.price * 100;
      if (slDistance >= 0.5 && slDistance <= 3) score += 15; // Reasonable SL
      else if (slDistance < 0.3) score -= 15; // Too tight
      else if (slDistance > 5) score -= 10; // Too wide
    }

    // Confidence level
    if (signal.confidence >= 80) score += 10;
    else if (signal.confidence >= 60) score += 5;
    else if (signal.confidence < 40) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 6. Historical Performance (5%) — Strategy's past win rate
   */
  private _assessHistoricalPerformance(signal: EvaluatedSignal): number {
    // Default score — in production, this would query historical trade data
    // and calculate the strategy's actual win rate for this symbol.
    // For now, use the signal's confidence as a proxy.
    let score = 50;

    if (signal.confidence >= 80) score += 20;
    else if (signal.confidence >= 60) score += 10;
    else if (signal.confidence < 40) score -= 15;

    return Math.max(0, Math.min(100, score));
  }

  // ── Helpers ──

  private _computeWeightedScore(dimensions: SignalQualityDimensions): number {
    const w = SignalQualityClassifierService.WEIGHTS;
    return Math.round(
      dimensions.trendAlignment * w.trendAlignment +
      dimensions.indicatorStrength * w.indicatorStrength +
      dimensions.mtfConfirmation * w.mtfConfirmation +
      dimensions.marketQuality * w.marketQuality +
      dimensions.riskQuality * w.riskQuality +
      dimensions.historicalPerformance * w.historicalPerformance
    );
  }

  private _getGrade(score: number): { grade: QualityGrade; sizeMultiplier: number } {
    for (const threshold of SignalQualityClassifierService.GRADE_THRESHOLDS) {
      if (score >= threshold.min) {
        return { grade: threshold.grade, sizeMultiplier: threshold.sizeMultiplier };
      }
    }
    return { grade: 'F', sizeMultiplier: 0 };
  }

  private _buildReasoning(
    dimensions: SignalQualityDimensions,
    grade: QualityGrade,
    score: number,
  ): string[] {
    const reasons: string[] = [];

    reasons.push(`جودة الإشارة: ${grade} (${score}/100)`);

    if (dimensions.trendAlignment < 40) {
      reasons.push('⚠️ الإشارة ضد الاتجاه — مخاطرة عالية');
    } else if (dimensions.trendAlignment > 80) {
      reasons.push('✅ توافق قوي مع الاتجاه');
    }

    if (dimensions.mtfConfirmation < 40) {
      reasons.push('⚠️ الأطر الزمنية العليا تعارض');
    } else if (dimensions.mtfConfirmation > 70) {
      reasons.push('✅ تأكيد من الأطر الزمنية العليا');
    }

    if (dimensions.indicatorStrength < 40) {
      reasons.push('⚠️ مؤشرات فنية ضعيفة');
    }

    if (dimensions.riskQuality < 40) {
      reasons.push('⚠️ إدارة مخاطر ضعيفة (R:R أو SL)');
    }

    return reasons;
  }
}
