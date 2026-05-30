// ═══════════════════════════════════════════════════════════
// ROUA Trading — Multi-Chart Store (Zustand)
// ═══════════════════════════════════════════════════════════
// Manages layout, active chart tracking, and chart instance registry.
// Sync is ALWAYS ON — no toggle needed.
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import type { ChartType, DrawingTool } from '@/lib/charts/types';

// ── Chart Control API ────────────────────────────────────
// This is the interface that ChartPanel exposes so the main
// toolbar can control it like the main chart.
export interface ChartControlAPI {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  setChartType: (type: ChartType) => void;
  setTool: (tool: DrawingTool) => void;
  togglePause: () => void;
  isPaused: boolean;
  activeTool: DrawingTool;
  clearDrawings: () => void;
  exportPNG: () => void;
  exportCSV: () => void;
  exportSVG: () => void;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
  addPriceLine: (id: string, price: number, color: string, label: string, lineWidth?: number, lineStyle?: number, axisLabelVisible?: boolean) => void;
  removePriceLine: (id: string) => void;
  setCrosshairMode: (enabled: boolean) => void;
}

// ── Types ────────────────────────────────────────────────
export type LayoutConfig = '1x1' | '2x1' | '1x2' | '2x2' | '3x1' | '1x3' | '3x2' | '2x3';

export interface ChartCellConfig {
  id: string;
  symbol: string;
  timeframe: string;
  chartType: ChartType;
}

interface LayoutMeta {
  cols: number;
  rows: number;
  label: string;
}

export const LAYOUT_METAS: Record<LayoutConfig, LayoutMeta> = {
  '1x1': { cols: 1, rows: 1, label: '1×1' },
  '2x1': { cols: 2, rows: 1, label: '2×1' },
  '1x2': { cols: 1, rows: 2, label: '1×2' },
  '2x2': { cols: 2, rows: 2, label: '2×2' },
  '3x1': { cols: 3, rows: 1, label: '3×1' },
  '1x3': { cols: 1, rows: 3, label: '1×3' },
  '3x2': { cols: 3, rows: 2, label: '3×2' },
  '2x3': { cols: 2, rows: 3, label: '2×3' },
};

const DEFAULT_TIMEFRAMES = ['15min', '1h', '4h', '1day', '5min', '1min'];
const POPULAR_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
  'ADA/USDT', 'DOGE/USDT', 'EUR/USD', 'GBP/USD', 'XAU/USD',
];

let cellIdCounter = 0;

function nextCellId(): string {
  return `mc-${++cellIdCounter}`;
}

function pickSymbol(index: number, mainSymbol: string): string {
  if (index === 0) return mainSymbol;
  return POPULAR_SYMBOLS[index % POPULAR_SYMBOLS.length];
}

function pickTimeframe(index: number, mainTimeframe: string): string {
  if (index === 0) return mainTimeframe;
  return DEFAULT_TIMEFRAMES[index % DEFAULT_TIMEFRAMES.length];
}

// ── Chart Instance Registry (non-reactive, stored outside Zustand) ──
// This avoids re-render storms when chart instances are registered/unregistered.
const chartInstanceRegistry = new Map<string, IChartApi>();
const mainSeriesRegistry = new Map<string, ISeriesApi<SeriesType>>();
const chartControlRegistry = new Map<string, ChartControlAPI>();

export function registerChartInstance(id: string, chart: IChartApi, mainSeries: ISeriesApi<SeriesType>) {
  chartInstanceRegistry.set(id, chart);
  mainSeriesRegistry.set(id, mainSeries);
}

export function unregisterChartInstance(id: string) {
  chartInstanceRegistry.delete(id);
  mainSeriesRegistry.delete(id);
  chartControlRegistry.delete(id);
}

export function getChartInstance(id: string): IChartApi | undefined {
  return chartInstanceRegistry.get(id);
}

export function getMainSeries(id: string): ISeriesApi<SeriesType> | undefined {
  return mainSeriesRegistry.get(id);
}

export function getAllChartInstances(): Map<string, IChartApi> {
  return chartInstanceRegistry;
}

export function getAllMainSeries(): Map<string, ISeriesApi<SeriesType>> {
  return mainSeriesRegistry;
}

// ── Chart Control API Registry ──
// ChartPanel registers its control API here so the main toolbar
// can route commands to the active chart panel.

export function registerChartControl(id: string, api: ChartControlAPI) {
  chartControlRegistry.set(id, api);
}

export function unregisterChartControl(id: string) {
  chartControlRegistry.delete(id);
}

export function getChartControl(id: string): ChartControlAPI | undefined {
  return chartControlRegistry.get(id);
}

// NOTE: getActiveChartControl() is defined AFTER useMultiChartStore to avoid
// TDZ (Temporal Dead Zone) error in production minified builds.
// Previously, this function was defined BEFORE the store's `const` declaration,
// causing "Cannot access 'eT' before initialization" in production.

// ── Store State ──────────────────────────────────────────
interface MultiChartState {
  // Layout
  layout: LayoutConfig;
  setLayout: (layout: LayoutConfig) => void;

  // Multi-chart mode (true = grid visible, false = single chart)
  isMultiChart: boolean;
  setMultiChart: (value: boolean) => void;

  // Active chart
  activeChartId: string;
  setActiveChartId: (id: string) => void;

  // Chart configurations
  charts: ChartCellConfig[];
  addChart: (mainSymbol: string, mainTimeframe: string) => string;
  removeChart: (id: string) => void;
  updateChartConfig: (id: string, updates: Partial<Omit<ChartCellConfig, 'id'>>) => void;

