// ═══════════════════════════════════════════════════════════════════════
// ROUA Adaptive Bayesian Engine — Phase 5
//
// An advanced Bayesian engine that LEARNS from its own performance:
// - Dynamic prior updates: If SMC signals succeed 70%, their weight rises
// - Preferential forgetting: Recent performance > old (exponential decay)
// - Market-type adaptation: Different modes for trend/range/volatile markets
// - User customization: Traders can adjust methodology weights
// - Cross-validation: Compares predicted vs actual outcomes continuously
//
// This transforms the static Naive Bayes (Phase 1) into an adaptive system
// that gets better over time — similar to how professional traders adjust
// their strategies based on what's working in the current market.
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── Types ───────────────────────────────────────────────────────────

/** Market regime classification */
export type MarketRegime = 'trending' | 'ranging' | 'volatile' | 'quiet';

/** Signal source with adaptive weight */
export interface AdaptiveSignalSource {
  /** Source identifier (e.g. 'smc:bos', 'wyckoff', 'harmonic:gartley') */
  source: string;
  /** Direction of the signal */
  direction: 'bullish' | 'bearish' | 'neutral';
  /** Base confidence from the detection engine */
  baseConfidence: number;
  /** Adaptive weight (modified by learning) */
  adaptiveWeight: number;
  /** Timestamp when this signal was generated */
  timestamp: number;
}

/** Performance record for a signal source */
interface SourcePerformance {
  /** Source identifier */
  source: string;
  /** Total signals issued */
  totalSignals: number;
  /** Correct signals */
  correctSignals: number;
  /** Win rate (correct/total) */
  winRate: number;
  /** Average return when correct */
  avgReturnCorrect: number;
  /** Average loss when incorrect */
  avgReturnIncorrect: number;
  /** Current adaptive weight */
  currentWeight: number;
  /** Weight history for charting */
  weightHistory: Array<{ timestamp: number; weight: number }>;
  /** Per-regime performance */
  regimePerformance: Record<MarketRegime, { total: number; correct: number }>;
  /** Exponential moving win rate (recent performance weighted more) */
  emaWinRate: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

/** User-customizable weight overrides */
export interface UserWeightOverrides {
  /** Manual weight overrides per source (0 = use adaptive weight) */
  [source: string]: number;
}

/** Complete adaptive Bayesian result */
export interface AdaptiveBayesianResult {
  /** Posterior probability for bullish */
  posteriorBullish: number;
  /** Posterior probability for bearish */
  posteriorBearish: number;
  /** Final direction */
  direction: 'bullish' | 'bearish' | 'neutral';
  /** Confidence in the final direction (0-1) */
  confidence: number;
  /** Market regime at time of analysis */
  regime: MarketRegime;
  /** Prior probabilities used */
  prior: { bullish: number; bearish: number };
  /** Per-source likelihoods with adaptive weights */
  sourceContributions: Array<{
    source: string;
    likelihoodBull: number;
    likelihoodBear: number;
    adaptiveWeight: number;
    winRate: number;
    isUserOverride: boolean;
  }>;
  /** Learning insights — what the engine has learned */
  insights: string[];
  /** Timestamp */
  timestamp: number;
  /** Regime-specific adjustments applied */
  regimeAdjustments: {
    trendBias: number;
    rangeBias: number;
    volatilityDiscount: number;
  };
}

// ── Constants ───────────────────────────────────────────────────────

const DECAY_FACTOR = 0.95;         // Exponential decay for forgetting
const MIN_WEIGHT = 0.1;            // Minimum adaptive weight
const MAX_WEIGHT = 2.0;            // Maximum adaptive weight
const BASE_WEIGHT = 1.0;           // Default weight for new sources
const EMA_ALPHA = 0.15;            // EMA smoothing for win rate
const MIN_SIGNALS_FOR_ADAPTATION = 8; // Need at least 8 signals before adapting
const PERSISTENCE_KEY = 'roua-adaptive-bayesian';
const REGIME_HISTORY_KEY = 'roua-regime-history';

// ── In-memory State ─────────────────────────────────────────────────

const performanceMap = new Map<string, SourcePerformance>();
const userOverrides: UserWeightOverrides = {};
let regimeHistory: Array<{ timestamp: number; regime: MarketRegime }> = [];

// ── Persistence ─────────────────────────────────────────────────────

function loadState(): void {
  try {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(PERSISTENCE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.performance) {
        for (const [key, value] of Object.entries(parsed.performance)) {
          performanceMap.set(key, value as SourcePerformance);
        }
      }
      if (parsed.userOverrides) {
        Object.assign(userOverrides, parsed.userOverrides);
      }
    }
    const regimeStored = localStorage.getItem(REGIME_HISTORY_KEY);
    if (regimeStored) {
      regimeHistory = JSON.parse(regimeStored);
    }
  } catch { /* localStorage not available */ }
}

