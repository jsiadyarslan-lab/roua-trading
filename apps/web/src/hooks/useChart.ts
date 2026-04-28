// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Main Chart Hook
// Creates and manages the lightweight-charts v5 instance
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi, SeriesType, Time, MouseEventParams, DeepPartial, ChartOptions } from 'lightweight-charts';
import type {
  CandleData, ChartType, ActiveIndicator, Drawing, DrawingTool,
  ChartSettings, CrosshairData, SeriesHandle
} from '../lib/charts/types';
import { toHeikinAshi } from '../lib/charts/IndicatorCalculator';
import { DrawingManager } from '../lib/charts/DrawingManager';
import { DrawingRenderer } from '../lib/charts/DrawingRenderer';
import { KeyboardShortcuts } from '../lib/charts/KeyboardShortcuts';
import { ChartExporter } from '../lib/charts/ChartExporter';
import { ChartTemplateManager } from '../lib/charts/ChartTemplate';

interface UseChartOptions {
  symbol: string;
  timeframe: string;
  settings?: Partial<ChartSettings>;
  onCrosshairMove?: (data: CrosshairData | null) => void;
}

interface UseChartReturn {
  chartRef: React.RefObject<IChartApi | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  settings: ChartSettings;
  updateSettings: (updates: Partial<ChartSettings>) => void;
  setCandles: (candles: CandleData[]) => void;
  updateLastCandle: (price: number) => void;
  addIndicator: (indicator: ActiveIndicator) => void;
  removeIndicator: (key: string) => void;
  getActiveIndicators: () => ActiveIndicator[];
  setChartType: (type: ChartType) => void;
  addDrawing: (tool: DrawingTool, points: { time: number; price: number }[]) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: () => void;
  getDrawings: () => Drawing[];
  setTool: (tool: DrawingTool) => void;
  activeTool: DrawingTool;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  exportPNG: () => void;
  exportCSV: () => void;
  exportSVG: () => void;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
  isPaused: boolean;
  togglePause: () => void;
  saveTemplate: (name: string) => void;
  loadTemplate: (id: string) => void;
  getTemplates: () => any[];
  currentTool: DrawingTool;
  cancelDrawing: () => void;
}

