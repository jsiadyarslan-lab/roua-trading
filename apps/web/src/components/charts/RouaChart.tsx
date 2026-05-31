// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Main Component
// Professional trading chart using lightweight-charts v5
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { getPortalRoot } from '@/lib/portal-root';
import { useChart } from '@/hooks/useChart';
import { useChartStateStore, type SerializedIndicator } from '@/hooks/useChartStateStore';
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
import { resetOverlayRegistry } from '@/lib/charts/OverlayRegistry';
import { detectProfessionalTrendLines, type TrendLine } from '@/lib/charts/ProfessionalTrendLines';
import { ChartTrading } from './ChartTrading';
import { QuickTradePanel } from './QuickTradePanel';
import { TemplateManager } from './TemplateManager';
import { GridTemplateManager, type GridTemplate } from '@/lib/charts/GridTemplate';
import { ChartSettingsPanel } from './ChartSettingsPanel';
import { CompareOverlay } from './CompareOverlay';
const SmartGrid = dynamic(() => import('./SmartGrid').then(m => ({ default: m.SmartGrid })), { ssr: false })
import { LAYOUT_METAS, type LayoutConfig, getAllChartInstances, getAllMainSeries, getChartControl, getAllChartControls, registerChartInstance, unregisterChartInstance, registerChartControl, unregisterChartControl, type ChartControlAPI, type CellChartState } from '@/hooks/multi-chart-registry';
import { useMultiChartStore, getActiveChartControl } from '@/hooks/useMultiChartStore';
import { useChartSync } from '@/hooks/useChartSync';
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
  // ── Per-instance symbol/timeframe (for multi-chart) ──
  // When provided, overrides useSymbolStore() values.
  // This allows multiple RouaChart instances with different symbols.
  symbol?: string;
  timeframe?: string;
  // ── Multi-chart cell metadata ──
  chartId?: string;
  isActive?: boolean;
  onActivate?: () => void;
  onClose?: () => void;
  canClose?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
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

// ── Mini Chart Header (for multi-chart compact mode) ──
// Shows symbol, timeframe selector, current price, and close button.
// Replaces the full toolbar when RouaChart is used as a mini chart cell.
const POPULAR_SYMBOLS_MINI = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
  'ADA/USDT', 'DOGE/USDT', 'EUR/USD', 'GBP/USD', 'XAU/USD',
];
const TIMEFRAME_MINI = [
  { value: '1min', label: '1m' }, { value: '5min', label: '5m' },
  { value: '15min', label: '15m' }, { value: '1h', label: '1H' },
  { value: '4h', label: '4H' }, { value: '1day', label: '1D' },
];

