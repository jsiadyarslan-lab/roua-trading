// ═══════════════════════════════════════════════════════════
// ROUA Trading — Smart Grid (Unified Chart Grid + MTF)
// ═══════════════════════════════════════════════════════════
// CRITICAL FIX: Previous version had a React hooks death spiral:
//   openPositions = [] (new ref each render) → getPositionsForSymbol
//   new ref → loadDataForCell new ref → useEffect deps change →
//   timeout cleared before 150ms → candles NEVER loaded
//
// FIX: Use refs for all stable data, remove unstable deps from useCallback
// FIX: Pass positions + paperTrades from RouaChart, render trade overlays
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePositionsStore } from '@/hooks/usePositionsStore';
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore';

// ── Types ────────────────────────────────────────────────
interface SmartGridProps {
  onClose: () => void;
  defaultSymbol: string;
  defaultTimeframe: string;
  onSwitchToChart?: (symbol: string, timeframe: string, openTool?: string) => void;
}

interface GridConfig {
  cols: number;
  rows: number;
  label: string;
  icon: string;
}

interface GridCell {
  id: string;
  symbol: string;
  timeframe: string;
  chartType: 'candle' | 'line' | 'area';
}

type DataSource = 'loading' | 'binance' | 'coingecko' | 'yahoo' | 'twelvedata' | 'unavailable';

interface CellState {
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

// ── Unified trade info for chart rendering ──
interface TradeInfo {
  symbol: string;
  side: 'long' | 'short' | 'BUY' | 'SELL';
  entry: number;
  sl?: number;
  tp?: number;
  qty?: number;
  pnl?: number;
  source: 'exchange' | 'paper' | 'bot' | 'agent';
}

// ── Constants ────────────────────────────────────────────
const GRID_CONFIGS: GridConfig[] = [
  { cols: 2, rows: 2, label: '2x2', icon: '▦' },
  { cols: 3, rows: 1, label: '3x1', icon: '▬▬▬' },
  { cols: 1, rows: 3, label: '1x3', icon: '▮▮▮' },
  { cols: 3, rows: 2, label: '3x2', icon: '⬓' },
  { cols: 2, rows: 3, label: '2x3', icon: '⬒' },
  { cols: 1, rows: 1, label: '1x1', icon: '▪' },
  { cols: 2, rows: 1, label: '2x1', icon: '▬▬' },
  { cols: 1, rows: 2, label: '1x2', icon: '▮▮' },
];

const POPULAR_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
  'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'AVAX/USDT', 'LINK/USDT',
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
  'XAU/USD', 'XAG/USD', 'US30', 'NAS100', 'SPX500',
];

const TIMEFRAME_OPTIONS = [
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

const MTF_DEFAULT_TIMEFRAMES = ['15min', '1h', '4h', '1day', '5min', '1min'];

const C = {
  bg: '#0B0E14',
  card: '#111620',
  cardBorder: '#1E2530',
  grid: 'rgba(42,49,60,0.25)',
  text: '#F0F2F5',
  textDim: '#8B92A8',
  textMuted: '#4B5563',
  cyan: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  gold: '#d4af37',
  upColor: '#3fb950',
  downColor: '#f85149',
  warning: '#fbbf24',
};

const SOURCE_LABELS: Record<DataSource, { label: string; color: string }> = {
  loading: { label: '...', color: C.textMuted },
  binance: { label: 'Binance', color: C.success },
  coingecko: { label: 'CoinGecko', color: '#8B5CF6' },
  yahoo: { label: 'Yahoo', color: '#6366F1' },
  twelvedata: { label: '12Data', color: '#EC4899' },
  unavailable: { label: 'Unavailable', color: C.danger },
};

let cellIdCounter = 0;

function createDefaultCells(config: GridConfig, defaultSymbol: string): GridCell[] {
  const count = config.cols * config.rows;
  const cells: GridCell[] = [];
  for (let i = 0; i < count; i++) {
    cells.push({
      id: `cell-${cellIdCounter++}`,
      symbol: defaultSymbol,
      timeframe: MTF_DEFAULT_TIMEFRAMES[i % MTF_DEFAULT_TIMEFRAMES.length],
      chartType: 'candle',
    });
  }
  return cells;
}

// ── Wait for container to have real dimensions ──
function waitForDimensions(el: HTMLElement, maxRetries = 30): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const check = (attempt: number) => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) { resolve({ w, h }); return; }
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

