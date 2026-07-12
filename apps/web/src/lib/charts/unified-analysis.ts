// ═══════════════════════════════════════════════════════════════════════
// ROUA Unified Analysis Layer — Phase 2 Engine Aggregation
//
// Aggregates results from ALL detection engines:
// - Professional Harmonic Engine (ProfessionalHarmonicPatterns.ts)
// - Pattern Engine (pattern-engine.ts)
// - Advanced Wyckoff Engine (WyckoffEngine.ts)
// - Advanced Elliott Wave Engine (ElliottEngine.ts)
// - SMC Detection (SMCDetector.ts)
// - Classic/Geometric Patterns (chart-detection.ts, GeometricPatterns.ts)
// - Support/Resistance (chart-detection.ts)
//
// Produces weighted signals and a unified AIPattern array for rendering.
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData, AIPattern } from './types';
import type { SwingPoint } from './chart-detection';
import { validateAnalysis, validateTradeSetup } from './AnalysisValidator';
import { safeEngineCall, logWarn, logError } from './AnalysisLogger';

// Engine imports
import { computeZigZag, detectClassicPatterns, detectSRLevels } from './chart-detection';
import { detectSMC } from './SMCDetector';
import { detectHarmonicPatternsPro, detectClassicPatternsPro } from './ProfessionalHarmonicPatterns';
import { runPatternEngine } from './pattern-engine';
import { calcATR } from './ATRAdapter';
import { detectElliottAdvanced, elliottToAIPatterns } from './ElliottEngine';
import type { ElliottResult } from './ElliottEngine';
import { detectWyckoffAdvanced, wyckoffToAIPatterns } from './WyckoffEngine';
import type { WyckoffResult } from './WyckoffEngine';
import { detectGeometricPatterns } from './GeometricPatterns';

// ── Detector Signal Type ─────────────────────────────────────────────

/**
 * A signal from a specific detection engine.
 * Used for weighted consensus calculation.
 */
interface DetectorSignal {
  /** Source engine name (e.g. 'harmonic', 'elliott', 'wyckoff') */
  source: string;
  /** Directional bias of this signal */
  direction: 'bullish' | 'bearish' | 'neutral';
  /** Confidence of this signal (0–1) */
  confidence: number;
  /** Weight of this signal in the consensus calculation */
  weight: number;
}

// ── Signal Weights ───────────────────────────────────────────────────

/**
 * Predefined weights for each detection engine.
 * Higher weight = more influence on the final consensus direction.
 * Based on typical reliability of each approach:
 * - Harmonic patterns: very precise Fibonacci ratios → high weight
 * - Elliott Wave: structured with Fibonacci verification → high weight
 * - Wyckoff: full market structure analysis → moderate-high weight
 * - Order Blocks: strong institutional concept → high weight
 * - SMC (BOS/CHoCH): reliable structure signals → moderate-high weight
 * - Candlestick patterns: many false signals → moderate weight
 * - Geometric patterns: can be noisy → lower weight
 * - FVG: useful but often requires confluence → moderate weight
 */
const SIGNAL_WEIGHTS: Record<string, number> = {
  harmonic: 0.8,
  elliott: 0.75,
  wyckoff: 0.7,
  orderblock: 0.75,
  smc: 0.7,
  candlestick: 0.6,
  geometric: 0.5,
  fvg: 0.55,
};

// ── Unified Analysis Result ──────────────────────────────────────────

/**
 * Complete unified analysis result from all engines.
 */
export interface UnifiedAnalysisResult {
  /** Support and resistance levels from detectSRLevels */
  srLevels: ReturnType<typeof detectSRLevels>;
  /** Local/classic chart patterns converted to AIPattern */
  localPatterns: AIPattern[];
  /** SMC data (order blocks, FVGs, structure breaks) */
  smcData: ReturnType<typeof detectSMC>;
  /** Harmonic pattern results from the professional engine */
  harmonicResults: AIPattern[];
  /** Wyckoff analysis result */
  wyckoffResult: WyckoffResult;
  /** Elliott Wave analysis result */
  elliottResult: ElliottResult;
  /** Wyckoff patterns converted to AIPattern format */
  wyckoffPatterns: AIPattern[];
  /** Elliott patterns converted to AIPattern format */
  elliottPatterns: AIPattern[];
  /** Weighted signals from all engines */
  signals: DetectorSignal[];
  /** All patterns merged and sorted by confidence */
  allPatterns: AIPattern[];
  /** Weighted consensus result from all detector signals */
  consensus: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  };
  /** Engine version identifier */
  engineVersion: string;
  /** Unix timestamp of when the analysis was run */
  detectionTimestamp: number;
}

