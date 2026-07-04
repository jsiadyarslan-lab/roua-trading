// ═══════════════════════════════════════════════════════════════════════
// ROUA Overlay Registry — Primitive-based Overlay Management
//
// ARCHITECTURE (based on lightweight-charts v5 research):
// - All overlays use ISeriesPrimitive (NOT LineSeries!)
// - Primitives are attached to the candle series via attachPrimitive/detachPrimitive
// - Grouped by overlay type for easy enable/disable
// - Survives React re-renders (uses refs, not state)
// - Primitives NEVER affect candle data
// - Coordinates are recalculated on every draw (no stale caching)
// ═══════════════════════════════════════════════════════════════════════

import type { ISeriesApi, SeriesType } from 'lightweight-charts';
import type { ISeriesPrimitive } from 'lightweight-charts';

export type OverlayType = 'sr' | 'trend' | 'harmonic' | 'fvg' | 'bos' | 'geo' | 'ew' | 'wyckoff' | 'vp' | 'entry' | 'alerts' | 'mtf' | 'trade' | 'liq' | 'heatmap' | 'bayesian' | 'fusion' | 'ob';

interface OverlayGroup {
  primitives: ISeriesPrimitive[];
  active: boolean;
  priceLineIds: string[]; // Track price line IDs added by this overlay type
}

/**
 * OverlayRegistry — manages chart overlay primitives.
 *
 * Usage:
 *   const registry = new OverlayRegistry();
 *   registry.init(series);
 *   registry.add('trend', new TrendLinePrimitive({...}));
 *   registry.clearType('trend');
 *   registry.clearAll();
 */
export class OverlayRegistry {
  private series: ISeriesApi<SeriesType> | null = null;
  private groups: Map<OverlayType, OverlayGroup> = new Map();

  // Callback to remove a price line from the chart.
  // Set by renderOverlays() so the registry can clean up price lines
  // when an overlay type is cleared.
  private removePriceLineFn: ((id: string) => void) | null = null;

  // ── Smart Redraw: data signature tracking ──
  // Stores a hash of the last rendered data for each overlay type.
  // When smartRedraw() is called, it compares the new signature with the
  // stored one. If they match and primitives are active, the redraw is
  // skipped — existing primitives continue to render smoothly without
  // being destroyed and recreated.
  private lastRenderData: Map<OverlayType, string> = new Map();

  // ── Render Mutex ──
  // Prevents overlapping renderOverlays() calls from concurrent triggers
  // (WebSocket + periodic timer + user toggle). Without this, two calls
  // can race: first call starts smartRedraw → prepareRedraw clears type →
  // second call sees no active primitives → also starts redraw → double
  // creation → visual flicker.
  private _rendering = false;

  // PHASE 3: Primitive count limit per type to prevent memory leaks.
  // If too many primitives accumulate (e.g., from a very long chart session
  // with many toggles), the browser can slow down or crash.
  private readonly MAX_PRIMITIVES_PER_TYPE = 50;

  // PHASE 3: Total primitive count limit across all types.
  private readonly MAX_TOTAL_PRIMITIVES = 300;

  // PHASE 3: Render debounce — batch rapid render calls.
  // If renderOverlays is called within this window, the second call
  // is queued and executed after the window expires.
  private _renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingRender: (() => void) | null = null;
  private readonly RENDER_DEBOUNCE_MS = 16; // ~1 frame at 60fps

  /** Acquire the render lock. Returns false if another render is in progress. */
  acquireRenderLock(): boolean {
    if (this._rendering) return false;
    this._rendering = true;
    return true;
  }

  /** Release the render lock. */
  releaseRenderLock(): void {
    this._rendering = false;
  }

  constructor() {
    const types: OverlayType[] = ['sr', 'trend', 'harmonic', 'fvg', 'bos', 'geo', 'ew', 'wyckoff', 'vp', 'entry', 'alerts', 'mtf', 'trade', 'liq', 'heatmap', 'bayesian', 'fusion', 'ob'];
    for (const type of types) {
      this.groups.set(type, { primitives: [], active: false, priceLineIds: [] });
    }
  }

  /** Initialize with the candle series and optional price line remover */
  init(series: ISeriesApi<SeriesType>, removePriceLine?: (id: string) => void): void {
    // CRITICAL FIX: If the series reference changed (e.g., timeframe change,
    // chart recreation), we MUST detach all old primitives from the OLD series
    // before switching to the new one. Otherwise, old primitives become
    // "orphaned" — still rendered on the old series but no longer tracked.
    if (this.series && this.series !== series) {
      // Detach all primitives from the OLD series
      this.groups.forEach((group) => {
        for (const primitive of group.primitives) {
          try {
            this.series!.detachPrimitive(primitive);
          } catch {
            // Primitive may already be detached
          }
        }
      });
      // Remove all tracked price lines
      if (this.removePriceLineFn) {
        this.groups.forEach((group) => {
          for (const id of group.priceLineIds) {
            try {
              this.removePriceLineFn!(id);
            } catch {
              // Price line may already be removed
            }
          }
        });
      }
      // Reset all groups (primitives are detached, price lines are removed)
      this.groups.forEach((group) => {
        group.primitives = [];
        group.priceLineIds = [];
        group.active = false;
      });
    }

    this.series = series;
    if (removePriceLine) this.removePriceLineFn = removePriceLine;
  }

