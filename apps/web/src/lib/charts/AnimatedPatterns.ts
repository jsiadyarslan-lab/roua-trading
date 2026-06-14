// ═══════════════════════════════════════════════════════════
// On-Draw Animated Patterns — Like Autochartist
// Support/resistance lines draw progressively instead of appearing instantly
// Pattern animation: line from P1→P2 over 800ms, then neckline, then forecast zone fades in
// ═══════════════════════════════════════════════════════════

import type { DetectedPattern } from './pattern-engine';

// ── Animation state ──────────────────────────────────────
export type AnimationPhase = 'idle' | 'drawing_main' | 'drawing_neckline' | 'drawing_forecast' | 'drawing_labels' | 'complete';

export interface PatternAnimation {
  patternId: string;
  phase: AnimationPhase;
  progress: number;      // 0-1 within current phase
  startedAt: number;
  series: any[];         // Chart series handles
  config: AnimationConfig;
}

export interface AnimationConfig {
  lineDrawDuration: number;   // ms to draw each line (default 800)
  pauseBetweenPhases: number; // ms between phases (default 200)
  forecastFadeIn: number;     // ms for forecast zone fade-in (default 600)
  autoRemoveAfter: number;    // ms before auto-remove (default 10 min)
  enabled: boolean;
}

const DEFAULT_CONFIG: AnimationConfig = {
  lineDrawDuration: 800,
  pauseBetweenPhases: 200,
  forecastFadeIn: 600,
  autoRemoveAfter: 10 * 60 * 1000,
  enabled: true,
};

// ═══════════════════════════════════════════════════════════
// FIX (4.6): AnimatedPatternManager — per-instance factory
//
// Previously, `activeAnimations` was a module-level Map shared
// across all chart instances. In a multi-chart grid, cancelling
// or scheduling auto-remove on one chart would affect animations
// on all charts. Now each manager instance owns its own Map.
// ═══════════════════════════════════════════════════════════
export class AnimatedPatternManager {
  private activeAnimations = new Map<string, PatternAnimation>();

  // ── Interpolate between two points ───────────────────────
  private interpolate(
    p1: { time: number; price: number },
    p2: { time: number; price: number },
    t: number
  ): { time: number; price: number } {
    return {
      time: p1.time + (p2.time - p1.time) * t,
      price: p1.price + (p2.price - p1.price) * t,
    };
  }

  // ── Start animated pattern drawing ───────────────────────
  startAnimatedPattern(
    chartApi: any,
    lc: any,
    pattern: DetectedPattern,
    config: Partial<AnimationConfig> = {},
  ): void {
    if (!chartApi || !lc?.LineSeries) return;

    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    if (!fullConfig.enabled) {
      // Draw instantly if animation disabled
      import('./pattern-renderer').then(m => m.drawPattern(chartApi, lc, pattern, fullConfig.autoRemoveAfter));
      return;
    }

    // Remove any existing animation for this pattern
    this.cancelAnimatedPattern(chartApi, pattern.id);

    const animation: PatternAnimation = {
      patternId: pattern.id,
      phase: 'idle',
      progress: 0,
      startedAt: Date.now(),
      series: [],
      config: fullConfig,
    };

    // FIX (4.6): Use per-instance Map
    this.activeAnimations.set(pattern.id, animation);

    // Phase 1: Draw main line (support/resistance)
    const mainLine = pattern.supportLine || pattern.resistanceLine;
    if (mainLine) {
      animation.phase = 'drawing_main';
      this.animateLine(chartApi, lc, animation, mainLine.p1, mainLine.p2, pattern, () => {
        // Phase 2: Draw neckline
        if (pattern.neckline) {
          setTimeout(() => {
            animation.phase = 'drawing_neckline';
            this.animateLine(chartApi, lc, animation, pattern.neckline!.p1, pattern.neckline!.p2, pattern, () => {
              // Phase 3: Draw forecast zone
              if (pattern.forecast) {
                setTimeout(() => {
                  animation.phase = 'drawing_forecast';
                  this.drawForecastZone(chartApi, lc, animation, pattern, () => {
                    animation.phase = 'complete';
                    this.scheduleAutoRemove(chartApi, pattern.id, fullConfig.autoRemoveAfter);
                  });
                }, fullConfig.pauseBetweenPhases);
              } else {
                animation.phase = 'complete';
                this.scheduleAutoRemove(chartApi, pattern.id, fullConfig.autoRemoveAfter);
              }
            });
          }, fullConfig.pauseBetweenPhases);
        } else {
          animation.phase = 'complete';
          this.scheduleAutoRemove(chartApi, pattern.id, fullConfig.autoRemoveAfter);
        }
      });
    } else {
      // No main line — draw all point connections
      animation.phase = 'drawing_main';
      this.drawAllPointsAnimated(chartApi, lc, animation, pattern, () => {
        animation.phase = 'complete';
        this.scheduleAutoRemove(chartApi, pattern.id, fullConfig.autoRemoveAfter);
      });
    }
  }

