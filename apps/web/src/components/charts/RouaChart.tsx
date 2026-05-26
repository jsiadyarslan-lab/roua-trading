// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Main Component
// Professional trading chart using lightweight-charts v5
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useChart } from '@/hooks/useChart';
import { useChartWebSocket } from '@/hooks/useChartWebSocket';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import { usePositionsStore } from '@/hooks/usePositionsStore';
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore';
import type { CandleData, CrosshairData, ChartType, DrawingTool, ActiveIndicator, AIPattern, NewsMarker } from '@/lib/charts/types';
import { TIMEFRAMES, INDICATOR_CONFIGS } from '@/lib/charts/types';
import { ChartToolbar } from './ChartToolbar';
import { CrosshairOverlay } from './CrosshairOverlay';
import { DrawingPanel } from './DrawingPanel';
import { IndicatorPanel } from './IndicatorPanel';
import { IndicatorSettings } from './IndicatorSettings';
import { VolumeProfile } from './VolumeProfile';
import { NewsMarkers, createNewsChartMarkers } from './NewsMarkers';
import { WatchlistOverlay } from './WatchlistOverlay';
import { AIPatternPanel } from './AIPatternPanel';
import { AISmartPanel } from './AISmartPanel';
import { runPatternEngine } from '@/lib/charts/pattern-engine';
import { drawAllPatterns, clearAllPatterns } from '@/lib/charts/pattern-renderer';
import { ChartTrading } from './ChartTrading';
import { QuickTradePanel } from './QuickTradePanel';
import { TemplateManager } from './TemplateManager';
import { ChartSettingsPanel } from './ChartSettingsPanel';
import { CompareOverlay } from './CompareOverlay';
import { MultiTimeframeChart } from './MultiTimeframeChart';
import { ChartGrid } from './ChartGrid';
import ShareChart from './ShareChart';
import { FootprintChart } from './FootprintChart';
import { AlertPanel } from './AlertPanel';
import { PatternProgress } from './PatternProgress';
import { DraggablePanel } from './DraggablePanel';
import { PriceAlertLine } from './PriceAlertLine';
import { ChartReplay } from './ChartReplay';
import { MiniHeatmap } from './MiniHeatmap';
import { fetchSignalsForChart, fetchStrategicBriefs, convertToChartMarkers } from '@/lib/charts/chart-signals';
import { CommandPalette, useCommandPalette, createChartCommands } from './CommandPalette';
import { cancelAnimatedPattern, getActiveAnimations } from '@/lib/charts/AnimatedPatterns';
import { createIncrementalState, initializeState, updateIncremental, needsFullRecalc } from '@/lib/charts/IncrementalCalc';
import { renderHeatmapOnChart, type HeatmapResult } from '@/lib/charts/ConfidenceHeatmap';
import { detectTrendLines } from './AIPatternPanel';
import type { AIAnalysisResult } from './AIPatternPanel';
import { T } from '@/lib/unified-tokens';
import { fmtPrice as unifiedFmtPrice } from '@/lib/price-format';
import { ScopedStyle } from '@/components/ScopedStyle';
import { useTranslations } from 'next-intl';

interface RouaChartProps {
  currentPrice?: number | null;
  mobile?: boolean;
  compact?: boolean;
  hideToolbar?: boolean;
  onExpand?: (() => void) | null;
  isChartFullscreen?: boolean;
  onToggleChartFullscreen?: () => void;
  // ── External toolbar control callbacks ──
  onToggleIndicators?: () => void;
  onToggleDrawings?: () => void;
  onSetTool?: (tool: DrawingTool) => void;
  onSetTimeframe?: (tf: string) => void;
  activeTool?: DrawingTool;
  chartType?: ChartType;
  onSetChartType?: (type: ChartType) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onTogglePause?: () => void;
  isPaused?: boolean;
  // Expose internal chart actions for external toolbar
  chartActions?: React.MutableRefObject<{
    toggleIndicators: () => void;
    toggleDrawings: () => void;
    setTool: (tool: DrawingTool) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    togglePause: () => void;
    setChartType: (type: ChartType) => void;
    isPaused: boolean;
    activeTool: DrawingTool;
    addPriceLine: (id: string, price: number, color: string, label: string, lineWidth?: number, lineStyle?: number, axisLabelVisible?: boolean) => void;
    removePriceLine: (id: string) => void;
    setCrosshairMode: (enabled: boolean) => void;
  } | null>;
  onCrosshairDataChange?: (data: CrosshairData | null) => void;
}

// ── Price-Synced Candle Timer Component ──
// Styled like a price-scale label: sits right below the last-price label
// on the right edge and changes color with candle direction (green/red).
function PriceSyncedTimer({ chart, currentPrice, countdown, isBull }: {
  chart: any; currentPrice: number; countdown: string; isBull: boolean;
}) {
  const [y, setY] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      const coord = chart.getPriceCoordinate(currentPrice);
      setY(coord);
    };
    update();
    const unsub = chart.onVisibleRangeChange(update);
    // PERF: 2000ms — price label coordinate doesn't need sub-second updates
    const interval = setInterval(update, 2000);
    return () => { unsub(); clearInterval(interval); };
  }, [chart, currentPrice]);

  if (y === null) return null;

  // Colors match the price-scale last-price label
  const bgColor = isBull ? '#3fb950' : '#f85149';

  return (
    <div
      style={{
        position: 'absolute',
        top: y + 11,        // directly below the price label (~20px tall + 1px gap)
        right: 0,
        zIndex: 5,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'flex-end',
        paddingRight: 2,    // flush with the price scale right edge
      }}
    >
      <div style={{
        background: bgColor,
        color: '#fff',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: '0 0 3px 3px',   // rounded bottom only (top sits under price label)
        minWidth: 44,
        textAlign: 'center',
        letterSpacing: 0.4,
        lineHeight: '14px',
        boxShadow: `0 2px 8px ${isBull ? 'rgba(63,185,80,0.35)' : 'rgba(248,81,73,0.35)'}`,
        borderLeft: `3px solid ${bgColor}`,
      }}>
        {countdown}
      </div>
    </div>
  );
}

