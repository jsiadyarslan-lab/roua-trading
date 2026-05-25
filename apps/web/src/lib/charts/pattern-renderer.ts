// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern Renderer — draws DetectedPattern on Lightweight Charts
// Uses ISeriesPrimitive / LineSeries / addSeries API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { DetectedPattern } from './pattern-engine';
import { startAnimatedPattern, cancelAnimatedPattern } from './AnimatedPatterns';

// ── Animation toggle (set to true for Autochartist-like progressive drawing) ──
let animationEnabled = true;
export function setPatternAnimation(enabled: boolean) { animationEnabled = enabled; }

interface DrawnPattern {
  patternId: string;
  series: any[];     // lightweight-charts series handles
  removeAt?: number; // optional auto-remove timestamp
}

const drawnPatterns = new Map<string, DrawnPattern>();

// FIX: Periodic cleanup of expired pattern entries to prevent memory leak.
// Pattern series that were auto-removed via setTimeout still have entries
// in the drawnPatterns map. This interval cleans those stale entries.
// Also clears on HMR (module reload) since the map persists across reloads.
if (typeof setInterval !== 'undefined') {
  // Clear stale entries on module load (handles HMR)
  const now = Date.now();
  for (const [id, drawn] of drawnPatterns) {
    if (drawn.removeAt && now > drawn.removeAt + 60000) {
      drawnPatterns.delete(id);
    }
  }
  setInterval(() => {
    const now = Date.now();
    for (const [id, drawn] of drawnPatterns) {
      if (drawn.removeAt && now > drawn.removeAt + 60000) {
        // Pattern was scheduled for removal more than 1 minute ago — clean up map entry
        drawnPatterns.delete(id);
      }
    }
  }, 60_000);
}

// ── Color palette matching Autochartist's visual style ────
const COLORS = {
  bullish: {
    line: 'rgba(0,255,163,0.9)',
    neckline: 'rgba(0,212,255,0.8)',
    forecast: 'rgba(0,255,163,0.15)',
    forecastBorder: 'rgba(0,255,163,0.5)',
    label: '#00FFA3',
  },
  bearish: {
    line: 'rgba(255,71,87,0.9)',
    neckline: 'rgba(255,165,0,0.8)',
    forecast: 'rgba(255,71,87,0.15)',
    forecastBorder: 'rgba(255,71,87,0.5)',
    label: '#FF4757',
  },
};

