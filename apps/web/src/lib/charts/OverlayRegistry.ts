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

export type OverlayType = 'sr' | 'trend' | 'harmonic' | 'fvg' | 'bos' | 'geo' | 'ew' | 'wyckoff' | 'vp' | 'entry';

interface OverlayGroup {
  primitives: ISeriesPrimitive[];
  active: boolean;
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

  constructor() {
    const types: OverlayType[] = ['sr', 'trend', 'harmonic', 'fvg', 'bos', 'geo', 'ew', 'wyckoff', 'vp', 'entry'];
    for (const type of types) {
      this.groups.set(type, { primitives: [], active: false });
    }
  }

  /** Initialize with the candle series */
  init(series: ISeriesApi<SeriesType>): void {
    this.series = series;
  }

  /** Update the series reference (when chart is recreated) */
  setSeries(series: ISeriesApi<SeriesType>): void {
    // Detach all existing primitives from old series, reattach to new
    this.series = series;
    // Primitives that were attached to the old series become stale.
    // We need to clear and let the caller re-add them.
    this.clearAll();
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

  /** Clear all primitives of a specific type */
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
    group.primitives = [];
    group.active = false;
  }

  /** Clear all overlay primitives */
  clearAll(): void {
    const types: OverlayType[] = ['sr', 'trend', 'harmonic', 'fvg', 'bos', 'geo', 'ew', 'wyckoff', 'vp', 'entry'];
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
