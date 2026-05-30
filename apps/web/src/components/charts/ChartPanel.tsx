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
// - Position/Trade price lines (entry/SL/TP)
// - Trade overlay labels with fill zones
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
import { usePositionsStore } from '@/hooks/usePositionsStore';
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore';

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

// Helper: Normalize symbol for matching positions
const normalizeSymbol = (s: string) => s.toUpperCase().replace(/[/\-_]/g, '');

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

  // ── Position/Trade Overlay State ──
  const positions = usePositionsStore(s => s.positions);
  const paperTrades = usePaperTradesStore(s => s.trades);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const paperTradesRef = useRef(paperTrades);
  paperTradesRef.current = paperTrades;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  interface TradeOverlay {
    key: string;
    y: number;
    price: number;
    type: 'entry' | 'sl' | 'tp';
    direction: 'long' | 'short';
    source: 'manual' | 'bot' | 'exchange';
    qty: number;
    pnl?: number;
  }

  const [tradeOverlays, setTradeOverlays] = useState<TradeOverlay[]>([]);
  const [fillZones, setFillZones] = useState<Array<{
    top: number; height: number; type: 'sl' | 'tp'; key: string;
  }>>([]);

  // rAF deduplication
  const rafIdRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  // Price line IDs for cleanup
  const positionLineIdsRef = useRef<string[]>([]);

  // ── Format price ──
  const formatPrice = (price: number | null): string => {
    if (price === null) return '—';
    if (price > 10000) return price.toFixed(0);
    if (price > 100) return price.toFixed(1);
    if (price > 1) return price.toFixed(2);
    return price.toFixed(5);
  };

  // ── Recalculate overlay positions ──
  const scheduleOverlayUpdate = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      if (!isMountedRef.current) return;
      const chart = chartRef.current;
      if (!chart) return;

      const chartSymbol = normalizeSymbol(symbolRef.current);
      const overlays: TradeOverlay[] = [];
      const zones: typeof fillZones = [];

      const processTrade = (
        entryPrice: number, direction: 'long' | 'short',
        sl?: number, tp?: number, qty = 0, pnl?: number,
        source: 'manual' | 'bot' | 'exchange' = 'manual', prefix = ''
      ) => {
        const entryY = chart.getPriceCoordinate(entryPrice);
        const slY = sl && sl > 0 ? chart.getPriceCoordinate(sl) : null;
        const tpY = tp && tp > 0 ? chart.getPriceCoordinate(tp) : null;

        if (entryY !== null) {
          overlays.push({ key: `${prefix}entry`, y: entryY, price: entryPrice, type: 'entry', direction, source, qty, pnl });
        }
        if (slY !== null) {
          overlays.push({ key: `${prefix}sl`, y: slY, price: sl!, type: 'sl', direction, source, qty });
        }
        if (tpY !== null) {
          overlays.push({ key: `${prefix}tp`, y: tpY, price: tp!, type: 'tp', direction, source, qty });
        }

        if (slY !== null && entryY !== null) {
          zones.push({ top: Math.min(entryY, slY), height: Math.abs(entryY - slY), type: 'sl', key: `${prefix}sl-zone` });
        }
        if (tpY !== null && entryY !== null) {
          zones.push({ top: Math.min(entryY, tpY), height: Math.abs(entryY - tpY), type: 'tp', key: `${prefix}tp-zone` });
        }
      };

      // Exchange positions
      positionsRef.current.forEach(pos => {
        const posSymbol = normalizeSymbol(pos.symbol || '');
        if (!posSymbol.includes(chartSymbol) && !chartSymbol.includes(posSymbol)) return;
        const entryPrice = Number(pos.entryPrice || pos.avgEntryPrice || 0);
        if (entryPrice <= 0) return;
        const slVal = Number(pos.stopLoss || pos.sl || 0);
        const tpVal = Number(pos.takeProfit || pos.tp || 0);
        processTrade(
          entryPrice,
          (pos.side || '').toLowerCase() === 'long' ? 'long' : 'short',
          slVal > 0 ? slVal : undefined,
          tpVal > 0 ? tpVal : undefined,
          pos.qty || 0, undefined, 'exchange',
          `pos-${pos.id}-`
        );
      });

      // Paper trades (grouped)
      const groupedPaper = new Map<string, any>();
      paperTradesRef.current.forEach(trade => {
        const tradeSymbol = normalizeSymbol(trade.symbol || '');
        if (!tradeSymbol.includes(chartSymbol) && !chartSymbol.includes(tradeSymbol)) return;
        const entryPrice = Number(trade.entryPrice || 0);
        if (entryPrice <= 0) return;
        const key = `${trade.side}-${entryPrice}-${trade.sl}-${trade.tp}`;
        if (groupedPaper.has(key)) {
          groupedPaper.get(key)!.qty += trade.qty || 0;
          groupedPaper.get(key)!.unrealizedPnl += trade.unrealizedPnl || 0;
          groupedPaper.get(key)!.count += 1;
        } else {
          groupedPaper.set(key, { ...trade, count: 1, qty: trade.qty || 0, unrealizedPnl: trade.unrealizedPnl || 0 });
        }
      });

      groupedPaper.forEach((trade, key) => {
        processTrade(
          Number(trade.entryPrice || 0),
          (trade.side || '').toLowerCase() === 'long' ? 'long' : 'short',
          trade.sl ? Number(trade.sl) : undefined,
          trade.tp ? Number(trade.tp) : undefined,
          trade.qty || 0, trade.unrealizedPnl,
          trade.source === 'bot' ? 'bot' : 'manual',
          `trade-grp-${key}-`
        );
      });

      setTradeOverlays(overlays);
      setFillZones(zones);
    });
  }, []);

  // ── Subscribe to chart scroll/zoom for overlay recalc ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const unsubscribe = chart.onVisibleRangeChange(scheduleOverlayUpdate);
    const timer = setTimeout(scheduleOverlayUpdate, 200);
    const priceScaleInterval = setInterval(scheduleOverlayUpdate, 2000);

    return () => { unsubscribe(); clearTimeout(timer); clearInterval(priceScaleInterval); };
  }, [scheduleOverlayUpdate, chartRef.current]);

  // ── Re-calculate overlays when trades change ──
  useEffect(() => {
    scheduleOverlayUpdate();
  }, [positions, paperTrades, scheduleOverlayUpdate]);

  // ── Apply Position Price Lines to Chart ──
  useEffect(() => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;

    // Remove old lines
    positionLineIdsRef.current.forEach(id => {
      try { series.removePriceLine(id as any); } catch {}
    });
    positionLineIdsRef.current = [];

    const chartSymbol = normalizeSymbol(symbol);
    const addLine = (id: string, price: number, color: string, label: string = '', lineWidth: number = 1, lineStyle: number = 2, axisLabelVisible: boolean = true) => {
      try {
        const priceLine = series.createPriceLine({
          price,
          color,
          lineWidth: lineWidth as any,
          lineStyle: lineStyle as any,
          axisLabelVisible,
          title: label,
        });
        positionLineIdsRef.current.push(id);
      } catch {}
    };

    // Exchange positions
    positions.forEach(pos => {
      const posSymbol = normalizeSymbol(pos.symbol || '');
      if (!posSymbol.includes(chartSymbol) && !chartSymbol.includes(posSymbol)) return;
      const entryPrice = Number(pos.entryPrice || pos.avgEntryPrice || 0);
      const isLong = (pos.side || '').toLowerCase() === 'long';
      if (entryPrice > 0) {
        addLine(`pos-entry-${pos.id || posSymbol}`, entryPrice, '#00D4FF', isLong ? '▲ Entry' : '▼ Entry', 2, 2, true);
      }
      const sl = Number(pos.stopLoss || pos.sl || 0);
      if (sl > 0) {
        addLine(`pos-sl-${pos.id || posSymbol}`, sl, '#FF4757', `SL ${sl.toFixed(sl > 10 ? 2 : 5)}`, 1, 2, true);
      }
      const tp = Number(pos.takeProfit || pos.tp || 0);
      if (tp > 0) {
        addLine(`pos-tp-${pos.id || posSymbol}`, tp, '#00FFA3', `TP ${tp.toFixed(tp > 10 ? 2 : 5)}`, 1, 2, true);
      }
    });

    // Paper trades (grouped)
    const groupedLines = new Map<string, any>();
    paperTrades.forEach(trade => {
      const tradeSymbol = normalizeSymbol(trade.symbol || '');
      if (!tradeSymbol.includes(chartSymbol) && !chartSymbol.includes(tradeSymbol)) return;
      const entryPrice = Number(trade.entryPrice || 0);
      if (entryPrice <= 0) return;
      const key = `${trade.side}-${entryPrice}-${trade.sl}-${trade.tp}`;
      if (groupedLines.has(key)) {
        groupedLines.get(key)!.count += 1;
      } else {
        groupedLines.set(key, { ...trade, count: 1 });
      }
    });

    groupedLines.forEach((trade, key) => {
      const entryPrice = Number(trade.entryPrice || 0);
      const isLong = (trade.side || '').toLowerCase() === 'long';
      const qty = Number(trade.qty || 1);

      addLine(`trade-entry-grp-${key}`, entryPrice, '#00D4FF', isLong ? '▲ Entry' : '▼ Entry', 2, 2, true);
      if (trade.sl && Number(trade.sl) > 0) {
        const slP = ((Number(trade.sl) - entryPrice) * qty * (isLong ? 1 : -1));
        addLine(`trade-sl-grp-${key}`, Number(trade.sl), '#FF4757', `SL ${slP > 0 ? '+' : ''}${slP.toFixed(2)}$`, 1, 2, true);
      }
      if (trade.tp && Number(trade.tp) > 0) {
        const tpP = ((Number(trade.tp) - entryPrice) * qty * (isLong ? 1 : -1));
        addLine(`trade-tp-grp-${key}`, Number(trade.tp), '#00FFA3', `TP ${tpP > 0 ? '+' : ''}${tpP.toFixed(2)}$`, 1, 2, true);
      }
    });

    return () => {
      positionLineIdsRef.current.forEach(id => {
        try { series.removePriceLine(id as any); } catch {}
      });
      positionLineIdsRef.current = [];
    };
  }, [positions, paperTrades, symbol, chartRef.current, mainSeriesRef.current]);

  // ── Mount guard ──
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; cancelAnimationFrame(rafIdRef.current); };
  }, []);

  // ── Register Chart Control API for toolbar routing ──
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
      exportSVG: () => {},
      toggleFullscreen: () => {},
      isFullscreen: false,
      addPriceLine: (id: string, price: number, color: string, label: string, lineWidth?: number, lineStyle?: number, axisLabelVisible?: boolean) => {
        const series = mainSeriesRef.current;
        if (!series) return;
        try {
          series.createPriceLine({
            price,
            color,
            lineWidth: (lineWidth || 1) as any,
            lineStyle: (lineStyle || 2) as any,
            axisLabelVisible: axisLabelVisible !== false,
            title: label,
          });
          positionLineIdsRef.current.push(id);
        } catch {}
      },
      removePriceLine: (id: string) => {
        const series = mainSeriesRef.current;
        if (!series) return;
        try { series.removePriceLine(id as any); } catch {}
        positionLineIdsRef.current = positionLineIdsRef.current.filter(i => i !== id);
      },
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
  }, [chartId, updateChartConfig, symbol, timeframe]);

  // ── WebSocket: Live data ──
  const handleCandleUpdate = useCallback((candle: CandleData) => {
    if (isPausedRef.current) return;
    if (!chartRef.current || !mainSeriesRef.current) return;
    const candles = candlesRef.current;

    if (candles.length > 0 && candles[candles.length - 1].time === candle.time) {
      candles[candles.length - 1] = candle;
    } else if (candles.length > 0 && candle.time > candles[candles.length - 1].time) {
      candles.push(candle);
    }

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

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        volumeSeriesRef.current = volumeSeries;

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

        try { mainSeries.applyOptions({ enableConflation: false } as any); } catch {}

        chartRef.current = chart;
        mainSeriesRef.current = mainSeries;
        registerChartInstance(chartId, chart, mainSeries);

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
      positionLineIdsRef.current = [];
    };
  }, [chartId, symbol, timeframe, chartType]);

  const handleSymbolChange = useCallback((newSymbol: string) => {
    updateChartConfig(chartId, { symbol: newSymbol });
  }, [chartId, updateChartConfig]);

  const handleTimeframeChange = useCallback((newTimeframe: string) => {
    updateChartConfig(chartId, { timeframe: newTimeframe });
  }, [chartId, updateChartConfig]);

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

        {loading && (
          <div style={{
            width: 10, height: 10,
            border: `2px solid ${C.cardBorder}`,
            borderTopColor: C.cyan,
            borderRadius: '50%',
            animation: 'mcSpin 1s linear infinite',
          }} />
        )}

        {isPaused && !loading && (
          <span style={{ color: '#fbbf24', fontSize: 8, fontWeight: 700 }}>⏸</span>
        )}

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

      {/* ── Chart Container with Trade Overlays ── */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          position: 'relative',
          background: C.bg,
        }}
      >
        {/* ── Fill Zones (SL/TP bands) ── */}
        {fillZones.map(zone => (
          <div
            key={zone.key}
            style={{
              position: 'absolute',
              top: zone.top,
              left: 0,
              right: 0,
              height: Math.max(zone.height, 1),
              background: zone.type === 'sl' ? 'rgba(248,81,73,0.08)' : 'rgba(63,185,80,0.08)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        ))}

        {/* ── Trade Overlay Labels ── */}
        {tradeOverlays.map(overlay => {
          const isEntry = overlay.type === 'entry';
          const isSL = overlay.type === 'sl';
          const isTP = overlay.type === 'tp';
          const color = isEntry ? '#00D4FF' : isSL ? '#FF4757' : '#00FFA3';
          const bgColor = isEntry ? 'rgba(0,212,255,0.15)' : isSL ? 'rgba(248,81,73,0.15)' : 'rgba(0,255,163,0.15)';
          const label = isEntry
            ? `${overlay.direction === 'long' ? '▲' : '▼'} ${overlay.qty}`
            : isSL ? 'SL' : 'TP';

          return (
            <div
              key={overlay.key}
              style={{
                position: 'absolute',
                top: overlay.y - 7,
                left: 4,
                zIndex: 5,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <span style={{
                fontSize: 7,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color,
                background: bgColor,
                padding: '1px 4px',
                borderRadius: 2,
                whiteSpace: 'nowrap',
                lineHeight: '12px',
              }}>
                {label} {overlay.price > 999 ? overlay.price.toFixed(2) : overlay.price.toFixed(5)}
                {overlay.pnl !== undefined && overlay.pnl !== 0 && (
                  <span style={{ color: overlay.pnl >= 0 ? '#00FFA3' : '#FF4757', marginLeft: 2 }}>
                    {overlay.pnl >= 0 ? '+' : ''}{overlay.pnl.toFixed(1)}$
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
