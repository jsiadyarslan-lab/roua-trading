// ═══════════════════════════════════════════════════════════════════════
// ROUA Multi-Timeframe Analysis Engine — Phase 3 (Upgraded)
//
// Analyzes 3-4 timeframes simultaneously and produces a confluence
// signal. Higher TF determines trend direction, lower TF determines
// entry timing. Matches professional MTF methodology:
//
// Weekly  → Trend direction (macro)
// 4H      → Structure confirmation
// 1H      → Entry timing
// 15m     → Precision entry
//
// UPGRADES from Phase 3:
// - Trend alignment analysis (trend/counter-trend/ranging per TF)
// - Fibonacci confluence across timeframes
// - S/R confluence across timeframes (shared levels)
// - Bayesian integration per timeframe
// - Conflict detection with Arabic interpretation
// - Auto trading style detection from current timeframe
// - MTF signal extraction for unified analysis consensus
// - Momentum divergence across timeframes
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { runUnifiedAnalysis, type UnifiedAnalysisResult } from './unified-analysis';
import { calcATR } from './ATRAdapter';
import { safeMax, safeMin } from './chart-utils';

// ── Types ───────────────────────────────────────────────────────────

/** Timeframe identifiers matching Binance intervals */
export type MTFTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

/** Trend state for a single timeframe */
export type TFTrendState = 'uptrend' | 'downtrend' | 'ranging' | 'counter-uptrend' | 'counter-downtrend';

/** Analysis result for a single timeframe */
export interface TimeframeAnalysis {
  /** Timeframe identifier */
  timeframe: MTFTimeframe;
  /** Unified analysis result */
  analysis: UnifiedAnalysisResult;
  /** Dominant direction from this TF */
  direction: 'bullish' | 'bearish' | 'neutral';
  /** Signal strength (weighted confidence) */
  strength: number;
  /** Key signals found in this TF */
  keySignals: MTFSignal[];
  /** Number of patterns detected */
  patternCount: number;
  /** Candle count used */
  candleCount: number;
  /** Trend state of this timeframe */
  trendState: TFTrendState;
  /** Key S/R levels from this TF */
  keyLevels: MTFSRLevel[];
  /** Fibonacci levels from this TF (if any pattern detected) */
  fibLevels: FibLevel[];
  /** Momentum direction (short-term vs medium-term) */
  momentum: 'accelerating' | 'decelerating' | 'diverging' | 'neutral';
  /** ATR value for this TF */
  atr: number;
  /** Volatility regime for this TF */
  volRegime: 'low' | 'normal' | 'high' | 'extreme';
}

/** A signal from a specific timeframe */
export interface MTFSignal {
  source: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  timeframe: MTFTimeframe;
  weight: number;
}

/** Key S/R level from a timeframe */
export interface MTFSRLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number;
  timeframe: MTFTimeframe;
}

/** Fibonacci level from a timeframe */
export interface FibLevel {
  ratio: number;
  price: number;
  label: string;
  labelAr: string;
  timeframe: MTFTimeframe;
}

/** Fibonacci confluence zone across timeframes */
export interface FibConfluence {
  price: number;
  ratios: Array<{ tf: MTFTimeframe; ratio: number; label: string }>;
  strength: number;
  direction: 'bullish' | 'bearish' | 'neutral';
}

/** MTF divergence detection */
export interface MTFDivergence {
  type: 'bullish-divergence' | 'bearish-divergence' | 'momentum-divergence';
  higherTF: MTFTimeframe;
  lowerTF: MTFTimeframe;
  descriptionAr: string;
  significance: number;
}

/** Complete MTF analysis result */
export interface MTFResult {
  /** Per-timeframe analysis */
  timeframes: TimeframeAnalysis[];
  /** MTF confluence direction */
  confluenceDirection: 'bullish' | 'bearish' | 'neutral';
  /** MTF confluence score (0-100) */
  confluenceScore: number;
  /** Timeframes agreeing with confluence */
  agreeingTFs: number;
  /** Total timeframes analyzed */
  totalTFs: number;
  /** Interpretation in Arabic */
  interpretationAr: string;
  /** Entry recommendation based on MTF */
  entryRecommendation: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    preferredTimeframe: MTFTimeframe;
    reasonAr: string;
  };
  /** Fibonacci confluence zones */
  fibConfluences: FibConfluence[];
  /** S/R confluence zones (levels shared by multiple TFs) */
  srConfluences: SRConfluence[];
  /** Divergences between timeframes */
  divergences: MTFDivergence[];
  /** Auto-detected trading style */
  detectedStyle: 'scalping' | 'intraday' | 'swing' | 'position';
  /** MTF signals for unified analysis integration */
  signals: MTFSignal[];
  /** Timestamp */
  timestamp: number;
}