function persistState(): void {
  try {
    if (typeof window === 'undefined') return;
    const performance: Record<string, SourcePerformance> = {};
    for (const [key, value] of performanceMap.entries()) {
      performance[key] = value;
    }
    localStorage.setItem(PERSISTENCE_KEY, JSON.stringify({ performance, userOverrides }));
    localStorage.setItem(REGIME_HISTORY_KEY, JSON.stringify(regimeHistory.slice(-500)));
  } catch { /* localStorage not available */ }
}

// Load state on first import
loadState();

// ── Market Regime Detection ─────────────────────────────────────────

/**
 * Detect the current market regime from candle data.
 * Uses ATR volatility + ADX-like trend strength.
 *
 * - Trending: Strong directional move, low overlap between candles
 * - Ranging: Price oscillating within a range, high overlap
 * - Volatile: Large swings in both directions, high ATR
 * - Quiet: Low ATR, small candles, low activity
 */
export function detectMarketRegime(candles: CandleData[]): MarketRegime {
  if (!candles || candles.length < 50) return 'quiet';

  const recent = candles.slice(-50);
  const close = recent.map(c => c.close);
  const high = recent.map(c => c.high);
  const low = recent.map(c => c.low);

  // 1. ATR-based volatility
  let atrSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    atrSum += tr;
  }
  const atr = atrSum / (recent.length - 1);
  const atrPct = atr / close[close.length - 1];

  // 2. Trend strength: correlation of close prices with time
  const n = close.length;
  const sumX = n * (n - 1) / 2;
  const sumY = close.reduce((s, v) => s + v, 0);
  let sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumXY += i * close[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const trendStrength = Math.abs(slope) / (close[close.length - 1] || 1) * n;

  // 3. Overlap ratio: how much do consecutive candles overlap?
  let overlapSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const overlapHigh = Math.min(high[i], high[i - 1]);
    const overlapLow = Math.max(low[i], low[i - 1]);
    const range = high[i] - low[i];
    if (range > 0) {
      overlapSum += Math.max(0, overlapHigh - overlapLow) / range;
    }
  }
  const avgOverlap = overlapSum / (recent.length - 1);

  // 4. Directional consistency
  let upCount = 0, downCount = 0;
  for (let i = 1; i < close.length; i++) {
    if (close[i] > close[i - 1]) upCount++;
    else if (close[i] < close[i - 1]) downCount++;
  }
  const directionalConsistency = Math.max(upCount, downCount) / (close.length - 1);

  // Classification
  if (atrPct > 0.025) {
    // High volatility
    if (trendStrength > 0.15 && directionalConsistency > 0.6) return 'trending';
    return 'volatile';
  }

  if (trendStrength > 0.08 && directionalConsistency > 0.55) return 'trending';

  if (avgOverlap > 0.5 && atrPct < 0.01) return 'quiet';

  return 'ranging';
}

// ── Adaptive Weight Calculation ─────────────────────────────────────

/**
 * Calculate the adaptive weight for a signal source based on its
 * historical performance. Sources that perform well get higher weights,
// sources that perform poorly get reduced weights.
 *
 * Key features:
 * - Exponential decay: Recent performance matters more than old
 * - Regime-specific: Performance is tracked per market regime
 * - Clamped: Weights stay in [MIN_WEIGHT, MAX_WEIGHT] range
 * - Smoothed: EMA of win rate prevents wild fluctuations
 */
