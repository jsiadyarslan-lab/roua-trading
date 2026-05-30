// ═══════════════════════════════════════════════════════════
// ROUA Trading — Multi-Chart Store (Zustand)
// ═══════════════════════════════════════════════════════════
// Manages layout, active chart tracking, and chart configurations.
// Sync is ALWAYS ON — no toggle needed.
//
// SPLIT: Types, constants, and registry functions are in
// multi-chart-registry.ts. This file ONLY contains the Zustand
// store and getActiveChartControl. This eliminates TDZ errors
// in production minified builds.
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChartControlAPI, LayoutConfig, ChartCellConfig } from '@/hooks/multi-chart-registry';
import { LAYOUT_METAS, unregisterChartInstance, getChartControl } from '@/hooks/multi-chart-registry';

// Re-export types and registry functions for backward compatibility
// so consumers don't need to change their import paths.
export type { ChartControlAPI, LayoutConfig, ChartCellConfig } from '@/hooks/multi-chart-registry';
export { LAYOUT_METAS, registerChartInstance, unregisterChartInstance, getChartInstance, getMainSeries, getAllChartInstances, getAllMainSeries, registerChartControl, unregisterChartControl, getChartControl } from '@/hooks/multi-chart-registry';

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

  // Expanded (maximized) chart — when set, only this chart is shown full-size
  expandedChartId: string | null;
  setExpandedChartId: (id: string | null) => void;
  toggleExpandChart: (id: string) => void;

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
      expandedChartId: null,

      charts: [
        { id: 'mc-1', symbol: 'BTC/USDT', timeframe: '15min', chartType: 'candle' },
      ],

      setLayout: (layout) => set({ layout }),

      setMultiChart: (value) => set({ isMultiChart: value }),

      setActiveChartId: (id) => set({ activeChartId: id }),

      setExpandedChartId: (id) => set({ expandedChartId: id }),

      toggleExpandChart: (id) => set(state => ({
        expandedChartId: state.expandedChartId === id ? null : id,
      })),

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
        // If the removed chart was expanded, collapse back to grid
        const newExpanded = state.expandedChartId === id ? null : state.expandedChartId;
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
          expandedChartId: newExpanded,
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
          expandedChartId: null,
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
        expandedChartId: state.expandedChartId,
      }),
    }
  )
);

// ── Active Chart Control ──
// References useMultiChartStore — MUST be after the store definition.
// By splitting the store into its own module with minimal exports,
// webpack cannot create a TDZ cycle.
export function getActiveChartControl(): ChartControlAPI | undefined {
  const state = useMultiChartStore.getState();
  return getChartControl(state.activeChartId);
}