/** S/R confluence zone (shared across timeframes) */
export interface SRConfluence {
  price: number;
  type: 'support' | 'resistance';
  timeframes: MTFTimeframe[];
  combinedStrength: number;
  labelAr: string;
}

// ── Timeframe Hierarchy ─────────────────────────────────────────────

/**
 * Standard timeframe groups for MTF analysis.
 * Each group has a "trend" TF, "structure" TF, and "entry" TF.
 */
const TF_GROUPS: Record<string, MTFTimeframe[]> = {
  scalping: ['1m', '5m', '15m'],
  intraday: ['15m', '1h', '4h'],
  swing:    ['1h', '4h', '1d'],
  position: ['4h', '1d', '1w'],
};

/** Weight for each TF level: higher = more trend influence */
const TF_WEIGHTS: Record<MTFTimeframe, number> = {
  '1w': 1.0,   // Macro trend
  '1d': 0.85,  // Primary direction
  '4h': 0.7,   // Structure confirmation
  '1h': 0.55,  // Entry timing
  '15m': 0.4,  // Precision entry
  '5m': 0.3,   // Scalp precision
  '1m': 0.2,   // Micro precision
};

/** Arabic labels for timeframes */
const TF_LABELS_AR: Record<MTFTimeframe, string> = {
  '1w': 'أسبوعي',
  '1d': 'يومي',
  '4h': '4 ساعات',
  '1h': 'ساعة',
  '15m': '15 دقيقة',
  '5m': '5 دقائق',
  '1m': 'دقيقة',
};

/** Arabic labels for trend states */
const TREND_STATE_AR: Record<TFTrendState, string> = {
  'uptrend': 'اتجاه صاعد',
  'downtrend': 'اتجاه هابط',
  'ranging': 'عرضي/تذبذب',
  'counter-uptrend': 'ارتداد صاعد (عكس الاتجاه)',
  'counter-downtrend': 'ارتداد هابط (عكس الاتجاه)',
};

/** Map current timeframe to trading style */
const TF_TO_STYLE: Record<string, 'scalping' | 'intraday' | 'swing' | 'position'> = {
  '1s': 'scalping', '5s': 'scalping', '15s': 'scalping', '30s': 'scalping',
  '1min': 'scalping', '5min': 'scalping',
  '15min': 'intraday', '30min': 'intraday',
  '1h': 'intraday', '2h': 'swing',
  '4h': 'swing',
  '1day': 'position', '1week': 'position', '1month': 'position', '3month': 'position',
};

// ── In-memory Cache ─────────────────────────────────────────────────

