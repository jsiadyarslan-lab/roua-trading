// ═══════════════════════════════════════════════════════════
// ROUA Trading — ChartPanel (Individual Chart Cell)
// ═══════════════════════════════════════════════════════════
// Each ChartPanel is an independent chart with:
// - Its own lightweight-charts instance
// - Live WebSocket data
// - Automatic crosshair/scroll sync with siblings
// - Active state tracking (blue border when selected)
// - Chart Control API registration for main toolbar routing
// - Mini header with symbol/timeframe/price info
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import type { CandleData, ChartType, ActiveIndicator, DrawingTool } from '@/lib/charts/types';
import { useChartWebSocket } from '@/hooks/useChartWebSocket';
import {
  registerChartInstance,
  unregisterChartInstance,
  registerChartControl,
  unregisterChartControl,
} from '@/hooks/multi-chart-registry';
import { useMultiChartStore } from '@/hooks/useMultiChartStore';

interface ChartPanelProps {
  chartId: string;
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  isActive: boolean;
  onActivate: () => void;
  onClose?: () => void;
  canClose?: boolean;
}

// ── Colors ──
const C = {
  bg: '#0B0E14',
  card: '#111620',
  cardBorder: '#1E2530',
  text: '#F0F2F5',
  textDim: '#8B92A8',
  textMuted: '#4B5563',
  cyan: '#00D4FF',
  success: '#3fb950',
  danger: '#f85149',
  upColor: '#3fb950',
  downColor: '#f85149',
  grid: 'rgba(42,49,60,0.25)',
};

const POPULAR_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
  'ADA/USDT', 'DOGE/USDT', 'EUR/USD', 'GBP/USD', 'XAU/USD',
  'USD/JPY', 'AUD/USD', 'USD/CAD', 'US30', 'NAS100',
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

