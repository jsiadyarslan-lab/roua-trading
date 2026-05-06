// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Multi-Chart Grid Layout System
// Professional multi-chart grid similar to TradingView / MetaTrader 5
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChartType } from '@/lib/charts/types';
import { ScopedStyle } from '@/components/ScopedStyle';

// ── Types ────────────────────────────────────────────────
interface ChartGridProps {
  onClose: () => void;
  defaultSymbol: string;
  defaultTimeframe: string;
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
  chartType: ChartType;
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
  'ADA/USDT', 'DOGE/USDT', 'EUR/USD', 'GBP/USD', 'USD/JPY',
  'AUD/USD', 'USD/CAD', 'XAU/USD', 'XAG/USD', 'US30', 'NAS100',
];

const TIMEFRAME_BUTTONS = [
  { value: '1min', label: '1m' },
  { value: '5min', label: '5m' },
  { value: '15min', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1day', label: '1D' },
];

const C = {
  bg: '#0B0E14',
  card: '#151A22',
  cardBorder: '#2A313C',
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
  headerBg: 'rgba(21,26,34,0.95)',
};

let cellIdCounter = 0;

// ── Default cells for a given grid config ──
function createDefaultCells(
  config: GridConfig,
  defaultSymbol: string,
  defaultTimeframe: string,
  existingCells?: Map<string, GridCell>,
): GridCell[] {
  const count = config.cols * config.rows;
  const cells: GridCell[] = [];
  const symbols = POPULAR_PAIRS;
  const tfs = ['15min', '1h', '4h', '1day', '5min', '1min'];

  for (let i = 0; i < count; i++) {
    const existingId = existingCells ? Array.from(existingCells.keys())[i] : undefined;
    const existing = existingId && existingCells ? existingCells.get(existingId) : undefined;

    cells.push({
      id: `cell-${cellIdCounter++}`,
      symbol: existing?.symbol ?? (i === 0 ? defaultSymbol : symbols[i % symbols.length]),
      timeframe: existing?.timeframe ?? (i === 0 ? defaultTimeframe : tfs[i % tfs.length]),
      chartType: existing?.chartType ?? 'candle',
    });
  }

  return cells;
}

// ── Grid Icon SVG Generator ──
function GridIcon({ cols, rows, size = 16, active = false }: { cols: number; rows: number; size?: number; active?: boolean }) {
  const pad = 2;
  const gap = 1.5;
  const cellW = (size - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = (size - pad * 2 - gap * (rows - 1)) / rows;

  const rects: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = pad + c * (cellW + gap);
      const y = pad + r * (cellH + gap);
      rects.push(
        <rect
          key={`${r}-${c}`}
          x={x}
          y={y}
          width={cellW}
          height={cellH}
          rx={1}
          fill={active ? C.cyan : 'rgba(240,242,245,0.5)'}
        />
      );
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rects}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════
export function ChartGrid({ onClose, defaultSymbol, defaultTimeframe }: ChartGridProps) {
  // ── State ──
  const [activeConfig, setActiveConfig] = useState<GridConfig>(GRID_CONFIGS[3]); // default 2×2
  const [cells, setCells] = useState<GridCell[]>(() =>
    createDefaultCells(GRID_CONFIGS[3], defaultSymbol, defaultTimeframe)
  );
  const [cellStates, setCellStates] = useState<Map<string, CellState>>(new Map());
  const [syncMode, setSyncMode] = useState(false);
  const [fullscreenCellId, setFullscreenCellId] = useState<string | null>(null);
  const [showGridSelector, setShowGridSelector] = useState(false);
  const [focusedCellId, setFocusedCellId] = useState<string>('');

  // ── Refs ──
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const chartInstancesRef = useRef<Map<string, any>>(new Map());
  const seriesRefs = useRef<Map<string, any>>(new Map());
  const volumeSeriesRefs = useRef<Map<string, any>>(new Map());
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizerDragRef = useRef<{
    type: 'col' | 'row';
    index: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);

  // ── Cell State Management ──
  const updateCellState = useCallback((cellId: string, update: Partial<CellState>) => {
    setCellStates(prev => {
      const next = new Map(prev);
      const existing = next.get(cellId) || {
        loading: true, error: null, currentPrice: null,
        prevPrice: null, candleCount: 0, changePercent: null,
      };
      next.set(cellId, { ...existing, ...update });
      return next;
    });
  }, []);

  // ── Load Data for a Cell ──
  const loadDataForCell = useCallback(async (cell: GridCell) => {
    const container = containerRefs.current.get(cell.id);
    if (!container) return;

    updateCellState(cell.id, { loading: true, error: null });

    try {
      const res = await fetch(
        `/api/exchange/history/${encodeURIComponent(cell.symbol)}?interval=${cell.timeframe}`
      );
      const j = await res.json();

      if (!j.success || !j.data || j.data.length === 0) {
        updateCellState(cell.id, { loading: false, error: 'No data', candleCount: 0 });
        return;
      }

      const candleData = j.data
        .map((c: any) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000),
          open: Number(c.open) || 0,
          high: Number(c.high) || 0,
          low: Number(c.low) || 0,
          close: Number(c.close) || 0,
          volume: Number(c.volume) || 0,
        }))
        .filter((d: any) => !isNaN(d.time) && d.time > 0 && !isNaN(d.close));

      // Deduplicate and sort
      const seen = new Set<number>();
      const unique = candleData.filter((d: any) => {
        if (seen.has(d.time)) return false;
        seen.add(d.time);
        return true;
      });
      unique.sort((a: any, b: any) => a.time - b.time);

      if (unique.length === 0) {
        updateCellState(cell.id, { loading: false, error: 'No valid data', candleCount: 0 });
        return;
      }

      const currentPrice = unique[unique.length - 1].close;
      const prevPrice = unique.length > 1 ? unique[unique.length - 2].close : null;
      const changePercent = prevPrice ? ((currentPrice - prevPrice) / prevPrice) * 100 : null;

      const { createChart, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries } = await import('lightweight-charts');

      const existingChart = chartInstancesRef.current.get(cell.id);
      const existingSeries = seriesRefs.current.get(cell.id);

      // Update existing chart data
      if (existingChart && existingSeries) {
        try {
          existingSeries.setData(unique);
          // Update volume
          const existingVolume = volumeSeriesRefs.current.get(cell.id);
          if (existingVolume) {
            existingVolume.setData(unique.map((d: any) => ({
              time: d.time,
              value: d.volume,
              color: d.close >= d.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
            })));
          }
          existingChart.timeScale().fitContent();
        } catch { /* ignore */ }
        updateCellState(cell.id, { loading: false, error: null, currentPrice, prevPrice, candleCount: unique.length, changePercent });
        return;
      }

      // Create new chart
      const rect = container.getBoundingClientRect();
      const width = rect.width || container.clientWidth || 400;
      const height = rect.height || container.clientHeight || 200;

      const chart = createChart(container, {
        width, height,
        layout: {
          background: { color: C.bg },
          textColor: C.textDim,
          fontSize: 9,
          fontFamily: "'JetBrains Mono', monospace",
          attributionLogo: false,
        },
        grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.2 } },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 3,
          barSpacing: 5,
          minBarSpacing: 2,
        },
        crosshair: {
          mode: 0,
          vertLine: { visible: true, labelVisible: false, color: 'rgba(0,212,255,0.2)' },
          horzLine: { visible: true, labelVisible: true, color: 'rgba(0,212,255,0.2)', labelBackgroundColor: C.card },
        },
        handleScroll: true,
        handleScale: true,
      });

      // Volume histogram
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volumeSeries.setData(unique.map((d: any) => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
      })));
      volumeSeriesRefs.current.set(cell.id, volumeSeries);

      // Main series based on chart type
      let mainSeries: any;
      if (cell.chartType === 'line') {
        mainSeries = chart.addSeries(LineSeries, {
          color: C.cyan,
          lineWidth: 2 as any,
          priceLineVisible: true,
          lastValueVisible: true,
        });
        mainSeries.setData(unique.map((d: any) => ({ time: d.time, value: d.close })));
      } else if (cell.chartType === 'area') {
        mainSeries = chart.addSeries(AreaSeries, {
          topColor: 'rgba(0,212,255,0.3)',
          bottomColor: 'rgba(0,212,255,0.02)',
          lineColor: C.cyan,
          lineWidth: 2 as any,
          priceLineVisible: true,
          lastValueVisible: true,
        });
        mainSeries.setData(unique.map((d: any) => ({ time: d.time, value: d.close })));
      } else {
        // Candlestick (default), hollow, bar, heikin-ashi
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: C.upColor,
          downColor: C.downColor,
          borderUpColor: C.upColor,
          borderDownColor: C.downColor,
          wickUpColor: C.upColor,
          wickDownColor: C.downColor,
        });
        mainSeries.setData(unique);
      }

      chart.timeScale().fitContent();

      chartInstancesRef.current.set(cell.id, chart);
      seriesRefs.current.set(cell.id, mainSeries);

      updateCellState(cell.id, {
        loading: false, error: null, currentPrice, prevPrice,
        candleCount: unique.length, changePercent,
      });
    } catch {
      updateCellState(cell.id, { loading: false, error: 'Failed to load', candleCount: 0 });
    }
  }, [updateCellState]);

  // ── Change Cell Symbol ──
  const handleChangeSymbol = useCallback((cellId: string, newSymbol: string) => {
    // Remove existing chart
    const chart = chartInstancesRef.current.get(cellId);
    if (chart) { try { chart.remove(); } catch {} }
    chartInstancesRef.current.delete(cellId);
    seriesRefs.current.delete(cellId);
    volumeSeriesRefs.current.delete(cellId);

    setCells(prev => prev.map(c => c.id === cellId ? { ...c, symbol: newSymbol } : c));

    // Sync mode: apply to all cells
    if (syncMode) {
      setCells(prev => prev.map(c => ({ ...c, symbol: newSymbol })));
      // Remove all chart instances to recreate
      chartInstancesRef.current.forEach((ch) => { try { ch.remove(); } catch {} });
      chartInstancesRef.current.clear();
      seriesRefs.current.clear();
      volumeSeriesRefs.current.clear();
    }
  }, [syncMode]);

  // ── Change Cell Timeframe ──
  const handleChangeTimeframe = useCallback((cellId: string, tf: string) => {
    // Remove existing chart
    const chart = chartInstancesRef.current.get(cellId);
    if (chart) { try { chart.remove(); } catch {} }
    chartInstancesRef.current.delete(cellId);
    seriesRefs.current.delete(cellId);
    volumeSeriesRefs.current.delete(cellId);

    setCells(prev => prev.map(c => c.id === cellId ? { ...c, timeframe: tf } : c));

    // Sync mode
    if (syncMode) {
      setCells(prev => prev.map(c => ({ ...c, timeframe: tf })));
      chartInstancesRef.current.forEach((ch) => { try { ch.remove(); } catch {} });
      chartInstancesRef.current.clear();
      seriesRefs.current.clear();
      volumeSeriesRefs.current.clear();
    }
  }, [syncMode]);

  // ── Change Cell Chart Type ──
  const handleChangeChartType = useCallback((cellId: string, chartType: ChartType) => {
    const chart = chartInstancesRef.current.get(cellId);
    if (chart) { try { chart.remove(); } catch {} }
    chartInstancesRef.current.delete(cellId);
    seriesRefs.current.delete(cellId);
    volumeSeriesRefs.current.delete(cellId);

    setCells(prev => prev.map(c => c.id === cellId ? { ...c, chartType } : c));
  }, []);

  // ── Grid Config Change ──
  const handleConfigChange = useCallback((config: GridConfig) => {
    setActiveConfig(config);
    setFullscreenCellId(null);

    // Remove extra chart instances
    const count = config.cols * config.rows;
    chartInstancesRef.current.forEach((ch, id) => {
      const cellIndex = cells.findIndex(c => c.id === id);
      if (cellIndex >= count) {
        try { ch.remove(); } catch {}
        chartInstancesRef.current.delete(id);
        seriesRefs.current.delete(id);
        volumeSeriesRefs.current.delete(id);
      }
    });

    // Adjust cells array
    setCells(prev => {
      const existingMap = new Map(prev.map(c => [c.id, c]));
      return createDefaultCells(config, defaultSymbol, defaultTimeframe, existingMap);
    });

    setShowGridSelector(false);
  }, [cells, defaultSymbol, defaultTimeframe]);

  // ── Toggle Fullscreen Cell ──
  const handleToggleFullscreen = useCallback((cellId: string) => {
    setFullscreenCellId(prev => prev === cellId ? null : cellId);
  }, []);

  // ── Double-click handler ──
  const handleCellDoubleClick = useCallback((cellId: string) => {
    handleToggleFullscreen(cellId);
  }, [handleToggleFullscreen]);

  // ── Set Container Ref ──
  const setContainerRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) containerRefs.current.set(id, el);
    else containerRefs.current.delete(id);
  }, []);

  // ── Load Data for All Cells ──
  useEffect(() => {
    const initTimer = setTimeout(() => {
      cells.forEach(cell => { if (cell.symbol) loadDataForCell(cell); });
    }, 150);
    return () => clearTimeout(initTimer);
  }, [cells, loadDataForCell]);

  // ── Auto-refresh every 30s ──
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      cells.forEach(cell => { if (cell.symbol) loadDataForCell(cell); });
    }, 30000);
    return () => { if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current); };
  }, [cells, loadDataForCell]);

  // ── Cleanup on Unmount ──
  useEffect(() => {
    return () => {
      chartInstancesRef.current.forEach(c => { if (c) try { c.remove(); } catch {} });
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
    };
  }, []);

  // ── Resize Observer ──
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          // Find chart by container
          containerRefs.current.forEach((container, id) => {
            if (container === entry.target) {
              const chart = chartInstancesRef.current.get(id);
              if (chart) {
                try { chart.applyOptions({ width, height }); } catch {}
              }
            }
          });
        }
      }
    });

    resizeObserverRef.current = observer;

    // Observe all containers
    containerRefs.current.forEach(container => {
      observer.observe(container);
    });

    return () => observer.disconnect();
  }, [cells]);

  // ── ESC to close ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreenCellId) {
          setFullscreenCellId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, fullscreenCellId]);

  // ── Set initial focused cell ──
  useEffect(() => {
    if (!focusedCellId && cells.length > 0) {
      setFocusedCellId(cells[0].id);
    }
  }, [cells, focusedCellId]);

  // ── Helpers ──
  const formatPrice = (price: number | null): string => {
    if (price === null) return '—';
    if (price > 10000) return price.toFixed(0);
    if (price > 100) return price.toFixed(1);
    if (price > 1) return price.toFixed(2);
    return price.toFixed(5);
  };

  // ── Determine visible cells (fullscreen mode or grid) ──
  const visibleCells = fullscreenCellId
    ? cells.filter(c => c.id === fullscreenCellId)
    : cells;

  // ── Resizer Drag Handlers ──
  const handleResizerMouseDown = useCallback((
    e: React.MouseEvent,
    type: 'col' | 'row',
    index: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    resizerDragRef.current = {
      type,
      index,
      startPos: type === 'col' ? e.clientX : e.clientY,
      startSizes: [],
    };
  }, []);

  // ── Render Cell ──
  const renderCell = (cell: GridCell, isFullscreen = false) => {
    const state = cellStates.get(cell.id);
    const isPositive = state?.changePercent !== null && state?.changePercent !== undefined && state.changePercent >= 0;
    const isFocused = focusedCellId === cell.id;

    return (
      <div
        key={cell.id}
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 6,
          border: fullscreenCellId
            ? '1px solid rgba(0,212,255,0.3)'
            : isFocused
              ? '1px solid rgba(0,212,255,0.3)'
              : `1px solid ${C.cardBorder}`,
          boxShadow: isFocused || fullscreenCellId
            ? '0 0 12px rgba(0,212,255,0.12)'
            : 'none',
          background: C.card,
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          minHeight: 0,
          cursor: 'default',
        }}
        onClick={() => setFocusedCellId(cell.id)}
        onDoubleClick={() => handleCellDoubleClick(cell.id)}
      >
        {/* ── Cell Header (28px) ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 28,
          padding: '0 6px',
          borderBottom: `1px solid ${C.cardBorder}`,
          background: C.headerBg,
          flexShrink: 0,
          gap: 4,
          direction: 'ltr',
        }}>
          {/* Left: Symbol selector + Timeframe buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
            {/* Symbol selector */}
            <select
              value={cell.symbol}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => handleChangeSymbol(cell.id, e.target.value)}
              style={{
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.2)',
                borderRadius: 3,
                color: C.cyan,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 4px',
                cursor: 'pointer',
                outline: 'none',
                maxWidth: 80,
                flexShrink: 0,
              }}
            >
              {POPULAR_PAIRS.map(p => (
                <option key={p} value={p} style={{ background: C.card, color: C.text }}>{p}</option>
              ))}
            </select>

            {/* Timeframe buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {TIMEFRAME_BUTTONS.map(tf => {
                const isActive = cell.timeframe === tf.value;
                return (
                  <button
                    key={tf.value}
                    onClick={(e) => { e.stopPropagation(); handleChangeTimeframe(cell.id, tf.value); }}
                    style={{
                      background: isActive ? 'rgba(0,212,255,0.15)' : 'transparent',
                      border: isActive ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
                      borderRadius: 2,
                      color: isActive ? C.cyan : C.textMuted,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 8,
                      fontWeight: isActive ? 700 : 500,
                      padding: '0 3px',
                      height: 18,
                      cursor: 'pointer',
                      transition: 'all 0.1s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tf.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Price + Maximize */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {/* Loading spinner */}
            {state?.loading && (
              <div style={{
                width: 10, height: 10,
                border: `2px solid ${C.cardBorder}`,
                borderTopColor: C.cyan,
                borderRadius: '50%',
                animation: 'cgSpin 1s linear infinite',
              }} />
            )}

            {/* Price display */}
            {state?.currentPrice != null && !state?.loading && (
              <>
                <span style={{
                  color: C.text,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {formatPrice(state.currentPrice)}
                </span>
                {state.changePercent !== null && (
                  <span style={{
                    color: isPositive ? C.success : C.danger,
                    fontSize: 8,
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    padding: '0 3px',
                    borderRadius: 2,
                    background: isPositive ? 'rgba(0,255,163,0.1)' : 'rgba(255,71,87,0.1)',
                  }}>
                    {isPositive ? '+' : ''}{state.changePercent.toFixed(2)}%
                  </span>
                )}
              </>
            )}

            {state?.error && (
              <span style={{ color: C.danger, fontSize: 8 }}>!</span>
            )}

            {/* Chart type mini dropdown */}
            <select
              value={cell.chartType}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => handleChangeChartType(cell.id, e.target.value as ChartType)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 2,
                color: C.textDim,
                fontSize: 8,
                padding: '0 2px',
                height: 18,
                cursor: 'pointer',
                outline: 'none',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <option value="candle" style={{ background: C.card }}>🕯</option>
              <option value="line" style={{ background: C.card }}>📈</option>
              <option value="area" style={{ background: C.card }}>📊</option>
            </select>

            {/* Maximize button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleFullscreen(cell.id); }}
              style={{
                background: fullscreenCellId === cell.id
                  ? 'rgba(0,212,255,0.15)'
                  : 'rgba(255,255,255,0.04)',
                border: fullscreenCellId === cell.id
                  ? '1px solid rgba(0,212,255,0.3)'
                  : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 2,
                color: fullscreenCellId === cell.id ? C.cyan : C.textMuted,
                width: 18,
                height: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                transition: 'all 0.15s ease',
              }}
              title={fullscreenCellId === cell.id ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreenCellId === cell.id ? (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── Chart Container ── */}
        <div
          ref={setContainerRef(cell.id)}
          style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative', background: C.bg }}
        />
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Top Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        borderBottom: `1px solid ${C.cardBorder}`,
        background: 'linear-gradient(180deg, rgba(21,26,34,0.98) 0%, rgba(11,14,20,0.98) 100%)',
        flexShrink: 0,
        direction: 'ltr',
      }}>
        {/* Left: Title + Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'rgba(0,212,255,0.1)',
            border: '1px solid rgba(0,212,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
          </div>
          <div>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 13, fontFamily: "'Cairo', sans-serif", lineHeight: 1.2 }}>
              Multi-Chart Grid
            </div>
            <div style={{ color: C.cyan, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>
              {activeConfig.label} · {activeConfig.cols * activeConfig.rows} charts
            </div>
          </div>
        </div>

        {/* Center: Grid Selector */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowGridSelector(!showGridSelector)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 6,
              color: C.cyan,
              padding: '5px 10px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              transition: 'all 0.15s ease',
            }}
          >
            <GridIcon cols={activeConfig.cols} rows={activeConfig.rows} size={14} active />
            {activeConfig.label}
            <svg width="8" height="8" viewBox="0 0 10 6" fill="currentColor">
              <path d="M0 0 L5 6 L10 0Z" />
            </svg>
          </button>

          {/* Grid Selector Dropdown */}
          {showGridSelector && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: '50%',
              transform: 'translateX(-50%)',
              background: C.card,
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 10,
              padding: 10,
              zIndex: 100,
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              backdropFilter: 'blur(10px)',
              minWidth: 220,
            }}>
              <div style={{
                fontSize: 9,
                color: C.textMuted,
                letterSpacing: 1,
                marginBottom: 8,
                fontFamily: "'Cairo', sans-serif",
                textAlign: 'center',
              }}>
                Grid Layout
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
              }}>
                {GRID_CONFIGS.map(cfg => {
                  const isActive = activeConfig.label === cfg.label;
                  return (
                    <button
                      key={cfg.label}
                      onClick={() => handleConfigChange(cfg)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 3,
                        background: isActive ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.03)',
                        border: isActive ? '1px solid rgba(0,212,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 6,
                        padding: '6px 4px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        if (!isActive) e.currentTarget.style.background = 'rgba(0,212,255,0.08)';
                      }}
                      onMouseLeave={e => {
                        if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      }}
                    >
                      <GridIcon cols={cfg.cols} rows={cfg.rows} size={20} active={isActive} />
                      <span style={{
                        color: isActive ? C.cyan : C.textDim,
                        fontSize: 8,
                        fontWeight: isActive ? 700 : 500,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Sync + Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Sync/Unsync Toggle */}
          <button
            onClick={() => setSyncMode(!syncMode)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: syncMode ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
              border: syncMode ? '1px solid rgba(0,212,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              color: syncMode ? C.cyan : C.textMuted,
              padding: '4px 8px',
              fontSize: 9,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              transition: 'all 0.15s ease',
            }}
            title={syncMode ? 'Sync ON: changes apply to all charts' : 'Sync OFF: charts are independent'}
          >
            {syncMode ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
            {syncMode ? 'SYNC' : 'FREE'}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 6,
              color: C.textDim,
              width: 28,
              height: 28,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,71,87,0.15)';
              e.currentTarget.style.color = C.danger;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.color = C.textDim;
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Chart Grid Area ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', background: C.bg }}>
        {fullscreenCellId ? (
          // ── Fullscreen Mode ──
          <div style={{ width: '100%', height: '100%', padding: 4 }}>
            {visibleCells.map(cell => renderCell(cell, true))}
          </div>
        ) : (
          // ── Grid Mode ──
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${activeConfig.cols}, 1fr)`,
            gridTemplateRows: `repeat(${activeConfig.rows}, 1fr)`,
            gap: 4,
            width: '100%',
            height: '100%',
            padding: 4,
          }}>
            {cells.slice(0, activeConfig.cols * activeConfig.rows).map(cell => renderCell(cell, false))}
          </div>
        )}
      </div>

      {/* ── Keyboard Hint ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '4px 14px',
        borderTop: `1px solid ${C.cardBorder}`,
        background: C.headerBg,
        flexShrink: 0,
        direction: 'ltr',
      }}>
        <span style={{ color: C.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
          ESC {fullscreenCellId ? 'Exit fullscreen' : 'Close'}
        </span>
        <span style={{ color: C.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
          Double-click → Fullscreen
        </span>
        <span style={{ color: C.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
          {syncMode ? '🔄 Sync ON' : '🔗 Independent'}
        </span>
      </div>

      <ScopedStyle>{`
        @keyframes cgSpin {
          to { transform: rotate(360deg); }
        }
      `}</ScopedStyle>
    </div>
  );
}
