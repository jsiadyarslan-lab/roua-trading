// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Main Chart Hook
// Creates and manages the lightweight-charts v5 instance
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi, SeriesType, Time, MouseEventParams, DeepPartial, ChartOptions } from 'lightweight-charts';
import { createSeriesMarkers } from 'lightweight-charts';
import type {
  CandleData, ChartType, ActiveIndicator, Drawing, DrawingTool,
  ChartSettings, CrosshairData
} from '../lib/charts/types';
import { toHeikinAshi } from '../lib/charts/IndicatorCalculator';
import { DrawingManager } from '../lib/charts/DrawingManager';
import type { DrawingRenderer } from '../lib/charts/DrawingRenderer';
import { KeyboardShortcuts } from '../lib/charts/KeyboardShortcuts';
import { ChartExporter } from '../lib/charts/ChartExporter';
import { ChartTemplateManager } from '../lib/charts/ChartTemplate';
import { T } from '@/lib/unified-tokens';

interface UseChartOptions {
  symbol: string;
  timeframe: string;
  settings?: Partial<ChartSettings>;
  onCrosshairMove?: (data: CrosshairData | null) => void;
  mobile?: boolean;
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
  registerExternalSeries: (series: ISeriesApi<SeriesType>) => void;
  unregisterExternalSeries: (series: ISeriesApi<SeriesType>) => void;
  clearExternalSeries: () => void;
  setCrosshairMode: (enabled: boolean) => void;
}