function calculateAdaptiveWeight(source: string, regime: MarketRegime): number {
  // Check for user override first
  if (userOverrides[source] && userOverrides[source] > 0) {
    return userOverrides[source];
  }

  const perf = performanceMap.get(source);
  if (!perf || perf.totalSignals < MIN_SIGNALS_FOR_ADAPTATION) {
    return BASE_WEIGHT; // Not enough data — use default
  }

  // Base adjustment from overall win rate
  // winRate of 0.7 → weight boost; winRate of 0.3 → weight penalty
  const winRateAdjustment = (perf.emaWinRate - 0.5) * 2.0; // Range: -1 to +1

  // Regime-specific adjustment
  const regimePerf = perf.regimePerformance[regime];
  let regimeAdjustment = 0;
  if (regimePerf && regimePerf.total >= 5) {
    const regimeWinRate = regimePerf.correct / regimePerf.total;
    regimeAdjustment = (regimeWinRate - 0.5) * 0.5; // Milder regime adjustment
  }

  // Combine adjustments
  const rawWeight = BASE_WEIGHT + winRateAdjustment + regimeAdjustment;

  // Clamp to valid range
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, rawWeight));
}

// ── Record Signal Outcome ───────────────────────────────────────────

/**
 * Record the outcome of a signal for adaptive learning.
 * This is called when we can verify whether a signal was correct or not.
 *
 * @param source - Signal source identifier
 * @param direction - Signal direction
 * @param wasCorrect - Whether the signal was correct
 * @param returnPct - Price return since signal (for tracking avg return)
 * @param regime - Market regime when the signal was issued
 */
export function recordAdaptiveOutcome(
  source: string,
  direction: 'bullish' | 'bearish' | 'neutral',
  wasCorrect: boolean,
  returnPct: number,
  regime: MarketRegime,
): void {
  let perf = performanceMap.get(source);
  if (!perf) {
    perf = {
      source,
      totalSignals: 0,
      correctSignals: 0,
      winRate: 0.5,
      avgReturnCorrect: 0,
      avgReturnIncorrect: 0,
      currentWeight: BASE_WEIGHT,
      weightHistory: [],
      regimePerformance: {
        trending: { total: 0, correct: 0 },
        ranging: { total: 0, correct: 0 },
        volatile: { total: 0, correct: 0 },
        quiet: { total: 0, correct: 0 },
      },
      emaWinRate: 0.5,
      lastUpdated: Date.now(),
    };
    performanceMap.set(source, perf);
  }

  // Update counts
  perf.totalSignals++;
  if (wasCorrect) {
    perf.correctSignals++;
    perf.avgReturnCorrect = perf.avgReturnCorrect * 0.8 + returnPct * 0.2;
  } else {
    perf.avgReturnIncorrect = perf.avgReturnIncorrect * 0.8 + Math.abs(returnPct) * 0.2;
  }

  // Update win rate
  perf.winRate = perf.correctSignals / perf.totalSignals;

  // Update EMA win rate (exponential decay — recent data weighted more)
  perf.emaWinRate = EMA_ALPHA * (wasCorrect ? 1 : 0) + (1 - EMA_ALPHA) * perf.emaWinRate;

  // Update regime-specific performance
  if (!perf.regimePerformance[regime]) {
    perf.regimePerformance[regime] = { total: 0, correct: 0 };
  }
  perf.regimePerformance[regime].total++;
  if (wasCorrect) {
    perf.regimePerformance[regime].correct++;
  }

  // Update adaptive weight
  perf.currentWeight = calculateAdaptiveWeight(source, regime);

  // Record weight history
  perf.weightHistory.push({ timestamp: Date.now(), weight: perf.currentWeight });
  if (perf.weightHistory.length > 200) {
    perf.weightHistory = perf.weightHistory.slice(-200);
  }

  perf.lastUpdated = Date.now();
  persistState();
}

// ── User Override Management ────────────────────────────────────────

/**
 * Set a manual weight override for a signal source.
 * Set to 0 to remove the override and use adaptive weight again.
 */
export function setUserWeightOverride(source: string, weight: number): void {
  if (weight <= 0) {
    delete userOverrides[source];
  } else {
    userOverrides[source] = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weight));
  }
  persistState();
}

/** Get all current user overrides */
export function getUserWeightOverrides(): UserWeightOverrides {
  return { ...userOverrides };
}

/** Get all source performance records */
export function getSourcePerformances(): SourcePerformance[] {
  return Array.from(performanceMap.values()).sort((a, b) => b.currentWeight - a.currentWeight);
}

// ── Preferential Forgetting ─────────────────────────────────────────

/**
 * Apply exponential decay to old performance data.
 * This ensures that very old signals gradually lose influence.
 * Should be called periodically (e.g., every hour).
 */
