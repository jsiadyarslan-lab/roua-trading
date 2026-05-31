// ═══════════════════════════════════════════════════════════
// ROUA Trading — Multi-Chart Registry & Types
// ═══════════════════════════════════════════════════════════
// Types, constants, and chart instance registry.
// SPLIT from useMultiChartStore.ts to eliminate TDZ errors
// in production minified builds. This file has NO dependency
// on the Zustand store, so webpack cannot create a circular
// reference that causes "Cannot access 'eT' before initialization".
// ═══════════════════════════════════════════════════════════

import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import type { ChartType, DrawingTool } from '@/lib/charts/types';

// ── Chart Control API ────────────────────────────────────
// This is the interface that RouaChart (in mini mode) exposes so the main
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
  // ── Panel toggles (for main toolbar → active mini chart routing) ──
  toggleDrawings: () => void;
  toggleIndicators: () => void;
  toggleAIPanel: () => void;
  toggleVolumeProfile: () => void;
  toggleChartTrading: () => void;
  toggleTemplateManager: () => void;
  toggleWatchlist: () => void;
  toggleChartSettings: () => void;
  toggleCompare: () => void;
  toggleFootprint: () => void;
  toggleAlerts: () => void;
  togglePatternProgress: () => void;
  toggleReplay: () => void;
  toggleHeatmap: () => void;
  toggleAIStream: () => void;
  toggleShare: () => void;
  // ── Symbol control ──
  setSymbol: (symbol: string) => void;
  // ── Panel state getters (for toolbar highlight state) ──
  isAIPanelOpen: boolean;
  isVolumeProfileOpen: boolean;
  isChartTradingOpen: boolean;
  isWatchlistOpen: boolean;
  isCompareOpen: boolean;
  isFootprintOpen: boolean;
  isAlertsOpen: boolean;
  isPatternProgressOpen: boolean;
  isReplayOpen: boolean;
  isHeatmapOpen: boolean;
  isAIStreamOpen: boolean;
  isDrawingPanelOpen: boolean;
  isIndicatorPanelOpen: boolean;
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
  '1x1': { cols: 1, rows: 1, label: '1x1' },
  '2x1': { cols: 2, rows: 1, label: '2x1' },
  '1x2': { cols: 1, rows: 2, label: '1x2' },
  '2x2': { cols: 2, rows: 2, label: '2x2' },
  '3x1': { cols: 3, rows: 1, label: '3x1' },
  '1x3': { cols: 1, rows: 3, label: '1x3' },
  '3x2': { cols: 3, rows: 2, label: '3x2' },
  '2x3': { cols: 2, rows: 3, label: '2x3' },
};

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
// RouaChart (in mini mode) registers its control API here so the main toolbar
// can route commands to the active chart cell.

export function registerChartControl(id: string, api: ChartControlAPI) {
  chartControlRegistry.set(id, api);
}

export function unregisterChartControl(id: string) {
  chartControlRegistry.delete(id);
}

export function getChartControl(id: string): ChartControlAPI | undefined {
  return chartControlRegistry.get(id);
}