export function useChart(options: UseChartOptions): UseChartReturn {
  const { symbol, timeframe, onCrosshairMove, mobile: isMobile } = options;

  // ── Refs ───────────────────────────────────────────────
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const oscillatorSeriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  // FIX: Track external series created outside useChart (e.g., AI overlay from RouaChart.tsx).
  // These series must be cleaned up before setData() to prevent "Value is null" crashes.
  const externalSeriesRef = useRef<Set<ISeriesApi<SeriesType>>>(new Set());
  const candlesRef = useRef<CandleData[]>([]);
  const drawingManagerRef = useRef<DrawingManager | null>(null);
  const drawingRendererRef = useRef<DrawingRenderer | null>(null);
  const shortcutsRef = useRef<KeyboardShortcuts | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const windowResizeHandlerRef = useRef<(() => void) | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const priceLinesRef = useRef<Map<string, any>>(new Map());
  // FIX: Persist markers across data updates — lightweight-charts v5 clears markers
  // when setData() is called on the series. We store them in a ref and re-apply
  // after every setData call so signal/news/AI markers don't disappear.
  const markersRef = useRef<any[]>([]);
  const markersPluginRef = useRef<ReturnType<typeof createSeriesMarkers> | null>(null);
  const onCrosshairMoveRef = useRef(onCrosshairMove);
  // FIX: Moved visibleRangeCallbackRef and prevCallbackRef up from line ~1321 to here
  // to prevent TDZ (Temporal Dead Zone) error — initChart() at line ~136 references
  // visibleRangeCallbackRef.current, and it must be declared before initChart is defined.
  const visibleRangeCallbackRef = useRef<(() => void) | null>(null);
  const prevCallbackRef = useRef<(() => void) | null>(null);
  // FIX: Track pending requestAnimationFrame for indicator re-apply.
  // When setCandles is called rapidly (e.g., timeframe change + WebSocket),
  // we must cancel the previous scheduled indicator re-apply to avoid
  // "Value is null" errors from stale indicator data.
  const pendingIndicatorRafRef = useRef<number>(0);

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
    bgColor: T.bg,
    gridColor: 'rgba(42,49,60,0.5)',
    ...options.settings,
  });

  const [activeIndicators, setActiveIndicators] = useState<Map<string, ActiveIndicator>>(new Map());
  const [activeTool, setActiveTool] = useState<DrawingTool>('cursor');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const activeIndicatorsRef = useRef<Map<string, ActiveIndicator>>(new Map());

  // ── Pending candles: store data that arrives before chart is ready ──
  const pendingCandlesRef = useRef<CandleData[] | null>(null);
  const [isChartReady, setIsChartReady] = useState(false);

  useEffect(() => {
    activeIndicatorsRef.current = activeIndicators;
  }, [activeIndicators]);

  // ── Chart Colors ───────────────────────────────────────
  const CHART_COLORS = {
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

    // Wait for container to have non-zero dimensions (flex layout may not have resolved yet)
    const waitForDimensions = (el: HTMLElement, maxRetries = 20): Promise<{ w: number; h: number }> => {
      return new Promise((resolve) => {
        const check = (attempt: number) => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (w > 0 && h > 0) {
            resolve({ w, h });
            return;
          }
          if (attempt >= maxRetries) {
            // Fallback: use parent dimensions or reasonable defaults
            const parent = el.parentElement;
            const fw = parent?.clientWidth || 800;
            const fh = parent?.clientHeight || 400;
            resolve({ w: fw, h: fh });
            return;
          }
          requestAnimationFrame(() => check(attempt + 1));
        };
        check(0);
      });
    };

    const { w: initialWidth, h: initialHeight } = await waitForDimensions(containerRef.current);

    // Dynamic import lightweight-charts v5
    const { createChart, CandlestickSeries, HistogramSeries } = await import('lightweight-charts');

    // Destroy existing chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = containerRef.current;

    const chartOptions: DeepPartial<ChartOptions> = {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { color: T.bg },
        textColor: T.text2,
        fontSize: isMobile ? 9 : 11,
        fontFamily: "'JetBrains Mono', monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        mode: 0, // Normal
        vertLine: {
          color: isMobile ? 'rgba(160,200,220,0.7)' : CHART_COLORS.crosshair,
          width: isMobile ? 1 : 1,
          style: 2,
          labelVisible: true,
          labelBackgroundColor: isMobile ? '#2a2e3e' : T.card,
        },
        horzLine: {
          color: isMobile ? 'rgba(160,200,220,0.7)' : CHART_COLORS.crosshair,
          width: isMobile ? 1 : 1,
          style: 2,
          labelVisible: true,
          labelBackgroundColor: isMobile ? '#2a2e3e' : T.card,
        },
      },
      rightPriceScale: {
        borderColor: isMobile ? 'transparent' : T.cardBorder,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: T.cardBorder,
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      handleScroll: { vertTouchDrag: false },
    };

    const chart = createChart(container, chartOptions);

    // ── Block setPointerCapture on mobile ──
    // lightweight-charts calls setPointerCapture() on the canvas on every
    // pointerdown, which can interfere with touch interactions.
    // Since the new mobile UI uses full-viewport chart with no bottom navbar,
    // this is less critical but still prevents edge-case pointer capture issues.
    if (isMobile) {
      const blockPointerCapture = (canvas: HTMLCanvasElement) => {
        canvas.setPointerCapture = () => canvas;
      };
      container.querySelectorAll('canvas').forEach(blockPointerCapture);
      const captureObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLCanvasElement) {
              blockPointerCapture(node);
            }
          }
        }
      });
      captureObserver.observe(container, { childList: true, subtree: true });
      const originalRemove = chart.remove.bind(chart);
      chart.remove = () => {
        captureObserver.disconnect();
        originalRemove();
      };
    }
    chartInstanceRef.current = chart;

    // ── Candlestick Series ──
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.upColor,
      downColor: CHART_COLORS.downColor,
      borderUpColor: CHART_COLORS.upColor,
      borderDownColor: CHART_COLORS.downColor,
      wickUpColor: CHART_COLORS.upWick,
      wickDownColor: CHART_COLORS.downWick,
      // Hide built-in last price label on mobile — our overlay shows the price
      lastValueVisible: !isMobile,
      priceLineVisible: !isMobile,
    });
    candleSeriesRef.current = candleSeries;
    mainSeriesRef.current = candleSeries;

    // ── Volume Series ──
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // ── Mark chart as ready AFTER all series are created ──
    setIsChartReady(true);

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

      // FIX: Guard all OHLCV values against null/undefined — lightweight-charts
      // may return null values when hovering over oscillator series or during
      // data transitions, which caused "Value is null" errors downstream.
      const safeNum = (v: any, fallback: number = 0): number => {
        return (v !== null && v !== undefined && !isNaN(v)) ? Number(v) : fallback;
      };

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

    // ── Window Resize Listener (backup for flex layout changes) ──
    // ResizeObserver on the canvas container may not fire when parent flex
    // changes (especially with position:absolute + inset:0 children).
    // Listening to window resize as a fallback ensures the chart resizes
    // when the layout shifts (e.g. positions panel opens/closes).
    // Also, page.tsx dispatches a synthetic 'resize' event when posOpen changes.
    const handleWindowResize = () => {
      if (chart && containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w > 0 && h > 0) {
          chart.applyOptions({ width: w, height: h });
        }
      }
    };
    window.addEventListener('resize', handleWindowResize);
    windowResizeHandlerRef.current = handleWindowResize;

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
      // Lazy load DrawingRenderer to reduce initial bundle size
      import('../lib/charts/DrawingRenderer').then(({ DrawingRenderer: DynamicRenderer }) => {
        if (!drawingManagerRef.current || !candleSeriesRef.current || !chartInstanceRef.current || !container) return;
        const renderer = new DynamicRenderer(
          chartInstanceRef.current,
          candleSeriesRef.current,
          container,
          drawingManagerRef.current,
        );
        renderer.setTool(activeTool);
        renderer.start();
        drawingRendererRef.current = renderer as any;
      }).catch(console.error);
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

  // NOTE: symbol is NOT a dependency — we reuse the same chart instance
  // when the symbol changes and just swap the data. This avoids a race
  // condition where the chart is destroyed/recreated while data is loading.
  }, []);

  // ── Initialize on mount (once) ────────────────────────
  useEffect(() => {
    setIsChartReady(false);
    initChart().catch(e => console.error('[useChart] init failed:', e));  // FIX: Catch async errors instead of silently swallowing
    return () => {
      setIsChartReady(false);
      if (drawingRendererRef.current) {
        drawingRendererRef.current.stop();
        drawingRendererRef.current = null;
      }
      // FIX: Disconnect ResizeObserver FIRST before removing chart.
      // This prevents "Node cannot be found in the current page" DOM errors
      // that occur when the observer tries to observe a removed container.
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (chartInstanceRef.current) {
        try {
          chartInstanceRef.current.remove();
        } catch (e: any) {
          // Silently catch DOM errors during chart cleanup — the container
          // may already be removed from the document during navigation
          console.warn('[useChart] Chart remove failed (container likely removed):', e?.message);
        }
        chartInstanceRef.current = null;
      }
      if (windowResizeHandlerRef.current) {
        window.removeEventListener('resize', windowResizeHandlerRef.current);
        windowResizeHandlerRef.current = null;
      }
      if (shortcutsRef.current) {
        shortcutsRef.current.detach();
      }
    };
  // initChart is now stable (empty deps), so this runs only on mount/unmount
  }, [initChart]);

  // ── Handle symbol change: clear data without destroying chart ──
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
    // FIX: Also clear external series (e.g., AI overlay from RouaChart.tsx) when symbol changes.
    // Without this, stale AI series from the old symbol remain in externalSeriesRef,
    // and when setCandles is called later, it tries removeSeries() on already-removed series.
    externalSeriesRef.current.forEach((series) => {
      try { chartInstanceRef.current?.removeSeries(series); } catch {}
    });
    externalSeriesRef.current.clear();
    // Clear candle + volume data so chart is blank while new data loads
    candlesRef.current = [];
    pendingCandlesRef.current = null;
    try {
      candleSeriesRef.current?.setData([] as any);
      volumeSeriesRef.current?.setData([] as any);
    } catch { /* series might not exist yet on first render */ }
    // Clear active indicators state (they'll be re-added by setCandles)
    setActiveIndicators(new Map());
    // Clear price lines
    priceLinesRef.current.forEach((line, id) => {
      try { line.remove(); } catch {}
    });
    priceLinesRef.current.clear();
  }, [symbol]);

  // ── Handle timeframe change: clear indicators and data to prevent "Value is null" ──
  // When timeframe changes, old indicator series have timestamps from the previous
  // timeframe (e.g. 15min) that don't exist in the new candle data (e.g. 1h).
  // lightweight-charts throws "Value is null" when rendering indicator data at
  // timestamps that don't exist in the candle series.
  useEffect(() => {
    // Cancel any pending indicator re-apply from a previous setCandles call
    cancelAnimationFrame(pendingIndicatorRafRef.current);
    pendingIndicatorRafRef.current = 0;

    // Clear overlay series when timeframe changes
    overlaySeriesRef.current.forEach((series) => {
      chartInstanceRef.current?.removeSeries(series);
    });
    overlaySeriesRef.current.clear();
    // Clear oscillator series when timeframe changes
    oscillatorSeriesRef.current.forEach((series) => {
      chartInstanceRef.current?.removeSeries(series);
    });
    oscillatorSeriesRef.current.clear();
    // Clear candle + volume data so chart is blank while new data loads
    candlesRef.current = [];
    pendingCandlesRef.current = null;
    try {
      candleSeriesRef.current?.setData([] as any);
      volumeSeriesRef.current?.setData([] as any);
    } catch { /* series might not exist yet on first render */ }
    // FIX: Clear active indicators BOTH via React state AND directly via ref.
    // Previously only setState was called, but the ref (activeIndicatorsRef)
    // is updated in a separate useEffect that may not have run yet when
    // setCandles is called from the new timeframe's fetch. This caused
    // stale indicators to be re-applied with mismatched timestamps,
    // triggering "Value is null" in lightweight-charts.
    setActiveIndicators(new Map());
    activeIndicatorsRef.current = new Map();
    // Clear price lines (they are timeframe-dependent)
    priceLinesRef.current.forEach((line) => {
      try { line.remove(); } catch {}
    });
    priceLinesRef.current.clear();
    // Clear markers (they are timeframe-dependent)
    markersRef.current = [];
  }, [timeframe]);

  // ── Apply pending candles when chart becomes ready ──
  // NOTE: This useEffect MUST come after setCandles is defined to avoid TDZ error
  // (moved from earlier in the function where setCandles was not yet declared)



  // ── Update Last Candle (live tick) ─────────────────────
  const updateLastCandle = useCallback((price: number) => {
    if (isPaused || !candleSeriesRef.current || !candlesRef.current.length) return;

    const candles = candlesRef.current;
    const last = candles[candles.length - 1];
    const updated = { ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) };
    candlesRef.current = [...candles.slice(0, -1), updated]; // Immutable update to avoid stale refs

    if (!candleSeriesRef.current) return; // Chart was destroyed — skip update

    if (settings.type === 'heikin-ashi') {
      // Only recalculate last candle for HA, not entire series
      const prevCandle = candles.length > 1 ? candles[candles.length - 2] : updated;
      const haClose = (updated.open + updated.high + updated.low + updated.close) / 4;
      const haOpen = prevCandle === updated ? (updated.open + haClose) / 2 : (prevCandle.open + prevCandle.close) / 2;
      const haHigh = Math.max(updated.high, haOpen, haClose);
      const haLow = Math.min(updated.low, haOpen, haClose);
      const lastDisplay = { ...updated, open: haOpen, high: haHigh, low: haLow, close: haClose };
      try { candleSeriesRef.current.update({
        time: lastDisplay.time as Time, open: lastDisplay.open, high: lastDisplay.high, low: lastDisplay.low, close: lastDisplay.close,
      } as any);
      } catch { /* chart was destroyed between the null check and update */ }
    } else {
      try {
        candleSeriesRef.current.update({
          time: updated.time as Time, open: updated.open, high: updated.high, low: updated.low, close: updated.close,
        } as any);
      } catch { /* chart was destroyed between the null check and update */ }
    }

    // Update volume — use `updated` (not `last`) for correct color after price change
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.update({
        time: last.time as Time,
        value: last.volume,
        color: updated.close >= updated.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
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
    // FIX: Filter NaN/Infinity from ALL data before passing to lightweight-charts.
    // Indicator calculations (RSI, MACD, BB, etc.) produce NaN for the first N
    // periods before enough data is available. NaN passes !== null checks but
    // crashes lightweight-charts with "Value is null".
    const isValid = (v: any): v is number =>
      v !== null && v !== undefined && typeof v === 'number' && isFinite(v);
    const cleanData = (data: { time: Time; value: number }[]) =>
      data.filter(d => isValid(d.time) && isValid(d.value));

    const addOverlayLine = (key: string, data: { time: Time; value: number }[], color: string, lineWidth: number = 1, priceLineVisible = false) => {
      const filtered = cleanData(data);
      if (filtered.length === 0) return; // Don't create empty series
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: lineWidth as any,
        priceLineVisible,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      });
      series.setData(filtered as any);
      overlaySeriesRef.current.set(key, series);
    };

    // ── Helper: add oscillator sub-panel series ──
    const addOscillatorLine = (key: string, rawData: { time: Time; value: number }[], color: string, scaleId: string, lineWidth: number = 1) => {
      // FIX: Filter NaN/Infinity before creating series
      const data = cleanData(rawData);
      if (data.length === 0) return; // Don't create empty series
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
        return isValid(val) && isValid(r.time) ? { time: r.time as Time, value: val } : null;
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
        if (!isValid(val) || !isValid(r.time)) return;
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
        if (isValid(r.upper) && isValid(r.time)) upperData.push({ time: r.time as Time, value: r.upper });
        if (isValid(r.middle) && isValid(r.time)) middleData.push({ time: r.time as Time, value: r.middle });
        if (isValid(r.lower) && isValid(r.time)) lowerData.push({ time: r.time as Time, value: r.lower });
      });
      addOverlayLine('bb-upper', upperData, 'rgba(88,166,255,0.5)');
      addOverlayLine('bb-middle', middleData, 'rgba(88,166,255,0.3)');
      addOverlayLine('bb-lower', lowerData, 'rgba(88,166,255,0.5)');

      // Fill area between upper and lower bands using upper band as top fill
      const filteredUpper = cleanData(upperData);
      if (filteredUpper.length > 0) {
        const upperFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(88,166,255,0.08)',
          bottomColor: 'rgba(88,166,255,0.02)',
          lineColor: 'transparent',
          lineWidth: 0 as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        upperFill.setData(filteredUpper as any);
        overlaySeriesRef.current.set('bb-fill-upper', upperFill);
      }

      // Lower band fill (fills from bottom to lower band)
      const filteredLower = cleanData(lowerData);
      if (filteredLower.length > 0) {
        const lowerFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(88,166,255,0.02)',
          bottomColor: 'rgba(88,166,255,0.06)',
          lineColor: 'transparent',
          lineWidth: 0 as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        lowerFill.setData(filteredLower as any);
        overlaySeriesRef.current.set('bb-fill-lower', lowerFill);
      }
    }

    else if (indicator.key === 'psar') {
      // Parabolic SAR: dots using small step-like line segments
      const psarData: { time: Time; value: number; color?: string }[] = [];
      results.forEach((r: any) => {
        const val = r.values?.psar;
        if (isValid(val) && isValid(r.time)) {
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
        if (isValid(r.tenkan) && isValid(r.time)) tenkanData.push({ time: r.time as Time, value: r.tenkan });
        if (isValid(r.kijun) && isValid(r.time)) kijunData.push({ time: r.time as Time, value: r.kijun });
        if (isValid(r.senkouA) && isValid(r.time)) senkouAData.push({ time: r.time as Time, value: r.senkouA });
        if (isValid(r.senkouB) && isValid(r.time)) senkouBData.push({ time: r.time as Time, value: r.senkouB });
        if (isValid(r.chikou) && isValid(r.time)) chikouData.push({ time: r.time as Time, value: r.chikou });
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
        if (a.time === b.time && isValid(a.value) && isValid(b.value)) {
          cloudTopData.push({ time: a.time, value: Math.max(a.value, b.value) });
          cloudBottomData.push({ time: a.time, value: Math.min(a.value, b.value) });
        }
      }

      // Bullish cloud fill (top of cloud)
      const filteredCloudTop = cleanData(cloudTopData);
      if (filteredCloudTop.length > 0) {
        const cloudTopFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(45,212,191,0.08)',
          bottomColor: 'rgba(45,212,191,0.03)',
          lineColor: 'transparent',
          lineWidth: 0 as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        cloudTopFill.setData(filteredCloudTop as any);
        overlaySeriesRef.current.set('ichimoku-cloud-top', cloudTopFill);
      }

      // Bearish cloud fill (bottom of cloud)
      const filteredCloudBottom = cleanData(cloudBottomData);
      if (filteredCloudBottom.length > 0) {
        const cloudBottomFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(248,113,113,0.03)',
          bottomColor: 'rgba(248,113,113,0.08)',
          lineColor: 'transparent',
          lineWidth: 0 as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        cloudBottomFill.setData(filteredCloudBottom as any);
        overlaySeriesRef.current.set('ichimoku-cloud-bottom', cloudBottomFill);
      }
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

    else if (indicator.key === 'donchian') {
      // Donchian Channel: upper, middle, lower lines + fill
      const upperData: { time: Time; value: number }[] = [];
      const middleData: { time: Time; value: number }[] = [];
      const lowerData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        if (isValid(r.upper) && isValid(r.time)) upperData.push({ time: r.time as Time, value: r.upper });
        if (isValid(r.middle) && isValid(r.time)) middleData.push({ time: r.time as Time, value: r.middle });
        if (isValid(r.lower) && isValid(r.time)) lowerData.push({ time: r.time as Time, value: r.lower });
      });
      addOverlayLine('donchian-upper', upperData, 'rgba(249,115,22,0.6)');
      addOverlayLine('donchian-middle', middleData, 'rgba(249,115,22,0.3)', 1);
      addOverlayLine('donchian-lower', lowerData, 'rgba(249,115,22,0.6)');

      // Fill area between upper and lower bands
      const filteredDonchianUpper = cleanData(upperData);
      if (filteredDonchianUpper.length > 0) {
        const upperFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(249,115,22,0.08)',
          bottomColor: 'rgba(249,115,22,0.02)',
          lineColor: 'transparent',
          lineWidth: 0 as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        upperFill.setData(filteredDonchianUpper as any);
        overlaySeriesRef.current.set('donchian-fill-upper', upperFill);
      }

      const filteredDonchianLower = cleanData(lowerData);
      if (filteredDonchianLower.length > 0) {
        const lowerFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(249,115,22,0.02)',
          bottomColor: 'rgba(249,115,22,0.06)',
          lineColor: 'transparent',
          lineWidth: 0 as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        lowerFill.setData(filteredDonchianLower as any);
        overlaySeriesRef.current.set('donchian-fill-lower', lowerFill);
      }
    }

    // ════════════════════════════════════════════════════════
    // OSCILLATOR INDICATORS (sub-panels)
    // ════════════════════════════════════════════════════════

    else if (indicator.key === 'rsi') {
      const data = results.map((r: any) => {
        const val = r.values?.rsi;
        return isValid(val) && isValid(r.time) ? { time: r.time as Time, value: val } : null;
      }).filter((d): d is { time: Time; value: number } => d !== null);
      addOscillatorLine('rsi', data, indicator.color, 'rsi-scale');
    }

    else if (indicator.key === 'macd') {
      const macdData: { time: Time; value: number }[] = [];
      const signalData: { time: Time; value: number }[] = [];
      const histData: { time: Time; value: number; color: string }[] = [];

      results.forEach((r: any) => {
        if (isValid(r.macd) && isValid(r.time)) macdData.push({ time: r.time as Time, value: r.macd });
        if (isValid(r.signal) && isValid(r.time)) signalData.push({ time: r.time as Time, value: r.signal });
        if (isValid(r.histogram) && isValid(r.time)) histData.push({
          time: r.time as Time,
          value: r.histogram,
          color: r.histogram >= 0 ? 'rgba(63,185,80,0.5)' : 'rgba(248,81,73,0.5)',
        });
      });

      addOscillatorLine('macd-line', macdData, '#58a6ff', 'macd-scale');

      // Signal line (same scale)
      const filteredSignal = cleanData(signalData);
      if (filteredSignal.length > 0) {
        const sigSeries = chart.addSeries(LineSeries, {
          color: '#f97316',
          lineWidth: 1 as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceScaleId: 'macd-scale',
        });
        sigSeries.setData(filteredSignal as any);
        oscillatorSeriesRef.current.set('macd-signal', sigSeries);
      }

      // Histogram (same scale)
      const filteredHist = histData.filter(d => isValid(d.time) && isValid(d.value));
      if (filteredHist.length > 0) {
        const histSeries = chart.addSeries(LCHistogram, {
          priceScaleId: 'macd-scale',
          priceLineVisible: false,
          lastValueVisible: false,
        });
        histSeries.setData(filteredHist as any);
        oscillatorSeriesRef.current.set('macd-hist', histSeries);
      }
    }

    else if (indicator.key === 'stochastic') {
      const kData: { time: Time; value: number }[] = [];
      const dData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        // FIX: Use isValid() to catch null, undefined, NaN, and Infinity
        if (isValid(r.values?.k) && isValid(r.time)) kData.push({ time: r.time as Time, value: r.values.k });
        if (isValid(r.values?.d) && isValid(r.time)) dData.push({ time: r.time as Time, value: r.values.d });
      });

      addOscillatorLine('stoch-k', kData, '#a855f7', 'stoch-scale');

      const filteredD = cleanData(dData);
      if (filteredD.length > 0) {
        const dSeries = chart.addSeries(LineSeries, {
          color: '#fbbf24',
          lineWidth: 1 as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceScaleId: 'stoch-scale',
        });
        dSeries.setData(filteredD as any);
        oscillatorSeriesRef.current.set('stoch-d', dSeries);
      }
    }

    else if (indicator.key === 'atr') {
      const data = results.map((r: any) => {
        const val = r.values?.atr;
        return isValid(val) && isValid(r.time) ? { time: r.time as Time, value: val } : null;
      }).filter((d): d is { time: Time; value: number } => d !== null);
      addOscillatorLine('atr', data, indicator.color, 'atr-scale');
    }

    else if (indicator.key === 'adx') {
      const adxData: { time: Time; value: number }[] = [];
      const pdiData: { time: Time; value: number }[] = [];
      const mdiData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        // FIX: Use isValid() to catch null, undefined, NaN, and Infinity
        if (isValid(r.values?.adx) && isValid(r.time)) adxData.push({ time: r.time as Time, value: r.values.adx });
        if (isValid(r.values?.pdi) && isValid(r.time)) pdiData.push({ time: r.time as Time, value: r.values.pdi });
        if (isValid(r.values?.mdi) && isValid(r.time)) mdiData.push({ time: r.time as Time, value: r.values.mdi });
      });

      addOscillatorLine('adx-line', adxData, '#fbbf24', 'adx-scale', 2);

      const filteredPdi = cleanData(pdiData);
      if (filteredPdi.length > 0) {
        const pdiSeries = chart.addSeries(LineSeries, {
          color: '#3fb950',
          lineWidth: 1 as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceScaleId: 'adx-scale',
        });
        pdiSeries.setData(filteredPdi as any);
        oscillatorSeriesRef.current.set('adx-pdi', pdiSeries);
      }

      const filteredMdi = cleanData(mdiData);
      if (filteredMdi.length > 0) {
        const mdiSeries = chart.addSeries(LineSeries, {
          color: '#f85149',
          lineWidth: 1 as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceScaleId: 'adx-scale',
        });
        mdiSeries.setData(filteredMdi as any);
        oscillatorSeriesRef.current.set('adx-mdi', mdiSeries);
      }
    }

    else if (indicator.key === 'cci') {
      const data = results.map((r: any) => {
        const val = r.values?.cci;
        return isValid(val) && isValid(r.time) ? { time: r.time as Time, value: val } : null;
      }).filter((d): d is { time: Time; value: number } => d !== null);
      addOscillatorLine('cci', data, indicator.color, 'cci-scale');
    }
  }, []);

  // ── Set Candles ────────────────────────────────────────
  const setCandles = useCallback((candles: CandleData[]) => {
    // Store candles regardless of chart readiness
    candlesRef.current = candles;

    // If chart isn't ready yet, store data as pending and return
    if (!candleSeriesRef.current || !volumeSeriesRef.current) {
      pendingCandlesRef.current = candles;
      return;
    }

    // Sort by time (lightweight-charts v5 requires strictly ascending time)
    const sorted = [...candles].sort((a, b) => a.time - b.time);

    // Apply Heikin-Ashi if needed
    const displayCandles = settings.type === 'heikin-ashi' ? toHeikinAshi(sorted) : sorted;

    // FIX: Remove ALL overlay/oscillator series BEFORE calling setData.
    // Previously, setData was called first, which triggered a chart re-render
    // that tried to render existing Area/Line overlay series with timestamps
    // from the previous timeframe. Since those timestamps didn't exist in the
    // new candle data, lightweight-charts threw "Value is null" and the
    // candle data was never actually set — making timeframe switching appear
    // broken even though the data was fetched correctly.
    const chart = chartInstanceRef.current;
    if (chart) {
      overlaySeriesRef.current.forEach((series) => {
        try { chart.removeSeries(series); } catch {}
      });
      overlaySeriesRef.current.clear();
      oscillatorSeriesRef.current.forEach((series) => {
        try { chart.removeSeries(series); } catch {}
      });
      oscillatorSeriesRef.current.clear();

      // CRITICAL FIX: Also remove external series registered by
      // RouaChart.tsx (AI overlay Area/Line series, etc.).
      // These are NOT in overlaySeriesRef/oscillatorSeriesRef and
      // contain timestamps from the old timeframe → "Value is null" crash.
      externalSeriesRef.current.forEach((series) => {
        try { chart.removeSeries(series); } catch {}
      });
      externalSeriesRef.current.clear();
    }

    // Cancel any previously scheduled indicator re-apply
    cancelAnimationFrame(pendingIndicatorRafRef.current);
    pendingIndicatorRafRef.current = 0;

    // Format for lightweight-charts with null/NaN filtering
    // FIX: Filter out any data points with invalid values that would
    // crash lightweight-charts (null, undefined, NaN, Infinity)
    const isValidNum = (v: any): v is number =>
      v !== null && v !== undefined && typeof v === 'number' && isFinite(v);

    const chartData = displayCandles
      .filter(c => isValidNum(c.open) && isValidNum(c.high) && isValidNum(c.low) && isValidNum(c.close) && isValidNum(c.time))
      .map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

    const volumeData = sorted
      .filter(c => isValidNum(c.volume) && isValidNum(c.time))
      .map(c => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)',
      }));

    try {
      candleSeriesRef.current.setData(chartData as any);
      volumeSeriesRef.current.setData(volumeData as any);
    } catch (e) {
      console.error('[useChart] setCandles setData error:', e);
    }

    // Re-apply stored markers after setData
    const storedMarkers = markersRef.current;
    if (storedMarkers.length > 0) {
      const series = mainSeriesRef.current || candleSeriesRef.current;
      if (series) {
        try {
          if (!markersPluginRef.current) {
            markersPluginRef.current = createSeriesMarkers(series as any, storedMarkers);
          } else {
            markersPluginRef.current.setMarkers(storedMarkers);
          }
        } catch { /* ignore */ }
      }
    }

    // Re-apply indicators with fresh data using ref to avoid stale closure.
    // Since we already removed all overlay/oscillator series above, we just
    // need to re-create them with the new candle data.
    const activeIndicators = activeIndicatorsRef.current;
    if (activeIndicators.size > 0) {
      // Use requestAnimationFrame to batch indicator updates and avoid
      // re-creating series multiple times per frame (e.g., on rapid ticks)
      pendingIndicatorRafRef.current = requestAnimationFrame(() => {
        activeIndicators.forEach((ind) => {
          addIndicator(ind);
        });
        pendingIndicatorRafRef.current = 0;
      });
    }
  }, [settings.type, addIndicator]);

  // ── Apply pending candles when chart becomes ready ──
  useEffect(() => {
    if (isChartReady && pendingCandlesRef.current && pendingCandlesRef.current.length > 0) {
      const pending = pendingCandlesRef.current;
      pendingCandlesRef.current = null;
      setCandles(pending);
    }
  }, [isChartReady, setCandles]);

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
          downColor: CHART_COLORS.downColor,
          borderUpColor: CHART_COLORS.upColor,
          borderDownColor: CHART_COLORS.downColor,
          wickUpColor: CHART_COLORS.upWick,
          wickDownColor: CHART_COLORS.downWick,
        });
      } else if (candleSeriesRef.current) {
        candleSeriesRef.current.applyOptions({
          upColor: CHART_COLORS.upColor,
          downColor: CHART_COLORS.downColor,
          borderUpColor: CHART_COLORS.upColor,
          borderDownColor: CHART_COLORS.downColor,
          wickUpColor: CHART_COLORS.upWick,
          wickDownColor: CHART_COLORS.downWick,
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
    // Reset markers plugin so it gets re-created on the new series
    markersPluginRef.current = null;

    if (type === 'line') {
      const lineSeries = chart.addSeries(LineSeries, {
        color: CHART_COLORS.upColor,
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
        lineColor: CHART_COLORS.upColor,
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
        upColor: CHART_COLORS.upColor,
        downColor: CHART_COLORS.downColor,
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
            vertLine: { visible: true, style: 0, width: 0 as any, labelVisible: true, labelBackgroundColor: T.card },
            horzLine: { visible: true, style: 0, width: 0 as any, labelVisible: true, labelBackgroundColor: T.card },
          };
        } else {
          return {
            mode: 0, // Normal
            vertLine: { visible: true, color: isMobile ? 'rgba(160,200,220,0.7)' : CHART_COLORS.crosshair, width: 1, style: 2, labelVisible: true, labelBackgroundColor: isMobile ? '#2a2e3e' : T.card },
            horzLine: { visible: true, color: isMobile ? 'rgba(160,200,220,0.7)' : CHART_COLORS.crosshair, width: 1, style: 2, labelVisible: true, labelBackgroundColor: isMobile ? '#2a2e3e' : T.card },
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
    // On mobile, always hide the built-in price line & last value label
    // to avoid duplicates with our custom overlay
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        priceLineVisible: isMobile ? false : settings.showPriceLine,
        lastValueVisible: isMobile ? false : settings.showPriceLine,
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
    markersRef.current = markers;
    const applyMarkers = () => {
      const series = mainSeriesRef.current || candleSeriesRef.current;
      if (!series) {
        console.warn('[setMarkers] series not ready, retrying in 500ms');
        setTimeout(applyMarkers, 500);
        return;
      }
      try {
        if (!markersPluginRef.current) {
          markersPluginRef.current = createSeriesMarkers(series as any, markers);
          console.log('[setMarkers] created plugin with', markers.length, 'markers');
        } else {
          markersPluginRef.current.setMarkers(markers);
          console.log('[setMarkers] updated', markers.length, 'markers');
        }
      } catch (e) {
        console.warn('[setMarkers] error, resetting:', e);
        markersPluginRef.current = null;
        try { markersPluginRef.current = createSeriesMarkers(series as any, markers); } catch (e2) { console.error('[setMarkers] fatal:', e2); }
      }
    };
    applyMarkers();
  }, []);

  // ── Price Lines (for positions/trades) ──
  // priceLinesRef is already declared at the top with other refs

  const addPriceLine = useCallback((id: string, price: number, color: string, label: string, lineWidth: number = 1, lineStyle: number = 2, axisLabelVisible: boolean = true) => {
    if (!candleSeriesRef.current) return;

    // Remove existing line with same id
    if (priceLinesRef.current.has(id)) {
      try {
        const existingLine = priceLinesRef.current.get(id);
        if (existingLine && candleSeriesRef.current) {
          candleSeriesRef.current.removePriceLine(existingLine);
        }
      } catch {}
      priceLinesRef.current.delete(id);
    }

    try {
      const line = candleSeriesRef.current.createPriceLine({
        price,
        color,
        lineWidth: lineWidth as any,
        lineStyle: lineStyle as any, // 0=Solid, 1=Dotted, 2=Dashed, 3=LargeDashed, 4=SparseDotted
        axisLabelVisible: axisLabelVisible,
        title: label || '',
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
        if (candleSeriesRef.current) {
          candleSeriesRef.current.removePriceLine(line);
        }
      } catch {}
      priceLinesRef.current.delete(id);
    }
  }, []);

  // ── Update Settings ────────────────────────────────────
  const getPriceCoordinate = useCallback((price: number): number | null => {
    if (!candleSeriesRef.current) return null;
    return candleSeriesRef.current.priceToCoordinate(price);
  }, []);

  // ── External Series Management ─────────────────────────
  // FIX: Allow RouaChart.tsx to register series created outside useChart
  // (e.g., AI overlay Area/Line series). These are tracked separately so
  // setCandles can remove them before calling setData(), preventing
  // "Value is null" crashes when timeframe changes.
  const registerExternalSeries = useCallback((series: ISeriesApi<SeriesType>) => {
    externalSeriesRef.current.add(series);
  }, []);

  const unregisterExternalSeries = useCallback((series: ISeriesApi<SeriesType>) => {
    externalSeriesRef.current.delete(series);
    // Also try to remove from chart if still attached
    if (chartInstanceRef.current) {
      try { chartInstanceRef.current.removeSeries(series); } catch {}
    }
  }, []);

  const clearExternalSeries = useCallback(() => {
    const chart = chartInstanceRef.current;
    externalSeriesRef.current.forEach((series) => {
      if (chart) {
        try { chart.removeSeries(series); } catch {}
      }
    });
    externalSeriesRef.current.clear();
  }, []);

  // ── Crosshair Mode ────────────────────────────────────
  // When crosshair mode is enabled on mobile, disable touch panning so the
  // crosshair follows the user's finger. When disabled, re-enable panning.
  const setCrosshairMode = useCallback((enabled: boolean) => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    if (enabled) {
      // Crosshair mode: disable touch/mouse panning so crosshair follows finger
      chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: false,
          horzTouchDrag: false,
          vertTouchDrag: false,
        },
      });
    } else {
      // Normal mode: re-enable panning (restore original mobile settings)
      chart.applyOptions({
        handleScroll: {
          vertTouchDrag: false,
        },
      });
    }
  }, []);

  // visibleRangeCallbackRef and prevCallbackRef are now declared at the top
  // of the hook (near other refs) to prevent TDZ errors. See line ~91.

  const onVisibleRangeChange = useCallback((callback: () => void): (() => void) => {
    // Unsubscribe previous callback before subscribing new one
    if (prevCallbackRef.current && chartInstanceRef.current) {
      try {
        chartInstanceRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(prevCallbackRef.current);
      } catch {}
    }

    visibleRangeCallbackRef.current = callback;
    prevCallbackRef.current = callback;

    // Subscribe immediately if chart already exists
    if (chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().subscribeVisibleLogicalRangeChange(callback);
    }
    return () => {
      if (visibleRangeCallbackRef.current === callback) {
        visibleRangeCallbackRef.current = null;
      }
      if (prevCallbackRef.current === callback) {
        prevCallbackRef.current = null;
      }
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
        const gridColor = updates.gridColor || (updates.showGrid ? CHART_COLORS.grid : 'transparent');
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
          upColor: updates.upColor || CHART_COLORS.upColor,
          downColor: updates.downColor || CHART_COLORS.downColor,
          borderUpColor: updates.upColor || CHART_COLORS.upColor,
          borderDownColor: updates.downColor || CHART_COLORS.downColor,
          wickUpColor: updates.upColor || CHART_COLORS.upWick,
          wickDownColor: updates.downColor || CHART_COLORS.downWick,
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
              vertLine: { visible: true, color: CHART_COLORS.crosshair, width: 1, style: 2, labelVisible: true },
              horzLine: { visible: true, color: CHART_COLORS.crosshair, width: 1, style: 2, labelVisible: true },
            },
          });
        }
      }
      if (updates.showPriceLine !== undefined) {
        candleSeriesRef.current?.applyOptions({
          lastValueVisible: isMobile ? false : updates.showPriceLine,
          priceLineVisible: isMobile ? false : updates.showPriceLine,
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
    registerExternalSeries,
    unregisterExternalSeries,
    clearExternalSeries,
    setCrosshairMode,
  };
}