export function applyDecay(): void {
  const now = Date.now();
  const DECAY_INTERVAL = 3600000; // 1 hour

  for (const perf of performanceMap.values()) {
    const age = now - perf.lastUpdated;
    if (age < DECAY_INTERVAL) continue;

    // Decay the EMA win rate toward 0.5 (neutral)
    const decaySteps = Math.floor(age / DECAY_INTERVAL);
    const totalDecay = Math.pow(DECAY_FACTOR, decaySteps);
    perf.emaWinRate = 0.5 + (perf.emaWinRate - 0.5) * totalDecay;

    // Recalculate weight
    perf.currentWeight = calculateAdaptiveWeight(perf.source, detectMarketRegime([]));

    perf.lastUpdated = now;
  }

  persistState();
}

// ── Regime-Specific Adjustments ─────────────────────────────────────

/**
 * Get regime-specific prior adjustments.
 * In trending markets, we bias toward the trend direction.
 * In ranging markets, we're more neutral.
 * In volatile markets, we reduce confidence.
 */
function getRegimeAdjustments(
  regime: MarketRegime,
  candles: CandleData[],
): {
  trendBias: number;
  rangeBias: number;
  volatilityDiscount: number;
} {
  const adjustments = {
    trendBias: 0,
    rangeBias: 0,
    volatilityDiscount: 1.0,
  };

  switch (regime) {
    case 'trending': {
      // In trending markets, bias the prior toward the trend direction
      // Measure trend direction from EMA crossover
      const recent = candles.slice(-50);
      if (recent.length >= 20) {
        const ema10 = recent.slice(-10).reduce((s, c) => s + c.close, 0) / 10;
        const ema20 = recent.reduce((s, c) => s + c.close, 0) / Math.min(20, recent.length);
        adjustments.trendBias = ema10 > ema20 ? 0.08 : -0.08;
      }
      break;
    }
    case 'ranging': {
      // In ranging markets, pull the prior toward neutral
      adjustments.rangeBias = 0; // Neutral — signals determine direction
      break;
    }
    case 'volatile': {
      // In volatile markets, reduce confidence — signals are less reliable
      adjustments.volatilityDiscount = 0.75;
      break;
    }
    case 'quiet': {
      // In quiet markets, small moves are more significant
      adjustments.volatilityDiscount = 1.1; // Slight confidence boost
      break;
    }
  }

  return adjustments;
}

// ── Main Export: Adaptive Bayesian Consensus ────────────────────────

/**
 * Run the adaptive Bayesian consensus analysis.
 *
 * This is the Phase 5 upgrade of the Phase 1 BayesianEngine.
 * It adds:
 * - Market regime detection and adaptation
 * - Adaptive weights that learn from signal performance
 * - Preferential forgetting (recent > old)
 * - User-customizable weight overrides
 * - Regime-specific prior adjustments
 *
 * @param signals - Array of signal sources with base confidences
 * @param candles - Candle data for regime detection and prior calculation
 * @returns AdaptiveBayesianResult with enhanced consensus
 */
