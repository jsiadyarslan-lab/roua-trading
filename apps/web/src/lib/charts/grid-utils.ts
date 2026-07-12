// ═══════════════════════════════════════════════════════════
// ROUA Trading — Shared Grid Utilities
// UNIFY (4.4): Common types, constants, and functions shared by
// ChartGrid, SmartGrid, and HeatmapGrid components.
// ═══════════════════════════════════════════════════════════

import type { ChartType } from '@/lib/charts/types';
import { safeMax, safeMin } from '@/lib/charts/chart-utils'
import T from '@/lib/unified-tokens';

// Re-export safe math helpers for grid consumers
export { safeMax, safeMin };

// ── Types ────────────────────────────────────────────────

/** Grid layout configuration (rows x cols) shared by all grid components */
// UNIFY (4.4): was duplicated in ChartGrid and SmartGrid
export interface GridConfig {
  cols: number;
  rows: number;
  label: string;
  icon: string;
}

/** Data source identifier — which API provided the candle data */
// UNIFY (4.4): was only in SmartGrid but useful for all grids
export type DataSource = 'loading' | 'binance' | 'coingecko' | 'yahoo' | 'twelvedata' | 'unavailable';

/** A single cell in the grid — represents one chart pane */
// UNIFY (4.4): was duplicated in ChartGrid and SmartGrid
export interface GridCell {
  id: string;
  symbol: string;
  timeframe: string;
  chartType: ChartType;
}

/** Runtime state for a grid cell (loading, price, etc.) */
// UNIFY (4.4): was duplicated in ChartGrid and SmartGrid with slight differences.
// ChartGrid had a simpler version without dataSource/lastUpdated/retryCount.
// We use the superset — consumers that don't need the extra fields can ignore them.
export interface CellState {
  loading: boolean;
  error: string | null;
  currentPrice: number | null;
  prevPrice: number | null;
  candleCount: number;
  changePercent: number | null;
  dataSource: DataSource;
  lastUpdated: number | null;
  retryCount: number;
}

/** Default (empty) cell state — used to initialize new cells */
export const DEFAULT_CELL_STATE: CellState = {
  loading: true,
  error: null,
  currentPrice: null,
  prevPrice: null,
  candleCount: 0,
  changePercent: null,
  dataSource: 'loading',
  lastUpdated: null,
  retryCount: 0,
};

// ── Constants ────────────────────────────────────────────

/** Available grid layout configurations (rows x cols) */
// UNIFY (4.4): was duplicated in ChartGrid and SmartGrid (different order, same entries)
export const GRID_CONFIGS: GridConfig[] = [
  { cols: 1, rows: 1, label: '1×1', icon: '▪' },
  { cols: 2, rows: 1, label: '2×1', icon: '▬▬' },
  { cols: 1, rows: 2, label: '1×2', icon: '▮▮' },
  { cols: 2, rows: 2, label: '2×2', icon: '▦' },
  { cols: 3, rows: 1, label: '3×1', icon: '▬▬▬' },
  { cols: 1, rows: 3, label: '1×3', icon: '▮▮▮' },
  { cols: 3, rows: 2, label: '3×2', icon: '⬓' },
  { cols: 2, rows: 3, label: '2×3', icon: '⬒' },
];

/** Default grid config index (2×2) */
export const DEFAULT_GRID_CONFIG_INDEX = 3;

/** Popular trading pairs for grid cell defaults */
// UNIFY (4.4): was duplicated in ChartGrid and SmartGrid with slight differences
export const POPULAR_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
  'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'AVAX/USDT', 'LINK/USDT',
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
  'XAU/USD', 'XAG/USD', 'US30', 'NAS100', 'SPX500',
];

/** Timeframe options for grid cell selection */
// UNIFY (4.4): was duplicated as TIMEFRAME_BUTTONS (ChartGrid) and TIMEFRAME_OPTIONS (SmartGrid)
export const TIMEFRAME_OPTIONS = [
  { value: '1min', label: '1m' },
  { value: '5min', label: '5m' },
  { value: '15min', label: '15m' },
  { value: '30min', label: '30m' },
  { value: '1h', label: '1H' },
  { value: '2h', label: '2H' },
  { value: '4h', label: '4H' },
  { value: '1day', label: '1D' },
  { value: '1week', label: '1W' },
];