export function ChartPanel({
  chartId,
  symbol,
  timeframe,
  chartType,
  isActive,
  onActivate,
  onClose,
  canClose = true,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const candlesRef = useRef<CandleData[]>([]);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const activeIndicatorsRef = useRef<Map<string, ActiveIndicator>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const isPausedRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  const activeToolRef = useRef<DrawingTool>('cursor');
  const updateChartConfig = useMultiChartStore(s => s.updateChartConfig);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [candleCount, setCandleCount] = useState(0);
  const [changePercent, setChangePercent] = useState<number | null>(null);

  // ── Format price ──
  const formatPrice = (price: number | null): string => {
    if (price === null) return '—';
    if (price > 10000) return price.toFixed(0);
    if (price > 100) return price.toFixed(1);
    if (price > 1) return price.toFixed(2);
    return price.toFixed(5);
  };

  // ── Register Chart Control API for toolbar routing ──
  // This allows the main toolbar to control this chart panel
  // when it's the active chart in multi-chart mode.
  useEffect(() => {
    const controlApi = {
      zoomIn: () => {
        const chart = chartRef.current;
        if (!chart) return;
        const currentSpacing = chart.timeScale().options().barSpacing || 6;
        chart.timeScale().applyOptions({ barSpacing: Math.min(50, currentSpacing + 2) });
      },
      zoomOut: () => {
        const chart = chartRef.current;
        if (!chart) return;
        const currentSpacing = chart.timeScale().options().barSpacing || 6;
        chart.timeScale().applyOptions({ barSpacing: Math.max(2, currentSpacing - 2) });
      },
      resetView: () => {
        try { chartRef.current?.timeScale().fitContent(); } catch {}
      },
      setChartType: (type: ChartType) => {
        updateChartConfig(chartId, { chartType: type });
      },
      setTool: (tool: DrawingTool) => {
        activeToolRef.current = tool;
      },
      togglePause: () => {
        setIsPaused(prev => {
          isPausedRef.current = !prev;
          return !prev;
        });
      },
      get isPaused() { return isPausedRef.current; },
      get activeTool() { return activeToolRef.current; },
      clearDrawings: () => {
        // Clear overlay series
        overlaySeriesRef.current.forEach(series => {
          try { chartRef.current?.removeSeries(series); } catch {}
        });
        overlaySeriesRef.current.clear();
      },
      exportPNG: () => {
        try {
          const canvas = containerRef.current?.querySelector('canvas');
          if (!canvas) return;
          const link = document.createElement('a');
          link.download = `${symbol}_${timeframe}_chart.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        } catch {}
      },
      exportCSV: () => {
        try {
          const candles = candlesRef.current;
          if (!candles.length) return;
          const header = 'Time,Open,High,Low,Close,Volume\n';
          const rows = candles.map(c =>
            `${new Date(c.time * 1000).toISOString()},${c.open},${c.high},${c.low},${c.close},${c.volume}`
          ).join('\n');
          const blob = new Blob([header + rows], { type: 'text/csv' });
          const link = document.createElement('a');
          link.download = `${symbol}_${timeframe}_data.csv`;
          link.href = URL.createObjectURL(blob);
          link.click();
        } catch {}
      },
      exportSVG: () => { /* SVG export not available for canvas-based charts */ },
      toggleFullscreen: () => { /* Handled at parent level */ },
      isFullscreen: false,
      addPriceLine: () => { /* Price lines not supported in panel mode yet */ },
      removePriceLine: () => {},
      setCrosshairMode: (enabled: boolean) => {
        try {
          chartRef.current?.applyOptions({
            crosshair: {
              vertLine: { visible: enabled },
              horzLine: { visible: enabled },
            },
          });
        } catch {}
      },
    };

    registerChartControl(chartId, controlApi);

    return () => {
      unregisterChartControl(chartId);
    };
  }, [chartId, updateChartConfig]);

  // ── WebSocket: Live data ──
  const handleCandleUpdate = useCallback((candle: CandleData) => {
    if (isPausedRef.current) return;
    if (!chartRef.current || !mainSeriesRef.current) return;
    const candles = candlesRef.current;

    // Update or append candle
    if (candles.length > 0 && candles[candles.length - 1].time === candle.time) {
      candles[candles.length - 1] = candle;
    } else if (candles.length > 0 && candle.time > candles[candles.length - 1].time) {
      candles.push(candle);
    }

    // Update series (cast time to UTCTimestamp for lightweight-charts)
    try {
      mainSeriesRef.current.update(candle as any);
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.update({
          time: candle.time as any,
          value: candle.volume,
          color: candle.close >= candle.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
        });
      }
    } catch {}

    setCurrentPrice(candle.close);
    if (candles.length > 1) {
      setPrevPrice(candles[candles.length - 2].close);
      const prev = candles[candles.length - 2].close;
      if (prev > 0) {
        setChangePercent(((candle.close - prev) / prev) * 100);
      }
    }
  }, []);

  const handlePriceUpdate = useCallback((price: number) => {
    if (isPausedRef.current) return;
    setCurrentPrice(prev => {
      if (prev !== null && prev !== price) setPrevPrice(prev);
      return price;
    });
  }, []);

  useChartWebSocket({
    symbol,
    timeframe,
    onCandleUpdate: handleCandleUpdate,
    onPriceUpdate: handlePriceUpdate,
    enabled: !isPaused,
  });

  // ── Create chart + reload on symbol/timeframe/chartType change ──
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    const initChart = async () => {
      try {
        const { createChart, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries } =
          await import('lightweight-charts');

        if (destroyed || !containerRef.current) return;

        // Clean up previous chart if any
        if (chartRef.current) {
          try { chartRef.current.remove(); } catch {}
          chartRef.current = null;
          mainSeriesRef.current = null;
          volumeSeriesRef.current = null;
          overlaySeriesRef.current.clear();
        }

        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const width = rect.width || container.clientWidth || 400;
        const height = rect.height || container.clientHeight || 200;

        const chart = createChart(container, {
          width,
          height,
          layout: {
            background: { color: C.bg },
            textColor: C.textDim,
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            attributionLogo: false,
          },
          grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
          rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.2 } },
          timeScale: {
            borderVisible: false, timeVisible: true, secondsVisible: false,
            rightOffset: 3, barSpacing: 6, minBarSpacing: 2,
          },
          crosshair: {
            mode: 0,
            vertLine: { visible: true, labelVisible: false, color: 'rgba(0,212,255,0.2)' },
            horzLine: { visible: true, labelVisible: true, color: 'rgba(0,212,255,0.2)', labelBackgroundColor: C.card },
          },
          handleScroll: true, handleScale: true,
        });

        // Volume series
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        volumeSeriesRef.current = volumeSeries;

        // Main series based on chart type
        let mainSeries: ISeriesApi<SeriesType>;
        if (chartType === 'line') {
          mainSeries = chart.addSeries(LineSeries, {
            color: C.cyan, lineWidth: 2 as any,
            priceLineVisible: true, lastValueVisible: true,
          });
        } else if (chartType === 'area') {
          mainSeries = chart.addSeries(AreaSeries, {
            topColor: 'rgba(0,212,255,0.3)', bottomColor: 'rgba(0,212,255,0.02)',
            lineColor: C.cyan, lineWidth: 2 as any,
            priceLineVisible: true, lastValueVisible: true,
          });
        } else {
          mainSeries = chart.addSeries(CandlestickSeries, {
            upColor: C.upColor, downColor: C.downColor,
            borderUpColor: C.upColor, borderDownColor: C.downColor,
            wickUpColor: C.upColor, wickDownColor: C.downColor,
          }) as ISeriesApi<SeriesType>;
        }

        // CRITICAL: Disable conflation to prevent candles becoming dots
        try { mainSeries.applyOptions({ enableConflation: false } as any); } catch {}

        chartRef.current = chart;
        mainSeriesRef.current = mainSeries;
        registerChartInstance(chartId, chart, mainSeries);

        // Resize observer
        const observer = new ResizeObserver(entries => {
          for (const entry of entries) {
            const { width: w, height: h } = entry.contentRect;
            if (w > 0 && h > 0) {
              try { chart.applyOptions({ width: w, height: h }); } catch {}
            }
          }
        });
        observer.observe(container);
        resizeObserverRef.current = observer;

        // Load initial data
        setLoading(true);
        setError(null);

        try {
          const url = `/api/exchange/history/${encodeURIComponent(symbol)}?interval=${timeframe}`;
          const res = await fetch(url);
          if (destroyed) return;
          const j = await res.json();

          if (!j.success || !j.data || j.data.length === 0) {
            if (!destroyed) { setError('No data'); setLoading(false); }
            return;
          }

          const candleData: CandleData[] = j.data
            .map((c: any) => ({
              time: Math.floor(new Date(c.timestamp).getTime() / 1000),
              open: Number(c.open) || 0, high: Number(c.high) || 0,
              low: Number(c.low) || 0, close: Number(c.close) || 0,
              volume: Number(c.volume) || 0,
            }))
            .filter((d: CandleData) => !isNaN(d.time) && d.time > 0 && !isNaN(d.close));

          // Deduplicate and sort
          const seen = new Set<number>();
          const unique = candleData.filter(d => {
            if (seen.has(d.time)) return false;
            seen.add(d.time);
            return true;
          });
          unique.sort((a, b) => a.time - b.time);

          if (unique.length === 0) {
            if (!destroyed) { setError('No valid data'); setLoading(false); }
            return;
          }

          candlesRef.current = unique;

          // Cast time for lightweight-charts (number → UTCTimestamp)
          const typedCandles = unique.map(d => ({ ...d, time: d.time as any }));

          if (chartType === 'line' || chartType === 'area') {
            mainSeries.setData(typedCandles.map(d => ({ time: d.time, value: d.close })));
          } else {
            mainSeries.setData(typedCandles as any);
          }

          if (volumeSeries) {
            volumeSeries.setData(typedCandles.map(d => ({
              time: d.time, value: d.volume,
              color: d.close >= d.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
            })));
          }

          chart.timeScale().fitContent();

          const lastPrice = unique[unique.length - 1].close;
          const secondLastPrice = unique.length > 1 ? unique[unique.length - 2].close : null;
          setCurrentPrice(lastPrice);
          setPrevPrice(secondLastPrice);
          setCandleCount(unique.length);
          if (secondLastPrice && secondLastPrice > 0) {
            setChangePercent(((lastPrice - secondLastPrice) / secondLastPrice) * 100);
          }

          if (!destroyed) setLoading(false);

        } catch (err: any) {
          if (!destroyed) { setError(err.message || 'Failed to load'); setLoading(false); }
        }

      } catch (err: any) {
        if (!destroyed) { setError(err.message || 'Failed to create chart'); setLoading(false); }
      }
    };

    initChart();

    return () => {
      destroyed = true;
      unregisterChartInstance(chartId);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
        mainSeriesRef.current = null;
        volumeSeriesRef.current = null;
      }
      overlaySeriesRef.current.clear();
    };
  }, [chartId, symbol, timeframe, chartType]);

  // ── Handle config change from mini-header ──
  const handleSymbolChange = useCallback((newSymbol: string) => {
    updateChartConfig(chartId, { symbol: newSymbol });
  }, [chartId, updateChartConfig]);

  const handleTimeframeChange = useCallback((newTimeframe: string) => {
    updateChartConfig(chartId, { timeframe: newTimeframe });
  }, [chartId, updateChartConfig]);

  // ── Render ──
  const isPositive = changePercent !== null && changePercent >= 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 6,
        border: isActive
          ? '1.5px solid rgba(0,212,255,0.5)'
          : `1px solid ${C.cardBorder}`,
        boxShadow: isActive
          ? '0 0 16px rgba(0,212,255,0.15), inset 0 0 8px rgba(0,212,255,0.05)'
          : 'none',
        background: C.card,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        minHeight: 0,
        cursor: 'default',
      }}
      onMouseDown={onActivate}
    >
      {/* ── Mini Header (28px) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: 28,
        padding: '0 6px',
        borderBottom: `1px solid ${C.cardBorder}`,
        background: isActive ? 'rgba(0,212,255,0.04)' : 'rgba(17,22,32,0.95)',
        flexShrink: 0,
        gap: 4,
        direction: 'ltr',
      }}>
        {/* Symbol selector */}
        <select
          value={symbol}
          onClick={e => e.stopPropagation()}
          onChange={e => handleSymbolChange(e.target.value)}
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
            maxWidth: 90,
            flexShrink: 0,
          }}
        >
          {POPULAR_SYMBOLS.map(p => (
            <option key={p} value={p} style={{ background: C.card, color: C.text }}>{p}</option>
          ))}
        </select>

        {/* Timeframe buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
          {TIMEFRAME_OPTIONS.slice(0, 6).map(tf => {
            const isActiveTf = timeframe === tf.value;
            return (
              <button
                key={tf.value}
                onClick={e => { e.stopPropagation(); handleTimeframeChange(tf.value); }}
                style={{
                  background: isActiveTf ? 'rgba(0,212,255,0.15)' : 'transparent',
                  border: isActiveTf ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
                  borderRadius: 2,
                  color: isActiveTf ? C.cyan : C.textMuted,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 8,
                  fontWeight: isActiveTf ? 700 : 500,
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

        <div style={{ flex: 1 }} />

        {/* Loading spinner */}
        {loading && (
          <div style={{
            width: 10, height: 10,
            border: `2px solid ${C.cardBorder}`,
            borderTopColor: C.cyan,
            borderRadius: '50%',
            animation: 'mcSpin 1s linear infinite',
          }} />
        )}

        {/* Paused indicator */}
        {isPaused && !loading && (
          <span style={{ color: '#fbbf24', fontSize: 8, fontWeight: 700 }}>⏸</span>
        )}

        {/* Price display */}
        {currentPrice !== null && !loading && (
          <>
            <span style={{
              color: C.text,
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {formatPrice(currentPrice)}
            </span>
            {changePercent !== null && (
              <span style={{
                color: isPositive ? C.success : C.danger,
                fontSize: 8,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                padding: '0 3px',
                borderRadius: 2,
                background: isPositive ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
              }}>
                {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
              </span>
            )}
          </>
        )}

        {error && (
          <span style={{ color: C.danger, fontSize: 8, fontWeight: 700 }}>!</span>
        )}

        {/* Close button */}
        {canClose && onClose && (
          <button
            onClick={e => { e.stopPropagation(); onClose(); }}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 2,
              color: C.textMuted,
              width: 18,
              height: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,71,87,0.15)';
              (e.currentTarget as HTMLElement).style.color = C.danger;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
              (e.currentTarget as HTMLElement).style.color = C.textMuted;
            }}
            title="Close chart"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Chart Container ── */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          position: 'relative',
          background: C.bg,
        }}
      />
    </div>
  );
}