// ── Engine Version ───────────────────────────────────────────────────

const ENGINE_VERSION = '2.0.0-phase5';

// ── Minimum Candles ──────────────────────────────────────────────────

const MIN_CANDLES = 30;

// ── Helper: Convert local patterns to AIPattern ──────────────────────

/**
 * Convert classic detected patterns (from chart-detection) to AIPattern format.
 * These include Head & Shoulders, Double Top/Bottom, Triangles, etc.
 */
function classicPatternsToAIPatterns(candles: CandleData[], swings: SwingPoint[]): AIPattern[] {
  const patterns: AIPattern[] = [];

  // Classic chart patterns from chart-detection
  const classicPatterns = detectClassicPatterns(swings);
  for (const p of classicPatterns) {
    patterns.push({
      type: p.type,
      labelAr: getClassicLabelAr(p.type),
      time: p.points.length > 0 ? p.points[p.points.length - 1].time : 0,
      price: p.points.length > 0 ? p.points[p.points.length - 1].price : 0,
      confidence: p.confidence,
      direction: p.direction,
      shapeType: 'classic',
      shapePoints: p.points.map(pt => ({ time: pt.time, price: pt.price })),
      shapeColor: p.direction === 'bullish' ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)',
    });
  }

  // Professional classic patterns (Double Top/Bottom, H&S)
  const proClassicPatterns = detectClassicPatternsPro(candles);
  patterns.push(...proClassicPatterns);

  return patterns;
}

/**
 * Get Arabic label for classic pattern type.
 */
function getClassicLabelAr(patternType: string): string {
  const labels: Record<string, string> = {
    'HEAD_AND_SHOULDERS': 'رأس وكتفين',
    'INVERSE_HEAD_AND_SHOULDERS': 'رأس وكتفين معكوس',
    'DOUBLE_TOP': 'قمة مزدوجة',
    'DOUBLE_BOTTOM': 'قاع مزدوج',
    'ASCENDING_TRIANGLE': 'مثلث صاعد',
    'DESCENDING_TRIANGLE': 'مثلث هابط',
    'SYMMETRICAL_TRIANGLE': 'مثلث متماثل',
    'EXPANDING_TRIANGLE': 'مثلث متسع',
    'RISING_WEDGE': 'إسفين صاعد',
    'FALLING_WEDGE': 'إسفين هابط',
  };
  return labels[patternType] || patternType;
}

// ── Helper: Convert geometric patterns to AIPattern ──────────────────

/**
 * Convert geometric patterns to AIPattern format.
 */
function geometricPatternsToAIPatterns(candles: CandleData[]): AIPattern[] {
  const geoPatterns = detectGeometricPatterns(candles);
  return geoPatterns.map(p => ({
    type: p.type,
    labelAr: p.labelAr,
    time: p.endTime,
    price: p.points.length > 0 ? p.points[p.points.length - 1].price : 0,
    confidence: p.confidence,
    direction: p.direction,
    shapeType: 'polygon' as const,
    shapePoints: p.points,
    shapeColor: p.direction === 'bullish' ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.15)',
  }));
}

// ── Helper: Extract signals from SMC data ────────────────────────────

/**
 * Extract directional signals from SMC detection results.
 */