  // ── Animate a single line progressively ──────────────────
  private animateLine(
    chartApi: any,
    lc: any,
    animation: PatternAnimation,
    p1: { time: number; price: number },
    p2: { time: number; price: number },
    pattern: DetectedPattern,
    onComplete: () => void,
  ): void {
    const col = pattern.direction === 'bullish'
      ? { line: 'rgba(0,255,163,0.9)', title: `${pattern.type} ▲` }
      : { line: 'rgba(255,71,87,0.9)', title: `${pattern.type} ▼` };

    const series = chartApi.addSeries(lc.LineSeries, {
      color: col.line,
      lineWidth: pattern.quality.overall >= 7 ? 2 : 1,
      lineStyle: 0,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      title: col.title,
    });

    animation.series.push(series);

    // Start with just the first point
    series.setData([{ time: p1.time as any, value: p1.price }]);

    const duration = animation.config.lineDrawDuration;
    const startTime = Date.now();

    const frame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      animation.progress = progress;

      // Easing: ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      // Interpolate endpoint
      const current = this.interpolate(p1, p2, eased);
      series.setData([
        { time: p1.time as any, value: p1.price },
        { time: current.time as any, value: current.price },
      ]);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        // Final position
        series.setData([
          { time: p1.time as any, value: p1.price },
          { time: p2.time as any, value: p2.price },
        ]);
        onComplete();
      }
    };

    requestAnimationFrame(frame);
  }

  // ── Draw forecast zone with fade-in ──────────────────────
  private drawForecastZone(
    chartApi: any,
    lc: any,
    animation: PatternAnimation,
    pattern: DetectedPattern,
    onComplete: () => void,
  ): void {
    if (!pattern.forecast) { onComplete(); return; }

    const fc = pattern.forecast;
    const isBull = pattern.direction === 'bullish';
    const borderColor = isBull ? 'rgba(0,255,163,0.5)' : 'rgba(255,71,87,0.5)';

    // Draw upper and lower bounds
    const upper = chartApi.addSeries(lc.LineSeries, {
      color: borderColor,
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      title: `Target ${isBull ? '▲' : '▼'}`,
    });

    const lower = chartApi.addSeries(lc.LineSeries, {
      color: borderColor,
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    animation.series.push(upper, lower);

    // Fade in forecast zone
    const duration = animation.config.forecastFadeIn;
    const startTime = Date.now();

    const frame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      animation.progress = progress;

      const eased = progress; // Linear fade

      // Interpolate from midpoint to final
      const midPrice = (fc.priceMin + fc.priceMax) / 2;
      const currentHigh = midPrice + (fc.priceMax - midPrice) * eased;
      const currentLow = midPrice + (fc.priceMin - midPrice) * eased;

      upper.setData([
        { time: fc.timeFrom as any, value: currentHigh },
        { time: fc.timeTo as any, value: currentHigh },
      ]);

      lower.setData([
        { time: fc.timeFrom as any, value: currentLow },
        { time: fc.timeTo as any, value: currentLow },
      ]);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        upper.setData([
          { time: fc.timeFrom as any, value: fc.priceMax },
          { time: fc.timeTo as any, value: fc.priceMax },
        ]);
        lower.setData([
          { time: fc.timeFrom as any, value: fc.priceMin },
          { time: fc.timeTo as any, value: fc.priceMin },
        ]);
        onComplete();
      }
    };

    requestAnimationFrame(frame);
  }

  // ── Draw all points animated (for harmonic patterns) ─────
  private drawAllPointsAnimated(
    chartApi: any,
    lc: any,
    animation: PatternAnimation,
    pattern: DetectedPattern,
    onComplete: () => void,
  ): void {
    const col = pattern.direction === 'bullish' ? 'rgba(0,255,163,0.9)' : 'rgba(255,71,87,0.9)';

    let currentIndex = 0;
    const points = pattern.points;

    const drawNext = () => {
      if (currentIndex >= points.length - 1) {
        onComplete();
        return;
      }

      const p1 = points[currentIndex];
      const p2 = points[currentIndex + 1];

      const leg = chartApi.addSeries(lc.LineSeries, {
        color: col,
        lineWidth: 1,
        lineStyle: currentIndex % 2 === 0 ? 0 : 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: `${p1.label}→${p2.label}`,
      });

      animation.series.push(leg);

      // Quick draw (400ms per leg for harmonics)
      const startTime = Date.now();
      const legDuration = 400;

      const frame = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / legDuration);
        const eased = 1 - Math.pow(1 - progress, 3);

        const current = this.interpolate(
          { time: p1.time, price: p1.price },
          { time: p2.time, price: p2.price },
          eased
        );

        leg.setData([
          { time: p1.time as any, value: p1.price },
          { time: current.time as any, value: current.price },
        ]);

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          leg.setData([
            { time: p1.time as any, value: p1.price },
            { time: p2.time as any, value: p2.price },
          ]);
          currentIndex++;
          setTimeout(drawNext, 100);
        }
      };

      requestAnimationFrame(frame);
    };

    drawNext();
  }

  // ── Cancel animated pattern ──────────────────────────────
  cancelAnimatedPattern(chartApi: any, patternId: string): void {
    const animation = this.activeAnimations.get(patternId);
    if (!animation) return;

    for (const s of animation.series) {
      try { chartApi.removeSeries(s); } catch {}
    }

    // FIX (4.6): Use per-instance Map
    this.activeAnimations.delete(patternId);
  }

  // ── Auto-remove after TTL ────────────────────────────────
  private scheduleAutoRemove(chartApi: any, patternId: string, afterMs: number): void {
    if (afterMs > 0) {
      setTimeout(() => this.cancelAnimatedPattern(chartApi, patternId), afterMs);
    }
  }

  // ── Get all active animations ────────────────────────────
  getActiveAnimations(): PatternAnimation[] {
    return Array.from(this.activeAnimations.values());
  }

  /** Reset per-instance state (e.g., when chart is destroyed or symbol changes) */
  reset(): void {
    // Note: we can't remove series from the chart here because we may not
    // have the chartApi reference. The caller should cancel animations first.
    this.activeAnimations.clear();
  }
}