/** Default timeframes used in MTF (multi-timeframe) mode */
// UNIFY (4.4): was duplicated as MTF_DEFAULT_TIMEFRAMES in SmartGrid and inline in ChartGrid
export const MTF_DEFAULT_TIMEFRAMES = ['15min', '1h', '4h', '1day', '5min', '1min'];

/** Source labels for display next to data source badges */
// UNIFY (4.4): was only in SmartGrid, now shared
export const SOURCE_LABELS: Record<DataSource, { label: string; color: string }> = {
  loading: { label: '...', color: T.text3 },
  binance: { label: 'Binance', color: T.success },
  coingecko: { label: 'CoinGecko', color: '#8B5CF6' },
  yahoo: { label: 'Yahoo', color: '#6366F1' },
  twelvedata: { label: '12Data', color: '#EC4899' },
  unavailable: { label: 'Unavailable', color: T.danger },
};

/** Common grid color palette — shared subset used by all grid components */
// UNIFY (4.4): was duplicated as `C` in ChartGrid, SmartGrid, and `T` in HeatmapGrid
export const GRID_COLORS = {
  bg: T.bg,
  card: T.card,
  cardBorder: T.border,
  grid: 'rgba(42,49,60,0.25)',
  text: T.text,
  textDim: T.text2,
  textMuted: T.text3,
  cyan: T.info,
  success: T.success,
  danger: T.danger,
  gold: T.gold,
  upColor: '#3fb950',
  downColor: '#f85149',
  warning: '#fbbf24',
} as const;

// ── Cell ID Counter ─────────────────────────────────────

// UNIFY (4.4): was duplicated as `cellIdCounter` in both ChartGrid and SmartGrid
let cellIdCounter = 0;

/** Generate a unique cell ID */
export function nextCellId(): string {
  return `cell-${cellIdCounter++}`;
}

// ── Cell Factory ────────────────────────────────────────

/**
 * Create default cells for a given grid configuration.
 * UNIFY (4.4): was duplicated in ChartGrid and SmartGrid with slight variations.
 *
 * @param config - Grid layout configuration
 * @param defaultSymbol - Symbol for the first cell
 * @param defaultTimeframe - Timeframe for the first cell
 * @param existingCells - Optional map of existing cells to preserve settings
 */
export function createDefaultCells(
  config: GridConfig,
  defaultSymbol: string,
  defaultTimeframe: string,
  existingCells?: Map<string, GridCell>,
): GridCell[] {
  const count = config.cols * config.rows;
  const cells: GridCell[] = [];
  const symbols = POPULAR_PAIRS;
  const tfs = MTF_DEFAULT_TIMEFRAMES;

  for (let i = 0; i < count; i++) {
    const existingId = existingCells ? Array.from(existingCells.keys())[i] : undefined;
    const existing = existingId && existingCells ? existingCells.get(existingId) : undefined;

    cells.push({
      id: nextCellId(),
      symbol: existing?.symbol ?? (i === 0 ? defaultSymbol : symbols[i % symbols.length]),
      timeframe: existing?.timeframe ?? (i === 0 ? defaultTimeframe : tfs[i % tfs.length]),
      chartType: existing?.chartType ?? 'candle',
    });
  }

  return cells;
}

/**
 * Create default cells for MTF mode — all cells show the same symbol
 * but cycle through different timeframes.
 * UNIFY (4.4): was in SmartGrid as a simplified createDefaultCells.
 */
export function createMTFCells(config: GridConfig, defaultSymbol: string): GridCell[] {
  const count = config.cols * config.rows;
  const cells: GridCell[] = [];
  for (let i = 0; i < count; i++) {
    cells.push({
      id: nextCellId(),
      symbol: defaultSymbol,
      timeframe: MTF_DEFAULT_TIMEFRAMES[i % MTF_DEFAULT_TIMEFRAMES.length],
      chartType: 'candle',
    });
  }
  return cells;
}

// ── Candle Data Parsing ─────────────────────────────────

/** Parsed candle data structure */
export interface ParsedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Parse raw API candle data into standardized format.
 * UNIFY (4.4): was duplicated in ChartGrid and SmartGrid.
 * Handles timestamp conversion, numeric coercion, deduplication, and sorting.
 */
