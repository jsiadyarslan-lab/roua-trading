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

export type OverlayType = 'sr' | 'trend' | 'harmonic' | 'fvg' | 'bos' | 'geo' | 'ew' | 'wyckoff' | 'vp' | 'entry' | 'alerts';

interface OverlayGroup {
  primitives: ISeriesPrimitive[];
  active: boolean;
  priceLineIds: string[]; // FIX: Track price line IDs added by this overlay type
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

  // FIX: Callback to remove a price line from the chart.
  // Set by renderOverlays() so the registry can clean up price lines
  // when an overlay type is cleared.
  private removePriceLineFn: ((id: string) => void) | null = null;

  constructor() {
    const types: OverlayType[] = ['sr', 'trend', 'harmonic', 'fvg', 'bos', 'geo', 'ew', 'wyckoff', 'vp', 'entry'];
    for (const type of types) {
      this.groups.set(type, { primitives: [], active: false, priceLineIds: [] });
    }
    // FIX: Also add 'alerts' group for alert markers
    this.groups.set('alerts', { primitives: [], active: false, priceLineIds: [] });
  }

  /** Initialize with the candle series and optional price line remover */
  init(series: ISeriesApi<SeriesType>, removePriceLine?: (id: string) => void): void {
    this.series = series;
    if (removePriceLine) this.removePriceLineFn = removePriceLine;
  }

  /** Update the series reference (when chart is recreated) */
  setSeries(series: ISeriesApi<SeriesType>): void {
    // Detach all existing primitives from old series, reattach to new
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
    try {
      this.series.attachPrimitive(primitive);
      const group = this.groups.get(type);
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

    // FIX: Also remove price lines that belong to this overlay type.
    // Previously, price lines (S1, R1, POC, Entry, SL, TP, etc.) persisted
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
  }

  /** Clear all overlay primitives */
  clearAll(): void {
    const types: OverlayType[] = ['sr', 'trend', 'harmonic', 'fvg', 'bos', 'geo', 'ew', 'wyckoff', 'vp', 'entry', 'alerts'];
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

  /** Destroy the registry */
  destroy(): void {
    this.clearAll();
    this.series = null;
  }
}

// Singleton instance
let _instance: OverlayRegistry | null = null;

export function getOverlayRegistry(): OverlayRegistry {
  if (!_instance) {
    _instance = new OverlayRegistry();
  }
  return _instance;
}

export function resetOverlayRegistry(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
