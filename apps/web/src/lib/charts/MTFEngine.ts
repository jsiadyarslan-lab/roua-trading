// ═══════════════════════════════════════════════════════════════════════
// ROUA Multi-Timeframe Analysis Engine — Phase 3
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
// Uses Binance REST API for fetching TF data.
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { runUnifiedAnalysis, type UnifiedAnalysisResult } from './unified-analysis';

// ── Types ───────────────────────────────────────────────────────────

/** Timeframe identifiers matching Binance intervals */
export type MTFTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

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
}

/** A signal from a specific timeframe */
export interface MTFSignal {
  source: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  timeframe: MTFTimeframe;
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
  /** Timestamp */
  timestamp: number;
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

// ── In-memory Cache ─────────────────────────────────────────────────

const analysisCache = new Map<string, { result: TimeframeAnalysis; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache

// ── Single TF Analysis ──────────────────────────────────────────────

/**
 * Run unified analysis on a single timeframe's candle data.
 */
function analyzeSingleTF(
  candles: CandleData[],
  timeframe: MTFTimeframe,
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

  const result: TimeframeAnalysis = {
    timeframe,
    analysis,
    direction,
    strength,
    keySignals,
    patternCount: analysis.allPatterns.length,
    candleCount: candles.length,
  };

  analysisCache.set(cacheKey, { result, timestamp: Date.now() });
  return result;
}

// ── MTF Confluence Calculation ──────────────────────────────────────

/**
 * Calculate MTF confluence from multiple timeframe analyses.
 * Uses weighted scoring: higher TFs have more influence on direction.
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

    if (tf.direction === 'bullish') {
      bullScore += weight * tf.strength;
    } else if (tf.direction === 'bearish') {
      bearScore += weight * tf.strength;
    }
    // Neutral adds to neither
  }

  if (totalWeight === 0) {
    return { direction: 'neutral', score: 0, agreeingTFs: 0 };
  }

  const maxScore = Math.max(bullScore, bearScore);
  const direction = bullScore > bearScore * 1.3 ? 'bullish'
    : bearScore > bullScore * 1.3 ? 'bearish'
    : 'neutral';

  const score = Math.round((maxScore / totalWeight) * 100);
  const agreeingTFs = tfAnalyses.filter(tf => tf.direction === direction).length;

  return { direction, score, agreeingTFs };
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

  for (const tf of targetTFs) {
    const candles = tfCandles.get(tf);
    if (candles && candles.length >= 30) {
      tfAnalyses.push(analyzeSingleTF(candles, tf));
    }
  }

  const { direction, score, agreeingTFs } = calculateConfluence(tfAnalyses);

  // Generate Arabic interpretation
  const dirAr = direction === 'bullish' ? 'صاعد' : direction === 'bearish' ? 'هابط' : 'محايد';
  const tfSummary = tfAnalyses.map(tf =>
    `${TF_LABELS_AR[tf.timeframe]}: ${tf.direction === 'bullish' ? '🟢 صاعد' : tf.direction === 'bearish' ? '🔴 هابط' : '⚪ محايد'} (${Math.round(tf.strength * 100)}%)`
  ).join(' | ');

  let interpretationAr: string;
  if (score >= 70 && direction !== 'neutral') {
    interpretationAr = `تقارب ${dirAr} قوي عبر الفريمات — ${agreeingTFs} من ${tfAnalyses.length} فريمات تتفق (مجموع: ${score}%). ${tfSummary}`;
  } else if (score >= 50 && direction !== 'neutral') {
    interpretationAr = `تقارب ${dirAr} متوسط — بعض الفريمات متضاربة (مجموع: ${score}%). ${tfSummary}`;
  } else {
    interpretationAr = `لا تقارب واضح — الفريمات متضاربة أو محايدة (مجموع: ${score}%). ${tfSummary}`;
  }

  // Determine entry recommendation
  const lowerTF = tfAnalyses.length > 0 ? tfAnalyses[tfAnalyses.length - 1] : null;
  const preferredTF = lowerTF?.timeframe || targetTFs[targetTFs.length - 1];

  let entryReasonAr: string;
  if (direction !== 'neutral' && score >= 50) {
    entryReasonAr = `الاتجاه العام ${dirAr} — انتظر تأكيد على فريم ${TF_LABELS_AR[preferredTF]} للدخول`;
  } else {
    entryReasonAr = 'لا يوجد إشارة دخول واضحة — انتظر تقارب أفضل';
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

// ── Utility Exports ─────────────────────────────────────────────────

export { TF_GROUPS, TF_WEIGHTS, TF_LABELS_AR };
