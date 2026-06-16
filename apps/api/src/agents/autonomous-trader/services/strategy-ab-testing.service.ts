// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Strategy A/B Testing Framework
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V-PHASE4: إطار اختبارات A/B لمعلمات الاستراتيجية
//
// يتيح تجربة معلمات استراتيجية مختلفة ومقارنة أدائها
// إحصائياً لتحديد المعلمات المثلى.
//
// كيف يعمل:
// 1. تُعرّف "تجربة" مع نسختين (A: مرجعية، B: تجريبية)
// 2. كل صفقة تُسجّل مع معرف التجربة والنسخة
// 3. تُقارَن النتائج إحصائياً (win rate, PnL, Sharpe)
// 4. إذا وصلت التجربة لأهمية إحصائية → تُتخذ قرار
//
// مثال تجربة:
// ┌─────────────────────────────────────────────────────────────┐
// │ التجربة: scalping-rsi-threshold                             │
// │ الوصف: مقارنة RSI oversold=35 vs RSI oversold=40           │
// │ النسخة A: { rsiOversold: 35, rsiOverbought: 65 }          │
// │ النسخة B: { rsiOversold: 40, rsiOverbought: 60 }          │
// │ المقياس: win rate + average PnL per trade                  │
// │ الحالة: RUNNING                                              │
// │ النتائج حتى الآن:                                           │
// │   A: 42 صفقة، 52% فوز، +$0.23/صفقة                        │
// │   B: 45 صفقة، 48% فوز، +$0.15/صفقة                        │
// │   الأهمية الإحصائية: 62% (لم تصل لعتبة 95%)               │
// └─────────────────────────────────────────────────────────────┘

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

// ── Types ──

export type ExperimentStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'REJECTED';
export type ExperimentDecision = 'KEEP_A' | 'SWITCH_TO_B' | 'INCONCLUSIVE' | 'NEED_MORE_DATA';

export interface ExperimentVariant {
  name: 'A' | 'B';
  label: string;
  params: Record<string, any>;
  /** Number of trades in this variant */
  tradeCount: number;
  /** Number of winning trades */
  wins: number;
  /** Total PnL */
  totalPnL: number;
  /** Average PnL per trade */
  avgPnL: number;
  /** Win rate (0-100) */
  winRate: number;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  strategy: string;
  metric: 'win_rate' | 'avg_pnl' | 'sharpe' | 'profit_factor';
  status: ExperimentStatus;
  variantA: ExperimentVariant;
  variantB: ExperimentVariant;
  /** Minimum trades per variant before statistical testing */
  minTradesForSignificance: number;
  /** Statistical significance level achieved (0-100%) */
  significanceLevel: number;
  /** Decision if experiment completed */
  decision?: ExperimentDecision;
  createdAt: Date;
  completedAt?: Date;
}

export interface TradeRecord {
  experimentId: string;
  variant: 'A' | 'B';
  symbol: string;
  side: 'BUY' | 'SELL';
  pnl: number;
  isWin: boolean;
  timestamp: Date;
}

@Injectable()
export class StrategyABTestingService {
  private readonly logger = new Logger(StrategyABTestingService.name);

  /** Active experiments (in-memory + Redis persistence) */
  private readonly experiments = new Map<string, Experiment>();

  private static readonly MIN_TRADES_FOR_SIGNIFICANCE = 30;
  private static readonly SIGNIFICANCE_THRESHOLD = 95; // 95% confidence

  constructor(
    @Optional() private readonly redis?: RedisService,
  ) {
    this.logger.log('🧪 Strategy A/B Testing Service initialized');
    this._loadExperiments();
  }

  // ── Experiment Management ──

  /**
   * Create a new A/B experiment
   */
  async createExperiment(config: {
    name: string;
    description: string;
    strategy: string;
    metric?: 'win_rate' | 'avg_pnl' | 'sharpe' | 'profit_factor';
    variantAParams: Record<string, any>;
    variantBParams: Record<string, any>;
    variantALabel?: string;
    variantBLabel?: string;
    minTrades?: number;
  }): Promise<Experiment> {
    const id = `exp-${config.strategy}-${Date.now()}`;

    const experiment: Experiment = {
      id,
      name: config.name,
      description: config.description,
      strategy: config.strategy,
      metric: config.metric || 'win_rate',
      status: 'DRAFT',
      variantA: {
        name: 'A',
        label: config.variantALabel || 'النسخة المرجعية (A)',
        params: config.variantAParams,
        tradeCount: 0,
        wins: 0,
        totalPnL: 0,
        avgPnL: 0,
        winRate: 0,
      },
      variantB: {
        name: 'B',
        label: config.variantBLabel || 'النسخة التجريبية (B)',
        params: config.variantBParams,
        tradeCount: 0,
        wins: 0,
        totalPnL: 0,
        avgPnL: 0,
        winRate: 0,
      },
      minTradesForSignificance: config.minTrades || StrategyABTestingService.MIN_TRADES_FOR_SIGNIFICANCE,
      significanceLevel: 0,
      createdAt: new Date(),
    };

    this.experiments.set(id, experiment);
    await this._saveExperiments();

    this.logger.log(`🧪 Experiment created: ${id} — ${config.name}`);
    return experiment;
  }

  /**
   * Start an experiment (begin collecting data)
   */
  async startExperiment(experimentId: string): Promise<Experiment | null> {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;

    exp.status = 'RUNNING';
    await this._saveExperiments();
    this.logger.log(`🧪 Experiment started: ${experimentId}`);
    return exp;
  }

