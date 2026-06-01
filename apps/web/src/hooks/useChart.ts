// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Main Chart Hook
// Creates and manages the lightweight-charts v5 instance
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi, SeriesType, Time, MouseEventParams, DeepPartial, ChartOptions } from 'lightweight-charts';
// FIX: Removed static `import { createSeriesMarkers } from 'lightweight-charts'`
// This was THE ROOT CAUSE of the TDZ error "Cannot access 'eT' before initialization"
// at tL.symbol in production builds. The static import forced the entire
// lightweight-charts module to be evaluated at module load time, and the
// SWC minifier (Next.js 16 default, NOT Terser) reordered const/let
// declarations within lightweight-charts, causing the TDZ error.
// Now we cache it dynamically in initChart() and use the ref instead.
let _cachedCreateSeriesMarkers: ((series: any, markers: any[]) => any) | null = null;
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
import { useChartStateStore, type SerializedIndicator } from '@/hooks/useChartStateStore';
import {
  sanitizeTime,
  isValidNumber,
  binarySearchByTime,
  CHART_COLORS as SHARED_COLORS,
  MAX_VISIBLE_CANDLES,
  sanitizeOhlc,
} from '@/lib/charts/chart-utils';
import { buildChartOptions, buildCandlestickOptions, buildVolumeOptions, CHART_COLORS as CHART_OPTIONS_COLORS } from '../lib/charts/chart-options';

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
  setCandles: (candles: CandleData[], options?: { clearExternal?: boolean; skipIndicatorRebuild?: boolean }) => void;
  updateCandle: (candle: CandleData) => void;
  updateLastCandle: (price: number) => void;
  addIndicator: (indicator: ActiveIndicator) => void;
  removeIndicator: (key: string) => void;
  getActiveIndicators: () => ActiveIndicator[];
  setChartType: (type: ChartType) => void;
  addDrawing: (tool: DrawingTool, points: { time: number; price: number }[]) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: () => void;
  getDrawings: () => Drawing[];
  importDrawings: (drawings: Drawing[]) => void;
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
  mainSeriesRef: ReturnType<typeof import('react').useRef<any>>;
  candleSeriesRef: ReturnType<typeof import('react').useRef<any>>;
  getCandleSeries: () => any;
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
  // FIX: Track whether volume data has any non-zero values.
  // Used to hide the volume histogram when all values are zero
  // (e.g., forex/commodity sources don't provide volume).
  const hasVolumeRef = useRef(true);
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
  const markersPluginRef = useRef<any>(null);
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

  // ── Data loading guard ──
  // FIX: Track the symbol+timeframe for which data was LAST successfully loaded.
  // This prevents stale [symbol] effects from clearing data that was JUST set
  // by the fetch. Without this, the following race condition occurs:
  // 1. Symbol changes to ETH/USDT
  // 2. [symbol] effect runs → clears data with setData([])
  // 3. restoreChartState changes settings.type → triggers re-render
  // 4. [isChartReady, setCandles] effect re-fires (setCandles changed)
  // 5. Meanwhile, fetch completes and calls setCandles → data appears
  // 6. BUT another re-render (from settings change) might trigger the [symbol]
  //    effect's cleanup, or another effect might clear data again
  // The guard ensures that clearing data in [symbol] effect only happens when
  // the current data actually belongs to the OLD symbol.
  const lastLoadedDataKeyRef = useRef<string>('');

  // ── Template restore flag ──
  // When a grid template is being loaded, the calling code pre-saves state
  // to useChartStateStore. We set this flag to tell restoreChartState()
  // that the store data is authoritative and should override localStorage.
  // Without this, DrawingManager.setSymbol() loads stale drawings from
  // localStorage and overwrites the template's drawings saved in the store.
  const templateRestoreFlagRef = useRef(false);

  // PERF: rAF buffer for batching WebSocket candle updates.
  // Instead of calling series.update() on every WS message, we buffer
  // them and flush once per animation frame. This prevents multiple
  // updates per paint cycle and dramatically reduces CPU usage during
  // high-frequency market conditions.
  const rafBufferRef = useRef<CandleData | null>(null);
  const rafIdRef = useRef<number>(0);
  // PERF: Debounced indicator refresh timer.
  // After a WS candle update, we schedule a debounced (500ms) indicator
  // data refresh that recalculates all active indicators and updates
  // their series data IN-PLACE (series.setData()) instead of removing
  // and re-creating series. This gives users real-time indicator values
  // without the overhead of full indicator rebuild.
  const indicatorRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Indicator Cache ─────────────────────────────────
  // Stores the last calculated results for each indicator keyed by
  // a hash of (indicatorKey + params + candleDataSignature).
  // This prevents expensive recalculation when the same data is set
  // multiple times (e.g., symbol/timeframe switch triggers setCandles
  // → re-apply indicators → full recalc). With the cache, if the
  // candle data hasn't changed and the indicator params are the same,
  // we reuse the cached result and skip calculateIndicator().
  interface IndicatorCacheEntry {
    /** Hash of indicator key + params */
    paramsHash: string;
    /** Signature of candle data when this was calculated: `${length}:${lastTime}` */
    dataSignature: string;
    /** Cached calculation results */
    results: any[];
  }
  const indicatorCacheRef = useRef<Map<string, IndicatorCacheEntry>>(new Map());

  /** Generate a hash string for indicator params to detect changes */
  const hashIndicatorParams = useCallback((indicator: ActiveIndicator): string => {
    try {
      return `${indicator.key}:${JSON.stringify(indicator.params)}`;
    } catch {
      return `${indicator.key}:${Date.now()}`; // Fallback: force recalc
    }
  }, []);

  /** Generate a data signature from the current candle array */
  const getDataSignature = useCallback((): string => {
    const candles = candlesRef.current;
    if (!candles.length) return '0:0';
    return `${candles.length}:${candles[candles.length - 1].time}`;
  }, []);

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
  // Keep a ref to the latest activeTool so the lazy-loaded DrawingRenderer
  // can pick up the current tool even if the user clicked before import resolved.
  const activeToolRef = useRef<DrawingTool>('cursor');

  // ── Chart State Persistence ──
  // Debounced auto-save timer ref
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we've restored state for the current symbol+timeframe
  const restoredConfigRef = useRef<string>('');
  // Track visible range saving (separate debounce for scroll/zoom)
  const visibleRangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-Save: Save chart state to Zustand store (localStorage) ──
  const saveChartState = useCallback(() => {
    try {
      const store = useChartStateStore.getState();
      const indicators: SerializedIndicator[] = Array.from(activeIndicatorsRef.current.values()).map(ind => ({
        key: ind.key,
        params: ind.params,
        color: ind.color,
        opacity: ind.opacity,
        visible: ind.visible,
      }));

      // Capture drawings from DrawingManager
      const drawings = drawingManagerRef.current?.getAll() || [];

      // Capture visible range from chart
      let visibleRange: { from: number; to: number } | null = null;
      if (chartInstanceRef.current) {
        try {
          const range = chartInstanceRef.current.timeScale().getVisibleRange();
          if (range) {
            visibleRange = {
              from: range.from as number,
              to: range.to as number,
            };
          }
        } catch { /* chart destroyed */ }
      }

      store.saveChartConfig(symbol, timeframe, {
        chartType: settings.type,
        settings,
        indicators,
        drawings,
        visibleRange,
        activeTool,
      });

      // Also save last symbol/timeframe
      store.saveLastSymbolTimeframe(symbol, timeframe);
    } catch (e) {
      console.warn('[useChart] Auto-save failed:', e);
    }
  }, [symbol, timeframe, settings, activeTool]);

  // ── Debounced Auto-Save (3 seconds) ──
  const debouncedSaveChartState = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveChartState();
      autoSaveTimerRef.current = null;
    }, 3000);
  }, [saveChartState]);

  // ── Save visible range on scroll/zoom (1 second debounce) ──
  const saveVisibleRange = useCallback(() => {
    if (visibleRangeTimerRef.current) clearTimeout(visibleRangeTimerRef.current);
    visibleRangeTimerRef.current = setTimeout(() => {
      saveChartState();
      visibleRangeTimerRef.current = null;
    }, 1000);
  }, [saveChartState]);

  // ── Restore chart state from store on mount/symbol/timeframe change ──
  // FIX: Store the saved visible range in a ref instead of using setTimeout(1500ms).
  // The setTimeout was overriding resetView's correct visible range after data loads,
  // causing candles to disappear when switching symbols.
  // Now, resetView() checks this ref and applies the saved range if available.
  const savedVisibleRangeRef = useRef<{ from: number; to: number } | null>(null);

  const restoreChartState = useCallback(() => {
    const configKey = `${symbol}:${timeframe}`;
    // Only skip if we've ALREADY successfully restored for this config key.
    // EXCEPTION: if templateRestoreFlagRef is set, always restore (grid template load).
    // IMPORTANT: If the chart instance is not ready yet (no drawingManagerRef,
    // no chartInstanceRef), we must NOT set restoredConfigRef because the
    // indicators and drawings won't actually be restored — they'll be skipped
    // due to null refs, and the useEffect([isChartReady]) won't re-restore.
    const isTemplateRestore = templateRestoreFlagRef.current;
    if (!isTemplateRestore && restoredConfigRef.current === configKey) return;

    try {
      const store = useChartStateStore.getState();
      const saved = store.getChartConfig(symbol, timeframe);
      if (!saved) {
        // No saved state — mark as restored so we don't keep trying
        restoredConfigRef.current = configKey;
        templateRestoreFlagRef.current = false;
        return;
      }

      // Check if chart is ready for full restoration (indicators + drawings)
      // If not ready, only restore settings/indicators to state, and
      // DON'T set restoredConfigRef so that useEffect([isChartReady]) will
      // re-try the full restoration once the chart is ready.
      const chartReady = !!chartInstanceRef.current && !!candleSeriesRef.current;
      const drawingsReady = !!drawingManagerRef.current;

      // Restore chart type (safe even if chart not ready — just sets React state)
      if (saved.chartType && saved.chartType !== 'candle') {
        setSettings(prev => ({ ...prev, type: saved.chartType }));
      }

      // Restore settings (merge with defaults)
      if (saved.settings) {
        setSettings(prev => ({ ...prev, ...saved.settings }));
      }

      // Restore active tool
      if (saved.activeTool && saved.activeTool !== 'cursor') {
        setActiveTool(saved.activeTool);
        activeToolRef.current = saved.activeTool;
      }

      // Restore indicators — they will be re-applied when candles load
      // via the setCandles function's indicator re-apply logic.
      // This is safe even if chart isn't ready — just sets React state + ref.
      if (saved.indicators && saved.indicators.length > 0) {
        const restoredIndicators = new Map<string, ActiveIndicator>();
        saved.indicators.forEach((ind: SerializedIndicator) => {
          restoredIndicators.set(ind.key, {
            key: ind.key as any,
            params: ind.params,
            color: ind.color,
            opacity: ind.opacity,
            visible: ind.visible,
          });
        });
        setActiveIndicators(restoredIndicators);
        activeIndicatorsRef.current = restoredIndicators;
      }

      // Restore drawings — requires DrawingManager to be initialized
      if (saved.drawings && saved.drawings.length > 0 && drawingsReady) {
        // Clear any drawings loaded from localStorage by setSymbol()
        // and replace them with the template's drawings from the store
        drawingManagerRef.current!.clearAll();
        const adaptedDrawings = saved.drawings.map(d => ({ ...d, symbol }));
        drawingManagerRef.current!.importDrawings(JSON.stringify(adaptedDrawings));
        // Redraw with retries — the DrawingRenderer may not be ready yet
        // (it's loaded asynchronously via dynamic import)
        const tryRedraw = (attempt = 0) => {
          if (drawingRendererRef.current) {
            drawingRendererRef.current.redraw();
          } else if (attempt < 10) {
            setTimeout(() => tryRedraw(attempt + 1), 300);
          }
        };
        tryRedraw();
      }

      // Mark as fully restored ONLY if we were able to restore everything
      // (chart ready + drawings ready), OR if there were no drawings to restore.
      const drawingsRestored = !saved.drawings || saved.drawings.length === 0 || drawingsReady;
      if (chartReady && drawingsRestored) {
        restoredConfigRef.current = configKey;
        templateRestoreFlagRef.current = false;
      }
      // If not fully restored, DON'T set restoredConfigRef — the
      // useEffect([isChartReady]) will call us again when ready.

      console.log(`[useChart] Restored chart state for ${configKey}`, {
        indicators: saved.indicators?.length || 0,
        drawings: saved.drawings?.length || 0,
        chartReady,
        drawingsReady,
        isTemplateRestore,
      });
    } catch (e) {
      console.warn('[useChart] Restore failed:', e);
      // Don't mark as restored on failure — allow retry
    }
  }, [symbol, timeframe]);

  // ── Pending candles: store data that arrives before chart is ready ──
  const pendingCandlesRef = useRef<CandleData[] | null>(null);
  const [isChartReady, setIsChartReady] = useState(false);

  useEffect(() => {
    activeIndicatorsRef.current = activeIndicators;
    // Auto-save when indicators change
    if (activeIndicators.size > 0 || restoredConfigRef.current) {
      debouncedSaveChartState();
    }
  }, [activeIndicators, debouncedSaveChartState]);



  // ── Initialize Chart ───────────────────────────────────
  const initChart = useCallback(async () => {
    const initialContainer = containerRef.current;
    if (!initialContainer) return;

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

    const { w: initialWidth, h: initialHeight } = await waitForDimensions(initialContainer);

    // Dynamic import lightweight-charts v5
    const { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers: csmFn } = await import('lightweight-charts');
    if (containerRef.current !== initialContainer || !initialContainer.isConnected) return;

    // Cache createSeriesMarkers for later synchronous use
    _cachedCreateSeriesMarkers = csmFn;

    // Destroy existing chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = initialContainer;

    const chartOptions = buildChartOptions({
      width: initialWidth,
      height: initialHeight,
      isMobile: isMobile ?? false,
      bgColor: T.bg,
      textColor: T.text2,
      cardColor: T.card,
      cardBorderColor: T.cardBorder,
    });

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
    const candleSeries = chart.addSeries(CandlestickSeries, buildCandlestickOptions(isMobile ?? false));
    candleSeriesRef.current = candleSeries;
    mainSeriesRef.current = candleSeries;

    // ── Volume Series ──
    const volumeSeries = chart.addSeries(HistogramSeries, buildVolumeOptions());
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // ── Mark chart as ready AFTER all series are created ──
    setIsChartReady(true);

    // ── Crosshair Move Handler ──
    chart.subscribeCrosshairMove((param: MouseEventParams) => { try {
      if (!param.time || !param.point) {
        onCrosshairMoveRef.current?.(null);
        return;
      }

      const seriesData = param.seriesData;
      if (!seriesData || typeof (seriesData as any).get !== 'function') {
        onCrosshairMoveRef.current?.(null);
        return;
      }

      const mainSeries = mainSeriesRef.current || candleSeriesRef.current;
      // FIX: guard against undefined/stale series before calling .get()
      // candleSeries (closure) may be stale after chart reinit — use refs
      const activeSeries = mainSeriesRef.current || candleSeriesRef.current || mainSeries;
      let candleData: any = null;
      try {
        if (activeSeries) candleData = seriesData.get(activeSeries as any) as any;
        // Fallback: iterate seriesData to find any valid candle entry
        if (!candleData && (seriesData as any).forEach) {
          (seriesData as any).forEach((v: any) => {
            if (!candleData && v && typeof v.close === 'number') candleData = v;
          });
        }
      } catch {
        candleData = null;
      }
      if (!candleData) {
        onCrosshairMoveRef.current?.(null);
        return;
      }

      const candles = candlesRef.current;
      const candleIdx = binarySearchByTime(candles, param.time as number);
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
        // FIX: lightweight-charts v5 CandlestickData has no 'volume' field —
        // volume lives in a separate HistogramSeries. Read from original
        // CandleData[] (which always has volume) instead of seriesData.
        volume: candleIdx >= 0 ? safeNum(candles[candleIdx].volume, 0) : 0,
        change,
        changePercent,
        dateStr,
      });
    } catch (e) {
      // Silently ignore any lightweight-charts internal errors in crosshair handler
      onCrosshairMoveRef.current?.(null);
    }
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
          // onDrawingChange callback — triggers auto-save when drawings are completed/dragged
          () => { debouncedSaveChartStateRef.current(); },
        );
        // Use the LATEST activeTool from state, not the stale closure value.
        // This fixes a race condition where the user clicks a tool before
        // the dynamic import resolves — the old value would be 'cursor'.
        const currentTool = activeToolRef.current ?? activeTool;
        renderer.setTool(currentTool);
        renderer.start();
        drawingRendererRef.current = renderer as any;
      }).catch(console.error);
    }

    // ── Init Keyboard Shortcuts ──
    if (!shortcutsRef.current) {
      shortcutsRef.current = new KeyboardShortcuts({
        togglePlayPause: () => setIsPaused(p => !p),
        zoomIn: () => chart.timeScale().applyOptions({ barSpacing: Math.min(50, (chart.timeScale().options().barSpacing || 12) + 2) }),
        zoomOut: () => chart.timeScale().applyOptions({ barSpacing: Math.max(3, (chart.timeScale().options().barSpacing || 10) - 2) }),
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
      // PERF: Cancel any pending rAF-buffered candle update
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
      rafBufferRef.current = null;
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
      // Clean up debounced indicator refresh timer
      if (indicatorRefreshTimerRef.current) {
        clearTimeout(indicatorRefreshTimerRef.current);
        indicatorRefreshTimerRef.current = null;
      }
      if (shortcutsRef.current) {
        shortcutsRef.current.detach();
      }
      // Save chart state on unmount (page navigation)
      saveChartState();
      // Clear auto-save timers
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (visibleRangeTimerRef.current) clearTimeout(visibleRangeTimerRef.current);
    };
  // initChart is now stable (empty deps), so this runs only on mount/unmount
  }, [initChart]);

  // ── Handle symbol change: clear data without destroying chart ──
  // FIX: Use only `symbol` as dependency. Previously, `saveChartState` and
  // `restoreChartState` were also dependencies. When `restoreChartState` changed
  // settings (e.g., chart type), `saveChartState` was recreated, causing this
  // effect to fire AGAIN. The second run would call setData([]) AFTER the fetch
  // had already loaded new data, making candles disappear.
  //
  // Now, save/restore are done via refs to prevent re-triggering.
  const saveChartStateRef = useRef(saveChartState);
  saveChartStateRef.current = saveChartState; // SYNC: No useEffect — avoids stale closure for 1 render
  const debouncedSaveChartStateRef = useRef(debouncedSaveChartState);
  debouncedSaveChartStateRef.current = debouncedSaveChartState; // SYNC
  const restoreChartStateRef = useRef(restoreChartState);
  restoreChartStateRef.current = restoreChartState; // SYNC

  // FIX: Track previous symbol/timeframe to save state for the CORRECT (old)
  // symbol/timeframe on switch. Previously, saveChartState captured the NEW
  // symbol because the ref was already updated by the time the effect ran.
  const prevSymbolRef = useRef(symbol);
  const prevTimeframeRef = useRef(timeframe);

  // ── beforeunload: Force-save chart state before page refresh/close ──
  // React cleanup effects may not execute reliably during page unload.
  // This ensures indicators, settings, and other state are persisted
  // even when the user refreshes or closes the tab.
  useEffect(() => {
    const handleBeforeUnload = () => {
      try { saveChartStateRef.current(); } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    // FIX: Guard against clearing data that was already loaded for the
    // NEW symbol. This happens when restoreChartState triggers a settings
    // change → re-render → this effect re-fires with the same symbol.
    // Without this guard, the effect clears data that was JUST set by the
    // fetch, causing candles to disappear on symbol switch.
    const currentDataKey = `${symbol}:${timeframe}`;
    if (lastLoadedDataKeyRef.current === currentDataKey && candlesRef.current.length > 0) {
      // Data for the current symbol+timeframe is already loaded — skip clearing.
      // Only update the drawing manager and restore chart state.
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setSymbol(symbol);
      }
      drawingRendererRef.current?.redraw();
      restoreChartStateRef.current();
      console.log(`[useChart] Symbol effect SKIPPED clearing — data already loaded for ${currentDataKey} (${candlesRef.current.length} candles)`);
      return;
    }

    console.log(`[useChart] Symbol change: prev=${prevSymbolRef.current} → new=${symbol}, clearing data...`);

    // FIX: Save state for the PREVIOUS symbol before switching.
    // We must save using prevSymbolRef because saveChartState captures the
    // current `symbol` from the closure — which is already the NEW symbol
    // by the time this effect runs. So we manually save for the old one.
    if (restoredConfigRef.current && prevSymbolRef.current !== symbol) {
      try {
        const store = useChartStateStore.getState();
        const oldSymbol = prevSymbolRef.current;
        const indicators: SerializedIndicator[] = Array.from(activeIndicatorsRef.current.values()).map(ind => ({
          key: ind.key, params: ind.params, color: ind.color, opacity: ind.opacity, visible: ind.visible,
        }));
        const drawings = drawingManagerRef.current?.getAll() || [];
        store.saveChartConfig(oldSymbol, prevTimeframeRef.current, {
          chartType: settings.type, settings, indicators, drawings, activeTool,
          visibleRange: null, // Can't capture old visible range reliably
        });
      } catch { /* ignore save errors during symbol switch */ }
    }
    prevSymbolRef.current = symbol;

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
    externalSeriesRef.current.forEach((series) => {
      try { chartInstanceRef.current?.removeSeries(series); } catch {}
    });
    externalSeriesRef.current.clear();
    // Clear candle + volume data so chart is blank while new data loads
    candlesRef.current = [];
    pendingCandlesRef.current = null;
    // Reset the data key since we're clearing for a new symbol
    lastLoadedDataKeyRef.current = '';
    // PERF: Cancel any pending rAF-buffered candle update from old symbol
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = 0;
    rafBufferRef.current = null;
    // Cancel debounced indicator refresh
    if (indicatorRefreshTimerRef.current) {
      clearTimeout(indicatorRefreshTimerRef.current);
      indicatorRefreshTimerRef.current = null;
    }
    try {
      candleSeriesRef.current?.setData([] as any);
      volumeSeriesRef.current?.setData([] as any);
    } catch { /* series might not exist yet on first render */ }
    // FIX: Clear active indicators BOTH via React state AND directly via ref.
    // Previously only setState was called in symbol useEffect (unlike timeframe
    // useEffect which did both). This caused stale indicators to be re-applied
    // by setCandles, potentially causing "Value is null" errors.
    setActiveIndicators(new Map());
    activeIndicatorsRef.current = new Map();
    // Clear indicator cache when symbol changes — data is completely different
    indicatorCacheRef.current.clear();
    // Clear price lines using proper lightweight-charts v5 API
    priceLinesRef.current.forEach((line) => {
      try { candleSeriesRef.current?.removePriceLine(line); } catch {}
    });
    priceLinesRef.current.clear();
    // FIX: Clear markers when symbol changes — they are symbol-specific.
    // Previously only timeframe useEffect cleared markers, causing stale
    // markers from the old symbol to be re-applied after setCandles.
    markersRef.current = [];
    if (markersPluginRef.current) {
      try { markersPluginRef.current.setMarkers([]); } catch {}
    }

    // Restore chart state for the new symbol
    // FIX: Use ref to call the latest restoreChartState without adding it
    // as a dependency (which would cause the effect to re-fire).
    restoreChartStateRef.current();
  // FIX: Only depend on `symbol`. Using refs for save/restore prevents
  // the effect from re-firing when those functions are recreated.
  }, [symbol]);

  // ── Handle timeframe change: clear indicators and data to prevent "Value is null" ──
  // FIX: Same pattern as symbol useEffect — use refs for save/restore to prevent
  // the effect from re-firing when those functions are recreated.
  useEffect(() => {
    // FIX: Same guard as [symbol] effect — skip clearing if data for the
    // current symbol+timeframe was already successfully loaded.
    const currentDataKey = `${symbol}:${timeframe}`;
    if (lastLoadedDataKeyRef.current === currentDataKey && candlesRef.current.length > 0) {
      console.log(`[useChart] Timeframe effect SKIPPED clearing — data already loaded for ${currentDataKey}`);
      return;
    }

    // FIX: Save state for the PREVIOUS timeframe before switching.
    // Same pattern as symbol switch — save for old timeframe explicitly.
    if (restoredConfigRef.current && prevTimeframeRef.current !== timeframe) {
      try {
        const store = useChartStateStore.getState();
        const oldTf = prevTimeframeRef.current;
        const indicators: SerializedIndicator[] = Array.from(activeIndicatorsRef.current.values()).map(ind => ({
          key: ind.key, params: ind.params, color: ind.color, opacity: ind.opacity, visible: ind.visible,
        }));
        const drawings = drawingManagerRef.current?.getAll() || [];
        store.saveChartConfig(symbol, oldTf, {
          chartType: settings.type, settings, indicators, drawings, activeTool,
          visibleRange: null,
        });
      } catch { /* ignore save errors during timeframe switch */ }
    }
    prevTimeframeRef.current = timeframe;

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
    // Reset the data key since we're clearing for a new timeframe
    lastLoadedDataKeyRef.current = '';
    // PERF: Cancel any pending rAF-buffered candle update from old timeframe
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = 0;
    rafBufferRef.current = null;
    // Cancel debounced indicator refresh
    if (indicatorRefreshTimerRef.current) {
      clearTimeout(indicatorRefreshTimerRef.current);
      indicatorRefreshTimerRef.current = null;
    }
    try {
      candleSeriesRef.current?.setData([] as any);
      volumeSeriesRef.current?.setData([] as any);
    } catch { /* series might not exist yet on first render */ }
    // FIX: Clear active indicators BOTH via React state AND directly via ref.
    setActiveIndicators(new Map());
    activeIndicatorsRef.current = new Map();
    // Clear indicator cache when timeframe changes — data is completely different
    indicatorCacheRef.current.clear();
    // Clear price lines using proper lightweight-charts v5 API
    priceLinesRef.current.forEach((line) => {
      try { candleSeriesRef.current?.removePriceLine(line); } catch {}
    });
    priceLinesRef.current.clear();
    // Clear markers (they are timeframe-dependent)
    markersRef.current = [];
    if (markersPluginRef.current) {
      try { markersPluginRef.current.setMarkers([]); } catch {}
    }

    // Restore chart state for the new timeframe
    restoreChartStateRef.current();
  // FIX: Only depend on `timeframe`. Using refs for save/restore prevents
  // the effect from re-firing when those functions are recreated.
  }, [timeframe]);

  // ── Apply pending candles when chart becomes ready ──
  // NOTE: This useEffect MUST come after setCandles is defined to avoid TDZ error
  // (moved from earlier in the function where setCandles was not yet declared)

  // ── Restore chart state on initial mount ──
  useEffect(() => {
    if (isChartReady) {
      restoreChartState();
    }
  }, [isChartReady, restoreChartState]);

  // ── Subscribe to visible range changes for auto-save ──
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;

    const handler = () => {
      saveVisibleRange();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {}
    };
  }, [isChartReady, saveVisibleRange]);

  // ── Auto-save settings when they change ──
  useEffect(() => {
    if (restoredConfigRef.current) {
      debouncedSaveChartState();
    }
  }, [settings, debouncedSaveChartState]);

  // ── Auto-save active tool when it changes ──
  useEffect(() => {
    if (restoredConfigRef.current) {
      debouncedSaveChartState();
    }
  }, [activeTool, debouncedSaveChartState]);



  // ── Update Last Candle (live tick) ─────────────────────
  const updateLastCandle = useCallback((price: number) => {
    if (isPaused || !candleSeriesRef.current || !candlesRef.current.length) return;

    const candles = candlesRef.current;
    const last = candles[candles.length - 1];
    // FIX: Sanitize time to prevent "Cannot update oldest data, last time=[object Object]"
    const lastTime = sanitizeTime(last.time);
    if (lastTime === null) return; // Invalid time — skip this update entirely

    const updated = { ...last, time: lastTime, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) };
    // FIX: Sanitize OHLC — near-flat candles from Binance 1m/5m data render as dots.
    const s = sanitizeOhlc(updated.open, updated.high, updated.low, updated.close);
    const sanitized = { ...updated, open: s.open, high: s.high, low: s.low, close: s.close };
    candlesRef.current = [...candles.slice(0, -1), sanitized]; // Immutable update to avoid stale refs

    if (!candleSeriesRef.current) return; // Chart was destroyed — skip update

    if (settings.type === 'line' || settings.type === 'area') {
      // FIX C5: Line/Area series use {time, value} format, not OHLC
      try {
        candleSeriesRef.current.update({
          time: lastTime as Time,
          value: sanitized.close,
        } as any);
      } catch { /* chart was destroyed between the null check and update */ }
    } else if (settings.type === 'heikin-ashi') {
      // Only recalculate last candle for HA, not entire series
      const prevCandle = candles.length > 1 ? candles[candles.length - 2] : sanitized;
      const haClose = (sanitized.open + sanitized.high + sanitized.low + sanitized.close) / 4;
      const haOpen = prevCandle === sanitized ? (sanitized.open + haClose) / 2 : (prevCandle.open + prevCandle.close) / 2;
      const haHigh = Math.max(sanitized.high, haOpen, haClose);
      const haLow = Math.min(sanitized.low, haOpen, haClose);
      const lastDisplay = { ...sanitized, open: haOpen, high: haHigh, low: haLow, close: haClose };
      try { candleSeriesRef.current.update({
        time: lastTime as Time, open: lastDisplay.open, high: lastDisplay.high, low: lastDisplay.low, close: lastDisplay.close,
      } as any);
      } catch { /* chart was destroyed between the null check and update */ }
    } else {
      try {
        candleSeriesRef.current.update({
          time: lastTime as Time, open: sanitized.open, high: sanitized.high, low: sanitized.low, close: sanitized.close,
        } as any);
      } catch { /* chart was destroyed between the null check and update */ }
    }

    // Update volume — use `sanitized` (not `last`) for correct color after price change
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.update({
        time: lastTime as Time,
        value: last.volume,
        color: sanitized.close >= sanitized.open ? SHARED_COLORS.volumeUp : SHARED_COLORS.volumeDown,
      } as any);
      // FIX: If volume was previously all-zero (histogram hidden) but this tick
      // has non-zero volume, make the histogram visible again.
      if (last.volume > 0 && !hasVolumeRef.current) {
        hasVolumeRef.current = true;
        volumeSeriesRef.current.applyOptions({
          visible: settings.showVolume,
        });
      }
    }
  }, [isPaused, settings.type]);

  // ── Refresh Indicators Data In-Place ─────────────────────
  // Recalculates all active indicators and updates their series
  // data using series.setData() instead of remove + recreate.
  // Called on a debounce after WS updates for real-time indicators.
  const refreshIndicatorsData = useCallback(async () => {
    const chart = chartInstanceRef.current;
    if (!chart || !candlesRef.current.length) return;

    const activeIndicators = activeIndicatorsRef.current;
    if (activeIndicators.size === 0) return;

    const { calculateIndicator } = await import('../lib/charts/IndicatorCalculator');
    const { updateIndicatorSeriesData } = await import('../lib/charts/chart-indicator-renderer');
    const { LineSeries, AreaSeries, HistogramSeries: LCHistogram } = await import('lightweight-charts');

    for (const [_, indicator] of activeIndicators) {
      try {
        // Check cache first
        const paramsHash = hashIndicatorParams(indicator);
        const dataSig = getDataSignature();
        const cacheKey = indicator.key;
        const cached = indicatorCacheRef.current.get(cacheKey);

        let results: any[];
        if (cached && cached.paramsHash === paramsHash && cached.dataSignature === dataSig && cached.results.length > 0) {
          results = cached.results;
        } else {
          results = await calculateIndicator(indicator, candlesRef.current);
          if (!results.length) continue;
          indicatorCacheRef.current.set(cacheKey, {
            paramsHash,
            dataSignature: dataSig,
            results,
          });
        }

        // Try in-place update first
        const { missingKeys } = updateIndicatorSeriesData(
          { overlaySeries: overlaySeriesRef.current, oscillatorSeries: oscillatorSeriesRef.current },
          indicator,
          results,
          candlesRef.current,
        );

        // If any series are missing (e.g., new indicator), fall back to full render
        if (missingKeys.length > 0) {
          const { renderIndicatorSeries } = await import('../lib/charts/chart-indicator-renderer');
          // Remove existing series for this indicator first
          const existingKeys = Array.from(overlaySeriesRef.current.keys()).filter(k => k.startsWith(indicator.key));
          existingKeys.forEach(k => {
            const s = overlaySeriesRef.current.get(k);
            if (s) { try { chart.removeSeries(s); } catch {} overlaySeriesRef.current.delete(k); }
          });
          const existingOscKeys = Array.from(oscillatorSeriesRef.current.keys()).filter(k => k.startsWith(indicator.key));
          existingOscKeys.forEach(k => {
            const s = oscillatorSeriesRef.current.get(k);
            if (s) { try { chart.removeSeries(s); } catch {} oscillatorSeriesRef.current.delete(k); }
          });
          renderIndicatorSeries(chart, {
            overlaySeries: overlaySeriesRef.current,
            oscillatorSeries: oscillatorSeriesRef.current,
          }, indicator, results, candlesRef.current, { LineSeries, AreaSeries, HistogramSeries: LCHistogram });
        }
      } catch (e) {
        console.warn(`[useChart] refreshIndicatorsData error for ${indicator.key}:`, e);
      }
    }
  }, [hashIndicatorParams, getDataSignature]);

  // ── Fast Incremental Candle Update (rAF-batched) ──────
  // Used by WebSocket onCandleUpdate for updating EXISTING candles.
  // Uses lightweight-charts' update() API instead of setData() —
  // this is O(1) instead of O(n log n) and avoids destroying/recreating
  // indicator series. Only use this when the candle time already
  // exists in the data (i.e., the last candle is being updated).
  // For NEW candles (new time period), use setCandles() instead.
  //
  // PERF: rAF-batched — buffers the latest candle and flushes once per
  // animation frame. If multiple WS messages arrive between frames,
  // only the latest value is applied (intermediate values are dropped).
  // This reduces chart updates from potentially 10-50/s to max 60/s
  // (browser refresh rate), cutting CPU usage by 80%+ during fast markets.
  const _flushUpdateCandle = useCallback((candle: CandleData) => {
    if (isPaused || !candleSeriesRef.current) return;

    const time = sanitizeTime(candle.time);
    if (time === null) return;

    const candles = candlesRef.current;
    const lastCandle = candles[candles.length - 1];

    // Only use incremental update for the LAST candle
    // (which is the one WebSocket updates in real-time)
    if (lastCandle && lastCandle.time === time) {
      // FIX: Sanitize OHLC — near-flat candles from Binance 1m/5m data render as dots.
      const s = sanitizeOhlc(candle.open, candle.high, candle.low, candle.close);
      const updated = { ...candle, time, open: s.open, high: s.high, low: s.low, close: s.close };
      candles[candles.length - 1] = updated;

      // FIX C5: For Line/Area chart types, the series expects {time, value} format,
      // NOT {time, open, high, low, close}. Sending OHLC data to a Line/Area series
      // causes a silent error and the chart stops updating. This was the root cause
      // of "candles disappear after switching to Line/Area type" bug.
      const chartType = settings.type;
      if (chartType === 'line' || chartType === 'area') {
        try {
          candleSeriesRef.current.update({
            time: time as Time,
            value: updated.close,
          } as any);
        } catch { /* chart destroyed */ }
      } else if (chartType === 'heikin-ashi') {
        const prev = candles.length > 1 ? candles[candles.length - 2] : updated;
        const haClose = (updated.open + updated.high + updated.low + updated.close) / 4;
        const haOpen = prev === updated ? (updated.open + haClose) / 2 : (prev.open + prev.close) / 2;
        const haHigh = Math.max(updated.high, haOpen, haClose);
        const haLow = Math.min(updated.low, haOpen, haClose);
        try {
          candleSeriesRef.current.update({
            time: time as Time, open: haOpen, high: haHigh, low: haLow, close: haClose,
          } as any);
        } catch { /* chart destroyed */ }
      } else {
        // Candlestick, Hollow, Bar types — use OHLC format
        try {
          candleSeriesRef.current.update({
            time: time as Time,
            open: updated.open, high: updated.high, low: updated.low, close: updated.close,
          } as any);
        } catch { /* chart destroyed */ }
      }

      // Update volume
      if (volumeSeriesRef.current) {
        try {
          volumeSeriesRef.current.update({
            time: time as Time,
            value: candle.volume || 0,
            color: updated.close >= updated.open ? SHARED_COLORS.volumeUp : SHARED_COLORS.volumeDown,
          } as any);
        } catch { /* chart destroyed */ }
      }

      // PERF: Schedule debounced indicator refresh after WS candle update.
      // This ensures indicators update with real-time data without
      // the overhead of removing/recreating series on every tick.
      if (indicatorRefreshTimerRef.current) clearTimeout(indicatorRefreshTimerRef.current);
      indicatorRefreshTimerRef.current = setTimeout(() => {
        refreshIndicatorsData();
        indicatorRefreshTimerRef.current = null;
      }, 500); // 500ms debounce — balances responsiveness with performance
    }
  }, [isPaused, settings.type, refreshIndicatorsData]);

  const updateCandle = useCallback((candle: CandleData) => {
    // Buffer the latest candle — if another update arrives before this
    // frame is painted, it overwrites the buffer (we only care about
    // the most recent value, not intermediate ones).
    rafBufferRef.current = candle;

    // Schedule a flush if one isn't already pending
    if (rafIdRef.current === 0) {
      rafIdRef.current = requestAnimationFrame(() => {
        const buffered = rafBufferRef.current;
        rafBufferRef.current = null;
        rafIdRef.current = 0;
        if (buffered) {
          _flushUpdateCandle(buffered);
        }
      });
    }
  }, [_flushUpdateCandle]);

  // ── Add Indicator ──────────────────────────────────────
  const addIndicator = useCallback(async (indicator: ActiveIndicator) => {
    const chart = chartInstanceRef.current;
    if (!chart || !candlesRef.current.length) return;

    // Update both React state AND ref immediately.
    // The ref is used by getActiveIndicators() (which is called by
    // ChartControlAPI.getChartState() for template saving) and must
    // be up-to-date even before React re-renders.
    setActiveIndicators(prev => {
      const next = new Map(prev);
      next.set(indicator.key, indicator);
      activeIndicatorsRef.current = next; // Sync ref immediately
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

    // Calculate indicator data — use cache if available
    const paramsHash = hashIndicatorParams(indicator);
    const dataSig = getDataSignature();
    const cacheKey = indicator.key;
    const cached = indicatorCacheRef.current.get(cacheKey);

    let results: any[];
    if (cached && cached.paramsHash === paramsHash && cached.dataSignature === dataSig && cached.results.length > 0) {
      // Cache HIT — reuse previous calculation results
      results = cached.results;
    } else {
      // Cache MISS — recalculate and store
      const { calculateIndicator } = await import('../lib/charts/IndicatorCalculator');
      results = await calculateIndicator(indicator, candlesRef.current);
      if (!results.length) return;

      // Store in cache
      indicatorCacheRef.current.set(cacheKey, {
        paramsHash,
        dataSignature: dataSig,
        results,
      });
    }

    const { LineSeries, AreaSeries, HistogramSeries: LCHistogram } = await import('lightweight-charts');

    // Delegate indicator series rendering to the extracted utility
    // (reduces this callback from ~500 lines to a single call)
    const { renderIndicatorSeries } = await import('../lib/charts/chart-indicator-renderer');
    renderIndicatorSeries(chart, {
      overlaySeries: overlaySeriesRef.current,
      oscillatorSeries: oscillatorSeriesRef.current,
    }, indicator, results, candlesRef.current, { LineSeries, AreaSeries, HistogramSeries: LCHistogram });
  }, [hashIndicatorParams, getDataSignature]);

  // ── Set Candles ────────────────────────────────────────
  const setCandles = useCallback((candles: CandleData[], options?: { clearExternal?: boolean; skipIndicatorRebuild?: boolean }) => {
    // FIX: Store SANITIZED + SORTED candles — not raw data.
    // Previously, candlesRef.current stored unsorted data, but binarySearchByTime
    // and updateCandle both assume ascending time order. This caused wrong
    // crosshair data, wrong indicator values, and wrong volume display.
    // Now we sort FIRST, then sanitize, then store.
    let sorted = [...candles].sort((a, b) => a.time - b.time);
    // PERF: Limit candle count to prevent performance degradation
    if (sorted.length > MAX_VISIBLE_CANDLES) {
      sorted = sorted.slice(sorted.length - MAX_VISIBLE_CANDLES);
    }
    candlesRef.current = sorted.map(c => {
      const s = sanitizeOhlc(c.open, c.high, c.low, c.close);
      return { ...c, open: s.open, high: s.high, low: s.low, close: s.close };
    });

    // If chart isn't ready yet, store data as pending and return
    if (!candleSeriesRef.current || !volumeSeriesRef.current) {
      pendingCandlesRef.current = sorted;
      return;
    }

    // Apply Heikin-Ashi if needed
    const displayCandles = settings.type === 'heikin-ashi' ? toHeikinAshi(sorted) : sorted;

    // PERF: When skipIndicatorRebuild is true (e.g., WebSocket append), we skip
    // the expensive indicator removal/recreation cycle. Indicators remain visible
    // with slightly stale data for the last point, which is acceptable since:
    // 1. Most indicators are calculated on close — the current forming candle
    //    is provisional anyway
    // 2. Indicators are periodically recalculated (throttled by pendingIndicatorRafRef)
    // 3. This avoids destroying/recreating 5-15 series objects per tick
    const skipIndicators = options?.skipIndicatorRebuild ?? false;

    const chart = chartInstanceRef.current;
    if (chart && !skipIndicators) {
      // FIX: Remove overlay/oscillator series BEFORE calling setData.
      // These are indicator series (MA, RSI, etc.) whose data depends on
      // candle values, so they must be removed and re-applied after setData.
      // They are re-created later in this function.
      overlaySeriesRef.current.forEach((series) => {
        try { chart.removeSeries(series); } catch {}
      });
      overlaySeriesRef.current.clear();
      oscillatorSeriesRef.current.forEach((series) => {
        try { chart.removeSeries(series); } catch {}
      });
      oscillatorSeriesRef.current.clear();
    }

    if (chart) {
      // FIX: Only remove external series (AI overlays) when explicitly
      // requested via clearExternal option. This should ONLY be true when
      // the timeframe/symbol changes, NOT on regular WebSocket updates.
      if (options?.clearExternal) {
        externalSeriesRef.current.forEach((series) => {
          try { chart.removeSeries(series); } catch {}
        });
        externalSeriesRef.current.clear();
      }
    }

    // Cancel any previously scheduled indicator re-apply
    cancelAnimationFrame(pendingIndicatorRafRef.current);
    pendingIndicatorRafRef.current = 0;

    // Format for lightweight-charts with null/NaN filtering
    // FIX: Filter out any data points with invalid values that would
    // crash lightweight-charts (null, undefined, NaN, Infinity)
    // Also sanitize time to ensure it's always a Unix timestamp number,
    // never a Date object or string (prevents "Cannot update oldest data" fatal error).
    //
    // FIX: Also validate OHLC relationships and auto-correct:
    // - high must be >= max(open, close)
    // - low must be <= min(open, close)
    // - flat candles (open===high===low===close) get a tiny range to render
    //   as visible candles instead of dots
    const chartData = displayCandles
      .map(c => ({ ...c, time: sanitizeTime(c.time) }))
      .filter(c => isValidNumber(c.open) && isValidNumber(c.high) && isValidNumber(c.low) && isValidNumber(c.close) && isValidNumber(c.time) && c.close > 0)
      .map(c => {
        const s = sanitizeOhlc(c.open, c.high, c.low, c.close);
        return {
          time: c.time as Time,
          open: s.open,
          high: s.high,
          low: s.low,
          close: s.close,
        };
      });

    const volumeData = sorted
      .map(c => ({ ...c, time: sanitizeTime(c.time) }))
      .filter(c => isValidNumber(c.volume) && isValidNumber(c.time))
      .map(c => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? SHARED_COLORS.volumeUp : SHARED_COLORS.volumeDown,
      }));

    // FIX: Hide volume histogram when all values are zero (e.g. forex/commodity
    // sources don't provide volume). Showing an empty zero-height histogram
    // wastes chart space and confuses users.
    const hasVolume = volumeData.some(v => v.value > 0);
    hasVolumeRef.current = hasVolume;

    try {
      candleSeriesRef.current.setData(chartData as any);
      volumeSeriesRef.current.setData(volumeData as any);
      volumeSeriesRef.current.applyOptions({
        visible: hasVolume && (settings?.showVolume !== false),
      });
      // FIX: Mark that data was successfully loaded for this symbol+timeframe.
      // This prevents the [symbol] effect from accidentally clearing data
      // that was JUST set by the fetch (race condition on symbol switch).
      lastLoadedDataKeyRef.current = `${symbol}:${timeframe}`;
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
            if (_cachedCreateSeriesMarkers) {
              markersPluginRef.current = _cachedCreateSeriesMarkers(series as any, storedMarkers);
            }
          } else {
            markersPluginRef.current.setMarkers(storedMarkers);
          }
        } catch { /* ignore */ }
      }
    }

    // PERF: Only rebuild indicators when skipIndicators is false.
    // For WebSocket updates (skipIndicators=true), indicators stay visible
    // with slightly stale last-point data. They'll be refreshed periodically
    // or when the user explicitly requests it.
    if (!skipIndicators) {
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
      activeIndicatorsRef.current = next; // Sync ref immediately
      return next;
    });
  }, []);

  // ── Get Active Indicators ──────────────────────────────
  // FIX: Use activeIndicatorsRef instead of activeIndicators state.
  // The state may be stale in closures (e.g., ChartControlAPI's getChartState)
  // because the API object is created once during registration and captures
  // the old `activeIndicators` value. The ref is always up-to-date.
  const getActiveIndicators = useCallback((): ActiveIndicator[] => {
    return Array.from(activeIndicatorsRef.current.values());
  }, []);

  // ── Set Chart Type ─────────────────────────────────────
  const setChartType = useCallback(async (type: ChartType) => {
    setSettings(prev => ({ ...prev, type }));

    const chart = chartInstanceRef.current;
    if (!chart || !candlesRef.current.length) return;

    // For heikin-ashi and candle, just re-set data on existing candlestick series
    if (type === 'candle' || type === 'heikin-ashi' || type === 'hollow') {
      const displayCandles = type === 'heikin-ashi' ? toHeikinAshi(candlesRef.current) : candlesRef.current;
      // FIX: Apply OHLC validation + flat candle fix (same as setCandles)
      // Without this, switching chart type re-introduces flat candles as dots.
      const chartData = displayCandles
        .filter(c => isValidNumber(c.open) && isValidNumber(c.high) && isValidNumber(c.low) && isValidNumber(c.close) && c.close > 0)
        .map(c => {
          let { open, high, low, close } = c;
          if (high < Math.max(open, close)) high = Math.max(open, close);
          if (low > Math.min(open, close)) low = Math.min(open, close);
          if (high === low) {
            const tick = close * 0.0001;
            high += tick;
            low -= tick;
          }
          return {
            time: c.time as Time,
            open,
            high,
            low,
            close,
          };
        });

      // Apply hollow candle style
      if (type === 'hollow' && candleSeriesRef.current) {
        candleSeriesRef.current.applyOptions({
          upColor: 'transparent',
          downColor: CHART_OPTIONS_COLORS.downColor,
          borderUpColor: CHART_OPTIONS_COLORS.upColor,
          borderDownColor: CHART_OPTIONS_COLORS.downColor,
          wickUpColor: CHART_OPTIONS_COLORS.upWick,
          wickDownColor: CHART_OPTIONS_COLORS.downWick,
        });
      } else if (candleSeriesRef.current) {
        candleSeriesRef.current.applyOptions({
          upColor: CHART_OPTIONS_COLORS.upColor,
          downColor: CHART_OPTIONS_COLORS.downColor,
          borderUpColor: CHART_OPTIONS_COLORS.upColor,
          borderDownColor: CHART_OPTIONS_COLORS.downColor,
          wickUpColor: CHART_OPTIONS_COLORS.upWick,
          wickDownColor: CHART_OPTIONS_COLORS.downWick,
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
        color: CHART_OPTIONS_COLORS.upColor,
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
        lineColor: CHART_OPTIONS_COLORS.upColor,
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
        upColor: CHART_OPTIONS_COLORS.upColor,
        downColor: CHART_OPTIONS_COLORS.downColor,
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
        color: c.close >= c.open ? SHARED_COLORS.volumeUp : SHARED_COLORS.volumeDown,
      }));
      const hasVol = volumeData.some(v => v.value > 0);
      hasVolumeRef.current = hasVol;
      volumeSeriesRef.current.setData(volumeData as any);
      volumeSeriesRef.current.applyOptions({
        visible: hasVol && settings.showVolume,
      });
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
    debouncedSaveChartState();
  }, [debouncedSaveChartState]);

  const removeDrawing = useCallback((id: string) => {
    drawingManagerRef.current?.delete(id);
    debouncedSaveChartState();
  }, [debouncedSaveChartState]);

  const clearDrawings = useCallback(() => {
    drawingManagerRef.current?.clearAll();
    drawingRendererRef.current?.clearAndRedraw();
    debouncedSaveChartState();
  }, [debouncedSaveChartState]);

  const getDrawings = useCallback((): Drawing[] => {
    return drawingManagerRef.current?.getAll() || [];
  }, []);

  const importDrawings = useCallback((drawings: Drawing[]) => {
    if (!drawingManagerRef.current) return;
    const adapted = drawings.map(d => ({ ...d, symbol }));
    drawingManagerRef.current.importDrawings(JSON.stringify(adapted));
    drawingRendererRef.current?.redraw();
    debouncedSaveChartState();
  }, [symbol, debouncedSaveChartState]);

  const setTool = useCallback((tool: DrawingTool) => {
    setActiveTool(tool);
    activeToolRef.current = tool; // Sync ref for lazy import race condition fix
    drawingRendererRef.current?.setTool(tool);
  }, []);

  const cancelDrawing = useCallback(() => {
    setActiveTool('cursor');
    activeToolRef.current = 'cursor'; // Sync ref
    drawingRendererRef.current?.setTool('cursor');
    drawingRendererRef.current?.cancelDrawing();
  }, []);

  // ── Zoom ───────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    chartInstanceRef.current?.timeScale().applyOptions({
      barSpacing: Math.min(50, (chartInstanceRef.current?.timeScale().options().barSpacing || 12) + 2),
    });
  }, []);

  const zoomOut = useCallback(() => {
    // FIX: Minimum barSpacing of 3 (matches minBarSpacing in chart-options.ts).
    // Allows zoom out to see many candles while keeping them visible.
    // enableConflation: false ensures OHLC data is preserved at all zoom levels.
    chartInstanceRef.current?.timeScale().applyOptions({
      barSpacing: Math.max(3, (chartInstanceRef.current?.timeScale().options().barSpacing || 10) - 2),
    });
  }, []);

  const resetView = useCallback(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;

    const candles = candlesRef.current;
    if (candles.length === 0) {
      chart.timeScale().fitContent();
      return;
    }

    // FIX: If there's a saved visible range for this symbol/timeframe, apply it.
    // This replaces the old setTimeout(1500ms) approach that caused race conditions.
    const savedRange = savedVisibleRangeRef.current;
    if (savedRange) {
      // Validate that the saved range overlaps with current data
      const dataFrom = candles[0].time;
      const dataTo = candles[candles.length - 1].time;
      if (savedRange.from >= dataFrom && savedRange.to <= dataTo + (dataTo - dataFrom) * 0.1) {
        // Saved range is within data bounds — apply it
        try {
          chart.timeScale().setVisibleRange({
            from: savedRange.from as Time,
            to: savedRange.to as Time,
          });
          // Clear the saved range after applying (one-time use per restore)
          savedVisibleRangeRef.current = null;
          return;
        } catch {
          // Saved range invalid — fall through to default behavior
        }
      }
      // Saved range doesn't match current data — clear it and use default
      savedVisibleRangeRef.current = null;
    }

    // Default: fitContent() respects minBarSpacing, so it won't compress
    // candles into dots. It shows as many candles as fit with the minimum
    // spacing, and the rest are accessible by scrolling left.
    chart.timeScale().fitContent();
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
            vertLine: { visible: true, color: isMobile ? 'rgba(160,200,220,0.7)' : CHART_OPTIONS_COLORS.crosshair, width: 1, style: 2, labelVisible: true, labelBackgroundColor: isMobile ? '#2a2e3e' : T.card },
            horzLine: { visible: true, color: isMobile ? 'rgba(160,200,220,0.7)' : CHART_OPTIONS_COLORS.crosshair, width: 1, style: 2, labelVisible: true, labelBackgroundColor: isMobile ? '#2a2e3e' : T.card },
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

    // Apply volume visibility — respect hasVolume guard
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({
        visible: hasVolumeRef.current && settings.showVolume,
      });
    }

    // Apply price line visibility
    // On mobile, always hide the built-in price line & last value label
    // to avoid duplicates with our custom overlay
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        priceLineVisible: settings.showPriceLine,  // MT5: always show
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
    // Apply drawings from template
    if (template.drawings && template.drawings.length > 0 && drawingManagerRef.current) {
      // Override the drawings' symbol to match current chart and import all at once
      const adaptedDrawings = template.drawings.map(d => ({ ...d, symbol }));
      drawingManagerRef.current.importDrawings(JSON.stringify(adaptedDrawings));
      drawingRendererRef.current?.redraw();
    }
    // Apply timeframe and chartType from template if they differ
    if (template.timeframe && template.timeframe !== timeframe) {
      // Let the parent component handle timeframe change if needed
    }
    if (template.chartType && template.chartType !== settings.type) {
      setSettings(prev => ({ ...prev, type: template.chartType }));
    }
  }, [addIndicator, symbol, timeframe, settings.type]);

  const getTemplates = useCallback(() => {
    return ChartTemplateManager.getAll();
  }, []);

  // ── Set Markers on Main Series ──
  const setMarkers = useCallback((markers: any[]) => {
    markersRef.current = markers;

    const apply = (attempt = 0) => {
      const series = mainSeriesRef.current || candleSeriesRef.current;
      if (!series) {
        if (attempt < 5) setTimeout(() => apply(attempt + 1), 300);
        return;
      }
      try {
        // Reset plugin each time to ensure correct series binding
        if (markersPluginRef.current) {
          try { markersPluginRef.current.setMarkers([]); } catch {}
          markersPluginRef.current = null;
        }
        if (markers.length > 0 && _cachedCreateSeriesMarkers) {
          markersPluginRef.current = _cachedCreateSeriesMarkers(series as any, markers);
        }
      } catch {
        markersPluginRef.current = null;
        if (attempt < 3) setTimeout(() => apply(attempt + 1), 500);
      }
    };

    apply();
  }, []);

  // ── Price Lines (for positions/trades) ──
  // priceLinesRef is already declared at the top with other refs

  // Direct access to candle series for external use
  const getCandleSeries = useCallback(() => candleSeriesRef.current || mainSeriesRef.current, []);

  // Track the last-set data for each price line ID to skip unchanged lines
  const priceLineDataRef = useRef<Map<string, { price: number; color: string; label: string; lineWidth: number; lineStyle: number; axisLabelVisible: boolean }>>(new Map());

  const addPriceLine = useCallback((id: string, price: number, color: string, label: string, lineWidth: number = 1, lineStyle: number = 2, axisLabelVisible: boolean = true) => {
    const doAdd = () => {
      if (!candleSeriesRef.current) return false;

      // FIX: Skip remove+recreate if the line data hasn't changed.
      // This is the KEY fix for "dancing" price lines — the old code always
      // removed and recreated lines even when price/color/label were identical,
      // causing a visible flicker on every renderOverlays() call.
      const lastData = priceLineDataRef.current.get(id);
      if (lastData &&
          lastData.price === price &&
          lastData.color === color &&
          lastData.label === label &&
          lastData.lineWidth === lineWidth &&
          lastData.lineStyle === lineStyle &&
          lastData.axisLabelVisible === axisLabelVisible) {
        // Data unchanged — skip the remove+recreate cycle entirely
        return true;
      }

      // Data changed — remove old line if exists
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
          lineStyle: lineStyle as any,
          axisLabelVisible: axisLabelVisible,
          title: label || '',
        });
        priceLinesRef.current.set(id, line);
        priceLineDataRef.current.set(id, { price, color, label, lineWidth, lineStyle, axisLabelVisible });
        return true;
      } catch (e) {
        return false;
      }
    };

    if (!doAdd()) {
      // Series not ready yet — single retry after a short delay.
      setTimeout(doAdd, 500);
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
    // Also clear the data cache for this ID
    priceLineDataRef.current.delete(id);
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
          vertTouchDrag: !isMobile,
        },
      });
    } else {
      // Normal mode: re-enable panning (restore original mobile settings)
      chart.applyOptions({
        handleScroll: {
          vertTouchDrag: !isMobile,
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
        const gridColor = updates.gridColor || (updates.showGrid ? CHART_OPTIONS_COLORS.grid : 'transparent');
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
          upColor: updates.upColor || CHART_OPTIONS_COLORS.upColor,
          downColor: updates.downColor || CHART_OPTIONS_COLORS.downColor,
          borderUpColor: updates.upColor || CHART_OPTIONS_COLORS.upColor,
          borderDownColor: updates.downColor || CHART_OPTIONS_COLORS.downColor,
          wickUpColor: updates.upColor || CHART_OPTIONS_COLORS.upWick,
          wickDownColor: updates.downColor || CHART_OPTIONS_COLORS.downWick,
        });
      }
      if (updates.showVolume !== undefined) {
        volumeSeriesRef.current?.applyOptions({
          visible: hasVolumeRef.current && updates.showVolume,
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
              vertLine: { visible: true, color: CHART_OPTIONS_COLORS.crosshair, width: 1, style: 2, labelVisible: true },
              horzLine: { visible: true, color: CHART_OPTIONS_COLORS.crosshair, width: 1, style: 2, labelVisible: true },
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
    updateCandle,
    updateLastCandle,
    addIndicator,
    removeIndicator,
    getActiveIndicators,
    setChartType,
    addDrawing,
    removeDrawing,
    clearDrawings,
    getDrawings,
    importDrawings,
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
    mainSeriesRef,
    candleSeriesRef,
    getCandleSeries,
  };
}