function MiniChartHeader({
  symbol, timeframe, currentPrice, changePercent, isPaused, loading,
  onSymbolChange, onTimeframeChange, onActivate, onClose, canClose, isActive,
}: {
  symbol: string; timeframe: string; currentPrice: number | null;
  changePercent: number | null; isPaused: boolean; loading: boolean;
  onSymbolChange: (s: string) => void; onTimeframeChange: (tf: string) => void;
  onActivate: () => void; onClose?: () => void; canClose?: boolean; isActive: boolean;
}) {
  const isPositive = changePercent !== null && changePercent >= 0;
  const fmtPrice = (p: number) => {
    if (p > 10000) return p.toFixed(0);
    if (p > 100) return p.toFixed(1);
    if (p > 1) return p.toFixed(2);
    return p.toFixed(5);
  };

  return (
    <div
      onMouseDown={onActivate}
      style={{
        display: 'flex', alignItems: 'center', height: 28, padding: '0 6px',
        borderBottom: isActive ? '1.5px solid rgba(0,212,255,0.5)' : '1px solid #1E2530',
        background: isActive ? 'rgba(0,212,255,0.04)' : 'rgba(17,22,32,0.95)',
        boxShadow: isActive ? '0 0 16px rgba(0,212,255,0.15)' : 'none',
        flexShrink: 0, gap: 4, direction: 'ltr', cursor: 'default',
      }}
    >
      {/* Symbol selector */}
      <select value={symbol} onClick={e => e.stopPropagation()}
        onChange={e => onSymbolChange(e.target.value)}
        style={{
          background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
          borderRadius: 3, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, fontWeight: 700, padding: '1px 4px', cursor: 'pointer',
          outline: 'none', maxWidth: 90, flexShrink: 0,
        }}
      >
        {POPULAR_SYMBOLS_MINI.map(p => (
          <option key={p} value={p} style={{ background: '#111620', color: '#F0F2F5' }}>{p}</option>
        ))}
      </select>

      {/* Timeframe buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
        {TIMEFRAME_MINI.map(tf => {
          const active = timeframe === tf.value;
          return (
            <button key={tf.value}
              onClick={e => { e.stopPropagation(); onTimeframeChange(tf.value); }}
              style={{
                background: active ? 'rgba(0,212,255,0.15)' : 'transparent',
                border: active ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
                borderRadius: 2, color: active ? '#00D4FF' : '#4B5563',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                fontWeight: active ? 700 : 500, padding: '0 3px', height: 18,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >{tf.label}</button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {loading && (
        <div style={{ width: 10, height: 10, border: '2px solid #1E2530',
          borderTopColor: '#00D4FF', borderRadius: '50%', animation: 'mcSpin 1s linear infinite' }} />
      )}
      {isPaused && !loading && <span style={{ color: '#fbbf24', fontSize: 8, fontWeight: 700 }}>⏸</span>}

      {currentPrice !== null && !loading && (
        <>
          <span style={{ color: '#F0F2F5', fontSize: 10, fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtPrice(currentPrice)}
          </span>
          {changePercent !== null && (
            <span style={{ color: isPositive ? '#3fb950' : '#f85149', fontSize: 8, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace", padding: '0 3px', borderRadius: 2,
              background: isPositive ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)' }}>
              {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
            </span>
          )}
        </>
      )}

      {canClose && onClose && (
        <button onClick={e => { e.stopPropagation(); onClose(); }}
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 2, color: '#4B5563', width: 18, height: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            flexShrink: 0,
          }}
          title="Close chart"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Price-Synced Candle Timer Component ──
// Styled like a price-scale label: sits right below the last-price label
// on the right edge and changes color with candle direction (green/red).
function PriceSyncedTimer({ chart, currentPrice, countdown, isBull }: {
  chart: any; currentPrice: number; countdown: string; isBull: boolean;
}) {
  const [y, setY] = useState<number | null>(null);

  // FIX: Use refs for chart methods to avoid re-running the effect when `chart`
  // object changes (which happens every render since useChart returns a new object).
  // Only re-subscribe when currentPrice actually changes.
  const getPriceCoordinateRef = useRef(chart.getPriceCoordinate);
  useEffect(() => { getPriceCoordinateRef.current = chart.getPriceCoordinate; }, [chart.getPriceCoordinate]);
  const onVisibleRangeChangeRef = useRef(chart.onVisibleRangeChange);
  useEffect(() => { onVisibleRangeChangeRef.current = chart.onVisibleRangeChange; }, [chart.onVisibleRangeChange]);

  useEffect(() => {
    const update = () => {
      try {
        const getPriceCoordinate = getPriceCoordinateRef.current;
        const coord = getPriceCoordinate ? getPriceCoordinate(currentPrice) : null;
        setY(coord);
      } catch { /* chart may be destroyed */ }
    };
    update();

    // Try useChart's onVisibleRangeChange first, fall back to IChartApi timeScale subscription
    let unsub: (() => void) | null = null;
    const onVisibleRangeChange = onVisibleRangeChangeRef.current;
    if (onVisibleRangeChange) {
      unsub = onVisibleRangeChange(update);
    } else if (chart.chartRef?.current?.timeScale) {
      const handler = () => update();
      try { chart.chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(handler); } catch {}
      unsub = () => { try { chart.chartRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {} };
    }

    // PERF: 2000ms — price label coordinate doesn't need sub-second updates
    const interval = setInterval(update, 2000);
    return () => { unsub?.(); clearInterval(interval); };
  // FIX: Only depend on currentPrice, not `chart` (which changes every render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

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

// ── Stable empty array for mini chart Zustand selector ──
// Prevents infinite re-renders: if we return `[]` inside a selector,
// Zustand sees a new reference each time → triggers re-render → new `[]` → loop.
const EMPTY_CHARTS: Array<{ id: string; symbol: string; timeframe: string; chartType: ChartType }> = [];

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
  // ── Per-instance props (for multi-chart) ──
  symbol: symbolProp,
  timeframe: timeframeProp,
  chartId,
  isActive = true,
  onActivate,
  onClose,
  canClose = true,
  isExpanded = false,
  onToggleExpand,
}: RouaChartProps) {
  const tc = useTranslations('dashboard.chart');
  const { selectedSymbol, timeframe: storeTimeframe, setTimeframe, setSelectedSymbol } = useSymbolStore();

  // ── Effective symbol/timeframe ──
  // When per-instance props are provided (multi-chart mode),
  // use them instead of the global store. This allows multiple
  // RouaChart instances to show different symbols simultaneously.
  const effectiveSymbol = symbolProp ?? selectedSymbol;
  const effectiveTimeframe = timeframeProp ?? storeTimeframe;

  // Alias for backward compatibility with the rest of the component.
  // These replace the old `selectedSymbol` and `timeframe` store references.
  // IMPORTANT: All code below uses selectedSymbol_ and timeframe_ which
  // resolve to the effective (prop-overridden) values.
  const selectedSymbol_ = effectiveSymbol;
  const timeframe_ = effectiveTimeframe;

  // ── Grid cell detection ──
  // A RouaChart is a grid cell when it has a chartId AND per-instance
  // symbol/timeframe props. Grid cells are FULL interactive charts
  // (not stripped-down "mini" versions). They render without their own
  // toolbar — the main toolbar at the top controls the active cell.
  // We NO LONGER use `compact` to mark grid cells because it was
  // stripping features (drawing, trades, indicators) making charts
  // look like static images. Now all charts are full-featured.
  const isGridCell = !!(chartId && symbolProp && timeframeProp);

  // Multi-chart state — only relevant for the main (non-mini) chart instance
  // FIX: Use stable selectors to prevent infinite re-renders.
  // Previously, inline selectors returned new `[]` every render for mini charts,
  // causing Zustand to detect a change and re-render → infinite loop → React error #185.
  const multiChartLayout = useMultiChartStore(s => !isGridCell ? (s.layout ?? '1x1') : '1x1');
  const isMultiChart = useMultiChartStore(s => !isGridCell ? (s.isMultiChart === true) : false);
  const activeChartId = useMultiChartStore(s => !isGridCell ? (s.activeChartId ?? 'mc-1') : '');
  // FIX: Use store directly for charts to avoid selector returning new array each render
  const chartsRaw = useMultiChartStore(s => s.charts);
  const charts = isGridCell ? EMPTY_CHARTS : (Array.isArray(chartsRaw) ? chartsRaw : [
    { id: 'mc-1', symbol: selectedSymbol_, timeframe: timeframe_, chartType: 'candle' as ChartType },
  ]);
  const addChart = useMultiChartStore(s => s.addChart);
  const removeChart = useMultiChartStore(s => s.removeChart);
  const setActiveChartId = useMultiChartStore(s => s.setActiveChartId);
  const changeLayout = useMultiChartStore(s => s.changeLayout);
  const resetToSingle = useMultiChartStore(s => s.resetToSingle);
  // Panel state version — forces toolbar re-render when panels toggle on grid cells
  const _panelStateVersion = useMultiChartStore(s => !isGridCell ? (s.panelStateVersion ?? 0) : 0);
  const expandedChartId = useMultiChartStore(s => !isGridCell ? (s.expandedChartId ?? null) : null);
  const toggleExpandChart = useMultiChartStore(s => s.toggleExpandChart);
  const [crosshairData, setCrosshairData] = useState<CrosshairData | null>(null);
  const [feedState, setFeedState] = useState<'live' | 'fallback' | 'waiting'>('waiting');
  // FIX: Ref for feedState to avoid stale closure in WebSocket callback
  const feedStateRef = useRef(feedState);
  useEffect(() => { feedStateRef.current = feedState; }, [feedState]);
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
  showAIPanelRef.current = showAIPanel; // synchronous: needed by ChartControlAPI getters
  const showDrawingPanelRef = useRef(showDrawingPanel);
  showDrawingPanelRef.current = showDrawingPanel;
  const showIndicatorPanelRef = useRef(showIndicatorPanel);
  showIndicatorPanelRef.current = showIndicatorPanel;
  const [aiPanelCandles, setAiPanelCandles] = useState<CandleData[]>([]);
  const [showChartTrading, setShowChartTrading] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState('');
  const [showSmartGrid, setShowSmartGrid] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showLayoutSelector, setShowLayoutSelector] = useState(false);
  // ── 5 New Feature States ──
  const [showFootprint, setShowFootprint] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showPatternProgress, setShowPatternProgress] = useState(false);
  // ── 3 Revolutionary Feature States ──
  const [showReplay, setShowReplay] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showAIStream, setShowAIStream] = useState(false);
  // ── Panel state refs (for ChartControlAPI getters — avoid stale closures) ──
  const showVolumeProfileRef = useRef(showVolumeProfile);
  showVolumeProfileRef.current = showVolumeProfile; // synchronous: needed by ChartControlAPI getters
  const showChartTradingRef = useRef(showChartTrading);
  showChartTradingRef.current = showChartTrading; // synchronous: needed by ChartControlAPI getters
  const showWatchlistRef = useRef(showWatchlist);
  showWatchlistRef.current = showWatchlist; // synchronous: needed by ChartControlAPI getters
  const showCompareRef = useRef(showCompare);
  showCompareRef.current = showCompare; // synchronous: needed by ChartControlAPI getters
  const showFootprintRef = useRef(showFootprint);
  showFootprintRef.current = showFootprint; // synchronous: needed by ChartControlAPI getters
  const showAlertsRef = useRef(showAlerts);
  showAlertsRef.current = showAlerts; // synchronous: needed by ChartControlAPI getters
  const showPatternProgressRef = useRef(showPatternProgress);
  showPatternProgressRef.current = showPatternProgress; // synchronous: needed by ChartControlAPI getters
  const showReplayRef = useRef(showReplay);
  showReplayRef.current = showReplay; // synchronous: needed by ChartControlAPI getters
  const showHeatmapRef = useRef(showHeatmap);
  showHeatmapRef.current = showHeatmap; // synchronous: needed by ChartControlAPI getters
  const showAIStreamRef = useRef(showAIStream);
  showAIStreamRef.current = showAIStream; // synchronous: needed by ChartControlAPI getters
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
  // FIX: Moved lastAnalysisResultRef up from line ~1412 to avoid TDZ error
  // in production minified builds. It's used in WebSocket onCandleUpdate (line ~529)
  // and periodic overlay refresh (line ~632) which are defined before the old location.
  const lastAnalysisResultRef = useRef<any>(null);

  const candlesRef = useRef<CandleData[]>([]);
  const prevPriceRef = useRef(currentPrice);
  const [pricePulse, setPricePulse] = useState(false);

  // ── Track current timeframe to ignore stale WebSocket updates ──
  // When timeframe changes, WebSocket may still deliver candles from the
  // old timeframe before reconnecting. This ref lets us filter those out.
  const timeframeRef = useRef(timeframe_);

  // ── Compute the timeframe's interval in seconds (as ref for TDZ safety) ──
  // FIX: Previously this was a useMemo placed after the chart hook but used
  // inside the onCandleUpdate callback. In production minified builds, the
  // bundler may reorder let declarations, causing "Cannot access 'tx' before
  // initialization" (TDZ error). Using a ref avoids this because refs are
  // hoisted and always initialized before any closure captures them.
  const tfSecondsRef = useRef(15 * 60);
  useEffect(() => {
    const tf = TIMEFRAMES.find(t => t.value === timeframe_);
    tfSecondsRef.current = (tf?.minutes || 15) * 60;
    timeframeRef.current = timeframe_;
  }, [timeframe_]);

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
  const OVERLAY_RERENDER_INTERVAL_MS = 60_000;
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
  const prevSymbolRef = useRef(selectedSymbol_);
  useEffect(() => {
    timeframeRef.current = timeframe_;
    // Clear RouaChart's candlesRef immediately on timeframe or symbol change
    // to prevent stale WebSocket onCandleUpdate from pushing old data
    candlesRef.current = [];
    candlesClearedAtRef.current = Date.now();
    prevSymbolRef.current = selectedSymbol_;

    // FIX: Reset singleton module-level state from pattern-engine and
    // pattern-renderer. Without this, switching from BTC → ETH keeps
    // BTC's incremental state and drawn patterns, causing incorrect
    // pattern detection and stale series references on the chart.
    try {
      import('@/lib/charts/pattern-engine').then(mod => {
        mod.resetPatternEngineState();
      }).catch(() => {});
      import('@/lib/charts/pattern-renderer').then(mod => {
        mod.resetPatternRendererState();
      }).catch(() => {});
    } catch { /* non-critical */ }
  }, [timeframe_, selectedSymbol_]);

  // ── Chart Hook ─────────────────────────────────────────
  const handleCrosshairMove = useCallback((data: CrosshairData | null) => {
    setCrosshairData(data);
    onCrosshairDataChange?.(data);
  }, [onCrosshairDataChange]);

  const chart = useChart({
    symbol: selectedSymbol_,
    timeframe: timeframe_,
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

  // ── Mini Chart: Register chart instance + control API with registry ──
  // When RouaChart is used as a grid cell (isGridCell=true),
  // it registers its IChartApi and ChartControlAPI so the main toolbar
  // can route commands to the active cell and crosshair sync works.
  useEffect(() => {
    if (!isGridCell || !chartId) return;

    // Register once chart instance is available
    const register = () => {
      const chartApi = chart.chartRef.current;
      const mainSeries = chart.candleSeriesRef?.current;
      if (chartApi && mainSeries) {
        registerChartInstance(chartId, chartApi, mainSeries);

        const controlApi: ChartControlAPI = {
          zoomIn: chart.zoomIn,
          zoomOut: chart.zoomOut,
          resetView: chart.resetView,
          setChartType: (type: ChartType) => {
            useMultiChartStore.getState().updateChartConfig(chartId, { chartType: type });
          },
          setTool: chart.setTool,
          togglePause: chart.togglePause,
          get isPaused() { return chart.isPaused; },
          get activeTool() { return chart.activeTool; },
          clearDrawings: chart.clearDrawings,
          exportPNG: chart.exportPNG,
          exportCSV: chart.exportCSV,
          exportSVG: chart.exportSVG,
          toggleFullscreen: () => {},
          isFullscreen: false,
          addPriceLine: chart.addPriceLine,
          removePriceLine: chart.removePriceLine,
          setCrosshairMode: chart.setCrosshairMode,
          // ── Panel toggles — route main toolbar actions to this mini chart ──
          toggleDrawings: () => { setShowDrawingPanel(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleIndicators: () => { setShowIndicatorPanel(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleAIPanel: () => { setShowAIPanel(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleVolumeProfile: () => { setShowVolumeProfile(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleChartTrading: () => { setShowChartTrading(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleTemplateManager: () => { setShowTemplateManager(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleWatchlist: () => { setShowWatchlist(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleChartSettings: () => { setShowChartSettings(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleCompare: () => { setShowCompare(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleFootprint: () => { setShowFootprint(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleAlerts: () => { setShowAlerts(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          togglePatternProgress: () => { setShowPatternProgress(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleReplay: () => { setShowReplay(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleHeatmap: () => { setShowHeatmap(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleAIStream: () => { setShowAIStream(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          toggleShare: () => { setShowShare(prev => !prev); useMultiChartStore.getState().bumpPanelStateVersion(); },
          // ── Symbol control ──
          setSymbol: (symbol: string) => {
            useMultiChartStore.getState().updateChartConfig(chartId, { symbol });
          },
          // ── Template control ──
          saveTemplate: (name: string) => { chart.saveTemplate(name); },
          loadTemplate: (id: string) => { chart.loadTemplate(id); },
          getTemplates: () => chart.getTemplates(),
          // ── Grid Template state export/import ──
          getChartState: (): CellChartState => ({
            symbol: selectedSymbol_,
            timeframe: timeframe_,
            chartType: chart.settings.type,
            settings: chart.settings,
            indicators: chart.getActiveIndicators(),
            drawings: chart.getDrawings(),
          }),
          applyChartState: (state: CellChartState) => {
            // Save indicators and drawings to useChartStateStore so they
            // get restored automatically when candles load via setCandles().
            // Direct addIndicator() fails if candles haven't loaded yet,
            // so we rely on the store-based restore flow instead.
            const store = useChartStateStore.getState();
            const indicators: SerializedIndicator[] = (state.indicators || []).map(ind => ({
              key: ind.key,
              params: ind.params,
              color: ind.color,
              opacity: ind.opacity,
              visible: ind.visible,
            }));
            store.saveChartConfig(state.symbol, state.timeframe, {
              chartType: state.chartType,
              settings: state.settings,
              indicators,
              drawings: state.drawings || [],
            });
            // Force restoreChartState to re-run for this symbol:timeframe
            // by resetting the restored config tracking
            // (this is handled by the templateRestoreFlagRef in useChart)
          },
          // ── Panel state getters (use refs to avoid stale closures) ──
          get isAIPanelOpen() { return showAIPanelRef.current; },
          get isVolumeProfileOpen() { return showVolumeProfileRef.current; },
          get isChartTradingOpen() { return showChartTradingRef.current; },
          get isWatchlistOpen() { return showWatchlistRef.current; },
          get isCompareOpen() { return showCompareRef.current; },
          get isFootprintOpen() { return showFootprintRef.current; },
          get isAlertsOpen() { return showAlertsRef.current; },
          get isPatternProgressOpen() { return showPatternProgressRef.current; },
          get isReplayOpen() { return showReplayRef.current; },
          get isHeatmapOpen() { return showHeatmapRef.current; },
          get isAIStreamOpen() { return showAIStreamRef.current; },
          get isDrawingPanelOpen() { return showDrawingPanelRef.current; },
          get isIndicatorPanelOpen() { return showIndicatorPanelRef.current; },
        };
        registerChartControl(chartId, controlApi);
        return true;
      }
      return false;
    };

    // Try immediately, then poll if chart not yet ready
    if (register()) return;

    const interval = setInterval(() => {
      if (register()) clearInterval(interval);
    }, 100);
    const timeout = setTimeout(() => clearInterval(interval), 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      unregisterChartInstance(chartId);
      unregisterChartControl(chartId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, isGridCell]);

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

  // ── Ref to always have the latest updateCandle for incremental updates ──
  const updateCandleRef = useRef(chart.updateCandle);
  useEffect(() => { updateCandleRef.current = chart.updateCandle; }, [chart.updateCandle]);

  // ── Ref to always have the latest resetView ──
  const resetViewRef = useRef(chart.resetView);
  useEffect(() => { resetViewRef.current = chart.resetView; }, [chart.resetView]);

  // ── Refs for chart methods used in effects/callbacks ──
  // FIX: These refs prevent infinite re-render loops caused by `chart`
  // being a new object every render. Effects/callbacks that use these
  // methods can have empty or stable deps instead of depending on `chart`.
  const addPriceLineRef = useRef(chart.addPriceLine);
  useEffect(() => { addPriceLineRef.current = chart.addPriceLine; }, [chart.addPriceLine]);
  const removePriceLineRef = useRef(chart.removePriceLine);
  useEffect(() => { removePriceLineRef.current = chart.removePriceLine; }, [chart.removePriceLine]);
  const getActiveIndicatorsRef = useRef(chart.getActiveIndicators);
  useEffect(() => { getActiveIndicatorsRef.current = chart.getActiveIndicators; }, [chart.getActiveIndicators]);
  const addIndicatorRef = useRef(chart.addIndicator);
  useEffect(() => { addIndicatorRef.current = chart.addIndicator; }, [chart.addIndicator]);
  const removeIndicatorRef = useRef(chart.removeIndicator);
  useEffect(() => { removeIndicatorRef.current = chart.removeIndicator; }, [chart.removeIndicator]);
  const setChartTypeRef = useRef(chart.setChartType);
  useEffect(() => { setChartTypeRef.current = chart.setChartType; }, [chart.setChartType]);
  const candleSeriesRef_ = useRef(chart.candleSeriesRef);
  useEffect(() => { candleSeriesRef_.current = chart.candleSeriesRef; }, [chart.candleSeriesRef]);
  const mainSeriesRef_ = useRef(chart.mainSeriesRef);
  useEffect(() => { mainSeriesRef_.current = chart.mainSeriesRef; }, [chart.mainSeriesRef]);
  const chartRef_ = useRef(chart.chartRef);
  useEffect(() => { chartRef_.current = chart.chartRef; }, [chart.chartRef]);

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
    symbol: selectedSymbol_,
    timeframe: timeframe_,
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

      // FIX: When WebSocket delivers real data after a fallback, switch feedState
      // back to 'live'. This is what connects the "broken candles + disconnected
      // message" bug — when historical fetch fails, feedState='fallback' shows the
      // warning message and simulated candles. When WebSocket delivers real data,
      // the chart recovers visually but feedState stays 'fallback', keeping the
      // warning message visible even though data is now live.
      if (feedStateRef.current === 'fallback' && candlesRef.current.length >= 2) {
        setFeedState('live');
      }

      // FIX: Align candle timestamp to the current timeframe's interval.
      // WebSocket (especially Socket.IO ticker) may send candles at 1-minute
      // granularity regardless of the selected timeframe. We snap the time
      // to the nearest timeframe boundary so it matches the historical candles.
      const alignedTime = Math.floor(candle.time / tfSecondsRef.current) * tfSecondsRef.current;
      const alignedCandle = { ...candle, time: alignedTime };

      // ── PERF: Use incremental update() for EXISTING candles ──
      // This is O(1) instead of O(n log n) with setData(), and avoids
      // destroying/recreating indicator series. For NEW candles (new time
      // period), we still use setCandles() with skipIndicatorRebuild:true
      // which preserves indicators while setting the full dataset.
      const idx = candlesRef.current.findIndex(c => c.time === alignedTime);
      const isNewCandle = idx < 0;

      if (idx >= 0) {
        // Merge: keep the widest high/low, latest close
        const existing = candlesRef.current[idx];
        const merged = {
          ...existing,
          high: Math.max(existing.high, alignedCandle.high),
          low: Math.min(existing.low, alignedCandle.low),
          close: alignedCandle.close,
          volume: alignedCandle.volume || existing.volume,
        };
        candlesRef.current[idx] = merged;

        // PERF: For the LAST candle (real-time forming), use O(1) update()
        // via updateCandleRef(). This does NOT destroy indicators.
        // For non-last candles (rare edge case), fall back to setCandles
        // with skipIndicatorRebuild to avoid indicator destruction.
        const isLastCandle = idx === candlesRef.current.length - 1;
        if (isLastCandle) {
          updateCandleRef.current(merged);
        } else {
          // Rare: updating a historical candle (shouldn't normally happen)
          setCandlesRef.current([...candlesRef.current], { skipIndicatorRebuild: true });
        }
      } else {
        // NEW candle: append and use setCandles with skipIndicatorRebuild
        // This uses setData() but preserves indicator series (they stay
        // visible with slightly stale last-point data until next recalc).
        candlesRef.current.push(alignedCandle);
        setCandlesRef.current([...candlesRef.current], { skipIndicatorRebuild: true });
      }

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
        updatePrice(selectedSymbol_, price);
      } catch { /* store may not be ready */ }
      // FIX: Also update exchange positions with live price from WebSocket
      // Previously only paper trades were updated — exchange positions showed stale prices
      try {
        const { updatePositionPrice } = usePositionsStore.getState();
        updatePositionPrice(selectedSymbol_, price);
      } catch { /* store may not be ready */ }
      // Schedule overlay recalculation so trade markers stay aligned
      scheduleOverlayUpdateRef.current();
    },
    // FIX: When the main chart is in multi-chart mode (canvas hidden),
    // disable WebSocket to prevent wasted resources. Mini charts have their
    // own WebSocket connections. Without this, the main chart's hidden canvas
    // still receives and processes data for nothing, and can cause the main
    // chart's candles to be in an inconsistent state when returning to single mode.
    enabled: !chart.isPaused && !(isMultiChart && !isGridCell),
  });

  // ── Multi-Chart: Automatic Crosshair + Scroll Sync ──
  // Builds chart entry list from registry for sync hook
  const syncEntries = useMemo(() => {
    const entries: Array<{ id: string; chart: any; mainSeries: any }> = [];
    const chartMap = getAllChartInstances();
    const seriesMap = getAllMainSeries();
    chartMap.forEach((chartInstance, id) => {
      const series = seriesMap.get(id);
      if (chartInstance && series) {
        entries.push({ id, chart: chartInstance, mainSeries: series });
      }
    });
    return entries;
  }, [charts.length, isMultiChart]); // Rebuild when chart count changes

  useChartSync(syncEntries);

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

  // ── PERF: Periodic indicator refresh (every 60s) ──
  // When using incremental update() for real-time candles, indicator
  // series (SMA, EMA, RSI, etc.) stay visible but their last data
  // point becomes stale. This timer triggers a full indicator rebuild
  // every 60 seconds to keep indicator values accurate without the
  // overhead of rebuilding on every WebSocket tick.
  useEffect(() => {
    const INDICATOR_REFRESH_MS = 60_000;
    const interval = setInterval(() => {
      try {
        if (candlesRef.current.length === 0) return;
        // Trigger full setCandles without skipIndicatorRebuild
        // to rebuild all active indicators with fresh data
        setCandlesRef.current([...candlesRef.current]);
      } catch { /* non-critical */ }
    }, INDICATOR_REFRESH_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch Historical Candles ───────────────────────────
  useEffect(() => {
    let cancelled = false; // Guard against stale responses after symbol change

    const fetchCandles = async () => {
      try {
        setFeedState('waiting');
        const res = await fetch(`/api/exchange/history/${encodeURIComponent(selectedSymbol_)}?interval=${timeframe_}`);
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
      const isJPY = selectedSymbol_.includes('JPY');
      const isBTC = selectedSymbol_.includes('BTC');
      const dp = isJPY ? 3 : isBTC ? 1 : 5;
      const tf = TIMEFRAMES.find(t => t.value === timeframe_);
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
  }, [selectedSymbol_, timeframe_]);

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
      const tf = TIMEFRAMES.find(t => t.value === timeframe_);
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
  }, [timeframe_]);



  // ── Position Overlay ───────────────────────────────────
  const positions = usePositionsStore(s => s.positions);
  const paperTrades = usePaperTradesStore(s => s.trades);

  // ── Helper: Normalize symbol for matching ──
  const normalizeSymbol = (s: string) => s.toUpperCase().replace(/[/\-_]/g, '');

  // ── Structural key for position/trade lines ──
  // CRITICAL: This prevents the price line useEffect from re-running on every
  // price tick. Previously, `paperTrades` changed on every tick (updatePrice
  // creates a new array), causing ALL price lines to be removed and re-added,
  // which produced visible flicker/dancing.
  //
  // Now we compute a structural hash that ONLY changes when trades are
  // actually added, removed, or have their entry/SL/TP modified — NOT when
  // only currentPrice/unrealizedPnl changes.
  const positionStructKey = useMemo(() => {
    const chartSymbol = normalizeSymbol(selectedSymbol_);
    const parts: string[] = [];
    positions.forEach(p => {
      const ps = normalizeSymbol(p.symbol || '');
      if (!ps.includes(chartSymbol) && !chartSymbol.includes(ps)) return;
      parts.push(`P:${p.id}:${p.side}:${p.entryPrice}:${p.stopLoss || p.sl}:${p.takeProfit || p.tp}`);
    });
    paperTrades.forEach(t => {
      const ts = normalizeSymbol(t.symbol || '');
      if (!ts.includes(chartSymbol) && !chartSymbol.includes(ts)) return;
      parts.push(`T:${t.id}:${t.side}:${t.entryPrice}:${t.sl}:${t.tp}`);
    });
    parts.sort();
    return parts.join('|');
  }, [positions, paperTrades, selectedSymbol_]);

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
  // PERF: Refs for overlay throttling — avoid re-rendering the entire 3000+ line
  // RouaChart component on every scroll frame. Instead of calling setState on
  // every rAF, we use direct DOM manipulation for position updates and only
  // setState when the structure changes (e.g. trades added/removed).
  const lastOverlayUpdateRef = useRef(0);
  const OVERLAY_THROTTLE_MS = 50; // ~20fps for overlay position updates (reduced from 120ms to fix label jitter)
  const lastOverlayStructureRef = useRef(''); // Hash to detect structural changes

  // Keep latest positions/trades in ref so the rAF callback always has fresh data
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const paperTradesRef = useRef(paperTrades);
  paperTradesRef.current = paperTrades;
  const selectedSymbol_Ref = useRef(selectedSymbol_);
  selectedSymbol_Ref.current = selectedSymbol_;

  // rAF deduplication — cancel previous frame before scheduling new one
  const rafIdRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  // Ref for scheduleOverlayUpdate so the onPriceUpdate callback (defined earlier)
  // can call it without stale-closure issues — the ref is updated each render.
  const scheduleOverlayUpdateRef = useRef<() => void>(() => {});

  // FIX: Ref for chart.getPriceCoordinate to avoid depending on unstable `chart` object.
  // `useChart` returns a new object every render, but getPriceCoordinate is a stable
  // useCallback (empty deps). Storing it in a ref lets scheduleOverlayUpdate be stable too,
  // breaking the infinite re-render loop (React error #185).
  const getPriceCoordinateRef = useRef(chart.getPriceCoordinate);
  useEffect(() => { getPriceCoordinateRef.current = chart.getPriceCoordinate; }, [chart.getPriceCoordinate]);

  // ── Recalculate overlay positions (runs on every scroll/zoom via rAF) ──
  // FIX: Removed `chart` from useCallback deps. Uses refs instead to prevent
  // the callback from being recreated on every render, which caused the
  // useEffect at line ~1267 to re-run on every render → infinite loop.
  const scheduleOverlayUpdate = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      if (!isMountedRef.current) return;

      const getPriceCoordinate = getPriceCoordinateRef.current;
      const chartSymbol = normalizeSymbol(selectedSymbol_Ref.current);
      const overlays: TradeOverlay[] = [];
      const zones: typeof fillZones = [];

      const processTrade = (
        entryPrice: number, direction: 'long' | 'short',
        sl?: number, tp?: number, qty = 0, pnl?: number,
        source: 'manual' | 'bot' | 'exchange' = 'manual', prefix = ''
      ) => {
        // Compute each line's Y coordinate independently so they don't
        // disappear when the entry scrolls off-screen
        const entryY = getPriceCoordinate(entryPrice);
        const slY = sl && sl > 0 ? getPriceCoordinate(sl) : null;
        const tpY = tp && tp > 0 ? getPriceCoordinate(tp) : null;

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

      // PERF: Throttle state updates to avoid re-rendering the entire component
      // on every scroll frame. Only update state when:
      // 1. Enough time has passed (OVERLAY_THROTTLE_MS)
      // 2. The overlay structure changed (new/removed trades)
      const now = Date.now();
      const structureHash = overlays.map(o => o.key).join(',') + zones.map(z => z.key).join(',');
      const structureChanged = structureHash !== lastOverlayStructureRef.current;

      if (structureChanged || now - lastOverlayUpdateRef.current >= OVERLAY_THROTTLE_MS) {
        lastOverlayUpdateRef.current = now;
        lastOverlayStructureRef.current = structureHash;
        setTradeOverlays(overlays);
        setFillZones(zones);
      } else {
        // Position-only update: move existing DOM elements directly without React re-render
        // This is the KEY optimization — no setState → no re-render → chart stays smooth
        try {
          const overlayContainer = document.querySelector('.roua-overlay-layer');
          if (overlayContainer) {
            // Update fill zone positions directly
            const zoneEls = overlayContainer.querySelectorAll('[data-zone]');
            zones.forEach((zone, i) => {
              const el = zoneEls[i] as HTMLElement;
              if (el) {
                el.style.top = zone.top + 'px';
                el.style.height = Math.max(zone.height, 1) + 'px';
              }
            });
            // Update trade label positions directly using GPU-accelerated transform
            const labelEls = overlayContainer.querySelectorAll('[data-trade-label]');
            overlays.forEach((ov, i) => {
              const el = labelEls[i] as HTMLElement;
              if (el) {
                el.style.transform = `translateY(${ov.y - 9}px)`;
              }
            });
          }
        } catch { /* DOM may not be ready */ }
      }
    });
  }, []); // FIX: Empty deps — uses refs for all chart access, preventing infinite re-render loop

  // Keep the ref in sync with the latest scheduleOverlayUpdate callback
  scheduleOverlayUpdateRef.current = scheduleOverlayUpdate;

  // FIX: Ref for chart.onVisibleRangeChange to avoid depending on unstable `chart` object.
  const onVisibleRangeChangeRef = useRef(chart.onVisibleRangeChange);
  useEffect(() => { onVisibleRangeChangeRef.current = chart.onVisibleRangeChange; }, [chart.onVisibleRangeChange]);

  // ── Subscribe to chart scroll/zoom (horizontal + vertical) ──
  // FIX: Removed `chart` and `scheduleOverlayUpdate` from deps. Both are now stable
  // (scheduleOverlayUpdate has empty deps, onVisibleRangeChange uses ref).
  // This prevents the effect from re-running on every render, which caused
  // React error #185 (infinite update depth exceeded).
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const onVisibleRangeChange = onVisibleRangeChangeRef.current;
    if (onVisibleRangeChange) {
      unsub = onVisibleRangeChange(scheduleOverlayUpdate);
    }
    // Initial calculation with a small delay to ensure chart is rendered
    const timer = setTimeout(scheduleOverlayUpdate, 200);

    // Periodic overlay refresh to catch vertical price-scale changes
    // (lightweight-charts v5 has no priceScale subscribeVisiblePriceRangeChange)
    // PERF: 3000ms — positions update via DOM manipulation between full state updates
    const priceScaleInterval = setInterval(scheduleOverlayUpdate, 3000);

    return () => { unsub?.(); clearTimeout(timer); clearInterval(priceScaleInterval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps — stable refs used inside

  // ── Mount guard for rAF callbacks ──
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
      // Clean up OverlayRegistry on unmount (replaces old OverlayManager)
      resetOverlayRegistry();
    };
  }, []);

  // ── FIX: Restore main chart when exiting multi-chart mode ──
  // When the main chart's canvas was hidden (display:none) during multi-chart
  // mode, the chart instance may have stale dimensions. When we return to
  // single-chart mode, we need to resize the chart and refetch data to
  // ensure candles are visible.
  const prevIsMultiChartRef = useRef(false);
  useEffect(() => {
    // This effect is only for the main (non-mini) chart — mini charts don't
    // have a "previous multi-chart state" to restore from.
    if (isGridCell) return;
    const wasMultiChart = prevIsMultiChartRef.current;
    prevIsMultiChartRef.current = isMultiChart;

    // Transitioning from multi-chart to single-chart
    if (wasMultiChart && !isMultiChart) {
      // Resize the chart to fit the now-visible container
      requestAnimationFrame(() => {
        try {
          const chartApi = chart.chartRef.current;
          const container = chart.containerRef.current;
          if (chartApi && container) {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w > 0 && h > 0) {
              chartApi.applyOptions({ width: w, height: h });
            }
          }
        } catch { /* chart may not be ready */ }
      });

      // Re-fetch data to ensure fresh candles
      setCandlesRef.current([...candlesRef.current]);
      // Fit content to show all candles
      setTimeout(() => {
        resetViewRef.current();
      }, 300);
    }
  }, [isMultiChart, isGridCell]); // FIX: Removed chart.chartRef/chart.containerRef from deps — refs are stable

  // ── Re-calculate overlays when trades change ──
  useEffect(() => {
    scheduleOverlayUpdate();
  }, [positionStructKey, scheduleOverlayUpdate]);

  // ── Apply Position Lines to Chart (price lines with labels) ──
  // FIX: Skip in mini chart mode — price lines are not needed for compact charts.
  // Also uses refs for chart methods to avoid re-running on every render.
  // FIX: Uses DIFFING instead of remove-all-then-re-add to prevent "dancing" lines.
  // Only adds/removes lines that actually changed, keeping stable lines in place.
  useEffect(() => {
    // Position/trade lines should show on ALL charts (main + mini cells).
    const addPriceLine = addPriceLineRef.current;
    const removePriceLine = removePriceLineRef.current;

    const chartSymbol = normalizeSymbol(selectedSymbol_);

    const fmtPrice = (p: number) => p > 999 ? p.toFixed(2) : p.toFixed(5);

    // Build the full set of desired lines
    const desiredLines = new Map<string, { price: number; color: string; lineWidth: number; lineStyle: number; label: string; axisLabelVisible: boolean }>();

    const addDesiredLine = (id: string, price: number, color: string, lineWidth: number, lineStyle: number, label: string = '', axisLabelVisible: boolean = true) => {
      desiredLines.set(id, { price, color, lineWidth, lineStyle, label, axisLabelVisible });
    };

    // Exchange positions
    positions.forEach(pos => {
      const posSymbol = normalizeSymbol(pos.symbol || '');
      if (!posSymbol.includes(chartSymbol) && !chartSymbol.includes(posSymbol)) return;
      const entryPrice = Number(pos.entryPrice || pos.avgEntryPrice || 0);
      const isLong = (pos.side || '').toLowerCase() === 'long';
      if (entryPrice > 0) {
        addDesiredLine(`pos-entry-${pos.id || posSymbol}`, entryPrice, '#00D4FF', 2, 2, isLong ? '▲ Entry' : '▼ Entry', false);
      }
      const sl = Number(pos.stopLoss || pos.sl || 0);
      if (sl > 0) {
        const slLabel = `SL ${sl.toFixed(sl > 10 ? 2 : 5)}`;
        addDesiredLine(`pos-sl-${pos.id || posSymbol}`, sl, '#FF4757', 1, 2, slLabel, false);
      }
      const tp = Number(pos.takeProfit || pos.tp || 0);
      if (tp > 0) {
        const tpLabel = `TP ${tp.toFixed(tp > 10 ? 2 : 5)}`;
        addDesiredLine(`pos-tp-${pos.id || posSymbol}`, tp, '#00FFA3', 1, 2, tpLabel, false);
      }
    });

    // Paper trades (including executor and agent trades)
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
      addDesiredLine(`trade-entry-grp-${key}`, entryPrice, '#00D4FF', 2, 2, isLong ? '▲ Entry' : '▼ Entry', false);
      if (trade.sl && Number(trade.sl) > 0) {
        const slP = ((Number(trade.sl) - entryPrice) * qty * (isLong ? 1 : -1));
        addDesiredLine(`trade-sl-grp-${key}`, Number(trade.sl), '#FF4757', 1, 2, `SL  ${slP > 0 ? '+' : ''}${slP.toFixed(2)}$`, false);
      }
      if (trade.tp && Number(trade.tp) > 0) {
        const tpP = ((Number(trade.tp) - entryPrice) * qty * (isLong ? 1 : -1));
        addDesiredLine(`trade-tp-grp-${key}`, Number(trade.tp), '#00FFA3', 1, 2, `TP  ${tpP > 0 ? '+' : ''}${tpP.toFixed(2)}$`, false);
      }
    });

    // ── DIFFING: Only add/remove lines that actually changed ──
    // This prevents "dancing" lines caused by removing and re-adding
    // lines that haven't changed.

    // 1. Remove lines that are no longer desired
    const existingIds = new Set(positionLineIdsRef.current);
    for (const id of existingIds) {
      if (!desiredLines.has(id)) {
        removePriceLine(id);
      }
    }

    // 2. Add/update lines that are desired
    for (const [id, lineData] of desiredLines) {
      addPriceLine(id, lineData.price, lineData.color, lineData.label, lineData.lineWidth, lineData.lineStyle, lineData.axisLabelVisible);
    }

    // 3. Update the tracking set
    positionLineIdsRef.current = Array.from(desiredLines.keys());

    return () => {
      const rmPriceLine = removePriceLineRef.current;
      positionLineIdsRef.current.forEach(id => rmPriceLine(id));
      positionLineIdsRef.current = [];
    };
  // FIX: Uses `positionStructKey` instead of `positions`/`paperTrades` directly.
  // This prevents the effect from re-running on every price tick (which creates
  // new array references). The structural key only changes when trades are
  // actually added/removed or have entry/SL/TP modified.
  // Also removed `chart` from deps — uses refs for all chart method access.
  }, [positionStructKey, selectedSymbol_, isGridCell]);



  // ── Indicator Management ───────────────────────────────
  // FIX: Use refs for chart methods to avoid recreating callbacks on every render
  const handleToggleIndicator = useCallback((key: string) => {
    const existing = getActiveIndicatorsRef.current().find(i => i.key === key);
    if (existing) {
      removeIndicatorRef.current(key);
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
      addIndicatorRef.current(indicator);
    }
  }, []);

  const handleOpenSettings = useCallback((key: string) => {
    const existing = getActiveIndicatorsRef.current().find(i => i.key === key);
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
  }, []);

  const handleSaveSettings = useCallback((indicator: ActiveIndicator) => {
    addIndicatorRef.current(indicator);
    setShowSettingsPanel(false);
    setSettingsIndicator(null);
  }, []);

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
  // FIX: Uses chartRef_ ref instead of chart.chartRef to avoid dep on `chart` object
  const handleHeatmapData = useCallback((heatmap: HeatmapResult | null) => {
    // Only render heatmap if user explicitly enabled it
    if (!showHeatmap) {
      // If heatmap is disabled, remove any existing heatmap series
      const chartApi = chartRef_.current?.current;
      if (chartApi) {
        heatmapSeriesRef.current.forEach(s => {
          try { chartApi.removeSeries(s); } catch {}
        });
        heatmapSeriesRef.current = [];
      }
      return;
    }
    const chartApi = chartRef_.current?.current;
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
  }, [showHeatmap]); // FIX: Removed `chart` from deps — uses chartRef_ ref

  // Cleanup function for AI overlays — reusable across multiple call sites.
  // Uses OverlayRegistry for primitive-based lifecycle management.
  // IMPORTANT: Only resets the registry on timeframe change (when the series
  // will be recreated). Does NOT destroy the singleton when simply toggling
  // overlays off — that would lose tracking state and cause orphaned primitives.
  // FIX: Uses refs for chart method access to prevent infinite re-render loops.
  const cleanupAIOverlays = useCallback(() => {
    try {
      const { getOverlayRegistry, resetOverlayRegistry } = require('@/lib/charts/OverlayRegistry');
      const reg = getOverlayRegistry();
      // Set removePriceLine callback so clearAll() can remove price lines
      reg.setRemovePriceLine(removePriceLineRef.current);
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
      const series = candleSeriesRef_.current?.current || mainSeriesRef_.current?.current;
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
      const chartApi = chartRef_.current?.current;
      const active = getActiveAnimations();
      for (const anim of active) {
        try { cancelAnimatedPattern(chartApi, anim.patternId); } catch {}
      }
    } catch {}
  }, []); // FIX: Empty deps — uses refs for all chart method access

  // Clean up AI overlays when timeframe changes
  useEffect(() => {
    cleanupAIOverlays();
    // FIX: Clear lastAnalysisResultRef so stale overlay data from the
    // previous timeframe doesn't get re-used by handlePatternsDetected.
    // Without this, overlays from old timeframes accumulate on the chart.
    lastAnalysisResultRef.current = null;
    // REVOLUTIONARY: Also clean up heatmap overlay on timeframe change
    const chartApi = chartRef_.current?.current;
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
  }, [timeframe_]);

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
            new Notification(tc('notificationTitle', { symbol: selectedSymbol_ }), { body, icon: '/favicon.ico' });
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
              symbol: selectedSymbol_,
              direction: p.direction,
              confidence: p.confidence,
            });
          }
          for (const b of bos) {
            alerter.announceBreakout({
              patternType: b.type,
              patternTypeAr: b.direction === 'bullish' ? tc('bullishBreakout') : tc('bearishBreakout'),
              symbol: selectedSymbol_,
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
  }, [selectedSymbol_, timeframe_]);

  // lastAnalysisResultRef moved to top of component (near other refs) to avoid TDZ error
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
    }, addPriceLineRef.current, removePriceLineRef.current);

    } catch (e) {
      console.warn('[AI Overlay] handlePatternsDetected error:', e);
    }
  }, []); // FIX: Empty deps — uses refs for all chart method access

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
      const series = candleSeriesRef_.current?.current;
      if (!series) return;

      const overlayMod = overlayRendererRef.current || await import('@/lib/charts/overlay-renderer');
      const registryMod = overlayRegistryRef.current || await import('@/lib/charts/OverlayRegistry');
      const anyOverlayEnabled = Object.values(overlays).some(v => v === true);

      if (!anyOverlayEnabled) {
        setAiPatterns([]);
        const reg = registryMod.getOverlayRegistry();
        reg.init(series, removePriceLineRef.current);
        reg.clearAll();
        return;
      }

      // Re-validate series after potential async import
      const currentSeries = candleSeriesRef_.current?.current;
      if (currentSeries !== series) return;

      // SUSTAINABLE: Do NOT call reg.clearAll() here.
      // renderOverlays() uses per-type prepareRedraw/clearType internally,
      // which only clears and re-renders the specific overlay type being
      // updated. This means:
      //   - Toggling trend ON doesn't touch SR overlays
      //   - Toggling SR OFF doesn't touch trend overlays
      //   - No flicker from clearing everything and re-drawing
      const reg = registryMod.getOverlayRegistry();
      reg.init(series, removePriceLineRef.current);

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
      }, addPriceLineRef.current, removePriceLineRef.current);

    } catch (e) {
      console.warn('[AI Overlay] handleOverlayChange error:', e);
    }
  }, []); // FIX: Empty deps — uses refs for all chart method access


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
      symbol: selectedSymbol_,
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
  }, [selectedSymbol_]);

  // ── Fetch Active Trading Signals (signalMarkers declared above) ──
  useEffect(() => {
    let cancelled = false;
    const fetchSignals = async () => {
      try {
        const [signals, briefs] = await Promise.all([
          fetchSignalsForChart(selectedSymbol_),
          fetchStrategicBriefs(selectedSymbol_),
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
        const markers = convertToChartMarkers(signals, briefs, selectedSymbol_);
        setSignalMarkers(markers);

        // Add SL/TP price lines for signals — clear old ones first
        if (!mobile) {
          signalLineIdsRef.current.forEach(id => chart.removePriceLine(id));
          signalLineIdsRef.current = [];
          // Only show lines for the latest signal (avoid chart clutter)
          const latestSignal = signals[signals.length - 1];
          if (latestSignal) {
            const normalizeSymbolLocal = (s: string) => s.toUpperCase().replace(/[/\-_]/g, '');
            const chartSymbol = normalizeSymbolLocal(selectedSymbol_);
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
  }, [selectedSymbol_]);

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

  // ── Multi-Chart Grid (memoized) ──
  // FIX: Use useMemo instead of IIFE to prevent React from treating the grid
  // as a new element type on every render. The IIFE pattern (() => {...})()
  // created a new closure each render → React unmount/remount all children →
  // broken charts + React error #185 from cascading re-renders.
  const multiChartGrid = useMemo(() => {
    if (isGridCell || !isMultiChart) return null;
    const meta = LAYOUT_METAS[multiChartLayout];
    if (!meta) return null; // Defensive: invalid layout key
    const visibleCharts = charts.slice(0, meta.cols * meta.rows);

    // If a chart is expanded, show ONLY that chart at full size
    if (expandedChartId && visibleCharts.some(c => c.id === expandedChartId)) {
      const expandedCell = visibleCharts.find(c => c.id === expandedChartId)!;
      return (
        <div style={{
          flex: 1, minHeight: 0, display: 'flex', background: T.bg, position: 'relative',
        }}>
          <RouaChart
            key={expandedCell.id}
            chartId={expandedCell.id}
            symbol={expandedCell.symbol}
            timeframe={expandedCell.timeframe}
            chartType={expandedCell.chartType}
            isActive={true}
            onActivate={() => setActiveChartId(expandedCell.id)}
            onClose={charts.length > 1 ? () => removeChart(expandedCell.id) : undefined}
            canClose={charts.length > 1}
            isExpanded={true}
            onToggleExpand={() => toggleExpandChart(expandedCell.id)}
          />
        </div>
      );
    }

    return (
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${meta.cols}, 1fr)`,
        gridTemplateRows: `repeat(${meta.rows}, 1fr)`,
        gap: 3,
        padding: 2,
        background: T.bg,
        position: 'relative',
      }}>
        {visibleCharts.map(cell => (
          <RouaChart
            key={cell.id}
            chartId={cell.id}
            symbol={cell.symbol}
            timeframe={cell.timeframe}
            chartType={cell.chartType}
            isActive={activeChartId === cell.id}
            onActivate={() => setActiveChartId(cell.id)}
            onClose={charts.length > 1 ? () => removeChart(cell.id) : undefined}
            canClose={charts.length > 1}
            isExpanded={false}
            onToggleExpand={() => toggleExpandChart(cell.id)}
          />
        ))}
      </div>
    );
  // FIX: Include all values used inside the memo. Previously the IIFE
  // captured stale closures because it had no dependency tracking.
  }, [isGridCell, isMultiChart, multiChartLayout, charts, activeChartId, setActiveChartId, removeChart, expandedChartId, toggleExpandChart]);

  const toolbarHeight = hideToolbar ? 0 : mobile ? 48 : 38;

  return (
    <div
      onMouseDown={isGridCell ? onActivate : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: T.bg,
        // Active cell gets a bright border so the user knows which chart the toolbar controls
        outline: isGridCell && isActive ? '1.5px solid rgba(0,212,255,0.4)' : isGridCell ? '1px solid #1E2530' : 'none',
        outlineOffset: '-1px',
        borderRadius: isGridCell ? 4 : 0,
        overflow: 'hidden',
      }}
      className="roua-chart-root"
    >
      {/* ── TOOLBAR ── */}
      {isGridCell ? (
        /* Grid Cell Header — interactive bar with symbol selector, timeframe buttons + close.
         * The MAIN toolbar at the top controls this chart (drawing, indicators,
         * zoom, etc.). This header shows: symbol selector + timeframe + close button.
         * Click anywhere on this header to make this the active chart. */
        <div
          onMouseDown={onActivate}
          style={{
            display: 'flex', alignItems: 'center', height: 28, padding: '0 6px',
            borderBottom: isActive ? '1.5px solid rgba(0,212,255,0.5)' : '1px solid #1E2530',
            background: isActive ? 'rgba(0,212,255,0.06)' : 'rgba(17,22,32,0.95)',
            boxShadow: isActive ? '0 0 12px rgba(0,212,255,0.12)' : 'none',
            flexShrink: 0, gap: 4, direction: 'ltr', cursor: 'default',
          }}
        >
          {/* Symbol selector dropdown */}
          <select value={effectiveSymbol} onClick={e => e.stopPropagation()}
            onChange={e => {
              e.stopPropagation();
              const newSymbol = e.target.value;
              if (chartId) {
                useMultiChartStore.getState().updateChartConfig(chartId, { symbol: newSymbol });
              }
            }}
            style={{
              background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 3, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 700, padding: '1px 4px', cursor: 'pointer',
              outline: 'none', maxWidth: 95, flexShrink: 0,
            }}
          >
            {POPULAR_SYMBOLS_MINI.map(p => (
              <option key={p} value={p} style={{ background: '#111620', color: '#F0F2F5' }}>{p}</option>
            ))}
          </select>

          {/* Timeframe buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
            {TIMEFRAME_MINI.map(tf => {
              const active = effectiveTimeframe === tf.value;
              return (
                <button key={tf.value}
                  onClick={e => { e.stopPropagation(); if (chartId) useMultiChartStore.getState().updateChartConfig(chartId, { timeframe: tf.value }); }}
                  style={{
                    background: active ? 'rgba(0,212,255,0.15)' : 'transparent',
                    border: active ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
                    borderRadius: 2, color: active ? '#00D4FF' : '#4B5563',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                    fontWeight: active ? 700 : 500, padding: '0 3px', height: 18,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >{tf.label}</button>
              );
            })}
          </div>
          {chart.isPaused && (
            <span style={{ color: '#fbbf24', fontSize: 8, fontWeight: 700 }}>⏸</span>
          )}
          {feedState === 'waiting' && (
            <div style={{ width: 8, height: 8, border: '2px solid #1E2530',
              borderTopColor: '#00D4FF', borderRadius: '50%', animation: 'mcSpin 1s linear infinite' }} />
          )}
          <div style={{ flex: 1 }} />
          {/* Expand/Collapse button */}
          {onToggleExpand && (
            <button onClick={e => { e.stopPropagation(); onToggleExpand(); }}
              style={{
                background: isExpanded ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)',
                border: isExpanded ? '1px solid rgba(0,212,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 2, color: isExpanded ? '#00D4FF' : '#4B5563', width: 16, height: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                flexShrink: 0, transition: 'all 0.15s ease',
              }}
              title={isExpanded ? 'Collapse' : 'Maximize'}
            >
              {isExpanded ? (
                /* Minimize icon (4 corners inward) */
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                </svg>
              ) : (
                /* Maximize icon (4 corners outward) */
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>
          )}
          {canClose && onClose && (
            <button onClick={e => { e.stopPropagation(); onClose(); }}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 2, color: '#4B5563', width: 16, height: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                flexShrink: 0,
              }}
              title="Close chart"
            >
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      ) : (!hideToolbar ? <ChartToolbar
        symbol={isMultiChart ? (charts.find(c => c.id === activeChartId)?.symbol || selectedSymbol_) : selectedSymbol_}
        timeframe={isMultiChart ? (charts.find(c => c.id === activeChartId)?.timeframe || timeframe_) : timeframe_}
        chartType={isMultiChart ? (charts.find(c => c.id === activeChartId)?.chartType || chart.settings.type) : chart.settings.type}
        onSetSymbol={isMultiChart ? ((sym: string) => {
          getActiveChartControl()?.setSymbol(sym);
        }) : ((sym: string) => {
          setSelectedSymbol(sym);
        })}
        onSetTimeframe={isMultiChart ? ((tf: string) => {
          const ctrl = getActiveChartControl();
          if (ctrl) { /* timeframe is updated via updateChartConfig in RouaChart mini instance */ }
          const activeCell = charts.find(c => c.id === activeChartId);
          if (activeCell) useMultiChartStore.getState().updateChartConfig(activeChartId, { timeframe: tf });
        }) : setTimeframe}
        onSetChartType={isMultiChart ? ((type: ChartType) => {
          const ctrl = getActiveChartControl();
          if (ctrl) ctrl.setChartType(type);
        }) : chart.setChartType}
        onZoomIn={isMultiChart ? (() => { getActiveChartControl()?.zoomIn(); }) : chart.zoomIn}
        onZoomOut={isMultiChart ? (() => { getActiveChartControl()?.zoomOut(); }) : chart.zoomOut}
        onResetView={isMultiChart ? (() => { getActiveChartControl()?.resetView(); }) : chart.resetView}
        onToggleDrawings={isMultiChart ? (() => { getActiveChartControl()?.toggleDrawings(); }) : () => setShowDrawingPanel(!showDrawingPanel)}
        onToggleIndicators={isMultiChart ? (() => { getActiveChartControl()?.toggleIndicators(); }) : () => setShowIndicatorPanel(!showIndicatorPanel)}
        onExportPNG={isMultiChart ? (() => { getActiveChartControl()?.exportPNG(); }) : chart.exportPNG}
        onExportCSV={isMultiChart ? (() => { getActiveChartControl()?.exportCSV(); }) : chart.exportCSV}
        onExportSVG={isMultiChart ? (() => { getActiveChartControl()?.exportSVG(); }) : chart.exportSVG}
        onToggleFullscreen={onToggleChartFullscreen || chart.toggleFullscreen}
        isFullscreen={isChartFullscreen || chart.isFullscreen}
        activeTool={isMultiChart ? (getActiveChartControl()?.activeTool || 'cursor') : chart.activeTool}
        onSetTool={isMultiChart ? ((tool: DrawingTool) => { getActiveChartControl()?.setTool(tool); }) : chart.setTool}
        onClearDrawings={isMultiChart ? (() => { getActiveChartControl()?.clearDrawings(); }) : chart.clearDrawings}
        isPaused={isMultiChart ? (getActiveChartControl()?.isPaused || false) : chart.isPaused}
        onTogglePause={isMultiChart ? (() => { getActiveChartControl()?.togglePause(); }) : chart.togglePause}
        mobile={mobile}
        height={toolbarHeight}
        // ── New Toolbar Props ──
        onToggleVolumeProfile={isMultiChart ? (() => { getActiveChartControl()?.toggleVolumeProfile(); }) : () => setShowVolumeProfile(!showVolumeProfile)}
        onToggleAIPanel={isMultiChart ? (() => { getActiveChartControl()?.toggleAIPanel(); }) : () => setShowAIPanel(!showAIPanel)}
        onToggleChartTrading={isMultiChart ? (() => { getActiveChartControl()?.toggleChartTrading(); }) : () => setShowChartTrading(!showChartTrading)}
        onToggleTemplateManager={() => setShowTemplateManager(!showTemplateManager)}
        onToggleWatchlist={isMultiChart ? (() => { getActiveChartControl()?.toggleWatchlist(); }) : () => setShowWatchlist(!showWatchlist)}
        onToggleChartSettings={isMultiChart ? (() => { getActiveChartControl()?.toggleChartSettings(); }) : () => setShowChartSettings(!showChartSettings)}
        showVolumeProfile={isMultiChart ? (getActiveChartControl()?.isVolumeProfileOpen || false) : showVolumeProfile}
        showAIPanel={isMultiChart ? (getActiveChartControl()?.isAIPanelOpen || false) : showAIPanel}
        showChartTrading={isMultiChart ? (getActiveChartControl()?.isChartTradingOpen || false) : showChartTrading}
        showWatchlist={isMultiChart ? (getActiveChartControl()?.isWatchlistOpen || false) : showWatchlist}
        onToggleCompare={isMultiChart ? (() => { getActiveChartControl()?.toggleCompare(); }) : () => setShowCompare(!showCompare)}
        onToggleSmartGrid={() => {
          if (isMultiChart) {
            // Already in multi-chart mode → reset to single
            resetToSingle(selectedSymbol_, timeframe_);
          } else {
            // Enter multi-chart mode with 2x1 layout
            addChart(selectedSymbol_, timeframe_);
          }
        }}
        onToggleShare={isMultiChart ? (() => { getActiveChartControl()?.toggleShare(); }) : () => setShowShare(!showShare)}
        showCompare={isMultiChart ? (getActiveChartControl()?.isCompareOpen || false) : showCompare}
        // ── 5 New Feature Toolbar Props ──
        showFootprint={isMultiChart ? (getActiveChartControl()?.isFootprintOpen || false) : showFootprint}
        onToggleFootprint={isMultiChart ? (() => { getActiveChartControl()?.toggleFootprint(); }) : () => setShowFootprint(!showFootprint)}
        showAlerts={isMultiChart ? (getActiveChartControl()?.isAlertsOpen || false) : showAlerts}
        onToggleAlerts={isMultiChart ? (() => { getActiveChartControl()?.toggleAlerts(); }) : () => setShowAlerts(!showAlerts)}
        showPatternProgress={isMultiChart ? (getActiveChartControl()?.isPatternProgressOpen || false) : showPatternProgress}
        onTogglePatternProgress={isMultiChart ? (() => { getActiveChartControl()?.togglePatternProgress(); }) : () => setShowPatternProgress(!showPatternProgress)}
        // ── 3 Revolutionary Feature Toolbar Props ──
        showReplay={isMultiChart ? (getActiveChartControl()?.isReplayOpen || false) : showReplay}
        onToggleReplay={isMultiChart ? (() => { getActiveChartControl()?.toggleReplay(); }) : () => setShowReplay(!showReplay)}
        showHeatmap={isMultiChart ? (getActiveChartControl()?.isHeatmapOpen || false) : showHeatmap}
        onToggleHeatmap={isMultiChart ? (() => { getActiveChartControl()?.toggleHeatmap(); }) : () => setShowHeatmap(!showHeatmap)}
        // ── 4 AI Streaming Toolbar Prop ──
        showAIStream={isMultiChart ? (getActiveChartControl()?.isAIStreamOpen || false) : showAIStream}
        onToggleAIStream={isMultiChart ? (() => { getActiveChartControl()?.toggleAIStream(); }) : () => setShowAIStream(!showAIStream)}
        priceAlertsCount={priceAlertsCount}
        // ── Multi-Chart Toolbar Props ──
        isMultiChart={isMultiChart}
        onAddChart={() => addChart(selectedSymbol_, timeframe_)}
        onRemoveChart={() => removeChart(activeChartId)}
        onToggleLayoutSelector={() => setShowLayoutSelector(!showLayoutSelector)}
        showLayoutSelector={showLayoutSelector}
        chartCount={charts.length}
      /> : null
      )}

      {/* ── CHART AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

        {/* ── Multi-Chart Mode: Grid Layout (main chart only) ── */}
        {/* FIX: Replaced IIFE with useMemo for stable rendering. The old IIFE
            pattern `(() => {...})()` created a new function/closure every render,
            which React's reconciler treated as a new child type → unmount/remount
            all grid cells on every render → broken charts + potential error #185. */}
        {multiChartGrid}

        {/* ── Layout Selector Dropdown ── */}
        {showLayoutSelector && isMultiChart && (
          <div style={{
            position: 'absolute',
            top: 44,
            right: 60,
            background: '#151A22',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 10,
            padding: 10,
            zIndex: 99999,
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          }}>
            <div style={{ fontSize: 9, color: '#4B5563', letterSpacing: 1, marginBottom: 8, textAlign: 'center', fontFamily: "'Cairo', sans-serif" }}>
              تخطيط الشارت
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {(Object.entries(LAYOUT_METAS) as [LayoutConfig, typeof LAYOUT_METAS[LayoutConfig]][]).map(([key, m]) => {
                const isActive = multiChartLayout === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      changeLayout(key, selectedSymbol_, timeframe_);
                      setShowLayoutSelector(false);
                    }}
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
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.08)';
                    }}
                    onMouseLeave={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                    }}
                  >
                    <span style={{
                      color: isActive ? '#00D4FF' : '#8B92A8',
                      fontSize: 10,
                      fontWeight: isActive ? 700 : 500,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {m.label}
                    </span>
                    <span style={{ color: '#4B5563', fontSize: 7 }}>
                      {m.cols * m.rows}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Single Chart / Mini Chart Mode ── */}
        {/* FIX: Always render the chart canvas container (even in multi-chart mode)
            to prevent the ref from becoming stale. When the main chart is in
            multi-chart mode, the canvas is visually hidden but stays in the DOM.
            Previously, conditional rendering removed the div from the DOM, which
            caused chart.containerRef to point to a detached element. When returning
            to single-chart mode, React created a NEW div but the chart instance
            was still attached to the OLD detached div → "candles are broken". */}
        <div style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          // Hide the single-chart canvas when the multi-chart grid is shown.
          // Using display:none would prevent lightweight-charts from rendering,
          // but since the WebSocket is disabled for hidden main chart anyway,
          // visibility:hidden + height:0 is better to keep the container in layout.
          ...(isMultiChart && !isGridCell ? { display: 'none' } : {}),
        }}>
            {/* OHLC Overlay */}
        {(!isMultiChart || isGridCell) && (
        <CrosshairOverlay
          symbol={selectedSymbol_}
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
        )}

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

          {/* Overlay Layer — ABOVE canvas so trade labels and fill zones are visible.
              pointerEvents: none so chart interactions (drawing, crosshair) still work. */}
          <div className="roua-overlay-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 5 }}>

            {/* Symbol Watermark — REMOVED: name already shown in toolbar/CrosshairOverlay */}

            {/* ── Fill Zones (colored bands between entry-SL/TP) ── */}
            {fillZones.map(zone => (
              <div
                key={zone.key}
                data-zone={zone.key}
                style={{
                  position: 'absolute',
                  top: zone.top,
                  left: 0,
                  right: 0,
                  height: Math.max(zone.height, 1),
                  background: zone.type === 'sl'
                    ? 'rgba(248, 81, 73, 0.13)'
                    : 'rgba(63, 185, 80, 0.13)',
                  pointerEvents: 'none',
                  zIndex: 2,
                  willChange: 'top, height',
                }}
              />
            ))}

            {/* ── Trade Line Labels — LEFT side HTML overlays ── */}
            {/* Position/trade labels (Entry, SL, TP) rendered on the LEFT side
                of the chart to avoid cluttering the right price scale where the
                current price indicator lives. Price lines themselves are still
                rendered via lightweight-charts createPriceLine (dashed lines
                spanning the full chart width), but their axis labels are hidden. */}
            {tradeOverlays.map(ov => {
              if (ov.y === null) return null;
              const isEntry = ov.type === 'entry';
              const isSL = ov.type === 'sl';
              const isTP = ov.type === 'tp';
              const color = isEntry ? '#00D4FF' : isSL ? '#FF4757' : '#00FFA3';
              const bg = isEntry ? 'rgba(0,212,255,0.12)' : isSL ? 'rgba(248,81,73,0.12)' : 'rgba(63,185,80,0.12)';
              const label = isEntry
                ? (ov.direction === 'long' ? '▲ Entry' : '▼ Entry')
                : isSL ? `SL ${ov.price.toFixed(ov.price > 100 ? 2 : 5)}`
                : `TP ${ov.price.toFixed(ov.price > 100 ? 2 : 5)}`;
              return (
                <div key={ov.key} data-trade-label={ov.key} style={{
                  position: 'absolute',
                  top: 0,
                  left: 6,
                  zIndex: 10,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  transform: `translateY(${ov.y - 9}px)`,
                  willChange: 'transform',
                }}>
                  <span style={{
                    background: bg,
                    border: `1px solid ${color}33`,
                    borderRadius: 3,
                    color,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 5px',
                    whiteSpace: 'nowrap',
                    letterSpacing: 0.3,
                    textShadow: `0 0 6px ${color}44`,
                  }}>
                    {label}
                  </span>
                  {ov.qty > 0 && !isEntry && (
                    <span style={{
                      color: color + '99',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 8,
                      fontWeight: 500,
                    }}>
                      {ov.qty}x
                    </span>
                  )}
                </div>
              );
            })}

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
                        symbol: selectedSymbol_,
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
                        symbol: selectedSymbol_,
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

          {/* FIX: Drawing Panel — rendered via Portal + DraggablePanel (same as all
              other panels) so it's NOT clipped by the chart wrapper's overflow.
              Previously used position:absolute inside chart wrapper, which caused
              the panel to be cut off when the chart was short (multi-chart grid). */}
          {showDrawingPanel && createPortal(
            <DraggablePanel defaultPosition={{ top: 40, right: 8 }} defaultWidth={280} minHeight={200}>
              <DrawingPanel
                activeTool={chart.activeTool}
                onSetTool={chart.setTool}
                onClose={() => setShowDrawingPanel(false)}
                onClearAll={chart.clearDrawings}
              />
            </DraggablePanel>,
            getPortalRoot()
          )}
        </div>{/* ── Chart Wrapper close ── */}
        </div>{/* ── Single Chart / Mini Chart Mode div close ── */}

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
              symbol={selectedSymbol_}
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
              symbol={selectedSymbol_}
              currentPrice={currentPrice}
              onPlaceOrder={handlePlaceOrder}
              onClose={() => setShowQuickTrade(false)}
            />
          </DraggablePanel>,
          getPortalRoot()
        )}

        {/* Template Manager (draggable) — rendered via Portal */}
        {showTemplateManager && createPortal(
          <DraggablePanel defaultPosition={{ top: 40, left: 100 }} defaultWidth={isMultiChart ? 300 : 280} minHeight={250}>
            <TemplateManager
              onLoadTemplate={isMultiChart ? ((id: string) => { getActiveChartControl()?.loadTemplate(id); }) : chart.loadTemplate}
              onSaveTemplate={isMultiChart ? ((name: string) => { getActiveChartControl()?.saveTemplate(name); }) : chart.saveTemplate}
              onClose={() => setShowTemplateManager(false)}
              isMultiChart={isMultiChart}
              onLoadGridTemplate={isMultiChart ? ((id: string) => {
                const gridTemplate = GridTemplateManager.load(id);
                if (!gridTemplate) return;

                // STEP 1: Pre-save each cell's state to useChartStateStore
                // This MUST happen BEFORE changing symbols/timeframes so that
                // restoreChartState() (triggered by symbol/timeframe change)
                // will find the correct state in the store.
                const chartStateStore = useChartStateStore.getState();
                gridTemplate.cells.forEach((cellState) => {
                  const indicators: SerializedIndicator[] = (cellState.indicators || []).map(ind => ({
                    key: ind.key,
                    params: ind.params,
                    color: ind.color,
                    opacity: ind.opacity,
                    visible: ind.visible,
                  }));
                  chartStateStore.saveChartConfig(cellState.symbol, cellState.timeframe, {
                    chartType: cellState.chartType,
                    settings: cellState.settings,
                    indicators,
                    drawings: cellState.drawings || [],
                  });
                });

                // STEP 2: Apply the template's layout and chart configs directly.
                // We bypass changeLayout() because it uses pickSymbol/pickTimeframe
                // which would give wrong symbols, and then updateChartConfig would
                // trigger a save-then-restore race condition.
                // Instead, we build the complete charts array from the template.
                // IMPORTANT: We always use NEW chart IDs so that RouaChart components
                // remount completely. If we reuse old IDs, the existing RouaChart would
                // receive new symbol/timeframe props, triggering useEffect([symbol])
                // which saves OLD state under the NEW symbol, overwriting our pre-saved state.
                const store = useMultiChartStore.getState();
                const meta = LAYOUT_METAS[gridTemplate.layout];
                const targetCount = meta.cols * meta.rows;

                // Unregister ALL old chart instances
                store.charts.forEach(c => unregisterChartInstance(c.id));

                // Build new charts array from template cells with fresh IDs
                const newCharts = gridTemplate.cells.slice(0, targetCount).map((cellState, i) => ({
                  id: `mc-${Date.now()}-${i}`,
                  symbol: cellState.symbol,
                  timeframe: cellState.timeframe,
                  chartType: cellState.chartType,
                }));

                // Pad with default cells if template has fewer cells than layout needs
                while (newCharts.length < targetCount) {
                  const i = newCharts.length;
                  newCharts.push({
                    id: `mc-${Date.now()}-${i}`,
                    symbol: selectedSymbol_,
                    timeframe: timeframe_,
                    chartType: 'candle' as ChartType,
                  });
                }

                // Set everything in one atomic update
                useMultiChartStore.setState({
                  layout: gridTemplate.layout,
                  charts: newCharts,
                  isMultiChart: targetCount > 1,
                  activeChartId: newCharts[0]?.id || 'mc-1',
                  expandedChartId: null,
                });
              }) : undefined}
              onSaveGridTemplate={isMultiChart ? ((name: string) => {
                const store = useMultiChartStore.getState();
                const allControls = getAllChartControls();
                // Collect state from ALL chart cells
                const cells = store.charts.map(cellCfg => {
                  const ctrl = allControls.get(cellCfg.id);
                  const state = ctrl?.getChartState();
                  return {
                    id: cellCfg.id,
                    symbol: state?.symbol ?? cellCfg.symbol,
                    timeframe: state?.timeframe ?? cellCfg.timeframe,
                    chartType: state?.chartType ?? cellCfg.chartType,
                    settings: state?.settings ?? chart.settings,
                    indicators: state?.indicators ?? [],
                    drawings: state?.drawings ?? [],
                  };
                });
                GridTemplateManager.save(name, store.layout, cells);
              }) : undefined}
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
            defaultSymbol={selectedSymbol_}
            defaultTimeframe={timeframe_}
            onSwitchToChart={(symbol, tf, openTool) => {
              // Switch to the selected symbol/timeframe
              if (isMultiChart) {
                // In multi-chart mode: update the active chart cell
                const ctrl = getActiveChartControl();
                if (ctrl) {
                  ctrl.setSymbol(symbol);
                  useMultiChartStore.getState().updateChartConfig(activeChartId, { timeframe: tf });
                }
              } else {
                // In single chart mode: update global store
                setSelectedSymbol(symbol);
                setTimeframe(tf);
              }
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
              symbol={selectedSymbol_}
              timeframe={timeframe_}
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
              symbol={selectedSymbol_}
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
              symbol={selectedSymbol_}
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
              symbol={selectedSymbol_}
              currentPrice={currentPrice}
              addPriceLineRef={addPriceLineRef}
              removePriceLineRef={removePriceLineRef}
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
              selectedSymbol={selectedSymbol_}
              onSelectSymbol={(symbol) => {
                if (isMultiChart) {
                  getActiveChartControl()?.setSymbol(symbol);
                } else {
                  const { setSelectedSymbol } = useSymbolStore.getState();
                  setSelectedSymbol(symbol);
                }
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
            selectedSymbol={selectedSymbol_}
            onSelectSymbol={(symbol) => {
              if (isMultiChart) {
                // In multi-chart mode: update the active chart cell's symbol
                getActiveChartControl()?.setSymbol(symbol);
              } else {
                // In single chart mode: update the global symbol store
                const { setSelectedSymbol } = useSymbolStore.getState();
                setSelectedSymbol(symbol);
              }
            }}
            visible={showWatchlist}
          />
        </DraggablePanel>,
        getPortalRoot()
      )}

      {/* ── News Markers (data provider — invisible) ── */}
      <NewsMarkers
        symbol={selectedSymbol_}
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
            symbol={selectedSymbol_}
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
                symbol: selectedSymbol_,
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
            const config = INDICATOR_CONFIGS.find(c => c.key === key);
            if (config) {
              const activeIndicators = chart.getActiveIndicators();
              const existing = activeIndicators.find((i: ActiveIndicator) => i.key === key);
              if (existing) {
                chart.removeIndicator(key);
              } else {
                chart.addIndicator({ key: key as any, params: config.defaultParams, color: config.defaultColor, opacity: config.defaultOpacity, visible: true });
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