export function parseCandleData(rawData: any[]): ParsedCandle[] {
  if (!Array.isArray(rawData) || rawData.length === 0) return [];

  const candleData = rawData
    .map((c: any) => ({
      time: Math.floor(new Date(c.timestamp).getTime() / 1000),
      open: Number(c.open) || 0,
      high: Number(c.high) || 0,
      low: Number(c.low) || 0,
      close: Number(c.close) || 0,
      volume: Number(c.volume) || 0,
    }))
    .filter((d) => !isNaN(d.time) && d.time > 0 && !isNaN(d.close));

  // Deduplicate by time
  const seen = new Set<number>();
  const unique = candleData.filter((d) => {
    if (seen.has(d.time)) return false;
    seen.add(d.time);
    return true;
  });

  unique.sort((a, b) => a.time - b.time);
  return unique;
}

/**
 * Compute price change percent from parsed candles.
 * UNIFY (4.4): was duplicated inline in both ChartGrid and SmartGrid.
 */
export function computeChangePercent(candles: ParsedCandle[]): {
  currentPrice: number;
  prevPrice: number | null;
  changePercent: number | null;
} {
  if (candles.length === 0) {
    return { currentPrice: 0, prevPrice: null, changePercent: null };
  }
  const currentPrice = candles[candles.length - 1].close;
  const prevPrice = candles.length > 1 ? candles[candles.length - 2].close : null;
  const changePercent = prevPrice ? ((currentPrice - prevPrice) / prevPrice) * 100 : null;
  return { currentPrice, prevPrice, changePercent };
}

// ── Data Source Detection ────────────────────────────────

/**
 * Detect data source from API response.
 * UNIFY (4.4): was only in SmartGrid, now shared for all grids.
 */
export function detectDataSource(response: any): DataSource {
  const source = response?.source || '';
  const note = response?.note || '';
  const data = response?.data;

  if (!data || !Array.isArray(data) || data.length === 0) {
    return 'unavailable';
  }

  if (data.length > 0) {
    const firstSource = data[0]?.source || '';
    const lowerSource = firstSource.toLowerCase();
    if (lowerSource.includes('binance')) return 'binance';
    if (lowerSource.includes('coingecko')) return 'coingecko';
    if (lowerSource.includes('yahoo')) return 'yahoo';
    if (lowerSource.includes('twelvedata')) return 'twelvedata';
    if (lowerSource.includes('frankfurter') || lowerSource.includes('ecb')) return 'yahoo';
    if (lowerSource.includes('exchangerate')) return 'yahoo';
  }

  const lowerRespSource = source.toLowerCase();
  if (lowerRespSource.includes('binance')) return 'binance';
  if (lowerRespSource.includes('coingecko')) return 'coingecko';
  if (lowerRespSource.includes('yahoo')) return 'yahoo';
  if (lowerRespSource.includes('twelvedata')) return 'twelvedata';

  if (lowerRespSource === 'demo' || note.includes('غير متاحة') || note.includes('unavailable')) {
    return 'unavailable';
  }

  return 'binance';
}

// ── Symbol Normalization ─────────────────────────────────

/**
 * Normalize symbol for matching — removes slashes, dashes, underscores
 * and uppercases for consistent comparison.
 * UNIFY (4.4): was only in SmartGrid, now shared.
 */
export function normalizeSymbol(s: string): string {
  return s.toUpperCase().replace(/[/\-_]/g, '');
}

// ── Container Dimensions ─────────────────────────────────

/**
 * Wait for an element to have real (non-zero) dimensions.
 * Useful when chart containers haven't been laid out yet.
 * UNIFY (4.4): was only in SmartGrid, now shared.
 */
export function waitForDimensions(
  el: HTMLElement,
  maxRetries = 30,
): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const check = (attempt: number) => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        resolve({ w, h });
        return;
      }
      if (attempt >= maxRetries) {
        const parent = el.parentElement;
        resolve({ w: parent?.clientWidth || 400, h: parent?.clientHeight || 200 });
        return;
      }
      requestAnimationFrame(() => check(attempt + 1));
    };
    check(0);
  });
}