function extractSMCSignals(smcData: ReturnType<typeof detectSMC>): DetectorSignal[] {
  const signals: DetectorSignal[] = [];

  // Order block signals
  for (const ob of smcData.orderBlocks) {
    if (!ob.broken) {
      signals.push({
        source: 'orderblock',
        direction: ob.type,
        confidence: ob.strength,
        weight: SIGNAL_WEIGHTS.orderblock,
      });
    }
  }

  // FVG signals
  for (const fvg of smcData.fvgs) {
    signals.push({
      source: 'fvg',
      direction: fvg.type,
      confidence: 0.6,
      weight: SIGNAL_WEIGHTS.fvg,
    });
  }

  // Structure break signals
  for (const brk of smcData.structureBreaks) {
    signals.push({
      source: 'smc',
      direction: brk.direction,
      confidence: 0.7,
      weight: SIGNAL_WEIGHTS.smc,
    });
  }

  return signals;
}

// ── Helper: Extract signals from Elliott result ──────────────────────

/**
 * Extract directional signals from Elliott Wave analysis.
 */
function extractElliottSignals(elliottResult: ElliottResult): DetectorSignal[] {
  const signals: DetectorSignal[] = [];

  if (elliottResult.dominantCount) {
    const dc = elliottResult.dominantCount;
    signals.push({
      source: 'elliott',
      direction: dc.direction,
      confidence: dc.confidence,
      weight: SIGNAL_WEIGHTS.elliott,
    });
  }

  // Also add secondary counts with reduced weight
  for (let i = 1; i < elliottResult.counts.length; i++) {
    const count = elliottResult.counts[i];
    signals.push({
      source: 'elliott',
      direction: count.direction,
      confidence: count.confidence * 0.7, // Reduce confidence for alternate counts
      weight: SIGNAL_WEIGHTS.elliott * 0.5,
    });
  }

  return signals;
}

// ── Helper: Extract signals from Wyckoff result ──────────────────────

/**
 * Extract directional signals from Wyckoff analysis.
 */
function extractWyckoffSignals(wyckoffResult: WyckoffResult): DetectorSignal[] {
  const signals: DetectorSignal[] = [];

  if (wyckoffResult.scheme !== 'none') {
    signals.push({
      source: 'wyckoff',
      direction: wyckoffResult.direction,
      confidence: wyckoffResult.confidence,
      weight: SIGNAL_WEIGHTS.wyckoff,
    });

    // Phase-specific signals
    const phaseEvents = wyckoffResult.events.filter(e =>
      e.type === 'SOS' || e.type === 'SOW' || e.type === 'S' || e.type === 'UTAD'
    );
    for (const evt of phaseEvents) {
      const dir = (evt.type === 'SOS' || evt.type === 'S')
        ? 'bullish' as const
        : (evt.type === 'SOW' || evt.type === 'UTAD')
          ? 'bearish' as const
          : 'neutral' as const;
      signals.push({
        source: 'wyckoff',
        direction: dir,
        confidence: wyckoffResult.confidence * 0.8,
        weight: SIGNAL_WEIGHTS.wyckoff * 0.6,
      });
    }
  }

  return signals;
}

// ── Helper: Extract signals from harmonic patterns ───────────────────

/**
 * Extract directional signals from harmonic pattern detection.
 */
function extractHarmonicSignals(harmonicPatterns: AIPattern[]): DetectorSignal[] {
  const signals: DetectorSignal[] = [];

  for (const pattern of harmonicPatterns) {
    signals.push({
      source: 'harmonic',
      direction: pattern.direction,
      confidence: pattern.confidence,
      weight: SIGNAL_WEIGHTS.harmonic,
    });
  }

  return signals;
}

// ── Helper: Extract signals from local/classic patterns ──────────────

/**
 * Extract directional signals from classic chart patterns.
 */
function extractLocalSignals(localPatterns: AIPattern[]): DetectorSignal[] {
  const signals: DetectorSignal[] = [];

  for (const pattern of localPatterns) {
    signals.push({
      source: 'candlestick',
      direction: pattern.direction,
      confidence: pattern.confidence,
      weight: SIGNAL_WEIGHTS.candlestick,
    });
  }

  return signals;
}

// ── Helper: Extract signals from geometric patterns ──────────────────

/**
 * Extract directional signals from geometric patterns.
 */