const analysisCache = new Map<string, { result: TimeframeAnalysis; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache

// ── Auto Style Detection ────────────────────────────────────────────

/**
 * Auto-detect trading style from the current timeframe selection.
 * This maps the active chart timeframe to the appropriate MTF group.
 */
export function detectTradingStyle(currentTimeframe: string): 'scalping' | 'intraday' | 'swing' | 'position' {
  return TF_TO_STYLE[currentTimeframe] || 'intraday';
}

// ── Single TF Analysis ──────────────────────────────────────────────

/**
 * Run unified analysis on a single timeframe's candle data.
 * Enhanced with trend state detection, key levels, and Fibonacci extraction.
 */
function analyzeSingleTF(
  candles: CandleData[],
  timeframe: MTFTimeframe,
  higherTFDirection?: 'bullish' | 'bearish' | 'neutral',
): TimeframeAnalysis {
  const cacheKey = `${timeframe}_${candles.length}_${candles[candles.length - 1]?.time}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  // Run unified analysis
  const analysis = runUnifiedAnalysis(candles);

  // Extract key signals
  const keySignals: MTFSignal[] = analysis.signals.map(s => ({
    source: s.source,
    direction: s.direction,
    confidence: s.confidence,
    timeframe,
    weight: TF_WEIGHTS[timeframe],
  }));

  // Determine dominant direction from consensus
  const bullSignals = analysis.signals.filter(s => s.direction === 'bullish');
  const bearSignals = analysis.signals.filter(s => s.direction === 'bearish');

  const bullStrength = bullSignals.reduce((sum, s) => sum + s.confidence * s.weight, 0);
  const bearStrength = bearSignals.reduce((sum, s) => sum + s.confidence * s.weight, 0);
  const totalStrength = bullStrength + bearStrength;

  let direction: 'bullish' | 'bearish' | 'neutral';
  let strength: number;

  if (totalStrength === 0) {
    direction = 'neutral';
    strength = 0;
  } else if (bullStrength > bearStrength * 1.4) {
    direction = 'bullish';
    strength = bullStrength / totalStrength;
  } else if (bearStrength > bullStrength * 1.4) {
    direction = 'bearish';
    strength = bearStrength / totalStrength;
  } else {
    direction = 'neutral';
    strength = 0.3;
  }

  // ── Detect trend state ──
  const trendState = detectTrendState(candles, direction, higherTFDirection);

  // ── Extract key S/R levels ──
  const keyLevels = extractKeyLevels(analysis, timeframe);

  // ── Extract Fibonacci levels ──
  const fibLevels = extractFibLevels(candles, timeframe);

  // ── Detect momentum ──
  const momentum = detectMomentum(candles);

  // ── ATR and volatility regime ──
  const atr = calcATR(candles, 14);
  const volRegime = detectVolRegime(candles, atr);

  const result: TimeframeAnalysis = {
    timeframe,
    analysis,
    direction,
    strength,
    keySignals,
    patternCount: analysis.allPatterns.length,
    candleCount: candles.length,
    trendState,
    keyLevels,
    fibLevels,
    momentum,
    atr,
    volRegime,
  };

  analysisCache.set(cacheKey, { result, timestamp: Date.now() });
  return result;
}

// ── Trend State Detection ───────────────────────────────────────────

/**
 * Determine the trend state for a timeframe.
 * Considers both the TF's own direction and the higher TF's direction
 * to identify counter-trend moves (which are trading opportunities).
 */
function detectTrendState(
  candles: CandleData[],
  tfDirection: 'bullish' | 'bearish' | 'neutral',
  higherTFDirection?: 'bullish' | 'bearish' | 'neutral',
): TFTrendState {
  if (candles.length < 30) return 'ranging';

  // Use EMA crossover for trend determination
  const closes = candles.map(c => c.close);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);

  if (ema20 === null || ema50 === null) return 'ranging';

  const isUptrend = ema20 > ema50;
  const isDowntrend = ema20 < ema50;

  // Price relative to EMAs
  const lastClose = closes[closes.length - 1];
  const aboveBoth = lastClose > ema20 && lastClose > ema50;
  const belowBoth = lastClose < ema20 && lastClose < ema50;

  // Check if counter-trend (TF direction vs higher TF)
  if (higherTFDirection === 'bullish' && isDowntrend) return 'counter-downtrend';
  if (higherTFDirection === 'bearish' && isUptrend) return 'counter-uptrend';

  if (isUptrend && aboveBoth) return 'uptrend';
  if (isDowntrend && belowBoth) return 'downtrend';

  return 'ranging';
}

/** Simple EMA calculation */
function calcEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// ── Key Level Extraction ────────────────────────────────────────────

/**
 * Extract the most important S/R levels from a unified analysis result.
 * Only returns levels within a reasonable distance of current price.
 */
function extractKeyLevels(analysis: UnifiedAnalysisResult, timeframe: MTFTimeframe): MTFSRLevel[] {
  const levels: MTFSRLevel[] = [];

  for (const level of analysis.srLevels) {
    levels.push({
      price: level.price,
      type: level.type === 'support' ? 'support' : 'resistance',
      strength: level.strength,
      timeframe,
    });
  }

  // Also extract key SMC levels (unbroken order blocks)
  for (const ob of analysis.smcData.orderBlocks) {
    if (!ob.broken) {
      levels.push({
        price: (ob.high + ob.low) / 2,
        type: ob.type === 'bullish' ? 'support' : 'resistance',
        strength: ob.strength,
        timeframe,
      });
    }
  }

  // Sort by strength and take top 6
  return levels.sort((a, b) => b.strength - a.strength).slice(0, 6);
}

// ── Fibonacci Level Extraction ──────────────────────────────────────

/**
 * Extract Fibonacci retracement/extension levels from the most recent
 * significant swing on the timeframe.
 */
function extractFibLevels(candles: CandleData[], timeframe: MTFTimeframe): FibLevel[] {
  if (candles.length < 30) return [];

  const fibs: FibLevel[] = [];
  const recent = candles.slice(-60);

  // Find last significant high and low
  let highIdx = 0, lowIdx = 0;
  let high = -Infinity, low = Infinity;
  for (let i = 0; i < recent.length; i++) {
    if (recent[i].high > high) { high = recent[i].high; highIdx = i; }
    if (recent[i].low < low) { low = recent[i].low; lowIdx = i; }
  }

  const isUptrend = highIdx > lowIdx;
  const range = high - low;

  // Fibonacci retracement levels
  const fibRatios = [
    { ratio: 0, label: '0%', labelAr: '0%' },
    { ratio: 0.236, label: '23.6%', labelAr: '23.6%' },
    { ratio: 0.382, label: '38.2%', labelAr: '38.2%' },
    { ratio: 0.5, label: '50%', labelAr: '50%' },
    { ratio: 0.618, label: '61.8%', labelAr: '61.8%' },
    { ratio: 0.786, label: '78.6%', labelAr: '78.6%' },
    { ratio: 1, label: '100%', labelAr: '100%' },
  ];

  for (const fib of fibRatios) {
    // BUG-018 FIX: Fibonacci retracement levels were INVERTED.
    // Standard retracement in an UPTREND: 0% = low (start of move), 100% = high (end of move).
    //   38.2% retrace = low + range * 0.382 (price retraces UP from low by 38.2% of the move).
    // Old code: high - range * ratio (0% = high, 100% = low) — this is EXTENSION, not retracement.
    // Standard retracement in a DOWNTREND: 0% = high, 100% = low.
    //   38.2% retrace = high - range * 0.382 (price retraces DOWN from high by 38.2%).
    // Old code: low + range * ratio (0% = low, 100% = high) — inverted.
    // Fix: swap the formulas to match TradingView's Fib retracement tool.
    const price = isUptrend
      ? low + range * fib.ratio    // Uptrend: 0% at low, 100% at high
      : high - range * fib.ratio;  // Downtrend: 0% at high, 100% at low
    fibs.push({
      ratio: fib.ratio,
      price: Math.round(price * 100) / 100,
      label: fib.label,
      labelAr: fib.labelAr,
      timeframe,
    });
  }

  return fibs;
}

// ── Momentum Detection ──────────────────────────────────────────────

/**
 * Detect momentum state by comparing short-term vs medium-term
 * price velocity and acceleration.
 */
function detectMomentum(candles: CandleData[]): 'accelerating' | 'decelerating' | 'diverging' | 'neutral' {
  if (candles.length < 30) return 'neutral';

  const recent = candles.slice(-20);
  const older = candles.slice(-40, -20);

  if (older.length < 10) return 'neutral';

  // Price velocity: average price change per candle
  const recentVelocity = (recent[recent.length - 1].close - recent[0].close) / recent.length;
  const olderVelocity = (older[older.length - 1].close - older[0].close) / older.length;

  // Volume trend
  const recentAvgVol = recent.reduce((s, c) => s + (c.volume || 0), 0) / recent.length;
  const olderAvgVol = older.reduce((s, c) => s + (c.volume || 0), 0) / older.length;
  const volIncreasing = recentAvgVol > olderAvgVol * 1.15;
  const volDecreasing = recentAvgVol < olderAvgVol * 0.85;

  // Momentum classification
  const absRecent = Math.abs(recentVelocity);
  const absOlder = Math.abs(olderVelocity);

  if (absRecent > absOlder * 1.5 && volIncreasing) return 'accelerating';
  if (absRecent < absOlder * 0.6 && volDecreasing) return 'decelerating';

  // Divergence: price moving one way but momentum weakening
  const recentDir = recentVelocity > 0 ? 'up' : 'down';
  const olderDir = olderVelocity > 0 ? 'up' : 'down';
  if (recentDir !== olderDir && absRecent > absOlder * 0.5) return 'diverging';

  return 'neutral';
}

// ── Volatility Regime Detection ─────────────────────────────────────

/**
 * Detect the volatility regime for a timeframe by comparing
 * current ATR to historical ATR distribution.
 */
function detectVolRegime(candles: CandleData[], currentATR: number): 'low' | 'normal' | 'high' | 'extreme' {
  if (candles.length < 50) return 'normal';
  const close = candles[candles.length - 1]?.close ?? 0;
  if (close === 0) return 'normal';

  const atrPct = currentATR / close;
  if (atrPct > 0.03) return 'extreme';
  if (atrPct > 0.02) return 'high';
  if (atrPct > 0.005) return 'normal';
  return 'low';
}

// ── MTF Confluence Calculation ──────────────────────────────────────

/**
 * Calculate MTF confluence from multiple timeframe analyses.
 * Uses weighted scoring: higher TFs have more influence on direction.
 * Enhanced with conflict detection and trend alignment scoring.
 */
function calculateConfluence(tfAnalyses: TimeframeAnalysis[]): {
  direction: 'bullish' | 'bearish' | 'neutral';
  score: number;
  agreeingTFs: number;
} {
  if (tfAnalyses.length === 0) {
    return { direction: 'neutral', score: 0, agreeingTFs: 0 };
  }

  let bullScore = 0;
  let bearScore = 0;
  let totalWeight = 0;

  for (const tf of tfAnalyses) {
    const weight = TF_WEIGHTS[tf.timeframe] || 0.5;
    totalWeight += weight;

    // Base direction score
    if (tf.direction === 'bullish') {
      bullScore += weight * tf.strength;
    } else if (tf.direction === 'bearish') {
      bearScore += weight * tf.strength;
    }

    // Trend alignment bonus: if this TF's trend state aligns with its direction
    const alignmentBonus = getTrendAlignmentBonus(tf.trendState, tf.direction);
    if (tf.direction === 'bullish') {
      bullScore += weight * alignmentBonus * 0.2;
    } else if (tf.direction === 'bearish') {
      bearScore += weight * alignmentBonus * 0.2;
    }

    // Momentum bonus: accelerating in the same direction
    if (tf.momentum === 'accelerating' && tf.direction === 'bullish') {
      bullScore += weight * 0.1;
    } else if (tf.momentum === 'accelerating' && tf.direction === 'bearish') {
      bearScore += weight * 0.1;
    }
  }

  if (totalWeight === 0) {
    return { direction: 'neutral', score: 0, agreeingTFs: 0 };
  }

  const maxScore = Math.max(bullScore, bearScore);
  const direction = bullScore > bearScore * 1.3 ? 'bullish'
    : bearScore > bullScore * 1.3 ? 'bearish'
    : 'neutral';

  const score = Math.min(100, Math.round((maxScore / totalWeight) * 100));
  const agreeingTFs = tfAnalyses.filter(tf => tf.direction === direction).length;

  return { direction, score, agreeingTFs };
}

/** Get alignment bonus based on trend state vs direction */
function getTrendAlignmentBonus(trendState: TFTrendState, direction: 'bullish' | 'bearish' | 'neutral'): number {
  if (direction === 'neutral') return 0;
  if (trendState === 'uptrend' && direction === 'bullish') return 1.0;
  if (trendState === 'downtrend' && direction === 'bearish') return 1.0;
  if (trendState === 'counter-uptrend' && direction === 'bullish') return 0.5;
  if (trendState === 'counter-downtrend' && direction === 'bearish') return 0.5;
  if (trendState === 'ranging') return 0.3;
  // Counter-trend: reduced bonus
  return 0.1;
}

// ── Fibonacci Confluence Detection ──────────────────────────────────

/**
 * Find Fibonacci levels that align across multiple timeframes.
 * When a 61.8% retracement on 4H aligns with a 38.2% level on 1D,
 * that's a very strong confluence zone.
 */
function detectFibConfluences(tfAnalyses: TimeframeAnalysis[]): FibConfluence[] {
  const allFibs: Array<{ price: number; ratio: number; label: string; tf: MTFTimeframe }> = [];

  for (const tf of tfAnalyses) {
    for (const fib of tf.fibLevels) {
      allFibs.push({ price: fib.price, ratio: fib.ratio, label: fib.label, tf: fib.timeframe });
    }
  }

  if (allFibs.length < 2) return [];

  const confluences: FibConfluence[] = [];
  const tolerance = 0.003; // 0.3% tolerance for confluence

  // Group fibs by proximity
  const used = new Set<number>();
  for (let i = 0; i < allFibs.length; i++) {
    if (used.has(i)) continue;

    const group: typeof allFibs = [allFibs[i]];
    used.add(i);

    for (let j = i + 1; j < allFibs.length; j++) {
      if (used.has(j)) continue;
      const priceDiff = Math.abs(allFibs[j].price - allFibs[i].price) / allFibs[i].price;
      if (priceDiff < tolerance) {
        group.push(allFibs[j]);
        used.add(j);
      }
    }

    // Need at least 2 TFs agreeing
    if (group.length >= 2) {
      const uniqueTFs = new Set(group.map(g => g.tf));
      if (uniqueTFs.size >= 2) {
        const avgPrice = group.reduce((s, g) => s + g.price, 0) / group.length;
        confluences.push({
          price: Math.round(avgPrice * 100) / 100,
          ratios: group.map(g => ({ tf: g.tf, ratio: g.ratio, label: g.label })),
          strength: Math.min(1.0, uniqueTFs.size * 0.3 + group.length * 0.1),
          direction: avgPrice > allFibs[0].price ? 'bullish' : 'bearish',
        });
      }
    }
  }

  return confluences.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

// ── S/R Confluence Detection ────────────────────────────────────────

/**
 * Find S/R levels that appear across multiple timeframes.
 * A support level at $65,000 on both 4H and 1D is much stronger
 * than one that only appears on a single timeframe.
 */
function detectSRConfluences(tfAnalyses: TimeframeAnalysis[]): SRConfluence[] {
  const allLevels: MTFSRLevel[] = [];
  for (const tf of tfAnalyses) {
    allLevels.push(...tf.keyLevels);
  }

  if (allLevels.length < 2) return [];

  const confluences: SRConfluence[] = [];
  const tolerance = 0.005; // 0.5% tolerance for confluence
  const used = new Set<number>();

  for (let i = 0; i < allLevels.length; i++) {
    if (used.has(i)) continue;

    const group: MTFSRLevel[] = [allLevels[i]];
    used.add(i);

    for (let j = i + 1; j < allLevels.length; j++) {
      if (used.has(j)) continue;
      const priceDiff = Math.abs(allLevels[j].price - allLevels[i].price) / allLevels[i].price;
      if (priceDiff < tolerance && allLevels[j].type === allLevels[i].type) {
        group.push(allLevels[j]);
        used.add(j);
      }
    }

    // Need at least 2 TFs or strong level
    const uniqueTFs = new Set(group.map(g => g.timeframe));
    if (uniqueTFs.size >= 2 || group.reduce((s, g) => s + g.strength, 0) / group.length > 0.7) {
      const avgPrice = group.reduce((s, g) => s + g.price, 0) / group.length;
      const combinedStrength = Math.min(1.0,
        group.reduce((s, g) => s + g.strength, 0) / group.length +
        (uniqueTFs.size - 1) * 0.15
      );

      confluences.push({
        price: Math.round(avgPrice * 100) / 100,
        type: group[0].type,
        timeframes: Array.from(uniqueTFs),
        combinedStrength,
        labelAr: group[0].type === 'support'
          ? `دعم متعدد الفريمات (${uniqueTFs.size} فريمات)`
          : `مقاومة متعددة الفريمات (${uniqueTFs.size} فريمات)`,
      });
    }
  }

  return confluences.sort((a, b) => b.combinedStrength - a.combinedStrength).slice(0, 5);
}

// ── MTF Divergence Detection ────────────────────────────────────────

/**
 * Detect divergences between timeframes.
 * Bullish divergence: higher TF bearish but lower TF turning bullish
 * Bearish divergence: higher TF bullish but lower TF turning bearish
 * Momentum divergence: price going one way but momentum fading on higher TF
 */
function detectMTFDivergences(tfAnalyses: TimeframeAnalysis[]): MTFDivergence[] {
  const divergences: MTFDivergence[] = [];
  if (tfAnalyses.length < 2) return divergences;

  // Check adjacent TF pairs (higher → lower)
  for (let i = 0; i < tfAnalyses.length - 1; i++) {
    const higher = tfAnalyses[i];
    const lower = tfAnalyses[i + 1];

    // Bullish divergence: higher TF bearish, lower TF bullish (potential reversal)
    if (higher.direction === 'bearish' && lower.direction === 'bullish') {
      divergences.push({
        type: 'bullish-divergence',
        higherTF: higher.timeframe,
        lowerTF: lower.timeframe,
        descriptionAr: `تباعد صعودي: ${TF_LABELS_AR[higher.timeframe]} هابط لكن ${TF_LABELS_AR[lower.timeframe]} يتحول صعودي — احتمال انعكاس`,
        significance: Math.min(1.0, higher.strength * 0.5 + lower.strength * 0.3),
      });
    }

    // Bearish divergence: higher TF bullish, lower TF bearish
    if (higher.direction === 'bullish' && lower.direction === 'bearish') {
      divergences.push({
        type: 'bearish-divergence',
        higherTF: higher.timeframe,
        lowerTF: lower.timeframe,
        descriptionAr: `تباعد هبوطي: ${TF_LABELS_AR[higher.timeframe]} صاعد لكن ${TF_LABELS_AR[lower.timeframe]} يتحول هبوطي — احتمال تصحيح`,
        significance: Math.min(1.0, higher.strength * 0.5 + lower.strength * 0.3),
      });
    }

    // Momentum divergence: higher TF accelerating but lower TF decelerating
    if (higher.momentum === 'accelerating' && lower.momentum === 'decelerating') {
      divergences.push({
        type: 'momentum-divergence',
        higherTF: higher.timeframe,
        lowerTF: lower.timeframe,
        descriptionAr: `تباعد زخم: ${TF_LABELS_AR[higher.timeframe]} يتسارع لكن ${TF_LABELS_AR[lower.timeframe]} يتباطأ — فجوة زخم`,
        significance: 0.4,
      });
    }
  }

  return divergences;
}

// ── Main Export: MTF Analysis ───────────────────────────────────────

/**
 * Run Multi-Timeframe Analysis using pre-fetched candle data.
 *
 * @param tfCandles - Map of timeframe → candle data
 * @param style - Trading style (determines which TFs to use)
 * @returns MTF confluence result
 */
export function runMTFAnalysis(
  tfCandles: Map<MTFTimeframe, CandleData[]>,
  style: 'scalping' | 'intraday' | 'swing' | 'position' = 'intraday',
): MTFResult {
  const targetTFs = TF_GROUPS[style] || TF_GROUPS.intraday;
  const tfAnalyses: TimeframeAnalysis[] = [];

  for (let i = 0; i < targetTFs.length; i++) {
    const tf = targetTFs[i];
    const candles = tfCandles.get(tf);
    if (candles && candles.length >= 30) {
      // Pass higher TF direction for counter-trend detection
      const higherTFDir = i > 0 ? tfAnalyses[i - 1]?.direction : undefined;
      tfAnalyses.push(analyzeSingleTF(candles, tf, higherTFDir));
    }
  }

  const { direction, score, agreeingTFs } = calculateConfluence(tfAnalyses);

  // ── Fibonacci confluences ──
  const fibConfluences = detectFibConfluences(tfAnalyses);

  // ── S/R confluences ──
  const srConfluences = detectSRConfluences(tfAnalyses);

  // ── MTF divergences ──
  const divergences = detectMTFDivergences(tfAnalyses);

  // ── Generate MTF signals for unified analysis ──
  const signals: MTFSignal[] = [];
  for (const tf of tfAnalyses) {
    signals.push({
      source: `mtf_${tf.timeframe}`,
      direction: tf.direction,
      confidence: tf.strength,
      timeframe: tf.timeframe,
      weight: TF_WEIGHTS[tf.timeframe],
    });
    // Add trend alignment signal
    if (tf.trendState === 'uptrend' || tf.trendState === 'downtrend') {
      signals.push({
        source: `mtf_trend_${tf.timeframe}`,
        direction: tf.trendState === 'uptrend' ? 'bullish' : 'bearish',
        confidence: 0.7,
        timeframe: tf.timeframe,
        weight: TF_WEIGHTS[tf.timeframe] * 0.8,
      });
    }
  }

  // Generate Arabic interpretation
  const dirAr = direction === 'bullish' ? 'صاعد' : direction === 'bearish' ? 'هابط' : 'محايد';
  const tfSummary = tfAnalyses.map(tf =>
    `${TF_LABELS_AR[tf.timeframe]}: ${tf.direction === 'bullish' ? '🟢 صاعد' : tf.direction === 'bearish' ? '🔴 هابط' : '⚪ محايد'} (${Math.round(tf.strength * 100)}% — ${TREND_STATE_AR[tf.trendState]})`
  ).join(' | ');

  let interpretationAr: string;
  if (score >= 70 && direction !== 'neutral') {
    interpretationAr = `تقارب ${dirAr} قوي عبر الفريمات — ${agreeingTFs} من ${tfAnalyses.length} فريمات تتفق (مجموع: ${score}%). ${tfSummary}`;
  } else if (score >= 50 && direction !== 'neutral') {
    interpretationAr = `تقارب ${dirAr} متوسط — بعض الفريمات متضاربة (مجموع: ${score}%). ${tfSummary}`;
  } else {
    interpretationAr = `لا تقارب واضح — الفريمات متضاربة أو محايدة (مجموع: ${score}%). ${tfSummary}`;
  }

  // Add divergence warnings to interpretation
  for (const div of divergences.filter(d => d.significance > 0.5)) {
    interpretationAr += ` ⚠️ ${div.descriptionAr}`;
  }

  // Determine entry recommendation
  const lowerTF = tfAnalyses.length > 0 ? tfAnalyses[tfAnalyses.length - 1] : null;
  const preferredTF = lowerTF?.timeframe || targetTFs[targetTFs.length - 1];

  let entryReasonAr: string;
  if (direction !== 'neutral' && score >= 50) {
    const trendWord = direction === 'bullish' ? 'صعودي' : 'هبوطي';
    entryReasonAr = `الاتجاه العام ${trendWord} — انتظر تأكيد على فريم ${TF_LABELS_AR[preferredTF]} للدخول`;
    // Add fib confluence hints
    if (fibConfluences.length > 0) {
      entryReasonAr += ` | تقارب فيبوناتشي عند ${fibConfluences[0].price}`;
    }
    if (srConfluences.length > 0) {
      entryReasonAr += ` | ${srConfluences[0].labelAr} عند ${srConfluences[0].price}`;
    }
  } else {
    entryReasonAr = 'لا يوجد إشارة دخول واضحة — انتظر تقارب أفضل عبر الفريمات';
  }

  return {
    timeframes: tfAnalyses,
    confluenceDirection: direction,
    confluenceScore: score,
    agreeingTFs,
    totalTFs: targetTFs.length,
    interpretationAr,
    entryRecommendation: {
      direction,
      confidence: score / 100,
      preferredTimeframe: preferredTF,
      reasonAr: entryReasonAr,
    },
    fibConfluences,
    srConfluences,
    divergences,
    detectedStyle: style,
    signals,
    timestamp: Date.now(),
  };
}

// ── Binance Klines Fetcher ──────────────────────────────────────────

/**
 * Fetch candle data for a specific timeframe from Binance REST API.
 * Returns an array of CandleData compatible with the analysis engines.
 */
export async function fetchTimeframeCandles(
  symbol: string,
  timeframe: MTFTimeframe,
  limit: number = 200,
): Promise<CandleData[]> {
  const binanceInterval = timeframe;
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${binanceInterval}&limit=${limit}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((k: any[]) => ({
      time: Math.floor(k[0] / 1000) as number,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (e) {
    console.debug(`[MTFEngine] Failed to fetch ${symbol} ${timeframe}:`, e);
    return [];
  }
}

/**
 * Fetch all timeframes for MTF analysis in parallel.
 * Returns a Map of timeframe → candle data.
 */
export async function fetchAllTimeframes(
  symbol: string,
  style: 'scalping' | 'intraday' | 'swing' | 'position' = 'intraday',
  limit: number = 200,
): Promise<Map<MTFTimeframe, CandleData[]>> {
  const targetTFs = TF_GROUPS[style] || TF_GROUPS.intraday;
  const result = new Map<MTFTimeframe, CandleData[]>();

  const fetches = targetTFs.map(async tf => {
    const candles = await fetchTimeframeCandles(symbol, tf, limit);
    if (candles.length > 0) {
      result.set(tf, candles);
    }
  });

  await Promise.allSettled(fetches);
  return result;
}

/**
 * Quick MTF analysis using only the current chart's candle data.
 * This runs a simulated MTF analysis by treating different portions
 * of the candle data as different "timeframes" when actual multi-TF
 * data is not available. Useful as a fallback.
 */
export function runQuickMTFAnalysis(
  candles: CandleData[],
  currentTimeframe: string = '1h',
): MTFResult {
  const style = detectTradingStyle(currentTimeframe);

  // If we have enough candles, we can simulate MTF by sampling
  // Use the actual candles as the "current" TF and create
  // higher TF approximations by aggregating
  const tfCandles = new Map<MTFTimeframe, CandleData[]>();

  // Current timeframe data
  const targetTFs = TF_GROUPS[style] || TF_GROUPS.intraday;
  const currentTF = targetTFs[targetTFs.length - 2] || targetTFs[0];
  tfCandles.set(currentTF, candles);

  // Aggregate for higher TF
  const higherTF = targetTFs[0];
  if (higherTF !== currentTF) {
    const aggregated = aggregateCandles(candles, getAggregationFactor(currentTF, higherTF));
    if (aggregated.length >= 30) {
      tfCandles.set(higherTF, aggregated);
    }
  }

  // Middle TF
  if (targetTFs.length >= 3) {
    const midTF = targetTFs[1];
    if (midTF !== currentTF && midTF !== higherTF) {
      const midAgg = aggregateCandles(candles, getAggregationFactor(currentTF, midTF));
      if (midAgg.length >= 30) {
        tfCandles.set(midTF, midAgg);
      }
    }
  }

  return runMTFAnalysis(tfCandles, style);
}

/** Get aggregation factor to convert from one TF to another */
function getAggregationFactor(from: MTFTimeframe, to: MTFTimeframe): number {
  const tfMinutes: Record<MTFTimeframe, number> = {
    '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080,
  };
  const fromMin = tfMinutes[from] || 60;
  const toMin = tfMinutes[to] || 60;
  return Math.max(1, Math.round(toMin / fromMin));
}

/** Aggregate candles by N (e.g., 4×1H candles → 1×4H candle) */
function aggregateCandles(candles: CandleData[], factor: number): CandleData[] {
  if (factor <= 1) return candles;
  const result: CandleData[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const slice = candles.slice(i, i + factor);
    if (slice.length === 0) continue;
    result.push({
      time: slice[0].time,
      open: slice[0].open,
      high: safeMax(slice.map(c => c.high)),
      low: safeMin(slice.map(c => c.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((s, c) => s + (c.volume || 0), 0),
    });
  }
  return result;
}

// ── Utility Exports ─────────────────────────────────────────────────

export { TF_GROUPS, TF_WEIGHTS, TF_LABELS_AR, TREND_STATE_AR };
