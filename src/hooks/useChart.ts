'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi, SeriesType, Time, DeepPartial, ChartOptions } from 'lightweight-charts';
import type { CandleData, ChartType, ChartSettings, CrosshairData } from '@/lib/chart-types';
import { CHART_COLORS } from '@/lib/chart-types';

interface UseChartOptions {
  symbol: string;
  timeframe: string;
  settings?: Partial<ChartSettings>;
  onCrosshairMove?: (data: CrosshairData | null) => void;
  mobile?: boolean;
}

export function useChart(options: UseChartOptions) {
  const { symbol, timeframe, onCrosshairMove, mobile: isMobile } = options;

  const chartInstanceRef = useRef<IChartApi | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const oscillatorSeriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const candlesRef = useRef<CandleData[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const onCrosshairMoveRef = useRef(onCrosshairMove);
  const markersRef = useRef<any[]>([]);

  const [settings, setSettings] = useState<ChartSettings>({
    type: 'candle',
    showGrid: true,
    showPriceLine: true,
    showVolume: true,
    ...options.settings,
  });

  useEffect(() => {
    onCrosshairMoveRef.current = onCrosshairMove;
  }, [onCrosshairMove]);

  // ── Initialize Chart ──
  const initChart = useCallback(async () => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    // Wait for dimensions
    const waitForDimensions = (el: HTMLElement, maxRetries = 20): Promise<{ w: number; h: number }> => {
      return new Promise((resolve) => {
        const check = (attempt: number) => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (w > 0 && h > 0) { resolve({ w, h }); return; }
          if (attempt >= maxRetries) {
            const parent = el.parentElement;
            resolve({ w: parent?.clientWidth || 800, h: parent?.clientHeight || 400 });
            return;
          }
          requestAnimationFrame(() => check(attempt + 1));
        };
        check(0);
      });
    };

    const { w: initialWidth, h: initialHeight } = await waitForDimensions(container);
    const { createChart, CandlestickSeries, HistogramSeries } = await import('lightweight-charts');

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const chartOptions: DeepPartial<ChartOptions> = {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { color: CHART_COLORS.bg },
        textColor: CHART_COLORS.text2,
        fontSize: isMobile ? 9 : 11,
        fontFamily: "'JetBrains Mono', monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: CHART_COLORS.crosshair, width: 1, style: 2, labelBackgroundColor: CHART_COLORS.card },
        horLine: { color: CHART_COLORS.crosshair, width: 1, style: 2, labelBackgroundColor: CHART_COLORS.card },
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.cardBorder,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: CHART_COLORS.cardBorder,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      handleScroll: { vertTouchDrag: false },
    };

    const chart = createChart(container, chartOptions);
    chartInstanceRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.upColor,
      downColor: CHART_COLORS.downColor,
      borderUpColor: CHART_COLORS.upColor,
      borderDownColor: CHART_COLORS.downColor,
      wickUpColor: CHART_COLORS.upWick,
      wickDownColor: CHART_COLORS.downWick,
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volumeSeriesRef.current = volumeSeries;

    // Crosshair handler with null safety
    chart.subscribeCrosshairMove((param: any) => {
      if (!param.time || !param.point) {
        onCrosshairMoveRef.current?.(null);
        return;
      }
      const candleData = param.seriesData.get(candleSeries) as any;
      if (!candleData) { onCrosshairMoveRef.current?.(null); return; }

      const safeNum = (v: any, fallback: number = 0): number =>
        (v !== null && v !== undefined && !isNaN(v)) ? Number(v) : fallback;

      const candles = candlesRef.current;
      const candleIdx = candles.findIndex(c => c.time === param.time);
      const prevClose = candleIdx > 0 ? candles[candleIdx - 1].close : safeNum(candleData.close);
      const close = safeNum(candleData.close);
      const change = close - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

      const d = new Date((param.time as number) * 1000);
      const dateStr = d.toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      onCrosshairMoveRef.current?.({
        time: param.time as number,
        open: safeNum(candleData.open, candleData.value ?? 0),
        high: safeNum(candleData.high, candleData.value ?? 0),
        low: safeNum(candleData.low, candleData.value ?? 0),
        close: safeNum(candleData.close, candleData.value ?? 0),
        volume: safeNum(candleData.volume, 0),
        change,
        changePercent,
        dateStr,
      });
    });

    // Resize observer
    if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
    const ro = new ResizeObserver(entries => {
      if (chart && entries[0]) {
        chart.applyOptions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height,
        });
      }
    });
    ro.observe(container);
    resizeObserverRef.current = ro;

    // Window resize fallback
    const handleWindowResize = () => {
      if (chart && containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
      }
    };
    window.addEventListener('resize', handleWindowResize);
  }, []);

  useEffect(() => {
    initChart().catch(e => console.error('[useChart] init failed:', e));
    return () => {
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
      if (chartInstanceRef.current) { chartInstanceRef.current.remove(); chartInstanceRef.current = null; }
    };
  }, [initChart]);

  // Handle symbol change: clear all series data
  useEffect(() => {
    overlaySeriesRef.current.forEach(s => { try { chartInstanceRef.current?.removeSeries(s); } catch {} });
    overlaySeriesRef.current.clear();
    oscillatorSeriesRef.current.forEach(s => { try { chartInstanceRef.current?.removeSeries(s); } catch {} });
    oscillatorSeriesRef.current.clear();
    candlesRef.current = [];
    try {
      candleSeriesRef.current?.setData([] as any);
      volumeSeriesRef.current?.setData([] as any);
    } catch {}
  }, [symbol]);

  // FIX: Handle timeframe change — clear all indicator series to prevent "Value is null"
  useEffect(() => {
    overlaySeriesRef.current.forEach(s => { try { chartInstanceRef.current?.removeSeries(s); } catch {} });
    overlaySeriesRef.current.clear();
    oscillatorSeriesRef.current.forEach(s => { try { chartInstanceRef.current?.removeSeries(s); } catch {} });
    oscillatorSeriesRef.current.clear();
    candlesRef.current = [];
    try {
      candleSeriesRef.current?.setData([] as any);
      volumeSeriesRef.current?.setData([] as any);
    } catch {}
    markersRef.current = [];
  }, [timeframe]);

  // Set candles
  const setCandles = useCallback((candles: CandleData[]) => {
    candlesRef.current = candles;
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const chartData = sorted.map(c => ({
      time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    const volumeData = sorted.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
    }));

    try {
      candleSeriesRef.current.setData(chartData as any);
      volumeSeriesRef.current.setData(volumeData as any);
    } catch (e) {
      console.error('[useChart] setCandles error:', e);
    }
  }, []);

  const updateLastCandle = useCallback((price: number) => {
    if (!candleSeriesRef.current || !candlesRef.current.length) return;
    const candles = candlesRef.current;
    const last = candles[candles.length - 1];
    const updated = { ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) };
    candlesRef.current = [...candles.slice(0, -1), updated];
    candleSeriesRef.current.update({
      time: updated.time as Time, open: updated.open, high: updated.high, low: updated.low, close: updated.close,
    } as any);
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.update({
        time: last.time as Time, value: last.volume,
        color: updated.close >= updated.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
      } as any);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  return {
    chartRef: chartInstanceRef,
    containerRef,
    settings,
    setCandles,
    updateLastCandle,
    toggleFullscreen,
  };
}