function extractGeometricSignals(geoPatterns: AIPattern[]): DetectorSignal[] {
  const signals: DetectorSignal[] = [];

  for (const pattern of geoPatterns) {
    signals.push({
      source: 'geometric',
      direction: pattern.direction,
      confidence: pattern.confidence,
      weight: SIGNAL_WEIGHTS.geometric,
    });
  }

  return signals;
}

// ── Helper: Compute weighted consensus ───────────────────────────────

/**
 * Compute the weighted consensus direction from all detector signals.
 * Returns the net direction and aggregate confidence.
 */
function computeConsensus(signals: DetectorSignal[]): {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
} {
  if (signals.length === 0) {
    return { direction: 'neutral', confidence: 0 };
  }

  let bullScore = 0;
  let bearScore = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    const weightedConf = signal.confidence * signal.weight;
    totalWeight += signal.weight;

    if (signal.direction === 'bullish') {
      bullScore += weightedConf;
    } else if (signal.direction === 'bearish') {
      bearScore += weightedConf;
    }
  }

  if (totalWeight === 0) {
    return { direction: 'neutral', confidence: 0 };
  }

  const netScore = bullScore - bearScore;
  const maxScore = Math.max(bullScore, bearScore);
  const confidence = maxScore / totalWeight;

  // Determine direction: need a meaningful margin
  const margin = Math.abs(netScore) / (maxScore || 1);
  if (margin < 0.15) {
    return { direction: 'neutral', confidence: confidence * 0.5 };
  }

  return {
    direction: netScore > 0 ? 'bullish' : 'bearish',
    confidence: Math.min(0.95, confidence),
  };
}

// ── Helper: Convert SMC data to AIPatterns ──────────────────────────

/**
 * Convert SMC detection data (order blocks, FVGs, structure breaks)
 * to AIPattern format for chart rendering.
 */
function smcToAIPatterns(smcData: ReturnType<typeof detectSMC>): AIPattern[] {
  const patterns: AIPattern[] = [];

  // Order Blocks
  for (const ob of smcData.orderBlocks) {
    if (!ob.broken) {
      patterns.push({
        type: ob.type === 'bullish' ? 'bullish-ob' : 'bearish-ob',
        labelAr: ob.type === 'bullish' ? 'بلوك شرائي' : 'بلوك بيعي',
        time: ob.time,
        price: (ob.high + ob.low) / 2,
        confidence: ob.strength,
        direction: ob.type,
        shapeType: 'zone',
        shapePoints: [
          { time: ob.time, price: ob.high },
          { time: ob.endTime, price: ob.high },
          { time: ob.endTime, price: ob.low },
          { time: ob.time, price: ob.low },
        ],
        shapeColor: ob.type === 'bullish'
          ? 'rgba(0,255,163,0.12)'
          : 'rgba(255,71,87,0.12)',
      });
    }
  }

  // Fair Value Gaps
  for (const fvg of smcData.fvgs) {
    patterns.push({
      type: fvg.type === 'bullish' ? 'bullish-fvg' : 'bearish-fvg',
      labelAr: fvg.type === 'bullish' ? 'فجوة قيمة صاعدة' : 'فجوة قيمة هابطة',
      time: fvg.time,
      price: (fvg.high + fvg.low) / 2,
      confidence: 0.6,
      direction: fvg.type,
      shapeType: 'zone',
      shapePoints: [
        { time: fvg.time, price: fvg.high },
        { time: fvg.time + 3600, price: fvg.high },
        { time: fvg.time + 3600, price: fvg.low },
        { time: fvg.time, price: fvg.low },
      ],
      shapeColor: fvg.type === 'bullish'
        ? 'rgba(0,255,163,0.08)'
        : 'rgba(255,71,87,0.08)',
    });
  }

  // Structure Breaks
  for (const brk of smcData.structureBreaks) {
    patterns.push({
      type: brk.type === 'BOS' ? 'bos' : 'choch',
      labelAr: brk.type === 'BOS'
        ? (brk.direction === 'bullish' ? 'كسر هيكل صاعد' : 'كسر هيكل هابط')
        : (brk.direction === 'bullish' ? 'تغير شخصية صاعد' : 'تغير شخصية هابط'),
      time: brk.time,
      price: brk.price,
      confidence: 0.7,
      direction: brk.direction,
      shapeType: 'line',
      shapePoints: [
        { time: brk.prevSwingTime, price: brk.prevSwingPrice },
        { time: brk.time, price: brk.price },
      ],
      shapeColor: brk.direction === 'bullish'
        ? 'rgba(0,255,163,0.5)'
        : 'rgba(255,71,87,0.5)',
    });
  }

  return patterns;
}