// ── Detect data source from API response ──
function detectDataSource(response: any): DataSource {
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

// ── Normalize symbol for matching ──
function normalizeSymbol(s: string): string {
  return s.toUpperCase().replace(/[/\-_]/g, '');
}

export function SmartGrid({
  onClose,
  defaultSymbol,
  defaultTimeframe,
  onSwitchToChart,
}: SmartGridProps) {
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const chartInstancesRef = useRef<Map<string, any>>(new Map());
  const seriesRefs = useRef<Map<string, any>>(new Map());
  const volumeSeriesRefs = useRef<Map<string, any>>(new Map());
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crosshairSubsRef = useRef<Array<() => void>>([]);
  const initializedCellsRef = useRef<Set<string>>(new Set());
  const pendingLoadsRef = useRef<Set<string>>(new Set());

  // ═══ CRITICAL FIX: Read positions/trades directly from stores ═══
  // Previous version accepted openPositions as a prop with = [] default,
  // which created a new array reference on every render, causing the
  // useCallback dependency chain to break and timeouts to never fire.
  // Now we read from Zustand stores directly via refs — zero re-renders.
  const positions = usePositionsStore(s => s.positions);
  const paperTrades = usePaperTradesStore(s => s.trades);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const paperTradesRef = useRef(paperTrades);
  paperTradesRef.current = paperTrades;

  // Build unified trade list for a symbol (from ref, no re-renders)
  const getTradesForSymbol = useCallback((symbol: string): TradeInfo[] => {
    const chartSymbol = normalizeSymbol(symbol);
    const trades: TradeInfo[] = [];

    // Exchange positions
    for (const pos of positionsRef.current) {
      const posSymbol = normalizeSymbol(pos.symbol || '');
      if (!posSymbol.includes(chartSymbol) && !chartSymbol.includes(posSymbol)) continue;
      const entryPrice = Number(pos.entryPrice || pos.avgEntryPrice || 0);
      if (entryPrice <= 0) continue;
      const slVal = Number(pos.stopLoss || pos.sl || 0);
      const tpVal = Number(pos.takeProfit || pos.tp || 0);
      trades.push({
        symbol: pos.symbol,
        side: (pos.side || '').toLowerCase().includes('long') || pos.side === 'BUY' ? 'long' : 'short',
        entry: entryPrice,
        sl: slVal > 0 ? slVal : undefined,
        tp: tpVal > 0 ? tpVal : undefined,
        qty: pos.qty || 0,
        source: 'exchange',
      });
    }

    // Paper trades (including bot, agent, executor trades)
    for (const trade of paperTradesRef.current) {
      const tradeSymbol = normalizeSymbol(trade.symbol || '');
      if (!tradeSymbol.includes(chartSymbol) && !chartSymbol.includes(tradeSymbol)) continue;
      const entryPrice = Number(trade.entryPrice || 0);
      if (entryPrice <= 0) continue;
      trades.push({
        symbol: trade.symbol,
        side: trade.side,
        entry: entryPrice,
        sl: trade.sl && trade.sl > 0 ? trade.sl : undefined,
        tp: trade.tp && trade.tp > 0 ? trade.tp : undefined,
        qty: trade.qty,
        pnl: trade.unrealizedPnl,
        source: trade.source === 'bot' || trade.source === 'executor' ? 'bot'
          : trade.source === 'agent' ? 'agent' : 'paper',
      });
    }

    return trades;
  }, []); // ← NO DEPS: reads from refs, always fresh

  const [activeConfig, setActiveConfig] = useState<GridConfig>(GRID_CONFIGS[0]);
  const [cells, setCells] = useState<GridCell[]>(() =>
    createDefaultCells(GRID_CONFIGS[0], defaultSymbol)
  );
  const [cellStates, setCellStates] = useState<Map<string, CellState>>(new Map());
  const [activeCellId, setActiveCellId] = useState<string>('');
  const [fullscreenCellId, setFullscreenCellId] = useState<string | null>(null);
  const [showGridSelector, setShowGridSelector] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  // Set active cell on first render
  useEffect(() => {
    if (!activeCellId && cells.length > 0) setActiveCellId(cells[0].id);
  }, [cells, activeCellId]);

  const updateCellState = useCallback((cellId: string, update: Partial<CellState>) => {
    setCellStates(prev => {
      const next = new Map(prev);
      const existing = next.get(cellId) || {
        loading: true, error: null, currentPrice: null, prevPrice: null,
        candleCount: 0, changePercent: null, dataSource: 'loading' as DataSource,
        lastUpdated: null, retryCount: 0,
      };
      next.set(cellId, { ...existing, ...update });
      return next;
    });
  }, []);

  // ═══ CRITICAL FIX: loadDataForCell has STABLE dependencies ═══
  // No more openPositions = [] in the dep chain.
  // getTradesForSymbol reads from refs — always fresh, never causes re-render.
  const loadDataForCell = useCallback(async (cell: GridCell, isRetry = false) => {
    const container = containerRefs.current.get(cell.id);
    if (!container) {
      console.warn('[SmartGrid] No container for cell', cell.id);
      return;
    }

    if (pendingLoadsRef.current.has(cell.id)) return;
    pendingLoadsRef.current.add(cell.id);

    updateCellState(cell.id, {
      loading: true,
      error: null,
      dataSource: 'loading',
    });

    let candleData: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
    let detectedSource: DataSource = 'unavailable';

    try {
      // Fetch real data from API
      const url = `/api/exchange/history/${encodeURIComponent(cell.symbol)}?interval=${cell.timeframe}`;
      console.log('[SmartGrid] Fetching:', url);
      const res = await fetch(url);
      const j = await res.json();
      console.log('[SmartGrid] Response for', cell.symbol, cell.timeframe, ':', j.success, j.data?.length, 'candles, source:', j.source || j.data?.[0]?.source);

      detectedSource = detectDataSource(j);

      if (j.success && j.data && j.data.length > 0) {
        candleData = j.data
          .map((c: any) => ({
            time: Math.floor(new Date(c.timestamp).getTime() / 1000),
            open: Number(c.open) || 0, high: Number(c.high) || 0,
            low: Number(c.low) || 0, close: Number(c.close) || 0,
            volume: Number(c.volume) || 0,
          }))
          .filter((d: any) => !isNaN(d.time) && d.time > 0 && !isNaN(d.close));

        // Deduplicate by time
        const seen = new Set<number>();
        candleData = candleData.filter((d: any) => { if (seen.has(d.time)) return false; seen.add(d.time); return true; });
        candleData.sort((a: any, b: any) => a.time - b.time);
      }

      if (candleData.length === 0) {
        console.warn('[SmartGrid] No candle data for', cell.symbol, cell.timeframe, '- source:', detectedSource);
        updateCellState(cell.id, {
          loading: false,
          error: detectedSource === 'unavailable'
            ? 'لا توجد بيانات متاحة'
            : 'فشل تحميل البيانات',
          candleCount: 0,
          dataSource: 'unavailable',
          lastUpdated: Date.now(),
        });
        pendingLoadsRef.current.delete(cell.id);
        return;
      }

      console.log('[SmartGrid] Loaded', candleData.length, 'candles for', cell.symbol, cell.timeframe);

      const currentPrice = candleData[candleData.length - 1].close;
      const prevPrice = candleData.length > 1 ? candleData[candleData.length - 2].close : null;
      const changePercent = prevPrice && prevPrice !== 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : null;

      const existingChart = chartInstancesRef.current.get(cell.id);
      const existingSeries = seriesRefs.current.get(cell.id);

      // If chart already exists, just update data + trade overlays
      if (existingChart && existingSeries) {
        try {
          existingSeries.setData(candleData);
          const existingVolSeries = volumeSeriesRefs.current.get(cell.id);
          if (existingVolSeries) {
            existingVolSeries.setData(candleData.map((d: any) => ({
              time: d.time, value: d.volume,
              color: d.close >= d.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
            })));
          }
          existingChart.timeScale().fitContent();

          // Update trade markers on data refresh
          renderTradeOverlays(cell, existingChart, existingSeries, candleData);
        } catch (err) {
          console.warn('[SmartGrid] setData error, recreating chart:', err);
          try { existingChart.remove(); } catch {}
          chartInstancesRef.current.delete(cell.id);
          seriesRefs.current.delete(cell.id);
          volumeSeriesRefs.current.delete(cell.id);
          initializedCellsRef.current.delete(cell.id);
          pendingLoadsRef.current.delete(cell.id);
          setTimeout(() => loadDataForCell(cell), 100);
          return;
        }
        updateCellState(cell.id, {
          loading: false, error: null, currentPrice, prevPrice, changePercent,
          candleCount: candleData.length, dataSource: detectedSource,
          lastUpdated: Date.now(), retryCount: 0,
        });
        pendingLoadsRef.current.delete(cell.id);
        return;
      }

      // ── Create new chart instance ──
      const { w, h } = await waitForDimensions(container);
      console.log('[SmartGrid] Creating chart for', cell.symbol, cell.timeframe, '- dims:', w, 'x', h);

      const { createChart, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries } = await import('lightweight-charts');

      const chart = createChart(container, {
        width: w, height: h,
        layout: { background: { color: C.bg }, textColor: C.textDim, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", attributionLogo: false },
        grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.2 } },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 6, minBarSpacing: 2 },
        crosshair: { mode: 0, vertLine: { visible: true, labelVisible: false, color: 'rgba(0,212,255,0.3)', width: 1 as any, style: 2 }, horzLine: { visible: true, labelVisible: true, color: 'rgba(0,212,255,0.3)', labelBackgroundColor: C.card } },
        handleScroll: true, handleScale: true,
      });

      // Volume series
      const volSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volSeries.setData(candleData.map((d: any) => ({
        time: d.time, value: d.volume,
        color: d.close >= d.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
      })));
      volumeSeriesRefs.current.set(cell.id, volSeries);

      // Main price series
      let mainSeries: any;
      switch (cell.chartType) {
        case 'line':
          mainSeries = chart.addSeries(LineSeries, { color: C.cyan, lineWidth: 1 as any, priceLineVisible: false });
          break;
        case 'area':
          mainSeries = chart.addSeries(AreaSeries, { topColor: `${C.cyan}40`, bottomColor: `${C.cyan}05`, lineColor: C.cyan, lineWidth: 1 as any, priceLineVisible: false });
          break;
        default:
          mainSeries = chart.addSeries(CandlestickSeries, {
            upColor: C.upColor, downColor: C.downColor,
            borderUpColor: C.upColor, borderDownColor: C.downColor,
            wickUpColor: C.upColor, wickDownColor: C.downColor,
          });
      }

      mainSeries.setData(candleData);
      chart.timeScale().fitContent();

      // Render trade overlays (markers + price lines)
      renderTradeOverlays(cell, chart, mainSeries, candleData);

      chartInstancesRef.current.set(cell.id, chart);
      seriesRefs.current.set(cell.id, mainSeries);
      initializedCellsRef.current.add(cell.id);

      console.log('[SmartGrid] Chart created successfully for', cell.symbol, cell.timeframe);

      updateCellState(cell.id, {
        loading: false, error: null, currentPrice, prevPrice, changePercent,
        candleCount: candleData.length, dataSource: detectedSource,
        lastUpdated: Date.now(), retryCount: 0,
      });
    } catch (err: any) {
      console.error('[SmartGrid] loadDataForCell ERROR:', err);
      updateCellState(cell.id, {
        loading: false,
        error: 'خطأ في الاتصال',
        candleCount: 0,
        dataSource: 'unavailable',
        lastUpdated: Date.now(),
      });
    } finally {
      pendingLoadsRef.current.delete(cell.id);
    }
  }, [updateCellState, getTradesForSymbol]); // ← STABLE: both have [] or [stable] deps

  // ── Render trade overlays: markers + price lines ──
  const priceLineIdsRef = useRef<Map<string, string[]>>(new Map());

  const renderTradeOverlays = useCallback((cell: GridCell, chart: any, series: any, candleData: any[]) => {
    if (!chart || !series || candleData.length === 0) return;

    const trades = getTradesForSymbol(cell.symbol);
    if (trades.length === 0) return;

    // Remove old price lines for this cell
    const oldLineIds = priceLineIdsRef.current.get(cell.id) || [];
    for (const lineId of oldLineIds) {
      try { series.removePriceLine(lineId); } catch {}
    }
    priceLineIdsRef.current.set(cell.id, []);

    const newLineIds: string[] = [];

    // Add price lines for each trade (Entry, SL, TP)
    for (const trade of trades) {
      const isLong = trade.side === 'long' || trade.side === 'BUY';
      const entryColor = isLong ? C.upColor : C.downColor;

      // Entry price line
      try {
        const entryLine = series.createPriceLine({
          price: trade.entry,
          color: entryColor,
          lineWidth: 1 as any,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: `${isLong ? 'LONG' : 'SHORT'} @ ${trade.entry.toFixed(trade.entry > 100 ? 1 : 5)}`,
        });
        newLineIds.push(entryLine);
      } catch {}

      // SL price line
      if (trade.sl && trade.sl > 0) {
        try {
          const slLine = series.createPriceLine({
            price: trade.sl,
            color: C.danger,
            lineWidth: 1 as any,
            lineStyle: 1, // dotted
            axisLabelVisible: true,
            title: `SL ${trade.sl.toFixed(trade.sl > 100 ? 1 : 5)}`,
          });
          newLineIds.push(slLine);
        } catch {}
      }

      // TP price line
      if (trade.tp && trade.tp > 0) {
        try {
          const tpLine = series.createPriceLine({
            price: trade.tp,
            color: C.success,
            lineWidth: 1 as any,
            lineStyle: 1, // dotted
            axisLabelVisible: true,
            title: `TP ${trade.tp.toFixed(trade.tp > 100 ? 1 : 5)}`,
          });
          newLineIds.push(tpLine);
        } catch {}
      }
    }

    priceLineIdsRef.current.set(cell.id, newLineIds);

    // Add markers on the last candle
    const markers = trades.map((trade) => {
      const isLong = trade.side === 'long' || trade.side === 'BUY';
      return {
        time: candleData[candleData.length - 1].time as any,
        position: isLong ? 'belowBar' as const : 'aboveBar' as const,
        color: isLong ? C.upColor : C.downColor,
        shape: isLong ? 'arrowUp' as const : 'arrowDown' as const,
        text: `${isLong ? 'L' : 'S'} ${trade.entry.toFixed(trade.entry > 100 ? 1 : 4)}${trade.source === 'bot' ? ' 🤖' : trade.source === 'agent' ? ' 🧠' : ''}`,
      };
    });
    try { series.setMarkers(markers); } catch {}
  }, [getTradesForSymbol]);

  // ── Retry handler with exponential backoff ──
  const handleRetry = useCallback((cell: GridCell) => {
    const state = cellStates.get(cell.id);
    const retryCount = state?.retryCount || 0;

    const chart = chartInstancesRef.current.get(cell.id);
    if (chart) { try { chart.remove(); } catch {} }
    chartInstancesRef.current.delete(cell.id);
    seriesRefs.current.delete(cell.id);
    volumeSeriesRefs.current.delete(cell.id);
    initializedCellsRef.current.delete(cell.id);

    // Remove price lines tracking
    priceLineIdsRef.current.delete(cell.id);

    updateCellState(cell.id, { retryCount: retryCount + 1 });

    const delay = Math.min(1000 * Math.pow(2, retryCount), 15000);
    setTimeout(() => loadDataForCell(cell, true), delay);
  }, [cellStates, updateCellState, loadDataForCell]);

  // ── Crosshair time sync (ALWAYS ON) ──
  useEffect(() => {
    crosshairSubsRef.current.forEach(unsub => unsub());
    crosshairSubsRef.current = [];

    const charts = Array.from(chartInstancesRef.current.entries());
    if (charts.length < 2) return;

    charts.forEach(([id, chart]) => {
      try {
        const unsub = chart.timeScale().subscribeVisibleTimeRangeChange((range: any) => {
          if (!range) return;
          charts.forEach(([otherId, otherChart]) => {
            if (otherId === id) return;
            try { otherChart.timeScale().setVisibleRange(range); } catch {}
          });
        });
        crosshairSubsRef.current.push(unsub);
      } catch {}
    });

    return () => {
      crosshairSubsRef.current.forEach(unsub => unsub());
      crosshairSubsRef.current = [];
    };
  }, [cells]);

  // ── Cell Management ──
  const destroyCellChart = useCallback((cellId: string) => {
    const chart = chartInstancesRef.current.get(cellId);
    if (chart) { try { chart.remove(); } catch {} }
    chartInstancesRef.current.delete(cellId);
    seriesRefs.current.delete(cellId);
    volumeSeriesRefs.current.delete(cellId);
    initializedCellsRef.current.delete(cellId);
    priceLineIdsRef.current.delete(cellId);
  }, []);

  const handleChangeSymbol = useCallback((cellId: string, newSymbol: string) => {
    cells.forEach(c => destroyCellChart(c.id));
    setCells(prev => prev.map(c => ({ ...c, symbol: newSymbol })));
  }, [cells, destroyCellChart]);

  const handleChangeTimeframe = useCallback((cellId: string, tf: string) => {
    const tfOption = TIMEFRAME_OPTIONS.find(t => t.value === tf);
    if (!tfOption) return;
    destroyCellChart(cellId);
    setCells(prev => prev.map(c => c.id === cellId ? { ...c, timeframe: tfOption.value } : c));
  }, [destroyCellChart]);

  const handleChangeChartType = useCallback((cellId: string, chartType: 'candle' | 'line' | 'area') => {
    destroyCellChart(cellId);
    setCells(prev => prev.map(c => c.id === cellId ? { ...c, chartType } : c));
  }, [destroyCellChart]);

  const handleConfigChange = useCallback((config: GridConfig) => {
    setActiveConfig(config);
    setCells(prev => {
      const count = config.cols * config.rows;
      if (prev.length >= count) return prev.slice(0, count);
      const newCells = [...prev];
      while (newCells.length < count) {
        newCells.push({
          id: `cell-${cellIdCounter++}`,
          symbol: prev[0]?.symbol || defaultSymbol,
          timeframe: MTF_DEFAULT_TIMEFRAMES[newCells.length % MTF_DEFAULT_TIMEFRAMES.length],
          chartType: 'candle',
        });
      }
      return newCells;
    });
    setShowGridSelector(false);
  }, [defaultSymbol]);

  // ── Open tool: enter compact mode instead of closing SmartGrid ──
  // When user clicks AI/Draw/Ind/Trade, SmartGrid shrinks to the left
  // so the main chart + tool panel become visible on the right.
  // Only "Focus" and double-click close SmartGrid entirely.
  const handleOpenTool = useCallback((cell: GridCell, openTool: string) => {
    if (onSwitchToChart) {
      onSwitchToChart(cell.symbol, cell.timeframe, openTool);
    }
    setCompactMode(true);
  }, [onSwitchToChart]);

  // ── Focus chart: close SmartGrid entirely and switch main chart ──
  const handleFocusChart = useCallback((cell: GridCell) => {
    if (onSwitchToChart) {
      onSwitchToChart(cell.symbol, cell.timeframe);
    }
    onClose();
  }, [onSwitchToChart, onClose]);

  const handleZoomIn = useCallback(() => {
    const chart = chartInstancesRef.current.get(activeCellId);
    if (chart) { try { const ts = chart.timeScale(); const r = ts.getVisibleRange(); if (r) { const s = (r.to as number) - (r.from as number); const c = (r.from as number) + s/2; ts.setVisibleRange({ from: c - s*0.35, to: c + s*0.35 }); } } catch {} }
  }, [activeCellId]);

  const handleZoomOut = useCallback(() => {
    const chart = chartInstancesRef.current.get(activeCellId);
    if (chart) { try { const ts = chart.timeScale(); const r = ts.getVisibleRange(); if (r) { const s = (r.to as number) - (r.from as number); const c = (r.from as number) + s/2; ts.setVisibleRange({ from: c - s*0.7, to: c + s*0.7 }); } } catch {} }
  }, [activeCellId]);

  const handleFitContent = useCallback(() => {
    const chart = chartInstancesRef.current.get(activeCellId);
    if (chart) { try { chart.timeScale().fitContent(); } catch {} }
  }, [activeCellId]);

  // ═══ CRITICAL FIX: Initialize charts — STABLE loadDataForCell ═══
  // loadDataForCell now has only stable deps ([updateCellState, getTradesForSymbol])
  // both of which have [] or stable dep arrays. So this useEffect won't
  // keep clearing the timeout before it fires.
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  useEffect(() => {
    const initTimer = setTimeout(() => {
      cells.forEach(cell => {
        if (cell.symbol && !initializedCellsRef.current.has(cell.id)) {
          loadDataForCell(cell);
        }
      });
    }, 150);
    return () => clearTimeout(initTimer);
  }, [cells, loadDataForCell]);

  // ── Auto-refresh every 15s ──
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      cells.forEach(cell => {
        if (cell.symbol && initializedCellsRef.current.has(cell.id)) {
          loadDataForCell(cell);
        }
      });
    }, 15000);
    return () => { if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current); };
  }, [cells, loadDataForCell]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      chartInstancesRef.current.forEach(c => { if (c) try { c.remove(); } catch {} });
    };
  }, []);

  // ── Resize all charts when compact mode changes ──
  useEffect(() => {
    if (!compactMode) return; // resize on entering compact + after transition
    const timer = setTimeout(() => {
      chartInstancesRef.current.forEach((chart, id) => {
        const container = containerRefs.current.get(id);
        if (chart && container) {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w > 0 && h > 0) {
            try { chart.applyOptions({ width: w, height: h }); chart.timeScale().fitContent(); } catch {}
          }
        }
      });
    }, 350); // wait for CSS transition to finish
    return () => clearTimeout(timer);
  }, [compactMode]);

  // Also resize when expanding back to full
  useEffect(() => {
    if (compactMode) return;
    const timer = setTimeout(() => {
      chartInstancesRef.current.forEach((chart, id) => {
        const container = containerRefs.current.get(id);
        if (chart && container) {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w > 0 && h > 0) {
            try { chart.applyOptions({ width: w, height: h }); chart.timeScale().fitContent(); } catch {}
          }
        }
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [compactMode]);

  // ── Resize handling ──
  useEffect(() => {
    const handleResize = () => {
      chartInstancesRef.current.forEach((chart, id) => {
        const container = containerRefs.current.get(id);
        if (chart && container) {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w > 0 && h > 0) {
            try { chart.applyOptions({ width: w, height: h }); } catch {}
          }
        }
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── ResizeObserver for each container ──
  useEffect(() => {
    const observers: ResizeObserver[] = [];
    const timer = setTimeout(() => {
      containerRefs.current.forEach((container, id) => {
        const chart = chartInstancesRef.current.get(id);
        if (container && chart) {
          const obs = new ResizeObserver(() => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w > 0 && h > 0) {
              try { chart.applyOptions({ width: w, height: h }); } catch {}
            }
          });
          obs.observe(container);
          observers.push(obs);
        }
      });
    }, 300);
    return () => { clearTimeout(timer); observers.forEach(o => o.disconnect()); };
  }, [cells]);

  const setContainerRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) containerRefs.current.set(id, el); else containerRefs.current.delete(id);
  }, []);

  // ESC key — first exit compact/fullscreen, then close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreenCellId) { setFullscreenCellId(null); return; }
        if (compactMode) { setCompactMode(false); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, fullscreenCellId, compactMode]);

  const formatPrice = (price: number | null): string => {
    if (price === null) return '-';
    if (price > 10000) return price.toFixed(0);
    if (price > 100) return price.toFixed(1);
    if (price > 1) return price.toFixed(2);
    return price.toFixed(5);
  };

  const formatLastUpdated = (ts: number | null): string => {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) return 'now';
    if (diff < 60) return `${diff}s`;
    return `${Math.floor(diff / 60)}m`;
  };

  const activeCell = cells.find(c => c.id === activeCellId);
  const isFullscreen = fullscreenCellId !== null;

  // Count total trades for active symbol
  const activeTrades = activeCell ? getTradesForSymbol(activeCell.symbol) : [];

  const tbBtn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 5, color: C.textDim, padding: '4px 8px', fontSize: 9, fontWeight: 700,
    cursor: 'pointer', fontFamily: "'Cairo','IBM Plex Sans Arabic',sans-serif",
    display: 'flex', alignItems: 'center', gap: 3, transition: 'all 0.15s', whiteSpace: 'nowrap' as const,
  };

  const tbBtnHover = (e: React.MouseEvent, hover = true) => {
    const el = e.currentTarget as HTMLElement;
    if (hover) { el.style.background = 'rgba(0,212,255,0.12)'; el.style.color = C.cyan; }
    else { el.style.background = 'rgba(255,255,255,0.04)'; el.style.color = C.textDim; }
  };

  // Get trade count for a specific cell's symbol
  const getTradeCountForCell = useCallback((symbol: string): number => {
    return getTradesForSymbol(symbol).length;
  }, [getTradesForSymbol]);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, bottom: 0,
      width: compactMode ? '42%' : '100%',
      minWidth: compactMode ? 320 : undefined,
      zIndex: 1000,
      background: 'rgba(0,0,0,0.92)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.3s ease, min-width 0.3s ease',
      borderRight: compactMode ? '2px solid rgba(0,212,255,0.3)' : 'none',
    }}>
      {/* ═══ TOOLBAR ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 10px',
        background: 'linear-gradient(180deg, rgba(17,22,32,1) 0%, rgba(11,14,20,1) 100%)',
        borderBottom: `1px solid ${C.cardBorder}`, flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
          </div>
          <span style={{ color: C.text, fontSize: 11, fontWeight: 700, fontFamily: "'Cairo',sans-serif" }}>Smart Grid</span>
          {activeCell && (
            <span style={{ color: C.cyan, fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fontWeight: 600 }}>
              {activeCell.symbol} · {TIMEFRAME_OPTIONS.find(tf => tf.value === activeCell.timeframe)?.label}
            </span>
          )}
        </div>

        <div style={{ width: 1, height: 18, background: C.cardBorder }} />

        {/* Expand button (only in compact mode) */}
        {compactMode && (
          <button style={{ ...tbBtn, background: 'rgba(0,212,255,0.12)', color: C.cyan, border: '1px solid rgba(0,212,255,0.25)' }}
            onClick={() => setCompactMode(false)}
            onMouseEnter={e => tbBtnHover(e)} onMouseLeave={e => tbBtnHover(e, false)}>
            Expand
          </button>
        )}

        {/* Focus */}
        {activeCell && onSwitchToChart && (
          <button style={{ ...tbBtn, background: compactMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,212,255,0.12)', color: compactMode ? C.textDim : C.cyan, border: compactMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,212,255,0.25)' }}
            onClick={() => handleFocusChart(activeCell)}>
            Focus
          </button>
        )}

        {/* Quick tools */}
        {activeCell && onSwitchToChart && (
          <>
            <button style={tbBtn} onClick={() => handleOpenTool(activeCell, 'drawing')}
              onMouseEnter={e => tbBtnHover(e)} onMouseLeave={e => tbBtnHover(e, false)}>Draw</button>
            <button style={tbBtn} onClick={() => handleOpenTool(activeCell, 'indicators')}
              onMouseEnter={e => tbBtnHover(e)} onMouseLeave={e => tbBtnHover(e, false)}>Ind</button>
            <button style={tbBtn} onClick={() => handleOpenTool(activeCell, 'ai')}
              onMouseEnter={e => tbBtnHover(e)} onMouseLeave={e => tbBtnHover(e, false)}>AI</button>
            <button style={tbBtn} onClick={() => handleOpenTool(activeCell, 'trading')}
              onMouseEnter={e => tbBtnHover(e)} onMouseLeave={e => tbBtnHover(e, false)}>Trade</button>
          </>
        )}

        <div style={{ width: 1, height: 18, background: C.cardBorder }} />

        {/* Trades count */}
        {activeTrades.length > 0 && (
          <span style={{ padding: '0px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", background: 'rgba(0,255,163,0.1)', color: C.success, border: '1px solid rgba(0,255,163,0.2)' }}>
            {activeTrades.length} trades
          </span>
        )}

        {/* Zoom */}
        <button style={tbBtn} onClick={handleZoomOut}>-</button>
        <button style={tbBtn} onClick={handleFitContent}>&lt;-&gt;</button>
        <button style={tbBtn} onClick={handleZoomIn}>+</button>

        <div style={{ width: 1, height: 18, background: C.cardBorder }} />

        {/* Grid config */}
        <div style={{ position: 'relative' }}>
          <button style={tbBtn} onClick={() => setShowGridSelector(!showGridSelector)}>
            {activeConfig.icon} {activeConfig.label}
          </button>
          {showGridSelector && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: 6, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
              {GRID_CONFIGS.map(cfg => (
                <button key={cfg.label} onClick={() => handleConfigChange(cfg)}
                  style={{ background: activeConfig.label === cfg.label ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${activeConfig.label === cfg.label ? 'rgba(0,212,255,0.3)' : C.cardBorder}`, borderRadius: 4, color: activeConfig.label === cfg.label ? C.cyan : C.textDim, padding: '3px 5px', fontSize: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                  {cfg.icon} {cfg.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <button style={{ ...tbBtn, width: 26, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { if (compactMode) { setCompactMode(false); return; } onClose(); }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,71,87,0.15)'; (e.currentTarget as HTMLElement).style.color = C.danger; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = C.textDim; }}>
          X
        </button>
      </div>

      {/* ═══ CHART GRID ═══ */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: `repeat(${isFullscreen ? 1 : activeConfig.cols}, 1fr)`,
        gridTemplateRows: `repeat(${isFullscreen ? 1 : activeConfig.rows}, 1fr)`,
        gap: 3, padding: 3, minHeight: 0, overflow: 'hidden', background: C.bg,
      }}>
        {(isFullscreen ? cells.filter(c => c.id === fullscreenCellId) : cells).map(cell => {
          const state = cellStates.get(cell.id);
          const isActive = activeCellId === cell.id;
          const isPositive = (state?.changePercent ?? 0) >= 0;
          const tradesForCell = getTradesForSymbol(cell.symbol);
          const sourceInfo = SOURCE_LABELS[state?.dataSource || 'loading'];
          const isUnavailable = state?.dataSource === 'unavailable' && !state?.loading;

          return (
            <div key={cell.id}
              onClick={() => setActiveCellId(cell.id)}
              onDoubleClick={() => handleFocusChart(cell)}
              onContextMenu={(e) => { e.preventDefault(); handleOpenTool(cell, 'ai'); }}
              style={{
                background: C.card, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                borderRadius: 6, border: isActive ? '1px solid rgba(0,212,255,0.4)' : `1px solid ${C.cardBorder}`,
                boxShadow: isActive ? '0 0 12px rgba(0,212,255,0.1)' : 'none',
                cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s', minHeight: 0,
              }}
            >
              {/* Cell Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 5px', borderBottom: `1px solid ${C.cardBorder}`, background: isActive ? 'rgba(0,212,255,0.03)' : 'transparent', flexShrink: 0 }}>
                <select value={cell.symbol} onClick={e => e.stopPropagation()} onChange={e => handleChangeSymbol(cell.id, e.target.value)}
                  style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 3, color: C.cyan, fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, fontWeight: 700, padding: '1px 3px', cursor: 'pointer', outline: 'none', maxWidth: 70 }}>
                  {POPULAR_PAIRS.map(p => <option key={p} value={p} style={{ background: C.card, color: C.text }}>{p}</option>)}
                </select>

                <div style={{ display: 'flex', gap: 1 }}>
                  {TIMEFRAME_OPTIONS.slice(0, 6).map(tf => (
                    <button key={tf.value} onClick={e => { e.stopPropagation(); handleChangeTimeframe(cell.id, tf.value); }}
                      style={{ padding: '1px 2px', borderRadius: 2, fontSize: 6.5, fontWeight: 700, cursor: 'pointer', outline: 'none', fontFamily: 'inherit', border: 'none', background: cell.timeframe === tf.value ? 'rgba(0,212,255,0.15)' : 'transparent', color: cell.timeframe === tf.value ? C.cyan : C.textMuted }}>
                      {tf.label}
                    </button>
                  ))}
                </div>

                {state?.loading && <div style={{ width: 7, height: 7, border: `1.5px solid ${C.cyan}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}

                <div style={{ flex: 1 }} />

                {/* Data source badge */}
                {state?.dataSource && state.dataSource !== 'loading' && (
                  <span style={{
                    padding: '0px 3px', borderRadius: 2, fontSize: 6, fontWeight: 700,
                    fontFamily: "'JetBrains Mono',monospace",
                    background: `${sourceInfo.color}15`,
                    color: sourceInfo.color,
                    border: `1px solid ${sourceInfo.color}30`,
                  }}>
                    {sourceInfo.label}
                  </span>
                )}

                {/* Trade count badge */}
                {tradesForCell.length > 0 && (
                  <span style={{ padding: '0px 3px', borderRadius: 2, fontSize: 6.5, fontWeight: 700, fontFamily: 'monospace', background: 'rgba(0,255,163,0.12)', color: C.success, border: '1px solid rgba(0,255,163,0.2)' }}>
                    {tradesForCell.length} trade{tradesForCell.length > 1 ? 's' : ''}
                  </span>
                )}

                {state?.currentPrice != null && state.currentPrice > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span style={{ color: C.text, fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, fontWeight: 600 }}>{formatPrice(state.currentPrice)}</span>
                    {state?.changePercent != null && (
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, fontWeight: 700, color: isPositive ? C.upColor : C.downColor }}>
                        {isPositive ? '+' : ''}{state.changePercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}

                <select value={cell.chartType} onClick={e => e.stopPropagation()} onChange={e => handleChangeChartType(cell.id, e.target.value as any)}
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.cardBorder}`, borderRadius: 3, color: C.textDim, fontSize: 7.5, padding: '0px 2px', cursor: 'pointer', outline: 'none' }}>
                  <option value="candle" style={{ background: C.card }}>Candle</option>
                  <option value="line" style={{ background: C.card }}>Line</option>
                  <option value="area" style={{ background: C.card }}>Area</option>
                </select>

                <button onClick={e => { e.stopPropagation(); setFullscreenCellId(prev => prev === cell.id ? null : cell.id); }}
                  style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 9, padding: 0, outline: 'none' }}>
                  {fullscreenCellId === cell.id ? 'v' : '^'}
                </button>
              </div>

              {/* Chart container */}
              <div ref={setContainerRef(cell.id)} style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                {/* Unavailable overlay */}
                {isUnavailable && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 5,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(11,14,20,0.85)', gap: 8,
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.danger} strokeWidth="1.5" style={{ opacity: 0.6 }}>
                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <span style={{ color: C.danger, fontSize: 9, fontWeight: 700, fontFamily: "'Cairo',sans-serif", textAlign: 'center', lineHeight: 1.4 }}>
                      {state?.error || 'لا توجد بيانات'}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleRetry(cell); }}
                      style={{
                        background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
                        borderRadius: 4, color: C.cyan, padding: '4px 12px', fontSize: 8, fontWeight: 700,
                        cursor: 'pointer', fontFamily: "'Cairo',sans-serif",
                      }}
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                )}
              </div>

              {/* Trade markers legend */}
              {tradesForCell.length > 0 && (
                <div style={{ display: 'flex', gap: 3, padding: '2px 5px', borderTop: `1px solid ${C.cardBorder}`, flexShrink: 0, flexWrap: 'wrap' }}>
                  {tradesForCell.slice(0, 4).map((trade, i) => {
                    const isLong = trade.side === 'long' || trade.side === 'BUY';
                    const srcIcon = trade.source === 'bot' ? ' B' : trade.source === 'agent' ? ' A' : trade.source === 'exchange' ? ' E' : ' P';
                    return (
                      <span key={i} style={{ fontSize: 6.5, fontFamily: "'JetBrains Mono',monospace", color: isLong ? C.upColor : C.downColor, fontWeight: 700 }}>
                        {isLong ? '^' : 'v'} {trade.entry.toFixed(trade.entry > 100 ? 1 : 4)}{srcIcon}
                        {trade.sl && <span style={{ color: C.danger }}> SL:{trade.sl.toFixed(trade.sl > 100 ? 1 : 4)}</span>}
                        {trade.tp && <span style={{ color: C.success }}> TP:{trade.tp.toFixed(trade.tp > 100 ? 1 : 4)}</span>}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Bottom status bar */}
              {state?.lastUpdated && !state.loading && state.dataSource !== 'unavailable' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1px 5px', borderTop: `1px solid ${C.cardBorder}`, flexShrink: 0 }}>
                  <span style={{ fontSize: 6, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace" }}>
                    {state.candleCount} candles
                  </span>
                  <span style={{ fontSize: 6, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace" }}>
                    {formatLastUpdated(state.lastUpdated)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hints */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '3px 10px', background: 'rgba(11,14,20,0.8)', borderTop: `1px solid ${C.cardBorder}`, flexShrink: 0 }}>
        <span style={{ color: C.textMuted, fontSize: 7 }}>Double-click = Focus</span>
        <span style={{ color: C.textMuted, fontSize: 7 }}>ESC = Close</span>
        <span style={{ color: C.textMuted, fontSize: 7 }}>{cells.length} charts</span>
        {(positions.length + paperTrades.length) > 0 && <span style={{ color: C.success, fontSize: 7 }}>{positions.length + paperTrades.length} active trades</span>}
        <span style={{ color: C.cyan, fontSize: 7 }}>Auto-sync 15s</span>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