  /**
   * Get the active variant for a strategy in a running experiment
   *
   * Uses simple 50/50 split (can be upgraded to multi-armed bandit)
   */
  getVariantForStrategy(strategy: string, userId: string): { experimentId: string; variant: 'A' | 'B'; params: Record<string, any> } | null {
    // Find running experiment for this strategy
    for (const exp of this.experiments.values()) {
      if (exp.strategy === strategy && exp.status === 'RUNNING') {
        // Deterministic assignment based on userId hash
        const hash = this._simpleHash(userId + exp.id);
        const variant = hash % 2 === 0 ? 'A' : 'B';

        return {
          experimentId: exp.id,
          variant,
          params: variant === 'A' ? exp.variantA.params : exp.variantB.params,
        };
      }
    }
    return null;
  }

  /**
   * Record a trade result for an experiment
   */
  async recordTrade(record: TradeRecord): Promise<void> {
    const exp = this.experiments.get(record.experimentId);
    if (!exp || exp.status !== 'RUNNING') return;

    const variant = record.variant === 'A' ? exp.variantA : exp.variantB;

    variant.tradeCount++;
    variant.totalPnL += record.pnl;
    variant.avgPnL = variant.totalPnL / variant.tradeCount;
    if (record.isWin) variant.wins++;
    variant.winRate = (variant.wins / variant.tradeCount) * 100;

    // Check if we have enough data for statistical significance
    if (variant.tradeCount >= exp.minTradesForSignificance) {
      exp.significanceLevel = this._calculateSignificance(exp);

      if (exp.significanceLevel >= StrategyABTestingService.SIGNIFICANCE_THRESHOLD) {
        exp.decision = this._makeDecision(exp);
        exp.status = 'COMPLETED';
        exp.completedAt = new Date();

        this.logger.log(
          `🧪 Experiment ${exp.id} completed! Decision: ${exp.decision} ` +
          `(significance: ${exp.significanceLevel.toFixed(1)}%) ` +
          `A: ${exp.variantA.winRate.toFixed(1)}% win, B: ${exp.variantB.winRate.toFixed(1)}% win`
        );
      }
    }

    await this._saveExperiments();
  }

  /**
   * Get all experiments
   */
  getExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }

  /**
   * Get a specific experiment
   */
  getExperiment(id: string): Experiment | null {
    return this.experiments.get(id) || null;
  }

  // ── Statistical Testing ──

  /**
   * Calculate statistical significance using Z-test for proportions
   *
   * Returns confidence level (0-100%) that the difference between
   * variants A and B is statistically significant.
   */
  private _calculateSignificance(exp: Experiment): number {
    const a = exp.variantA;
    const b = exp.variantB;

    if (a.tradeCount < 10 || b.tradeCount < 10) return 0;

    const pA = a.wins / a.tradeCount;
    const pB = b.wins / b.tradeCount;
    const pPool = (a.wins + b.wins) / (a.tradeCount + b.tradeCount);

    if (pPool === 0 || pPool === 1) return 0;

    const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.tradeCount + 1 / b.tradeCount));

    if (se === 0) return 0;

    const zScore = Math.abs(pA - pB) / se;

    // Approximate confidence from Z-score
    // Z=1.96 → 95%, Z=2.576 → 99%, Z=1.645 → 90%
    const confidence = this._zScoreToConfidence(zScore);

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Convert Z-score to confidence level (approximate)
   */
  private _zScoreToConfidence(z: number): number {
    // Using the normal CDF approximation
    if (z >= 3.5) return 99.95;
    if (z >= 2.576) return 99.0;
    if (z >= 2.326) return 98.0;
    if (z >= 1.96) return 95.0;
    if (z >= 1.645) return 90.0;
    if (z >= 1.28) return 80.0;
    if (z >= 1.0) return 68.0;
    if (z >= 0.5) return 38.0;
    return 20.0;
  }

  /**
   * Make a decision based on experiment results
   */
  private _makeDecision(exp: Experiment): ExperimentDecision {
    const a = exp.variantA;
    const b = exp.variantB;

    const metric = exp.metric;

    let aScore: number;
    let bScore: number;

    switch (metric) {
      case 'win_rate':
        aScore = a.winRate;
        bScore = b.winRate;
        break;
      case 'avg_pnl':
        aScore = a.avgPnL;
        bScore = b.avgPnL;
        break;
      case 'profit_factor':
        // Simplified: total wins / total losses ratio
        aScore = a.wins > 0 ? a.totalPnL / Math.max(0.01, Math.abs(a.totalPnL - a.wins * a.avgPnL)) : 0;
        bScore = b.wins > 0 ? b.totalPnL / Math.max(0.01, Math.abs(b.totalPnL - b.wins * b.avgPnL)) : 0;
        break;
      default:
        aScore = a.winRate;
        bScore = b.winRate;
    }

    const diff = Math.abs(aScore - bScore);
    const minImprovement = 5; // Minimum 5% improvement to justify change

    if (diff < minImprovement) {
      return 'INCONCLUSIVE';
    }

    if (bScore > aScore + minImprovement) {
      return 'SWITCH_TO_B';
    }

    return 'KEEP_A';
  }

  // ── Persistence ──

  private async _loadExperiments(): Promise<void> {
    if (!this.redis) return;

    try {
      const data = await this.redis.get('ab-testing:experiments');
      if (data) {
        const parsed = JSON.parse(data);
        for (const exp of parsed) {
          this.experiments.set(exp.id, exp);
        }
        this.logger.log(`🧪 Loaded ${this.experiments.size} experiment(s) from Redis`);
      }
    } catch { /* empty */ }
  }

  private async _saveExperiments(): Promise<void> {
    if (!this.redis) return;

    try {
      const data = Array.from(this.experiments.values());
      await this.redis.set('ab-testing:experiments', JSON.stringify(data), 7 * 24 * 60 * 60 * 1000);
    } catch { /* non-critical */ }
  }

  // ── Helpers ──

  private _simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