  // Layout change with cell redistribution
  changeLayout: (newLayout: LayoutConfig, mainSymbol: string, mainTimeframe: string) => void;

  // Reset to single chart
  resetToSingle: (mainSymbol: string, mainTimeframe: string) => void;
}

export const useMultiChartStore = create<MultiChartState>()(
  persist(
    (set, get) => ({
      layout: '1x1',
      isMultiChart: false,
      activeChartId: 'mc-1',

      charts: [
        { id: 'mc-1', symbol: 'BTC/USDT', timeframe: '15min', chartType: 'candle' },
      ],

      setLayout: (layout) => set({ layout }),

      setMultiChart: (value) => set({ isMultiChart: value }),

      setActiveChartId: (id) => set({ activeChartId: id }),

      addChart: (mainSymbol, mainTimeframe) => {
        const state = get();
        const newId = nextCellId();
        const index = state.charts.length;
        const newCell: ChartCellConfig = {
          id: newId,
          symbol: pickSymbol(index, mainSymbol),
          timeframe: pickTimeframe(index, mainTimeframe),
          chartType: 'candle',
        };

        // Determine layout based on count
        const newCount = state.charts.length + 1;
        let newLayout: LayoutConfig = state.layout;
        if (newCount === 2 && state.layout === '1x1') {
          newLayout = '2x1';
        } else if (newCount === 3 && (state.layout === '2x1' || state.layout === '1x2')) {
          newLayout = '3x1';
        } else if (newCount === 4 && state.layout === '3x1') {
          newLayout = '2x2';
        }

        set({
          charts: [...state.charts, newCell],
          layout: newLayout,
          isMultiChart: true,
          activeChartId: newId,
        });

        return newId;
      },

      removeChart: (id) => {
        const state = get();
        const remaining = state.charts.filter(c => c.id !== id);

        // Unregister instance
        unregisterChartInstance(id);

        if (remaining.length === 0) {
          // Should not happen, but safety
          set({ charts: remaining, isMultiChart: false, layout: '1x1', activeChartId: '' });
          return;
        }

        // Adjust layout to fit remaining charts
        let newLayout = state.layout;
        const count = remaining.length;
        if (count === 1) {
          newLayout = '1x1';
        } else if (count === 2) {
          newLayout = '2x1';
        } else if (count === 3) {
          newLayout = '3x1';
        }

        // If removed chart was active, switch to first remaining
        const newActiveId = state.activeChartId === id ? remaining[0].id : state.activeChartId;

        set({
          charts: remaining,
          layout: newLayout,
          activeChartId: newActiveId,
          isMultiChart: count > 1,
        });
      },

      updateChartConfig: (id, updates) => {
        set(state => ({
          charts: state.charts.map(c =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }));
      },

      changeLayout: (newLayout, mainSymbol, mainTimeframe) => {
        const meta = LAYOUT_METAS[newLayout];
        const targetCount = meta.cols * meta.rows;
        const currentCharts = get().charts;

        let newCharts: ChartCellConfig[];

        if (currentCharts.length >= targetCount) {
          // Shrink: keep first N charts
          newCharts = currentCharts.slice(0, targetCount);
          // Unregister removed charts
          for (let i = targetCount; i < currentCharts.length; i++) {
            unregisterChartInstance(currentCharts[i].id);
          }
        } else {
          // Grow: create new cells
          newCharts = [...currentCharts];
          for (let i = currentCharts.length; i < targetCount; i++) {
            newCharts.push({
              id: nextCellId(),
              symbol: pickSymbol(i, mainSymbol),
              timeframe: pickTimeframe(i, mainTimeframe),
              chartType: 'candle',
            });
          }
        }

        // Ensure active chart still exists
        const activeExists = newCharts.some(c => c.id === get().activeChartId);
        const newActiveId = activeExists ? get().activeChartId : newCharts[0]?.id || 'mc-1';

        set({
          layout: newLayout,
          charts: newCharts,
          activeChartId: newActiveId,
          isMultiChart: targetCount > 1,
        });
      },

      resetToSingle: (mainSymbol, mainTimeframe) => {
        // Unregister all but first
        const state = get();
        state.charts.forEach((c, i) => {
          if (i > 0) unregisterChartInstance(c.id);
        });

        set({
          layout: '1x1',
          isMultiChart: false,
          charts: [{
            id: state.charts[0]?.id || 'mc-1',
            symbol: mainSymbol,
            timeframe: mainTimeframe,
            chartType: 'candle',
          }],
          activeChartId: state.charts[0]?.id || 'mc-1',
        });
      },
    }),
    {
      name: 'roua-multi-chart',
      partialize: (state) => ({
        layout: state.layout,
        charts: state.charts,
        isMultiChart: state.isMultiChart,
        activeChartId: state.activeChartId,
      }),
    }
  )
);

// ── Active Chart Control (MUST be after store definition) ──
// This function references useMultiChartStore, which is a `const` variable.
// In production minified builds, if this function is defined before the
// store's `const` declaration, webpack/terser may create a TDZ error:
// "ReferenceError: Cannot access 'eT' before initialization"
// By placing it AFTER the store, we guarantee the `const` is initialized
// before any code can call this function.
export function getActiveChartControl(): ChartControlAPI | undefined {
  const state = useMultiChartStore.getState();
  return chartControlRegistry.get(state.activeChartId);
}
