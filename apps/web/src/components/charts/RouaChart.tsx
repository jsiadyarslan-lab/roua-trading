// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Main Component
// Professional trading chart using lightweight-charts v5
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getPortalRoot } from '@/lib/portal-root';
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
import { resetOverlayManager } from '@/lib/charts/OverlayManager';
import { detectProfessionalTrendLines, type TrendLine } from '@/lib/charts/ProfessionalTrendLines';
import { ChartTrading } from './ChartTrading';
import { QuickTradePanel } from './QuickTradePanel';
import { TemplateManager } from './TemplateManager';
import { ChartSettingsPanel } from './ChartSettingsPanel';
import { CompareOverlay } from './CompareOverlay';
import { SmartGrid } from './SmartGrid';
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
  const { selectedSymbol, timeframe, setTimeframe, setSelectedSymbol } = useSymbolStore();
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
  const showAIPanelRef = useRef(showAIPanel);
  useEffect(() => { showAIPanelRef.current = showAIPanel; }, [showAIPanel]);
  const [aiPanelCandles, setAiPanelCandles] = useState<CandleData[]>([]);
  const [showChartTrading, setShowChartTrading] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState('');
  const [showSmartGrid, setShowSmartGrid] = useState(false);
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

  // ── Compute the timeframe's interval in seconds (as ref for TDZ safety) ──
  // FIX: Previously this was a useMemo placed after the chart hook but used
  // inside the onCandleUpdate callback. In production minified builds, the
  // bundler may reorder let declarations, causing "Cannot access 'tx' before
  // initialization" (TDZ error). Using a ref avoids this because refs are
  // hoisted and always initialized before any closure captures them.
  const tfSecondsRef = useRef(15 * 60);
  useEffect(() => {
    const tf = TIMEFRAMES.find(t => t.value === timeframe);
    tfSecondsRef.current = (tf?.minutes || 15) * 60;
    timeframeRef.current = timeframe;
  }, [timeframe]);

  // ── Pre-load overlay renderer modules (needed for WebSocket overlay re-render) ──
  const overlayRendererRef = useRef<typeof import('@/lib/charts/overlay-renderer') | null>(null);
  const overlayRegistryRef = useRef<typeof import('@/lib/charts/OverlayRegistry') | null>(null);
  useEffect(() => {
    import('@/lib/charts/overlay-renderer').then(mod => { overlayRendererRef.current = mod; }).catch(() => {});
    import('@/lib/charts/OverlayRegistry').then(mod => { overlayRegistryRef.current = mod; }).catch(() => {});
  }, []);

  // ── Track current overlay flags for WebSocket-triggered re-render ──
  const currentOverlaysRef = useRef<{
    sr: boolean; trend: boolean; harmonic: boolean; fvg: boolean;
    bos: boolean; geo: boolean; ew: boolean; wyckoff: boolean;
    vp: boolean; entry: boolean; mtf: boolean; liq: boolean; trade: boolean;
  }>({ sr: false, trend: false, harmonic: false, fvg: false, bos: false, geo: false, ew: false, wyckoff: false, vp: false, entry: false, mtf: false, liq: false, trade: false });
  const lastOverlayRerenderRef = useRef(0);
  const OVERLAY_RERENDER_INTERVAL_MS = 15_000;
  // CRITICAL FIX: Periodic overlay refresh interval.
  // A separate timer that re-renders overlays periodically, ensuring trend
  // lines and other overlays stay current even if the WebSocket path fails.
  const PERIODIC_OVERLAY_REFRESH_MS = 30_000;
  // FIX: Track when candlesRef was last cleared (timeframe change) so we can
  // timeout the "reject all WebSocket updates" guard. Previously, if the
  // historical fetch failed, the chart would stay empty forever because
  // candlesRef.current.length === 0 and all WebSocket updates were dropped.
  const candlesClearedAtRef = useRef(0);
  const CANDLES_CLEAR_TIMEOUT_MS = 10_000; // Allow WebSocket after 10s even if fetch failed
  // FIX: Clear candlesRef on BOTH symbol and timeframe changes.
  // Previously, only timeframe change cleared the ref. When the symbol
  // changed (e.g., BTC/USD → ETH/USD), RouaChart's candlesRef still held
  // the old symbol's data. This caused WebSocket ticks for the new symbol
  // to be MERGED with old symbol's candles, producing mixed/invalid data
  // that could cause "Value is null" errors or invisible candles.
  const prevSymbolRef = useRef(selectedSymbol);
  useEffect(() => {
    timeframeRef.current = timeframe;
    // Clear RouaChart's candlesRef immediately on timeframe or symbol change
    // to prevent stale WebSocket onCandleUpdate from pushing old data
    candlesRef.current = [];
    candlesClearedAtRef.current = Date.now();
    prevSymbolRef.current = selectedSymbol;
  }, [timeframe, selectedSymbol]);

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
      const alignedTime = Math.floor(candle.time / tfSecondsRef.current) * tfSecondsRef.current;
      const alignedCandle = { ...candle, time: alignedTime };

      // Update or add candle using the reliable setCandles() approach.
      // This avoids data inconsistencies between RouaChart's candlesRef
      // and useChart's candlesRef that the incremental updateCandle()
      // approach caused. The simple merge + setCandles is slower but
      // guarantees data consistency.
      const idx = candlesRef.current.findIndex(c => c.time === alignedTime);
      const isNewCandle = idx < 0;
      if (idx >= 0) {
        // Merge: keep the widest high/low, latest close
        const existing = candlesRef.current[idx];
        candlesRef.current[idx] = {
          ...existing,
          high: Math.max(existing.high, alignedCandle.high),
          low: Math.min(existing.low, alignedCandle.low),
          close: alignedCandle.close,
          volume: alignedCandle.volume || existing.volume,
        };
      } else {
        candlesRef.current.push(alignedCandle);
      }
      // Always use setCandles for consistency — this ensures useChart's
      // candlesRef and the chart series are always in sync.
      setCandlesRef.current([...candlesRef.current]);
      // REVOLUTIONARY: Incremental computation update (O(1) per candle)
      try {
        if (incrementalInitializedRef.current) {
          updateIncremental(incrementalRef.current, alignedCandle, candlesRef.current[candlesRef.current.length - 2]);
        }
      } catch { /* incremental update not critical */ }

      // ═══════════════════════════════════════════════════════════════════
      // FIX: Re-render candle-only overlays when a NEW candle arrives.
      //
      // Previously, overlays (trend lines, SR, FVG, BOS, etc.) were only
      // drawn when the user toggled them ON or changed the timeframe.
      // As new candles arrived via WebSocket, the overlays became stale —
      // the trend lines still reflected the market structure from when they
      // were first drawn, not the current structure.
      //
      // Now: when a new candle is added (not just an update to an existing
      // one), we re-render ALL currently active overlays using the latest
      // candle data. This is throttled to OVERLAY_RERENDER_INTERVAL_MS
      // (15 seconds) because ZigZag + clustering is CPU-intensive.
      // ═══════════════════════════════════════════════════════════════════
      // ═══════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Re-render overlays when candle data changes.
      //
      // This is the KEY fix for: "trend lines not drawn as new candles arrive."
      // Previous code only rendered inside a throttle check, and had no
      // fallback imports — so if overlayRendererRef was null, overlays were
      // silently skipped forever.
      //
      // Now: We ALWAYS update aiPanelCandles on new candle arrival (not
      // gated by throttle), and we use fallback imports like
      // handleOverlayChange does.
      // ═══════════════════════════════════════════════════════════════════
      if (isNewCandle) {
        // ALWAYS update aiPanelCandles when a new candle arrives —
        // don't gate this on throttle. The AISmartPanel needs fresh data
        // to trigger its own overlay change callback.
        if (showAIPanelRef.current) {
          setAiPanelCandles([...candlesRef.current]);
        }

        const currentOverlays = currentOverlaysRef.current;
        const anyActive = Object.values(currentOverlays).some(v => v === true);
        if (anyActive) {
          const now = Date.now();
          if (now - lastOverlayRerenderRef.current >= OVERLAY_RERENDER_INTERVAL_MS) {
            lastOverlayRerenderRef.current = now;
            // Use requestAnimationFrame to avoid blocking the render cycle
            requestAnimationFrame(async () => {
              try {
                // CRITICAL FIX: Use fallback imports (same as handleOverlayChange)
                // Previously these were direct ref reads with no fallback,
                // so if the pre-load failed, overlays were NEVER re-rendered.
                const overlayMod = overlayRendererRef.current || await import('@/lib/charts/overlay-renderer');
                const registryMod = overlayRegistryRef.current || await import('@/lib/charts/OverlayRegistry');
                const series = chart.candleSeriesRef?.current;
                if (!series) return;

                // Re-validate series after potential async import
                const currentSeries = chart.candleSeriesRef?.current;
                if (currentSeries !== series) return;

                const reg = registryMod.getOverlayRegistry();
                reg.init(series, chart.removePriceLine);

                const cached = lastAnalysisResultRef.current;
                overlayMod.renderOverlays(series, {
                  candles: candlesRef.current,
                  overlays: currentOverlays,
                  supportLevels: cached?.supportLevels || [],
                  resistanceLevels: cached?.resistanceLevels || [],
                  smcData: (cached as any)?.smcData,
                  geoPatterns: (cached as any)?.geoPatterns,
                  elliottPattern: (cached as any)?.elliottPattern,
                  wyckoff: (cached as any)?.wyckoff,
                  volumeProfile: (cached as any)?.volumeProfile,
                  entryExit: (cached as any)?.entryExit,
                  signal: (cached as any)?.signal,
                  patterns: cached?.patterns || [],
                  alerts: (cached as any)?.alerts,
                  fusionResult: (cached as any)?.fusionResult,
                  bayesianResult: (cached as any)?.bayesianResult,
                  mtfResult: (cached as any)?.mtfResult,
                  tradeProposals: (cached as any)?.tradeProposals,
                  liquidityResult: (cached as any)?.liquidityResult,
                }, chart.addPriceLine, chart.removePriceLine);
              } catch (e) {
                console.warn('[RouaChart] Overlay re-render on new candle error:', e);
              }
            });
          }
        }
      }
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

  // ═══════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Periodic overlay refresh timer.
  //
  // This is the SAFETY NET for the "trend lines not drawn as new candles
  // arrive" bug. Even if the WebSocket path fails (null refs, race
  // conditions, throttle misses), this timer ensures overlays are
  // re-rendered every PERIODIC_OVERLAY_REFRESH_MS (30 seconds).
  //
  // How it works:
  // 1. Every 30 seconds, checks if any overlay is active
  // 2. If so, imports overlay-renderer (with fallback) and calls
  //    renderOverlays with current candle data
  // 3. Also updates aiPanelCandles so AISmartPanel's candleSignatureRef
  //    effect can trigger overlay changes
  //
  // This is the MOST RELIABLE path because it doesn't depend on:
  // - WebSocket events (may not fire isNewCandle correctly)
  // - AISmartPanel analysis (only calls renderAnalysisOverlays)
  // - Throttle timing (may miss the window)
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const currentOverlays = currentOverlaysRef.current;
        const anyActive = Object.values(currentOverlays).some(v => v === true);
        if (!anyActive) return;

        // Need candles to render overlays
        if (!candlesRef.current || candlesRef.current.length < 20) return;

        const overlayMod = overlayRendererRef.current || await import('@/lib/charts/overlay-renderer');
        const registryMod = overlayRegistryRef.current || await import('@/lib/charts/OverlayRegistry');
        const series = chart.candleSeriesRef?.current;
        if (!series) return;

        const reg = registryMod.getOverlayRegistry();
        reg.init(series, chart.removePriceLine);

        const cached = lastAnalysisResultRef.current;
        overlayMod.renderOverlays(series, {
          candles: candlesRef.current,
          overlays: currentOverlays,
          supportLevels: cached?.supportLevels || [],
          resistanceLevels: cached?.resistanceLevels || [],
          smcData: (cached as any)?.smcData,
          geoPatterns: (cached as any)?.geoPatterns,
          elliottPattern: (cached as any)?.elliottPattern,
          wyckoff: (cached as any)?.wyckoff,
          volumeProfile: (cached as any)?.volumeProfile,
          entryExit: (cached as any)?.entryExit,
          signal: (cached as any)?.signal,
          patterns: cached?.patterns || [],
          alerts: (cached as any)?.alerts,
          fusionResult: (cached as any)?.fusionResult,
          bayesianResult: (cached as any)?.bayesianResult,
          mtfResult: (cached as any)?.mtfResult,
          tradeProposals: (cached as any)?.tradeProposals,
          liquidityResult: (cached as any)?.liquidityResult,
        }, chart.addPriceLine, chart.removePriceLine);

        // Also update aiPanelCandles so AISmartPanel's candleSignatureRef
        // effect triggers onOverlayChange for the next cycle
        if (showAIPanelRef.current) {
          setAiPanelCandles(prev => {
            const next = candlesRef.current;
            // Only update if candle data actually changed (avoid infinite loop)
            if (prev.length === next.length && prev.length > 0 &&
                prev[prev.length - 1]?.time === next[next.length - 1]?.time) {
              return prev;
            }
            return [...next];
          });
        }
      } catch (e) {
        // Silent fail — periodic refresh is a best-effort safety net
      }
    }, PERIODIC_OVERLAY_REFRESH_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          // Pass clearExternal:true because this is a timeframe/symbol change —
          // old AI overlay series have timestamps from the previous timeframe
          // and would cause "Value is null" crash if left on the chart.
          setCandlesRef.current(unique, { clearExternal: true });
          // Update AI panel candles if panel is open so overlays can redraw
          if (showAIPanel) {
            setAiPanelCandles([...unique]);
          }
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
      // Pass clearExternal:true because this is a timeframe/symbol change —
      // simulated data means the timeframe changed.
      setCandlesRef.current(candles, { clearExternal: true });
      // Update AI panel candles if panel is open so overlays can redraw
      if (showAIPanel) {
        setAiPanelCandles([...candles]);
      }
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
      // Clean up OverlayManager on unmount
      resetOverlayManager();
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
      // MT5 style: always show axis labels for Entry/SL/TP
      chart.addPriceLine(id, price, color, label, lineWidth, lineStyle, axisLabelVisible);
      positionLineIdsRef.current.push(id);
    };

    // Exchange positions
    positions.forEach(pos => {
      const posSymbol = normalizeSymbol(pos.symbol || '');
      if (!posSymbol.includes(chartSymbol) && !chartSymbol.includes(posSymbol)) return;
      const entryPrice = Number(pos.entryPrice || pos.avgEntryPrice || 0);
      const isLong = (pos.side || '').toLowerCase() === 'long';
      if (entryPrice > 0) {
        // MT5 style: entry line is white/cyan dashed
        addLine(`pos-entry-${pos.id || posSymbol}`, entryPrice, '#00D4FF', 2, 2, isLong ? '▲ Entry' : '▼ Entry', true);
      }
      const sl = Number(pos.stopLoss || pos.sl || 0);
      if (sl > 0) {
        const slPnl = entryPrice > 0 ? ((sl - entryPrice) * Number(pos.qty || 1) * (isLong ? 1 : -1)) : 0;
        const slLabel = `SL ${sl.toFixed(sl > 10 ? 2 : 5)}`;
        addLine(`pos-sl-${pos.id || posSymbol}`, sl, '#FF4757', 1, 2, slLabel, true);
      }
      const tp = Number(pos.takeProfit || pos.tp || 0);
      if (tp > 0) {
        const tpPnl = entryPrice > 0 ? ((tp - entryPrice) * Number(pos.qty || 1) * (isLong ? 1 : -1)) : 0;
        const tpLabel = `TP ${tp.toFixed(tp > 10 ? 2 : 5)}`;
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
      // MT5 style: cyan entry line with direction label
      addLine(`trade-entry-grp-${key}`, entryPrice, '#00D4FF', 2, 2, isLong ? '▲ Entry' : '▼ Entry', true);
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

  // ── Incremental Overlay Management ──────────────────────
  // Track overlays by type so we can clear/redraw only a specific type
  // instead of destroying ALL overlays on every toggle change.
  const overlaySeriesByTypeRef = useRef<Record<string, any[]>>({});
  const priceLinesByTypeRef = useRef<Record<string, string[]>>({});

  // Pre-load lightweight-charts module on mount to eliminate the async gap
  // in handlePatternsDetected. Previously the `await import('lightweight-charts')`
  // created a race condition where overlays were cleared but not redrawn.
  useEffect(() => {
    import('lightweight-charts').then(mod => {
      lightweightChartsRef.current = mod;
    }).catch(() => {});
  }, []);

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

  // Cleanup function for AI overlays — reusable across multiple call sites.
  // Uses OverlayRegistry for primitive-based lifecycle management.
  // IMPORTANT: Only resets the registry on timeframe change (when the series
  // will be recreated). Does NOT destroy the singleton when simply toggling
  // overlays off — that would lose tracking state and cause orphaned primitives.
  const cleanupAIOverlays = useCallback(() => {
    try {
      const { getOverlayRegistry, resetOverlayRegistry } = require('@/lib/charts/OverlayRegistry');
      const reg = getOverlayRegistry();
      // Set removePriceLine callback so clearAll() can remove price lines
      reg.setRemovePriceLine(chart.removePriceLine);
      reg.clearAll();
      // Destroy the singleton only on timeframe change — the chart will be
      // recreated, so all primitives and price lines must go. The next
      // renderOverlays call will create a fresh registry.
      resetOverlayRegistry();
    } catch {}
    // SAFETY NET: Brute-force remove ALL price lines from the candle series.
    // This catches orphaned lines from: delayed addPriceLine retries,
    // race conditions between useChart and RouaChart cleanup, and
    // any lines that lost their tracking ID.
    try {
      const series = chart.candleSeriesRef?.current || chart.mainSeriesRef?.current;
      if (series) {
        const allLines: any[] = series.priceLines?.() || [];
        allLines.forEach((line: any) => {
          try { series.removePriceLine(line); } catch {}
        });
      }
    } catch {}
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
      const chartApi = chart.chartRef?.current;
      const active = getActiveAnimations();
      for (const anim of active) {
        try { cancelAnimatedPattern(chartApi, anim.patternId); } catch {}
      }
    } catch {}
  }, [chart]);

  // Clean up AI overlays when timeframe changes
  useEffect(() => {
    cleanupAIOverlays();
    // FIX: Clear lastAnalysisResultRef so stale overlay data from the
    // previous timeframe doesn't get re-used by handlePatternsDetected.
    // Without this, overlays from old timeframes accumulate on the chart.
    lastAnalysisResultRef.current = null;
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
  // Runs always when candles are available — generates browser notifications
  // and audio alerts for high-confidence patterns detected in background.
  // When AI panel is open, the AISmartPanel handles more detailed detection.
  useEffect(() => {
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
            const names = highConf.map(p => p.type).join(', ');
            const bosNames = bos.map(b => `${b.type}${b.direction==='bullish'?'↑':'↓'}`).join(', ');
            const body = [names, bosNames].filter(Boolean).join(' | ');
            new Notification(tc('notificationTitle', { symbol: selectedSymbol }), { body, icon: '/favicon.ico' });
          } else if (Notification.permission === 'default') {
            Notification.requestPermission();
          }
        }
        // Audio alerts for high-confidence patterns
        try {
          const { getPatternAudioAlerter } = await import('@/lib/charts/AudioAlerts');
          const alerter = getPatternAudioAlerter();
          for (const p of highConf) {
            alerter.announce({
              patternType: p.type,
              patternTypeAr: p.type,
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
  }, [selectedSymbol, timeframe]);

  // FIX: Removed aiProcessingRef — was declared but never used. The async lock
  // was previously removed in favor of direct execution, but the ref remained
  // as dead code. The aiProcessingRef was also referenced in a comment that
  // said "Direct execution — no lock needed", confirming it's unused.

  const lastAnalysisResultRef = useRef<any>(null); // store full result for retry draws
  const [aiDirectMarkers, setAiDirectMarkers] = useState<any[]>([]); // markers مباشرة من handlePatternsDetected

  // ═══════════════════════════════════════════════════════════════════
  // Primitive-based overlay rendering
  // Uses ISeriesPrimitive (NOT LineSeries!) for ALL chart drawings.
  // Based on research: TradingView lightweight-charts v5 official API.
  // ═══════════════════════════════════════════════════════════════════
  // NOTE: overlayRendererRef, overlayRegistryRef, currentOverlaysRef,
  // lastOverlayRerenderRef, and OVERLAY_RERENDER_INTERVAL_MS are
  // declared earlier (before WebSocket handler) to avoid TDZ errors.

  // ── SUSTAINABLE: handlePatternsDetected ──────────────────────────
  // When analysis completes, this handler fires. It does TWO things:
  //   1. Update the cached analysis data (lastAnalysisResultRef)
  //   2. Render ONLY analysis-dependent overlays (VP, Entry, Fusion,
  //      Bayesian, Alerts, MTF, Trade, Liquidity)
  //
  // It does NOT re-render candle-only overlays (SR, Trend, Harmonic,
  // FVG, BOS, Geo, Elliott, Wyckoff). Those are handled exclusively
  // by handleOverlayChange when the user toggles buttons.
  //
  // This eliminates:
  //   - Double emission (analysis overlay vs toggle overlay)
  //   - Flicker (clearAll destroys candle-only overlays)
  //   - Race conditions (independent rendering pipelines)
  // ═══════════════════════════════════════════════════════════════════
  const handlePatternsDetected = useCallback(async (result: AIAnalysisResult) => {
    try {
    const ov = (result as any).overlays || {};
    const anyOverlayEnabled = Object.values(ov).some(v => v === true);

    if (!anyOverlayEnabled) {
      setAiPatterns([]);
    }

    // STEP 1: Update cached analysis data — this is the single source
    // of truth for analysis-dependent overlay rendering.
    lastAnalysisResultRef.current = result;

    // STEP 2: Get chart series for rendering
    const series = chart.candleSeriesRef?.current;
    if (!series) {
      console.warn('[AI Overlay] No candle series, skipping');
      return;
    }

    // STEP 3: Use cached overlay modules
    const overlayMod = overlayRendererRef.current || await import('@/lib/charts/overlay-renderer');
    const registryMod = overlayRegistryRef.current || await import('@/lib/charts/OverlayRegistry');

    if (!anyOverlayEnabled) {
      // All overlays off — clear everything
      const reg = registryMod.getOverlayRegistry();
      reg.init(series, chart.removePriceLine);
      reg.clearAll();
      return;
    }

    // Re-validate series after potential async import
    const currentSeries = chart.candleSeriesRef?.current;
    if (currentSeries !== series) {
      console.warn('[AI Overlay] Series changed during render, aborting');
      return;
    }

    // STEP 4: Render ONLY analysis-dependent overlays.
    // This is the KEY difference from the old code:
    // - Old: reg.clearAll() → renderOverlays() → destroys candle-only overlays
    // - New: renderAnalysisOverlays() → only touches VP/Entry/Fusion/Bayesian/MTF/Trade/Liq
    // Candle-only overlays (SR, Trend, Harmonic, FVG, BOS, Geo, EW, Wyckoff)
    // remain untouched on the chart.
    overlayMod.renderAnalysisOverlays(series, {
      candles: candlesRef.current,
      overlays: ov,
      supportLevels: result.supportLevels,
      resistanceLevels: result.resistanceLevels,
      smcData: (result as any).smcData,
      geoPatterns: (result as any).geoPatterns,
      elliottPattern: (result as any).elliottPattern,
      wyckoff: (result as any).wyckoff,
      volumeProfile: (result as any).volumeProfile,
      entryExit: (result as any).entryExit,
      signal: (result as any).signal,
      patterns: result.patterns,
      alerts: (result as any).alerts,
      fusionResult: (result as any).fusionResult,
      bayesianResult: (result as any).bayesianResult,
      mtfResult: (result as any).mtfResult,
      tradeProposals: (result as any).tradeProposals,
      liquidityResult: (result as any).liquidityResult,
    }, chart.addPriceLine, chart.removePriceLine);

    } catch (e) {
      console.warn('[AI Overlay] handlePatternsDetected error:', e);
    }
  }, [chart]);

  // ═══════════════════════════════════════════════════════════════════
  // Sustainable: Direct overlay change handler
  // Called when user toggles overlay buttons in AISmartPanel.
  //
  // Architecture (SUSTAINABLE — two independent pipelines):
  //   Pipeline 1 (THIS): User toggle → onOverlayChange → renderOverlays
  //     Renders ALL overlay types (candle-only + analysis-dependent)
  //     using cached analysis data. Candle-only overlays (trend, SR,
  //     FVG, BOS, harmonic, geo, EW, Wyckoff) work immediately from
  //     candles alone. Analysis-dependent overlays (VP, Entry, MTF,
  //     Trade, Liq) use cached data if available.
  //
  //   Pipeline 2: Analysis complete → handlePatternsDetected → renderAnalysisOverlays
  //     Renders ONLY analysis-dependent overlays (VP, Entry, Fusion,
  //     Bayesian, Alerts, MTF, Trade, Liq). Does NOT touch candle-only
  //     overlays, preventing flicker.
  //
  // KEY: renderOverlays uses per-type prepareRedraw/clearType internally,
  // so we do NOT need clearAll() here. Each overlay type is independently
  // cleared and re-rendered, leaving other types untouched.
  // ═══════════════════════════════════════════════════════════════════
  const handleOverlayChange = useCallback(async (overlays: {
    sr: boolean; trend: boolean; harmonic: boolean; fvg: boolean;
    bos: boolean; geo: boolean; ew: boolean; wyckoff: boolean;
    vp: boolean; entry: boolean; mtf: boolean; liq: boolean; trade: boolean;
  }) => {
    // FIX: Store current overlay flags so WebSocket handler can re-render
    currentOverlaysRef.current = { ...overlays };

    try {
      const series = chart.candleSeriesRef?.current;
      if (!series) return;

      const overlayMod = overlayRendererRef.current || await import('@/lib/charts/overlay-renderer');
      const registryMod = overlayRegistryRef.current || await import('@/lib/charts/OverlayRegistry');
      const anyOverlayEnabled = Object.values(overlays).some(v => v === true);

      if (!anyOverlayEnabled) {
        setAiPatterns([]);
        const reg = registryMod.getOverlayRegistry();
        reg.init(series, chart.removePriceLine);
        reg.clearAll();
        return;
      }

      // Re-validate series after potential async import
      const currentSeries = chart.candleSeriesRef?.current;
      if (currentSeries !== series) return;

      // SUSTAINABLE: Do NOT call reg.clearAll() here.
      // renderOverlays() uses per-type prepareRedraw/clearType internally,
      // which only clears and re-renders the specific overlay type being
      // updated. This means:
      //   - Toggling trend ON doesn't touch SR overlays
      //   - Toggling SR OFF doesn't touch trend overlays
      //   - No flicker from clearing everything and re-drawing
      const reg = registryMod.getOverlayRegistry();
      reg.init(series, chart.removePriceLine);

      // Use cached analysis data if available, empty otherwise.
      const cached = lastAnalysisResultRef.current;

      overlayMod.renderOverlays(series, {
        candles: candlesRef.current,
        overlays,
        supportLevels: cached?.supportLevels || [],
        resistanceLevels: cached?.resistanceLevels || [],
        smcData: (cached as any)?.smcData,
        geoPatterns: (cached as any)?.geoPatterns,
        elliottPattern: (cached as any)?.elliottPattern,
        wyckoff: (cached as any)?.wyckoff,
        volumeProfile: (cached as any)?.volumeProfile,
        entryExit: (cached as any)?.entryExit,
        signal: (cached as any)?.signal,
        patterns: cached?.patterns || [],
        alerts: (cached as any)?.alerts,
        fusionResult: (cached as any)?.fusionResult,
        bayesianResult: (cached as any)?.bayesianResult,
        mtfResult: (cached as any)?.mtfResult,
        tradeProposals: (cached as any)?.tradeProposals,
        liquidityResult: (cached as any)?.liquidityResult,
      }, chart.addPriceLine, chart.removePriceLine);

    } catch (e) {
      console.warn('[AI Overlay] handleOverlayChange error:', e);
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
        const label = p.type;
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

  const toolbarHeight = hideToolbar ? 0 : mobile ? 48 : 38;

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
        onToggleSmartGrid={() => setShowSmartGrid(!showSmartGrid)}
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

          {/* Chart Canvas Container — lightweight-charts renders here.
              DrawingRenderer uses Series Primitive (Plugin System) — draws on the same canvas.
              No overlay canvas, no z-index switching, no CSS modifications. */}
          <div
            ref={chart.containerRef as any}
            style={{
              width: '100%',
              flex: 1,
              minHeight: 0,
              background: T.bg,
              position: 'relative',
              zIndex: 1,
            }}
          />

          {/* Overlay Layer — sibling of canvas container, z-index below chart */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 0 }}>

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

          {/* FIX: Drawing Panel — rendered INSIDE Chart Wrapper (not portal) so it's positioned
              relative to the chart container. Uses position:absolute instead of fixed so it
              stays within chart boundaries even when the chart is in a dashboard grid cell. */}
          {showDrawingPanel && (
            <div style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 50,
              maxHeight: '90%',
              overflow: 'hidden',
            }}>
              <DrawingPanel
                activeTool={chart.activeTool}
                onSetTool={chart.setTool}
                onClose={() => setShowDrawingPanel(false)}
                onClearAll={chart.clearDrawings}
              />
            </div>
          )}
        </div>{/* ── Chart Wrapper close ── */}

        {/* Indicator Panel (draggable) — rendered via Portal to escape .panel backdrop-filter containing block */}
        {showIndicatorPanel && createPortal(
          <DraggablePanel defaultPosition={{ top: 40, right: 80 }} defaultWidth={230} minHeight={200}>
            <IndicatorPanel
              activeIndicators={chart.getActiveIndicators().map(i => i.key)}
              onToggleIndicator={handleToggleIndicator}
              onOpenSettings={handleOpenSettings}
              onClose={() => setShowIndicatorPanel(false)}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* Indicator Settings Panel (draggable) — rendered via Portal */}
        {showSettingsPanel && settingsIndicator && createPortal(
          <DraggablePanel defaultPosition={{ top: 40, right: 300 }} defaultWidth={220} minHeight={180} resizable={false}>
            <IndicatorSettings
              indicator={settingsIndicator}
              onSave={handleSaveSettings}
              onClose={() => { setShowSettingsPanel(false); setSettingsIndicator(null); }}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* Volume Profile (draggable) — rendered via Portal */}
        {showVolumeProfile && createPortal(
          <DraggablePanel defaultPosition={{ top: 50, right: 10 }} minWidth={260} minHeight={200}>
            <VolumeProfile
              candles={candlesRef.current}
              width={240}
              rows={24}
              visible={showVolumeProfile}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}




        {/* Chart Trading Panel (draggable) — rendered via Portal */}
        {showChartTrading && currentPrice && createPortal(
          <DraggablePanel defaultPosition={{ top: 50, right: 8 }} defaultWidth={240} minHeight={300}>
            <ChartTrading
              symbol={selectedSymbol}
              currentPrice={typeof currentPrice === 'number' ? currentPrice : 0}
              onClose={() => setShowChartTrading(false)}
              onPlaceOrder={handlePlaceOrder}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* Quick Trade Panel (draggable) — rendered via Portal */}
        {showQuickTrade && createPortal(
          <DraggablePanel defaultPosition={{ top: 120, left: 12 }} defaultWidth={260} minHeight={200}>
            <QuickTradePanel
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              onPlaceOrder={handlePlaceOrder}
              onClose={() => setShowQuickTrade(false)}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* Template Manager (draggable) — rendered via Portal */}
        {showTemplateManager && createPortal(
          <DraggablePanel defaultPosition={{ top: 40, left: 100 }} defaultWidth={280} minHeight={250}>
            <TemplateManager
              onLoadTemplate={chart.loadTemplate}
              onSaveTemplate={chart.saveTemplate}
              onClose={() => setShowTemplateManager(false)}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* Chart Settings Panel (draggable) — rendered via Portal */}
        {showChartSettings && createPortal(
          <DraggablePanel defaultPosition={{ top: 40, right: 8 }} defaultWidth={260} minHeight={200}>
            <ChartSettingsPanel
              settings={chart.settings}
              onUpdateSettings={chart.updateSettings}
              onClose={() => setShowChartSettings(false)}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* Compare Overlay (draggable) — rendered via Portal */}
        {showCompare && chart.chartRef?.current && createPortal(
          <DraggablePanel defaultPosition={{ top: 50, right: 10 }} minWidth={260} minHeight={200}>
            <CompareOverlay
              chart={chart.chartRef.current}
              symbol={compareSymbol || 'ETH/USDT'}
              onClose={() => setShowCompare(false)}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* Smart Grid — unified multi-chart + MTF */}
        {showSmartGrid && (
          <SmartGrid
            onClose={() => setShowSmartGrid(false)}
            defaultSymbol={selectedSymbol}
            defaultTimeframe={timeframe}
            onSwitchToChart={(symbol, tf, openTool) => {
              // Switch main chart to the selected symbol/timeframe
              setSelectedSymbol(symbol);
              setTimeframe(tf);
              // Open the requested tool after a brief delay (chart needs to load)
              if (openTool) {
                setTimeout(() => {
                  if (openTool === 'drawing') setShowDrawingPanel(true);
                  else if (openTool === 'indicators') setShowIndicatorPanel(true);
                  else if (openTool === 'ai') setShowAIPanel(true);
                  else if (openTool === 'trading') setShowChartTrading(true);
                }, 500);
              }
            }}
          />
        )}

        {/* Share Chart (draggable) — rendered via Portal */}
        {showShare && createPortal(
          <DraggablePanel defaultPosition={{ top: 50, right: 10 }} minWidth={260} minHeight={200}>
            <ShareChart
              symbol={selectedSymbol}
              timeframe={timeframe}
              activeIndicators={chart.getActiveIndicators().map(i => i.key)}
              chartType={chart.settings.type}
              onClose={() => setShowShare(false)}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* ── 5 New Feature Components ── */}

        {/* Footprint Chart (draggable) — rendered via Portal */}
        {showFootprint && createPortal(
          <DraggablePanel defaultPosition={{ top: 50, right: 8 }} defaultWidth={300} minHeight={250}>
            <FootprintChart
              symbol={selectedSymbol}
              onClose={() => setShowFootprint(false)}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* Alert Panel replaced by PriceAlertLine below */}

        {/* Pattern Progress (draggable) — rendered via Portal */}
        {showPatternProgress && createPortal(
          <DraggablePanel defaultPosition={{ top: 120, left: 12 }} defaultWidth={280} minHeight={220}>
            <PatternProgress
              symbol={selectedSymbol}
              candles={candlesRef.current}
              onClose={() => setShowPatternProgress(false)}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* ── 3 Revolutionary Feature Components ── */}

        {/* Price Alert Line (draggable) — rendered via Portal */}
        {showAlerts && createPortal(
          <DraggablePanel defaultPosition={{ top: 0, right: 0 }} defaultWidth={300} minHeight={250}>
            <PriceAlertLine
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              chart={chart}
              onClose={() => setShowAlerts(false)}
              onAlertsCountChange={setPriceAlertsCount}
            />
          </DraggablePanel>,
          getPortalRoot()
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

        {/* Mini Heatmap (draggable) — rendered via Portal */}
        {showHeatmap && createPortal(
          <DraggablePanel defaultPosition={{ top: 50, right: 8 }} defaultWidth={340} minHeight={300}>
            <MiniHeatmap
              selectedSymbol={selectedSymbol}
              onSelectSymbol={(symbol) => {
                const { setSelectedSymbol } = useSymbolStore.getState();
                setSelectedSymbol(symbol);
              }}
              onClose={() => setShowHeatmap(false)}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

      </div>{/* ── Chart Area close ── */}

      {/* ── Watchlist Overlay (draggable) — rendered via Portal ── */}
      {showWatchlist && createPortal(
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
        </DraggablePanel>,
        getPortalRoot()
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
        <DraggablePanel defaultPosition={{ top: 130, left: 350 }} defaultWidth={255} minHeight={340} resizable={true}>
          <AISmartPanel
            symbol={selectedSymbol}
            candles={aiPanelCandles}
            currentPrice={currentPrice}
            onPatternsDetected={handlePatternsDetected}
            onOverlayChange={handleOverlayChange}
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