// ── Helper: Convert SR levels to AIPatterns ─────────────────────────

/**
 * Convert support/resistance levels to AIPattern format.
 */
function srLevelsToAIPatterns(srLevels: ReturnType<typeof detectSRLevels>): AIPattern[] {
  return srLevels.map(level => ({
    type: level.type === 'support' ? 'support' : 'resistance',
    labelAr: level.type === 'support' ? 'دعم' : 'مقاومة',
    time: 0, // SR levels are price-based, not time-specific
    price: level.price,
    confidence: level.strength,
    direction: level.type === 'support' ? 'bullish' as const : 'bearish' as const,
    shapeType: 'line' as const,
    shapePoints: [
      { time: 0, price: level.price },
    ],
    shapeColor: level.type === 'support'
      ? 'rgba(0,255,163,0.3)'
      : 'rgba(255,71,87,0.3)',
  }));
}

// ── Helper: ATR-based wrapper ────────────────────────────────────────

/**
 * Get the latest ATR value. Wraps `calcATR` for convenience.
 */
function getLatestATR(candles: CandleData[], period: number = 14): number {
  return calcATR(candles, period);
}

// ── Main Unified Analysis Function ───────────────────────────────────

/**
 * Run the complete unified analysis pipeline.
 *
 * Aggregates results from ALL detection engines, converts them to
 * AIPattern format, computes weighted consensus signals, and returns
 * a comprehensive analysis result.
 *
 * @param candles - Array of candle data (OHLCV)
 * @returns UnifiedAnalysisResult with all engine outputs and signals
 */
