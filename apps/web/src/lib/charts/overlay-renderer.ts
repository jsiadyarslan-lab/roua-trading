// ═══════════════════════════════════════════════════════════════════════
// ROUA Overlay Renderer — Primitive-based AutoChartist-style Rendering
//
// Uses ISeriesPrimitive for ALL overlays. No LineSeries.
// Uses OverlayRegistry for lifecycle management.
// Uses chart-detection.ts for pattern detection.
//
// Based on research:
// - AutoChartist: ZigZag → Swing Points → Pattern Match → Quality Score → Visual
// - lightweight-charts v5: ISeriesPrimitive with Canvas API
// - Trend lines: Only on LAST pattern, not all candles
// ═══════════════════════════════════════════════════════════════════════

import type { ISeriesApi, SeriesType } from 'lightweight-charts';
import type { CandleData } from './types';
import type { OverlayType } from './OverlayRegistry';
import { getOverlayRegistry, OverlayRegistry } from './OverlayRegistry';
import {
  TrendLinePrimitive, HorizontalLinePrimitive, ShapePrimitive,
  FibonacciPrimitive, LabelPrimitive, ZonePrimitive, AlertMarkerPrimitive,
  OVERLAY_COLORS,
  type TrendLineData, type HorizontalLineData, type ShapeData,
  type FibonacciData, type LabelData, type ZoneData, type Point, type AlertMarkerData,
} from './chart-primitives';
import {
  computeZigZag, detectTrendLines, detectClassicPatterns,
  detectHarmonicPatterns, detectBOS, detectElliottWaves,
  detectSRLevels, detectFVGs,
  type SwingPoint, type DetectedTrendLine, type DetectedPattern,
  type DetectedHarmonic, type DetectedBOS, type DetectedElliott,
  type SRLevel, type FVGZone,
} from './chart-detection';
import { safeMax, safeMin } from './chart-utils';

// ═══════════════════════════════════════════════════════════════════════
// STABLE ENTRY CACHE — prevents "dancing lines"
//
// ROOT CAUSE: When no AI signal exists, the fallback entry = lastPrice.
// Every WebSocket tick changes lastPrice → entry changes → SL/TP change
// → smartRedraw signature changes → primitives destroyed + recreated → DANCING
//
// FIX: Calculate the fallback entry ONCE and keep it until the DIRECTION
// changes (EMA9/EMA20 crossover). The lines should NOT move just because
// a new candle closes — they should stay FIXED until the market direction
// actually reverses. This matches how real traders set entry/SL/TP:
// you pick your levels and stick with them until the setup invalidates.
// ═══════════════════════════════════════════════════════════════════════
interface CachedEntry {
  dir: string;          // 'long' | 'short'
  entry: number;
  sl: number;
  tp: number;
}
let _cachedFallbackEntry: CachedEntry | null = null;

function getStableFallbackEntry(candles: CandleData[]): { entry: number; sl: number; tp: number; dir: string } {
  // Use CLOSED candles only (exclude the forming candle)
  const closedCandles = candles.length > 1 ? candles.slice(0, -1) : candles;

  // Calculate CURRENT direction from closed candles
  const last20 = closedCandles.slice(-20);
  const ema9 = last20.slice(-9).reduce((s, x) => s + x.close, 0) / Math.min(9, last20.length);
  const ema20 = last20.reduce((s, x) => s + x.close, 0) / last20.length;
  const currentDir = ema9 > ema20 ? 'long' : 'short';

  // If we have a cached entry and the direction hasn't changed → KEEP IT
  // The lines should NOT move just because a candle closed. They only move
  // when the market direction actually reverses (EMA crossover).
  if (_cachedFallbackEntry && _cachedFallbackEntry.dir === currentDir) {
    return { entry: _cachedFallbackEntry.entry, sl: _cachedFallbackEntry.sl, tp: _cachedFallbackEntry.tp, dir: _cachedFallbackEntry.dir };
  }

  // Direction changed (or first calculation) → calculate new levels
  const entry = closedCandles[closedCandles.length - 1].close;
  const atr = closedCandles.length >= 14 ? (() => {
    const sl2 = closedCandles.slice(-14);
    const trs = sl2.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.close, Math.abs(c.low - c.close), c.high - c.low));
    return trs.reduce((s, v) => s + v, 0) / trs.length;
  })() : entry * 0.01;

  const sl = currentDir === 'long' ? entry - atr * 1.5 : entry + atr * 1.5;
  const tp = currentDir === 'long' ? entry + atr * 2.5 : entry - atr * 2.5;

  _cachedFallbackEntry = { dir: currentDir, entry, sl, tp };
  return { entry, sl, tp, dir: currentDir };
}

/** Reset the fallback entry cache (e.g., on timeframe change) */
export function resetFallbackEntryCache(): void {
  _cachedFallbackEntry = null;
}

// ── Type for AI analysis result ────────────────────────────────────
export interface OverlayInput {
  candles: CandleData[];
  overlays: Record<string, boolean>;
  // Optional data from AI panel
  supportLevels?: { price: number; type: string; strength: string }[];
  resistanceLevels?: { price: number; type: string; strength: string }[];
  smcData?: any;
  geoPatterns?: any[];
  elliottPattern?: any;
  wyckoff?: any;
  volumeProfile?: any;
  entryExit?: { direction: string; entryPrice: number; stopLoss: number; takeProfit: number } | null;
  signal?: { dir: string; entry: number; sl: number; tp: number } | null;
  patterns?: any[];
  /** Alert markers from auto-detection — visual pins on chart */
  alerts?: AlertMarkerData[];
  /** Elliott+SMC Fusion result — shows confluence zones on chart */
  fusionResult?: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confluenceScore: number;
    confluenceBreakdown: Array<{
      factorAr: string;
      score: number;
      direction: 'bullish' | 'bearish' | 'neutral';
      weight: number;
      proximity?: number;
    }>;
    layerScores: {
      directionalAgreement: number;
      spatialConfluence: number;
      volumeConfirmation: number;
      patternStrength: number;
    };
  } | null;
  /** Bayesian consensus result — shows direction arrow on chart */
  bayesianResult?: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    posteriorBullish: number;
    posteriorBearish: number;
    likelihoods: Array<{ source: string; likelihoodBull: number; likelihoodBear: number }>;
  } | null;
  /** MTF confluence result — shows multi-timeframe alignment */
  mtfResult?: {
    confluenceDirection: 'bullish' | 'bearish' | 'neutral';
    confluenceScore: number;
    agreeingTFs: number;
    totalTFs: number;
    interpretationAr: string;
    fibConfluences: Array<{ price: number; strength: number; direction: 'bullish' | 'bearish' | 'neutral' }>;
    srConfluences: Array<{ price: number; type: 'support' | 'resistance'; combinedStrength: number; labelAr: string }>;
    divergences: Array<{ type: string; descriptionAr: string; significance: number }>;
  } | null;
  /** Active trade proposals — shows Entry/SL/TP1/TP2/TP3 on chart */
  tradeProposals?: Array<{
    id: string;
    direction: 'bullish' | 'bearish';
    entryPrice: number;
    stopLoss: number;
    takeProfits: number[];
    rrRatio: number;
    confidence: number;
    status: string;
    qualityScore: number;
    descriptionAr: string;
    currentTrailSL?: number | null;
  }>;
  /** Liquidity zones — shows pools, sweeps, and voids */
  liquidityResult?: {
    zones: Array<{
      type: string;
      price: number;
      high: number;
      low: number;
      startTime: number;
      endTime: number;
      strength: number;
      sweepDirection: 'bullish' | 'bearish';
      swept: boolean;
      sweepTime?: number;
      confidence: number;
      labelAr: string;
    }>;
    activeZones: number;
    sweptZones: number;
    dominantSweepDirection: 'bullish' | 'bearish' | 'neutral';
    interpretationAr: string;
  } | null;
}

/**
 * Main rendering function — draws overlays using ISeriesPrimitive.
 * This replaces the old LineSeries-based approach.
 *
 * Usage:
 *   renderOverlays(series, input);
 */
