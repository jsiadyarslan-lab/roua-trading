// ═══════════════════════════════════════════════════════════
// ROUA Trading — Smart Grid (Unified Chart Grid + MTF)
// TradingView Pattern: Double-click mini chart → becomes main chart
// Single-click → select (cyan border) → toolbar actions target it
// Crosshair time sync across charts (cTrader feature)
// Trade markers shown on all mini charts
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

// ── Types ────────────────────────────────────────────────
interface SmartGridProps {
  onClose: () => void;
  defaultSymbol: string;
  defaultTimeframe: string;
  onSwitchToChart?: (symbol: string, timeframe: string, openTool?: string) => void;
  openPositions?: Array<{ symbol: string; side: string; entry: number; sl?: number; tp?: number }>;
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

interface CellState {
  loading: boolean;
  error: string | null;
  currentPrice: number | null;
  prevPrice: number | null;
  candleCount: number;
  changePercent: number | null;
}

// ── Constants ────────────────────────────────────────────
const GRID_CONFIGS: GridConfig[] = [
  { cols: 1, rows: 1, label: '1×1', icon: '▪' },
  { cols: 2, rows: 1, label: '2×1', icon: '▬▬' },
  { cols: 1, rows: 2, label: '1×2', icon: '▮▮' },
  { cols: 2, rows: 2, label: '2×2', icon: '▦' },
  { cols: 3, rows: 1, label: '3×1', icon: '▬▬▬' },
  { cols: 1, rows: 3, label: '1×3', icon: '▮▮▮' },
  { cols: 3, rows: 2, label: '3×2', icon: '⬓' },
  { cols: 2, rows: 3, label: '2×3', icon: '⬒' },
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

const C = {
  bg: '#0B0E14',
  card: '#111620',
  cardBorder: '#1E2530',
  cardBorderLight: 'rgba(42,49,60,0.6)',
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
  headerBg: 'rgba(17,22,32,0.95)',
};

let cellIdCounter = 0;

function createDefaultCells(
  config: GridConfig,
  defaultSymbol: string,
  _defaultTimeframe: string,
): GridCell[] {
  const count = config.cols * config.rows;
  const cells: GridCell[] = [];
  const tfs = ['15min', '1h', '4h', '1day', '5min', '1min'];
  for (let i = 0; i < count; i++) {
    cells.push({
      id: `cell-${cellIdCounter++}`,
      symbol: defaultSymbol,
      timeframe: tfs[i % tfs.length],
      chartType: 'candle',
    });
  }
  return cells;
}

export function SmartGrid({
  onClose,
  defaultSymbol,
  defaultTimeframe,
  onSwitchToChart,
  openPositions = [],
}: SmartGridProps) {
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const chartInstancesRef = useRef<Map<string, any>>(new Map());
  const seriesRefs = useRef<Map<string, any>>(new Map());
  const volumeSeriesRefs = useRef<Map<string, any>>(new Map());
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crosshairSubsRef = useRef<Array<() => void>>([]);

  const [activeConfig, setActiveConfig] = useState<GridConfig>(GRID_CONFIGS[3]); // 2×2
  const [cells, setCells] = useState<GridCell[]>(() =>
    createDefaultCells(GRID_CONFIGS[3], defaultSymbol, defaultTimeframe)
  );
  const [cellStates, setCellStates] = useState<Map<string, CellState>>(new Map());
  const [activeCellId, setActiveCellId] = useState<string>('');
  const [syncMode, setSyncMode] = useState(true);
  const [fullscreenCellId, setFullscreenCellId] = useState<string | null>(null);
  const [showGridSelector, setShowGridSelector] = useState(false);
  const [crosshairSync, setCrosshairSync] = useState(true);

  const t = useTranslations('dashboard.chart');

  useEffect(() => {
    if (!activeCellId && cells.length > 0) setActiveCellId(cells[0].id);
  }, [cells, activeCellId]);

  const updateCellState = useCallback((cellId: string, update: Partial<CellState>) => {
    setCellStates(prev => {
      const next = new Map(prev);
      const existing = next.get(cellId) || { loading: true, error: null, currentPrice: null, prevPrice: null, candleCount: 0, changePercent: null };
      next.set(cellId, { ...existing, ...update });
      return next;
    });
  }, []);

  // ── Fetch positions for a symbol ──
  const getPositionsForSymbol = useCallback((symbol: string) => {
    return openPositions.filter(p => p.symbol === symbol);
  }, [openPositions]);

  // ── Data Loading ──
  const loadDataForCell = useCallback(async (cell: GridCell) => {
    const container = containerRefs.current.get(cell.id);
    if (!container) return;

    updateCellState(cell.id, { loading: true, error: null });

    try {
      const res = await fetch(`/api/exchange/history/${encodeURIComponent(cell.symbol)}?interval=${cell.timeframe}`);
      const j = await res.json();

      if (!j.success || !j.data || j.data.length === 0) {
        updateCellState(cell.id, { loading: false, error: t('noData'), candleCount: 0 });
        return;
      }

      const candleData = j.data
        .map((c: any) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000),
          open: Number(c.open) || 0, high: Number(c.high) || 0,
          low: Number(c.low) || 0, close: Number(c.close) || 0,
          volume: Number(c.volume) || 0,
        }))
        .filter((d: any) => !isNaN(d.time) && d.time > 0 && !isNaN(d.close));

      const seen = new Set<number>();
      const unique = candleData.filter((d: any) => { if (seen.has(d.time)) return false; seen.add(d.time); return true; });
      unique.sort((a: any, b: any) => a.time - b.time);

      if (unique.length === 0) {
        updateCellState(cell.id, { loading: false, error: t('noValidData'), candleCount: 0 });
        return;
      }

      const currentPrice = unique[unique.length - 1].close;
      const prevPrice = unique.length > 1 ? unique[unique.length - 2].close : null;
      const changePercent = prevPrice && prevPrice !== 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : null;

      const { createChart, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries } = await import('lightweight-charts');

      const existingChart = chartInstancesRef.current.get(cell.id);
      const existingSeries = seriesRefs.current.get(cell.id);

      if (existingChart && existingSeries) {
        try {
          existingSeries.setData(unique);
          const existingVolSeries = volumeSeriesRefs.current.get(cell.id);
          if (existingVolSeries) {
            existingVolSeries.setData(unique.map((d: any) => ({
              time: d.time, value: d.volume,
              color: d.close >= d.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
            })));
          }
          existingChart.timeScale().fitContent();
        } catch {}
        updateCellState(cell.id, { loading: false, error: null, currentPrice, prevPrice, changePercent, candleCount: unique.length });
        return;
      }

      const rect = container.getBoundingClientRect();
      const width = rect.width || container.clientWidth || 400;
      const height = rect.height || container.clientHeight || 180;

      const chart = createChart(container, {
        width, height,
        layout: { background: { color: C.bg }, textColor: C.textDim, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", attributionLogo: false },
        grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.2 } },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 6, minBarSpacing: 2 },
        crosshair: { mode: 0, vertLine: { visible: true, labelVisible: false, color: 'rgba(0,212,255,0.3)', width: 1 as any, style: 2 }, horzLine: { visible: true, labelVisible: true, color: 'rgba(0,212,255,0.3)', labelBackgroundColor: C.card } },
        handleScroll: true, handleScale: true,
      });