// ═══════════════════════════════════════════════════════════
// FIX (4.6): Factory function — creates a new per-instance manager.
// ═══════════════════════════════════════════════════════════
export function createAnimatedPatternManager(): AnimatedPatternManager {
  return new AnimatedPatternManager();
}

// ═══════════════════════════════════════════════════════════
// FIX (4.6): Legacy module-level singleton for backward compat.
// Deprecated — new code should use createAnimatedPatternManager()
// for per-instance state in multi-chart mode.
// ═══════════════════════════════════════════════════════════
const _defaultManager = new AnimatedPatternManager();

/** @deprecated Use `createAnimatedPatternManager()` for per-instance state */
export function startAnimatedPattern(
  chartApi: any,
  lc: any,
  pattern: DetectedPattern,
  config: Partial<AnimationConfig> = {},
): void {
  _defaultManager.startAnimatedPattern(chartApi, lc, pattern, config);
}

/** @deprecated Use `createAnimatedPatternManager()` for per-instance state */
export function cancelAnimatedPattern(chartApi: any, patternId: string): void {
  _defaultManager.cancelAnimatedPattern(chartApi, patternId);
}

/** @deprecated Use `createAnimatedPatternManager()` for per-instance state */
export function getActiveAnimations(): PatternAnimation[] {
  return _defaultManager.getActiveAnimations();
}
