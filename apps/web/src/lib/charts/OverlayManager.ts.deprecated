// ═══════════════════════════════════════════════════════════════════════
// ROUA OverlayManager — Sustainable Overlay Lifecycle Manager
//
// Architecture:
// - Each overlay type (trend, harmonic, geo, bos, elliott, wyckoff, sr,
//   fvg, vp, entry) manages its OWN series and price lines independently.
// - Adding/removing an overlay type only affects that type's series.
// - Candle series is NEVER touched — it's completely separate.
// - The manager persists overlay data (not just series refs) so it can
//   redraw if needed without re-running detection algorithms.
// - Decoupled from React re-render cycle — all operations are imperative.
//
// Key Design Principles (learned from TradingView lightweight-charts-drawing):
// 1. NEVER clear all series when toggling one overlay type
// 2. Each overlay type owns its series lifecycle
// 3. Candle series and overlay series are completely separate
// 4. Overlays persist until explicitly removed
// 5. No async gaps between clear and redraw — all synchronous
// ═══════════════════════════════════════════════════════════════════════

import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';

export type OverlayType = 'sr' | 'trend' | 'harmonic' | 'fvg' | 'bos' | 'geo' | 'ew' | 'wyckoff' | 'vp' | 'entry';

interface OverlayEntry {
  /** lightweight-charts series instances owned by this overlay */
  series: ISeriesApi<SeriesType>[];
  /** Price line IDs owned by this overlay (managed via chart.addPriceLine/removePriceLine) */
  priceLineIds: string[];
  /** Whether this overlay is currently visible on the chart */
  active: boolean;
  /** Timestamp when this overlay was last drawn */
  lastDrawn: number;
}

/**
 * OverlayManager — Singleton-style manager for chart overlay lifecycle.
 *
 * Usage:
 *   const mgr = new OverlayManager(chartApi, lcModule);
 *   mgr.addSeries('trend', lineSeries);
 *   mgr.addPriceLineId('sr', 'ai-s-0');
 *   mgr.clearType('trend');       // Only clears trend overlays
 *   mgr.clearAll();               // Clears ALL overlays (NOT candles!)
 *   mgr.isActive('trend');        // Check if trend overlays are on chart
 */
export class OverlayManager {
  private chart: IChartApi | null = null;
  private lc: any = null; // lightweight-charts module reference
  private overlays: Map<OverlayType, OverlayEntry> = new Map();
  // Callback to remove a price line from the chart — set by RouaChart
  private removePriceLineFn: ((id: string) => void) | null = null;

  constructor() {
    // Initialize all overlay types
    const types: OverlayType[] = ['sr', 'trend', 'harmonic', 'fvg', 'bos', 'geo', 'ew', 'wyckoff', 'vp', 'entry'];
    for (const type of types) {
      this.overlays.set(type, { series: [], priceLineIds: [], active: false, lastDrawn: 0 });
    }
  }

  /** Initialize with chart API and lightweight-charts module */
  init(chartApi: IChartApi, lcModule: any, removePriceLine: (id: string) => void): void {
    this.chart = chartApi;
    this.lc = lcModule;
    this.removePriceLineFn = removePriceLine;
  }

  /** Set the chart API (called when chart is recreated) */
  setChart(chartApi: IChartApi): void {
    this.chart = chartApi;
  }

  /** Register a series owned by a specific overlay type */
  addSeries(type: OverlayType, series: ISeriesApi<SeriesType>): void {
    const entry = this.overlays.get(type);
    if (entry) {
      entry.series.push(series);
      entry.active = true;
      entry.lastDrawn = Date.now();
    }
  }

  /** Register a price line ID owned by a specific overlay type */
  addPriceLineId(type: OverlayType, id: string): void {
    const entry = this.overlays.get(type);
    if (entry) {
      entry.priceLineIds.push(id);
      entry.active = true;
    }
  }

  /** Check if an overlay type has any active series on the chart */
  isActive(type: OverlayType): boolean {
    const entry = this.overlays.get(type);
    return entry ? entry.active && (entry.series.length > 0 || entry.priceLineIds.length > 0) : false;
  }

