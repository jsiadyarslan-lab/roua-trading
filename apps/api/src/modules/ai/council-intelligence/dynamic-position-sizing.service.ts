// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Dynamic Position Sizing Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "حجم الصفقة الذكي" — يُكبّر عندما يثق ويُصغّر عندما يشك
// صفقة بثقة ٥٥٪ ≠ صفقة بثقة ٨٥٪
//
// V185: المتداول العاطفي يفعل كلشي أو لا شيء — رؤى لا
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketRegimeService, RegimeType } from './market-regime.service';
import { CrossPairCorrelationService } from './cross-pair-correlation.service';

export interface SizingFactors {
  // Increase factors (> 1.0 = increase size)
  consensusScoreFactor: number;   // Based on consensus score
  regimeAlignmentFactor: number;  // BUY in BULL / SELL in BEAR = alignment
  councilAgreementFactor: number; // Unanimous agreement = increase
  recentWinRateFactor: number;    // Good recent performance = increase
  newsConfidenceFactor: number;   // Strong news alignment = increase

  // Decrease factors (< 1.0 = decrease size)
  regimeConflictFactor: number;   // BUY in BEAR = conflict
  councilSplitFactor: number;     // Near 50/50 split = uncertainty
  recentLossesFactor: number;     // Recent losses = decrease
  volatilityFactor: number;       // High volatility = decrease

  // Final
  finalMultiplier: number;        // Product of all factors
  reasoning: string[];            // Why each factor was applied
}

const MAX_MULTIPLIER = 2.0;
const MIN_MULTIPLIER = 0.3;

@Injectable()
export class DynamicPositionSizingService {
  private readonly logger = new Logger(DynamicPositionSizingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly regimeService: MarketRegimeService,
    private readonly correlationService: CrossPairCorrelationService,
  ) {
    this.logger.log('📏 Dynamic Position Sizing initialized — حجم ذكي');
  }

