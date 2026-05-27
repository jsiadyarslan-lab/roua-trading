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

  // If nothing is enabled, clear all
  if (!showSR && !showTrend && !showHarmonic && !showFVG && !showBOS && !showGeo && !showEW && !showWyckoff && !showVP && !showEntry) {
    registry.clearAll();
    return;
  }

  // ── Run ZigZag detection once ──
  const swings = computeZigZag(candles);

  // ── Helper: safe price line ──
  // FIX: Also register the price line ID with the OverlayRegistry so
  // it gets removed when the overlay type is cleared (toggled off).
  const safeAddPriceLine = (id: string, price: number, color: string, label: string, lw: number, ls: number, axisVisible: boolean, _type: OverlayType) => {
    if (!addPriceLine) return;
    const range = candles.slice(-30);
    const high = Math.max(...range.map(c => c.high));
    const low = Math.min(...range.map(c => c.low));
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
    registry.prepareRedraw('sr');
    const levels = detectSRLevels(candles);
    // ── CLEANUP: Only show top 4 strongest levels to avoid chart clutter ──
    // Filter to only levels within 3% of current price (relevant zone)
    const lastPrice = candles[candles.length - 1].close;
    const nearbyLevels = levels.filter(l => Math.abs(l.price - lastPrice) / lastPrice < 0.03);
    const displayLevels = (nearbyLevels.length >= 2 ? nearbyLevels : levels).slice(0, 4);

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
  } else {
    registry.clearType('sr');
  }

  // ═══════════════════════════════════════════════════════════════
  // TREND — Professional trend lines (LAST PATTERN ONLY!)
  // KEY: Only draws on recent swing points, not all candles
  // ═══════════════════════════════════════════════════════════════
  if (showTrend) {
    registry.prepareRedraw('trend');
    const trendLines = detectTrendLines(candles, swings);

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
  } else {
    registry.clearType('trend');
  }

  // ═══════════════════════════════════════════════════════════════
  // HARMONIC — XABCD patterns with legs + PRZ
  // ═══════════════════════════════════════════════════════════════
  if (showHarmonic) {
    registry.prepareRedraw('harmonic');
    const harmonics = detectHarmonicPatterns(swings);

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

      // PRZ zone at point D
      const atr = candles[candles.length - 1].high - candles[candles.length - 1].low;
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
  } else {
    registry.clearType('harmonic');
  }

  // ═══════════════════════════════════════════════════════════════
  // FVG — Fair Value Gap zones
  // ═══════════════════════════════════════════════════════════════
  if (showFVG) {
    registry.prepareRedraw('fvg');
    // Use ONLY the ATR-filtered detectFVGs — no SMC duplicates.
    // The SMCDetector FVGs caused dozens of lines on few candles
    // because they lacked ATR filtering and middle-candle validation.
    const fvgs = detectFVGs(candles);

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
  } else {
    registry.clearType('fvg');
  }

  // ═══════════════════════════════════════════════════════════════
  // BOS — Break of Structure / CHoCH
  // ═══════════════════════════════════════════════════════════════
  if (showBOS) {
    registry.prepareRedraw('bos');
    const bosBreaks = detectBOS(candles, swings);

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
  } else {
    registry.clearType('bos');
  }

  // ═══════════════════════════════════════════════════════════════
  // GEOMETRIC — Classic pattern shapes
  // ═══════════════════════════════════════════════════════════════
  if (showGeo) {
    registry.prepareRedraw('geo');
    const classicPatterns = detectClassicPatterns(swings);

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
  } else {
    registry.clearType('geo');
  }

  // ═══════════════════════════════════════════════════════════════
  // ELLIOTT WAVE — Wave labels + connecting lines
  // ═══════════════════════════════════════════════════════════════
  if (showEW) {
    registry.prepareRedraw('ew');
    const elliott = detectElliottWaves(swings);

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
    const aiElliott = input.elliottPattern;
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
  } else {
    registry.clearType('ew');
  }

  // ═══════════════════════════════════════════════════════════════
  // WYCKOFF — Phase labels + S/R
  // ═══════════════════════════════════════════════════════════════
  if (showWyckoff) {
    registry.prepareRedraw('wyckoff');
    const w = input.wyckoff;
    if (w && w.phase !== 'Unknown') {
      const col = w.bias === 'bullish' ? OVERLAY_COLORS.trendUp : w.bias === 'bearish' ? OVERLAY_COLORS.trendDown : '#fbbf24';

      // Phase label at latest candle
      registry.add('wyckoff', new LabelPrimitive({
        time: candles[candles.length - 1].time as any,
        price: w.bias === 'bullish' ? Math.min(...candles.slice(-20).map(c => c.low)) : Math.max(...candles.slice(-20).map(c => c.high)),
        text: w.phase,
        color: col,
        fontSize: 12,
        align: 'right',
        bg: 'rgba(11, 14, 20, 0.85)',
        position: w.bias === 'bullish' ? 'below' : 'above',
      }));

      // Event price lines
      (w.events || []).forEach((ev: any, i: number) => {
        if (ev.price > 0) {
          safeAddPriceLine(`wy-ev-${i}`, ev.price, col, `Wyckoff: ${ev.labelAr || ev.type}`, 1, 0, true, 'wyckoff');
        }
      });
    }
  } else {
    registry.clearType('wyckoff');
  }

  // ═══════════════════════════════════════════════════════════════
  // VOLUME PROFILE — POC, VAH, VAL
  // ═══════════════════════════════════════════════════════════════
  if (showVP) {
    registry.prepareRedraw('vp');
    const vp = input.volumeProfile;
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
  } else {
    registry.clearType('vp');
  }

  // ═══════════════════════════════════════════════════════════════
  // ENTRY — Entry/SL/TP from AI signal
  // ═══════════════════════════════════════════════════════════════
  if (showEntry) {
    registry.prepareRedraw('entry');

    // Use AI signal data for entry (NOT the broken entryExit:null)
    const signal = input.signal;
    const entryExit = input.entryExit;
    const lastPrice = candles[candles.length - 1].close;

    let entry: number, sl: number, tp: number, dir: string;
    if (entryExit && entryExit.entryPrice > 0) {
      entry = entryExit.entryPrice;
      sl = entryExit.stopLoss;
      tp = entryExit.takeProfit;
      dir = entryExit.direction;
    } else if (signal && signal.entry > 0) {
      // FIX: Use the AI council signal (not null entryExit!)
      entry = signal.entry;
      sl = signal.sl;
      tp = signal.tp;
      dir = signal.dir === 'BUY' ? 'long' : 'short';
    } else {
      // Fallback: EMA-based
      const last20 = candles.slice(-20);
      const ema9 = last20.slice(-9).reduce((s, x) => s + x.close, 0) / Math.min(9, last20.length);
      const ema20 = last20.reduce((s, x) => s + x.close, 0) / last20.length;
      dir = ema9 > ema20 ? 'long' : 'short';
      const atr = candles.length >= 14 ? (() => {
        const sl2 = candles.slice(-14);
        const trs = sl2.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.close, Math.abs(c.low - c.close), c.high - c.low));
        return trs.reduce((s, v) => s + v, 0) / trs.length;
      })() : lastPrice * 0.01;
      entry = lastPrice;
      sl = dir === 'long' ? entry - atr * 1.5 : entry + atr * 1.5;
      tp = dir === 'long' ? entry + atr * 2.5 : entry - atr * 2.5;
    }

    // Draw entry/SL/TP using HorizontalLinePrimitive
    registry.add('entry', new HorizontalLinePrimitive({
      price: entry,
      color: OVERLAY_COLORS.entry,
      lineWidth: 2,
      lineStyle: 0,
      label: `Entry ${dir === 'long' ? 'BUY' : 'SELL'}`,
    }));
    if (sl > 0) {
      registry.add('entry', new HorizontalLinePrimitive({
        price: sl,
        color: OVERLAY_COLORS.sl,
        lineWidth: 2,
        lineStyle: 2,
        label: 'SL',
      }));
    }
    if (tp > 0) {
      registry.add('entry', new HorizontalLinePrimitive({
        price: tp,
        color: OVERLAY_COLORS.tp,
        lineWidth: 2,
        lineStyle: 2,
        label: 'TP',
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
  } else {
    registry.clearType('entry');
  }

  // ═══════════════════════════════════════════════════════════════
  // ALERT MARKERS — Visual alert pins on chart for auto-detected
  // high-confidence patterns. These are always visible regardless
  // of overlay toggles — they represent real-time detections.
  // ═══════════════════════════════════════════════════════════════
  if (input.alerts && input.alerts.length > 0) {
    registry.prepareRedraw('alerts');
    // Show max 8 most recent alert markers to avoid clutter
    input.alerts.slice(-8).forEach((alert) => {
      registry.add('alerts', new AlertMarkerPrimitive({
        time: alert.time,
        price: alert.price,
        label: alert.label,
        direction: alert.direction,
        confidence: alert.confidence,
        type: alert.type,
      }));
    });
  } else {
    registry.clearType('alerts');
  }
}