export function renderOverlays(
  series: ISeriesApi<SeriesType>,
  input: OverlayInput,
  addPriceLine?: (id: string, price: number, color: string, label: string, lineWidth: number, lineStyle: number, axisLabelVisible: boolean) => void,
  removePriceLine?: (id: string) => void,
): void {
  const { candles, overlays } = input;
  if (!candles.length || candles.length < 20) return;

  const registry = getOverlayRegistry();

  // MUTEX: Prevent overlapping renderOverlays() calls from concurrent triggers
  // (WebSocket onCandleUpdate + periodic timer + user toggle). If a render
  // is already in progress, skip this call — the next trigger will re-render.
  if (!registry.acquireRenderLock()) return;

  try {
  // FIX: Pass removePriceLine to registry so it can clean up price lines
  // when an overlay type is cleared (toggled off).
  registry.init(series, removePriceLine ?? undefined);

  const ov = overlays || {};
  const showSR = ov.sr === true;
  const showTrend = ov.trend === true;
  const showHarmonic = ov.harmonic === true;
  const showFVG = ov.fvg === true;
  const showBOS = ov.bos === true;
  const showGeo = ov.geo === true;
  const showEW = ov.ew === true;
  const showWyckoff = ov.wyckoff === true;
  const showVP = ov.vp === true;
  const showEntry = ov.entry === true;
  const showMTF = ov.mtf === true;
  const showLiq = ov.liq === true;
  const showTrade = ov.trade === true;

  // If nothing is enabled, clear all
  if (!showSR && !showTrend && !showHarmonic && !showFVG && !showBOS && !showGeo && !showEW && !showWyckoff && !showVP && !showEntry && !showMTF && !showLiq && !showTrade) {
    registry.clearAll();
    return;
  }

  // ── Run ZigZag detection on CLOSED candles only ──
  // FIX: Exclude the last (forming) candle from detection. The forming
  // candle's high/low/close change on every WebSocket tick, causing
  // ZigZag swing points to shift → signature changes → primitives
  // destroyed+recreated → "dancing lines". Only closed candles produce
  // stable swing points that don't change between ticks.
  const closedCandles = candles.length > 1 ? candles.slice(0, -1) : candles;
  const swings = computeZigZag(closedCandles);

  // ── Helper: safe price line ──
  // FIX: Also register the price line ID with the OverlayRegistry so
  // it gets removed when the overlay type is cleared (toggled off).
  const safeAddPriceLine = (id: string, price: number, color: string, label: string, lw: number, ls: number, axisVisible: boolean, _type: OverlayType) => {
    if (!addPriceLine) return;
    const range = candles.slice(-30);
    const high = safeMax(range.map(c => c.high));
    const low = safeMin(range.map(c => c.low));
    const maxDist = (high - low) * 3;
    const lastPrice = candles[candles.length - 1].close;
    if (Math.abs(price - lastPrice) > maxDist) return;
    addPriceLine(id, price, color, label, lw, ls, axisVisible);
    // Register this price line ID with the overlay type so it's cleaned up on toggle off
    registry.addPriceLineId(_type, id);
  };

  // ═══════════════════════════════════════════════════════════════
  // S/R — Support/Resistance using clustering + horizontal lines
  // ═══════════════════════════════════════════════════════════════
  if (showSR) {
    const levels = detectSRLevels(closedCandles);
    // ── CLEANUP: Only show top 4 strongest levels to avoid chart clutter ──
    // Filter to only levels within 3% of current price (relevant zone)
    const lastPrice = candles[candles.length - 1].close;
    const nearbyLevels = levels.filter(l => Math.abs(l.price - lastPrice) / lastPrice < 0.03);
    const displayLevels = (nearbyLevels.length >= 2 ? nearbyLevels : levels).slice(0, 4);

    // Build data signature from detected levels (prices + types)
    const srSig = JSON.stringify(displayLevels.map(l => `${l.price}:${l.type}:${l.strength}`).join('|'));
    if (registry.smartRedraw('sr', srSig)) {
    displayLevels.forEach((level, i) => {
      const opacity = level.strength > 0.6 ? 0.8 : level.strength > 0.3 ? 0.5 : 0.3;

      // Use HorizontalLinePrimitive for S/R
      registry.add('sr', new HorizontalLinePrimitive({
        price: level.price,
        color: level.type === 'support'
          ? `rgba(0, 255, 163, ${opacity})`
          : `rgba(255, 71, 87, ${opacity})`,
        lineWidth: level.strength > 0.6 ? 2 : 1,
        lineStyle: 2,
        label: `${level.type === 'support' ? 'S' : 'R'}${i + 1}`,
      }));

      // Also add price line for axis label
      safeAddPriceLine(`ai-${level.type[0]}-${i}`, level.price,
        level.type === 'support' ? `rgba(0,255,163,${opacity})` : `rgba(255,71,87,${opacity})`,
        `${level.type === 'support' ? 'S' : 'R'}${i + 1}`, level.strength > 0.6 ? 2 : 1, 2, true, 'sr');
    });

    // Also include levels from AI panel (max 2 extra each)
    (input.supportLevels || []).slice(0, 2).forEach((level, i) => {
      if (!displayLevels.some(l => Math.abs(l.price - level.price) / level.price < 0.005)) {
        const opacity = level.strength === 'strong' ? 0.8 : level.strength === 'medium' ? 0.5 : 0.3;
        registry.add('sr', new HorizontalLinePrimitive({
          price: level.price,
          color: `rgba(0, 255, 163, ${opacity})`,
          lineWidth: level.strength === 'strong' ? 2 : 1,
          lineStyle: 2,
          label: `S${displayLevels.filter(l => l.type === 'support').length + i + 1}`,
        }));
      }
    });
    (input.resistanceLevels || []).slice(0, 2).forEach((level, i) => {
      if (!displayLevels.some(l => Math.abs(l.price - level.price) / level.price < 0.005)) {
        const opacity = level.strength === 'strong' ? 0.8 : level.strength === 'medium' ? 0.5 : 0.3;
        registry.add('sr', new HorizontalLinePrimitive({
          price: level.price,
          color: `rgba(255, 71, 87, ${opacity})`,
          lineWidth: level.strength === 'strong' ? 2 : 1,
          lineStyle: 2,
          label: `R${displayLevels.filter(l => l.type === 'resistance').length + i + 1}`,
        }));
      }
    });
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('sr');
  }

  // ═══════════════════════════════════════════════════════════════
  // TREND — Professional trend lines (LAST PATTERN ONLY!)
  // KEY: Only draws on recent swing points, not all candles
  // ═══════════════════════════════════════════════════════════════
  if (showTrend) {
    const trendLines = detectTrendLines(closedCandles, swings);

    // Build data signature from trend lines
    const trendSig = JSON.stringify(trendLines.map(l => `${l.startPoint.price}:${l.endPoint.price}:${l.type}:${l.strength}`).join('|'));
    if (registry.smartRedraw('trend', trendSig)) {
    trendLines.forEach((line, i) => {
      const isBull = line.type === 'support';
      const color = isBull ? OVERLAY_COLORS.trendUp : OVERLAY_COLORS.trendDown;
      const strengthOpacity = line.strength > 0.6 ? 0.9 : line.strength > 0.3 ? 0.6 : 0.35;

      registry.add('trend', new TrendLinePrimitive({
        startTime: line.startPoint.time as any,
        startPrice: line.startPoint.price,
        endTime: line.endPoint.time as any,
        endPrice: line.endPoint.price,
        color: isBull
          ? `rgba(5, 150, 105, ${strengthOpacity})`
          : `rgba(239, 68, 68, ${strengthOpacity})`,
        lineWidth: line.strength > 0.6 ? 2 : 1,
        lineStyle: 0,
        extendRight: false,
        label: isBull ? `▲ S${line.touchCount}` : `▼ R${line.touchCount}`,
      }));
    });

    // Add labels at swing points — only last 5 to avoid clutter
    swings.slice(-5).forEach((sw) => {
      if (sw.structureLabel) {
        registry.add('trend', new LabelPrimitive({
          time: sw.time as any,
          price: sw.price,
          text: sw.structureLabel,
          color: sw.structureLabel === 'HH' || sw.structureLabel === 'HL'
            ? OVERLAY_COLORS.trendUp
            : OVERLAY_COLORS.trendDown,
          fontSize: 10,
          align: 'center',
          bg: 'rgba(11, 14, 20, 0.8)',
          position: sw.type === 'HIGH' ? 'above' : 'below',
        }));
      }
    });
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('trend');
  }

  // ═══════════════════════════════════════════════════════════════
  // HARMONIC — XABCD patterns with legs + PRZ
  // ═══════════════════════════════════════════════════════════════
  if (showHarmonic) {
    const harmonics = detectHarmonicPatterns(swings);

    // Build data signature from harmonic patterns
    const harmonicSig = JSON.stringify(harmonics.slice(0, 4).map(h => `${h.type}:${h.direction}:${h.przLevel}:${h.points.X.price}:${h.points.D.price}`).join('|'));
    if (registry.smartRedraw('harmonic', harmonicSig)) {
    harmonics.slice(0, 4).forEach((harm, idx) => {
      const isBull = harm.direction === 'bullish';
      const col = isBull ? OVERLAY_COLORS.harmonic : '#ef4444';

      // Draw XABCD legs as trend line primitives
      const pts = harm.points;
      const legs: [Point, Point, string][] = [
        [{ time: pts.X.time as any, price: pts.X.price }, { time: pts.A.time as any, price: pts.A.price }, 'XA'],
        [{ time: pts.A.time as any, price: pts.A.price }, { time: pts.B.time as any, price: pts.B.price }, 'AB'],
        [{ time: pts.B.time as any, price: pts.B.price }, { time: pts.C.time as any, price: pts.C.price }, 'BC'],
        [{ time: pts.C.time as any, price: pts.C.price }, { time: pts.D.time as any, price: pts.D.price }, 'CD'],
      ];

      legs.forEach(([from, to, label]) => {
        registry.add('harmonic', new TrendLinePrimitive({
          startTime: from.time,
          startPrice: from.price,
          endTime: to.time,
          endPrice: to.price,
          color: col,
          lineWidth: 2,
          lineStyle: label === 'AB' || label === 'CD' ? 1 : 0,
          label,
        }));
      });

      // PRZ zone at point D — use closedCandles for stable ATR
      const atr = closedCandles[closedCandles.length - 1].high - closedCandles[closedCandles.length - 1].low;
      registry.add('harmonic', new ZonePrimitive({
        startTime: pts.C.time as any,
        endTime: pts.D.time as any,
        highPrice: harm.przLevel + atr * 0.5,
        lowPrice: harm.przLevel - atr * 0.5,
        fillColor: isBull ? OVERLAY_COLORS.zoneGold : OVERLAY_COLORS.zoneRed,
        borderColor: col,
        label: `PRZ ${harm.type}`,
      }));

      // XABCD labels
      const labels = ['X', 'A', 'B', 'C', 'D'];
      [pts.X, pts.A, pts.B, pts.C, pts.D].forEach((pt, i) => {
        registry.add('harmonic', new LabelPrimitive({
          time: pt.time as any,
          price: pt.price,
          text: labels[i],
          color: col,
          fontSize: 12,
          align: 'center',
          bg: 'rgba(11, 14, 20, 0.85)',
          position: i % 2 === 0 ? 'below' : 'above',
        }));
      });

      // PRZ price line
      safeAddPriceLine(`h-prz-${idx}`, harm.przLevel, col, `PRZ ${harm.type}`, 2, 2, true, 'harmonic');
    });

    // Also include classic patterns from AI panel
    (input.patterns || []).filter((p: any) => p.shapeType === 'classic').slice(0, 3).forEach((pattern: any, idx: number) => {
      const isBull = pattern.direction === 'bullish';
      const col = isBull ? OVERLAY_COLORS.trendUp : OVERLAY_COLORS.trendDown;
      const sp = pattern.shapePoints || pattern.points;
      if (sp && sp.length >= 2) {
        const points: Point[] = sp.filter((p: any) => p?.time && p?.price).map((p: any) => ({ time: p.time as any, price: p.price }));
        if (points.length >= 2) {
          registry.add('harmonic', new ShapePrimitive({
            points,
            strokeColor: col,
            fillColor: isBull ? OVERLAY_COLORS.zone : OVERLAY_COLORS.zoneRed,
            lineWidth: 2,
          }));
        }
      }
    });
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('harmonic');
  }

  // ═══════════════════════════════════════════════════════════════
  // FVG — Fair Value Gap zones
  // ═══════════════════════════════════════════════════════════════
  if (showFVG) {
    // Use ONLY the ATR-filtered detectFVGs — no SMC duplicates.
    // The SMCDetector FVGs caused dozens of lines on few candles
    // because they lacked ATR filtering and middle-candle validation.
    const fvgs = detectFVGs(closedCandles);

    // Build data signature from FVG zones
    const fvgSig = JSON.stringify(fvgs.map(f => `${f.type}:${f.highPrice}:${f.lowPrice}:${f.startTime}`).join('|'));
    if (registry.smartRedraw('fvg', fvgSig)) {
    fvgs.forEach((fvg, i) => {
      const isBull = fvg.type === 'bullish';
      registry.add('fvg', new ZonePrimitive({
        startTime: fvg.startTime as any,
        endTime: fvg.endTime as any,
        highPrice: fvg.highPrice,
        lowPrice: fvg.lowPrice,
        fillColor: isBull ? 'rgba(34, 211, 238, 0.12)' : 'rgba(239, 68, 68, 0.12)',
        borderColor: isBull ? OVERLAY_COLORS.fvg : '#ef4444',
        label: `FVG${isBull ? '↑' : '↓'}`,
      }));
    });
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('fvg');
  }

  // ═══════════════════════════════════════════════════════════════
  // BOS — Break of Structure / CHoCH
  // ═══════════════════════════════════════════════════════════════
  if (showBOS) {
    const bosBreaks = detectBOS(closedCandles, swings);

    // Build data signature from BOS breaks
    const bosSig = JSON.stringify(bosBreaks.map(b => `${b.type}:${b.direction}:${b.brokenLevel}:${b.breakPrice}`).join('|'));
    if (registry.smartRedraw('bos', bosSig)) {
    bosBreaks.forEach((br, i) => {
      const isBull = br.direction === 'bullish';
      const color = br.type === 'BOS'
        ? (isBull ? OVERLAY_COLORS.bosBull : OVERLAY_COLORS.bosBear)
        : (isBull ? OVERLAY_COLORS.chochBull : OVERLAY_COLORS.chochBear);

      // Draw horizontal line at broken level
      registry.add('bos', new HorizontalLinePrimitive({
        price: br.brokenLevel,
        color,
        lineWidth: 2,
        lineStyle: 0,
        startTime: swings.find(s => s.price === br.brokenLevel)?.time as any,
        label: `${br.type} ${isBull ? '↑' : '↓'}`,
      }));

      // Label at break point
      registry.add('bos', new LabelPrimitive({
        time: br.breakTime as any,
        price: br.breakPrice,
        text: br.type,
        color,
        fontSize: 11,
        align: 'center',
        bg: 'rgba(11, 14, 20, 0.85)',
        position: isBull ? 'below' : 'above',
      }));

      safeAddPriceLine(`bos-${i}`, br.brokenLevel, color, `${br.type}${isBull ? '↑' : '↓'}`, 2, 0, true, 'bos');
    });
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('bos');
  }

  // ═══════════════════════════════════════════════════════════════
  // GEOMETRIC — Classic pattern shapes
  // ═══════════════════════════════════════════════════════════════
  if (showGeo) {
    const classicPatterns = detectClassicPatterns(swings);

    // Build data signature from geometric patterns
    const geoSig = JSON.stringify(classicPatterns.slice(0, 4).map(p => `${p.type}:${p.direction}:${p.targetPrice}:${p.points.length}`).join('|'));
    if (registry.smartRedraw('geo', geoSig)) {
    classicPatterns.slice(0, 4).forEach((pat, i) => {
      const isBull = pat.direction === 'bullish';
      const col = isBull ? OVERLAY_COLORS.trendUp : OVERLAY_COLORS.trendDown;

      // Draw pattern shape as polygon
      if (pat.points.length >= 3) {
        registry.add('geo', new ShapePrimitive({
          points: pat.points.map(p => ({ time: p.time as any, price: p.price })),
          strokeColor: col,
          fillColor: isBull ? OVERLAY_COLORS.zone : OVERLAY_COLORS.zoneRed,
          lineWidth: 2,
          labels: pat.points.map(p => ({ text: p.type === 'HIGH' ? 'H' : 'L', point: { time: p.time as any, price: p.price } })),
        }));
      }

      // Draw neckline if available
      if (pat.neckline) {
        registry.add('geo', new TrendLinePrimitive({
          startTime: pat.neckline.start.time as any,
          startPrice: pat.neckline.start.price,
          endTime: pat.neckline.end.time as any,
          endPrice: pat.neckline.end.price,
          color: '#fbbf24',
          lineWidth: 1,
          lineStyle: 2,
          extendRight: true,
          label: 'Neckline',
        }));
      }

      // Target price
      if (pat.targetPrice) {
        registry.add('geo', new HorizontalLinePrimitive({
          price: pat.targetPrice,
          color: col,
          lineWidth: 1,
          lineStyle: 2,
          label: `Target ${pat.type}`,
        }));
        safeAddPriceLine(`geo-tgt-${i}`, pat.targetPrice, col, `Target ${pat.type}`, 1, 2, true, 'geo');
      }
    });

    // Also include geo patterns from AI panel
    (input.geoPatterns || []).slice(0, 4).forEach((pat: any, i: number) => {
      if (!classicPatterns.some(p => p.type === pat.type)) {
        const isBull = pat.direction === 'bullish';
        const col = isBull ? 'rgba(0,255,163,0.7)' : 'rgba(255,71,87,0.7)';
        if (pat.points && pat.points.length >= 2) {
          const validPts = pat.points.filter((p: any) => p?.time && p?.price);
          if (validPts.length >= 2) {
            registry.add('geo', new ShapePrimitive({
              points: validPts.map((p: any) => ({ time: p.time as any, price: p.price })),
              strokeColor: col,
              fillColor: isBull ? OVERLAY_COLORS.zone : OVERLAY_COLORS.zoneRed,
              lineWidth: 2,
            }));
          }
        }
        if (pat.target && pat.target > 0) {
          safeAddPriceLine(`geo-tgt-extra-${i}`, pat.target, col, `Target`, 1, 2, true, 'geo');
        }
      }
    });
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('geo');
  }

  // ═══════════════════════════════════════════════════════════════
  // ELLIOTT WAVE — Wave labels + connecting lines
  // ═══════════════════════════════════════════════════════════════
  if (showEW) {
    const elliott = detectElliottWaves(swings);
    const aiElliott = input.elliottPattern;

    // Build data signature from Elliott waves
    const ewSig = JSON.stringify({
      elliott: elliott ? elliott.labels.map(l => `${l.waveNumber}:${l.price}`).join('|') : null,
      direction: elliott?.direction,
      aiElliott: aiElliott ? `${aiElliott.direction}:${aiElliott.nextTarget}:${aiElliott.waves?.length}` : null,
    });
    if (registry.smartRedraw('ew', ewSig)) {
    if (elliott && elliott.labels.length >= 2) {
      const isBull = elliott.direction === 'bullish';
      const col = OVERLAY_COLORS.elliott;

      // Draw wave connecting lines
      for (let i = 0; i < elliott.labels.length - 1; i++) {
        const from = elliott.labels[i];
        const to = elliott.labels[i + 1];
        const isImpulse = i % 2 === 0;

        registry.add('ew', new TrendLinePrimitive({
          startTime: from.time as any,
          startPrice: from.price,
          endTime: to.time as any,
          endPrice: to.price,
          color: isImpulse ? col : '#fbbf24',
          lineWidth: isImpulse ? 2 : 1,
          lineStyle: isImpulse ? 0 : 2,
          label: `W${i + 1}`,
        }));
      }

      // Wave number labels
      elliott.labels.forEach((w, i) => {
        registry.add('ew', new LabelPrimitive({
          time: w.time as any,
          price: w.price,
          text: `W${w.waveNumber}`,
          color: i % 2 === 0 ? col : '#fbbf24',
          fontSize: 12,
          align: 'center',
          bg: 'rgba(11, 14, 20, 0.85)',
          position: isBull === (i % 2 === 0) ? 'below' : 'above',
        }));
      });
    }

    // Also include Elliott data from AI panel
    if (!elliott && aiElliott && aiElliott.waves?.length >= 2) {
      const isBull = aiElliott.direction === 'bullish';
      const col = '#93c5fd';
      for (let i = 0; i < aiElliott.waves.length - 1; i++) {
        const from = aiElliott.waves[i];
        const to = aiElliott.waves[i + 1];
        registry.add('ew', new TrendLinePrimitive({
          startTime: from.time as any,
          startPrice: from.price,
          endTime: to.time as any,
          endPrice: to.price,
          color: from.type === 'impulse' ? col : '#fbbf24',
          lineWidth: from.type === 'impulse' ? 2 : 1,
          lineStyle: from.type === 'impulse' ? 0 : 2,
          label: `W${from.waveNumber || i + 1}`,
        }));
      }
      if (aiElliott.nextTarget) {
        safeAddPriceLine('ew-tgt', aiElliott.nextTarget, col, `Elliott Target`, 2, 2, true, 'ew');
      }
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('ew');
  }

  // ═══════════════════════════════════════════════════════════════
  // WYCKOFF — Phase labels + S/R
  // FIX: Added local Wyckoff phase detection as fallback when AI
  // data is not available. Uses volume/price analysis to determine
  // the current market phase (Accumulation, Markup, Distribution, Markdown).
  // ═══════════════════════════════════════════════════════════════
  if (showWyckoff) {
    const w = input.wyckoff;

    // Try AI data first, then local detection
    let phase = w?.phase || 'Unknown';
    let bias: 'bullish' | 'bearish' | 'neutral' = w?.bias || 'neutral';
    let events = w?.events || [];

    // FIX: Local Wyckoff detection when AI data is unavailable
    if (phase === 'Unknown' || !w) {
      const localWyckoff = detectLocalWyckoff(closedCandles, swings);
      phase = localWyckoff.phase;
      bias = localWyckoff.bias;
      events = localWyckoff.events;
    }

    // Build data signature from Wyckoff data
    const wyckoffSig = JSON.stringify({ phase, bias, events: events.map((e: any) => `${e.type}:${e.price}`).join('|') });
    if (registry.smartRedraw('wyckoff', wyckoffSig)) {
    if (phase !== 'Unknown') {
      const col = bias === 'bullish' ? OVERLAY_COLORS.trendUp : bias === 'bearish' ? OVERLAY_COLORS.trendDown : '#fbbf24';

      // Phase label at latest candle
      registry.add('wyckoff', new LabelPrimitive({
        time: candles[candles.length - 1].time as any,
        price: bias === 'bullish' ? safeMin(candles.slice(-20).map(c => c.low)) : safeMax(candles.slice(-20).map(c => c.high)),
        text: phase,
        color: col,
        fontSize: 12,
        align: 'right',
        bg: 'rgba(11, 14, 20, 0.85)',
        position: bias === 'bullish' ? 'below' : 'above',
      }));

      // Event price lines
      (events || []).forEach((ev: any, i: number) => {
        if (ev.price > 0) {
          safeAddPriceLine(`wy-ev-${i}`, ev.price, col, `Wyckoff: ${ev.labelAr || ev.type}`, 1, 0, true, 'wyckoff');
        }
      });

      // FIX: Add key S/R levels as horizontal lines for Wyckoff context
      // even when there are no events from AI data
      if (events.length === 0) {
        const recentHigh = safeMax(candles.slice(-30).map(c => c.high));
        const recentLow = safeMin(candles.slice(-30).map(c => c.low));
        const midRange = (recentHigh + recentLow) / 2;

        // Resistance level
        registry.add('wyckoff', new HorizontalLinePrimitive({
          price: recentHigh,
          color: 'rgba(255, 71, 87, 0.5)',
          lineWidth: 1,
          lineStyle: 2,
          label: 'Resistance',
        }));
        // Support level
        registry.add('wyckoff', new HorizontalLinePrimitive({
          price: recentLow,
          color: 'rgba(0, 255, 163, 0.5)',
          lineWidth: 1,
          lineStyle: 2,
          label: 'Support',
        }));
        // Mid-range (potential equilibrium)
        registry.add('wyckoff', new HorizontalLinePrimitive({
          price: midRange,
          color: 'rgba(251, 191, 36, 0.3)',
          lineWidth: 1,
          lineStyle: 1,
          label: 'Equilibrium',
        }));

        safeAddPriceLine('wy-res', recentHigh, 'rgba(255,71,87,0.5)', 'Resistance', 1, 2, true, 'wyckoff');
        safeAddPriceLine('wy-sup', recentLow, 'rgba(0,255,163,0.5)', 'Support', 1, 2, true, 'wyckoff');
      }
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('wyckoff');
  }

  // ═══════════════════════════════════════════════════════════════
  // VOLUME PROFILE — POC, VAH, VAL
  // ═══════════════════════════════════════════════════════════════
  if (showVP) {
    const vp = input.volumeProfile;
    // Build data signature from VP data
    const vpSig = JSON.stringify(vp ? `${vp.poc}:${vp.vah}:${vp.val}` : null);
    if (registry.smartRedraw('vp', vpSig)) {
    if (vp && vp.poc > 0) {
      registry.add('vp', new HorizontalLinePrimitive({
        price: vp.poc,
        color: OVERLAY_COLORS.vp,
        lineWidth: 2,
        lineStyle: 0,
        label: 'POC',
      }));
      registry.add('vp', new HorizontalLinePrimitive({
        price: vp.vah,
        color: 'rgba(0, 200, 255, 0.6)',
        lineWidth: 1,
        lineStyle: 2,
        label: 'VAH',
      }));
      registry.add('vp', new HorizontalLinePrimitive({
        price: vp.val,
        color: 'rgba(255, 100, 100, 0.6)',
        lineWidth: 1,
        lineStyle: 2,
        label: 'VAL',
      }));

      safeAddPriceLine('vp-poc', vp.poc, 'rgba(251,191,36,0.9)', 'POC', 2, 0, true, 'vp');
      safeAddPriceLine('vp-vah', vp.vah, 'rgba(0,200,255,0.6)', 'VAH', 1, 2, false, 'vp');
      safeAddPriceLine('vp-val', vp.val, 'rgba(255,100,100,0.6)', 'VAL', 1, 2, false, 'vp');
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('vp');
  }

  // ═══════════════════════════════════════════════════════════════
  // ENTRY — Entry/SL/TP from AI signal
  // ═══════════════════════════════════════════════════════════════
  if (showEntry) {
    // Use AI signal data for entry (NOT the broken entryExit:null)
    const signal = input.signal;
    const entryExit = input.entryExit;

    let entry: number, sl: number, tp: number, dir: string;
    // ATR for grid rounding — snap prices to ATR/10 grid to prevent micro-jitter
    let atr: number;
    if (entryExit && entryExit.entryPrice > 0) {
      // AI panel provided explicit entry/SL/TP — use directly (stable, not price-dependent)
      entry = entryExit.entryPrice;
      sl = entryExit.stopLoss;
      tp = entryExit.takeProfit;
      dir = entryExit.direction;
      atr = closedCandles.length >= 14 ? (() => {
        const sl2 = closedCandles.slice(-14);
        const trs = sl2.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.close, Math.abs(c.low - c.close), c.high - c.low));
        return trs.reduce((s, v) => s + v, 0) / trs.length;
      })() : entry * 0.01;
    } else if (signal && signal.entry > 0) {
      // AI council signal — use directly (stable, not price-dependent)
      entry = signal.entry;
      sl = signal.sl;
      tp = signal.tp;
      dir = signal.dir === 'BUY' ? 'long' : 'short';
      atr = closedCandles.length >= 14 ? (() => {
        const sl2 = closedCandles.slice(-14);
        const trs = sl2.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.close, Math.abs(c.low - c.close), c.high - c.low));
        return trs.reduce((s, v) => s + v, 0) / trs.length;
      })() : entry * 0.01;
    } else {
      // Fallback: Use STABLE cached entry (recalculated only on candle close)
      // This is the FIX for "dancing lines" — old code used lastPrice which
      // changed on every tick, causing the signature to change every tick.
      const stable = getStableFallbackEntry(candles);
      entry = stable.entry;
      sl = stable.sl;
      tp = stable.tp;
      dir = stable.dir;
      atr = closedCandles.length >= 14 ? (() => {
        const sl2 = closedCandles.slice(-14);
        const trs = sl2.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.close, Math.abs(c.low - c.close), c.high - c.low));
        return trs.reduce((s, v) => s + v, 0) / trs.length;
      })() : entry * 0.01;
    }

    // ATR/10 grid rounding — snap entry/SL/TP to the nearest ATR/10 grid step.
    // This prevents "dancing lines" caused by tiny price fluctuations (e.g., 
    // entry=1.08432 → 1.08435) that change the line position visually.
    // With grid rounding, both values snap to the same ATR/10 grid point.
    const gridStep = atr / 10;
    if (gridStep > 0) {
      const snapToGrid = (price: number) => Math.round(price / gridStep) * gridStep;
      entry = snapToGrid(entry);
      if (sl > 0) sl = snapToGrid(sl);
      if (tp > 0) tp = snapToGrid(tp);
    }

    // Build data signature from entry/SL/TP/direction — prevents "dancing lines"
    const entrySig = JSON.stringify({ entry, sl, tp, dir });
    if (registry.smartRedraw('entry', entrySig)) {

    // Draw entry/SL/TP using HorizontalLinePrimitive with price badges
    registry.add('entry', new HorizontalLinePrimitive({
      price: entry,
      color: OVERLAY_COLORS.entry,
      lineWidth: 2,
      lineStyle: 0,
      label: `Entry ${dir === 'long' ? '▲ BUY' : '▼ SELL'}`,
      showPrice: true,
    }));
    if (sl > 0) {
      registry.add('entry', new HorizontalLinePrimitive({
        price: sl,
        color: OVERLAY_COLORS.sl,
        lineWidth: 2,
        lineStyle: 2,
        label: 'SL',
        showPrice: true,
      }));
    }
    if (tp > 0) {
      registry.add('entry', new HorizontalLinePrimitive({
        price: tp,
        color: OVERLAY_COLORS.tp,
        lineWidth: 2,
        lineStyle: 2,
        label: 'TP',
        showPrice: true,
      }));
    }

    // SL/TP zone fills
    if (sl > 0 && entry > 0) {
      registry.add('entry', new ZonePrimitive({
        startTime: candles[candles.length - 30]?.time as any || candles[0].time as any,
        endTime: candles[candles.length - 1].time as any,
        highPrice: Math.max(entry, sl),
        lowPrice: Math.min(entry, sl),
        fillColor: 'rgba(239, 68, 68, 0.04)',
        borderColor: undefined,
      }));
    }
    if (tp > 0 && entry > 0) {
      registry.add('entry', new ZonePrimitive({
        startTime: candles[candles.length - 30]?.time as any || candles[0].time as any,
        endTime: candles[candles.length - 1].time as any,
        highPrice: Math.max(entry, tp),
        lowPrice: Math.min(entry, tp),
        fillColor: 'rgba(16, 185, 129, 0.04)',
        borderColor: undefined,
      }));
    }

    // Price lines for axis labels
    safeAddPriceLine('ee-entry', entry, '#00D4FF', `Entry ${dir === 'long' ? 'BUY' : 'SELL'}`, 2, 0, true, 'entry');
    if (sl > 0) safeAddPriceLine('ee-sl', sl, '#FF4757', `SL`, 2, 2, true, 'entry');
    if (tp > 0) safeAddPriceLine('ee-tp', tp, '#00FFA3', `TP`, 2, 2, true, 'entry');
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('entry');
  }

  // ═══════════════════════════════════════════════════════════════
  // FUSION CONFLUENCE — Show Elliott+SMC Fusion confluence zones
  // Renders a colored zone at the bottom of the chart showing
  // the confluence strength and direction from all methods combined.
  // ═══════════════════════════════════════════════════════════════
  if (input.fusionResult && input.fusionResult.confluenceScore > 40) {
    const fusion = input.fusionResult;

    const lastPrice = candles[candles.length - 1].close;
    const recentCandles = candles.slice(-5);
    const lastTime = candles[candles.length - 1].time;

    // Build data signature from fusion data
    const fusionSig = JSON.stringify(`${fusion.direction}:${fusion.confluenceScore}:${fusion.layerScores.directionalAgreement}:${fusion.layerScores.spatialConfluence}`);
    if (registry.smartRedraw('fusion', fusionSig)) {

    // Show confluence direction label on chart
    if (fusion.direction !== 'neutral') {
      const isBull = fusion.direction === 'bullish';
      const confluenceColor = isBull ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      const arrowLabel = isBull ? '▲' : '▼';

      // Confluence label near current price
      registry.add('fusion', new LabelPrimitive({
        time: lastTime as any,
        price: lastPrice,
        text: `${arrowLabel} تقارب ${fusion.confluenceScore}%`,
        color: confluenceColor,
        fontSize: 11,
        align: 'right',
        bg: isBull ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        position: isBull ? 'above' : 'below',
      }));

      // Show layer scores breakdown as a mini-label
      const layerText = `L1:${fusion.layerScores.directionalAgreement}% L2:${fusion.layerScores.spatialConfluence}%`;
      registry.add('fusion', new LabelPrimitive({
        time: recentCandles[0]?.time as any || lastTime as any,
        price: isBull
          ? safeMin(recentCandles.map(c => c.low)) * 0.9995
          : safeMax(recentCandles.map(c => c.high)) * 1.0005,
        text: layerText,
        color: 'rgba(255,255,255,0.4)',
        fontSize: 8,
        align: 'left',
        bg: 'rgba(11,14,20,0.6)',
        position: isBull ? 'below' : 'above',
      }));
    }

    // Show key levels from fusion breakdown factors with proximity
    for (const factor of fusion.confluenceBreakdown) {
      if (factor.proximity && factor.proximity > 0.6 && factor.score > 50) {
        // High-proximity, high-score factor → important level
        const factorColor = factor.direction === 'bullish'
          ? 'rgba(16, 185, 129, 0.3)'
          : factor.direction === 'bearish'
          ? 'rgba(239, 68, 68, 0.3)'
          : 'rgba(255, 255, 255, 0.15)';
        // We already have labels — skip extra lines to avoid clutter
      }
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('fusion');
  }

  // ═══════════════════════════════════════════════════════════════
  // BAYESIAN CONSENSUS — Show Bayesian direction on chart
  // Renders a directional arrow and confidence bar near price
  // ═══════════════════════════════════════════════════════════════
  if (input.bayesianResult && input.bayesianResult.confidence > 0.4) {
    const bayes = input.bayesianResult;

    const lastPrice = candles[candles.length - 1].close;
    const lastTime = candles[candles.length - 1].time;

    // Build data signature from Bayesian data
    const bayesianSig = JSON.stringify(`${bayes.direction}:${bayes.confidence}:${bayes.posteriorBullish}:${bayes.posteriorBearish}`);
    if (registry.smartRedraw('bayesian', bayesianSig)) {

    if (bayes.direction !== 'neutral') {
      const isBull = bayes.direction === 'bullish';
      const bayesColor = isBull ? '#22d3ee' : '#f97316';
      const confPct = Math.round(bayes.confidence * 100);

      // Bayesian direction label
      registry.add('bayesian', new LabelPrimitive({
        time: (lastTime - 3600) as any, // Slightly left of current candle
        price: lastPrice,
        text: `⬡ بايزي ${isBull ? 'صعودي' : 'هبوطي'} ${confPct}%`,
        color: bayesColor,
        fontSize: 9,
        align: 'right',
        bg: `${bayesColor}15`,
        position: isBull ? 'below' : 'above',
      }));

      // Posterior probability bar — show as text label
      const bullPct = Math.round(bayes.posteriorBullish * 100);
      const bearPct = Math.round(bayes.posteriorBearish * 100);
      registry.add('bayesian', new LabelPrimitive({
        time: (lastTime - 7200) as any,
        price: isBull
          ? safeMin(candles.slice(-10).map(c => c.low))
          : safeMax(candles.slice(-10).map(c => c.high)),
        text: `P(▲)=${bullPct}% P(▼)=${bearPct}%`,
        color: 'rgba(255,255,255,0.35)',
        fontSize: 7,
        align: 'left',
        bg: 'rgba(11,14,20,0.5)',
        position: isBull ? 'below' : 'above',
      }));
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('bayesian');
  }

  // ═══════════════════════════════════════════════════════════════
  // ALERT MARKERS — Visual alert pins on chart for auto-detected
  // high-confidence patterns.
  //
  // FIX: Only show alerts when their DEDICATED overlay button is
  // active. Previously, ALL alerts were shown whenever ANY overlay
  // was toggled on, causing red/green circles on almost every candle.
  // Now: 'smc' alerts only with BOS, 'fvg' alerts only with FVG,
  // 'harmonic' alerts only with Harmonic, 'pattern' alerts are
  // suppressed (too many — they clutter the chart).
  // ═══════════════════════════════════════════════════════════════
  if (input.alerts && input.alerts.length > 0) {
    // Filter alerts: only show alerts whose overlay is currently active
    const filteredAlerts = input.alerts.filter((alert) => {
      switch (alert.type) {
        case 'smc':      return showBOS;       // BOS/CHoCH alerts → BOS button
        case 'fvg':      return showFVG;       // FVG alerts → FVG button
        case 'harmonic': return showHarmonic;  // Harmonic alerts → Harmonic button
        case 'pattern':  return false;         // Candlestick pattern alerts suppressed (too many, clutter chart)
        default:         return false;         // Unknown alert types suppressed
      }
    });
    // Build data signature from filtered alerts
    const alertsSig = JSON.stringify(filteredAlerts.slice(-8).map(a => `${a.type}:${a.price}:${a.direction}:${a.confidence}`).join('|'));
    if (registry.smartRedraw('alerts', alertsSig)) {
    // Show max 8 most recent filtered alert markers to avoid clutter
    filteredAlerts.slice(-8).forEach((alert) => {
      registry.add('alerts', new AlertMarkerPrimitive({
        time: alert.time,
        price: alert.price,
        label: alert.label,
        direction: alert.direction,
        confidence: alert.confidence,
        type: alert.type,
      }));
    });
    // If no alerts pass the filter, clear the type so stale pins don't remain
    if (filteredAlerts.length === 0) {
      registry.clearType('alerts');
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('alerts');
  }

  // ═══════════════════════════════════════════════════════════════
  // MTF CONFLUENCE — Multi-Timeframe alignment visualization
  // Shows confluence direction label, S/R confluence levels,
  // and Fibonacci confluence zones across timeframes.
  // ═══════════════════════════════════════════════════════════════
  if (showMTF && input.mtfResult && input.mtfResult.confluenceScore > 30) {
    const mtf = input.mtfResult;

    const lastPrice = candles[candles.length - 1].close;
    const lastTime = candles[candles.length - 1].time;

    // Build data signature from MTF data
    const mtfSig = JSON.stringify(`${mtf.confluenceDirection}:${mtf.confluenceScore}:${mtf.agreeingTFs}:${mtf.srConfluences.length}:${mtf.fibConfluences.length}`);
    if (registry.smartRedraw('mtf', mtfSig)) {

    if (mtf.confluenceDirection !== 'neutral') {
      const isBull = mtf.confluenceDirection === 'bullish';
      const mtfColor = isBull ? 'rgba(34, 211, 238, 0.9)' : 'rgba(249, 115, 22, 0.9)';
      const arrow = isBull ? '▲' : '▼';

      // MTF confluence label
      registry.add('mtf', new LabelPrimitive({
        time: lastTime as any,
        price: isBull
          ? safeMin(candles.slice(-10).map(c => c.low)) * 0.999
          : safeMax(candles.slice(-10).map(c => c.high)) * 1.001,
        text: `${arrow} MTF ${mtf.confluenceScore}% (${mtf.agreeingTFs}/${mtf.totalTFs})`,
        color: mtfColor,
        fontSize: 10,
        align: 'right',
        bg: isBull ? 'rgba(34, 211, 238, 0.12)' : 'rgba(249, 115, 22, 0.12)',
        position: isBull ? 'below' : 'above',
      }));
    }

    // S/R confluence levels (shared across timeframes)
    for (const sr of mtf.srConfluences.slice(0, 3)) {
      const opacity = Math.min(0.8, sr.combinedStrength);
      const srColor = sr.type === 'support'
        ? `rgba(0, 255, 163, ${opacity})`
        : `rgba(255, 71, 87, ${opacity})`;
      registry.add('mtf', new HorizontalLinePrimitive({
        price: sr.price,
        color: srColor,
        lineWidth: sr.combinedStrength > 0.7 ? 2 : 1,
        lineStyle: 1,
        label: `${sr.labelAr} (${sr.timeframes.length}TF)`,
      }));
      safeAddPriceLine(`mtf-sr-${sr.price}`, sr.price, srColor, sr.labelAr, sr.combinedStrength > 0.7 ? 2 : 1, 1, true, 'mtf');
    }

    // Fibonacci confluence zones
    for (const fib of mtf.fibConfluences.slice(0, 3)) {
      const fibColor = fib.direction === 'bullish'
        ? 'rgba(212, 175, 55, 0.3)'
        : 'rgba(212, 175, 55, 0.3)';
      registry.add('mtf', new HorizontalLinePrimitive({
        price: fib.price,
        color: fibColor,
        lineWidth: 1,
        lineStyle: 2,
        label: `Fib MTF (${fib.ratios.length})`,
      }));
      safeAddPriceLine(`mtf-fib-${fib.price}`, fib.price, fibColor, `Fib MTF ${fib.ratios.map(r => r.label).join('+')}`, 1, 2, false, 'mtf');
    }

    // Divergence warnings
    for (const div of mtf.divergences.filter(d => d.significance > 0.5).slice(0, 2)) {
      registry.add('mtf', new LabelPrimitive({
        time: (lastTime - 3600) as any,
        price: lastPrice,
        text: `⚠ ${div.type === 'bullish-divergence' ? 'تباعد صعودي' : div.type === 'bearish-divergence' ? 'تباعد هبوطي' : 'تباعد زخم'}`,
        color: 'rgba(245, 158, 11, 0.7)',
        fontSize: 8,
        align: 'right',
        bg: 'rgba(245, 158, 11, 0.08)',
        position: 'above',
      }));
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('mtf');
  }

  // ═══════════════════════════════════════════════════════════════
  // TRADE PROPOSALS — Show active trade Entry/SL/TP1/TP2/TP3
  // Renders lines for each price level with zones showing
  // risk (red) and reward (green) areas.
  // ═══════════════════════════════════════════════════════════════
  if (showTrade && input.tradeProposals && input.tradeProposals.length > 0) {
    // Show the most recent active trade proposal
    const proposal = input.tradeProposals.find(p =>
      p.status === 'pending' || p.status === 'active' || p.status === 'breakeven'
    ) || input.tradeProposals[0];

    // Build data signature from trade proposal
    const tradeSig = JSON.stringify(proposal ? `${proposal.id}:${proposal.entryPrice}:${proposal.stopLoss}:${proposal.takeProfits.join(',')}:${proposal.currentTrailSL}:${proposal.status}` : null);
    if (registry.smartRedraw('trade', tradeSig)) {

    if (proposal) {
      const isBull = proposal.direction === 'bullish';
      const dirAr = isBull ? 'شراء' : 'بيع';

      // Entry line
      registry.add('trade', new HorizontalLinePrimitive({
        price: proposal.entryPrice,
        color: isBull ? '#22d3ee' : '#f97316',
        lineWidth: 2,
        lineStyle: 0,
        label: `Entry ${dirAr} (Q:${proposal.qualityScore})`,
        showPrice: true,
      }));

      // Stop Loss line (use trail SL if active)
      const effectiveSL = proposal.currentTrailSL ?? proposal.stopLoss;
      registry.add('trade', new HorizontalLinePrimitive({
        price: effectiveSL,
        color: proposal.currentTrailSL ? '#fbbf24' : '#ef4444',
        lineWidth: 2,
        lineStyle: proposal.currentTrailSL ? 0 : 2,
        label: proposal.currentTrailSL ? 'Trail SL' : 'SL',
        showPrice: true,
      }));

      // Take Profit levels (TP1, TP2, TP3)
      const tpLabels = ['TP1 (50%)', 'TP2 (30%)', 'TP3 (20%)'];
      const tpColors = ['rgba(16, 185, 129, 0.8)', 'rgba(16, 185, 129, 0.6)', 'rgba(16, 185, 129, 0.4)'];
      const tpLineStyles = [0, 1, 2];

      for (let i = 0; i < proposal.takeProfits.length; i++) {
        registry.add('trade', new HorizontalLinePrimitive({
          price: proposal.takeProfits[i],
          color: tpColors[i] || tpColors[2],
          lineWidth: i === 0 ? 2 : 1,
          lineStyle: tpLineStyles[i] ?? 2,
          label: tpLabels[i] || `TP${i + 1}`,
          showPrice: true,
        }));
      }

      // Risk zone (Entry → SL)
      registry.add('trade', new ZonePrimitive({
        startTime: candles[candles.length - 30]?.time as any || candles[0].time as any,
        endTime: candles[candles.length - 1].time as any,
        highPrice: Math.max(proposal.entryPrice, effectiveSL),
        lowPrice: Math.min(proposal.entryPrice, effectiveSL),
        fillColor: 'rgba(239, 68, 68, 0.05)',
        borderColor: undefined,
      }));

      // Reward zone (Entry → TP3)
      registry.add('trade', new ZonePrimitive({
        startTime: candles[candles.length - 30]?.time as any || candles[0].time as any,
        endTime: candles[candles.length - 1].time as any,
        highPrice: Math.max(proposal.entryPrice, proposal.takeProfits[2]),
        lowPrice: Math.min(proposal.entryPrice, proposal.takeProfits[2]),
        fillColor: 'rgba(16, 185, 129, 0.04)',
        borderColor: undefined,
      }));

      // NOTE: No safeAddPriceLine — HorizontalLinePrimitive already draws lines + labels
      // Previously safeAddPriceLine was called here creating DUPLICATE lines that jitter

      // R:R and quality label
      registry.add('trade', new LabelPrimitive({
        time: candles[candles.length - 1].time as any,
        price: isBull
          ? safeMax(candles.slice(-5).map(c => c.high)) * 1.002
          : safeMin(candles.slice(-5).map(c => c.low)) * 0.998,
        text: `R:R 1:${proposal.rrRatio} | جودة ${proposal.qualityScore}% | ثقة ${Math.round(proposal.confidence * 100)}%`,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 8,
        align: 'right',
        bg: 'rgba(11,14,20,0.7)',
        position: isBull ? 'above' : 'below',
      }));
    }

    // If no active proposal, clear
    if (!proposal) {
      registry.clearType('trade');
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('trade');
  }

  // ═══════════════════════════════════════════════════════════════
  // LIQUIDITY ZONES — Show liquidity pools, sweeps, and voids
  // Uses LiquidityZones engine for ICT/SMC liquidity analysis.
  // ═══════════════════════════════════════════════════════════════
  if (showLiq) {
    // Use provided liquidity data or detect locally
    const liqData = input.liquidityResult;

    // Build data signature from liquidity zones
    const liqSig = JSON.stringify(liqData ? `${liqData.activeZones}:${liqData.sweptZones}:${liqData.dominantSweepDirection}:${liqData.zones.map(z => `${z.type}:${z.price}:${z.swept}`).join('|')}` : null);
    if (registry.smartRedraw('liq', liqSig)) {

    if (liqData && liqData.zones.length > 0) {
      const lastTime = candles[candles.length - 1].time;
      const lastPrice = candles[candles.length - 1].close;

      for (const zone of liqData.zones) {
        // Draw zone rectangle
        registry.add('liq', new ZonePrimitive({
          startTime: zone.startTime as any,
          endTime: (zone.swept ? (zone.sweepTime || zone.endTime) : lastTime) as any,
          highPrice: zone.high,
          lowPrice: zone.low,
          fillColor: zone.swept
            ? 'rgba(156, 163, 175, 0.06)'  // Grayed out if swept
            : zone.sweepDirection === 'bullish'
              ? 'rgba(0, 255, 163, 0.08)'   // Green for bullish sweep zones
              : 'rgba(255, 71, 87, 0.08)',   // Red for bearish sweep zones
          borderColor: zone.swept
            ? undefined
            : zone.sweepDirection === 'bullish'
              ? 'rgba(0, 255, 163, 0.3)'
              : 'rgba(255, 71, 87, 0.3)',
        }));

        // Label for significant zones (strength >= 3 or unswept)
        if (!zone.swept && zone.strength >= 2) {
          const labelColor = zone.sweepDirection === 'bullish'
            ? 'rgba(0, 255, 163, 0.8)'
            : 'rgba(255, 71, 87, 0.8)';
          registry.add('liq', new LabelPrimitive({
            time: zone.startTime as any,
            price: zone.type === 'equal_highs' || zone.type === 'previous_high'
              ? zone.high
              : zone.low,
            text: zone.labelAr,
            color: labelColor,
            fontSize: 7,
            align: 'left',
            bg: zone.sweepDirection === 'bullish'
              ? 'rgba(0, 255, 163, 0.08)'
              : 'rgba(255, 71, 87, 0.08)',
            position: zone.type === 'equal_highs' || zone.type === 'previous_high'
              ? 'above'
              : 'below',
          }));
        }

        // Horizontal line at the pool price level (for active zones)
        if (!zone.swept && zone.strength >= 3) {
          const lineColor = zone.sweepDirection === 'bullish'
            ? 'rgba(0, 255, 163, 0.5)'
            : 'rgba(255, 71, 87, 0.5)';
          registry.add('liq', new HorizontalLinePrimitive({
            price: zone.price,
            color: lineColor,
            lineWidth: 1,
            lineStyle: 2,
            label: `${zone.labelAr} ×${zone.strength}`,
          }));
          safeAddPriceLine(`liq-${zone.type}-${zone.price}`, zone.price, lineColor, `${zone.labelAr} ×${zone.strength}`, 1, 2, false, 'liq');
        }
      }

      // Dominant sweep direction indicator
      if (liqData.dominantSweepDirection !== 'neutral' && liqData.sweptZones > 0) {
        const isBull = liqData.dominantSweepDirection === 'bullish';
        registry.add('liq', new LabelPrimitive({
          time: lastTime as any,
          price: isBull
            ? safeMin(candles.slice(-5).map(c => c.low)) * 0.998
            : safeMax(candles.slice(-5).map(c => c.high)) * 1.002,
          text: `${isBull ? '▲' : '▼'} سيولة ${isBull ? 'صاعد' : 'هابط'} (${liqData.sweptZones} مسحوب)`,
          color: isBull ? 'rgba(0, 255, 163, 0.9)' : 'rgba(255, 71, 87, 0.9)',
          fontSize: 9,
          align: 'right',
          bg: isBull ? 'rgba(0, 255, 163, 0.1)' : 'rgba(255, 71, 87, 0.1)',
          position: isBull ? 'below' : 'above',
        }));
      }
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('liq');
  }

  // ═══════════════════════════════════════════════════════════════
  // HEATMAP — Show confidence heatmap colored lines on chart
  // Uses ConfidenceHeatmap engine data when available.
  // ═══════════════════════════════════════════════════════════════
  if (showEntry) {
    // Heatmap is rendered as part of the entry overlay data
    // (confidence heatmap colors are shown on the Entry price axis)
    // The actual heatmap rendering is handled by the ConfidenceHeatmap
    // engine via buildHeatmap() → renderHeatmapOnChart()
  }
  if (!showLiq) {
    registry.clearType('liq');
  }
  if (!showMTF) {
    registry.clearType('mtf');
  }
  if (!showTrade) {
    registry.clearType('trade');
  }

  } finally {
    // Always release the mutex, even if an error occurred
    registry.releaseRenderLock();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SUSTAINABLE: renderAnalysisOverlays — Independent pipeline for
// analysis-dependent overlays only.
//
// This function is the KEY to the sustainable overlay architecture.
// It renders ONLY overlays that depend on AI analysis data:
//   VP, Entry, Fusion, Bayesian, Alerts, MTF, Trade, Liquidity
//
// It does NOT touch candle-only overlays:
//   SR, Trend, Harmonic, FVG, BOS, Geo, Elliott, Wyckoff
//
// When handlePatternsDetected fires (analysis completes), it calls this
// function instead of renderOverlays. This means:
// 1. No flicker — candle-only overlays stay rendered
// 2. No double emission — each pipeline renders its own types
// 3. No race condition — analysis overlay data is independent
// ═══════════════════════════════════════════════════════════════════════
export function renderAnalysisOverlays(
  series: ISeriesApi<SeriesType>,
  input: OverlayInput,
  addPriceLine?: (id: string, price: number, color: string, label: string, lineWidth: number, lineStyle: number, axisLabelVisible: boolean) => void,
  removePriceLine?: (id: string) => void,
): void {
  const { candles, overlays } = input;
  if (!candles.length || candles.length < 20) return;

  const registry = getOverlayRegistry();
  registry.init(series, removePriceLine ?? undefined);

  // Use closed candles for stable calculations (same as renderOverlays)
  const closedCandles = candles.length > 1 ? candles.slice(0, -1) : candles;

  const ov = overlays || {};
  const showVP = ov.vp === true;
  const showEntry = ov.entry === true;
  const showMTF = ov.mtf === true;
  const showLiq = ov.liq === true;
  const showTrade = ov.trade === true;

  // ── Helper: safe price line ──
  const safeAddPriceLine = (id: string, price: number, color: string, label: string, lw: number, ls: number, axisVisible: boolean, _type: OverlayType) => {
    if (!addPriceLine) return;
    const range = candles.slice(-30);
    const high = safeMax(range.map(c => c.high));
    const low = safeMin(range.map(c => c.low));
    const maxDist = (high - low) * 3;
    const lastPrice = candles[candles.length - 1].close;
    if (Math.abs(price - lastPrice) > maxDist) return;
    addPriceLine(id, price, color, label, lw, ls, axisVisible);
    registry.addPriceLineId(_type, id);
  };

  // ── VP: Volume Profile (analysis-dependent) ──
  if (showVP) {
    const vp = input.volumeProfile;
    // Build data signature from VP data
    const vpSig = JSON.stringify(vp ? `${vp.poc}:${vp.vah}:${vp.val}` : null);
    if (registry.smartRedraw('vp', vpSig)) {
    if (vp && vp.poc > 0) {
      registry.add('vp', new HorizontalLinePrimitive({
        price: vp.poc, color: OVERLAY_COLORS.vp, lineWidth: 2, lineStyle: 0, label: 'POC',
      }));
      registry.add('vp', new HorizontalLinePrimitive({
        price: vp.vah, color: 'rgba(0, 200, 255, 0.6)', lineWidth: 1, lineStyle: 2, label: 'VAH',
      }));
      registry.add('vp', new HorizontalLinePrimitive({
        price: vp.val, color: 'rgba(255, 100, 100, 0.6)', lineWidth: 1, lineStyle: 2, label: 'VAL',
      }));
      safeAddPriceLine('vp-poc', vp.poc, 'rgba(251,191,36,0.9)', 'POC', 2, 0, true, 'vp');
      safeAddPriceLine('vp-vah', vp.vah, 'rgba(0,200,255,0.6)', 'VAH', 1, 2, false, 'vp');
      safeAddPriceLine('vp-val', vp.val, 'rgba(255,100,100,0.6)', 'VAL', 1, 2, false, 'vp');
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('vp');
  }

  // ── ENTRY: Entry/SL/TP (analysis-dependent) ──
  if (showEntry) {
    const signal = input.signal;
    const entryExit = input.entryExit;
    let entry: number, sl: number, tp: number, dir: string;
    let atr: number;
    if (entryExit && entryExit.entryPrice > 0) {
      entry = entryExit.entryPrice; sl = entryExit.stopLoss; tp = entryExit.takeProfit; dir = entryExit.direction;
      atr = closedCandles.length >= 14 ? (() => {
        const sl2 = closedCandles.slice(-14);
        const trs = sl2.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.close, Math.abs(c.low - c.close), c.high - c.low));
        return trs.reduce((s, v) => s + v, 0) / trs.length;
      })() : entry * 0.01;
    } else if (signal && signal.entry > 0) {
      entry = signal.entry; sl = signal.sl; tp = signal.tp; dir = signal.dir === 'BUY' ? 'long' : 'short';
      atr = closedCandles.length >= 14 ? (() => {
        const sl2 = closedCandles.slice(-14);
        const trs = sl2.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.close, Math.abs(c.low - c.close), c.high - c.low));
        return trs.reduce((s, v) => s + v, 0) / trs.length;
      })() : entry * 0.01;
    } else {
      // Use STABLE cached entry (same as renderOverlays)
      const stable = getStableFallbackEntry(candles);
      entry = stable.entry; sl = stable.sl; tp = stable.tp; dir = stable.dir;
      atr = closedCandles.length >= 14 ? (() => {
        const sl2 = closedCandles.slice(-14);
        const trs = sl2.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.close, Math.abs(c.low - c.close), c.high - c.low));
        return trs.reduce((s, v) => s + v, 0) / trs.length;
      })() : entry * 0.01;
    }
    // ATR/10 grid rounding — snap entry/SL/TP to prevent micro-jitter
    const gridStep = atr / 10;
    if (gridStep > 0) {
      const snapToGrid = (price: number) => Math.round(price / gridStep) * gridStep;
      entry = snapToGrid(entry);
      if (sl > 0) sl = snapToGrid(sl);
      if (tp > 0) tp = snapToGrid(tp);
    }
    // Build data signature from entry/SL/TP/direction — prevents "dancing lines"
    const entrySig = JSON.stringify({ entry, sl, tp, dir });
    if (registry.smartRedraw('entry', entrySig)) {
    registry.add('entry', new HorizontalLinePrimitive({ price: entry, color: OVERLAY_COLORS.entry, lineWidth: 2, lineStyle: 0, label: `Entry ${dir === 'long' ? '▲ BUY' : '▼ SELL'}`, showPrice: true }));
    if (sl > 0) registry.add('entry', new HorizontalLinePrimitive({ price: sl, color: OVERLAY_COLORS.sl, lineWidth: 2, lineStyle: 2, label: 'SL', showPrice: true }));
    if (tp > 0) registry.add('entry', new HorizontalLinePrimitive({ price: tp, color: OVERLAY_COLORS.tp, lineWidth: 2, lineStyle: 2, label: 'TP', showPrice: true }));
    if (sl > 0 && entry > 0) registry.add('entry', new ZonePrimitive({ startTime: candles[candles.length - 30]?.time as any || candles[0].time as any, endTime: candles[candles.length - 1].time as any, highPrice: Math.max(entry, sl), lowPrice: Math.min(entry, sl), fillColor: 'rgba(239, 68, 68, 0.04)', borderColor: undefined }));
    if (tp > 0 && entry > 0) registry.add('entry', new ZonePrimitive({ startTime: candles[candles.length - 30]?.time as any || candles[0].time as any, endTime: candles[candles.length - 1].time as any, highPrice: Math.max(entry, tp), lowPrice: Math.min(entry, tp), fillColor: 'rgba(16, 185, 129, 0.04)', borderColor: undefined }));
    safeAddPriceLine('ee-entry', entry, '#00D4FF', `Entry ${dir === 'long' ? 'BUY' : 'SELL'}`, 2, 0, true, 'entry');
    if (sl > 0) safeAddPriceLine('ee-sl', sl, '#FF4757', 'SL', 2, 2, true, 'entry');
    if (tp > 0) safeAddPriceLine('ee-tp', tp, '#00FFA3', 'TP', 2, 2, true, 'entry');
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('entry');
  }

  // ── FUSION: Confluence (analysis-dependent) ──
  if (input.fusionResult && input.fusionResult.confluenceScore > 40) {
    const fusion = input.fusionResult;
    const lastPrice = candles[candles.length - 1].close;
    const lastTime = candles[candles.length - 1].time;
    // Build data signature from fusion data
    const fusionSig = JSON.stringify(`${fusion.direction}:${fusion.confluenceScore}:${fusion.layerScores.directionalAgreement}:${fusion.layerScores.spatialConfluence}`);
    if (registry.smartRedraw('fusion', fusionSig)) {
    if (fusion.direction !== 'neutral') {
      const isBull = fusion.direction === 'bullish';
      const confluenceColor = isBull ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      const arrowLabel = isBull ? '▲' : '▼';
      registry.add('fusion', new LabelPrimitive({ time: lastTime as any, price: lastPrice, text: `${arrowLabel} تقارب ${fusion.confluenceScore}%`, color: confluenceColor, fontSize: 11, align: 'right', bg: isBull ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', position: isBull ? 'above' : 'below' }));
      const recentCandles = candles.slice(-5);
      const layerText = `L1:${fusion.layerScores.directionalAgreement}% L2:${fusion.layerScores.spatialConfluence}%`;
      registry.add('fusion', new LabelPrimitive({ time: recentCandles[0]?.time as any || lastTime as any, price: isBull ? safeMin(recentCandles.map(c => c.low)) * 0.9995 : safeMax(recentCandles.map(c => c.high)) * 1.0005, text: layerText, color: 'rgba(255,255,255,0.4)', fontSize: 8, align: 'left', bg: 'rgba(11,14,20,0.6)', position: isBull ? 'below' : 'above' }));
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('fusion');
  }

  // ── BAYESIAN: Consensus direction (analysis-dependent) ──
  if (input.bayesianResult && input.bayesianResult.confidence > 0.4) {
    const bayes = input.bayesianResult;
    const lastPrice = candles[candles.length - 1].close;
    const lastTime = candles[candles.length - 1].time;
    // Build data signature from Bayesian data
    const bayesianSig = JSON.stringify(`${bayes.direction}:${bayes.confidence}:${bayes.posteriorBullish}:${bayes.posteriorBearish}`);
    if (registry.smartRedraw('bayesian', bayesianSig)) {
    if (bayes.direction !== 'neutral') {
      const isBull = bayes.direction === 'bullish';
      const bayesColor = isBull ? '#22d3ee' : '#f97316';
      const confPct = Math.round(bayes.confidence * 100);
      registry.add('bayesian', new LabelPrimitive({ time: (lastTime - 3600) as any, price: lastPrice, text: `⬡ بايزي ${isBull ? 'صعودي' : 'هبوطي'} ${confPct}%`, color: bayesColor, fontSize: 9, align: 'right', bg: `${bayesColor}15`, position: isBull ? 'below' : 'above' }));
      const bullPct = Math.round(bayes.posteriorBullish * 100);
      const bearPct = Math.round(bayes.posteriorBearish * 100);
      registry.add('bayesian', new LabelPrimitive({ time: (lastTime - 7200) as any, price: isBull ? safeMin(candles.slice(-10).map(c => c.low)) : safeMax(candles.slice(-10).map(c => c.high)), text: `P(▲)=${bullPct}% P(▼)=${bearPct}%`, color: 'rgba(255,255,255,0.35)', fontSize: 7, align: 'left', bg: 'rgba(11,14,20,0.5)', position: isBull ? 'below' : 'above' }));
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('bayesian');
  }

  // ── ALERTS: Visual pins (analysis-dependent) ──
  if (input.alerts && input.alerts.length > 0) {
    const filteredAlerts = input.alerts.filter((alert) => {
      switch (alert.type) {
        case 'smc':      return ov.bos === true;
        case 'fvg':      return ov.fvg === true;
        case 'harmonic': return ov.harmonic === true;
        case 'pattern':  return false;
        default:         return false;
      }
    });
    // Build data signature from filtered alerts
    const alertsSig = JSON.stringify(filteredAlerts.slice(-8).map(a => `${a.type}:${a.price}:${a.direction}:${a.confidence}`).join('|'));
    if (registry.smartRedraw('alerts', alertsSig)) {
    filteredAlerts.slice(-8).forEach((alert) => {
      registry.add('alerts', new AlertMarkerPrimitive({ time: alert.time, price: alert.price, label: alert.label, direction: alert.direction, confidence: alert.confidence, type: alert.type }));
    });
    if (filteredAlerts.length === 0) registry.clearType('alerts');
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('alerts');
  }

  // ── MTF: Multi-Timeframe (analysis-dependent) ──
  if (showMTF && input.mtfResult && input.mtfResult.confluenceScore > 30) {
    const mtf = input.mtfResult;
    const lastPrice = candles[candles.length - 1].close;
    const lastTime = candles[candles.length - 1].time;
    // Build data signature from MTF data
    const mtfSig = JSON.stringify(`${mtf.confluenceDirection}:${mtf.confluenceScore}:${mtf.agreeingTFs}:${mtf.srConfluences.length}:${mtf.fibConfluences.length}`);
    if (registry.smartRedraw('mtf', mtfSig)) {
    if (mtf.confluenceDirection !== 'neutral') {
      const isBull = mtf.confluenceDirection === 'bullish';
      const mtfColor = isBull ? 'rgba(34, 211, 238, 0.9)' : 'rgba(249, 115, 22, 0.9)';
      const arrow = isBull ? '▲' : '▼';
      registry.add('mtf', new LabelPrimitive({ time: lastTime as any, price: isBull ? safeMin(candles.slice(-10).map(c => c.low)) * 0.999 : safeMax(candles.slice(-10).map(c => c.high)) * 1.001, text: `${arrow} MTF ${mtf.confluenceScore}% (${mtf.agreeingTFs}/${mtf.totalTFs})`, color: mtfColor, fontSize: 10, align: 'right', bg: isBull ? 'rgba(34, 211, 238, 0.12)' : 'rgba(249, 115, 22, 0.12)', position: isBull ? 'below' : 'above' }));
    }
    for (const sr of mtf.srConfluences.slice(0, 3)) {
      const opacity = Math.min(0.8, sr.combinedStrength);
      const srColor = sr.type === 'support' ? `rgba(0, 255, 163, ${opacity})` : `rgba(255, 71, 87, ${opacity})`;
      registry.add('mtf', new HorizontalLinePrimitive({ price: sr.price, color: srColor, lineWidth: sr.combinedStrength > 0.7 ? 2 : 1, lineStyle: 1, label: `${sr.labelAr} (${sr.timeframes.length}TF)` }));
      safeAddPriceLine(`mtf-sr-${sr.price}`, sr.price, srColor, sr.labelAr, sr.combinedStrength > 0.7 ? 2 : 1, 1, true, 'mtf');
    }
    for (const fib of mtf.fibConfluences.slice(0, 3)) {
      const fibColor = 'rgba(212, 175, 55, 0.3)';
      registry.add('mtf', new HorizontalLinePrimitive({ price: fib.price, color: fibColor, lineWidth: 1, lineStyle: 2, label: `Fib MTF (${fib.ratios.length})` }));
      safeAddPriceLine(`mtf-fib-${fib.price}`, fib.price, fibColor, `Fib MTF ${fib.ratios.map(r => r.label).join('+')}`, 1, 2, false, 'mtf');
    }
    for (const div of mtf.divergences.filter(d => d.significance > 0.5).slice(0, 2)) {
      registry.add('mtf', new LabelPrimitive({ time: (lastTime - 3600) as any, price: lastPrice, text: `⚠ ${div.type === 'bullish-divergence' ? 'تباعد صعودي' : div.type === 'bearish-divergence' ? 'تباعد هبوطي' : 'تباعد زخم'}`, color: 'rgba(245, 158, 11, 0.7)', fontSize: 8, align: 'right', bg: 'rgba(245, 158, 11, 0.08)', position: 'above' }));
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('mtf');
  }

  // ── TRADE: Proposals (analysis-dependent) ──
  if (showTrade && input.tradeProposals && input.tradeProposals.length > 0) {
    const proposal = input.tradeProposals.find(p => p.status === 'pending' || p.status === 'active' || p.status === 'breakeven') || input.tradeProposals[0];
    // Build data signature from trade proposal
    const tradeSig = JSON.stringify(proposal ? `${proposal.id}:${proposal.entryPrice}:${proposal.stopLoss}:${proposal.takeProfits.join(',')}:${proposal.currentTrailSL}:${proposal.status}` : null);
    if (registry.smartRedraw('trade', tradeSig)) {
    if (proposal) {
      const isBull = proposal.direction === 'bullish';
      const dirAr = isBull ? 'شراء' : 'بيع';
      registry.add('trade', new HorizontalLinePrimitive({ price: proposal.entryPrice, color: isBull ? '#22d3ee' : '#f97316', lineWidth: 2, lineStyle: 0, label: `Entry ${dirAr} (Q:${proposal.qualityScore})`, showPrice: true }));
      const effectiveSL = proposal.currentTrailSL ?? proposal.stopLoss;
      registry.add('trade', new HorizontalLinePrimitive({ price: effectiveSL, color: proposal.currentTrailSL ? '#fbbf24' : '#ef4444', lineWidth: 2, lineStyle: proposal.currentTrailSL ? 0 : 2, label: proposal.currentTrailSL ? 'Trail SL' : 'SL', showPrice: true }));
      const tpLabels = ['TP1 (50%)', 'TP2 (30%)', 'TP3 (20%)'];
      const tpColors = ['rgba(16, 185, 129, 0.8)', 'rgba(16, 185, 129, 0.6)', 'rgba(16, 185, 129, 0.4)'];
      for (let i = 0; i < proposal.takeProfits.length; i++) {
        registry.add('trade', new HorizontalLinePrimitive({ price: proposal.takeProfits[i], color: tpColors[i] || tpColors[2], lineWidth: i === 0 ? 2 : 1, lineStyle: i === 0 ? 0 : i === 1 ? 1 : 2, label: tpLabels[i] || `TP${i + 1}`, showPrice: true }));
      }
      registry.add('trade', new ZonePrimitive({ startTime: candles[candles.length - 30]?.time as any || candles[0].time as any, endTime: candles[candles.length - 1].time as any, highPrice: Math.max(proposal.entryPrice, effectiveSL), lowPrice: Math.min(proposal.entryPrice, effectiveSL), fillColor: 'rgba(239, 68, 68, 0.05)', borderColor: undefined }));
      if (proposal.takeProfits[2]) {
        registry.add('trade', new ZonePrimitive({ startTime: candles[candles.length - 30]?.time as any || candles[0].time as any, endTime: candles[candles.length - 1].time as any, highPrice: Math.max(proposal.entryPrice, proposal.takeProfits[2]), lowPrice: Math.min(proposal.entryPrice, proposal.takeProfits[2]), fillColor: 'rgba(16, 185, 129, 0.04)', borderColor: undefined }));
      }
      // NOTE: No safeAddPriceLine — HorizontalLinePrimitive handles lines + labels
      registry.add('trade', new LabelPrimitive({ time: candles[candles.length - 1].time as any, price: isBull ? safeMax(candles.slice(-5).map(c => c.high)) * 1.002 : safeMin(candles.slice(-5).map(c => c.low)) * 0.998, text: `R:R 1:${proposal.rrRatio} | جودة ${proposal.qualityScore}% | ثقة ${Math.round(proposal.confidence * 100)}%`, color: 'rgba(255,255,255,0.5)', fontSize: 8, align: 'right', bg: 'rgba(11,14,20,0.7)', position: isBull ? 'above' : 'below' }));
    }
    if (!proposal) registry.clearType('trade');
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('trade');
  }

  // ── LIQUIDITY: Zones (analysis-dependent) ──
  if (showLiq) {
    const liqData = input.liquidityResult;
    // Build data signature from liquidity zones
    const liqSig = JSON.stringify(liqData ? `${liqData.activeZones}:${liqData.sweptZones}:${liqData.dominantSweepDirection}:${liqData.zones.map(z => `${z.type}:${z.price}:${z.swept}`).join('|')}` : null);
    if (registry.smartRedraw('liq', liqSig)) {
    if (liqData && liqData.zones.length > 0) {
      const lastTime = candles[candles.length - 1].time;
      for (const zone of liqData.zones) {
        registry.add('liq', new ZonePrimitive({ startTime: zone.startTime as any, endTime: (zone.swept ? (zone.sweepTime || zone.endTime) : lastTime) as any, highPrice: zone.high, lowPrice: zone.low, fillColor: zone.swept ? 'rgba(156, 163, 175, 0.06)' : zone.sweepDirection === 'bullish' ? 'rgba(0, 255, 163, 0.08)' : 'rgba(255, 71, 87, 0.08)', borderColor: zone.swept ? undefined : zone.sweepDirection === 'bullish' ? 'rgba(0, 255, 163, 0.3)' : 'rgba(255, 71, 87, 0.3)' }));
        if (!zone.swept && zone.strength >= 2) {
          const labelColor = zone.sweepDirection === 'bullish' ? 'rgba(0, 255, 163, 0.8)' : 'rgba(255, 71, 87, 0.8)';
          registry.add('liq', new LabelPrimitive({ time: zone.startTime as any, price: zone.type === 'equal_highs' || zone.type === 'previous_high' ? zone.high : zone.low, text: zone.labelAr, color: labelColor, fontSize: 7, align: 'left', bg: zone.sweepDirection === 'bullish' ? 'rgba(0, 255, 163, 0.08)' : 'rgba(255, 71, 87, 0.08)', position: zone.type === 'equal_highs' || zone.type === 'previous_high' ? 'above' : 'below' }));
        }
        if (!zone.swept && zone.strength >= 3) {
          const lineColor = zone.sweepDirection === 'bullish' ? 'rgba(0, 255, 163, 0.5)' : 'rgba(255, 71, 87, 0.5)';
          registry.add('liq', new HorizontalLinePrimitive({ price: zone.price, color: lineColor, lineWidth: 1, lineStyle: 2, label: `${zone.labelAr} ×${zone.strength}` }));
          safeAddPriceLine(`liq-${zone.type}-${zone.price}`, zone.price, lineColor, `${zone.labelAr} ×${zone.strength}`, 1, 2, false, 'liq');
        }
      }
      if (liqData.dominantSweepDirection !== 'neutral' && liqData.sweptZones > 0) {
        const isBull = liqData.dominantSweepDirection === 'bullish';
        registry.add('liq', new LabelPrimitive({ time: lastTime as any, price: isBull ? safeMin(candles.slice(-5).map(c => c.low)) * 0.998 : safeMax(candles.slice(-5).map(c => c.high)) * 1.002, text: `${isBull ? '▲' : '▼'} سيولة ${isBull ? 'صاعد' : 'هابط'} (${liqData.sweptZones} مسحوب)`, color: isBull ? 'rgba(0, 255, 163, 0.9)' : 'rgba(255, 71, 87, 0.9)', fontSize: 9, align: 'right', bg: isBull ? 'rgba(0, 255, 163, 0.1)' : 'rgba(255, 71, 87, 0.1)', position: isBull ? 'below' : 'above' }));
      }
    }
    } // smartRedraw: data unchanged, existing primitives stay
  } else {
    registry.clearType('liq');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LOCAL WYCKOFF DETECTION — Fallback when AI data is unavailable
//
// Uses price/volume analysis to determine the current Wyckoff phase:
// - Accumulation: Price ranging after decline, volume drying up
// - Markup: Price rising with increasing volume
// - Distribution: Price ranging after advance, volume increasing on declines
// - Markdown: Price falling with increasing volume
// ═══════════════════════════════════════════════════════════════════════

function detectLocalWyckoff(
  candles: CandleData[],
  swings: SwingPoint[],
): { phase: string; bias: 'bullish' | 'bearish' | 'neutral'; events: any[] } {
  if (candles.length < 20) {
    return { phase: 'Unknown', bias: 'neutral', events: [] };
  }

  const recent = candles.slice(-30);
  const firstHalf = recent.slice(0, 15);
  const secondHalf = recent.slice(15);

  // Price change
  const firstClose = firstHalf[firstHalf.length - 1].close;
  const lastClose = recent[recent.length - 1].close;
  const priceChange = (lastClose - firstClose) / firstClose;

  // Volume analysis
  const avgVol1 = firstHalf.reduce((s, c) => s + (c.volume || 0), 0) / firstHalf.length;
  const avgVol2 = secondHalf.reduce((s, c) => (s + c.volume || 0), 0) / secondHalf.length;
  const volumeIncreasing = avgVol2 > avgVol1 * 1.1;
  const volumeDecreasing = avgVol2 < avgVol1 * 0.9;

  // Range analysis
  const recentHigh = safeMax(recent.map(c => c.high));
  const recentLow = safeMin(recent.map(c => c.low));
  const range = recentHigh - recentLow;
  const rangeRatio = range / recentLow;

  // Trend from swings
  const lastSwings = swings.slice(-4);
  const higherHighs = lastSwings.filter((s, i) => i > 0 && s.type === 'HIGH' && s.price > lastSwings[i - 1].price).length;
  const higherLows = lastSwings.filter((s, i) => i > 0 && s.type === 'LOW' && s.price > lastSwings[i - 1].price).length;
  const isUptrend = higherHighs >= 1 && higherLows >= 1;
  const isDowntrend = higherHighs === 0 && higherLows === 0;

  let phase: string;
  let bias: 'bullish' | 'bearish' | 'neutral';

  if (Math.abs(priceChange) < 0.02 && rangeRatio < 0.05) {
    // Price is ranging — Accumulation or Distribution
    if (isUptrend || priceChange > 0) {
      phase = 'Accumulation';
      bias = 'bullish';
    } else {
      phase = 'Distribution';
      bias = 'bearish';
    }
  } else if (priceChange > 0.02) {
    if (volumeIncreasing) {
      phase = 'Markup';
      bias = 'bullish';
    } else if (volumeDecreasing) {
      phase = 'Accumulation';
      bias = 'bullish';
    } else {
      phase = 'Markup';
      bias = 'bullish';
    }
  } else if (priceChange < -0.02) {
    if (volumeIncreasing) {
      phase = 'Markdown';
      bias = 'bearish';
    } else if (volumeDecreasing) {
      phase = 'Distribution';
      bias = 'bearish';
    } else {
      phase = 'Markdown';
      bias = 'bearish';
    }
  } else {
    // Small change — determine by swing structure
    if (isUptrend) {
      phase = 'Markup';
      bias = 'bullish';
    } else if (isDowntrend) {
      phase = 'Markdown';
      bias = 'bearish';
    } else {
      phase = 'Accumulation';
      bias = 'neutral';
    }
  }

  // Generate events from swing points
  const events: any[] = [];
  swings.slice(-6).forEach((sw) => {
    events.push({
      type: sw.type === 'HIGH' ? 'Peak' : 'Trough',
      price: sw.price,
      time: sw.time,
      labelAr: sw.type === 'HIGH' ? 'قمة' : 'قاع',
    });
  });

  return { phase, bias, events };
}
