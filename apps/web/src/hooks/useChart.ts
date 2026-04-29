// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Main Chart Hook
// Creates and manages the lightweight-charts v5 instance
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi, SeriesType, Time, MouseEventParams, DeepPartial, ChartOptions } from 'lightweight-charts';
import type {
  CandleData, ChartType, ActiveIndicator, Drawing, DrawingTool,
  ChartSettings, CrosshairData
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
  setMarkers: (markers: any[]) => void;
  addPriceLine: (id: string, price: number, color: string, label: string, lineWidth?: number, lineStyle?: number, axisLabelVisible?: boolean) => void;
  removePriceLine: (id: string) => void;
  getPriceCoordinate: (price: number) => number | null;
  onVisibleRangeChange: (callback: () => void) => () => void;
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
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const onCrosshairMoveRef = useRef(onCrosshairMove);

  // Keep the ref updated without triggering re-init
  useEffect(() => {
    onCrosshairMoveRef.current = onCrosshairMove;
  }, [onCrosshairMove]);

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

  const activeIndicatorsRef = useRef<Map<string, ActiveIndicator>>(new Map());

  useEffect(() => {
    activeIndicatorsRef.current = activeIndicators;
  }, [activeIndicators]);

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
        attributionLogo: false,
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
    mainSeriesRef.current = candleSeries;

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
      if (!param.time || !param.point) {
        onCrosshairMoveRef.current?.(null);
        return;
      }

      const mainSeries = mainSeriesRef.current || candleSeriesRef.current;
      const candleData = param.seriesData.get(mainSeries as any) as any || param.seriesData.get(candleSeries) as any;
      if (!candleData) {
        onCrosshairMoveRef.current?.(null);
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

      onCrosshairMoveRef.current?.({
        time: param.time as number,
        open: candleData.open ?? candleData.value,
        high: candleData.high ?? candleData.value,
        low: candleData.low ?? candleData.value,
        close: candleData.close ?? candleData.value,
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

    // ── Subscribe to visible range change (if callback already registered) ──
    if (visibleRangeCallbackRef.current) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(visibleRangeCallbackRef.current);
    }

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
        resetView: () => chart.timeScale().fitContent(),
      });
      shortcutsRef.current.attach();
    }

  }, [symbol]); // Removed onCrosshairMove dependency to avoid chart re-creation

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
    // Clear oscillator series when symbol changes too
    oscillatorSeriesRef.current.forEach((series) => {
      chartInstanceRef.current?.removeSeries(series);
    });
    oscillatorSeriesRef.current.clear();
  }, [symbol]);



  // ── Update Last Candle (live tick) ─────────────────────
  const updateLastCandle = useCallback((price: number) => {
    if (isPaused || !candleSeriesRef.current || !candlesRef.current.length) return;

    const candles = candlesRef.current;
    const last = candles[candles.length - 1];
    const updated = { ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) };
    candlesRef.current = [...candles.slice(0, -1), updated]; // Immutable update to avoid stale refs

    if (settings.type === 'heikin-ashi') {
      // Only recalculate last candle for HA, not entire series
      const prevCandle = candles.length > 1 ? candles[candles.length - 2] : updated;
      const haClose = (updated.open + updated.high + updated.low + updated.close) / 4;
      const haOpen = prevCandle === updated ? (updated.open + haClose) / 2 : (prevCandle.open + prevCandle.close) / 2;
      const haHigh = Math.max(updated.high, haOpen, haClose);
      const haLow = Math.min(updated.low, haOpen, haClose);
      const lastDisplay = { ...updated, open: haOpen, high: haHigh, low: haLow, close: haClose };
      candleSeriesRef.current.update({
        time: lastDisplay.time as Time, open: lastDisplay.open, high: lastDisplay.high, low: lastDisplay.low, close: lastDisplay.close,
      } as any);
    } else {
      candleSeriesRef.current.update({
        time: updated.time as Time, open: updated.open, high: updated.high, low: updated.low, close: updated.close,
      } as any);
    }

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
      // Count how many oscillator scales already exist
      const existingScaleIds = new Set<string>();
      oscillatorSeriesRef.current.forEach(s => {
        try {
          const opts = s.options() as any;
          if (opts.priceScaleId) existingScaleIds.add(opts.priceScaleId);
        } catch {}
      });

      const totalScales = existingScaleIds.size + 1;
      const panelHeight = Math.min(0.15, Math.max(0.10, 0.60 / totalScales));

      // Find the slot index for this scale
      const scaleSlots = Array.from(existingScaleIds);
      scaleSlots.push(scaleId);
      scaleSlots.sort();
      const slotIndex = scaleSlots.indexOf(scaleId);

      const bottomMargin = slotIndex * panelHeight;
      const topMargin = 1 - bottomMargin - panelHeight;

      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: lineWidth as any,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceScaleId: scaleId,
      });
      series.priceScale().applyOptions({
        scaleMargins: { top: Math.max(0.1, topMargin), bottom: bottomMargin },
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
      }).filter((d): d is { time: Time; value: number } => d !== null);
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

      // Fill area between upper and lower bands using upper band as top fill
      const upperFill = chart.addSeries(AreaSeries, {
        topColor: 'rgba(88,166,255,0.08)',
        bottomColor: 'rgba(88,166,255,0.02)',
        lineColor: 'transparent',
        lineWidth: 0 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      upperFill.setData(upperData as any);
      overlaySeriesRef.current.set('bb-fill-upper', upperFill);

      // Lower band fill (fills from bottom to lower band)
      const lowerFill = chart.addSeries(AreaSeries, {
        topColor: 'rgba(88,166,255,0.02)',
        bottomColor: 'rgba(88,166,255,0.06)',
        lineColor: 'transparent',
        lineWidth: 0 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      lowerFill.setData(lowerData as any);
      overlaySeriesRef.current.set('bb-fill-lower', lowerFill);
    }

    else if (indicator.key === 'psar') {
      // Parabolic SAR: dots using small step-like line segments
      const psarData: { time: Time; value: number; color?: string }[] = [];
      results.forEach((r: any) => {
        const val = r.values?.psar;
        if (val !== null && val !== undefined) {
          const candleIdx = candlesRef.current.findIndex(c => c.time === r.time);
          const candle = candleIdx >= 0 ? candlesRef.current[candleIdx] : null;
          const isBullish = candle ? val < candle.close : true;
          psarData.push({ time: r.time as Time, value: val, color: isBullish ? '#3fb950' : '#f85149' });
        }
      });

      // Split into bullish and bearish
      const bullData = psarData.filter(d => d.color === '#3fb950').map(d => ({ time: d.time, value: d.value }));
      const bearData = psarData.filter(d => d.color === '#f85149').map(d => ({ time: d.time, value: d.value }));

      // Use LineSeries with dashed style to create dot-like appearance
      // lightweight-charts v5 doesn't support point markers on LineSeries
      const bullSeries = chart.addSeries(LineSeries, {
        color: '#3fb950',
        lineWidth: 1 as any,
        lineStyle: 2, // Dashed - makes it look like dots from a distance
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        crosshairMarkerRadius: 2,
      });
      bullSeries.setData(bullData as any);
      overlaySeriesRef.current.set('psar-bull', bullSeries);

      const bearSeries = chart.addSeries(LineSeries, {
        color: '#f85149',
        lineWidth: 1 as any,
        lineStyle: 2, // Dashed
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        crosshairMarkerRadius: 2,
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

      // Cloud fill — proper Kumo between Senkou A and Senkou B
      // When A > B: bullish cloud (green tint), when B > A: bearish cloud (red tint)
      const cloudTopData: { time: Time; value: number }[] = [];
      const cloudBottomData: { time: Time; value: number }[] = [];
      const minLen = Math.min(senkouAData.length, senkouBData.length);
      for (let i = 0; i < minLen; i++) {
        const a = senkouAData[i];
        const b = senkouBData[i];
        if (a.time === b.time) {
          cloudTopData.push({ time: a.time, value: Math.max(a.value, b.value) });
          cloudBottomData.push({ time: a.time, value: Math.min(a.value, b.value) });
        }
      }

      // Bullish cloud fill (top of cloud)
      const cloudTopFill = chart.addSeries(AreaSeries, {
        topColor: 'rgba(45,212,191,0.08)',
        bottomColor: 'rgba(45,212,191,0.03)',
        lineColor: 'transparent',
        lineWidth: 0 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      cloudTopFill.setData(cloudTopData as any);
      overlaySeriesRef.current.set('ichimoku-cloud-top', cloudTopFill);

      // Bearish cloud fill (bottom of cloud)
      const cloudBottomFill = chart.addSeries(AreaSeries, {
        topColor: 'rgba(248,113,113,0.03)',
        bottomColor: 'rgba(248,113,113,0.08)',
        lineColor: 'transparent',
        lineWidth: 0 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      cloudBottomFill.setData(cloudBottomData as any);
      overlaySeriesRef.current.set('ichimoku-cloud-bottom', cloudBottomFill);
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
      }).filter((d): d is { time: Time; value: number } => d !== null);
      addOscillatorLine('rsi', data, indicator.color, 'rsi-scale');
    }

    else if (indicator.key === 'macd') {
      const macdData: { time: Time; value: number }[] = [];
      const signalData: { time: Time; value: number }[] = [];
      const histData: { time: Time; value: number; color: string }[] = [];

      results.forEach((r: any) => {
        if (r.macd !== null) macdData.push({ time: r.time as Time, value: r.macd });
        if (r.signal !== null) signalData.push({ time: r.time as Time, value: r.signal });
        if (r.histogram !== null) histData.push({
          time: r.time as Time,
          value: r.histogram,
          color: r.histogram >= 0 ? 'rgba(63,185,80,0.5)' : 'rgba(248,81,73,0.5)',
        });
      });

      addOscillatorLine('macd-line', macdData, '#58a6ff', 'macd-scale');

      // Signal line (same scale)
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

      // Histogram (same scale)
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

      addOscillatorLine('stoch-k', kData, '#a855f7', 'stoch-scale');

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
      }).filter((d): d is { time: Time; value: number } => d !== null);
      addOscillatorLine('atr', data, indicator.color, 'atr-scale');
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

      addOscillatorLine('adx-line', adxData, '#fbbf24', 'adx-scale', 2);

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
      }).filter((d): d is { time: Time; value: number } => d !== null);
      addOscillatorLine('cci', data, indicator.color, 'cci-scale');
    }
  }, []);

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

    // Re-apply indicators with fresh data using ref to avoid stale closure
    activeIndicatorsRef.current.forEach((ind) => {
      addIndicator(ind);
    });
  }, [settings.type, addIndicator]);

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
  const setChartType = useCallback(async (type: ChartType) => {
    setSettings(prev => ({ ...prev, type }));

    const chart = chartInstanceRef.current;
    if (!chart || !candlesRef.current.length) return;

    // For heikin-ashi and candle, just re-set data on existing candlestick series
    if (type === 'candle' || type === 'heikin-ashi' || type === 'hollow') {
      const displayCandles = type === 'heikin-ashi' ? toHeikinAshi(candlesRef.current) : candlesRef.current;
      const chartData = displayCandles.map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      // Apply hollow candle style
      if (type === 'hollow' && candleSeriesRef.current) {
        candleSeriesRef.current.applyOptions({
          upColor: 'transparent',
          downColor: COLORS.downColor,
          borderUpColor: COLORS.upColor,
          borderDownColor: COLORS.downColor,
          wickUpColor: COLORS.upWick,
          wickDownColor: COLORS.downWick,
        });
      } else if (candleSeriesRef.current) {
        candleSeriesRef.current.applyOptions({
          upColor: COLORS.upColor,
          downColor: COLORS.downColor,
          borderUpColor: COLORS.upColor,
          borderDownColor: COLORS.downColor,
          wickUpColor: COLORS.upWick,
          wickDownColor: COLORS.downWick,
        });
      }

      if (candleSeriesRef.current) {
        candleSeriesRef.current.setData(chartData as any);
      }
      return;
    }

    // For line/area/bar types, swap the main series
    const { LineSeries, AreaSeries, BarSeries } = await import('lightweight-charts');
    const candles = candlesRef.current;

    // Remove existing main series
    if (mainSeriesRef.current) {
      try { chart.removeSeries(mainSeriesRef.current); } catch {}
      mainSeriesRef.current = null;
    }
    if (candleSeriesRef.current && candleSeriesRef.current !== mainSeriesRef.current) {
      try { chart.removeSeries(candleSeriesRef.current); } catch {}
      candleSeriesRef.current = null;
    }

    if (type === 'line') {
      const lineSeries = chart.addSeries(LineSeries, {
        color: COLORS.upColor,
        lineWidth: 2 as any,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      });
      const data = candles.map(c => ({ time: c.time as Time, value: c.close }));
      lineSeries.setData(data as any);
      mainSeriesRef.current = lineSeries;
      candleSeriesRef.current = lineSeries as any;
    }
    else if (type === 'area') {
      const areaSeries = chart.addSeries(AreaSeries, {
        topColor: 'rgba(63,185,80,0.3)',
        bottomColor: 'rgba(63,185,80,0.02)',
        lineColor: COLORS.upColor,
        lineWidth: 2 as any,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      });
      const data = candles.map(c => ({ time: c.time as Time, value: c.close }));
      areaSeries.setData(data as any);
      mainSeriesRef.current = areaSeries;
      candleSeriesRef.current = areaSeries as any;
    }
    else if (type === 'bar') {
      const barSeries = chart.addSeries(BarSeries, {
        upColor: COLORS.upColor,
        downColor: COLORS.downColor,
      });
      const displayCandles = candles.map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      barSeries.setData(displayCandles as any);
      mainSeriesRef.current = barSeries;
      candleSeriesRef.current = barSeries as any;
    }

    // Re-set volume
    if (volumeSeriesRef.current) {
      const volumeData = candles.map(c => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
      }));
      volumeSeriesRef.current.setData(volumeData as any);
    }

    // Re-apply indicators
    overlaySeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    overlaySeriesRef.current.clear();
    oscillatorSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    oscillatorSeriesRef.current.clear();
    // Store and re-add
    const prevIndicators = Array.from(activeIndicatorsRef.current.values());
    prevIndicators.forEach(ind => addIndicator(ind));
  }, [addIndicator]);

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
  // NOTE: Fullscreen is handled by the dashboard store (toggleChartFullscreen)
  // This local toggle is kept for standalone usage (mobile, other pages)
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(f => !f);
  }, []);

  // ── Apply Settings to Chart Instance ──────────────────
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;

    chart.applyOptions({
      layout: {
        background: { color: settings.bgColor },
        textColor: '#8B92A8',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: settings.showGrid ? settings.gridColor : 'transparent' },
        horzLines: { color: settings.showGrid ? settings.gridColor : 'transparent' },
      },
      crosshair: (() => {
        if (settings.crosshairType === 'none') {
          return {
            mode: 2, // Hidden
            vertLine: { visible: false },
            horzLine: { visible: false },
          };
        } else if (settings.crosshairType === 'dot') {
          return {
            mode: 0,
            vertLine: { visible: true, style: 0, width: 0 as any, labelVisible: true, labelBackgroundColor: '#151A22' },
            horzLine: { visible: true, style: 0, width: 0 as any, labelVisible: true, labelBackgroundColor: '#151A22' },
          };
        } else {
          return {
            mode: 0, // Normal
            vertLine: { visible: true, color: COLORS.crosshair, width: 1, style: 2, labelBackgroundColor: '#151A22' },
            horzLine: { visible: true, color: COLORS.crosshair, width: 1, style: 2, labelBackgroundColor: '#151A22' },
          };
        }
      })(),
    });

    // Apply candle colors
    if (candleSeriesRef.current && (settings.type === 'candle' || settings.type === 'heikin-ashi')) {
      candleSeriesRef.current.applyOptions({
        upColor: settings.upColor,
        downColor: settings.downColor,
        borderUpColor: settings.upColor,
        borderDownColor: settings.downColor,
        wickUpColor: settings.upColor,
        wickDownColor: settings.downColor,
      });
    }

    // Apply volume visibility
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({
        visible: settings.showVolume,
      });
    }

    // Apply price line visibility
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        priceLineVisible: settings.showPriceLine,
        lastValueVisible: settings.showPriceLine,
      });
    }

    // Apply session visibility (affects time scale markers)
    // showSessions controls whether trading session backgrounds are visible
    // showCandleTimer controls whether the candle countdown is shown in the UI
  }, [settings]);

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
    setSettings(template.settings); // This triggers the settings effect which applies to chart
    // Apply indicators from template
    template.indicators.forEach(ind => addIndicator(ind));
  }, [addIndicator]);

  const getTemplates = useCallback(() => {
    return ChartTemplateManager.getAll();
  }, []);

  // ── Set Markers on Main Series ──
  const setMarkers = useCallback((markers: any[]) => {
    const series = mainSeriesRef.current || candleSeriesRef.current;
    if (!series) return;
    try {
      (series as any).setMarkers(markers);
    } catch {
      // Markers API may fail silently
    }
  }, []);

  // ── Price Lines (for positions/trades) ──
  const priceLinesRef = useRef<Map<string, any>>(new Map());

  const addPriceLine = useCallback((id: string, price: number, color: string, label: string, lineWidth: number = 1, lineStyle: number = 2, axisLabelVisible: boolean = true) => {
    if (!candleSeriesRef.current) return;

    // Remove existing line with same id
    if (priceLinesRef.current.has(id)) {
      try {
        priceLinesRef.current.get(id)?.remove();
      } catch {}
      priceLinesRef.current.delete(id);
    }

    try {
      const line = candleSeriesRef.current.createPriceLine({
        price,
        color,
        lineWidth: lineWidth as any,
        lineStyle: lineStyle as any, // 0=Solid, 1=Dotted, 2=Dashed, 3=LargeDashed, 4=SparseDotted
        axisLabelVisible: false,
        title: '',
      });
      priceLinesRef.current.set(id, line);
    } catch {
      // Price line creation may fail
    }
  }, []);

  const removePriceLine = useCallback((id: string) => {
    const line = priceLinesRef.current.get(id);
    if (line) {
      try {
        line.remove();
      } catch {}
      priceLinesRef.current.delete(id);
    }
  }, []);

  // ── Update Settings ────────────────────────────────────
  const getPriceCoordinate = useCallback((price: number): number | null => {
    if (!candleSeriesRef.current) return null;
    return candleSeriesRef.current.priceToCoordinate(price);
  }, []);

  // Store the visible range callback so we can subscribe when chart is created
  const visibleRangeCallbackRef = useRef<(() => void) | null>(null);

  const onVisibleRangeChange = useCallback((callback: () => void): (() => void) => {
    visibleRangeCallbackRef.current = callback;
    // Subscribe immediately if chart already exists
    if (chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().subscribeVisibleLogicalRangeChange(callback);
    }
    return () => {
      visibleRangeCallbackRef.current = null;
      if (chartInstanceRef.current) {
        try {
          chartInstanceRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(callback);
        } catch {}
      }
    };
  }, []);

  const updateSettings = useCallback((updates: Partial<ChartSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));

    const chart = chartInstanceRef.current;
    if (chart) {
      if (updates.showGrid !== undefined) {
        const gridColor = updates.gridColor || (updates.showGrid ? COLORS.grid : 'transparent');
        chart.applyOptions({
          grid: {
            vertLines: { color: updates.showGrid ? gridColor : 'transparent' },
            horzLines: { color: updates.showGrid ? gridColor : 'transparent' },
          },
        });
      }
      if (updates.gridColor !== undefined) {
        chart.applyOptions({
          grid: {
            vertLines: { color: updates.gridColor },
            horzLines: { color: updates.gridColor },
          },
        });
      }
      if (updates.upColor !== undefined || updates.downColor !== undefined) {
        candleSeriesRef.current?.applyOptions({
          upColor: updates.upColor || COLORS.upColor,
          downColor: updates.downColor || COLORS.downColor,
          borderUpColor: updates.upColor || COLORS.upColor,
          borderDownColor: updates.downColor || COLORS.downColor,
          wickUpColor: updates.upColor || COLORS.upWick,
          wickDownColor: updates.downColor || COLORS.downWick,
        });
      }
      if (updates.showVolume !== undefined) {
        volumeSeriesRef.current?.applyOptions({
          visible: updates.showVolume,
        });
      }
      if (updates.bgColor !== undefined) {
        chart.applyOptions({
          layout: {
            background: { color: updates.bgColor },
          },
        });
      }
      if (updates.crosshairType !== undefined) {
        if (updates.crosshairType === 'none') {
          chart.applyOptions({
            crosshair: {
              mode: 2, // Hidden
              vertLine: { visible: false },
              horzLine: { visible: false },
            },
          });
        } else if (updates.crosshairType === 'dot') {
          chart.applyOptions({
            crosshair: {
              mode: 0,
              vertLine: { visible: true, style: 0, width: 0 as any, labelVisible: true },
              horzLine: { visible: true, style: 0, width: 0 as any, labelVisible: true },
            },
          });
        } else {
          // cross (default)
          chart.applyOptions({
            crosshair: {
              mode: 0,
              vertLine: { visible: true, color: COLORS.crosshair, width: 1, style: 2, labelVisible: true },
              horzLine: { visible: true, color: COLORS.crosshair, width: 1, style: 2, labelVisible: true },
            },
          });
        }
      }
      if (updates.showPriceLine !== undefined) {
        candleSeriesRef.current?.applyOptions({
          lastValueVisible: updates.showPriceLine,
          priceLineVisible: updates.showPriceLine,
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
    setMarkers,
    addPriceLine,
    removePriceLine,
    getPriceCoordinate,
    onVisibleRangeChange,
  };
}