export function useChart(options: UseChartOptions): UseChartReturn {
  const { symbol, timeframe, onCrosshairMove } = options;

  // ── Refs ───────────────────────────────────────────────
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const oscillatorSeriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const candlesRef = useRef<CandleData[]>([]);
  const drawingManagerRef = useRef<DrawingManager | null>(null);
  const drawingRendererRef = useRef<DrawingRenderer | null>(null);
  const shortcutsRef = useRef<KeyboardShortcuts | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // ── State ──────────────────────────────────────────────
  const [settings, setSettings] = useState<ChartSettings>({
    type: 'candle',
    showGrid: true,
    showPriceLine: true,
    showVolume: true,
    showSessions: true,
    showCandleTimer: true,
    crosshairType: 'cross',
    upColor: '#3fb950',
    downColor: '#f85149',
    bgColor: '#0B0E14',
    gridColor: 'rgba(42,49,60,0.5)',
    ...options.settings,
  });

  const [activeIndicators, setActiveIndicators] = useState<Map<string, ActiveIndicator>>(new Map());
  const [activeTool, setActiveTool] = useState<DrawingTool>('cursor');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // ── Chart Colors ───────────────────────────────────────
  const COLORS = {
    bg: '#0B0E14',
    card: '#151A22',
    border: '#2A313C',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    grid: 'rgba(42,49,60,0.5)',
    crosshair: 'rgba(160,200,220,0.3)',
    upColor: '#3fb950',
    downColor: '#f85149',
    upWick: '#3fb950',
    downWick: '#f85149',
  };

  // ── Initialize Chart ───────────────────────────────────
  const initChart = useCallback(async () => {
    if (!containerRef.current) return;

    // Dynamic import lightweight-charts v5
    const { createChart, CandlestickSeries, HistogramSeries } = await import('lightweight-charts');

    // Destroy existing chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = containerRef.current;

    const chartOptions: DeepPartial<ChartOptions> = {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: COLORS.bg },
        textColor: COLORS.textSecondary,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      crosshair: {
        mode: 0, // Normal
        vertLine: {
          color: COLORS.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: '#151A22',
        },
        horzLine: {
          color: COLORS.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: '#151A22',
        },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      handleScroll: { vertTouchDrag: false },
    };

    const chart = createChart(container, chartOptions);
    chartInstanceRef.current = chart;

    // ── Candlestick Series ──
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.upColor,
      downColor: COLORS.downColor,
      borderUpColor: COLORS.upColor,
      borderDownColor: COLORS.downColor,
      wickUpColor: COLORS.upWick,
      wickDownColor: COLORS.downWick,
    });
    candleSeriesRef.current = candleSeries;

    // ── Volume Series ──
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // ── Crosshair Move Handler ──
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param.time || !param.point || !onCrosshairMove) {
        onCrosshairMove?.(null);
        return;
      }

      const candleData = param.seriesData.get(candleSeries) as any;
      if (!candleData) {
        onCrosshairMove?.(null);
        return;
      }

      const candles = candlesRef.current;
      const candleIdx = candles.findIndex(c => c.time === param.time);
      const prevClose = candleIdx > 0 ? candles[candleIdx - 1].close : candleData.close;
      const change = candleData.close - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

      const d = new Date((param.time as number) * 1000);
      const dateStr = d.toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      onCrosshairMove({
        time: param.time as number,
        open: candleData.open,
        high: candleData.high,
        low: candleData.low,
        close: candleData.close,
        volume: candleData.volume || 0,
        change,
        changePercent,
        dateStr,
      });
    });

    // ── Resize Observer ──
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }
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

    // ── Init Drawing Manager ──
    if (!drawingManagerRef.current) {
      drawingManagerRef.current = new DrawingManager(symbol);
    } else {
      drawingManagerRef.current.setSymbol(symbol);
    }

    // ── Init Drawing Renderer ──
    if (drawingRendererRef.current) {
      drawingRendererRef.current.stop();
    }
    if (drawingManagerRef.current && candleSeriesRef.current) {
      const renderer = new DrawingRenderer(
        chart,
        candleSeriesRef.current,
        container,
        drawingManagerRef.current,
      );
      renderer.setTool(activeTool);
      renderer.start();
      drawingRendererRef.current = renderer;
    }

    // ── Init Keyboard Shortcuts ──
    if (!shortcutsRef.current) {
      shortcutsRef.current = new KeyboardShortcuts({
        togglePlayPause: () => setIsPaused(p => !p),
        zoomIn: () => chart.timeScale().applyOptions({ barSpacing: Math.min(50, (chart.timeScale().options().barSpacing || 8) + 2) }),
        zoomOut: () => chart.timeScale().applyOptions({ barSpacing: Math.max(2, (chart.timeScale().options().barSpacing || 8) - 2) }),
        setTool: (tool) => setActiveTool(tool),
        saveChart: () => ChartTemplateManager.save(
          'auto-save',
          settings,
          Array.from(activeIndicators.values()),
          drawingManagerRef.current?.getAll() || [],
          timeframe,
          settings.type
        ),
        cancelDrawing: () => setActiveTool('cursor'),
        toggleFullscreen: () => setIsFullscreen(f => !f),
      });
      shortcutsRef.current.attach();
    }

  }, [symbol, onCrosshairMove]);

  // ── Initialize on mount ────────────────────────────────
  useEffect(() => {
    initChart();
    return () => {
      if (drawingRendererRef.current) {
        drawingRendererRef.current.stop();
        drawingRendererRef.current = null;
      }
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (shortcutsRef.current) {
        shortcutsRef.current.detach();
      }
    };
  }, [initChart]);

  // ── Re-init on symbol change ───────────────────────────
  useEffect(() => {
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setSymbol(symbol);
    }
    // Redraw renderer for new symbol's drawings
    drawingRendererRef.current?.redraw();
    // Clear overlay series when symbol changes
    overlaySeriesRef.current.forEach((series) => {
      chartInstanceRef.current?.removeSeries(series);
    });
    overlaySeriesRef.current.clear();
  }, [symbol]);

  // ── Set Candles ────────────────────────────────────────
  const setCandles = useCallback((candles: CandleData[]) => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    candlesRef.current = candles;

    // Apply Heikin-Ashi if needed
    const displayCandles = settings.type === 'heikin-ashi' ? toHeikinAshi(candles) : candles;

    // Format for lightweight-charts (time must be Time)
    const chartData = displayCandles.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = candles.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
    }));

    candleSeriesRef.current.setData(chartData as any);
    volumeSeriesRef.current.setData(volumeData as any);

    // Re-apply indicators
    activeIndicators.forEach((ind) => {
      // Will be recalculated in addIndicator
    });
  }, [settings.type]);

  // ── Update Last Candle (live tick) ─────────────────────
  const updateLastCandle = useCallback((price: number) => {
    if (isPaused || !candleSeriesRef.current || !candlesRef.current.length) return;

    const candles = candlesRef.current;
    const last = candles[candles.length - 1];
    const updated = { ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) };
    candles[candles.length - 1] = updated;
    candlesRef.current = candles;

    const displayCandles = settings.type === 'heikin-ashi' ? toHeikinAshi(candles) : candles;
    const lastDisplay = displayCandles[displayCandles.length - 1];

    candleSeriesRef.current.update({
      time: lastDisplay.time as Time,
      open: lastDisplay.open,
      high: lastDisplay.high,
      low: lastDisplay.low,
      close: lastDisplay.close,
    } as any);

    // Update volume
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.update({
        time: last.time as Time,
        value: last.volume,
        color: last.close >= last.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
      } as any);
    }
  }, [isPaused, settings.type]);

  // ── Add Indicator ──────────────────────────────────────
  const addIndicator = useCallback(async (indicator: ActiveIndicator) => {
    const chart = chartInstanceRef.current;
    if (!chart || !candlesRef.current.length) return;

    setActiveIndicators(prev => {
      const next = new Map(prev);
      next.set(indicator.key, indicator);
      return next;
    });

    // Remove existing series for this indicator (could be multiple series)
    const existingKeys = Array.from(overlaySeriesRef.current.keys()).filter(k => k.startsWith(indicator.key));
    existingKeys.forEach(k => {
      const s = overlaySeriesRef.current.get(k);
      if (s) { chart.removeSeries(s); overlaySeriesRef.current.delete(k); }
    });
    const existingOscKeys = Array.from(oscillatorSeriesRef.current.keys()).filter(k => k.startsWith(indicator.key));
    existingOscKeys.forEach(k => {
      const s = oscillatorSeriesRef.current.get(k);
      if (s) { chart.removeSeries(s); oscillatorSeriesRef.current.delete(k); }
    });

    // Calculate indicator data
    const { calculateIndicator } = await import('../lib/charts/IndicatorCalculator');
    const results = await calculateIndicator(indicator, candlesRef.current);
    if (!results.length) return;

    const { LineSeries, AreaSeries, HistogramSeries: LCHistogram } = await import('lightweight-charts');

    // ── Helper: add overlay line series ──
    const addOverlayLine = (key: string, data: { time: Time; value: number }[], color: string, lineWidth: number = 1, priceLineVisible = false) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: lineWidth as any,
        priceLineVisible,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      });
      series.setData(data as any);
      overlaySeriesRef.current.set(key, series);
    };

    // ── Helper: add oscillator sub-panel series ──
    const addOscillatorLine = (key: string, data: { time: Time; value: number }[], color: string, scaleId: string, lineWidth: number = 1) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: lineWidth as any,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceScaleId: scaleId,
      });
      series.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        borderVisible: false,
      });
      series.setData(data as any);
      oscillatorSeriesRef.current.set(key, series);
    };

    // ════════════════════════════════════════════════════════
    // OVERLAY INDICATORS
    // ════════════════════════════════════════════════════════

    if (indicator.key === 'sma' || indicator.key === 'ema' || indicator.key === 'vwap') {
      const data = results.map((r: any) => {
        const val = r.values?.[indicator.key] ?? r.value;
        return val !== null ? { time: r.time as Time, value: val } : null;
      }).filter(Boolean);
      addOverlayLine(indicator.key, data, indicator.color);
    }

    else if (indicator.key === 'supertrend') {
      // SuperTrend: one line, green when up, red when down
      const upData: { time: Time; value: number }[] = [];
      const downData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        const val = r.value;
        const dir = r.direction;
        if (val === null || val === undefined) return;
        if (dir === 'up') {
          upData.push({ time: r.time as Time, value: val });
        } else {
          downData.push({ time: r.time as Time, value: val });
        }
      });
      addOverlayLine('supertrend-up', upData, '#3fb950', 2);
      addOverlayLine('supertrend-down', downData, '#f85149', 2);
    }

    else if (indicator.key === 'bb') {
      // Bollinger Bands: upper, middle, lower + fill
      const upperData: { time: Time; value: number }[] = [];
      const middleData: { time: Time; value: number }[] = [];
      const lowerData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        if (r.upper !== null && r.upper !== undefined) upperData.push({ time: r.time as Time, value: r.upper });
        if (r.middle !== null && r.middle !== undefined) middleData.push({ time: r.time as Time, value: r.middle });
        if (r.lower !== null && r.lower !== undefined) lowerData.push({ time: r.time as Time, value: r.lower });
      });
      addOverlayLine('bb-upper', upperData, 'rgba(88,166,255,0.5)');
      addOverlayLine('bb-middle', middleData, 'rgba(88,166,255,0.3)');
      addOverlayLine('bb-lower', lowerData, 'rgba(88,166,255,0.5)');

      // Fill area between upper and lower
      const fillArea = chart.addSeries(AreaSeries, {
        topColor: 'rgba(88,166,255,0.08)',
        bottomColor: 'rgba(88,166,255,0.02)',
        lineWidth: 0 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      // Use lower band as the area base
      fillArea.setData(lowerData as any);
      overlaySeriesRef.current.set('bb-fill', fillArea);
    }

    else if (indicator.key === 'psar') {
      // Parabolic SAR: dots (use LineSeries with point markers)
      const psarData: { time: Time; value: number; color?: string }[] = [];
      results.forEach((r: any) => {
        const val = r.values?.psar;
        if (val !== null && val !== undefined) {
          // Determine color based on SAR position relative to candle
          const candleIdx = candlesRef.current.findIndex(c => c.time === r.time);
          const candle = candleIdx >= 0 ? candlesRef.current[candleIdx] : null;
          const isBullish = candle ? val < candle.close : true;
          psarData.push({ time: r.time as Time, value: val, color: isBullish ? '#3fb950' : '#f85149' });
        }
      });

      // Split into bullish and bearish dots
      const bullData = psarData.filter(d => d.color === '#3fb950').map(d => ({ time: d.time, value: d.value }));
      const bearData = psarData.filter(d => d.color === '#f85149').map(d => ({ time: d.time, value: d.value }));

      const bullSeries = chart.addSeries(LineSeries, {
        color: '#3fb950',
        lineWidth: 0 as any,
        pointMarkersVisible: true,
        pointMarkersRadius: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      bullSeries.setData(bullData as any);
      overlaySeriesRef.current.set('psar-bull', bullSeries);

      const bearSeries = chart.addSeries(LineSeries, {
        color: '#f85149',
        lineWidth: 0 as any,
        pointMarkersVisible: true,
        pointMarkersRadius: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      bearSeries.setData(bearData as any);
      overlaySeriesRef.current.set('psar-bear', bearSeries);
    }

    else if (indicator.key === 'ichimoku') {
      // Ichimoku: 5 lines + cloud
      const tenkanData: { time: Time; value: number }[] = [];
      const kijunData: { time: Time; value: number }[] = [];
      const senkouAData: { time: Time; value: number }[] = [];
      const senkouBData: { time: Time; value: number }[] = [];
      const chikouData: { time: Time; value: number }[] = [];

      results.forEach((r: any) => {
        if (r.tenkan !== null) tenkanData.push({ time: r.time as Time, value: r.tenkan });
        if (r.kijun !== null) kijunData.push({ time: r.time as Time, value: r.kijun });
        if (r.senkouA !== null) senkouAData.push({ time: r.time as Time, value: r.senkouA });
        if (r.senkouB !== null) senkouBData.push({ time: r.time as Time, value: r.senkouB });
        if (r.chikou !== null) chikouData.push({ time: r.time as Time, value: r.chikou });
      });

      addOverlayLine('ichimoku-tenkan', tenkanData, '#2dd4bf', 1);
      addOverlayLine('ichimoku-kijun', kijunData, '#f87171', 1);
      addOverlayLine('ichimoku-senkouA', senkouAData, 'rgba(45,212,191,0.4)', 1);
      addOverlayLine('ichimoku-senkouB', senkouBData, 'rgba(248,113,113,0.4)', 1);
      addOverlayLine('ichimoku-chikou', chikouData, 'rgba(255,255,255,0.3)', 1);

      // Cloud fill (use AreaSeries for senkouA as the cloud top)
      const cloudFill = chart.addSeries(AreaSeries, {
        topColor: 'rgba(45,212,191,0.06)',
        bottomColor: 'rgba(248,113,113,0.03)',
        lineWidth: 0 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      cloudFill.setData(senkouAData as any);
      overlaySeriesRef.current.set('ichimoku-cloud', cloudFill);
    }

    else if (indicator.key === 'pivot') {
      // Pivot Points: horizontal lines (PP, R1-R3, S1-S3)
      const lastCandle = candlesRef.current[candlesRef.current.length - 1];
      if (!lastCandle) return;
      const pivotResult = results[results.length - 1] as any;
      if (!pivotResult || pivotResult.pp === null) return;

      const pivotLines: { key: string; price: number; color: string }[] = [
        { key: 'pp', price: pivotResult.pp, color: '#a78bfa' },
        { key: 'r1', price: pivotResult.r1, color: 'rgba(63,185,80,0.6)' },
        { key: 'r2', price: pivotResult.r2, color: 'rgba(63,185,80,0.4)' },
        { key: 'r3', price: pivotResult.r3, color: 'rgba(63,185,80,0.25)' },
        { key: 's1', price: pivotResult.s1, color: 'rgba(248,81,73,0.6)' },
        { key: 's2', price: pivotResult.s2, color: 'rgba(248,81,73,0.4)' },
        { key: 's3', price: pivotResult.s3, color: 'rgba(248,81,73,0.25)' },
      ];

      // Create a line for each pivot level spanning all candles
      const allCandles = candlesRef.current;
      pivotLines.forEach(pl => {
        if (pl.price === null || pl.price === undefined) return;
        const data = allCandles.map(c => ({ time: c.time as Time, value: pl.price }));
        addOverlayLine(`pivot-${pl.key}`, data, pl.color, pl.key === 'pp' ? 2 : 1, pl.key === 'pp');
      });
    }

    // ════════════════════════════════════════════════════════
    // OSCILLATOR INDICATORS (sub-panels)
    // ════════════════════════════════════════════════════════

    else if (indicator.key === 'rsi') {
      const data = results.map((r: any) => {
        const val = r.values?.rsi;
        return val !== null ? { time: r.time as Time, value: val } : null;
      }).filter(Boolean);

      const series = chart.addSeries(LineSeries, {
        color: indicator.color,
        lineWidth: 1 as any,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceScaleId: 'rsi-scale',
      });
      series.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        borderVisible: false,
        autoScale: true,
        mode: 0,
      });
      series.setData(data as any);
      oscillatorSeriesRef.current.set('rsi', series);
    }

    else if (indicator.key === 'macd') {
      const macdData: { time: Time; value: number }[] = [];
      const signalData: { time: Time; value: number }[] = [];
      const histData: { time: Time; value: number; color: string }[] = [];

      results.forEach((r: any) => {
        if (r.macd !== null) {
          macdData.push({ time: r.time as Time, value: r.macd });
        }
        if (r.signal !== null) {
          signalData.push({ time: r.time as Time, value: r.signal });
        }
        if (r.histogram !== null) {
          histData.push({
            time: r.time as Time,
            value: r.histogram,
            color: r.histogram >= 0 ? 'rgba(63,185,80,0.5)' : 'rgba(248,81,73,0.5)',
          });
        }
      });

      // MACD line
      const macdSeries = chart.addSeries(LineSeries, {
        color: '#58a6ff',
        lineWidth: 1 as any,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceScaleId: 'macd-scale',
      });
      macdSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        borderVisible: false,
      });
      macdSeries.setData(macdData as any);
      oscillatorSeriesRef.current.set('macd-line', macdSeries);

      // Signal line
      const sigSeries = chart.addSeries(LineSeries, {
        color: '#f97316',
        lineWidth: 1 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'macd-scale',
      });
      sigSeries.setData(signalData as any);
      oscillatorSeriesRef.current.set('macd-signal', sigSeries);

      // Histogram
      const histSeries = chart.addSeries(LCHistogram, {
        priceScaleId: 'macd-scale',
        priceLineVisible: false,
        lastValueVisible: false,
      });
      histSeries.setData(histData as any);
      oscillatorSeriesRef.current.set('macd-hist', histSeries);
    }

    else if (indicator.key === 'stochastic') {
      const kData: { time: Time; value: number }[] = [];
      const dData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        if (r.values?.k !== null) kData.push({ time: r.time as Time, value: r.values.k });
        if (r.values?.d !== null) dData.push({ time: r.time as Time, value: r.values.d });
      });

      const kSeries = chart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 1 as any,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceScaleId: 'stoch-scale',
      });
      kSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        borderVisible: false,
      });
      kSeries.setData(kData as any);
      oscillatorSeriesRef.current.set('stoch-k', kSeries);

      const dSeries = chart.addSeries(LineSeries, {
        color: '#fbbf24',
        lineWidth: 1 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'stoch-scale',
      });
      dSeries.setData(dData as any);
      oscillatorSeriesRef.current.set('stoch-d', dSeries);
    }

    else if (indicator.key === 'atr') {
      const data = results.map((r: any) => {
        const val = r.values?.atr;
        return val !== null ? { time: r.time as Time, value: val } : null;
      }).filter(Boolean);

      const series = chart.addSeries(LineSeries, {
        color: indicator.color,
        lineWidth: 1 as any,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceScaleId: 'atr-scale',
      });
      series.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        borderVisible: false,
      });
      series.setData(data as any);
      oscillatorSeriesRef.current.set('atr', series);
    }

    else if (indicator.key === 'adx') {
      const adxData: { time: Time; value: number }[] = [];
      const pdiData: { time: Time; value: number }[] = [];
      const mdiData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        if (r.values?.adx !== null) adxData.push({ time: r.time as Time, value: r.values.adx });
        if (r.values?.pdi !== null) pdiData.push({ time: r.time as Time, value: r.values.pdi });
        if (r.values?.mdi !== null) mdiData.push({ time: r.time as Time, value: r.values.mdi });
      });

      const adxSeries = chart.addSeries(LineSeries, {
        color: '#fbbf24',
        lineWidth: 2 as any,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceScaleId: 'adx-scale',
      });
      adxSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        borderVisible: false,
      });
      adxSeries.setData(adxData as any);
      oscillatorSeriesRef.current.set('adx-line', adxSeries);

      const pdiSeries = chart.addSeries(LineSeries, {
        color: '#3fb950',
        lineWidth: 1 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'adx-scale',
      });
      pdiSeries.setData(pdiData as any);
      oscillatorSeriesRef.current.set('adx-pdi', pdiSeries);

      const mdiSeries = chart.addSeries(LineSeries, {
        color: '#f85149',
        lineWidth: 1 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'adx-scale',
      });
      mdiSeries.setData(mdiData as any);
      oscillatorSeriesRef.current.set('adx-mdi', mdiSeries);
    }

    else if (indicator.key === 'cci') {
      const data = results.map((r: any) => {
        const val = r.values?.cci;
        return val !== null ? { time: r.time as Time, value: val } : null;
      }).filter(Boolean);

      const series = chart.addSeries(LineSeries, {
        color: indicator.color,
        lineWidth: 1 as any,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceScaleId: 'cci-scale',
      });
      series.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        borderVisible: false,
      });
      series.setData(data as any);
      oscillatorSeriesRef.current.set('cci', series);
    }
  }, []);

  // ── Remove Indicator ───────────────────────────────────
  const removeIndicator = useCallback((key: string) => {
    const chart = chartInstanceRef.current;
    if (!chart) return;

    // Remove all overlay series for this indicator key
    const overlayKeys = Array.from(overlaySeriesRef.current.keys()).filter(k => k === key || k.startsWith(`${key}-`));
    overlayKeys.forEach(k => {
      const s = overlaySeriesRef.current.get(k);
      if (s) { chart.removeSeries(s); overlaySeriesRef.current.delete(k); }
    });

    // Remove all oscillator series for this indicator key
    const oscKeys = Array.from(oscillatorSeriesRef.current.keys()).filter(k => k === key || k.startsWith(`${key}-`));
    oscKeys.forEach(k => {
      const s = oscillatorSeriesRef.current.get(k);
      if (s) { chart.removeSeries(s); oscillatorSeriesRef.current.delete(k); }
    });

    setActiveIndicators(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // ── Get Active Indicators ──────────────────────────────
  const getActiveIndicators = useCallback((): ActiveIndicator[] => {
    return Array.from(activeIndicators.values());
  }, [activeIndicators]);

  // ── Set Chart Type ─────────────────────────────────────
  const setChartType = useCallback((type: ChartType) => {
    setSettings(prev => ({ ...prev, type }));
    // Re-set candles to apply Heikin-Ashi
    if (candlesRef.current.length) {
      setCandles(candlesRef.current);
    }
  }, [setCandles]);

  // ── Drawing Operations ─────────────────────────────────
  const addDrawing = useCallback((tool: DrawingTool, points: { time: number; price: number }[]) => {
    if (!drawingManagerRef.current) return;
    drawingManagerRef.current.create(tool, points);
  }, []);

  const removeDrawing = useCallback((id: string) => {
    drawingManagerRef.current?.delete(id);
  }, []);

  const clearDrawings = useCallback(() => {
    drawingManagerRef.current?.clearAll();
    drawingRendererRef.current?.clearAndRedraw();
  }, []);

  const getDrawings = useCallback((): Drawing[] => {
    return drawingManagerRef.current?.getAll() || [];
  }, []);

  const setTool = useCallback((tool: DrawingTool) => {
    setActiveTool(tool);
    drawingRendererRef.current?.setTool(tool);
  }, []);

  const cancelDrawing = useCallback(() => {
    setActiveTool('cursor');
    drawingRendererRef.current?.setTool('cursor');
    drawingRendererRef.current?.cancelDrawing();
  }, []);

  // ── Zoom ───────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    chartInstanceRef.current?.timeScale().applyOptions({
      barSpacing: Math.min(50, (chartInstanceRef.current?.timeScale().options().barSpacing || 8) + 2),
    });
  }, []);

  const zoomOut = useCallback(() => {
    chartInstanceRef.current?.timeScale().applyOptions({
      barSpacing: Math.max(2, (chartInstanceRef.current?.timeScale().options().barSpacing || 8) - 2),
    });
  }, []);

  const resetView = useCallback(() => {
    chartInstanceRef.current?.timeScale().fitContent();
  }, []);

  // ── Export ─────────────────────────────────────────────
  const exportPNG = useCallback(() => {
    ChartExporter.exportPNG(containerRef.current);
  }, []);

  const exportCSV = useCallback(() => {
    ChartExporter.exportCSV(candlesRef.current);
  }, []);

  const exportSVG = useCallback(() => {
    ChartExporter.exportSVG(containerRef.current);
  }, []);

  // ── Fullscreen ─────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(f => {
      const next = !f;
      if (next) {
        // Enter fullscreen
        const el = containerRef.current?.parentElement || containerRef.current;
        if (el) {
          if (el.requestFullscreen) el.requestFullscreen();
          else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
      }
      return next;
    });
  }, []);

  // ── Pause ──────────────────────────────────────────────
  const togglePause = useCallback(() => {
    setIsPaused(p => !p);
  }, []);

  // ── Templates ──────────────────────────────────────────
  const saveTemplate = useCallback((name: string) => {
    ChartTemplateManager.save(
      name,
      settings,
      Array.from(activeIndicators.values()),
      drawingManagerRef.current?.getAll() || [],
      timeframe,
      settings.type
    );
  }, [settings, activeIndicators, timeframe]);

  const loadTemplate = useCallback((id: string) => {
    const template = ChartTemplateManager.load(id);
    if (!template) return;
    setSettings(template.settings);
    // Apply indicators from template
    template.indicators.forEach(ind => addIndicator(ind));
  }, [addIndicator]);

  const getTemplates = useCallback(() => {
    return ChartTemplateManager.getAll();
  }, []);

  // ── Update Settings ────────────────────────────────────
  const updateSettings = useCallback((updates: Partial<ChartSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));

    // Apply live chart option changes
    const chart = chartInstanceRef.current;
    if (chart) {
      if (updates.showGrid !== undefined) {
        chart.applyOptions({
          grid: {
            vertLines: { color: updates.showGrid ? COLORS.grid : 'transparent' },
            horzLines: { color: updates.showGrid ? COLORS.grid : 'transparent' },
          },
        });
      }
      if (updates.upColor !== undefined || updates.downColor !== undefined) {
        candleSeriesRef.current?.applyOptions({
          upColor: updates.upColor || COLORS.upColor,
          downColor: updates.downColor || COLORS.downColor,
          borderUpColor: updates.upColor || COLORS.upColor,
          borderDownColor: updates.downColor || COLORS.downColor,
          wickUpColor: updates.upColor || COLORS.upColor,
          wickDownColor: updates.downColor || COLORS.downColor,
        });
      }
      if (updates.showVolume !== undefined) {
        volumeSeriesRef.current?.applyOptions({
          visible: updates.showVolume,
        });
      }
    }
  }, []);

  return {
    chartRef: chartInstanceRef,
    containerRef,
    settings,
    updateSettings,
    setCandles,
    updateLastCandle,
    addIndicator,
    removeIndicator,
    getActiveIndicators,
    setChartType,
    addDrawing,
    removeDrawing,
    clearDrawings,
    getDrawings,
    setTool,
    activeTool,
    zoomIn,
    zoomOut,
    resetView,
    exportPNG,
    exportCSV,
    exportSVG,
    toggleFullscreen,
    isFullscreen,
    isPaused,
    togglePause,
    saveTemplate,
    loadTemplate,
    getTemplates,
    currentTool: activeTool,
    cancelDrawing,
  };
}
