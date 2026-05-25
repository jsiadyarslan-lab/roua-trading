// ═══════════════════════════════════════════════════════════
// Signal Confidence Heatmap — Overlay on chart
// Continuous gradient: where 3+ bullish signals agree → green glow
// Where signals conflict → orange/yellow
// Where 3+ bearish signals agree → red glow
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';
import type { DetectorSignal } from './BayesianEngine';

// ── Heatmap data point ───────────────────────────────────
export interface HeatmapPoint {
  time: number;
  bullishScore: number;   // 0-1, aggregated bullish confidence
  bearishScore: number;   // 0-1, aggregated bearish confidence
  neutralScore: number;   // 0-1, when signals conflict
  netDirection: 'bullish' | 'bearish' | 'neutral' | 'conflicted';
  intensity: number;      // 0-1, overall intensity of signals
  signalCount: number;    // Number of signals at this time
}

export interface HeatmapResult {
  points: HeatmapPoint[];
  maxIntensity: number;
  dominantDirection: 'bullish' | 'bearish' | 'neutral';
  coverage: number;       // 0-1, what fraction of candles have signals
}

// ── Color mapping for heatmap ────────────────────────────
export function heatmapColor(point: HeatmapPoint, opacity = 0.15): string {
  if (point.netDirection === 'conflicted') {
    return `rgba(251, 191, 36, ${opacity * point.intensity})`; // Yellow/orange for conflict
  }
  if (point.netDirection === 'bullish') {
    const green = point.intensity > 0.7 ? '0, 255, 163' : '0, 200, 100';
    return `rgba(${green}, ${opacity * point.intensity})`;
  }
  if (point.netDirection === 'bearish') {
    const red = point.intensity > 0.7 ? '255, 71, 87' : '200, 50, 60';
    return `rgba(${red}, ${opacity * point.intensity})`;
  }
  return `rgba(100, 100, 120, ${opacity * 0.3})`; // Muted gray for neutral
}

// ── Build heatmap from signals and candles ───────────────
export function buildHeatmap(
  candles: CandleData[],
  signals: DetectorSignal[],
): HeatmapResult {
  if (candles.length === 0 || signals.length === 0) {
    return { points: [], maxIntensity: 0, dominantDirection: 'neutral', coverage: 0 };
  }

  // Map signals to candle times
  const signalMap = new Map<number, DetectorSignal[]>();
  for (const signal of signals) {
    const time = signal.time || candles[candles.length - 1]?.time || 0;
    const existing = signalMap.get(time) || [];
    existing.push(signal);
    signalMap.set(time, existing);
  }

  // Also spread signals across nearby candles (signals affect a time range)
  for (const signal of signals) {
    const signalTime = signal.time || candles[candles.length - 1]?.time || 0;
    // Find candles within ±3 of the signal time
    const nearbyCandles = candles.filter(c =>
      Math.abs(c.time - signalTime) < 3600 * 4 // 4-hour window
    );
    for (const c of nearbyCandles) {
      const existing = signalMap.get(c.time) || [];
      // Add with decay based on distance
      const distance = Math.abs(c.time - signalTime);
      const decay = Math.max(0.2, 1 - distance / (3600 * 4));
      existing.push({
        ...signal,
        confidence: signal.confidence * decay,
      });
      signalMap.set(c.time, existing);
    }
  }

  // Build heatmap points
  const points: HeatmapPoint[] = [];
  let maxIntensity = 0;
  let totalBullish = 0;
  let totalBearish = 0;
  let candlesWithSignals = 0;

  for (const candle of candles) {
    const candleSignals = signalMap.get(candle.time) || [];

    if (candleSignals.length === 0) continue;

    candlesWithSignals++;

    const bullishSignals = candleSignals.filter(s => s.direction === 'bullish');
    const bearishSignals = candleSignals.filter(s => s.direction === 'bearish');
    const neutralSignals = candleSignals.filter(s => s.direction === 'neutral');

    const bullishScore = bullishSignals.reduce((s, sig) => s + sig.confidence, 0) / Math.max(1, candleSignals.length);
    const bearishScore = bearishSignals.reduce((s, sig) => s + sig.confidence, 0) / Math.max(1, candleSignals.length);
    const neutralScore = neutralSignals.reduce((s, sig) => s + sig.confidence, 0) / Math.max(1, candleSignals.length);

    totalBullish += bullishScore;
    totalBearish += bearishScore;

    // Net direction
    let netDirection: HeatmapPoint['netDirection'];
    if (bullishScore > 0.5 && bearishScore > 0.3) {
      netDirection = 'conflicted';
    } else if (bullishScore > bearishScore + 0.2) {
      netDirection = 'bullish';
    } else if (bearishScore > bullishScore + 0.2) {
      netDirection = 'bearish';
    } else if (bullishScore > 0.3 || bearishScore > 0.3) {
      netDirection = 'conflicted';
    } else {
      netDirection = 'neutral';
    }

    // Intensity = how many signals agree
    const maxDir = Math.max(bullishScore, bearishScore);
    const intensity = Math.min(1, maxDir * (bullishSignals.length + bearishSignals.length > 2 ? 1.3 : 1));

    if (intensity > maxIntensity) maxIntensity = intensity;

    points.push({
      time: candle.time,
      bullishScore,
      bearishScore,
      neutralScore,
      netDirection,
      intensity,
      signalCount: candleSignals.length,
    });
  }

  const dominantDirection = totalBullish > totalBearish * 1.2 ? 'bullish'
    : totalBearish > totalBullish * 1.2 ? 'bearish' : 'neutral';

  return {
    points,
    maxIntensity,
    dominantDirection,
    coverage: candlesWithSignals / candles.length,
  };
}