export function runUnifiedAnalysis(candles: CandleData[]): UnifiedAnalysisResult {
  const timestamp = Date.now() / 1000;

  // Edge case: insufficient data
  if (!candles || candles.length < MIN_CANDLES) {
    const emptyWyckoff: WyckoffResult = {
      scheme: 'none',
      currentPhase: 'none',
      events: [],
      range: { high: 0, low: 0, mid: 0, atrBand: 0 },
      support: 0,
      resistance: 0,
      confidence: 0,
      direction: 'neutral',
    };
    const emptyElliott: ElliottResult = {
      counts: [],
      dominantCount: null,
      allPatterns: [],
    };
    return {
      srLevels: [],
      localPatterns: [],
      smcData: { orderBlocks: [], fvgs: [], structureBreaks: [] },
      harmonicResults: [],
      wyckoffResult: emptyWyckoff,
      elliottResult: emptyElliott,
      wyckoffPatterns: [],
      elliottPatterns: [],
      signals: [],
      consensus: { direction: 'neutral', confidence: 0 },
      allPatterns: [],
      engineVersion: ENGINE_VERSION,
      detectionTimestamp: timestamp,
    };
  }

  // ── 1. Compute ZigZag (foundation for many engines) ──
  const swings = safeEngineCall('zigzag', 'computeZigZag', () => computeZigZag(candles), []);

  // ── 2. Support / Resistance ──
  const srLevels = safeEngineCall('sr', 'detectSRLevels', () => detectSRLevels(candles), []);

  // ── 3. Local / Classic Patterns ──
  const localPatterns = safeEngineCall('classic', 'classicPatternsToAIPatterns', () => classicPatternsToAIPatterns(candles, swings), []);

  // ── 4. SMC Detection ──
  const smcData = safeEngineCall('smc', 'detectSMC', () => detectSMC(candles), { orderBlocks: [], fvgs: [], structureBreaks: [] });

  // ── 5. Harmonic Patterns (Professional Engine) ──
  const harmonicResults = safeEngineCall('harmonic', 'detectHarmonicPatternsPro', () => detectHarmonicPatternsPro(candles), []);

  // ── 6. Pattern Engine (full pipeline) ──
  safeEngineCall('pattern-engine', 'runPatternEngine', () => { runPatternEngine(candles); return null; }, null);

  // ── 7. Advanced Wyckoff Engine ──
  const emptyWyckoffLocal: WyckoffResult = { scheme: 'none', currentPhase: 'none', events: [], range: { high: 0, low: 0, mid: 0, atrBand: 0 }, support: 0, resistance: 0, confidence: 0, direction: 'neutral' };
  const wyckoffResult = safeEngineCall('wyckoff', 'detectWyckoffAdvanced', () => detectWyckoffAdvanced(candles), emptyWyckoffLocal);
  const wyckoffPatterns = safeEngineCall('wyckoff', 'wyckoffToAIPatterns', () => wyckoffToAIPatterns(wyckoffResult), []);

  // ── 8. Advanced Elliott Wave Engine ──
  const emptyElliottLocal: ElliottResult = { counts: [], dominantCount: null, allPatterns: [] };
  const elliottResult = safeEngineCall('elliott', 'detectElliottAdvanced', () => detectElliottAdvanced(candles), emptyElliottLocal);
  const elliottPatterns = safeEngineCall('elliott', 'elliottToAIPatterns', () => elliottToAIPatterns(elliottResult), []);

  // ── 9. Geometric Patterns ──
  const geoAIPatterns = safeEngineCall('geometric', 'geometricPatternsToAIPatterns', () => geometricPatternsToAIPatterns(candles), []);

  // ── 10. Convert SMC data to AIPatterns ──
  const smcPatterns = safeEngineCall('smc', 'smcToAIPatterns', () => smcToAIPatterns(smcData), []);

  // ── 11. Convert SR levels to AIPatterns ──
  const srPatterns = safeEngineCall('sr', 'srLevelsToAIPatterns', () => srLevelsToAIPatterns(srLevels), []);

  // ── 12. Extract signals from all engines ──
  const signals: DetectorSignal[] = [
    ...extractHarmonicSignals(harmonicResults),
    ...extractElliottSignals(elliottResult),
    ...extractWyckoffSignals(wyckoffResult),
    ...extractSMCSignals(smcData),
    ...extractLocalSignals(localPatterns),
    ...extractGeometricSignals(geoAIPatterns),
  ];

  // ── 13. Compute weighted consensus ──
  const consensus = computeConsensus(signals);

  // ── 14. Merge all patterns ──
  const mergedPatterns: AIPattern[] = [
    ...harmonicResults,
    ...elliottPatterns,
    ...wyckoffPatterns,
    ...smcPatterns,
    ...localPatterns,
    ...geoAIPatterns,
    ...srPatterns,
  ].sort((a, b) => b.confidence - a.confidence);

  // ── 15. Validate results ──
  // BUG-061 FIX: Disabled validateAnalysis logWarn in production.
  // The logWarn was firing on every analyze() call (which runs on every
  // WebSocket tick), producing thousands of console.warn lines that
  // flooded the main thread and prevented lightweight-charts from
  // rendering. The validation itself still runs (to filter bad patterns),
  // but the logging is suppressed.
  const validation = validateAnalysis(candles, mergedPatterns, srLevels);
  // Log only in development
  if (process.env.NODE_ENV !== 'production' && validation.warningCount > 0) {
    logWarn('validator', 'validateAnalysis', `${validation.warningCount} patterns filtered, ${validation.errorCount} errors`);
  }
  const allPatterns = validation.filteredPatterns;
  const validatedSRLevels = validation.filteredSRLevels as typeof srLevels;

  return {
    srLevels: validatedSRLevels,
    localPatterns,
    smcData,
    harmonicResults,
    wyckoffResult,
    elliottResult,
    wyckoffPatterns,
    elliottPatterns,
    signals,
    consensus,
    allPatterns,
    engineVersion: ENGINE_VERSION,
    detectionTimestamp: timestamp,
  };
}