export default function RouaChart({
  currentPrice = null,
  mobile = false,
  compact = false,
  hideToolbar = false,
  onExpand = null,
  isChartFullscreen = false,
  onToggleChartFullscreen,
  chartActions,
  onCrosshairDataChange,
}: RouaChartProps) {
  const tc = useTranslations('dashboard.chart');
  const { selectedSymbol, timeframe, setTimeframe } = useSymbolStore();
  const [crosshairData, setCrosshairData] = useState<CrosshairData | null>(null);
  const [feedState, setFeedState] = useState<'live' | 'fallback' | 'waiting'>('waiting');
  const [candleCountdown, setCandleCountdown] = useState('—');
  const [lotSize, setLotSize] = useState(0.01);
  const [tradePanelCollapsed, setTradePanelCollapsed] = useState(false);
  const [showDrawingPanel, setShowDrawingPanel] = useState(false);
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [settingsIndicator, setSettingsIndicator] = useState<ActiveIndicator | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // ── New Panel States ──
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPanelCandles, setAiPanelCandles] = useState<CandleData[]>([]);
  const [showChartTrading, setShowChartTrading] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState('');
  const [showMTF, setShowMTF] = useState(false);
  const [showChartGrid, setShowChartGrid] = useState(false);
  const [showShare, setShowShare] = useState(false);
  // ── 5 New Feature States ──
  const [showFootprint, setShowFootprint] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showPatternProgress, setShowPatternProgress] = useState(false);
  // ── 3 Revolutionary Feature States ──
  const [showReplay, setShowReplay] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showAIStream, setShowAIStream] = useState(false);
  // ── Quick Trade Panel State ──
  const [showQuickTrade, setShowQuickTrade] = useState(false);
  // ── Command Palette (Ctrl+K) ──
  const { isOpen: cmdPaletteOpen, setIsOpen: setCmdPaletteOpen } = useCommandPalette();
  // ── Incremental Calculation State ──
  const incrementalRef = useRef(createIncrementalState());
  const incrementalInitializedRef = useRef(false);
  // ── Heatmap Overlay State ──
  const heatmapSeriesRef = useRef<any[]>([]);
  const [priceAlertsCount, setPriceAlertsCount] = useState(0);
  const [councilSignal, setCouncilSignal] = useState<{ direction: 'bullish' | 'bearish' | 'neutral'; confidence: number } | null>(null);
  const [aiPatterns, setAiPatterns] = useState<AIPattern[]>([]);
  const [newsMarkers, setNewsMarkers] = useState<NewsMarker[]>([]);
  const positionLineIdsRef = useRef<string[]>([]);
  const signalLineIdsRef = useRef<string[]>([]);

  const candlesRef = useRef<CandleData[]>([]);
  const prevPriceRef = useRef(currentPrice);
  const [pricePulse, setPricePulse] = useState(false);

  // ── Track current timeframe to ignore stale WebSocket updates ──
  // When timeframe changes, WebSocket may still deliver candles from the
  // old timeframe before reconnecting. This ref lets us filter those out.
  const timeframeRef = useRef(timeframe);
  // FIX: Track when candlesRef was last cleared (timeframe change) so we can
  // timeout the "reject all WebSocket updates" guard. Previously, if the
  // historical fetch failed, the chart would stay empty forever because
  // candlesRef.current.length === 0 and all WebSocket updates were dropped.
  const candlesClearedAtRef = useRef(0);
  const CANDLES_CLEAR_TIMEOUT_MS = 10_000; // Allow WebSocket after 10s even if fetch failed
  useEffect(() => {
    timeframeRef.current = timeframe;
    // Clear RouaChart's candlesRef immediately on timeframe change
    // to prevent stale WebSocket onCandleUpdate from pushing old data
    candlesRef.current = [];
    candlesClearedAtRef.current = Date.now();
  }, [timeframe]);

  // ── Chart Hook ─────────────────────────────────────────
  const handleCrosshairMove = useCallback((data: CrosshairData | null) => {
    setCrosshairData(data);
    onCrosshairDataChange?.(data);
  }, [onCrosshairDataChange]);

  const chart = useChart({
    symbol: selectedSymbol,
    timeframe,
    onCrosshairMove: handleCrosshairMove,
    mobile,
  });

  // ── Expose chart actions to parent via chartActions ref ──
  useEffect(() => {
    if (chartActions) {
      chartActions.current = {
        toggleIndicators: () => setShowIndicatorPanel(prev => !prev),
        toggleDrawings: () => setShowDrawingPanel(prev => !prev),
        setTool: chart.setTool,
        zoomIn: chart.zoomIn,
        zoomOut: chart.zoomOut,
        togglePause: chart.togglePause,
        setChartType: chart.setChartType,
        isPaused: chart.isPaused,
        activeTool: chart.activeTool,
        addPriceLine: chart.addPriceLine,
        removePriceLine: chart.removePriceLine,
        setCrosshairMode: chart.setCrosshairMode,
      };
    }
  }, [chartActions, chart.setTool, chart.zoomIn, chart.zoomOut, chart.togglePause, chart.setChartType, chart.isPaused, chart.activeTool, chart.addPriceLine, chart.removePriceLine, chart.setCrosshairMode]);

  // ── Auto-run Pattern Engine when candles update ──
  // FIX: Throttled to run at most once every 30 seconds. Previously ran on
  // every WebSocket tick, causing excessive CPU usage and rapid series
  // creation/destruction cycles on the chart. Pattern detection is expensive
  // (ZigZag + 7 detectors) and doesn't need sub-minute updates.
  const lastPatternRunRef = useRef(0);
  const PATTERN_RUN_INTERVAL_MS = 30_000;
  // ── Ref for auto-drawn trend line series (cleared on re-run) ──
  const autoTrendSeriesRef = useRef<any[]>([]);

  // DISABLED: runPatternDetection auto-draws ALL patterns on chart without
  // any toggle control. This was the PRIMARY source of unwanted scribbles.
  // Pattern rendering is now exclusively controlled by overlay toggles
  // inside handlePatternsDetected — which respects user choices.
  // The function is kept as a stub in case we need it later for manual trigger.
  const runPatternDetection = useCallback(async () => {
    // No-op: patterns are only drawn via handlePatternsDetected with overlay toggles
    // This function is intentionally disabled to prevent auto-drawing.
  }, [chart.chartRef]);

  // ── Ref to always have the latest setCandles without stale closures ──
  // The fetch effect uses this ref instead of chart.setCandles directly,
  // ensuring it always calls the latest version even across re-renders.
  const setCandlesRef = useRef(chart.setCandles);
  useEffect(() => { setCandlesRef.current = chart.setCandles; }, [chart.setCandles]);

  // ── Ref to always have the latest resetView ──
  const resetViewRef = useRef(chart.resetView);
  useEffect(() => { resetViewRef.current = chart.resetView; }, [chart.resetView]);

  // ═══════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Remove AI overlay series when timeframe changes.
  //
  // AI overlay series (Area/Line from handlePatternsDetected) are stored
  // in aiOverlaySeriesRef — they are NOT tracked by useChart.ts's
  // overlaySeriesRef/oscillatorSeriesRef. When the timeframe changes,
  // these series still hold timestamps from the OLD timeframe. When
  // setCandles() triggers a chart re-render, lightweight-charts tries to
  // render these series at timestamps that no longer exist in the candle
  // data → "Value is null" crash.
  //
  // This was THE root cause of the persistent "Value is null" error that
  // occurred specifically when AI analysis was open and the user changed
  // the timeframe.
  // ═══════════════════════════════════════════════════════════════════
  // ── Compute the timeframe's interval in seconds ──
  const tfSeconds = useMemo(() => {
    const tf = TIMEFRAMES.find(t => t.value === timeframe);
    return (tf?.minutes || 15) * 60;
  }, [timeframe]);

  // ── WebSocket ──────────────────────────────────────────
  const ws = useChartWebSocket({
    symbol: selectedSymbol,
    timeframe,
    onCandleUpdate: (candle) => {
      // If candlesRef was just cleared (timeframe change in progress),
      // don't accept WebSocket candles until the fetch fills it again.
      // This prevents stale data from the old timeframe being pushed back.
      // FIX: After CANDLES_CLEAR_TIMEOUT_MS (10s), allow WebSocket updates
      // even if candlesRef is still empty. This prevents the chart from
      // staying blank forever if the historical fetch fails.
      if (candlesRef.current.length === 0) {
        const timeSinceClear = Date.now() - candlesClearedAtRef.current;
        if (timeSinceClear < CANDLES_CLEAR_TIMEOUT_MS) return;
        // Timeout reached — allow WebSocket to populate the chart
      }
      // Guard: don't update if chart hook is not ready
      if (!chart.setCandles) return;

      // FIX: Align candle timestamp to the current timeframe's interval.
      // WebSocket (especially Socket.IO ticker) may send candles at 1-minute
      // granularity regardless of the selected timeframe. We snap the time
      // to the nearest timeframe boundary so it matches the historical candles.
      const alignedTime = Math.floor(candle.time / tfSeconds) * tfSeconds;
      const alignedCandle = { ...candle, time: alignedTime };

      // Update or add candle
      const idx = candlesRef.current.findIndex(c => c.time === alignedTime);
      if (idx >= 0) {
        // Merge: keep the widest high/low, latest close
        const existing = candlesRef.current[idx];
        candlesRef.current[idx] = {
          ...existing,
          high: Math.max(existing.high, alignedCandle.high),
          low: Math.min(existing.low, alignedCandle.low),
          close: alignedCandle.close,
          volume: existing.volume + alignedCandle.volume,
        };
      } else {
        candlesRef.current.push(alignedCandle);
      }
      setCandlesRef.current(candlesRef.current);
      // REVOLUTIONARY: Incremental computation update (O(1) per candle)
      try {
        if (incrementalInitializedRef.current) {
          updateIncremental(incrementalRef.current, alignedCandle, candlesRef.current[candlesRef.current.length - 2]);
        }
      } catch { /* incremental update not critical */ }
    },
    onPriceUpdate: (price) => {
      chart.updateLastCandle(price);
      // Keep paper trades currentPrice in sync with live feed
      try {
        const { updatePrice } = usePaperTradesStore.getState();
        updatePrice(selectedSymbol, price);
      } catch { /* store may not be ready */ }
      // FIX: Also update exchange positions with live price from WebSocket
      // Previously only paper trades were updated — exchange positions showed stale prices
      try {
        const { updatePositionPrice } = usePositionsStore.getState();
        updatePositionPrice(selectedSymbol, price);
      } catch { /* store may not be ready */ }
      // Schedule overlay recalculation so trade markers stay aligned
      scheduleOverlayUpdateRef.current();
    },
    enabled: !chart.isPaused,
  });

  // ── Fetch Historical Candles ───────────────────────────
  useEffect(() => {
    let cancelled = false; // Guard against stale responses after symbol change

    const fetchCandles = async () => {
      try {
        setFeedState('waiting');
        const res = await fetch(`/api/exchange/history/${encodeURIComponent(selectedSymbol)}?interval=${timeframe}`);
        const j = await res.json();

        if (cancelled) return; // Symbol/timeframe changed while fetching — discard

        if (j.success && j.data && j.data.length > 0) {
          setFeedState('live');
          const formatted: CandleData[] = j.data
            .map((c: any) => ({
              time: Math.floor(new Date(c.timestamp).getTime() / 1000),
              open: Number(c.open) || 0,
              high: Number(c.high) || 0,
              low: Number(c.low) || 0,
              close: Number(c.close) || 0,
              volume: Number(c.volume) || 0,
            }))
            .filter(c => !isNaN(c.time) && c.time > 0 && !isNaN(c.open) && !isNaN(c.close));
          // Deduplicate by time
          const seen = new Set<number>();
          const unique = formatted.filter(c => {
            if (seen.has(c.time)) return false;
            seen.add(c.time);
            return true;
          });
          // Sort by time (lightweight-charts v5 requires strictly ascending time)
          unique.sort((a, b) => a.time - b.time);
          candlesRef.current = unique;
          // Run pattern engine after candles are updated
          // FIX: Use ref to avoid stale closure over chart.setCandles
          setCandlesRef.current(unique);
          // REVOLUTIONARY: Initialize incremental computation state
          try {
            const incState = incrementalRef.current;
            initializeState(incState, unique);
            incrementalInitializedRef.current = true;
          } catch { /* incremental calc not critical */ }
          // FIX: Auto-fit chart to show new timeframe data range.
          // Without this, the chart may keep the old scroll position and the
          // user sees blank or unchanged data even though new data was loaded.
          requestAnimationFrame(() => {
            if (!cancelled) resetViewRef.current();
          });
          // DISABLED: Auto-run pattern detection removed.
          // Patterns are ONLY drawn when the user explicitly enables overlay
          // toggles in the AI Smart Panel. Previously this auto-drew all
          // patterns on chart load, filling the chart with scribbles.
        } else {
          if (cancelled) return;
          setFeedState('fallback');
          // Generate simulated data as fallback
          generateSimulatedData();
        }
      } catch {
        if (cancelled) return;
        setFeedState('fallback');
        generateSimulatedData();
      }
    };

    const generateSimulatedData = () => {
      const price = currentPrice || 65000;
      const isJPY = selectedSymbol.includes('JPY');
      const isBTC = selectedSymbol.includes('BTC');
      const dp = isJPY ? 3 : isBTC ? 1 : 5;
      const tf = TIMEFRAMES.find(t => t.value === timeframe);
      const tfMinutes = tf?.minutes || 15;

      const candles: CandleData[] = [];
      let p = price * (0.985 + Math.random() * 0.03);
      const now = Math.floor(Date.now() / 1000);
      const count = 300;

      for (let i = 0; i < count; i++) {
        const t = now - (count - i) * tfMinutes * 60;
        const rng = p * 0.003 * (0.5 + Math.random() * 1.5);
        const o = p;
        const c = p + (Math.random() - 0.485) * rng;
        const h = Math.max(o, c) + Math.random() * rng * 0.5;
        const l = Math.min(o, c) - Math.random() * rng * 0.5;
        const v = Math.round((500 + Math.random() * 2000));
        candles.push({
          time: t,
          open: +o.toFixed(dp),
          high: +h.toFixed(dp),
          low: +l.toFixed(dp),
          close: +c.toFixed(dp),
          volume: v,
        });
        p = c;
      }

      // Data is already sorted by construction (oldest → newest)
      candlesRef.current = candles;
      // Re-run pattern engine on realtime update (throttled)
      // FIX: Use ref to avoid stale closure
      setCandlesRef.current(candles);
      // FIX: Auto-fit after simulated data too
      requestAnimationFrame(() => {
        if (!cancelled) resetViewRef.current();
      });
    };

    fetchCandles();

    return () => { cancelled = true; };
  }, [selectedSymbol, timeframe]);

  // ── Live Price Sync ────────────────────────────────────
  useEffect(() => {
    if (currentPrice && candlesRef.current.length) {
      chart.updateLastCandle(currentPrice);
    }
  }, [currentPrice]);

  // ── Price Pulse Animation ──────────────────────────────
  useEffect(() => {
    if (currentPrice && prevPriceRef.current && currentPrice !== prevPriceRef.current) {
      setPricePulse(true);
      const timer = setTimeout(() => setPricePulse(false), 420);
      prevPriceRef.current = currentPrice;
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  // ── Candle Countdown ───────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const tf = TIMEFRAMES.find(t => t.value === timeframe);
      const minutes = tf?.minutes || 15;
      const intervalMs = minutes * 60 * 1000;
      const remaining = intervalMs - (Date.now() % intervalMs);
      const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      setCandleCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    tick();
    let intervalId: ReturnType<typeof setInterval> = setInterval(tick, 1000);
    // Pause when tab hidden to save CPU — FIX: store new interval ID on restore
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearInterval(intervalId);
      } else {
        tick();
        intervalId = setInterval(tick, 1000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { clearInterval(intervalId); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [timeframe]);



  // ── Position Overlay ───────────────────────────────────
  const positions = usePositionsStore(s => s.positions);
  const paperTrades = usePaperTradesStore(s => s.trades);

  // ── Helper: Normalize symbol for matching ──
  const normalizeSymbol = (s: string) => s.toUpperCase().replace(/[/\-_]/g, '');

  // ── Trade Overlay State ──
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

  // Keep latest positions/trades in ref so the rAF callback always has fresh data
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const paperTradesRef = useRef(paperTrades);
  paperTradesRef.current = paperTrades;
  const selectedSymbolRef = useRef(selectedSymbol);
  selectedSymbolRef.current = selectedSymbol;

  // rAF deduplication — cancel previous frame before scheduling new one
  const rafIdRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  // Ref for scheduleOverlayUpdate so the onPriceUpdate callback (defined earlier)
  // can call it without stale-closure issues — the ref is updated each render.
  const scheduleOverlayUpdateRef = useRef<() => void>(() => {});

  // ── Recalculate overlay positions (runs on every scroll/zoom via rAF) ──
  const scheduleOverlayUpdate = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      if (!isMountedRef.current) return;

      const chartSymbol = normalizeSymbol(selectedSymbolRef.current);
      const overlays: TradeOverlay[] = [];
      const zones: typeof fillZones = [];

      const processTrade = (
        entryPrice: number, direction: 'long' | 'short',
        sl?: number, tp?: number, qty = 0, pnl?: number,
        source: 'manual' | 'bot' | 'exchange' = 'manual', prefix = ''
      ) => {
        // Compute each line's Y coordinate independently so they don't
        // disappear when the entry scrolls off-screen
        const entryY = chart.getPriceCoordinate(entryPrice);
        const slY = sl && sl > 0 ? chart.getPriceCoordinate(sl) : null;
        const tpY = tp && tp > 0 ? chart.getPriceCoordinate(tp) : null;

        // Only add entry overlay if it's visible
        if (entryY !== null) {
          overlays.push({
            key: `${prefix}entry`, y: entryY, price: entryPrice,
            type: 'entry', direction, source, qty, pnl,
          });
        }

        // SL overlay — independent of entry visibility
        if (slY !== null) {
          overlays.push({
            key: `${prefix}sl`, y: slY, price: sl!,
            type: 'sl', direction, source, qty,
          });
        }

        // TP overlay — independent of entry visibility
        if (tpY !== null) {
          overlays.push({
            key: `${prefix}tp`, y: tpY, price: tp!,
            type: 'tp', direction, source, qty,
          });
        }

        // Fill zones: only draw when both boundary lines are visible
        if (slY !== null && entryY !== null) {
          zones.push({
            top: Math.min(entryY, slY),
            height: Math.abs(entryY - slY),
            type: 'sl', key: `${prefix}sl-zone`,
          });
        }
        if (tpY !== null && entryY !== null) {
          zones.push({
            top: Math.min(entryY, tpY),
            height: Math.abs(entryY - tpY),
            type: 'tp', key: `${prefix}tp-zone`,
          });
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

      // Paper trades (including bot trades)
      // Group identical trades to prevent chart clutter (overlapping SL/TP zones)
      const groupedPaper = new Map<string, any>();
      paperTradesRef.current.forEach(trade => {
        const symbol = normalizeSymbol(trade.symbol || '');
        if (!symbol.includes(chartSymbol) && !chartSymbol.includes(symbol)) return;
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
  }, [chart]);

  // Keep the ref in sync with the latest scheduleOverlayUpdate callback
  scheduleOverlayUpdateRef.current = scheduleOverlayUpdate;

  // ── Subscribe to chart scroll/zoom (horizontal + vertical) ──
  useEffect(() => {
    const unsubscribe = chart.onVisibleRangeChange(scheduleOverlayUpdate);
    // Initial calculation with a small delay to ensure chart is rendered
    const timer = setTimeout(scheduleOverlayUpdate, 200);

    // Periodic overlay refresh to catch vertical price-scale changes
    // (lightweight-charts v5 has no priceScale subscribeVisiblePriceRangeChange)
    // PERF: 2000ms is sufficient — trade overlay positions don't change sub-second
    const priceScaleInterval = setInterval(scheduleOverlayUpdate, 2000);

    return () => { unsubscribe(); clearTimeout(timer); clearInterval(priceScaleInterval); };
  }, [chart, scheduleOverlayUpdate]);

  // ── Mount guard for rAF callbacks ──
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // ── Re-calculate overlays when trades change ──
  useEffect(() => {
    scheduleOverlayUpdate();
  }, [positions, paperTrades, scheduleOverlayUpdate]);

  // ── Apply Position Lines to Chart (price lines with labels) ──
  useEffect(() => {
    positionLineIdsRef.current.forEach(id => chart.removePriceLine(id));
    positionLineIdsRef.current = [];

    const chartSymbol = normalizeSymbol(selectedSymbol);

    const fmtPrice = (p: number) => p > 999 ? p.toFixed(2) : p.toFixed(5);

    // On mobile, hide axis labels on position lines to reduce clutter
    // Our overlay already shows the price — axis labels create duplicates
    const addLine = (id: string, price: number, color: string, lineWidth: number, lineStyle: number, label: string = '', axisLabelVisible: boolean = true) => {
      chart.addPriceLine(id, price, color, label, lineWidth, lineStyle, mobile ? false : axisLabelVisible);
      positionLineIdsRef.current.push(id);
    };

    // Exchange positions
    positions.forEach(pos => {
      const posSymbol = normalizeSymbol(pos.symbol || '');
      if (!posSymbol.includes(chartSymbol) && !chartSymbol.includes(posSymbol)) return;
      const entryPrice = Number(pos.entryPrice || pos.avgEntryPrice || 0);
      const isLong = (pos.side || '').toLowerCase() === 'long';
      if (entryPrice > 0) {
        addLine(`pos-entry-${pos.id || posSymbol}`, entryPrice, isLong ? '#00FFA3' : '#FF4757', 2, 0, '', true);
      }
      const sl = Number(pos.stopLoss || pos.sl || 0);
      if (sl > 0) {
        const slPnl = entryPrice > 0 ? ((sl - entryPrice) * Number(pos.qty || 1) * (isLong ? 1 : -1)) : 0;
        const slLabel = `SL  ${slPnl !== 0 ? (slPnl > 0 ? '+' : '') + slPnl.toFixed(2) + '$' : ''}`;
        addLine(`pos-sl-${pos.id || posSymbol}`, sl, '#FF4757', 1, 2, slLabel, true);
      }
      const tp = Number(pos.takeProfit || pos.tp || 0);
      if (tp > 0) {
        const tpPnl = entryPrice > 0 ? ((tp - entryPrice) * Number(pos.qty || 1) * (isLong ? 1 : -1)) : 0;
        const tpLabel = `TP  ${tpPnl !== 0 ? (tpPnl > 0 ? '+' : '') + tpPnl.toFixed(2) + '$' : ''}`;
        addLine(`pos-tp-${pos.id || posSymbol}`, tp, '#00FFA3', 1, 2, tpLabel, true);
      }
    });

    // Paper trades (including executor and agent trades)
    // Group identical trades for clean price scale labels
    const groupedLines = new Map<string, any>();
    paperTrades.forEach(trade => {
      const symbol = normalizeSymbol(trade.symbol || '');
      if (!symbol.includes(chartSymbol) && !chartSymbol.includes(symbol)) return;
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
      addLine(`trade-entry-grp-${key}`, entryPrice, isLong ? '#00FFA3' : '#FF4757', 2, 0, '', true);
      if (trade.sl && Number(trade.sl) > 0) {
        const slP = ((Number(trade.sl) - entryPrice) * qty * (isLong ? 1 : -1));
        addLine(`trade-sl-grp-${key}`, Number(trade.sl), '#FF4757', 1, 2, `SL  ${slP > 0 ? '+' : ''}${slP.toFixed(2)}$`, true);
      }
      if (trade.tp && Number(trade.tp) > 0) {
        const tpP = ((Number(trade.tp) - entryPrice) * qty * (isLong ? 1 : -1));
        addLine(`trade-tp-grp-${key}`, Number(trade.tp), '#00FFA3', 1, 2, `TP  ${tpP > 0 ? '+' : ''}${tpP.toFixed(2)}$`, true);
      }
    });

    return () => {
      positionLineIdsRef.current.forEach(id => chart.removePriceLine(id));
      positionLineIdsRef.current = [];
    };
  }, [positions, paperTrades, selectedSymbol, chart]);



  // ── Indicator Management ───────────────────────────────
  const handleToggleIndicator = useCallback((key: string) => {
    const existing = chart.getActiveIndicators().find(i => i.key === key);
    if (existing) {
      chart.removeIndicator(key);
    } else {
      const config = INDICATOR_CONFIGS.find(c => c.key === key);
      if (!config) return;
      const indicator: ActiveIndicator = {
        key: config.key as any,
        params: { ...config.defaultParams },
        color: config.defaultColor,
        opacity: config.defaultOpacity,
        visible: true,
      };
      chart.addIndicator(indicator);
    }
  }, [chart]);

  const handleOpenSettings = useCallback((key: string) => {
    const existing = chart.getActiveIndicators().find(i => i.key === key);
    const config = INDICATOR_CONFIGS.find(c => c.key === key);
    if (!config) return;

    const indicator: ActiveIndicator = existing || {
      key: config.key as any,
      params: { ...config.defaultParams },
      color: config.defaultColor,
      opacity: config.defaultOpacity,
      visible: true,
    };
    setSettingsIndicator(indicator);
    setShowSettingsPanel(true);
  }, [chart]);

  const handleSaveSettings = useCallback((indicator: ActiveIndicator) => {
    chart.addIndicator(indicator);
    setShowSettingsPanel(false);
    setSettingsIndicator(null);
  }, [chart]);

  // ── Fetch Active Trading Signals for Chart Markers ──
  const [signalMarkers, setSignalMarkers] = useState<any[]>([]);

  // ── AI Pattern Handler ─────────────────────────────────
  const aiOverlaySeriesRef = useRef<any[]>([]);
  const aiPriceLinesRef = useRef<string[]>([]);
  // FIX: Cache lightweight-charts module to avoid repeated dynamic imports
  const lightweightChartsRef = useRef<any>(null);
  const patternEngineRef = useRef<ReturnType<typeof runPatternEngine> | null>(null);
  // FIX: Move aiEntryExitMarkerRef here (before handlePatternsDetected) to avoid TDZ error
  // Previously this was declared at line ~1007, after handlePatternsDetected already used it
  const aiEntryExitMarkerRef = useRef<any>(null);

  // ── REVOLUTIONARY: Heatmap Overlay Handler ──────────────
  const handleHeatmapData = useCallback((heatmap: HeatmapResult | null) => {
    // Only render heatmap if user explicitly enabled it
    if (!showHeatmap) {
      // If heatmap is disabled, remove any existing heatmap series
      const chartApi = chart.chartRef?.current;
      if (chartApi) {
        heatmapSeriesRef.current.forEach(s => {
          try { chartApi.removeSeries(s); } catch {}
        });
        heatmapSeriesRef.current = [];
      }
      return;
    }
    const chartApi = chart.chartRef?.current;
    if (!chartApi) return;
    // Remove previous heatmap series
    heatmapSeriesRef.current.forEach(s => {
      try { chartApi.removeSeries(s); } catch {}
    });
    heatmapSeriesRef.current = [];
    if (!heatmap || !heatmap.points.length) return;
    // Load lightweight-charts if needed
    if (!lightweightChartsRef.current) return; // Will render on next update
    try {
      const lc = lightweightChartsRef.current;
      const heatmapSeries = renderHeatmapOnChart(chartApi, lc, heatmap);
      heatmapSeriesRef.current = heatmapSeries ?? [];
    } catch (e) {
      console.debug('[RouaChart] Heatmap render error:', e);
    }
  }, [chart, showHeatmap]);

  // FIX: Cleanup function for AI overlays — reusable across multiple call sites
  const cleanupAIOverlays = useCallback(() => {
    const chartApi = chart.chartRef?.current;
    if (chartApi) {
      aiOverlaySeriesRef.current.forEach(s => {
        try { chartApi.removeSeries(s); } catch {}
      });
      aiOverlaySeriesRef.current = [];
    }
    chart.clearExternalSeries();
    aiPriceLinesRef.current.forEach(id => {
      try { chart.removePriceLine(id); } catch {}
    });
    aiPriceLinesRef.current = [];
    // Clean up direct price lines (createPriceLine on mainSeries)
    const lines = (aiPriceLinesRef as any).__lines || [];
    lines.forEach(({ series, line }: any) => {
      try { series.removePriceLine(line); } catch {}
    });
    (aiPriceLinesRef as any).__lines = [];
    // Clean up direct lines (new method)
    const direct = (aiPriceLinesRef as any).__direct || [];
    direct.forEach(({ s, l }: any) => {
      try { s.removePriceLine(l); } catch {}
    });
    (aiPriceLinesRef as any).__direct = [];
    aiEntryExitMarkerRef.current = null;
    setAiPatterns([]);
    // Cancel any active animated patterns
    try {
      const active = getActiveAnimations();
      for (const anim of active) {
        try { cancelAnimatedPattern(chartApi, anim.patternId); } catch {}
      }
    } catch {}
  }, [chart]);

  // Clean up AI overlays when timeframe changes
  useEffect(() => {
    cleanupAIOverlays();
    // REVOLUTIONARY: Also clean up heatmap overlay on timeframe change
    const chartApi = chart.chartRef?.current;
    if (chartApi) {
      heatmapSeriesRef.current.forEach(s => {
        try { chartApi.removeSeries(s); } catch {}
      });
      heatmapSeriesRef.current = [];
      // Also clean up auto-drawn trend lines
      autoTrendSeriesRef.current.forEach(s => {
        try { chartApi.removeSeries(s); } catch {}
      });
      autoTrendSeriesRef.current = [];
    }
    // Reset incremental state on timeframe change
    incrementalInitializedRef.current = false;
    // Reset pattern throttle so it runs immediately on new timeframe data
    lastPatternRunRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  // Clean up AI overlays when AI panel is closed
  useEffect(() => {
    if (showAIPanel) {
      if (candlesRef.current?.length) {
        setAiPanelCandles([...candlesRef.current]);
      }
    }
    // NOTE: Do NOT cleanup on close — lines should persist on chart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAIPanel]);

  // ── AI Stream → Open AI Panel automatically ──
  useEffect(() => {
    if (showAIStream && !showAIPanel) {
      setShowAIPanel(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAIStream]);

  // ── Background Pattern Detection (every 5 minutes) ──────
  // FIX: Only runs when AI panel is open OR pattern progress is visible.
  // FIX: Added showAIPanel/showPatternProgress to deps so the interval is
  // cleaned up when the user closes both panels, instead of running forever.
  // REVOLUTIONARY: Also runs audio alerts for high-confidence patterns.
  useEffect(() => {
    if (!showAIPanel && !showPatternProgress) return; // Don't waste CPU if user isn't interested
    if (!candlesRef.current?.length) return;
    let cancelled = false;
    const detect = async () => {
      if (cancelled) return;
      try {
        const c = candlesRef.current;
        if (!c?.length || c.length < 30) return;
        const { detectLocalPatterns } = await import('./AIPatternPanel');
        const { detectSMC } = await import('@/lib/charts/SMCDetector');
        const patterns = detectLocalPatterns(c.slice(-30));
        const smc = detectSMC(c);
        const highConf = patterns.filter(p => (p.confidence||0) >= 0.75);
        const bos = smc.structureBreaks;
        if (cancelled) return; // Check again after async imports
        if ((highConf.length > 0 || bos.length > 0) && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            const names = highConf.map(p => p.labelAr||p.type).join('، ');
            const bosNames = bos.map(b => `${b.type}${b.direction==='bullish'?'↑':'↓'}`).join('، ');
            const body = [names, bosNames].filter(Boolean).join(' | ');
            new Notification(tc('notificationTitle', { symbol: selectedSymbol }), { body, icon: '/favicon.ico' });
          } else if (Notification.permission === 'default') {
            Notification.requestPermission();
          }
        }
        // ── REVOLUTIONARY: Audio alerts for high-confidence patterns ──
        try {
          const { getPatternAudioAlerter } = await import('@/lib/charts/AudioAlerts');
          const alerter = getPatternAudioAlerter();
          for (const p of highConf) {
            alerter.announce({
              patternType: p.type,
              patternTypeAr: p.labelAr || p.type,
              symbol: selectedSymbol,
              direction: p.direction,
              confidence: p.confidence,
            });
          }
          for (const b of bos) {
            alerter.announceBreakout({
              patternType: b.type,
              patternTypeAr: b.direction === 'bullish' ? tc('bullishBreakout') : tc('bearishBreakout'),
              symbol: selectedSymbol,
              direction: b.direction,
              price: b.price,
            });
          }
        } catch (audioErr) {
          console.warn('[RouaChart] Audio alert error:', audioErr);
        }
      } catch {}
    };
    detect();
    const timer = setInterval(detect, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedSymbol, timeframe, showAIPanel, showPatternProgress]);

  // FIX: Removed aiProcessingRef — was declared but never used. The async lock
  // was previously removed in favor of direct execution, but the ref remained
  // as dead code. The aiProcessingRef was also referenced in a comment that
  // said "Direct execution — no lock needed", confirming it's unused.

  const lastAnalysisResultRef = useRef<any>(null); // store full result for retry draws
  const [aiDirectMarkers, setAiDirectMarkers] = useState<any[]>([]); // markers مباشرة من handlePatternsDetected

  const handlePatternsDetected = useCallback(async (result: AIAnalysisResult) => {
    try {
    // ── Overlay filters: only draw what the user explicitly enabled ──
    const ov = (result as any).overlays || {};
    const showSR = ov.sr === true;
    const showTrend = ov.trend === true;
    const showHarmonic = ov.harmonic === true;
    const showFVG = ov.fvg === true;
    const showBOS = ov.bos === true;
    const showGeo = ov.geo === true;
    const showEW = ov.ew === true;
    const showWyckoff = ov.wyckoff === true;
    const showVP = ov.vp === true;
    const showEntry = ov.entry === true;
    const anyOverlayEnabled = showSR || showTrend || showHarmonic || showFVG || showBOS || showGeo || showEW || showWyckoff || showVP || showEntry;

    // ── MARKERS: only for overlay-specific patterns, NOT candle patterns ──
    // Candle patterns (Doji, Hammer, Engulfing…) clutter the chart — they
    // are shown only in the AI panel's pattern list, not as chart markers.
    const directMarkers: any[] = [];
    const candleTimes = (candlesRef.current || []).map((cd: any) => cd.time as number);
    const usedT = new Set<number>();

    if (anyOverlayEnabled) {
      // Harmonic + classic pattern markers
      if (showHarmonic) {
        result.patterns.filter((p: any) => p.shapeType === 'harmonic' || p.shapeType === 'classic' || ['Gartley','Butterfly','Bat','Crab'].includes(p.type)).forEach((p: any) => {
          let t = p.time as number;
          if (candleTimes.length > 0) t = candleTimes.reduce((a: number, b: number) => Math.abs(b-t) < Math.abs(a-t) ? b : a);
          if (!usedT.has(t)) { usedT.add(t); directMarkers.push({ time: t as any, position: (p.direction === 'bullish' ? 'belowBar' : 'aboveBar') as any, color: p.shapeType === 'harmonic' ? '#c084fc' : p.direction === 'bullish' ? '#00FFA3' : '#FF4757', shape: 'circle' as any, text: (p.labelAr||p.type).slice(0,6) }); }
        });
      }
    }
    setAiPatterns(anyOverlayEnabled ? result.patterns.filter((p: any) => p.shapeType === 'harmonic' || p.shapeType === 'classic') : []);
    lastAnalysisResultRef.current = result;
    setAiDirectMarkers(directMarkers);

    // ── CLEANUP all previous overlays ──
    const chartApi = chart.chartRef?.current;
    aiOverlaySeriesRef.current.forEach(s => {
      try { chartApi?.removeSeries(s); } catch {}
      chart.unregisterExternalSeries(s);
    });
    aiOverlaySeriesRef.current = [];
    aiPriceLinesRef.current.forEach(id => { try { chart.removePriceLine(id); } catch {} });
    aiPriceLinesRef.current = [];

    if (!chartApi || !anyOverlayEnabled) return;

    // Load lightweight-charts if needed
    if (!lightweightChartsRef.current) {
      try { lightweightChartsRef.current = await import('lightweight-charts'); } catch { return; }
    }
    const lc = lightweightChartsRef.current;

    // ═══════════════════════════════════════════════════════
    // S/R — support/resistance price lines
    // ═══════════════════════════════════════════════════════
    if (showSR) {
      result.supportLevels.slice(0, 4).forEach((level, i) => {
        const opacity = level.strength === 'strong' ? 0.8 : level.strength === 'medium' ? 0.5 : 0.3;
        chart.addPriceLine(`ai-s-${i}`, level.price, `rgba(0,255,163,${opacity})`, `S${i+1} ${level.price.toFixed(level.price>1000?2:5)}`, level.strength==='strong'?2:1, 2, true);
        aiPriceLinesRef.current.push(`ai-s-${i}`);
      });
      result.resistanceLevels.slice(0, 4).forEach((level, i) => {
        const opacity = level.strength === 'strong' ? 0.8 : level.strength === 'medium' ? 0.5 : 0.3;
        chart.addPriceLine(`ai-r-${i}`, level.price, `rgba(255,71,87,${opacity})`, `R${i+1} ${level.price.toFixed(level.price>1000?2:5)}`, level.strength==='strong'?2:1, 2, true);
        aiPriceLinesRef.current.push(`ai-r-${i}`);
      });
    }

    // ═══════════════════════════════════════════════════════
    // TREND — diagonal lines from swing lows/highs
    // Detect additional short-term trend lines beyond the main ones
    // ═══════════════════════════════════════════════════════
    if (showTrend) {
      try {
        const allTrendLines = [...(result.trendLines || [])];

        // Add more trend lines by connecting consecutive swing points
        const candles = candlesRef.current;
        if (candles.length >= 20) {
          const swingLows: {time:number;price:number}[] = [];
          const swingHighs: {time:number;price:number}[] = [];
          for (let i = 2; i < candles.length - 2; i++) {
            if (candles[i].low <= candles[i-1].low && candles[i].low <= candles[i+1].low) swingLows.push({time:candles[i].time, price:candles[i].low});
            if (candles[i].high >= candles[i-1].high && candles[i].high >= candles[i+1].high) swingHighs.push({time:candles[i].time, price:candles[i].high});
          }
          // Ascending trend lines: connect rising swing lows
          for (let i = 1; i < swingLows.length; i++) {
            if (swingLows[i].price > swingLows[i-1].price && swingLows[i].time > swingLows[i-1].time) {
              allTrendLines.push({ type: 'ascending', startPoint: swingLows[i-1], endPoint: swingLows[i], strength: 'medium' });
            }
          }
          // Descending trend lines: connect falling swing highs
          for (let i = 1; i < swingHighs.length; i++) {
            if (swingHighs[i].price < swingHighs[i-1].price && swingHighs[i].time > swingHighs[i-1].time) {
              allTrendLines.push({ type: 'descending', startPoint: swingHighs[i-1], endPoint: swingHighs[i], strength: 'medium' });
            }
          }
        }

        // Draw up to 8 trend lines (was only 4)
        allTrendLines.slice(0, 8).forEach((line: any, i: number) => {
          const isBull = line.type === 'ascending';
          const color = isBull ? 'rgba(0,255,163,0.7)' : 'rgba(255,71,87,0.7)';
          try {
            const s = chartApi.addSeries(lc.LineSeries, {
              color, lineWidth: line.strength==='strong'?2:1, lineStyle: 0,
              priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
              title: isBull ? 'ترند صعودي' : 'ترند هبوطي',
            });
            s.setData([
              { time: line.startPoint.time as any, value: line.startPoint.price },
              { time: line.endPoint.time as any, value: line.endPoint.price },
            ]);
            aiOverlaySeriesRef.current.push(s);
            chart.registerExternalSeries(s);
          } catch {
            const mid = (line.startPoint.price + line.endPoint.price) / 2;
            if (mid > 0 && isFinite(mid)) { chart.addPriceLine(`tr-${i}`, mid, color, isBull?'↑':'↓', 1, 0, true); aiPriceLinesRef.current.push(`tr-${i}`); }
          }
        });
      } catch (e) { console.warn('[AI Overlay] trend error:', e); }
    }

    // ═══════════════════════════════════════════════════════
    // HARMONIC — XABCD pattern legs (4 legs: XA, AB, BC, CD)
    // shapePoints format from detector: [X, A, B, X, B, C, D, B]
    // We extract: X=sp[0], A=sp[1], B=sp[2], C=sp[5], D=sp[6]
    // ═══════════════════════════════════════════════════════
    if (showHarmonic) {
      try {
        const harmonicPatterns = result.patterns.filter(
          (p: any) => p.shapeType === 'harmonic' || ['Gartley','Butterfly','Bat','Crab'].includes(p.type)
        );
        harmonicPatterns.slice(0, 3).forEach((pattern: any, idx: number) => {
          const isBull = pattern.direction === 'bullish';
          const col = isBull ? 'rgba(0,255,163,0.8)' : 'rgba(255,71,87,0.8)';
          const colDim = isBull ? 'rgba(0,255,163,0.4)' : 'rgba(255,71,87,0.4)';
          const sp = pattern.shapePoints || pattern.points;
          if (!sp || sp.length < 8) return;
          const X = sp[0], A = sp[1], B = sp[2], C = sp[5], D = sp[6];
          if (!X?.time || !A?.time || !B?.time || !C?.time || !D?.time) return;

          // Draw 4 legs: XA, AB, BC, CD
          const legs = [
            { from: X, to: A, label: 'XA', primary: true },
            { from: A, to: B, label: 'AB', primary: false },
            { from: B, to: C, label: 'BC', primary: true },
            { from: C, to: D, label: 'CD', primary: false },
          ];
          legs.forEach((leg) => {
            if (!leg.from?.price || !leg.to?.price) return;
            try {
              const s = chartApi.addSeries(lc.LineSeries, {
                color: leg.primary ? col : colDim,
                lineWidth: leg.primary ? 2 : 1, lineStyle: leg.primary ? 0 : 1,
                priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
                title: `${pattern.type||'Harmonic'} ${leg.label}`,
              });
              s.setData([{ time: leg.from.time as any, value: leg.from.price }, { time: leg.to.time as any, value: leg.to.price }]);
              aiOverlaySeriesRef.current.push(s);
              chart.registerExternalSeries(s);
            } catch {}
          });
          // PRZ at D point
          if (D.price > 0) { chart.addPriceLine(`h-prz-${idx}`, D.price, col, `PRZ ${pattern.type||''}`, 1, 2, true); aiPriceLinesRef.current.push(`h-prz-${idx}`); }
        });

        // Classic patterns (Double Top/Bottom, H&S)
        const classicPatterns = result.patterns.filter((p: any) => p.shapeType === 'classic');
        classicPatterns.slice(0, 3).forEach((pattern: any, idx: number) => {
          const isBull = pattern.direction === 'bullish';
          const col = isBull ? 'rgba(0,255,163,0.7)' : 'rgba(255,71,87,0.7)';
          const sp = pattern.shapePoints || pattern.points;
          if (!sp || sp.length < 2) return;
          for (let pi = 0; pi < sp.length - 1; pi++) {
            const p1 = sp[pi], p2 = sp[pi + 1];
            if (!p1?.time || !p2?.time || !p1?.price || !p2?.price) continue;
            try {
              const s = chartApi.addSeries(lc.LineSeries, { color: col, lineWidth: 2, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: pattern.type || pattern.labelAr || 'Classic' });
              s.setData([{ time: p1.time as any, value: p1.price }, { time: p2.time as any, value: p2.price }]);
              aiOverlaySeriesRef.current.push(s);
              chart.registerExternalSeries(s);
            } catch {}
          }
        });
      } catch (e) { console.warn('[AI Overlay] harmonic error:', e); }
    }

    // ═══════════════════════════════════════════════════════
    // FVG — Fair Value Gap high/low price line pairs
    // ═══════════════════════════════════════════════════════
    if (showFVG && (result as any).smcData) {
      const smc = (result as any).smcData;
      smc.fvgs?.slice(0, 4).forEach((fvg: any, i: number) => {
        const col = fvg.type === 'bullish' ? '#00ff88' : '#ff4444';
        chart.addPriceLine(`fvg-hi-${i}`, fvg.high, col, `FVG${fvg.type==='bullish'?'↑':'↓'}`, 2, 0, true);
        chart.addPriceLine(`fvg-lo-${i}`, fvg.low, col, '', 1, 1, false);
        aiPriceLinesRef.current.push(`fvg-hi-${i}`, `fvg-lo-${i}`);
      });
    }

    // ═══════════════════════════════════════════════════════
    // BOS — Break of Structure price lines + connecting lines
    // ═══════════════════════════════════════════════════════
    if (showBOS && (result as any).smcData) {
      (result as any).smcData.structureBreaks?.slice(0, 4).forEach((br: any, i: number) => {
        const col = br.direction === 'bullish' ? '#3b82f6' : '#f97316';
        chart.addPriceLine(`bos-${i}`, br.price, col, `BOS${br.direction==='bullish'?'↑':'↓'}`, 2, 0, true);
        aiPriceLinesRef.current.push(`bos-${i}`);
        // Diagonal line from prev swing to BOS point
        if (br.prevSwingTime && br.prevSwingPrice) {
          try {
            const s = chartApi.addSeries(lc.LineSeries, { color: col, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
            s.setData([{ time: br.prevSwingTime as any, value: br.prevSwingPrice }, { time: br.time as any, value: br.price }]);
            aiOverlaySeriesRef.current.push(s);
            chart.registerExternalSeries(s);
          } catch {}
        }
      });
    }

    // ═══════════════════════════════════════════════════════
    // GEOMETRIC — draw pattern shape (connected points) + target
    // GeometricPattern.points = key vertices, target = projected price
    // ═══════════════════════════════════════════════════════
    if (showGeo) {
      try {
        const geoPatterns: any[] = (result as any).geoPatterns || [];
        geoPatterns.slice(0, 4).forEach((pat: any, i: number) => {
          const isBull = pat.direction === 'bullish';
          const col = isBull ? 'rgba(0,255,163,0.7)' : 'rgba(255,71,87,0.7)';
          const colDim = isBull ? 'rgba(0,255,163,0.35)' : 'rgba(255,71,87,0.35)';

          // Draw pattern shape by connecting the points
          if (pat.points && pat.points.length >= 2) {
            for (let pi = 0; pi < pat.points.length - 1; pi++) {
              const p1 = pat.points[pi], p2 = pat.points[pi + 1];
              if (!p1?.time || !p2?.time || !p1?.price || !p2?.price) continue;
              try {
                const s = chartApi.addSeries(lc.LineSeries, {
                  color: pi % 2 === 0 ? col : colDim, lineWidth: 2, lineStyle: pi % 2 === 0 ? 0 : 1,
                  priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
                  title: pat.labelAr || pat.type,
                });
                s.setData([{ time: p1.time as any, value: p1.price }, { time: p2.time as any, value: p2.price }]);
                aiOverlaySeriesRef.current.push(s);
                chart.registerExternalSeries(s);
              } catch {}
            }
          }
          // Target line
          if (pat.target && pat.target > 0) { chart.addPriceLine(`geo-tgt-${i}`, pat.target, col, `هدف ${pat.labelAr||pat.type}`, 2, 2, true); aiPriceLinesRef.current.push(`geo-tgt-${i}`); }
          // Stop loss line
          if (pat.stopLoss && pat.stopLoss > 0) { chart.addPriceLine(`geo-sl-${i}`, pat.stopLoss, colDim, `SL`, 1, 2, false); aiPriceLinesRef.current.push(`geo-sl-${i}`); }
        });
      } catch (e) { console.warn('[AI Overlay] geo error:', e); }
    }

    // ═══════════════════════════════════════════════════════
    // ELLIOTT WAVE — draw wave lines + wave labels + target
    // ═══════════════════════════════════════════════════════
    if (showEW && (result as any).elliottPattern) {
      try {
        const ew = (result as any).elliottPattern;
        const isBull = ew.direction === 'bullish';
        const col = isBull ? '#93c5fd' : '#fca5a5';

        // Draw wave lines connecting wave points
        if (ew.waves && ew.waves.length >= 2) {
          const sortedWaves = [...ew.waves].sort((a: any, b: any) => a.time - b.time);
          const waveData = sortedWaves.map((w: any) => ({ time: w.time as any, value: w.price }));
          if (waveData.length >= 2) {
            try {
              const s = chartApi.addSeries(lc.LineSeries, { color: col, lineWidth: 2, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: `إليوت ${ew.type}` });
              s.setData(waveData);
              aiOverlaySeriesRef.current.push(s);
              chart.registerExternalSeries(s);
            } catch {}
          }
          // Wave number markers
          sortedWaves.forEach((w: any) => {
            const mt = w.time;
            if (!usedT.has(mt)) { usedT.add(mt); directMarkers.push({ time: mt as any, position: (w.type === 'impulse' ? 'aboveBar' : 'belowBar') as any, color: w.type === 'impulse' ? '#93c5fd' : '#fbbf24', shape: 'circle' as any, text: `W${w.waveNumber}` }); }
          });
          setAiDirectMarkers([...directMarkers]);
        }
        // Target line
        if (ew.nextTarget && ew.nextTarget > 0) { chart.addPriceLine('ew-tgt', ew.nextTarget, col, `هدف إليوت ${ew.currentWave}`, 2, 2, true); aiPriceLinesRef.current.push('ew-tgt'); }
      } catch (e) { console.warn('[AI Overlay] elliott error:', e); }
    }

    // ═══════════════════════════════════════════════════════
    // WYCKOFF — draw phase events + S/R lines + markers
    // ═══════════════════════════════════════════════════════
    if (showWyckoff && result.wyckoff && result.wyckoff.phase !== 'Unknown') {
      try {
        const w = result.wyckoff;
        const colLine = w.bias === 'bullish' ? '#00FFA3' : w.bias === 'bearish' ? '#FF4757' : '#fbbf24';

        w.events.forEach((ev: any, i: number) => {
          if (ev.price > 0) { chart.addPriceLine(`wy-ev-${i}`, ev.price, colLine, `وايكوف: ${ev.labelAr}`, 2, 0, true); aiPriceLinesRef.current.push(`wy-ev-${i}`); }
          if (ev.time && !usedT.has(ev.time)) { usedT.add(ev.time); directMarkers.push({ time: ev.time as any, position: (w.bias === 'bullish' ? 'belowBar' : 'aboveBar') as any, color: colLine, shape: 'square' as any, text: ev.labelAr?.slice(0, 4) || w.labelAr?.slice(0, 4) || 'W' }); }
        });
        setAiDirectMarkers([...directMarkers]);

        // Phase S/R lines
        const candles = candlesRef.current;
        if (candles.length >= 10) {
          const slice = candles.slice(-60);
          const prices = slice.map(c => c.close);
          const maxP = Math.max(...prices);
          const minP = Math.min(...prices);
          if (w.phase === 'Accumulation' || w.phase === 'Markup') {
            chart.addPriceLine('wy-sup', minP, 'rgba(0,255,163,0.4)', 'دعم وايكوف', 1, 2, false);
            aiPriceLinesRef.current.push('wy-sup');
          }
          if (w.phase === 'Distribution' || w.phase === 'Markdown') {
            chart.addPriceLine('wy-res', maxP, 'rgba(255,71,87,0.4)', 'مقاومة وايكوف', 1, 2, false);
            aiPriceLinesRef.current.push('wy-res');
          }
        }
      } catch (e) { console.warn('[AI Overlay] wyckoff error:', e); }
    }

    // ═══════════════════════════════════════════════════════
    // VOLUME PROFILE — POC, VAH, VAL price lines
    // ═══════════════════════════════════════════════════════
    if (showVP && result.volumeProfile && result.volumeProfile.poc > 0) {
      try {
        const vp = result.volumeProfile;
        chart.addPriceLine('vp-poc', vp.poc, 'rgba(251,191,36,0.9)', 'POC', 2, 0, true);
        chart.addPriceLine('vp-vah', vp.vah, 'rgba(0,200,255,0.6)', 'VAH', 1, 2, false);
        chart.addPriceLine('vp-val', vp.val, 'rgba(255,100,100,0.6)', 'VAL', 1, 2, false);
        aiPriceLinesRef.current.push('vp-poc', 'vp-vah', 'vp-val');
      } catch {}
    }

    // ═══════════════════════════════════════════════════════
    // ENTRY — Generate entry/SL/TP from dominant pattern direction
    // Uses ATR for dynamic SL/TP calculation
    // ═══════════════════════════════════════════════════════
    if (showEntry) {
      const ee = result.entryExit;
      const candles = candlesRef.current;
      const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

      if (ee && ee.entryPrice > 0) {
        // Use existing entry/exit from analysis
        chart.addPriceLine('ee-entry', ee.entryPrice, '#00D4FF', 'دخول', 2, 0, true); aiPriceLinesRef.current.push('ee-entry');
        if (ee.stopLoss > 0) { chart.addPriceLine('ee-sl', ee.stopLoss, '#FF4757', 'وقف', 2, 2, true); aiPriceLinesRef.current.push('ee-sl'); }
        if (ee.takeProfit > 0) { chart.addPriceLine('ee-tp', ee.takeProfit, '#00FFA3', 'هدف', 2, 2, true); aiPriceLinesRef.current.push('ee-tp'); }
        const lastCandle = candles[candles.length - 1];
        if (lastCandle) { aiEntryExitMarkerRef.current = { time: lastCandle.time as any, position: (ee.direction === 'long' ? 'belowBar' : 'aboveBar') as any, color: '#00D4FF', shape: (ee.direction === 'long' ? 'arrowUp' : 'arrowDown') as any, text: ee.direction === 'long' ? 'شراء' : 'بيع' }; }
      } else if (lastPrice > 0 && result.patterns.length > 0) {
        // Auto-generate from dominant pattern direction + ATR
        const bullCount = result.patterns.filter((p: any) => p.direction === 'bullish').length;
        const bearCount = result.patterns.filter((p: any) => p.direction === 'bearish').length;
        const dir = bullCount >= bearCount ? 'long' : 'short';
        const atr = candles.length >= 14 ? (() => { const sl = candles.slice(-14); const trs = sl.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.close, Math.abs(c.low - c.close), c.high - c.low)); return trs.reduce((s, v) => s + v, 0) / trs.length; })() : lastPrice * 0.01;
        const entry = lastPrice;
        const sl = dir === 'long' ? entry - atr * 1.5 : entry + atr * 1.5;
        const tp = dir === 'long' ? entry + atr * 2.5 : entry - atr * 2.5;
        chart.addPriceLine('ee-entry', entry, '#00D4FF', `دخول ${dir==='long'?'شراء':'بيع'}`, 2, 0, true);
        chart.addPriceLine('ee-sl', sl, '#FF4757', `وقف ${sl.toFixed(sl>1000?2:5)}`, 2, 2, true);
        chart.addPriceLine('ee-tp', tp, '#00FFA3', `هدف ${tp.toFixed(tp>1000?2:5)}`, 2, 2, true);
        aiPriceLinesRef.current.push('ee-entry', 'ee-sl', 'ee-tp');
        const lastCandle = candles[candles.length - 1];
        if (lastCandle) { aiEntryExitMarkerRef.current = { time: lastCandle.time as any, position: (dir === 'long' ? 'belowBar' : 'aboveBar') as any, color: '#00D4FF', shape: (dir === 'long' ? 'arrowUp' : 'arrowDown') as any, text: dir === 'long' ? 'شراء' : 'بيع' }; }
      }
      setAiPatterns(prev => [...prev]); // trigger marker update
    } else {
      aiEntryExitMarkerRef.current = null;
    }

    } catch (e) {
      console.warn('[AI Overlay] handlePatternsDetected error:', e);
    }
  }, [chart]);


  // ── News Markers Handler ───────────────────────────────
  const handleNewsUpdate = useCallback((markers: NewsMarker[]) => {
    setNewsMarkers(markers);
  }, []);

  // ── Chart Trading Order Handler ────────────────────────
  const [orderError, setOrderError] = useState<string | null>(null);
  
  const handlePlaceOrder = useCallback((order: any) => {
    // Validate SL/TP placement
    if (order.side === 'buy') {
      if (order.sl && order.sl >= order.entryPrice) {
        setOrderError(tc('slMustBeBelowBuyEntry'));
        setTimeout(() => setOrderError(null), 3500);
        return;
      }
      if (order.tp && order.tp <= order.entryPrice) {
        setOrderError(tc('tpMustBeAboveBuyEntry'));
        setTimeout(() => setOrderError(null), 3500);
        return;
      }
    } else {
      if (order.sl && order.sl <= order.entryPrice) {
        setOrderError(tc('slMustBeAboveSellEntry'));
        setTimeout(() => setOrderError(null), 3500);
        return;
      }
      if (order.tp && order.tp >= order.entryPrice) {
        setOrderError(tc('tpMustBeBelowSellEntry'));
        setTimeout(() => setOrderError(null), 3500);
        return;
      }
    }

    // Place order via paper trades store
    // FIX: Use last candle close as fallback if entryPrice is 0 (e.g. user didn't fill the field)
    const lastClose = candlesRef.current[candlesRef.current.length - 1]?.close || 0;
    const resolvedEntryPrice = (order.entryPrice && order.entryPrice > 0) ? order.entryPrice : lastClose;

    const { addTrade } = usePaperTradesStore.getState();
    addTrade({
      symbol: selectedSymbol,
      side: order.side === 'buy' ? 'long' : 'short',
      qty: order.quantity,
      entryPrice: resolvedEntryPrice,
      currentPrice: resolvedEntryPrice,
      sl: order.sl || undefined,
      tp: order.tp || undefined,
      entryTime: Date.now(),
      strategy: 'manual',
      source: 'manual',
    });

    console.log('Chart order placed:', order);
  }, [selectedSymbol]);

  // ── Fetch Active Trading Signals (signalMarkers declared above) ──
  useEffect(() => {
    let cancelled = false;
    const fetchSignals = async () => {
      try {
        const [signals, briefs] = await Promise.all([
          fetchSignalsForChart(selectedSymbol),
          fetchStrategicBriefs(selectedSymbol),
        ]);
        if (cancelled) return;

        // Update council signal for HUD
        if (briefs.length > 0) {
          const latestBrief = briefs[briefs.length - 1];
          setCouncilSignal({
            direction: latestBrief.direction,
            confidence: latestBrief.confidence,
          });
        } else {
          setCouncilSignal(null);
        }

        // Convert to chart markers
        const markers = convertToChartMarkers(signals, briefs, selectedSymbol);
        setSignalMarkers(markers);

        // Add SL/TP price lines for signals — clear old ones first
        if (!mobile) {
          signalLineIdsRef.current.forEach(id => chart.removePriceLine(id));
          signalLineIdsRef.current = [];
          // Only show lines for the latest signal (avoid chart clutter)
          const latestSignal = signals[signals.length - 1];
          if (latestSignal) {
            const normalizeSymbolLocal = (s: string) => s.toUpperCase().replace(/[/\-_]/g, '');
            const chartSymbol = normalizeSymbolLocal(selectedSymbol);
            const sigSymbol = normalizeSymbolLocal((latestSignal as any).pair || (latestSignal as any).symbol || '');
            if (sigSymbol.includes(chartSymbol) || chartSymbol.includes(sigSymbol)) {
              const sl = Number(latestSignal.stopLoss || 0);
              const tp = Number(latestSignal.takeProfit || 0);
              const signalId = latestSignal.id || `${latestSignal.createdAt}-${latestSignal.action}`;
              if (sl > 0) { chart.addPriceLine(`sl-${signalId}`, sl, 'rgba(255, 71, 87, 0.5)', 'SL', 1, 2, true); signalLineIdsRef.current.push(`sl-${signalId}`); }
              if (tp > 0) { chart.addPriceLine(`tp-${signalId}`, tp, 'rgba(0, 255, 163, 0.5)', 'TP', 1, 2, true); signalLineIdsRef.current.push(`tp-${signalId}`); }
            }
          }
        }
      } catch {
        // Signals not available
      }
    };

    fetchSignals();
    const interval = setInterval(fetchSignals, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedSymbol]);

  // ── Apply Combined Markers (News + AI Patterns + Trading Signals + AI Entry/Exit) to Chart ──
  // FIX: Single source of truth for ALL markers — no more conflicts between handlePatternsDetected and this useEffect
  // (aiEntryExitMarkerRef moved above, near other AI refs, to avoid TDZ)

  useEffect(() => {
    const combinedMarkers: any[] = [];

    // Add news markers
    if (newsMarkers.length) {
      const newsChartMarkers = createNewsChartMarkers(newsMarkers);
      combinedMarkers.push(...newsChartMarkers);
    }

    // Add direct pattern markers from handlePatternsDetected (always fresh)
    if (aiDirectMarkers.length > 0) {
      combinedMarkers.push(...aiDirectMarkers);
    }

    // Add AI pattern markers — show Arabic name on candle
    if (aiPatterns.length) {
      // Get valid candle times from the chart data
      const candleTimes = (candlesRef.current || []).map(c => c.time as number);
      const usedTimes = new Set<number>();
      aiPatterns.forEach(p => {
        // Snap to nearest actual candle time
        let t = p.time as number;
        if (candleTimes.length > 0) {
          const nearest = candleTimes.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a);
          t = nearest;
        }
        if (usedTimes.has(t)) return;
        usedTimes.add(t);
        const label = p.labelAr || p.type;
        const shortLabel = label.length > 6 ? label.slice(0, 6) : label;
        combinedMarkers.push({
          time: t as any,
          position: (p.direction === 'bullish' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
          color: p.direction === 'bullish' ? '#00FFA3' : p.direction === 'bearish' ? '#FF4757' : '#fbbf24',
          shape: (p.direction === 'bullish' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
          text: shortLabel,
        });
      });
    }

    // Add trading signal markers (BUY/SELL/WAIT)
    if (signalMarkers.length) {
      combinedMarkers.push(...signalMarkers);
    }

    // Add AI entry/exit marker (from last handlePatternsDetected call)
    if (aiEntryExitMarkerRef.current) {
      combinedMarkers.push(aiEntryExitMarkerRef.current);
    }

    // Sort by time and apply
    combinedMarkers.sort((a, b) => (a.time as number) - (b.time as number));
    chart.setMarkers(combinedMarkers);
  // chart.setMarkers is stable (useCallback), safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsMarkers, aiPatterns, signalMarkers, aiDirectMarkers]);

  const toolbarHeight = hideToolbar ? 0 : mobile ? 32 : 38;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: T.bg,
      }}
      className="roua-chart-root"
    >
      {/* ── TOOLBAR ── */}
      {!hideToolbar && <ChartToolbar
        symbol={selectedSymbol}
        timeframe={timeframe}
        chartType={chart.settings.type}
        onSetTimeframe={setTimeframe}
        onSetChartType={chart.setChartType}
        onZoomIn={chart.zoomIn}
        onZoomOut={chart.zoomOut}
        onResetView={chart.resetView}
        onToggleDrawings={() => setShowDrawingPanel(!showDrawingPanel)}
        onToggleIndicators={() => setShowIndicatorPanel(!showIndicatorPanel)}
        onExportPNG={chart.exportPNG}
        onExportCSV={chart.exportCSV}
        onExportSVG={chart.exportSVG}
        onToggleFullscreen={onToggleChartFullscreen || chart.toggleFullscreen}
        isFullscreen={isChartFullscreen || chart.isFullscreen}
        activeTool={chart.activeTool}
        onSetTool={chart.setTool}
        onClearDrawings={chart.clearDrawings}
        isPaused={chart.isPaused}
        onTogglePause={chart.togglePause}
        mobile={mobile}
        height={toolbarHeight}
        // ── New Toolbar Props ──
        onToggleVolumeProfile={() => setShowVolumeProfile(!showVolumeProfile)}
        onToggleAIPanel={() => setShowAIPanel(!showAIPanel)}
        onToggleChartTrading={() => setShowChartTrading(!showChartTrading)}
        onToggleTemplateManager={() => setShowTemplateManager(!showTemplateManager)}
        onToggleWatchlist={() => setShowWatchlist(!showWatchlist)}
        onToggleChartSettings={() => setShowChartSettings(!showChartSettings)}
        showVolumeProfile={showVolumeProfile}
        showAIPanel={showAIPanel}
        showChartTrading={showChartTrading}
        showWatchlist={showWatchlist}
        onToggleCompare={() => setShowCompare(!showCompare)}
        onToggleMTF={() => setShowMTF(!showMTF)}
        onToggleChartGrid={() => setShowChartGrid(!showChartGrid)}
        onToggleShare={() => setShowShare(!showShare)}
        showCompare={showCompare}
        // ── 5 New Feature Toolbar Props ──
        showFootprint={showFootprint}
        onToggleFootprint={() => setShowFootprint(!showFootprint)}
        showAlerts={showAlerts}
        onToggleAlerts={() => setShowAlerts(!showAlerts)}
        showPatternProgress={showPatternProgress}
        onTogglePatternProgress={() => setShowPatternProgress(!showPatternProgress)}
        // ── 3 Revolutionary Feature Toolbar Props ──
        showReplay={showReplay}
        onToggleReplay={() => setShowReplay(!showReplay)}
        showHeatmap={showHeatmap}
        onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
        // ── 4 AI Streaming Toolbar Prop ──
        showAIStream={showAIStream}
        onToggleAIStream={() => setShowAIStream(!showAIStream)}
        priceAlertsCount={priceAlertsCount}
      />}

      {/* ── CHART AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* OHLC Overlay */}
        <CrosshairOverlay
          symbol={selectedSymbol}
          currentPrice={currentPrice}
          crosshairData={crosshairData}
          pricePulse={pricePulse}
          candleCountdown={candleCountdown}
          feedState={feedState}
          connectionState={ws.connectionState}
          compact={compact}
          mobile={mobile}
          candles={candlesRef.current}
          showCandleTimer={chart.settings.showCandleTimer}
        />

        {/* Chart Wrapper — contains canvas + overlays */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>

          {/* Chart Canvas Container — lightweight-charts renders here ONLY */}
          {/* When a drawing tool is active, raise z-index so DrawingRenderer overlay canvas is above all sibling overlays */}
          <div
            ref={chart.containerRef as any}
            style={{
              width: '100%',
              flex: 1,
              minHeight: 0,
              background: T.bg,
              position: 'relative',
              zIndex: chart.activeTool !== 'cursor' ? 30 : 0,
            }}
          />

          {/* Overlay Layer — sibling of canvas container, always on top */}
          {/* When a drawing tool is active, lower z-index so DrawingRenderer canvas receives events */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: chart.activeTool !== 'cursor' ? -1 : 0 }}>

            {/* Symbol Watermark — REMOVED: name already shown in toolbar/CrosshairOverlay */}

            {/* ── Fill Zones (colored bands between entry-SL/TP) ── */}
            {fillZones.map(zone => (
              <div
                key={zone.key}
                style={{
                  position: 'absolute',
                  top: zone.top,
                  left: 0,
                  right: 0,
                  height: Math.max(zone.height, 1),
                  background: zone.type === 'sl'
                    ? 'rgba(248, 81, 73, 0.08)'
                    : 'rgba(63, 185, 80, 0.08)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />
            ))}

            {/* ── Trade Line Labels (HTML overlays like TradingView) ── */}
            {/* ── Trade Line Labels (HTML overlays like TradingView) ── */}
            {tradeOverlays.map(ov => null)}

            {/* Volume Profile moved to draggable panel below */}

          {/* ── Quick Trade Controls — Left Side ── */}
          {!mobile && currentPrice && (
            <div
              className="roua-quick-trade"
              style={{
                position: 'absolute',
                top: 32,
                left: 10,
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                borderRadius: 10,
                background: 'rgba(8,10,18,0.88)',
                backdropFilter: 'blur(24px) saturate(2)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                padding: tradePanelCollapsed ? '3px' : '5px 6px',
                pointerEvents: chart.activeTool === 'cursor' ? 'auto' : 'none',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Collapse Toggle — top center */}
              <button
                onClick={() => setTradePanelCollapsed(!tradePanelCollapsed)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  borderRadius: 4,
                  color: 'rgba(255,255,255,0.35)',
                  width: tradePanelCollapsed ? 20 : '100%',
                  height: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                  padding: 0,
                }}
              >
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points={tradePanelCollapsed ? "1 1 5 5 9 1" : "1 5 5 1 9 5"} />
                </svg>
              </button>

              {/* Trade Buttons (collapsible) */}
              {!tradePanelCollapsed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/* Buy Button */}
                  <button
                    className="roua-btn-buy"
                    onClick={() => {
                      const { addTrade } = usePaperTradesStore.getState();
                      const lastClose = candlesRef.current[candlesRef.current.length - 1]?.close || 0;
                      const resolvedPrice = (typeof currentPrice === 'number' && currentPrice > 0) ? currentPrice : lastClose;
                      addTrade({
                        symbol: selectedSymbol,
                        side: 'long',
                        qty: lotSize,
                        entryPrice: resolvedPrice,
                        currentPrice: resolvedPrice,
                        entryTime: Date.now(),
                        strategy: 'quick',
                        source: 'manual',
                      });
                    }}
                    style={{
                      background: '#00C853',
                      border: 'none',
                      borderRadius: 5,
                      color: '#000',
                      padding: '4px 9px',
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: "'Cairo', sans-serif",
                      letterSpacing: 0.5,
                      outline: 'none',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    {tc('buyArrow')}
                  </button>

                  {/* LOT */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 5, padding: '2px 4px' }}>
                    <button onClick={() => setLotSize(prev => Math.max(0.01, +(prev - 0.01).toFixed(2)))}
                      style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', padding: '0 2px', outline: 'none' }}>−</button>
                    <span style={{ color: '#ccc', fontSize: 9, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", minWidth: 28, textAlign: 'center' }}>{lotSize.toFixed(2)}</span>
                    <button onClick={() => setLotSize(prev => +(prev + 0.01).toFixed(2))}
                      style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', padding: '0 2px', outline: 'none' }}>+</button>
                  </div>

                  {/* Sell Button */}
                  <button
                    className="roua-btn-sell"
                    onClick={() => {
                      const { addTrade } = usePaperTradesStore.getState();
                      const lastClose = candlesRef.current[candlesRef.current.length - 1]?.close || 0;
                      const resolvedPrice = (typeof currentPrice === 'number' && currentPrice > 0) ? currentPrice : lastClose;
                      addTrade({
                        symbol: selectedSymbol,
                        side: 'short',
                        qty: lotSize,
                        entryPrice: resolvedPrice,
                        currentPrice: resolvedPrice,
                        entryTime: Date.now(),
                        strategy: 'quick',
                        source: 'manual',
                      });
                    }}
                    style={{
                      background: '#F44336',
                      border: 'none',
                      borderRadius: 5,
                      color: '#fff',
                      padding: '4px 9px',
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: "'Cairo', sans-serif",
                      letterSpacing: 0.5,
                      outline: 'none',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    {tc('sellArrow')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Price-Synced Candle Timer (Desktop Only) ── */}
          {!mobile && currentPrice && candleCountdown && (
            <PriceSyncedTimer
              chart={chart}
              currentPrice={currentPrice}
              countdown={candleCountdown}
              isBull={(() => {
                const lc = candlesRef.current[candlesRef.current.length - 1];
                return lc ? currentPrice >= lc.open : true;
              })()}
            />
          )}

          {/* Candle countdown removed from chart — shown only in header via CrosshairOverlay */}
          </div>{/* ── Overlay Layer close ── */}
        </div>{/* ── Chart Wrapper close ── */}

        {/* Drawing Panel (draggable) */}
        {showDrawingPanel && (
          <DraggablePanel defaultPosition={{ top: 40, right: 8 }} defaultWidth={280} minHeight={200}>
            <DrawingPanel
              activeTool={chart.activeTool}
              onSetTool={chart.setTool}
              onClose={() => setShowDrawingPanel(false)}
              onClearAll={chart.clearDrawings}
            />
          </DraggablePanel>
        )}

        {/* Indicator Panel (draggable) */}
        {showIndicatorPanel && (
          <DraggablePanel defaultPosition={{ top: 40, right: 80 }} defaultWidth={230} minHeight={200}>
            <IndicatorPanel
              activeIndicators={chart.getActiveIndicators().map(i => i.key)}
              onToggleIndicator={handleToggleIndicator}
              onOpenSettings={handleOpenSettings}
              onClose={() => setShowIndicatorPanel(false)}
            />
          </DraggablePanel>
        )}

        {/* Indicator Settings Panel (draggable) */}
        {showSettingsPanel && settingsIndicator && (
          <DraggablePanel defaultPosition={{ top: 40, right: 300 }} defaultWidth={220} minHeight={180} resizable={false}>
            <IndicatorSettings
              indicator={settingsIndicator}
              onSave={handleSaveSettings}
              onClose={() => { setShowSettingsPanel(false); setSettingsIndicator(null); }}
            />
          </DraggablePanel>
        )}

        {/* Volume Profile (draggable) */}
        {showVolumeProfile && (
          <DraggablePanel defaultPosition={{ top: 50, right: 10 }} minWidth={260} minHeight={200}>
            <VolumeProfile
              candles={candlesRef.current}
              width={240}
              rows={24}
              visible={showVolumeProfile}
            />
          </DraggablePanel>
        )}




        {/* Chart Trading Panel (draggable) */}
        {showChartTrading && currentPrice && (
          <DraggablePanel defaultPosition={{ top: 50, right: 8 }} defaultWidth={240} minHeight={300}>
            <ChartTrading
              symbol={selectedSymbol}
              currentPrice={typeof currentPrice === 'number' ? currentPrice : 0}
              onClose={() => setShowChartTrading(false)}
              onPlaceOrder={handlePlaceOrder}
            />
          </DraggablePanel>
        )}

        {/* Quick Trade Panel (draggable) */}
        {showQuickTrade && (
          <DraggablePanel defaultPosition={{ top: 120, left: 12 }} defaultWidth={260} minHeight={200}>
            <QuickTradePanel
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              onPlaceOrder={handlePlaceOrder}
              onClose={() => setShowQuickTrade(false)}
            />
          </DraggablePanel>
        )}

        {/* Template Manager (draggable) */}
        {showTemplateManager && (
          <DraggablePanel defaultPosition={{ top: 40, left: 100 }} defaultWidth={280} minHeight={250}>
            <TemplateManager
              onLoadTemplate={chart.loadTemplate}
              onSaveTemplate={chart.saveTemplate}
              onClose={() => setShowTemplateManager(false)}
            />
          </DraggablePanel>
        )}

        {/* Chart Settings Panel (draggable) */}
        {showChartSettings && (
          <DraggablePanel defaultPosition={{ top: 40, right: 8 }} defaultWidth={260} minHeight={200}>
            <ChartSettingsPanel
              settings={chart.settings}
              onUpdateSettings={chart.updateSettings}
              onClose={() => setShowChartSettings(false)}
            />
          </DraggablePanel>
        )}

        {/* Compare Overlay (draggable) */}
        {showCompare && chart.chartRef?.current && (
          <DraggablePanel defaultPosition={{ top: 50, right: 10 }} minWidth={260} minHeight={200}>
            <CompareOverlay
              chart={chart.chartRef.current}
              symbol={compareSymbol || 'ETH/USDT'}
              onClose={() => setShowCompare(false)}
            />
          </DraggablePanel>
        )}

        {/* Multi-Timeframe Chart */}
        {showMTF && (
          <MultiTimeframeChart
            symbol={selectedSymbol}
            onClose={() => setShowMTF(false)}
          />
        )}

        {/* Multi-Chart Grid (TradingView/MT5 style) */}
        {showChartGrid && (
          <ChartGrid
            onClose={() => setShowChartGrid(false)}
            defaultSymbol={selectedSymbol}
            defaultTimeframe={timeframe}
          />
        )}

        {/* Share Chart (draggable) */}
        {showShare && (
          <DraggablePanel defaultPosition={{ top: 50, right: 10 }} minWidth={260} minHeight={200}>
            <ShareChart
              symbol={selectedSymbol}
              timeframe={timeframe}
              activeIndicators={chart.getActiveIndicators().map(i => i.key)}
              chartType={chart.settings.type}
              onClose={() => setShowShare(false)}
            />
          </DraggablePanel>
        )}

        {/* ── 5 New Feature Components ── */}

        {/* Footprint Chart (draggable) */}
        {showFootprint && (
          <DraggablePanel defaultPosition={{ top: 50, right: 8 }} defaultWidth={300} minHeight={250}>
            <FootprintChart
              symbol={selectedSymbol}
              onClose={() => setShowFootprint(false)}
            />
          </DraggablePanel>
        )}

        {/* Alert Panel replaced by PriceAlertLine below */}

        {/* Pattern Progress (draggable) */}
        {showPatternProgress && (
          <DraggablePanel defaultPosition={{ top: 120, left: 12 }} defaultWidth={280} minHeight={220}>
            <PatternProgress
              symbol={selectedSymbol}
              candles={candlesRef.current}
              onClose={() => setShowPatternProgress(false)}
            />
          </DraggablePanel>
        )}

        {/* ── 3 Revolutionary Feature Components ── */}

        {/* Price Alert Line (draggable) */}
        {showAlerts && (
          <DraggablePanel defaultPosition={{ top: 0, right: 0 }} defaultWidth={300} minHeight={250}>
            <PriceAlertLine
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              chart={chart}
              onClose={() => setShowAlerts(false)}
              onAlertsCountChange={setPriceAlertsCount}
            />
          </DraggablePanel>
        )}

        {/* Chart Replay (floating at bottom) */}
        {showReplay && (
          <ChartReplay
            candles={candlesRef.current}
            setCandles={chart.setCandles}
            onClose={() => {
              setShowReplay(false);
              // Restore full candle data when closing replay
              chart.setCandles(candlesRef.current);
            }}
          />
        )}

        {/* Mini Heatmap (draggable) */}
        {showHeatmap && (
          <DraggablePanel defaultPosition={{ top: 50, right: 8 }} defaultWidth={340} minHeight={300}>
            <MiniHeatmap
              selectedSymbol={selectedSymbol}
              onSelectSymbol={(symbol) => {
                const { setSelectedSymbol } = useSymbolStore.getState();
                setSelectedSymbol(symbol);
              }}
              onClose={() => setShowHeatmap(false)}
            />
          </DraggablePanel>
        )}

      </div>{/* ── Chart Area close ── */}

      {/* ── Watchlist Overlay (draggable) ── */}
      {showWatchlist && (
        <DraggablePanel defaultPosition={{ top: 50, right: 10 }} minWidth={260} minHeight={200}>
          <WatchlistOverlay
            selectedSymbol={selectedSymbol}
            onSelectSymbol={(symbol) => {
              // Use the symbol store to change symbol
              const { setSelectedSymbol } = useSymbolStore.getState();
              setSelectedSymbol(symbol);
            }}
            visible={showWatchlist}
          />
        </DraggablePanel>
      )}

      {/* ── News Markers (data provider — invisible) ── */}
      <NewsMarkers
        symbol={selectedSymbol}
        onMarkersUpdate={handleNewsUpdate}
      />

      {/* ── Global Styles ── */}
      <ScopedStyle>{`
        .roua-chart-root [class*="lightweight-charts"] {
          border-radius: 0 !important;
        }
        .roua-chart-root a#tv-attr-logo,
        .roua-chart-root [id*="tv-attr"],
        .roua-chart-root .tv-lightweight-charts a {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
        }
        .roua-chart-root input[type=number]::-webkit-inner-spin-button,
        .roua-chart-root input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .roua-chart-root input[type=number] {
          -moz-appearance: textfield;
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes rouaGlowPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        /* ── Quick Trade Button Styles — Premium Trading UI ── */
        .roua-btn-buy:hover {
          box-shadow: 0 0 28px rgba(0,255,163,0.45), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.45) !important;
          transform: translateY(-1px) scale(1.03);
          filter: brightness(1.12);
          border-color: rgba(0,255,163,0.6) !important;
        }
        .roua-btn-buy:active {
          transform: translateY(0) scale(0.97);
          box-shadow: 0 0 10px rgba(0,255,163,0.3), inset 0 2px 6px rgba(0,0,0,0.25) !important;
          filter: brightness(0.92);
        }
        .roua-btn-buy:hover .roua-buy-glow {
          opacity: 1 !important;
          animation: rouaGlowSpin 2s linear infinite;
        }
        .roua-btn-sell:hover {
          box-shadow: 0 0 28px rgba(255,71,87,0.45), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3) !important;
          transform: translateY(-1px) scale(1.03);
          filter: brightness(1.12);
          border-color: rgba(255,71,87,0.6) !important;
        }
        .roua-btn-sell:active {
          transform: translateY(0) scale(0.97);
          box-shadow: 0 0 10px rgba(255,71,87,0.3), inset 0 2px 6px rgba(0,0,0,0.25) !important;
          filter: brightness(0.92);
        }
        .roua-btn-sell:hover .roua-sell-glow {
          opacity: 1 !important;
          animation: rouaGlowSpin 2s linear infinite;
        }
        .roua-quick-trade {
          animation: rouaSlideInLeft 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes rouaSlideInLeft {
          from { transform: translateX(-20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes rouaGlowSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</ScopedStyle>

      {/* ── Order Error Toast ── */}
      {orderError && (
        <div style={{
          position: 'absolute',
          top: 50,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(248,81,73,0.15)',
          border: '1px solid rgba(248,81,73,0.4)',
          backdropFilter: 'blur(16px)',
          borderRadius: 10,
          padding: '10px 18px',
          zIndex: 600,
          animation: 'slideInRight 0.3s ease-out',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: '90%',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4757" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <span style={{ fontSize: 12, color: '#FF4757', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
            {orderError}
          </span>
        </div>
      )}

      {/* AI Smart Panel — uses DraggablePanel (same as all other panels) */}
      {showAIPanel && (
        <DraggablePanel defaultPosition={{ top: 130, left: 350 }} defaultWidth={255} minHeight={360} resizable={false}>
          <AISmartPanel
            symbol={selectedSymbol}
            candles={aiPanelCandles}
            currentPrice={currentPrice}
            onPatternsDetected={handlePatternsDetected}
            onHeatmapData={handleHeatmapData}
            onClose={() => { setShowAIPanel(false); setShowAIStream(false); }}
            streamMode={showAIStream}
            onScrollToTime={(time) => {
              try {
                const ts = chart.chartRef?.current?.timeScale();
                if (ts) ts.setVisibleRange({ from: (time - 3600 * 8) as any, to: (time + 3600 * 8) as any });
              } catch {}
            }}
            onExecuteTrade={(side, entry, sl, tp) => {
              const { addTrade } = usePaperTradesStore.getState();
              addTrade({
                symbol: selectedSymbol,
                side,
                qty: 0.01,
                entryPrice: entry,
                currentPrice: entry,
                entryTime: Date.now(),
                strategy: 'ai',
                source: 'manual',
                sl,
                tp,
              });
            }}
          />
        </DraggablePanel>
      )}

      {/* ── Command Palette (Ctrl+K) ── */}
      <CommandPalette
        commands={createChartCommands({
          onToggleIndicator: (key) => {
            const config = INDICATOR_CONFIGS[key as keyof typeof INDICATOR_CONFIGS];
            if (config) {
              const existing = chart.settings.indicators.find((i: ActiveIndicator) => i.key === key);
              if (existing) {
                chart.removeIndicator(key);
              } else {
                chart.addIndicator(key);
              }
            }
          },
          onToggleTool: (tool) => chart.setTool(tool as DrawingTool),
          onTogglePattern: (pattern) => {
            if (pattern === 'ai') setShowAIPanel(!showAIPanel);
            if (pattern === 'smc') setShowAIPanel(true);
            if (pattern === 'heatmap') setShowHeatmap(!showHeatmap);
          },
          onChartAction: (action) => {
            if (action === 'screenshot') chart.exportPNG();
            if (action === 'reset') chart.resetView();
            if (action === 'fullscreen') chart.toggleFullscreen();
          },
          onTradingAction: (action) => {
            if (action === 'quick-buy') setShowChartTrading(true);
            if (action === 'quick-sell') setShowChartTrading(true);
            if (action === 'price-alert') setShowAlerts(true);
            if (action === 'quick-trade') setShowQuickTrade(!showQuickTrade);
          },
        })}
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
      />
    </div>
  );
}