  /**
   * Calculate the position size multiplier for a given trade
   * Returns 0.3 to 2.0 — multiply with base position size
   */
  async calculateSizeMultiplier(params: {
    userId: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    consensusScore: number;     // 0-100
    confidence: number;         // 0-100
    councilVotes: Record<string, string>; // {tech: 'BUY', sent: 'SELL', ...}
    existingPositions: { symbol: string; side: string; quantity: number }[];
  }): Promise<SizingFactors> {
    const factors: SizingFactors = {
      consensusScoreFactor: 1.0,
      regimeAlignmentFactor: 1.0,
      councilAgreementFactor: 1.0,
      recentWinRateFactor: 1.0,
      newsConfidenceFactor: 1.0,
      regimeConflictFactor: 1.0,
      councilSplitFactor: 1.0,
      recentLossesFactor: 1.0,
      volatilityFactor: 1.0,
      finalMultiplier: 1.0,
      reasoning: [],
    };

    // ── Factor 1: Consensus Score ──
    if (params.consensusScore >= 80) {
      factors.consensusScoreFactor = 1.5;
      factors.reasoning.push(`إجماع قوي ${params.consensusScore}% → 1.5×`);
    } else if (params.consensusScore >= 65) {
      factors.consensusScoreFactor = 1.2;
      factors.reasoning.push(`إجماع جيد ${params.consensusScore}% → 1.2×`);
    } else if (params.consensusScore < 55) {
      factors.consensusScoreFactor = 0.5;
      factors.reasoning.push(`إجماع ضعيف ${params.consensusScore}% → 0.5×`);
    } else {
      factors.reasoning.push(`إجماع متوسط ${params.consensusScore}% → 1.0×`);
    }

    // ── Factor 2: Regime Alignment ──
    try {
      const regime = await this.regimeService.getCurrentRegime(params.symbol);
      const isAligned = (
        (params.direction === 'BUY' && regime.regime === 'BULL') ||
        (params.direction === 'SELL' && regime.regime === 'BEAR')
      );
      const isConflict = (
        (params.direction === 'BUY' && regime.regime === 'BEAR') ||
        (params.direction === 'SELL' && regime.regime === 'BULL')
      );

      if (isAligned) {
        factors.regimeAlignmentFactor = 1.3;
        factors.reasoning.push(`اتجاه مع السوق (${regime.regime}) → 1.3×`);
      } else if (isConflict) {
        factors.regimeConflictFactor = 0.5;
        factors.reasoning.push(`اتجاه ضد السوق (${regime.regime}) → 0.5×`);
      } else if (regime.regime === 'VOLATILE') {
        factors.volatilityFactor = 0.6;
        factors.reasoning.push(`سوق متقلب → 0.6×`);
      } else {
        factors.reasoning.push(`سوق عرضي → 1.0×`);
      }

      // Volatility factor
      if (regime.volatilityIndex > 60) {
        factors.volatilityFactor = Math.min(factors.volatilityFactor, 0.7);
        factors.reasoning.push(`تقلب عالي ${regime.volatilityIndex}% → 0.7×`);
      }
    } catch {
      factors.reasoning.push('وضع السوق غير متاح → 1.0×');
    }

    // ── Factor 3: Council Agreement ──
    const votes = Object.values(params.councilVotes);
    const buyVotes = votes.filter(v => v === 'BUY').length;
    const sellVotes = votes.filter(v => v === 'SELL').length;
    const totalDirectional = buyVotes + sellVotes;
    const dominantCount = Math.max(buyVotes, sellVotes);

    if (totalDirectional > 0) {
      const agreementPct = (dominantCount / totalDirectional) * 100;
      if (agreementPct >= 90) {
        factors.councilAgreementFactor = 1.2;
        factors.reasoning.push(`إجماع المجلس ${agreementPct.toFixed(0)}% → 1.2×`);
      } else if (agreementPct < 55) {
        factors.councilSplitFactor = 0.6;
        factors.reasoning.push(`انقسام المجلس ${agreementPct.toFixed(0)}% → 0.6×`);
      }
    }

    // ── Factor 4: Recent Win Rate ──
    try {
      const winRate = await this._getRecentWinRate(params.userId);
      if (winRate >= 65) {
        factors.recentWinRateFactor = 1.2;
        factors.reasoning.push(`نسبة فوز ${winRate}% → 1.2×`);
      } else if (winRate < 35) {
        factors.recentLossesFactor = 0.5;
        factors.reasoning.push(`نسبة خسارة ${winRate}% → 0.5×`);
      } else if (winRate < 45) {
        factors.recentLossesFactor = 0.7;
        factors.reasoning.push(`أداء ضعيف ${winRate}% → 0.7×`);
      }
    } catch {
      factors.reasoning.push('سجل الأداء غير متاح → 1.0×');
    }

    // ── Factor 5: Correlation Risk ──
    // V-PHASE2 FIX: Store correlation as a separate factor instead of pre-multiplying
    // into finalMultiplier. Previously, finalMultiplier was used as BOTH an accumulator
    // for correlation AND multiplied again at the end — causing double-counting.
    // Now: correlation is a dedicated reduction factor, multiplied once in the final calc.
    let correlationFactor = 1.0;
    try {
      const corrMultiplier = await this.correlationService.getPositionSizeMultiplier(
        params.userId,
        params.symbol,
        params.direction,
        params.existingPositions,
      );
      if (corrMultiplier < 1.0) {
        correlationFactor = corrMultiplier;
        factors.reasoning.push(`ارتباط مع صفقات مفتوحة → ${corrMultiplier}×`);
      }
    } catch {
      factors.reasoning.push('فحص الارتباط غير متاح → 1.0×');
    }

    // ── Calculate Final Multiplier ──
    // V-PHASE2 FIX: Each factor is multiplied EXACTLY ONCE. No double-counting.
    let multiplier = 1.0;
    multiplier *= factors.consensusScoreFactor;
    multiplier *= factors.regimeAlignmentFactor;
    multiplier *= factors.councilAgreementFactor;
    multiplier *= factors.recentWinRateFactor;
    multiplier *= factors.newsConfidenceFactor;
    multiplier *= factors.regimeConflictFactor;
    multiplier *= factors.councilSplitFactor;
    multiplier *= factors.recentLossesFactor;
    multiplier *= factors.volatilityFactor;
    multiplier *= correlationFactor; // Correlation applied once, not twice

    // Clamp to bounds
    factors.finalMultiplier = Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, multiplier));

    factors.reasoning.push(`━━━ الحجم النهائي: ${factors.finalMultiplier.toFixed(2)}× ━━━`);

    return factors;
  }

  /**
   * Get sizing factors explanation for logging/display
   */
  formatSizingExplanation(factors: SizingFactors): string {
    return factors.reasoning.join('\n');
  }

  // ── Private Methods ──

  private async _getRecentWinRate(userId: string): Promise<number> {
    try {
      const last20 = await this.prisma.tradeJournal.findMany({
        where: {
          userId,
          result: { not: null },
        },
        orderBy: { closedAt: 'desc' },
        take: 20,
        select: { result: true },
      });

      if (last20.length === 0) return 50; // No data = neutral
      const wins = last20.filter(j => j.result === 'WIN').length;
      return Math.round((wins / last20.length) * 100);
    } catch {
      return 50; // Default neutral
    }
  }
}