// ── Render heatmap on chart as histogram-style series ─────
export function renderHeatmapOnChart(
  chartApi: any,
  lc: any,
  heatmap: HeatmapResult,
): any[] {
  if (!chartApi || !lc?.HistogramSeries || heatmap.points.length === 0) return [];

  const series: any[] = [];

  try {
    // Create bullish heatmap series
    const bullishPoints = heatmap.points
      .filter(p => p.netDirection === 'bullish' || p.netDirection === 'conflicted')
      .map(p => ({
        time: p.time as any,
        value: p.bullishScore * 100,
        color: p.netDirection === 'conflicted'
          ? `rgba(251, 191, 36, ${0.15 + p.intensity * 0.25})`
          : `rgba(0, 255, 163, ${0.1 + p.intensity * 0.3})`,
      }));

    if (bullishPoints.length > 0) {
      const bullSeries = chartApi.addSeries(lc.HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'heatmap_bull',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      bullSeries.setData(bullishPoints);
      series.push(bullSeries);

      // Scale heatmap to small portion of chart
      chartApi.priceScale('heatmap_bull').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        visible: false,
      });
    }

    // Create bearish heatmap series
    const bearishPoints = heatmap.points
      .filter(p => p.netDirection === 'bearish' || p.netDirection === 'conflicted')
      .map(p => ({
        time: p.time as any,
        value: -p.bearishScore * 100,
        color: p.netDirection === 'conflicted'
          ? `rgba(251, 191, 36, ${0.15 + p.intensity * 0.25})`
          : `rgba(255, 71, 87, ${0.1 + p.intensity * 0.3})`,
      }));

    if (bearishPoints.length > 0) {
      const bearSeries = chartApi.addSeries(lc.HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'heatmap_bear',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      bearSeries.setData(bearishPoints);
      series.push(bearSeries);

      chartApi.priceScale('heatmap_bear').applyOptions({
        scaleMargins: { top: 1, bottom: 0.15 },
        visible: false,
      });
    }
  } catch (err) {
    console.warn('[Heatmap] render failed:', err);
  }

  return series;
}