      const volSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volSeries.setData(unique.map((d: any) => ({
        time: d.time, value: d.volume,
        color: d.close >= d.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
      })));
      volumeSeriesRefs.current.set(cell.id, volSeries);

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

      mainSeries.setData(unique);
      chart.timeScale().fitContent();

      // ── Show trade markers ──
      const positions = getPositionsForSymbol(cell.symbol);
      if (positions.length > 0) {
        const markers = positions.map((pos, i) => ({
          time: unique[unique.length - 1].time as any,
          position: pos.side === 'BUY' ? 'belowBar' as const : 'aboveBar' as const,
          color: pos.side === 'BUY' ? C.upColor : C.downColor,
          shape: pos.side === 'BUY' ? 'arrowUp' as const : 'arrowDown' as const,
          text: `${pos.side} ${pos.entry.toFixed(pos.entry > 100 ? 1 : 5)}`,
        }));
        try { mainSeries.setMarkers(markers); } catch {}
      }

      chartInstancesRef.current.set(cell.id, chart);
      seriesRefs.current.set(cell.id, mainSeries);

      updateCellState(cell.id, { loading: false, error: null, currentPrice, prevPrice, changePercent, candleCount: unique.length });
    } catch {
      updateCellState(cell.id, { loading: false, error: t('loadFailed'), candleCount: 0 });
    }
  }, [updateCellState, t, getPositionsForSymbol]);

  // ── Crosshair time sync (cTrader feature) ──
  useEffect(() => {
    if (!crosshairSync) return;
    // Cleanup old subs
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
            try {
              otherChart.timeScale().setVisibleRange(range);
            } catch {}
          });
        });
        crosshairSubsRef.current.push(unsub);
      } catch {}
    });

    return () => {
      crosshairSubsRef.current.forEach(unsub => unsub());
      crosshairSubsRef.current = [];
    };
  }, [cells, crosshairSync]);

  // ── Cell Management ──
  const destroyCellChart = useCallback((cellId: string) => {
    const chart = chartInstancesRef.current.get(cellId);
    if (chart) { try { chart.remove(); } catch {} }
    chartInstancesRef.current.delete(cellId);
    seriesRefs.current.delete(cellId);
    volumeSeriesRefs.current.delete(cellId);
  }, []);

  const handleChangeSymbol = useCallback((cellId: string, newSymbol: string) => {
    destroyCellChart(cellId);
    setCells(prev => {
      const updated = prev.map(c => c.id === cellId ? { ...c, symbol: newSymbol } : c);
      if (syncMode) {
        updated.forEach(c => {
          if (c.id !== cellId) {
            c.symbol = newSymbol;
            destroyCellChart(c.id);
          }
        });
      }
      return updated;
    });
  }, [syncMode, destroyCellChart]);

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

  const handleAddCell = useCallback(() => {
    const maxCells = activeConfig.cols * activeConfig.rows;
    if (cells.length >= maxCells) return;
    const newCell: GridCell = {
      id: `cell-${cellIdCounter++}`,
      symbol: syncMode ? (cells[0]?.symbol || defaultSymbol) : defaultSymbol,
      timeframe: '1h', chartType: 'candle',
    };
    setCells(prev => [...prev, newCell]);
  }, [activeConfig, cells, syncMode, defaultSymbol]);

  const handleRemoveCell = useCallback((cellId: string) => {
    destroyCellChart(cellId);
    setCells(prev => prev.filter(c => c.id !== cellId));
    setActiveCellId(prev => {
      if (prev === cellId) {
        const remaining = cells.filter(c => c.id !== cellId);
        return remaining.length > 0 ? remaining[0].id : '';
      }
      return prev;
    });
  }, [cells, destroyCellChart]);

  const handleConfigChange = useCallback((config: GridConfig) => {
    setActiveConfig(config);
    setCells(prev => {
      const count = config.cols * config.rows;
      if (prev.length >= count) return prev.slice(0, count);
      const newCells = [...prev];
      const tfs = ['15min', '1h', '4h', '1day', '5min', '1min'];
      while (newCells.length < count) {
        newCells.push({
          id: `cell-${cellIdCounter++}`,
          symbol: syncMode ? (prev[0]?.symbol || defaultSymbol) : defaultSymbol,
          timeframe: tfs[newCells.length % tfs.length], chartType: 'candle',
        });
      }
      return newCells;
    });
    setShowGridSelector(false);
  }, [syncMode, defaultSymbol]);

  // ── TradingView Focus: switch main chart to this cell's symbol/timeframe ──
  const handleFocusChart = useCallback((cell: GridCell, openTool?: string) => {
    if (onSwitchToChart) {
      onSwitchToChart(cell.symbol, cell.timeframe, openTool);
    }
    onClose();
  }, [onSwitchToChart, onClose]);

  // ── Zoom Handlers ──
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

  // ── Effects ──
  useEffect(() => {
    const initTimer = setTimeout(() => { cells.forEach(cell => { if (cell.symbol) loadDataForCell(cell); }); }, 150);
    return () => clearTimeout(initTimer);
  }, [cells, loadDataForCell]);

  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => { cells.forEach(cell => { if (cell.symbol) loadDataForCell(cell); }); }, 30000);
    return () => { if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current); };
  }, [cells, loadDataForCell]);

  useEffect(() => { return () => { chartInstancesRef.current.forEach(c => { if (c) try { c.remove(); } catch {} }); }; }, []);

  useEffect(() => {
    const handleResize = () => {
      chartInstancesRef.current.forEach((chart, id) => {
        const container = containerRefs.current.get(id);
        if (chart && container) { const w = container.clientWidth; const h = container.clientHeight; if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h }); }
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const observers: ResizeObserver[] = [];
    containerRefs.current.forEach((container, id) => {
      const chart = chartInstancesRef.current.get(id);
      if (container && chart) {
        const obs = new ResizeObserver(() => { const w = container.clientWidth; const h = container.clientHeight; if (w > 0 && h > 0) { try { chart.applyOptions({ width: w, height: h }); } catch {} } });
        obs.observe(container); observers.push(obs);
      }
    });
    return () => observers.forEach(o => o.disconnect());
  }, [cells]);

  const setContainerRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) containerRefs.current.set(id, el); else containerRefs.current.delete(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (fullscreenCellId) { setFullscreenCellId(null); return; } onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, fullscreenCellId]);

  const formatPrice = (price: number | null): string => {
    if (price === null) return '—';
    if (price > 10000) return price.toFixed(0);
    if (price > 100) return price.toFixed(1);
    if (price > 1) return price.toFixed(2);
    return price.toFixed(5);
  };

  const activeCell = cells.find(c => c.id === activeCellId);
  const isFullscreen = fullscreenCellId !== null;

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

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.92)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ═══ TOP TOOLBAR ═══ */}
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

        {/* FOCUS: Switch main chart to this cell (TradingView pattern) */}
        {activeCell && onSwitchToChart && (
          <button style={{ ...tbBtn, background: 'rgba(0,212,255,0.12)', color: C.cyan, border: '1px solid rgba(0,212,255,0.25)' }}
            onClick={() => handleFocusChart(activeCell)}>
            ⤢ تركيز
          </button>
        )}

        {/* Toolbar: open tool on active chart (closes grid, opens main chart with tool) */}
        {activeCell && onSwitchToChart && (
          <>
            <button style={tbBtn} onClick={() => handleFocusChart(activeCell, 'drawing')}
              onMouseEnter={e => tbBtnHover(e)} onMouseLeave={e => tbBtnHover(e, false)}>🖊 رسم</button>
            <button style={tbBtn} onClick={() => handleFocusChart(activeCell, 'indicators')}
              onMouseEnter={e => tbBtnHover(e)} onMouseLeave={e => tbBtnHover(e, false)}>📊 مؤشرات</button>
            <button style={tbBtn} onClick={() => handleFocusChart(activeCell, 'ai')}
              onMouseEnter={e => tbBtnHover(e)} onMouseLeave={e => tbBtnHover(e, false)}>🧠 AI</button>
            <button style={tbBtn} onClick={() => handleFocusChart(activeCell, 'trading')}
              onMouseEnter={e => tbBtnHover(e)} onMouseLeave={e => tbBtnHover(e, false)}>💰 صفقات</button>
          </>
        )}

        <div style={{ width: 1, height: 18, background: C.cardBorder }} />

        {/* Zoom */}
        <button style={tbBtn} onClick={handleZoomOut}>−</button>
        <button style={tbBtn} onClick={handleFitContent}>↔</button>
        <button style={tbBtn} onClick={handleZoomIn}>+</button>

        <div style={{ width: 1, height: 18, background: C.cardBorder }} />

        {/* Crosshair sync toggle (cTrader feature) */}
        <button style={{
          ...tbBtn,
          background: crosshairSync ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)',
          color: crosshairSync ? C.cyan : C.textMuted,
          border: `1px solid ${crosshairSync ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
        }} onClick={() => setCrosshairSync(!crosshairSync)}>
          ⊕ مزامنة خط
        </button>

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

        {/* Sync */}
        <button style={{ ...tbBtn, background: syncMode ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)', color: syncMode ? C.cyan : C.textMuted, border: `1px solid ${syncMode ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.08)'}` }} onClick={() => setSyncMode(!syncMode)}>
          {syncMode ? '🔗' : '🔓'} {syncMode ? 'مزامنة' : 'حر'}
        </button>

        <button style={tbBtn} onClick={handleAddCell} onMouseEnter={e => tbBtnHover(e)} onMouseLeave={e => tbBtnHover(e, false)}>+ شارت</button>

        <div style={{ flex: 1 }} />

        <button style={{ ...tbBtn, width: 26, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,71,87,0.15)'; (e.currentTarget as HTMLElement).style.color = C.danger; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = C.textDim; }}>
          ✕
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
          const positions = getPositionsForSymbol(cell.symbol);

          return (
            <div key={cell.id}
              onClick={() => setActiveCellId(cell.id)}
              onDoubleClick={() => handleFocusChart(cell)}
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

                {/* Positions badge */}
                {positions.length > 0 && (
                  <span style={{ padding: '0px 3px', borderRadius: 2, fontSize: 6.5, fontWeight: 700, fontFamily: 'monospace', background: 'rgba(0,255,163,0.12)', color: C.success, border: '1px solid rgba(0,255,163,0.2)' }}>
                    {positions.length} صفقة
                  </span>
                )}

                {state?.currentPrice !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span style={{ color: C.text, fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, fontWeight: 600 }}>{formatPrice(state?.currentPrice ?? null)}</span>
                    {state?.changePercent !== null && (
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, fontWeight: 700, color: isPositive ? C.upColor : C.downColor }}>
                        {isPositive ? '+' : ''}{state?.changePercent?.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}

                <select value={cell.chartType} onClick={e => e.stopPropagation()} onChange={e => handleChangeChartType(cell.id, e.target.value as any)}
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.cardBorder}`, borderRadius: 3, color: C.textDim, fontSize: 7.5, padding: '0px 2px', cursor: 'pointer', outline: 'none' }}>
                  <option value="candle" style={{ background: C.card }}>🕯</option>
                  <option value="line" style={{ background: C.card }}>📈</option>
                  <option value="area" style={{ background: C.card }}>📊</option>
                </select>

                <button onClick={e => { e.stopPropagation(); setFullscreenCellId(prev => prev === cell.id ? null : cell.id); }}
                  style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 9, padding: 0, outline: 'none' }}>
                  {fullscreenCellId === cell.id ? '⤓' : '⤢'}
                </button>

                {cells.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); handleRemoveCell(cell.id); }}
                    style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 9, padding: 0, outline: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.danger; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.textMuted; }}>
                    ✕
                  </button>
                )}
              </div>

              {/* Chart */}
              <div ref={setContainerRef(cell.id)} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />

              {/* Trade markers legend */}
              {positions.length > 0 && (
                <div style={{ display: 'flex', gap: 3, padding: '2px 5px', borderTop: `1px solid ${C.cardBorder}`, flexShrink: 0, flexWrap: 'wrap' }}>
                  {positions.slice(0, 3).map((pos, i) => (
                    <span key={i} style={{ fontSize: 6.5, fontFamily: "'JetBrains Mono',monospace", color: pos.side === 'BUY' ? C.upColor : C.downColor, fontWeight: 700 }}>
                      {pos.side === 'BUY' ? '▲' : '▼'} {pos.entry.toFixed(pos.entry > 100 ? 1 : 4)}
                      {pos.sl && <span style={{ color: C.danger }}> SL:{pos.sl.toFixed(pos.sl > 100 ? 1 : 4)}</span>}
                      {pos.tp && <span style={{ color: C.success }}> TP:{pos.tp.toFixed(pos.tp > 100 ? 1 : 4)}</span>}
                    </span>
                  ))}
                  {positions.length > 3 && <span style={{ fontSize: 6, color: C.textMuted }}>+{positions.length - 3}</span>}
                </div>
              )}

              {state?.error && <div style={{ padding: '3px 6px', color: C.danger, fontSize: 7, textAlign: 'center', flexShrink: 0 }}>{state.error}</div>}
            </div>
          );
        })}
      </div>

      {/* Hints */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '3px 10px', background: 'rgba(11,14,20,0.8)', borderTop: `1px solid ${C.cardBorder}`, flexShrink: 0 }}>
        <span style={{ color: C.textMuted, fontSize: 7 }}>نقر مزدوج = تركيز على الشارت الرئيسي</span>
        <span style={{ color: C.textMuted, fontSize: 7 }}>ESC = إغلاق</span>
        <span style={{ color: C.textMuted, fontSize: 7 }}>{cells.length} شارت</span>
        {openPositions.length > 0 && <span style={{ color: C.success, fontSize: 7 }}>{openPositions.length} صفقة مفتوحة</span>}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