  /** Update the series reference (when chart is recreated) */
  setSeries(series: ISeriesApi<SeriesType>): void {
    // BUG-004 FIX: Was detaching primitives from the NEW series (they were never
    // attached there), leaving OLD series with orphaned primitives → memory leak.
    // Fix: detach from OLD series BEFORE reassigning this.series.
    if (this.series) {
      this.groups.forEach((group) => {
        for (const primitive of group.primitives) {
          try {
            this.series!.detachPrimitive(primitive);
          } catch {
            // Series may already be destroyed — safe to ignore
          }
        }
      });
    }
    this.series = series;
    // Primitives that were attached to the old series become stale.
    // We need to clear and let the caller re-add them.
    this.clearAll();
  }

  /** Set the price line removal callback */
  setRemovePriceLine(fn: (id: string) => void): void {
    this.removePriceLineFn = fn;
  }

  /** Register a price line ID for a specific overlay type */
  addPriceLineId(type: OverlayType, id: string): void {
    const group = this.groups.get(type);
    if (group) {
      group.priceLineIds.push(id);
    }
  }

  /** Add a primitive to a specific overlay type */
  add(type: OverlayType, primitive: ISeriesPrimitive): void {
    if (!this.series) {
      console.warn('[OverlayRegistry] No series attached, cannot add primitive');
      return;
    }

    // PHASE 3: Enforce primitive count limits to prevent memory leaks.
    // If a type has too many primitives, remove the oldest ones first.
    const group = this.groups.get(type);
    if (group && group.primitives.length >= this.MAX_PRIMITIVES_PER_TYPE) {
      // Remove oldest primitives (first in array)
      const excess = group.primitives.length - this.MAX_PRIMITIVES_PER_TYPE + 1;
      for (let i = 0; i < excess; i++) {
        const old = group.primitives[i];
        try { this.series.detachPrimitive(old); } catch { /* already detached */ }
      }
      group.primitives = group.primitives.slice(excess);
    }

    // PHASE 3: Check total primitive count across all types
    const totalCount = this.getTotalPrimitiveCount();
    if (totalCount >= this.MAX_TOTAL_PRIMITIVES) {
      // Trim the largest type to free up space
      let maxType: OverlayType | null = null;
      let maxCount = 0;
      this.groups.forEach((g, t) => {
        if (g.primitives.length > maxCount) { maxCount = g.primitives.length; maxType = t; }
      });
      if (maxType && maxCount > 5) {
        const g = this.groups.get(maxType)!;
        const trim = Math.ceil(maxCount * 0.3); // Remove 30% of largest type
        for (let i = 0; i < trim; i++) {
          const old = g.primitives[i];
          try { this.series.detachPrimitive(old); } catch { /* already detached */ }
        }
        g.primitives = g.primitives.slice(trim);
        // Also trim price lines
        const plTrim = Math.min(trim, g.priceLineIds.length);
        if (this.removePriceLineFn) {
          for (let i = 0; i < plTrim; i++) {
            try { this.removePriceLineFn(g.priceLineIds[i]); } catch { /* gone */ }
          }
        }
        g.priceLineIds = g.priceLineIds.slice(plTrim);
      }
    }

    try {
      this.series.attachPrimitive(primitive);
      if (group) {
        group.primitives.push(primitive);
        group.active = true;
      }
    } catch (e) {
      console.warn(`[OverlayRegistry] Failed to attach primitive for ${type}:`, e);
    }
  }

  /** Add multiple primitives at once */
  addMany(type: OverlayType, primitives: ISeriesPrimitive[]): void {
    for (const p of primitives) {
      this.add(type, p);
    }
  }

  /** Clear all primitives AND price lines of a specific type */
  clearType(type: OverlayType): void {
    const group = this.groups.get(type);
    if (!group) return;

    if (this.series) {
      for (const primitive of group.primitives) {
        try {
          this.series.detachPrimitive(primitive);
        } catch (e) {
          // Primitive may already be detached
        }
      }
    }

    // Remove price lines that belong to this overlay type.
    // Price lines (S1, R1, POC, Entry, SL, TP, etc.) would persist
    // on the chart even after the overlay was toggled off, because only
    // primitives were detached but price lines were never removed.
    if (this.removePriceLineFn) {
      for (const id of group.priceLineIds) {
        try {
          this.removePriceLineFn(id);
        } catch (e) {
          // Price line may already be removed
        }
      }
    }

    group.primitives = [];
    group.priceLineIds = [];
    group.active = false;
    // Also clear the data signature so smartRedraw knows this type needs recreation
    this.lastRenderData.delete(type);
  }