  /** Get all active overlay types */
  getActiveTypes(): OverlayType[] {
    const active: OverlayType[] = [];
    this.overlays.forEach((entry, type) => {
      if (entry.active && (entry.series.length > 0 || entry.priceLineIds.length > 0)) {
        active.push(type);
      }
    });
    return active;
  }

  /**
   * Clear only one overlay type's series and price lines.
   * This is the KEY method — it ONLY removes the specified type,
   * never touching other overlays or the candle series.
   */
  clearType(type: OverlayType): void {
    const entry = this.overlays.get(type);
    if (!entry) return;

    // Remove series from chart
    if (this.chart) {
      for (const series of entry.series) {
        try {
          this.chart.removeSeries(series);
        } catch (e) {
          // Series may already be removed
        }
      }
    }

    // Remove price lines
    if (this.removePriceLineFn) {
      for (const id of entry.priceLineIds) {
        try {
          this.removePriceLineFn(id);
        } catch (e) {
          // Price line may already be removed
        }
      }
    }

    entry.series = [];
    entry.priceLineIds = [];
    entry.active = false;
  }

  /**
   * Clear all overlay types. This removes ALL overlay series and price lines
   * but NEVER touches the candle series (mainSeries/candleSeries).
   */
  clearAll(): void {
    const types: OverlayType[] = ['sr', 'trend', 'harmonic', 'fvg', 'bos', 'geo', 'ew', 'wyckoff', 'vp', 'entry'];
    for (const type of types) {
      this.clearType(type);
    }
  }

  /**
   * Prepare an overlay type for redrawing.
   * Clears existing series/lines for this type so new ones can be added.
   * Returns true if the type was previously active (had content).
   */
  prepareRedraw(type: OverlayType): boolean {
    const wasActive = this.isActive(type);
    this.clearType(type);
    return wasActive;
  }

  /** Get the lightweight-charts module for creating new series */
  getLC(): any {
    return this.lc;
  }

  /** Get the chart API */
  getChart(): IChartApi | null {
    return this.chart;
  }

  /**
   * Add a LineSeries for a specific overlay type.
   * Handles sorting, autoscale disabling, and type tracking.
   * Returns the created series or null on error.
   */
  addLineSeries(
    type: OverlayType,
    data: { time: any; value: number }[],
    opts: {
      color?: string;
      lineWidth?: number;
      lineStyle?: number;
      priceLineVisible?: boolean;
      lastValueVisible?: boolean;
      crosshairMarkerVisible?: boolean;
      title?: string;
    }
  ): ISeriesApi<SeriesType> | null {
    if (!this.chart || !this.lc) return null;

    try {
      // Sort data by time ascending (lightweight-charts v5 requires this)
      const sorted = [...data].sort((a, b) => (a.time as number) - (b.time as number));

      const series = this.chart.addSeries(this.lc.LineSeries, {
        ...opts,
        autoscaleInfoProvider: () => null, // Don't affect chart autoScale
      });
      series.setData(sorted);

      this.addSeries(type, series);
      return series;
    } catch (e) {
      console.warn(`[OverlayManager] addLineSeries error for ${type}:`, e);
      return null;
    }
  }

  /** Get count of series for a specific type */
  getSeriesCount(type: OverlayType): number {
    const entry = this.overlays.get(type);
    return entry ? entry.series.length : 0;
  }

  /** Get total count of all overlay series */
  getTotalSeriesCount(): number {
    let count = 0;
    this.overlays.forEach(entry => { count += entry.series.length; });
    return count;
  }

  /** Destroy the manager — clears everything */
  destroy(): void {
    this.clearAll();
    this.chart = null;
    this.lc = null;
    this.removePriceLineFn = null;
  }
}

// Singleton instance — shared across the chart component lifecycle
let _instance: OverlayManager | null = null;

export function getOverlayManager(): OverlayManager {
  if (!_instance) {
    _instance = new OverlayManager();
  }
  return _instance;
}

export function resetOverlayManager(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