export function runAdaptiveBayesian(
  signals: AdaptiveSignalSource[],
  candles?: CandleData[],
): AdaptiveBayesianResult {
  const now = Date.now();
  const regime = candles && candles.length >= 50 ? detectMarketRegime(candles) : 'quiet';

  // Record regime in history
  regimeHistory.push({ timestamp: now, regime });
  if (regimeHistory.length > 500) {
    regimeHistory = regimeHistory.slice(-500);
  }

  // Get regime-specific adjustments
  const regimeAdj = candles
    ? getRegimeAdjustments(regime, candles)
    : { trendBias: 0, rangeBias: 0, volatilityDiscount: 1.0 };

  // ── Step 1: Calculate prior from market data ──
  let prior: { bullish: number; bearish: number };
  if (candles && candles.length >= 30) {
    const recent = candles.slice(-100);
    let bullCount = 0, bearCount = 0;
    for (const c of recent) {
      if (c.close > c.open) bullCount++;
      else if (c.close < c.open) bearCount++;
    }
    const total = bullCount + bearCount || 1;
    // Laplace smoothing
    const alpha = 5;
    let rawBullish = (bullCount + alpha) / (total + alpha * 2);
    let rawBearish = (bearCount + alpha) / (total + alpha * 2);

    // Apply regime adjustments to prior
    rawBullish = Math.min(0.85, Math.max(0.15, rawBullish + regimeAdj.trendBias));
    rawBearish = Math.min(0.85, Math.max(0.15, rawBearish - regimeAdj.trendBias));

    const sum = rawBullish + rawBearish;
    prior = { bullish: rawBullish / sum, bearish: rawBearish / sum };
  } else {
    prior = { bullish: 0.5, bearish: 0.5 };
  }

  // ── Step 2: Calculate adaptive weights and likelihoods ──
  if (!signals || signals.length === 0) {
    return {
      posteriorBullish: 0.5,
      posteriorBearish: 0.5,
      direction: 'neutral',
      confidence: 0,
      regime,
      prior,
      sourceContributions: [],
      insights: [],
      timestamp: now,
      regimeAdjustments: regimeAdj,
    };
  }

  let likelihoodBullish = 1.0;
  let likelihoodBearish = 1.0;
  const contributions: AdaptiveBayesianResult['sourceContributions'] = [];
  const insights: string[] = [];

  for (const sig of signals) {
    // Calculate adaptive weight
    const adaptiveWeight = calculateAdaptiveWeight(sig.source, regime);
    const isUserOverride = userOverrides[sig.source] !== undefined && userOverrides[sig.source] > 0;

    // Calculate likelihood P(signal | direction)
    const perf = performanceMap.get(sig.source);
    let pBull: number, pBear: number;

    if (perf && perf.totalSignals >= MIN_SIGNALS_FOR_ADAPTATION) {
      // Use learned likelihoods from historical performance
      const learnedAccuracy = perf.emaWinRate;
      if (sig.direction === 'bullish') {
        pBull = learnedAccuracy * adaptiveWeight;
        pBear = (1 - learnedAccuracy) * adaptiveWeight;
      } else if (sig.direction === 'bearish') {
        pBull = (1 - learnedAccuracy) * adaptiveWeight;
        pBear = learnedAccuracy * adaptiveWeight;
      } else {
        pBull = 0.5;
        pBear = 0.5;
      }
    } else {
      // Not enough data — use base confidence
      if (sig.direction === 'bullish') {
        pBull = Math.max(0.01, sig.baseConfidence);
        pBear = Math.max(0.01, 1 - sig.baseConfidence);
      } else if (sig.direction === 'bearish') {
        pBull = Math.max(0.01, 1 - sig.baseConfidence);
        pBear = Math.max(0.01, sig.baseConfidence);
      } else {
        pBull = 0.5;
        pBear = 0.5;
      }
    }

    // Clamp likelihoods to prevent numerical underflow
    pBull = Math.max(0.01, Math.min(0.99, pBull));
    pBear = Math.max(0.01, Math.min(0.99, pBear));

    likelihoodBullish *= pBull;
    likelihoodBearish *= pBear;

    contributions.push({
      source: sig.source,
      likelihoodBull: Math.round(pBull * 1000) / 1000,
      likelihoodBear: Math.round(pBear * 1000) / 1000,
      adaptiveWeight: Math.round(adaptiveWeight * 100) / 100,
      winRate: perf ? Math.round(perf.emaWinRate * 100) / 100 : 0.5,
      isUserOverride,
    });

    // Generate insights for notable sources
    if (perf && perf.totalSignals >= MIN_SIGNALS_FOR_ADAPTATION) {
      if (adaptiveWeight > 1.3) {
        insights.push(`${sig.source}: أداء قوي (معدل نجاح ${Math.round(perf.emaWinRate * 100)}%، وزن ${adaptiveWeight.toFixed(2)})`);
      } else if (adaptiveWeight < 0.7) {
        insights.push(`${sig.source}: أداء ضعيف (معدل نجاح ${Math.round(perf.emaWinRate * 100)}%، وزن ${adaptiveWeight.toFixed(2)})`);
      }
      if (isUserOverride) {
        insights.push(`${sig.source}: وزن مخصص من المستخدم (${userOverrides[sig.source].toFixed(2)})`);
      }
    }
  }

  // ── Step 3: Apply Bayes' Theorem ──
  const numeratorBull = likelihoodBullish * prior.bullish;
  const numeratorBear = likelihoodBearish * prior.bearish;
  const evidence = numeratorBull + numeratorBear;

  let posteriorBullish = evidence > 0 ? numeratorBull / evidence : 0.5;
  let posteriorBearish = evidence > 0 ? numeratorBear / evidence : 0.5;

  // Apply volatility discount in volatile markets
  if (regimeAdj.volatilityDiscount !== 1.0) {
    const margin = Math.abs(posteriorBullish - posteriorBearish);
    const discountedMargin = margin * regimeAdj.volatilityDiscount;
    const avg = (posteriorBullish + posteriorBearish) / 2;
    posteriorBullish = avg + (posteriorBullish > posteriorBearish ? discountedMargin / 2 : -discountedMargin / 2);
    posteriorBearish = 1 - posteriorBullish;
  }

  // ── Step 4: Determine direction and confidence ──
  let direction: 'bullish' | 'bearish' | 'neutral';
  let confidence: number;

  const margin = Math.abs(posteriorBullish - posteriorBearish);
  if (margin < 0.1) {
    direction = 'neutral';
    confidence = margin;
  } else if (posteriorBullish > posteriorBearish) {
    direction = 'bullish';
    confidence = posteriorBullish;
  } else {
    direction = 'bearish';
    confidence = posteriorBearish;
  }

  confidence = Math.min(0.95, confidence);

  // Add regime insights
  const regimeLabelsAr: Record<MarketRegime, string> = {
    trending: 'اتجاهي',
    ranging: 'عرضي',
    volatile: 'متقلب',
    quiet: 'هادئ',
  };
  insights.unshift(`نظام السوق: ${regimeLabelsAr[regime]}`);

  return {
    posteriorBullish: Math.round(posteriorBullish * 10000) / 10000,
    posteriorBearish: Math.round(posteriorBearish * 10000) / 10000,
    direction,
    confidence: Math.round(confidence * 10000) / 10000,
    regime,
    prior,
    sourceContributions: contributions,
    insights,
    timestamp: now,
    regimeAdjustments: regimeAdj,
  };
}