  /** Clear all overlay primitives and price lines */
  clearAll(): void {
    const types: OverlayType[] = ['sr', 'trend', 'harmonic', 'fvg', 'bos', 'geo', 'ew', 'wyckoff', 'vp', 'entry', 'alerts', 'mtf', 'trade', 'liq', 'heatmap', 'bayesian', 'fusion', 'ob'];
    for (const type of types) {
      this.clearType(type);
    }
  }

  /** Prepare a type for redrawing (clear existing, return whether it was active) */
  prepareRedraw(type: OverlayType): boolean {
    const wasActive = this.isActive(type);
    this.clearType(type);
    return wasActive;
  }

  /**
   * Smart Redraw — only redraw if data has changed.
   *
   * Instead of always destroying and recreating primitives (which causes
   * visual flicker / "dancing" lines), this method checks if the data
   * signature has changed since the last render. If not, it skips the
   * redraw entirely — existing primitives stay attached and continue
   * to render smoothly.
   *
   * Returns true if primitives need to be recreated (data changed).
   * Returns false if existing primitives are fine (data unchanged).
   *
   * Usage:
   *   if (registry.smartRedraw('entry', JSON.stringify({entry, sl, tp, dir}))) {
   *     // Data changed — recreate primitives
   *     registry.add('entry', new HorizontalLinePrimitive({...}));
   *   }
   *   // else: data unchanged, skip primitive creation
   */
  smartRedraw(type: OverlayType, dataSignature: string): boolean {
    const lastSignature = this.lastRenderData.get(type);
    if (lastSignature === dataSignature && this.isActive(type)) {
      // Data unchanged AND primitives are active — skip redraw completely.
      // Existing primitives will continue to render smoothly on their own
      // (their renderer() method recalculates pixel positions every frame).
      return false;
    }
    // Data changed or primitives missing — need to redraw
    this.lastRenderData.set(type, dataSignature);
    this.prepareRedraw(type);
    return true;
  }

  /** Check if a type has active overlays */
  isActive(type: OverlayType): boolean {
    const group = this.groups.get(type);
    return group ? group.active && group.primitives.length > 0 : false;
  }

  /** Get active overlay types */
  getActiveTypes(): OverlayType[] {
    const active: OverlayType[] = [];
    this.groups.forEach((group, type) => {
      if (group.active && group.primitives.length > 0) {
        active.push(type);
      }
    });
    return active;
  }

  /** Get count of primitives for a type */
  getCount(type: OverlayType): number {
    const group = this.groups.get(type);
    return group ? group.primitives.length : 0;
  }

  /** PHASE 3: Get total primitive count across all types */
  getTotalPrimitiveCount(): number {
    let total = 0;
    this.groups.forEach((group) => {
      total += group.primitives.length;
    });
    return total;
  }

  /**
   * PHASE 3: Debounced render — batch rapid render calls into one.
   *
   * Usage:
   *   registry.debouncedRender(() => renderOverlays(series, input, addLine, removeLine));
   *
   * If called multiple times within 16ms (one frame), only the last
   * call's render function executes. This prevents duplicate rendering
   * when WebSocket + timer + user toggle fire in the same frame.
   */
  debouncedRender(renderFn: () => void): void {
    this._pendingRender = renderFn;
    if (!this._renderDebounceTimer) {
      this._renderDebounceTimer = setTimeout(() => {
        this._renderDebounceTimer = null;
        const fn = this._pendingRender;
        this._pendingRender = null;
        if (fn) fn();
      }, this.RENDER_DEBOUNCE_MS);
    }
  }

  /** Destroy the registry — clears everything and nulls references */
  destroy(): void {
    this.clearAll();
    this.lastRenderData.clear();
    this.series = null;
  }
}

// H3 FIX: Removed module-level singleton pattern.
// The singleton broke multi-chart mode because all RouaChart instances shared
// the same registry. Now, each useChart instance creates its own OverlayRegistry
// (as a ref), and RouaChart uses the per-instance registry instead of the global one.
//
// The functions below are kept for backward compatibility but are deprecated.
// New code should create OverlayRegistry instances directly.

// Legacy singleton — kept for backward compat only, should NOT be used in new code
let _instance: OverlayRegistry | null = null;

/** @deprecated Use `new OverlayRegistry()` instead — creates per-instance registry */
export function getOverlayRegistry(): OverlayRegistry {
  if (!_instance) {
    _instance = new OverlayRegistry();
  }
  return _instance;
}

/** @deprecated Use `registry.destroy()` on your per-instance registry instead */
export function resetOverlayRegistry(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