// ── Draw a single pattern on the chart ───────────────────
export function drawPattern(
  chartApi: any,
  lc: any,
  pattern: DetectedPattern,
  autoRemoveMs = 5 * 60 * 1000,
  _skipAnimation = false
): void {
  if (!chartApi || !lc?.LineSeries) return;

  // REVOLUTIONARY: Use animated drawing if enabled (Autochartist-like)
  if (animationEnabled && !_skipAnimation) {
    startAnimatedPattern(chartApi, lc, pattern, { autoRemoveAfter: autoRemoveMs });
    return;
  }

  // Remove existing drawing for this pattern
  removePattern(chartApi, pattern.id);

  const series: any[] = [];
  const col = COLORS[pattern.direction];
  const lineWidth = pattern.quality.overall >= 7 ? 2 : 1;

  try {
    // ── 1. Support / Resistance line connecting the two peaks/troughs ──
    const mainLine = pattern.supportLine || pattern.resistanceLine;
    if (mainLine) {
      const s = chartApi.addSeries(lc.LineSeries, {
        color: col.line,
        lineWidth,
        lineStyle: 0, // solid
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: `${pattern.type} (${pattern.quality.overall}/10)`,
      });
      s.setData([
        { time: mainLine.p1.time as any, value: mainLine.p1.price },
        { time: mainLine.p2.time as any, value: mainLine.p2.price },
      ]);
      series.push(s);
    }

    // ── 2. Neckline ──
    if (pattern.neckline) {
      const nl = chartApi.addSeries(lc.LineSeries, {
        color: col.neckline,
        lineWidth: lineWidth + 1,
        lineStyle: 1, // dashed
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: 'Neckline',
      });
      nl.setData([
        { time: pattern.neckline.p1.time as any, value: pattern.neckline.p1.price },
        { time: pattern.neckline.p2.time as any, value: pattern.neckline.p2.price },
      ]);
      series.push(nl);
    }

    // ── 3. Forecast zone (projected target) ──
    if (pattern.forecast) {
      // Draw upper and lower bounds of forecast zone
      const fc = pattern.forecast;

      // Upper bound
      const fcHigh = chartApi.addSeries(lc.LineSeries, {
        color: col.forecastBorder,
        lineWidth: 1,
        lineStyle: 2, // dotted
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: `Target ${pattern.direction === 'bullish' ? '▲' : '▼'}`,
      });
      fcHigh.setData([
        { time: fc.timeFrom as any, value: fc.priceMax },
        { time: fc.timeTo as any, value: fc.priceMax },
      ]);
      series.push(fcHigh);

      // Lower bound
      const fcLow = chartApi.addSeries(lc.LineSeries, {
        color: col.forecastBorder,
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      fcLow.setData([
        { time: fc.timeFrom as any, value: fc.priceMin },
        { time: fc.timeTo as any, value: fc.priceMin },
      ]);
      series.push(fcLow);

      // Vertical start line of forecast
      const fcStart = chartApi.addSeries(lc.LineSeries, {
        color: col.forecastBorder,
        lineWidth: 1,
        lineStyle: 3, // large-dashed
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      fcStart.setData([
        { time: fc.timeFrom as any, value: fc.priceMin },
        { time: fc.timeFrom as any, value: fc.priceMax },
      ]);
      series.push(fcStart);
    }

      // ── 4. Draw XABCD point labels for harmonic patterns ──
    if (pattern.type.includes('Gartley') || pattern.type.includes('Bat') ||
        pattern.type.includes('Butterfly') || pattern.type.includes('Crab') ||
        pattern.type.includes('Head') || pattern.type.includes('Inverse')) {
      // Connect all key points with lines
      for (let pi = 0; pi < pattern.points.length - 1; pi++) {
        const p1 = pattern.points[pi];
        const p2 = pattern.points[pi + 1];
        try {
          const leg = chartApi.addSeries(lc.LineSeries, {
            color: col.line,
            lineWidth: 1,
            lineStyle: pi % 2 === 0 ? 0 : 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            title: `${p1.label}→${p2.label}`,
          });
          leg.setData([
            { time: p1.time as any, value: p1.price },
            { time: p2.time as any, value: p2.price },
          ]);
          series.push(leg);
        } catch { /* skip */ }
      }
    }

    // Store and schedule removal
    drawnPatterns.set(pattern.id, {
      patternId: pattern.id,
      series,
      removeAt: Date.now() + autoRemoveMs,
    });

    // Auto-remove after TTL
    if (autoRemoveMs > 0) {
      setTimeout(() => removePattern(chartApi, pattern.id), autoRemoveMs);
    }
  } catch (err) {
    console.warn('[PatternRenderer] draw failed:', err);
  }
}

// ── Remove a pattern from the chart ──────────────────────
export function removePattern(chartApi: any, patternId: string): void {
  const drawn = drawnPatterns.get(patternId);
  if (!drawn) return;
  for (const s of drawn.series) {
    try { chartApi.removeSeries(s); } catch {}
  }
  drawnPatterns.delete(patternId);
}

// ── Draw all patterns from the engine ────────────────────
export function drawAllPatterns(
  chartApi: any,
  lc: any,
  patterns: DetectedPattern[],
  clearPrevious = true,
  autoRemoveMs = 10 * 60 * 1000
): void {
  if (clearPrevious) {
    // Remove patterns not in the new list
    const newIds = new Set(patterns.map(p => p.id));
    for (const [id] of drawnPatterns) {
      if (!newIds.has(id)) removePattern(chartApi, id);
    }
  }
  for (const pattern of patterns) {
    drawPattern(chartApi, lc, pattern, autoRemoveMs);
  }
}

// ── Get currently drawn pattern IDs ──────────────────────
export function getDrawnPatternIds(): string[] {
  return Array.from(drawnPatterns.keys());
}

// ── Clear all patterns ────────────────────────────────────
export function clearAllPatterns(chartApi: any): void {
  for (const [id] of drawnPatterns) {
    removePattern(chartApi, id);
  }
}