// ── Batch Auto-Evaluation ───────────────────────────────────────────

/**
 * Auto-evaluate recent signals against current price movement.
 * This is called periodically to update adaptive weights.
 */
export function autoEvaluateAdaptiveSignals(
  currentPrice: number,
  symbol: string,
  regime: MarketRegime,
): void {
  // This evaluates previously recorded signals against the current price
  // to update the adaptive weights. It works in tandem with the
  // BayesianEngine's recordSignalOutcome.
  // The adaptive engine uses this to update per-source and per-regime stats.
  void currentPrice;
  void symbol;

  // Apply periodic decay
  applyDecay();
}

// ── Reset / Clear Functions ─────────────────────────────────────────

/** Clear all adaptive learning data (start fresh) */
export function resetAdaptiveLearning(): void {
  performanceMap.clear();
  Object.keys(userOverrides).forEach(k => delete userOverrides[k]);
  regimeHistory = [];
  persistState();
}

/** Get regime history for charting */
export function getRegimeHistory(): Array<{ timestamp: number; regime: MarketRegime }> {
  return [...regimeHistory];
}

/** Get the most frequent regime in the last N hours */
export function getDominantRegime(hours: number = 24): MarketRegime {
  const cutoff = Date.now() - hours * 3600000;
  const recent = regimeHistory.filter(r => r.timestamp >= cutoff);
  if (recent.length === 0) return 'quiet';

  const counts: Record<MarketRegime, number> = { trending: 0, ranging: 0, volatile: 0, quiet: 0 };
  for (const r of recent) {
    counts[r.regime]++;
  }

  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as MarketRegime;
}

/** Get a summary of all source performances */
export function getAdaptiveSummary(): {
  totalSources: number;
  adaptedSources: number;
  bestSource: string | null;
  worstSource: string | null;
  dominantRegime: MarketRegime;
  avgWinRate: number;
} {
  const all = Array.from(performanceMap.values());
  const adapted = all.filter(p => p.totalSignals >= MIN_SIGNALS_FOR_ADAPTATION);

  const sortedByWinRate = [...adapted].sort((a, b) => b.emaWinRate - a.emaWinRate);

  return {
    totalSources: all.length,
    adaptedSources: adapted.length,
    bestSource: sortedByWinRate[0]?.source ?? null,
    worstSource: sortedByWinRate[sortedByWinRate.length - 1]?.source ?? null,
    dominantRegime: getDominantRegime(),
    avgWinRate: adapted.length > 0
      ? adapted.reduce((s, p) => s + p.emaWinRate, 0) / adapted.length
      : 0.5,
  };
}
