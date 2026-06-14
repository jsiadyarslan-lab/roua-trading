// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern Renderer — draws DetectedPattern on Lightweight Charts
// Uses ISeriesPrimitive / LineSeries / addSeries API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { DetectedPattern } from './pattern-engine';
import { AnimatedPatternManager, createAnimatedPatternManager } from './AnimatedPatterns';

// ═══════════════════════════════════════════════════════════
// FIX (4.6): PatternRenderer — per-instance factory
//
// Previously, `drawnPatterns` and `animationEnabled` were
// module-level state shared across all chart instances. In a
// multi-chart grid, drawing/removing patterns on one chart
// would affect all other charts. Now each PatternRenderer
// instance owns its own state.
// ═══════════════════════════════════════════════════════════
export class PatternRenderer {
  private animationEnabled = true;
  private drawnPatterns = new Map<string, DrawnPattern>();
  private animationManager: AnimatedPatternManager;
  private _cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // FIX (4.6): Each renderer gets its own animation manager
    this.animationManager = createAnimatedPatternManager();

    // Periodic cleanup of expired pattern entries to prevent memory leak
    if (typeof setInterval !== 'undefined') {
      this._cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [id, drawn] of this.drawnPatterns) {
          if (drawn.removeAt && now > drawn.removeAt + 60000) {
            this.drawnPatterns.delete(id);
          }
        }
      }, 60_000);
    }
  }

  setPatternAnimation(enabled: boolean): void {
    this.animationEnabled = enabled;
  }

  /** Draw a single pattern on the chart */
  drawPattern(
    chartApi: any,
    lc: any,
    pattern: DetectedPattern,
    autoRemoveMs = 5 * 60 * 1000,
    _skipAnimation = false,
  ): void {
    if (!chartApi || !lc?.LineSeries) return;

    // REVOLUTIONARY: Use animated drawing if enabled (Autochartist-like)
    if (this.animationEnabled && !_skipAnimation) {
      this.animationManager.startAnimatedPattern(chartApi, lc, pattern, { autoRemoveAfter: autoRemoveMs });
      return;
    }

    // Remove existing drawing for this pattern
    this.removePattern(chartApi, pattern.id);

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
        const fc = pattern.forecast;

        const fcHigh = chartApi.addSeries(lc.LineSeries, {
          color: col.forecastBorder,
          lineWidth: 1,
          lineStyle: 2,
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

        const fcStart = chartApi.addSeries(lc.LineSeries, {
          color: col.forecastBorder,
          lineWidth: 1,
          lineStyle: 3,
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
      // FIX (4.6): Use per-instance Map
      this.drawnPatterns.set(pattern.id, {
        patternId: pattern.id,
        series,
        removeAt: Date.now() + autoRemoveMs,
      });

      // Auto-remove after TTL
      if (autoRemoveMs > 0) {
        setTimeout(() => this.removePattern(chartApi, pattern.id), autoRemoveMs);
      }
    } catch (err) {
      console.warn('[PatternRenderer] draw failed:', err);
    }
  }

  /** Remove a pattern from the chart */
  removePattern(chartApi: any, patternId: string): void {
    const drawn = this.drawnPatterns.get(patternId);
    if (!drawn) return;
    for (const s of drawn.series) {
      try { chartApi.removeSeries(s); } catch {}
    }
    // FIX (4.6): Use per-instance Map
    this.drawnPatterns.delete(patternId);
  }

  /** Draw all patterns from the engine */
  drawAllPatterns(
    chartApi: any,
    lc: any,
    patterns: DetectedPattern[],
    clearPrevious = true,
    autoRemoveMs = 10 * 60 * 1000,
  ): void {
    if (clearPrevious) {
      const newIds = new Set(patterns.map(p => p.id));
      for (const [id] of this.drawnPatterns) {
        if (!newIds.has(id)) this.removePattern(chartApi, id);
      }
    }
    for (const pattern of patterns) {
      this.drawPattern(chartApi, lc, pattern, autoRemoveMs);
    }
  }

  /** Get currently drawn pattern IDs */
  getDrawnPatternIds(): string[] {
    return Array.from(this.drawnPatterns.keys());
  }

  /** Clear all patterns */
  clearAllPatterns(chartApi: any): void {
    for (const [id] of this.drawnPatterns) {
      this.removePattern(chartApi, id);
    }
  }

  /** Get the animation manager for this renderer instance */
  getAnimationManager(): AnimatedPatternManager {
    return this.animationManager;
  }

  /** Reset state (e.g., when chart is destroyed or symbol changes) */
  reset(): void {
    // Cancel all active animations
    this.animationManager.reset();
    // Clear drawn patterns — series will be removed when chart is reinitialized
    this.drawnPatterns.clear();
  }

  /** Destroy the renderer — clears everything and stops cleanup timer */
  destroy(): void {
    this.reset();
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }
}

// ── Internal types ──────────────────────────────────────
interface DrawnPattern {
  patternId: string;
  series: any[];     // lightweight-charts series handles
  removeAt?: number; // optional auto-remove timestamp
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

// ═══════════════════════════════════════════════════════════
// FIX (4.6): Factory function — creates a new per-instance renderer.
// ═══════════════════════════════════════════════════════════
export function createPatternRenderer(): PatternRenderer {
  return new PatternRenderer();
}

// ═══════════════════════════════════════════════════════════
// FIX (4.6): Legacy module-level singleton for backward compat.
// Deprecated — new code should use createPatternRenderer()
// for per-instance state in multi-chart mode.
// ═══════════════════════════════════════════════════════════
const _defaultRenderer = new PatternRenderer();

/** @deprecated Use `createPatternRenderer()` for per-instance state */
export function setPatternAnimation(enabled: boolean): void {
  _defaultRenderer.setPatternAnimation(enabled);
}

/** @deprecated Use `createPatternRenderer()` for per-instance state */
export function drawPattern(
  chartApi: any,
  lc: any,
  pattern: DetectedPattern,
  autoRemoveMs = 5 * 60 * 1000,
  _skipAnimation = false,
): void {
  _defaultRenderer.drawPattern(chartApi, lc, pattern, autoRemoveMs, _skipAnimation);
}

/** @deprecated Use `createPatternRenderer()` for per-instance state */
export function removePattern(chartApi: any, patternId: string): void {
  _defaultRenderer.removePattern(chartApi, patternId);
}

/** @deprecated Use `createPatternRenderer()` for per-instance state */
export function drawAllPatterns(
  chartApi: any,
  lc: any,
  patterns: DetectedPattern[],
  clearPrevious = true,
  autoRemoveMs = 10 * 60 * 1000,
): void {
  _defaultRenderer.drawAllPatterns(chartApi, lc, patterns, clearPrevious, autoRemoveMs);
}

/** @deprecated Use `createPatternRenderer()` for per-instance state */
export function getDrawnPatternIds(): string[] {
  return _defaultRenderer.getDrawnPatternIds();
}

/** @deprecated Use `createPatternRenderer()` for per-instance state */
export function clearAllPatterns(chartApi: any): void {
  _defaultRenderer.clearAllPatterns(chartApi);
}

/** Reset singleton state — called on symbol/timeframe change */
export function resetPatternRendererState(): void {
  _defaultRenderer.reset();
}
