// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Main Component
// Professional trading chart using lightweight-charts v5
// ═══════════════════════════════════════════════════════════

'use client';

import { ChartDiagOverlay } from './ChartDiagOverlay';
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
import { useMarketStore, type QuoteData } from '@/hooks/useMarketStore';
import type { CandleData, CrosshairData, ChartType, DrawingTool, ActiveIndicator, AIPattern, NewsMarker } from '@/lib/charts/types';
import { TIMEFRAMES, INDICATOR_CONFIGS } from '@/lib/charts/types';
import { sanitizeOhlc } from '@/lib/charts/chart-utils';
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
import { resetFallbackEntryCache } from '@/lib/charts/overlay-renderer';
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
// AlertPanel removed — dead code. PriceAlertLine replaces it.
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
import { useTranslations, useLocale } from 'next-intl';

// V431: Get correct contractSize per symbol (mirrors backend getSymbolMetadata)
// - Crypto (BTC/USDT, ETH/USDT): contractSize=1 (1 lot = 1 unit)
// - Forex (EUR/USD, GBP/USD): contractSize=100000 (1 lot = 100,000 units)
// - Gold (XAU/USD): contractSize=100 (1 lot = 100 oz)
// - Silver (XAG/USD): contractSize=5000 (1 lot = 5,000 oz)
// - Oil (WTI/USD, BRENT/USD): contractSize=1000 (1 lot = 1,000 barrels)
// - Indices (US30, NAS100, SPX500): contractSize=1
function getContractSize(symbol: string): number {
  const s = (symbol || '').toUpperCase();
  if (s.includes('/USDT') || s.includes('/BTC') || s.endsWith('USDT')) return 1;       // crypto
  if (s === 'XAU/USD' || s === 'XAUUSD') return 100;                                  // gold
  if (s === 'XAG/USD' || s === 'XAGUSD') return 5000;                                 // silver
  if (s === 'WTI/USD' || s === 'WTIUSD' || s === 'BRENT/USD' || s === 'BRENTUSD') return 1000; // oil
  if (s.startsWith('US30') || s.startsWith('NAS100') || s.startsWith('SPX500') ||
      s.startsWith('GER30') || s.startsWith('UK100')) return 1;                        // indices
  return 100000;                                                                       // forex default
}

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
  onSLTPDrag?: (key: string, type: 'sl' | 'tp', newPrice: number) => void;
}

// ── Mini Chart Header (for multi-chart compact mode) ──
// Shows symbol, timeframe selector, current price, and close button.
// Replaces the full toolbar when RouaChart is used as a mini chart cell.
// V432: all 12 backend-supported crypto + key forex/metals
const POPULAR_SYMBOLS_MINI = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
  'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', 'AVAX/USDT',
  'LINK/USDT', 'UNI/USDT',
  'EUR/USD', 'GBP/USD', 'XAU/USD',
];
const TIMEFRAME_MINI = [
  { value: '1min', label: '1m' }, { value: '5min', label: '5m' },
  { value: '15min', label: '15m' }, { value: '1h', label: '1H' },
  { value: '4h', label: '4H' }, { value: '1day', label: '1D' },
];

function MiniChartHeader({
  symbol, timeframe, currentPrice, changePercent, isPaused, loading,
  onSymbolChange, onTimeframeChange, onActivate, onClose, canClose, isActive,
  candleCountdown,
}: {
  symbol: string; timeframe: string; currentPrice: number | null;
  changePercent: number | null; isPaused: boolean; loading: boolean;
  onSymbolChange: (s: string) => void; onTimeframeChange: (tf: string) => void;
  onActivate: () => void; onClose?: () => void; canClose?: boolean; isActive: boolean;
  candleCountdown?: string;
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
          borderRadius: 3, color: '#00D4FF', fontFamily: "var(--font-mono)",
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
                fontFamily: "var(--font-mono)", fontSize: 8,
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

      {/* Candle Countdown Timer */}
      {candleCountdown && !loading && (
        <span style={{
          color: '#00D4FF', fontSize: 9, fontWeight: 700,
          fontFamily: "var(--font-mono)",
          background: 'rgba(0,212,255,0.08)',
          border: '1px solid rgba(0,212,255,0.15)',
          borderRadius: 3, padding: '0 4px', lineHeight: '16px',
          flexShrink: 0,
        }}>
          {candleCountdown}
        </span>
      )}

      {currentPrice !== null && !loading && (
        <>
          <span style={{ color: '#F0F2F5', fontSize: 10, fontWeight: 600,
            fontFamily: "var(--font-mono)" }}>
            {fmtPrice(currentPrice)}
          </span>
          {changePercent !== null && (
            <span style={{ color: isPositive ? '#3fb950' : '#f85149', fontSize: 8, fontWeight: 700,
              fontFamily: "var(--font-mono)", padding: '0 3px', borderRadius: 2,
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
// Styled like a price-scale label: sticks right below the last-price label
// on the right edge and changes color with candle direction (green/red).
// Uses direct DOM manipulation (no React state for position) to prevent
// dancing during drag — same approach as trade overlay labels.
function PriceSyncedTimer({ chart, currentPrice, countdown, isBull, compact }: {
  chart: any; currentPrice: number; countdown: string; isBull: boolean; compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // FIX: Store currentPrice in a data attribute so syncOverlayPositions can
  // update this element's position without needing React re-renders.
  // This eliminates the "dancing" caused by the timer's own position updates
  // fighting with syncOverlayPositions during price-scale drag.
  useEffect(() => {
    if (ref.current) {
      ref.current.setAttribute('data-timer-price', String(currentPrice));
    }
  }, [currentPrice]);

  // Set initial position only — all subsequent position updates are handled
  // by syncOverlayPositions() in the main chart component, which uses the
  // [data-candle-timer] selector and data-timer-price attribute.
  // This avoids duplicate position-update loops that caused dancing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const getPriceCoordinate = chart.getPriceCoordinate;
    if (!getPriceCoordinate) return;
    try {
      const coord = getPriceCoordinate(currentPrice);
      if (coord !== null) {
        // getPriceCoordinate returns the Y of the price on the price scale.
        // The price label (green/red box) is centered around this Y.
        // Label height is ~20px in lightweight-charts v5, so bottom edge = coord + 10.
        // Place timer directly below with no gap (sticking to label).
        el.style.top = (coord + 10) + 'px';
        el.style.display = 'flex';
      } else {
        el.style.display = 'none';
      }
    } catch { /* chart may be destroyed */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

  // Colors match the price-scale last-price label
  const bgColor = isBull ? '#3fb950' : '#f85149';
  const scale = compact ? 0.85 : 1;

  return (
    <div
      ref={ref}
      data-candle-timer="true"
      data-timer-price={String(currentPrice)}
      style={{
        position: 'absolute',
        top: 0,  // Updated via syncOverlayPositions() direct DOM manipulation
        right: 0,
        zIndex: 5,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'flex-end',
        paddingRight: 2,
      }}
    >
      <div style={{
        background: bgColor,
        color: '#fff',
        fontFamily: "var(--font-mono)",
        fontSize: 10 * scale,
        fontWeight: 700,
        padding: compact ? '1px 5px' : '1px 7px',
        borderRadius: '0 0 3px 3px',
        minWidth: 44 * scale,
        textAlign: 'center',
        letterSpacing: 0.4,
        lineHeight: compact ? '11px' : '14px',
        boxShadow: `0 1px 4px ${isBull ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)'}`,
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
  onSLTPDrag,
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
  const chartLocale = useLocale();
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
  const [tradePanelCollapsed, setTradePanelCollapsed] = useState(true);
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [tradeSl, setTradeSl] = useState('');
  const [tradeTp, setTradeTp] = useState('');
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
  const currentPriceRef = useRef(currentPrice);
  currentPriceRef.current = currentPrice;
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
  // H3 FIX: Per-instance OverlayRegistry instead of module-level singleton.
  // Each RouaChart instance gets its own registry, preventing cross-chart
  // interference in multi-chart mode. Previously, all charts shared the
  // same singleton, so toggling overlays on one chart affected all charts.
  const overlayRegistryInstanceRef = useRef<import('@/lib/charts/OverlayRegistry').OverlayRegistry | null>(null);
  useEffect(() => {
    import('@/lib/charts/overlay-renderer').then(mod => { overlayRendererRef.current = mod; }).catch(() => {});
    import('@/lib/charts/OverlayRegistry').then(mod => {
      overlayRegistryRef.current = mod;
      // H3: Create per-instance registry
      if (!overlayRegistryInstanceRef.current) {
        overlayRegistryInstanceRef.current = new mod.OverlayRegistry();
      }
    }).catch(() => {});
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
  // FIX: Pagination — track whether we're loading older data and whether
  // there's more data to load. When the user scrolls left past the initial
  // 1000 candles, we fetch older data using Binance's startTime parameter.
  // This eliminates the visual gap at the left edge of the chart.
  const isLoadingOlderRef = useRef(false);   // Prevent duplicate fetches
  const hasMoreHistoryRef = useRef(true);    // Set to false when Binance returns < 1000 candles
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
    // FIX: Reset pagination state on symbol/timeframe change
    isLoadingOlderRef.current = false;
    hasMoreHistoryRef.current = true;

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
            // Sync global store so header ticker, watchlist, and URL reflect the active cell's symbol
            // This prevents the global selectedSymbol from being stale when exiting multi-chart mode
            const { activeChartId } = useMultiChartStore.getState();
            if (activeChartId === chartId) {
              useSymbolStore.getState().setSelectedSymbol(symbol);
            }
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
      // V446: Queue WS updates when candlesRef is empty instead of dropping them.
      // Previously: WS updates were rejected for 10s, then allowed — causing
      // flicker (candle appears, history overwrites, candle reappears).
      // Now: if candlesRef is empty, still accept the candle but don't trigger
      // heavy indicator rebuilds. When history arrives, it replaces everything.
      // The 10s timeout is kept as safety net for permanent fetch failure.
      if (candlesRef.current.length === 0) {
        const timeSinceClear = Date.now() - candlesClearedAtRef.current;
        if (timeSinceClear < CANDLES_CLEAR_TIMEOUT_MS) {
          // Still within blind window — accept candle but skip indicator rebuild
          // This prevents flicker: the candle shows, then history replaces it cleanly
        }
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
      // V445: For weekly candles, align to Monday (not Thursday which is
      // Unix epoch day 0). Math.floor(time / 604800) * 604800 produces
      // Thursday boundaries — OANDA REST returns Monday boundaries → mismatch.
      let alignedTime;
      const tfSec = tfSecondsRef.current;
      if (tfSec === 604800) {
        // Weekly: align to Monday 00:00 UTC
        const dayStart = Math.floor(candle.time / 86400) * 86400;
        const dayOfWeek = ((dayStart / 86400) + 4) % 7; // 0=Monday (epoch was Thursday=4)
        alignedTime = dayStart - dayOfWeek * 86400;
      } else if (tfSec === 2592000) {
        // Monthly: align to first day of month
        const d = new Date(candle.time * 1000);
        alignedTime = Math.floor(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getTime() / 1000);
      } else {
        alignedTime = Math.floor(candle.time / tfSec) * tfSec;
      }
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
        let mergedHigh = Math.max(existing.high, alignedCandle.high);
        let mergedLow = Math.min(existing.low, alignedCandle.low);
        const mergedClose = alignedCandle.close;
        const mergedOpen = existing.open; // Keep original open for the candle period
        // FIX: Sanitize OHLC — near-flat candles from Binance 1m/5m render as dots.
        const s = sanitizeOhlc(mergedOpen, mergedHigh, mergedLow, mergedClose);
        const merged = {
          ...existing,
          high: s.high,
          low: s.low,
          close: s.close,
          open: s.open,
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
        // FIX: Sanitize the new candle's OHLC using sanitizeOhlc to prevent
        // near-flat candles (dots) from Binance 1m/5m data.
        const s = sanitizeOhlc(alignedCandle.open, alignedCandle.high, alignedCandle.low, alignedCandle.close);
        const sanitizedCandle = { ...alignedCandle, open: s.open, high: s.high, low: s.low, close: s.close };
        candlesRef.current.push(sanitizedCandle);
        // PERF FIX: Use updateCandleRef (O(1) series.update) instead of full setData()
        // setData() destroys and recreates all indicator series → "rubbery" animation
        // updateCandleRef only updates the single new candle, indicators stay intact
        updateCandleRef.current(sanitizedCandle);
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

                const reg = (overlayRegistryInstanceRef.current || registryMod.getOverlayRegistry());
                reg.init(series, chart.removePriceLine);

                const cached = lastAnalysisResultRef.current;
                overlayMod.renderOverlays(series, {
                  candles: candlesRef.current,
                  overlays: currentOverlays,
                  symbol: selectedSymbol_,  // BUG-007: required for fallback entry cache keying
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

      // V386: Unify price paths — write the fast chart price (every 2s for OANDA,
      // sub-second for crypto) into useMarketStore so that the TickerBar,
      // Watchlist, and the chart price label (which all read from useMarketStore)
      // update at the same speed as the chart canvas.
      //
      // Before this fix: MarketProvider polled /api/exchange/quote every 60s for
      // OANDA pairs → ticker/label showed stale prices even though the chart
      // canvas was updating every 2s.
      //
      // We merge with the existing quote to preserve name/exchange/change/etc.
      // Only price/close/high/low/timestamp get refreshed by the live feed.
      try {
        const store = useMarketStore.getState();
        const existing = store.quotes[selectedSymbol_];
        if (existing) {
          const updated: QuoteData = {
            ...existing,
            price,
            close: price,
            high: Math.max(existing.high || price, price),
            low: existing.low > 0 ? Math.min(existing.low, price) : price,
            timestamp: new Date().toISOString(),
            source: existing.source || 'chart-stream',
          };
          store.setQuote(selectedSymbol_, updated);
        } else {
          // No existing quote yet — create a minimal one so the ticker shows the
          // live price immediately instead of waiting for MarketProvider's 60s poll.
          store.setQuote(selectedSymbol_, {
            symbol: selectedSymbol_,
            name: selectedSymbol_.replace('/', ' / '),
            exchange: 'OANDA',
            currency: selectedSymbol_.split('/')[1] || 'USD',
            price,
            change: 0,
            changePercent: 0,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0,
            marketCap: null,
            fiftyTwoWeekHigh: null,
            fiftyTwoWeekLow: null,
            timestamp: new Date().toISOString(),
            source: 'OANDA Stream (chart)',
          });
        }
      } catch { /* store may not be ready */ }
      // Overlay positions update via onVisibleRangeChange + 3s interval
      // لا نستدعي scheduleOverlayUpdate هنا — كل تحديث سعر كان يُطلق React re-render
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

        const reg = (overlayRegistryInstanceRef.current || registryMod.getOverlayRegistry());
        reg.init(series, chart.removePriceLine);

        const cached = lastAnalysisResultRef.current;
        overlayMod.renderOverlays(series, {
          candles: candlesRef.current,
          overlays: currentOverlays,
          symbol: selectedSymbol_,  // BUG-007: required for fallback entry cache keying
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
    // PERF FIX: Was 60s — caused "rubbery" candle animation every minute
    // Indicators stay accurate via incremental updates; full rebuild only needed rarely
    const INDICATOR_REFRESH_MS = 5 * 60_000; // 5 minutes instead of 60s
    const interval = setInterval(() => {
      try {
        if (candlesRef.current.length === 0) return;
        // Use skipIndicatorRebuild to avoid destroying/recreating series visually
        // This prevents the "rubber band" effect on the chart every minute
        setCandlesRef.current([...candlesRef.current], { skipIndicatorRebuild: true });
      } catch { /* non-critical */ }
    }, INDICATOR_REFRESH_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── FIX: Periodic data refresh (every 120s) ──
  // Re-fetches the latest candles from the API to fill any gaps that
  // may have developed between the historical fetch and WebSocket updates.
  // This is especially important when WebSocket reconnects after a
  // disconnect — the gap between the last WS candle and reconnection
  // would otherwise persist until the user manually changes timeframe.
  useEffect(() => {
    const DATA_REFRESH_MS = 120_000; // 2 minutes — balances freshness vs API load
    let active = true;
    const refreshData = async () => {
      if (!active || candlesRef.current.length === 0) return;
      try {
        const res = await fetch(`/api/exchange/history/${encodeURIComponent(selectedSymbol_)}?interval=${timeframe_}`);
        const j = await res.json();
        if (!active || !j.success || !j.data || j.data.length === 0) return;

        // Merge new data with existing candles — only add/update, don't remove
        const newCandles: CandleData[] = (j.data as any[])
          .map((item: any): CandleData => ({
            time: Math.floor(new Date(item.timestamp).getTime() / 1000),
            open: Number(item.open) || 0,
            high: Number(item.high) || 0,
            low: Number(item.low) || 0,
            close: Number(item.close) || 0,
            volume: Number(item.volume) || 0,
          }))
          .filter((item: CandleData) => !isNaN(item.time) && item.time > 0 && item.close > 0);

        if (newCandles.length === 0) return;

        // Build a map for fast lookup
        const existingMap = new Map<number, CandleData>(candlesRef.current.map(cd => [cd.time, cd]));
        // الشمعة الحالية (المفتوحة) — نتخطاها في الدمج
        // REST API يُعيد بيانات أقدم من WebSocket للشمعة الجارية
        // وبدون هذا الحماية: REST يستبدل high/close الجديد بقيم قديمة → تمط
        const currentCandleTime = candlesRef.current.length > 0
          ? candlesRef.current[candlesRef.current.length - 1].time
          : 0;
        let changed = false;
        for (const nc of newCandles) {
          if (nc.time === currentCandleTime) continue; // تخطِّ الشمعة الحالية
          const existing = existingMap.get(nc.time);
          if (!existing) {
            existingMap.set(nc.time, nc);
            changed = true;
          } else if (nc.close !== (existing as CandleData).close || nc.high !== (existing as CandleData).high || nc.low !== (existing as CandleData).low) {
            existingMap.set(nc.time, nc);
            changed = true;
          }
        }

        if (changed) {
          const merged = (Array.from(existingMap.values()) as CandleData[]).sort((a, b) => a.time - b.time);
          candlesRef.current = merged;
          setCandlesRef.current(merged, { skipIndicatorRebuild: true });
        }
      } catch { /* non-critical */ }
    };

    const interval = setInterval(refreshData, DATA_REFRESH_MS);
    return () => { active = false; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol_, timeframe_]);

  // ── Fetch Historical Candles ───────────────────────────
  useEffect(() => {
    let cancelled = false; // Guard against stale responses after symbol change
    // FIX: AbortController cancels the actual network request on symbol/timeframe change
    // Previously: cancelled=true only prevented rendering, but fetch completed anyway
    // causing network congestion when switching symbols quickly
    const controller = new AbortController();

    const fetchCandles = async () => {
      try {
        setFeedState('waiting');
        console.log(`[RouaChart] Fetching candles: ${selectedSymbol_} ${timeframe_}...`);
        const res = await fetch(`/api/exchange/history/${encodeURIComponent(selectedSymbol_)}?interval=${timeframe_}`, {
          signal: controller.signal,
        });
        const j = await res.json();

        if (cancelled) {
          console.log(`[RouaChart] Fetch cancelled (symbol changed): ${selectedSymbol_} ${timeframe_}`);
          return; // Symbol/timeframe changed while fetching — discard
        }

        if (j.success && j.data && j.data.length > 0) {
          console.log(`[RouaChart] Fetched ${j.data.length} candles for ${selectedSymbol_} ${timeframe_} (source: ${j.meta?.source || 'unknown'})`);
          setFeedState('live');
          const formatted: CandleData[] = j.data
            .map((c: any) => {
              const rawOpen = Number(c.open) || 0;
              const rawHigh = Number(c.high) || 0;
              const rawLow = Number(c.low) || 0;
              const rawClose = Number(c.close) || 0;
              // NOTE: sanitizeOhlc is NOT applied here — it's applied in useChart.ts
              // setCandles() which is the canonical data entry point. Applying it
              // here AND in setCandles causes triple application with compounding
              // range expansion. Only apply it ONCE in setCandles.
              return {
                time: Math.floor(new Date(c.timestamp).getTime() / 1000),
                open: rawOpen,
                high: rawHigh,
                low: rawLow,
                close: rawClose,
                volume: Number(c.volume) || 0,
              };
            })
            .filter(c => !isNaN(c.time) && c.time > 0 && !isNaN(c.open) && !isNaN(c.close) && c.close > 0 && !isNaN(c.high) && c.high > 0 && !isNaN(c.low) && c.low > 0);
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
          console.log(`[RouaChart] Setting ${unique.length} candles on chart for ${selectedSymbol_} ${timeframe_}`);
          setCandlesRef.current(unique, { clearExternal: true });
          // Update AI panel candles if panel is open so overlays can redraw
          if (showAIPanelRef.current) {
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
          console.warn(`[RouaChart] No real data for ${selectedSymbol_} ${timeframe_}, falling back to simulated data`);
          setFeedState('fallback');
          // Generate simulated data as fallback
          generateSimulatedData();
        }
      } catch (err: any) {
        // AbortError = intentional cancel (symbol/timeframe changed) — not an error
        if (err?.name === 'AbortError' || cancelled) return;
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
      if (showAIPanelRef.current) {
        setAiPanelCandles([...candles]);
      }
      // FIX: Auto-fit after simulated data too
      requestAnimationFrame(() => {
        if (!cancelled) resetViewRef.current();
      });
    };

    fetchCandles();

    return () => { cancelled = true; controller.abort(); }; // Cancel network request
  }, [selectedSymbol_, timeframe_]);

  // ── Pagination: Load Older Data on Scroll ──────────────
  // FIX: When the user scrolls left past the initial 1000 candles, the chart
  // shows empty space because there's no more data. This is the #1 cause of
  // "gaps between candles" — the user sees blank space at the left edge.
  // We subscribe to visibleLogicalRangeChange and fetch older data when
  // the user scrolls near the left edge.
  useEffect(() => {
    const chartApi = chart.chartRef.current;
    if (!chartApi) return;

    const loadOlderCandles = async () => {
      // Don't fetch if already loading or no more data
      if (isLoadingOlderRef.current || !hasMoreHistoryRef.current) return;
      // Don't fetch if no candles loaded yet
      if (candlesRef.current.length === 0) return;

      isLoadingOlderRef.current = true;
      try {
        // Get the earliest candle time and use it as endTime for Binance
        // Binance returns candles BEFORE endTime when no startTime is given,
        // so we set endTime = earliest_candle_time_ms to get older data.
        const earliestTime = candlesRef.current[0].time;
        const endTimeMs = (earliestTime * 1000) - 1; // -1ms to avoid duplicate
        const res = await fetch(
          `/api/exchange/history/${encodeURIComponent(selectedSymbol_)}?interval=${timeframe_}&endTime=${endTimeMs}`
        );
        const j = await res.json();

        if (j.success && j.data && j.data.length > 0) {
          // If Binance returned fewer than 1000, there's no more history
          if (j.data.length < 1000) {
            hasMoreHistoryRef.current = false;
          }

          // Format the new (older) candles
          const olderCandles: CandleData[] = j.data
            .map((c: any) => {
              const rawOpen = Number(c.open) || 0;
              const rawHigh = Number(c.high) || 0;
              const rawLow = Number(c.low) || 0;
              const rawClose = Number(c.close) || 0;
              return {
                time: Math.floor(new Date(c.timestamp).getTime() / 1000),
                open: rawOpen,
                high: rawHigh,
                low: rawLow,
                close: rawClose,
                volume: Number(c.volume) || 0,
              };
            })
            .filter(c => !isNaN(c.time) && c.time > 0 && !isNaN(c.open) && !isNaN(c.close) && c.close > 0 && !isNaN(c.high) && c.high > 0 && !isNaN(c.low) && c.low > 0);

          if (olderCandles.length === 0) {
            hasMoreHistoryRef.current = false;
            return;
          }

          // Merge: prepend older candles, deduplicate, sort
          const existingTimes = new Set(candlesRef.current.map(c => c.time));
          const newCandles = olderCandles.filter(c => !existingTimes.has(c.time));
          if (newCandles.length > 0) {
            const merged = [...newCandles, ...candlesRef.current].sort((a, b) => a.time - b.time);
            // Deduplicate
            const seen = new Set<number>();
            const unique = merged.filter(c => {
              if (seen.has(c.time)) return false;
              seen.add(c.time);
              return true;
            });
            candlesRef.current = unique;
            // Use setCandles to update the chart — skip indicator rebuild
            // since we're just prepending older data (indicators don't change)
            setCandlesRef.current(unique, { skipIndicatorRebuild: true });
            console.log(`[RouaChart] Pagination: loaded ${newCandles.length} older candles (total: ${unique.length})`);
          }
        } else {
          // No data returned — no more history available
          hasMoreHistoryRef.current = false;
        }
      } catch (err) {
        console.warn('[RouaChart] Pagination fetch failed:', err);
      } finally {
        isLoadingOlderRef.current = false;
      }
    };

    const handler = (logicalRange: { from: number; to: number } | null) => {
      if (!logicalRange) return;
      // When the user scrolls near the left edge (from < 5 candles from start),
      // trigger loading older data. This prevents the user from ever reaching
      // the "no data" boundary.
      if (logicalRange.from < 5 && hasMoreHistoryRef.current && !isLoadingOlderRef.current) {
        loadOlderCandles();
      }
    };

    try {
      chartApi.timeScale().subscribeVisibleLogicalRangeChange(handler as any);
    } catch {}

    return () => {
      try {
        chartApi.timeScale().unsubscribeVisibleLogicalRangeChange(handler as any);
      } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol_, timeframe_, chart.chartRef.current]);

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
    linePnl?: number;   // P&L if price hits this line (SL=loss, TP=profit)
    positionId?: string; // for drag updates
    symbol?: string;     // for context menu
    stopLoss?: number;   // for context menu
    takeProfit?: number; // for context menu
  }

  const [tradeOverlays, setTradeOverlays] = useState<TradeOverlay[]>([]);
  // Drag state for SL/TP lines
  // Ref for onSLTPDrag callback (prop may not be available in inner scope)
  const onSLTPDragRef = useRef<((key: string, type: 'sl'|'tp', price: number) => void) | undefined>(undefined);
  // Sync the prop to the ref so the drag handler can access it
  useEffect(() => { onSLTPDragRef.current = onSLTPDrag; }, [onSLTPDrag]);

  const [dragState, setDragState] = useState<{
    key: string; type: 'sl' | 'tp'; startY: number; currentY: number;
    originalPrice: number; positionKey: string;
  } | null>(null);
  const dragStateRef = useRef<typeof dragState>(null);
  useEffect(() => { dragStateRef.current = dragState; }, [dragState]);

  // ── Context Menu State (right-click on position) ──
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number;
    positionId: string;
    symbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    qty: number;
    stopLoss?: number;
    takeProfit?: number;
    source: string;
  } | null>(null);
  const contextMenuRef = useRef<typeof contextMenu>(null);
  useEffect(() => { contextMenuRef.current = contextMenu; }, [contextMenu]);

  // ── Modal State (professional dialog for SL/TP, Close, Details, Alert) ──
  const [modal, setModal] = useState<{
    type: 'modify_sltp' | 'close' | 'reverse' | 'alert' | 'details' | 'copy_id';
    title: string;
    positionData: {
      positionId: string;
      symbol: string;
      side: 'long' | 'short';
      entryPrice: number;
      qty: number;
      stopLoss?: number;
      takeProfit?: number;
      source: string;
    };
    // For input modals
    inputValue?: string;
    inputValue2?: string;
  } | null>(null);
  const modalRef = useRef<typeof modal>(null);
  useEffect(() => { modalRef.current = modal; }, [modal]);

  // ── Chart Context Menu State (right-click on chart canvas) ──
  const [chartContextMenu, setChartContextMenu] = useState<{
    x: number; y: number;
  } | null>(null);
  const [chartMenuPos, setChartMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [chartMenuDrag, setChartMenuDrag] = useState<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [chartSubMenu, setChartSubMenu] = useState<string | null>(null);

  // Fix: معالجة السحب على مستوى document (وليس على الـ backdrop)
  // حتى لا تتحرك القائمة مع كل حركة ماوس على الشارت
  useEffect(() => {
    if (!chartMenuDrag) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - chartMenuDrag.startX;
      const dy = e.clientY - chartMenuDrag.startY;
      setChartMenuPos({
        x: Math.max(0, Math.min(window.innerWidth - 250, chartMenuDrag.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 60, chartMenuDrag.origY + dy)),
      });
    };
    const handleUp = () => setChartMenuDrag(null);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [chartMenuDrag]);

  // Fix: lightweight-charts canvas يستهلك contextmenu event قبل الـ div.
  // الحل: attach event listener مع capture:true على الـ container.
  useEffect(() => {
    const container = chart.containerRef.current;
    if (!container) return;

    const handleContextMenu = (e: MouseEvent) => {
      // لا تفتح قائمة الشارت لو نقر المستخدم على:
      // 1. label صفقة (لها قائمتها الخاصة)
      const target = e.target as HTMLElement;
      if (target.closest('[data-trade-label]')) return;

      // 2. drawing menu (قائمة تعديل أداة الرسم — يديرها DrawingRenderer)
      if (target.closest('.roua-drawing-menu')) return;

      // 3. أداة رسم على الشارت — نترك الحدث يصل لـ DrawingRenderer
      // DrawingRenderer يفحص إذا كان النقر على رسم موجود ويعرض قائمته الخاصة.
      // لو لم يكن على رسم، DrawingRenderer يعود بدون فعل شيء، فنعرض قائمة الشارت.
      // لكن capture:true يلتقط الحدث قبل DrawingRenderer. الحل: لا نوقف الحدث،
      // نستخدم setTimeout لنرى ما إذا كان DrawingRenderer قد عرض قائمته.
      const hadDrawingMenu = document.querySelector('.roua-drawing-menu');

      // اسمح للحدث بالوصول لـ DrawingRenderer (لا stopPropagation)
      // لكن لا preventDefault أيضاً — دع DrawingRenderer يقرر
      // لو لم يعرض DrawingRenderer قائمته (no new .roua-drawing-menu after 50ms),
      // نعرض قائمة الشارت
      setTimeout(() => {
        const nowHasDrawingMenu = document.querySelector('.roua-drawing-menu');
        // لو لم تكن هناك قائمة رسم قبل ولا بعد → المستخدم نقر على فراغ → اعرض قائمة الشارت
        if (!hadDrawingMenu && !nowHasDrawingMenu) {
          const x = Math.min(e.clientX, window.innerWidth - 260);
          const y = Math.min(e.clientY, window.innerHeight - 400);
          setChartMenuPos({ x, y });
          setChartContextMenu({ x, y });
          setChartSubMenu(null);
        }
      }, 50);
    };

    // capture:true لكن بدون stopPropagation — يسمح لـ DrawingRenderer بالاستقبال
    container.addEventListener('contextmenu', handleContextMenu, true);
    return () => container.removeEventListener('contextmenu', handleContextMenu, true);
  }, [chart.containerRef]);

  const [fillZones, setFillZones] = useState<Array<{
    top: number; height: number; type: 'sl' | 'tp'; key: string;
    topPrice: number; bottomPrice: number;
  }>>([]);
  // PERF: Refs for overlay throttling — avoid re-rendering the entire 3000+ line
  // RouaChart component on every scroll frame. Instead of calling setState on
  // every rAF, we use direct DOM manipulation for position updates and only
  // setState when the structure changes (e.g. trades added/removed).
  const lastOverlayUpdateRef = useRef(0);
  const OVERLAY_THROTTLE_MS = 200; // 5fps is enough for label positions
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

  // Synchronous DOM update — يُستدعى مباشرة في onVisibleRangeChange بدون RAF
  // Updates both trade labels AND fill zones instantly via direct DOM manipulation.
  const syncOverlayPositions = useCallback(() => {
    const getPriceCoordinate = getPriceCoordinateRef.current;
    if (!getPriceCoordinate) return;
    const overlayContainer = document.querySelector('.roua-overlay-layer') as HTMLElement;
    if (!overlayContainer) return;
    // Update trade labels using data-price attributes
    const labels = overlayContainer.querySelectorAll('[data-trade-label]') as NodeListOf<HTMLElement>;
    labels.forEach(el => {
      const priceStr = el.getAttribute('data-price');
      if (!priceStr) return;
      const price = parseFloat(priceStr);
      if (!price || isNaN(price)) return;
      const y = getPriceCoordinate(price);
      if (y !== null) {
        el.style.transform = `translateY(${y - 24}px)`;
      }
    });
    // Update fill zones using data-top-price / data-bottom-price attributes
    const zoneEls = overlayContainer.querySelectorAll('[data-zone]') as NodeListOf<HTMLElement>;
    zoneEls.forEach(el => {
      const topPriceStr = el.getAttribute('data-top-price');
      const bottomPriceStr = el.getAttribute('data-bottom-price');
      if (!topPriceStr || !bottomPriceStr) return;
      const topY = getPriceCoordinate(parseFloat(topPriceStr));
      const bottomY = getPriceCoordinate(parseFloat(bottomPriceStr));
      if (topY !== null && bottomY !== null) {
        const top = Math.min(topY, bottomY);
        const height = Math.abs(bottomY - topY);
        el.style.top = top + 'px';
        el.style.height = Math.max(height, 1) + 'px';
      }
    });
    // Update candle countdown timer position using data-timer-price attribute
    // (set by PriceSyncedTimer component) — avoids dependency on currentPriceRef
    const timerEl = overlayContainer.querySelector('[data-candle-timer]') as HTMLElement | null;
    if (timerEl) {
      const timerPriceStr = timerEl.getAttribute('data-timer-price');
      const timerPrice = timerPriceStr ? parseFloat(timerPriceStr) : currentPriceRef.current;
      if (timerPrice && !isNaN(timerPrice)) {
        const timerY = getPriceCoordinate(timerPrice);
        if (timerY !== null) {
          // getPriceCoordinate returns the Y of the price on the price scale.
          // The price label (green/red box) is centered around this Y.
          // Label height is ~20px in lightweight-charts v5, so bottom edge = timerY + 10.
          // Place timer directly below with no gap (sticking to label).
          timerEl.style.top = (timerY + 10) + 'px';
          timerEl.style.display = 'flex';
        } else {
          timerEl.style.display = 'none';
        }
      }
    }
  }, []);

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
            symbol: prefix.startsWith('pos-') ? undefined : undefined, // set by caller
            stopLoss: sl, takeProfit: tp,
          });
        }

        // SL overlay — independent of entry visibility
        // V431: استخدم contractSize الصحيح من getContractSize (يدعم XAG, XAU, oil)
        const slContractSize = getContractSize(chartSymbol);
        const slQtyUnits = qty * slContractSize;
        if (slY !== null && sl) {
          const slPnl = (sl - entryPrice) * slQtyUnits * (direction === 'long' ? 1 : -1);
          overlays.push({
            key: `${prefix}sl`, y: slY, price: sl,
            type: 'sl', direction, source, qty,
            linePnl: slPnl,
          });
        }

        // TP overlay — independent of entry visibility
        if (tpY !== null && tp) {
          const tpPnl = (tp - entryPrice) * slQtyUnits * (direction === 'long' ? 1 : -1);
          overlays.push({
            key: `${prefix}tp`, y: tpY, price: tp,
            type: 'tp', direction, source, qty,
            linePnl: tpPnl,
          });
        }

        // Fill zones: only draw when both boundary lines are visible
        if (slY !== null && entryY !== null) {
          zones.push({
            top: Math.min(entryY!, slY!),
            height: Math.abs(entryY! - slY!),
            type: 'sl', key: `${prefix}sl-zone`,
            topPrice: Math.min(entryPrice, sl!),
            bottomPrice: Math.max(entryPrice, sl!),
          });
        }
        if (tpY !== null && entryY !== null) {
          zones.push({
            top: Math.min(entryY!, tpY),
            height: Math.abs(entryY! - tpY),
            type: 'tp', key: `${prefix}tp-zone`,
            topPrice: Math.min(entryPrice, tp!),
            bottomPrice: Math.max(entryPrice, tp!),
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
        // Fix: pos.qty قد يكون pos.quantity — نأخذ كلاهما
        const posQty = Number((pos as any).qty ?? (pos as any).quantity ?? 0);
        processTrade(
          entryPrice,
          (pos.side || '').toLowerCase() === 'long' ? 'long' : 'short',
          slVal > 0 ? slVal : undefined,
          tpVal > 0 ? tpVal : undefined,
          posQty, undefined, 'exchange',
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
                el.style.transform = `translateY(${ov.y - 24}px)`;
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
    let isDragging = false;
    let dragEndTimer: ReturnType<typeof setTimeout> | null = null;

    const onVisibleRangeChange = onVisibleRangeChangeRef.current;
    if (onVisibleRangeChange) {
      const handleRangeChange = () => {
        if (isDragging) {
          // During drag: direct DOM only — no React re-render (prevents dancing)
          syncOverlayPositions();
        } else {
          // Not dragging: safe to do full state sync
          syncOverlayPositions();
          scheduleOverlayUpdateRef.current();
        }
      };
      unsub = onVisibleRangeChange(handleRangeChange);
    }
    // Initial calculation with a small delay to ensure chart is rendered
    const timer = setTimeout(scheduleOverlayUpdate, 200);

    // Periodic overlay refresh to catch vertical price-scale changes
    // (lightweight-charts v5 has no priceScale subscribeVisiblePriceRangeChange)
    // During drag, we skip the full state update to prevent React re-render
    // which causes label dancing (labels jump between DOM-correct and state-old positions)
    const priceScaleInterval = setInterval(() => {
      if (!isDragging) {
        scheduleOverlayUpdateRef.current();
      } else {
        syncOverlayPositions();
      }
    }, 1000);

    // FIX: Detect price-scale drag (mouse wheel / pointer drag on price axis)
    const chartEl = chart.containerRef?.current as HTMLElement | null;
    let dragRaf = 0;

    const onPointerDown = () => {
      isDragging = true;
    };
    const onPointerUp = () => {
      isDragging = false;
      // After drag ends, do a full state sync with a small delay
      if (dragEndTimer) clearTimeout(dragEndTimer);
      dragEndTimer = setTimeout(() => {
        scheduleOverlayUpdateRef.current();
      }, 150);
    };
    const onPointerMove = () => {
      if (!isDragging) return;
      cancelAnimationFrame(dragRaf);
      dragRaf = requestAnimationFrame(() => {
        syncOverlayPositions(); // Direct DOM only — no React re-render
      });
    };
    const onWheel = () => {
      cancelAnimationFrame(dragRaf);
      dragRaf = requestAnimationFrame(() => {
        syncOverlayPositions(); // Direct DOM only during wheel scroll
      });
      // After wheel stops, sync state
      if (dragEndTimer) clearTimeout(dragEndTimer);
      dragEndTimer = setTimeout(() => {
        scheduleOverlayUpdateRef.current();
      }, 200);
    };

    if (chartEl) {
      chartEl.addEventListener('pointerdown', onPointerDown);
      chartEl.addEventListener('pointerup', onPointerUp);
      chartEl.addEventListener('pointermove', onPointerMove);
      chartEl.addEventListener('wheel', onWheel, { passive: true });
    }

    return () => {
      unsub?.(); clearTimeout(timer); clearInterval(priceScaleInterval);
      if (dragEndTimer) clearTimeout(dragEndTimer);
      cancelAnimationFrame(dragRaf);
      if (chartEl) {
        chartEl.removeEventListener('pointerdown', onPointerDown);
        chartEl.removeEventListener('pointerup', onPointerUp);
        chartEl.removeEventListener('pointermove', onPointerMove);
        chartEl.removeEventListener('wheel', onWheel);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps — stable refs used inside

  // ── Mount guard for rAF callbacks ──
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
      // H3 FIX: Destroy per-instance registry instead of global singleton.
      // In multi-chart mode, resetting the global singleton would destroy
      // overlays for ALL charts, not just this one.
      if (overlayRegistryInstanceRef.current) {
        overlayRegistryInstanceRef.current.destroy();
        overlayRegistryInstanceRef.current = null;
      }
      // Also reset legacy singleton for backward compat
      resetOverlayRegistry();
      resetFallbackEntryCache();
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
        addDesiredLine(`pos-entry-${pos.id || posSymbol}`, entryPrice, isLong ? '#00D4FF' : '#FF8C42', 3, 2, '', true);
      }
      const sl = Number(pos.stopLoss || pos.sl || 0);
      if (sl > 0) {
        const slLabel = `SL ${sl.toFixed(sl > 10 ? 2 : 5)}`;
        addDesiredLine(`pos-sl-${pos.id || posSymbol}`, sl, '#FF4757', 2, 1, '', true);
      }
      const tp = Number(pos.takeProfit || pos.tp || 0);
      if (tp > 0) {
        const tpLabel = `TP ${tp.toFixed(tp > 10 ? 2 : 5)}`;
        addDesiredLine(`pos-tp-${pos.id || posSymbol}`, tp, '#00FFA3', 2, 1, '', true);
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
      // Entry: السعر على المحور + label في tradeOverlays
      addDesiredLine(`trade-entry-grp-${key}`, entryPrice, isLong ? '#00D4FF' : '#FF8C42', 3, 2, '', true);
      if (trade.sl && Number(trade.sl) > 0) {
        const slP = ((Number(trade.sl) - entryPrice) * qty * (isLong ? 1 : -1));
        // السعر على محور السعر (axisLabelVisible:true) — label الجانب يأتي من tradeOverlays
        addDesiredLine(`trade-sl-grp-${key}`, Number(trade.sl), '#FF4757', 2, 1, '', true);
      }
      if (trade.tp && Number(trade.tp) > 0) {
        const tpP = ((Number(trade.tp) - entryPrice) * qty * (isLong ? 1 : -1));
        addDesiredLine(`trade-tp-grp-${key}`, Number(trade.tp), '#00FFA3', 2, 1, '', true);
      }
    });

    // ── DIFFING: Only add/remove lines that actually changed ──
    // This prevents "dancing" lines caused by removing and re-adding
    // lines that haven't changed.

    // 1. Remove lines that are no longer desired
    const existingIds = new Set<string>(positionLineIdsRef.current as string[]);
    for (const id of existingIds) {
      if (!desiredLines.has(id)) {
        removePriceLine(id as string);
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
      // FIX: Use pre-loaded overlayRegistryRef instead of require().
      // require() is CommonJS and doesn't work correctly with Next.js webpack
      // in client components. The overlayRegistryRef was already loaded at
      // mount time (line ~498-502).
      const registryMod = overlayRegistryRef.current;
      if (registryMod) {
        const reg = (overlayRegistryInstanceRef.current || registryMod.getOverlayRegistry());
        reg.setRemovePriceLine(removePriceLineRef.current);
        reg.clearAll();
        // H3 FIX: Destroy per-instance registry for symbol change
        if (overlayRegistryInstanceRef.current) {
          overlayRegistryInstanceRef.current.destroy();
          overlayRegistryInstanceRef.current = new registryMod.OverlayRegistry();
        }
        registryMod.resetOverlayRegistry();
        resetFallbackEntryCache();
      }
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
      const reg = (overlayRegistryInstanceRef.current || registryMod.getOverlayRegistry());
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
        const reg = (overlayRegistryInstanceRef.current || registryMod.getOverlayRegistry());
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
      const reg = (overlayRegistryInstanceRef.current || registryMod.getOverlayRegistry());
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
  
  const handlePlaceOrder = useCallback(async (order: any) => {
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

    // V229 UNIFIED EXECUTION: Send order to backend (NestJS) via /api/trading/orders
    // Previously, this handler only recorded the trade in the local Zustand store
    // (usePaperTradesStore), which meant:
    //   1. Trade was NOT persisted in DB (lost on F5)
    //   2. Trade was NOT monitored by PositionMonitor (V228 fix did not apply)
    //   3. Trade bypassed UnifiedRiskService validation
    //   4. Trade did not appear in the Positions page
    //
    // Now: We send the order to the SAME backend endpoint used by QuickExecutionMini.
    // The backend handles: risk checks, idempotency, paper/real execution, DB persistence,
    // and the order becomes visible to PositionMonitor (so V228 TP/SL peak capture applies).
    //
    // We still call addPaperTrade() as an OPTIMISTIC UPDATE so the chart UI reflects
    // the new position immediately (before the backend response arrives).

    // FIX: Use last candle close as fallback if entryPrice is 0 (e.g. user didn't fill the field)
    const lastClose = candlesRef.current[candlesRef.current.length - 1]?.close || 0;
    const resolvedEntryPrice = (order.entryPrice && order.entryPrice > 0) ? order.entryPrice : lastClose;

    // V229: Get the user's active credentialId from usePositionsStore.
    // This is the same source used by the rest of the dashboard (PortfolioMini, SmartExecutorPanel, etc.)
    // If the user has not selected an active account in Settings, we cannot submit to the backend
    // because /api/trading/orders requires credentialId.
    const activeCredentialId = usePositionsStore.getState().activeCredentialId;
    if (!activeCredentialId) {
      setOrderError('⚠️ يرجى اختيار حساب تداول نشط في الإعدادات أولاً');
      setTimeout(() => setOrderError(null), 5000);
      return;
    }

    // V229: Stop-loss is MANDATORY in the backend (UnifiedRiskService check #1).
    // If the user did not provide SL, block the order early with a clear message
    // instead of letting the backend reject it with a generic 400.
    if (!order.sl || Number(order.sl) <= 0) {
      setOrderError('⚠️ وقف الخسارة إجباري — يرجى تحديده قبل التنفيذ');
      setTimeout(() => setOrderError(null), 5000);
      return;
    }

    // V233 FIX: REMOVED optimistic addPaperTrade before backend confirmation.
    //
    // ROOT CAUSE of "trades stacking in one position" bug:
    //   Previously, addPaperTrade() was called BEFORE the fetch. If the backend
    //   rejected the order (e.g., existing position on same symbol — OrderDispatcher
    //   blocks this), the paper trade was STILL added to the local store.
    //   This created PHANTOM trades that accumulated:
    //     - DB: 1 real position
    //     - paperTrades store: 3 phantom entries (1 real + 2 rejected)
    //   AlpacaPositions deduplicates by symbol → shows 1 position.
    //   When user closes it, the next phantom appears, then the next, etc.
    //
    // FIX: Only add paper trade AFTER backend confirms success. On failure,
    // don't add anything — the error toast tells the user why it was rejected.
    //
    // The chart TP/SL lines will appear after refreshAfterTrade() fetches the
    // new DB position (~500ms). This is acceptable — the success toast appears
    // immediately, and the position lines appear shortly after.

    // ── Submit to backend ──
    try {
      const body: Record<string, any> = {
        credentialId: activeCredentialId,
        symbol:       selectedSymbol_,
        side:         order.side === 'buy' ? 'BUY' : 'SELL',
        type:         'MARKET',
        quantity:     Number(order.quantity),
        stopLoss:     Number(order.sl),
      };
      if (order.tp && Number(order.tp) > 0) body.takeProfit = Number(order.tp);
      if (resolvedEntryPrice && resolvedEntryPrice > 0) body.price = resolvedEntryPrice;

      const res = await fetch('/api/trading/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({} as any));

      if (j.success !== false && res.ok) {
        // V233: Only add paper trade AFTER backend confirms success.
        // This ensures the local store only has trades that actually exist in the DB.
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

        setOrderError(`✅ تم تنفيذ ${order.side === 'buy' ? 'شراء' : 'بيع'} ${order.quantity} ${selectedSymbol_}`);
        setTimeout(() => setOrderError(null), 3500);
        // Refresh positions store so the new position appears in the Positions page
        try { usePositionsStore.getState().refreshAfterTrade?.(); } catch { /* non-critical */ }
      } else {
        // V233: Backend rejected — DO NOT add paper trade. Show the error only.
        // Previously, the paper trade was already added (optimistic) and never removed,
        // creating phantom positions that showed up one-by-one on close.
        const reason = j.message || j.error || j.reason || 'فشل تنفيذ الأمر';
        setOrderError(`⚠️ ${reason}`);
        setTimeout(() => setOrderError(null), 6000);
      }
    } catch (err: any) {
      // V233: Network error — DO NOT add paper trade.
      setOrderError(`⚠️ خطأ في الاتصال: ${err?.message || err}`);
      setTimeout(() => setOrderError(null), 6000);
    }
  }, [selectedSymbol_, tc]);

  // ── Fetch Active Trading Signals (signalMarkers declared above) ──
  useEffect(() => {
    let cancelled = false;
    const fetchSignals = async () => {
      try {
        const [signals, briefs] = await Promise.all([
          fetchSignalsForChart(selectedSymbol_),
          fetchStrategicBriefs(selectedSymbol_, chartLocale),
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

    // Add news markers (not arrows — these are event markers)
    if (newsMarkers.length) {
      const newsChartMarkers = createNewsChartMarkers(newsMarkers);
      combinedMarkers.push(...newsChartMarkers);
    }

    // REMOVED: AI pattern arrows, trading signal arrows, strategic brief arrows,
    // and AI entry/exit arrows — all permanently removed per user request.
    // Only news markers remain on the chart.

    // Sort by time and apply
    combinedMarkers.sort((a, b) => (a.time as number) - (b.time as number));
    chart.setMarkers(combinedMarkers);
  // chart.setMarkers is stable (useCallback), safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsMarkers]);

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
            compact
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
            compact
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
      dir="ltr"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        direction: 'ltr',
        background: T.bg,
        // Active cell gets a bright border so the user knows which chart the toolbar controls
        outline: isGridCell && isActive ? '1.5px solid rgba(0,212,255,0.4)' : isGridCell ? '1px solid #1E2530' : 'none',
        outlineOffset: '-1px',
        borderRadius: isGridCell ? 4 : 0,
        overflow: 'hidden',
      }}
      className="roua-chart-root"
    >
      <ChartDiagOverlay connectionState={ws.connectionState} />
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
              borderRadius: 3, color: '#00D4FF', fontFamily: "var(--font-mono)",
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
                    fontFamily: "var(--font-mono)", fontSize: 8,
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
            <div style={{ fontSize: 9, color: '#4B5563', letterSpacing: 1, marginBottom: 8, textAlign: 'center', fontFamily: "var(--font-ar)" }}>
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
                      fontFamily: "var(--font-mono)",
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
              touchAction: 'none',
              WebkitUserSelect: 'none',
            }}
          />

          {/* Overlay Layer — ABOVE canvas so trade labels and fill zones are visible.
              pointerEvents: none on the container so chart interactions (drawing, crosshair) still work.
              Draggable SL/TP labels set pointerEvents: 'auto' to receive mouse events. */}
          <div className="roua-overlay-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 5 }}>

            {/* Symbol Watermark — REMOVED: name already shown in toolbar/CrosshairOverlay */}

            {/* ── Fill Zones (colored bands between entry-SL/TP) ── */}
            {fillZones.map(zone => (
              <div
                key={zone.key}
                data-zone={zone.key}
                data-top-price={zone.topPrice}
                data-bottom-price={zone.bottomPrice}
                style={{
                  position: 'absolute',
                  top: zone.top,
                  left: 0,
                  right: 0,
                  height: Math.max(zone.height, 1),
                  // SL zone: red gradient (danger zone)
                  // TP zone: green gradient (profit zone)
                  background: zone.type === 'sl'
                    ? 'rgba(248, 81, 73, 0.10)'
                    : 'rgba(63, 185, 80, 0.10)',
                  borderTop: zone.type === 'sl'
                    ? '1px dashed rgba(248, 81, 73, 0.35)'
                    : '1px dashed rgba(63, 185, 80, 0.35)',
                  borderBottom: zone.type === 'sl'
                    ? '1px dashed rgba(248, 81, 73, 0.35)'
                    : '1px dashed rgba(63, 185, 80, 0.35)',
                  pointerEvents: 'none',
                  zIndex: 2,
                  willChange: 'top, height',
                }}
              />
            ))}

            {/* ── Trade Line Labels — LEFT side HTML overlays ── */}
            {/* ── Trade Line Labels — redesigned ──
                Layout:
                - RIGHT axis: price value (via axisLabelVisible on createPriceLine)
                - LEFT side: label (SL/TP/Entry) + P&L, positioned ABOVE the line
                - SL/TP have drag handles for interactive adjustment */}
            {tradeOverlays.map(ov => {
              if (ov.y === null) return null;
              const isEntry = ov.type === 'entry';
              const isSL   = ov.type === 'sl';
              const isTP   = ov.type === 'tp';

              // Fix: أثناء السحب، استخدم currentY بدلاً من y الأصلي لتحريك الخط بصرياً
              let displayY = ov.y;
              if (dragState && dragState.key === ov.key && dragState.currentY !== dragState.startY) {
                displayY = ov.y + (dragState.currentY - dragState.startY);
              }

              const color = isEntry ? (ov.direction === 'long' ? '#00D4FF' : '#FF8C42')
                          : isSL   ? '#FF4757'
                          : '#00FFA3';
              const bgSolid = isEntry ? (ov.direction === 'long' ? 'rgba(0,212,255,0.25)' : 'rgba(255,140,66,0.25)')
                            : isSL   ? 'rgba(248,81,73,0.30)'
                            : 'rgba(0,255,163,0.25)';

              // Label text: SL / TP / Entry direction
              const typeLabel = isEntry
                ? (ov.direction === 'long' ? '▲ Entry' : '▼ Entry')
                : isSL ? 'SL' : 'TP';

              // P&L text for SL/TP
              const pnlText = !isEntry && ov.linePnl !== undefined
                ? ` ${ov.linePnl >= 0 ? '+' : ''}$${Math.abs(ov.linePnl).toFixed(2)}`
                : '';

              // Entry P&L: unrealized profit/loss based on current price
              // Fix: currentPrice قد يكون null — استخدم آخر سعر إغلاق كـ fallback
              // V431: استخدم contractSize الصحيح من getContractSize
              const effectivePrice = currentPrice || candlesRef.current[candlesRef.current.length - 1]?.close || 0;
              const ovSymbol = (ov as any).symbol || '';
              const ovContractSize = getContractSize(ovSymbol || selectedSymbol_);
              const ovQtyUnits = ov.qty * ovContractSize;
              const entryPnl = isEntry && ov.qty > 0 && effectivePrice > 0
                ? (effectivePrice - ov.price) * ovQtyUnits * (ov.direction === 'long' ? 1 : -1)
                : 0;
              // Fix: اعرض إشارة + للربح و - للخسارة
              const entryPnlText = isEntry && ov.qty > 0 && effectivePrice > 0
                ? ` ${entryPnl >= 0 ? '+' : '-'}$${Math.abs(entryPnl).toFixed(2)}`
                : '';

              const isDraggable = (isSL || isTP);

              return (
                <div key={ov.key} data-trade-label={ov.key} data-price={String(ov.price)} style={{
                  position: 'absolute',
                  top: 0,
                  left: 6,
                  zIndex: 15,
                  pointerEvents: isDraggable ? 'auto' : (isEntry ? 'auto' : 'none'),
                  touchAction: isDraggable ? 'none' : 'auto',
                  // Position ABOVE the line (label height ~20px + 4px gap)
                  // Fix: استخدم displayY أثناء السحب لتحريك الخط بصرياً
                  transform: `translateY(${displayY - 24}px)`,
                  willChange: 'transform',
                  cursor: isDraggable ? 'ns-resize' : (isEntry ? 'context-menu' : 'default'),
                  userSelect: 'none',
                }}
                  onMouseDown={isDraggable ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const posKey = ov.key.replace(/-(sl|tp)-.*$/, '');
                    setDragState({ key: ov.key, type: ov.type as 'sl'|'tp',
                      startY: e.clientY, currentY: e.clientY,
                      originalPrice: ov.price, positionKey: posKey });
                  } : undefined}
                  onContextMenu={isEntry ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Extract position data from the overlay
                    const positionId = ov.key.replace(/^pos-/, '').replace(/-entry$/, '');
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      positionId,
                      symbol: (ov as any).symbol || '',
                      side: ov.direction,
                      entryPrice: ov.price,
                      qty: ov.qty,
                      stopLoss: (ov as any).stopLoss,
                      takeProfit: (ov as any).takeProfit,
                      source: ov.source,
                    });
                  } : undefined}
                >
                  {/* Main label badge */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: bgSolid,
                    border: `1.5px solid ${color}`,
                    borderRadius: 4,
                    padding: '2px 7px 2px 6px',
                    boxShadow: `0 0 8px ${color}55, 0 2px 4px rgba(0,0,0,0.4)`,
                  }}>
                    <span style={{
                      color,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                      whiteSpace: 'nowrap',
                    }}>
                      {typeLabel}
                    </span>
                    {/* Entry P&L — unrealized profit/loss next to "Entry" label */}
                    {isEntry && entryPnlText && (
                      <span style={{
                        color: entryPnl >= 0 ? '#00FFA3' : '#FF4757',
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        borderLeft: `1px solid ${color}44`,
                        paddingLeft: 4,
                        marginLeft: 1,
                      }}>
                        {entryPnlText}
                      </span>
                    )}
                    {/* SL/TP P&L */}
                    {pnlText && (
                      <span style={{
                        color: ov.linePnl !== undefined && ov.linePnl >= 0 ? '#00FFA3' : '#FF4757',
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        borderLeft: `1px solid ${color}44`,
                        paddingLeft: 4,
                        marginLeft: 1,
                      }}>
                        {pnlText}
                      </span>
                    )}
                    {/* Drag handle icon for SL/TP */}
                    {isDraggable && (
                      <span style={{
                        color: color + 'AA',
                        fontSize: 8,
                        marginLeft: 2,
                        lineHeight: 1,
                      }}>⇕</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* ── Drag overlay: captures mouse during SL/TP drag ── */}
            {dragState && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 100,
                cursor: 'ns-resize', background: 'transparent',
                // Fix: pointerEvents: 'auto' ضروري لأن الـ parent overlay layer
                // لديه pointerEvents: 'none'. بدون هذا، onMouseMove/onMouseUp لا يعملان.
                pointerEvents: 'auto',
              }}
                onMouseMove={(e) => {
                  if (!dragStateRef.current) return;
                  setDragState(prev => prev ? { ...prev, currentY: e.clientY } : null);
                }}
                onMouseUp={(e) => {
                  if (!dragStateRef.current) return;
                  const ds = dragStateRef.current;
                  const deltaY = e.clientY - ds.startY;
                  if (Math.abs(deltaY) > 2) {
                    // Fix: استخدم getPriceCoordinateRef بدلاً من chart.getPriceCoordinate
                    // (chart قد يكون unstable reference)
                    const getPriceCoord = getPriceCoordinateRef.current;
                    if (getPriceCoord) {
                      const baseCoord = getPriceCoord(ds.originalPrice);
                      // Use 0.1% price change to estimate pixels-per-unit
                      const refCoord  = getPriceCoord(ds.originalPrice * 1.001);
                      if (baseCoord !== null && refCoord !== null) {
                        const pxPerUnit = Math.abs(baseCoord - refCoord) / (ds.originalPrice * 0.001);
                        if (pxPerUnit > 0) {
                          const priceChange = -deltaY / pxPerUnit;
                          const newPrice = Math.max(0.00001, ds.originalPrice + priceChange);
                          const decimals = ds.originalPrice > 100 ? 2 : ds.originalPrice > 1 ? 4 : 6;
                          onSLTPDragRef.current?.(ds.key, ds.type, parseFloat(newPrice.toFixed(decimals)));
                        }
                      }
                    }
                  }
                  setDragState(null);
                }}
                onMouseLeave={() => setDragState(null)}
              />
            )}

            {/* ── Context Menu (right-click on position) ── */}
            {/* Fix: استخدم createPortal لرفع القائمة لـ document.body —
                الـ overlay layer لديه pointerEvents: 'none' و الـ container يقطع fixed positioning */}
            {contextMenu && typeof document !== 'undefined' && createPortal(
              <>
                {/* Backdrop — closes menu on outside click */}
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 9998,
                  background: 'transparent',
                }}
                  onClick={() => setContextMenu(null)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
                />
                {/* Menu */}
                <div style={{
                  position: 'fixed',
                  left: Math.min(contextMenu.x, window.innerWidth - 220),
                  top: Math.min(contextMenu.y, window.innerHeight - 320),
                  zIndex: 9999,
                  minWidth: 200,
                  background: 'rgba(11, 14, 20, 0.98)',
                  border: '1px solid rgba(0, 212, 255, 0.25)',
                  borderRadius: 8,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 16px rgba(0,212,255,0.1)',
                  backdropFilter: 'blur(12px)',
                  padding: '4px 0',
                  fontFamily: 'var(--font-ar)',
                  overflow: 'hidden',
                }}>
                  {/* Header — position info + close button */}
                  <div style={{
                    padding: '6px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800,
                      color: contextMenu.side === 'long' ? '#00FFA3' : '#FF4757',
                      padding: '1px 5px', borderRadius: 3,
                      background: contextMenu.side === 'long' ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)',
                    }}>
                      {contextMenu.side === 'long' ? 'BUY' : 'SELL'}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#E0ECF8', fontFamily: 'var(--font-mono)' }}>
                      {contextMenu.symbol || '—'}
                    </span>
                    <span style={{ fontSize: 9, color: '#5A6A80', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
                      {contextMenu.qty} @ {contextMenu.entryPrice.toFixed(contextMenu.entryPrice > 100 ? 2 : 5)}
                    </span>
                    {/* Close button */}
                    <button
                      onClick={() => setContextMenu(null)}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: '#5A6A80', fontSize: 14, lineHeight: 1, padding: '0 2px',
                        marginLeft: 4,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#FF4757'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#5A6A80'; }}
                      title="إغلاق"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Menu items */}
                  {([
                    { icon: '✎', label: 'تعديل SL/TP', color: '#00D4FF', action: 'modify_sltp' },
                    { icon: '✕', label: 'إغلاق الصفقة', color: '#FF4757', action: 'close' },
                    { icon: '⇄', label: 'عكس الصفقة', color: '#FFB800', action: 'reverse' },
                    { divider: true },
                    { icon: '📊', label: 'فتح الشارت', color: '#00FFA3', action: 'focus_chart' },
                    { icon: '🔔', label: 'تنبيه على السعر', color: '#B388FF', action: 'alert' },
                    { divider: true },
                    { icon: 'ℹ', label: 'تفاصيل الصفقة', color: '#8B92A8', action: 'details' },
                    { icon: '📋', label: 'نسخ معرف الصفقة', color: '#8B92A8', action: 'copy_id' },
                  ] as Array<{ icon?: string; label?: string; color?: string; action?: string; divider?: boolean }>).map((item, i) => item.divider ? (
                    <div key={`div-${i}`} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                  ) : (
                    <div
                      key={item.action}
                      onClick={() => {
                        const cm = contextMenuRef.current;
                        if (!cm) return;
                        setContextMenu(null);

                        const posData = {
                          positionId: cm.positionId,
                          symbol: cm.symbol,
                          side: cm.side,
                          entryPrice: cm.entryPrice,
                          qty: cm.qty,
                          stopLoss: cm.stopLoss,
                          takeProfit: cm.takeProfit,
                          source: cm.source,
                        };

                        switch (item.action) {
                          case 'modify_sltp':
                            setModal({ type: 'modify_sltp', title: 'تعديل SL/TP', positionData: posData,
                              inputValue: cm.stopLoss?.toString() || '', inputValue2: cm.takeProfit?.toString() || '' });
                            break;
                          case 'close':
                            setModal({ type: 'close', title: 'تأكيد الإغلاق', positionData: posData });
                            break;
                          case 'reverse':
                            setModal({ type: 'reverse', title: 'تأكيد العكس', positionData: posData });
                            break;
                          case 'focus_chart':
                            break;
                          case 'alert':
                            setModal({ type: 'alert', title: 'تنبيه على السعر', positionData: posData,
                              inputValue: cm.entryPrice.toString() });
                            break;
                          case 'details':
                            setModal({ type: 'details', title: 'تفاصيل الصفقة', positionData: posData });
                            break;
                          case 'copy_id':
                            try { navigator.clipboard.writeText(cm.positionId); } catch {}
                            break;
                        }
                      }}
                      style={{
                        padding: '7px 12px',
                        display: 'flex', alignItems: 'center', gap: 8,
                        cursor: 'pointer',
                        color: '#C8D4E4',
                        fontSize: 11,
                        fontWeight: 600,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = `${item.color || '#8B92A8'}15`;
                        e.currentTarget.style.color = item.color || '#8B92A8';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#C8D4E4';
                      }}
                    >
                      <span style={{ fontSize: 12, width: 16, textAlign: 'center' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </>
              , document.body
            )}

            {/* ── Professional Modal Dialog (glassmorphism) ── */}
            {modal && typeof document !== 'undefined' && createPortal(
              <>
                {/* Backdrop — dimmed with blur */}
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 10000,
                  background: 'rgba(0, 0, 0, 0.6)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                }}
                  onClick={() => setModal(null)}
                />
                {/* Modal Container — centered */}
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 10001,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    pointerEvents: 'auto',
                    minWidth: 360, maxWidth: 440,
                    background: 'rgba(15, 18, 28, 0.98)',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    borderRadius: 16,
                    boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 32px rgba(0,212,255,0.15)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    overflow: 'hidden',
                    fontFamily: 'var(--font-ar)',
                    animation: 'modalSlideIn 0.2s ease-out',
                  }}>
                    {/* Modal Header */}
                    <div style={{
                      padding: '14px 18px',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'linear-gradient(180deg, rgba(0,212,255,0.06), transparent)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800,
                          color: modal.positionData.side === 'long' ? '#00FFA3' : '#FF4757',
                          padding: '2px 8px', borderRadius: 4,
                          background: modal.positionData.side === 'long' ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)',
                        }}>
                          {modal.positionData.side === 'long' ? 'BUY' : 'SELL'}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#E0ECF8', fontFamily: 'var(--font-mono)' }}>
                          {modal.positionData.symbol}
                        </span>
                      </div>
                      <button
                        onClick={() => setModal(null)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: '#5A6A80', fontSize: 16, lineHeight: 1, padding: '2px 6px',
                          borderRadius: 4,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#FF4757'; e.currentTarget.style.background = 'rgba(255,71,87,0.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#5A6A80'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Modal Title */}
                    <div style={{ padding: '10px 18px 4px' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#00D4FF' }}>
                        {modal.title}
                      </span>
                    </div>

                    {/* Modal Body — varies by type */}
                    <div style={{ padding: '8px 18px 16px' }}>

                      {/* ── Modify SL/TP ── */}
                      {modal.type === 'modify_sltp' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 11, color: '#8B92A8', display: 'block', marginBottom: 4 }}>
                              وقف الخسارة (SL)
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={modal.inputValue || ''}
                              onChange={(e) => setModal(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
                              placeholder="أدخل سعر SL"
                              style={{
                                width: '100%', padding: '8px 12px',
                                background: 'rgba(255,71,87,0.06)',
                                border: '1px solid rgba(255,71,87,0.25)',
                                borderRadius: 8, color: '#E0ECF8',
                                fontSize: 14, fontFamily: 'var(--font-mono)',
                                outline: 'none',
                              }}
                              onFocus={(e) => e.target.style.borderColor = 'rgba(255,71,87,0.5)'}
                              onBlur={(e) => e.target.style.borderColor = 'rgba(255,71,87,0.25)'}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: '#8B92A8', display: 'block', marginBottom: 4 }}>
                              أخذ الربح (TP)
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={modal.inputValue2 || ''}
                              onChange={(e) => setModal(prev => prev ? { ...prev, inputValue2: e.target.value } : null)}
                              placeholder="أدخل سعر TP"
                              style={{
                                width: '100%', padding: '8px 12px',
                                background: 'rgba(0,255,163,0.06)',
                                border: '1px solid rgba(0,255,163,0.25)',
                                borderRadius: 8, color: '#E0ECF8',
                                fontSize: 14, fontFamily: 'var(--font-mono)',
                                outline: 'none',
                              }}
                              onFocus={(e) => e.target.style.borderColor = 'rgba(0,255,163,0.5)'}
                              onBlur={(e) => e.target.style.borderColor = 'rgba(0,255,163,0.25)'}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button
                              onClick={() => setModal(null)}
                              style={{
                                flex: 1, padding: '8px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, color: '#8B92A8',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'var(--font-ar)',
                              }}
                            >
                              إلغاء
                            </button>
                            <button
                              onClick={async () => {
                                const m = modalRef.current;
                                if (!m) return;
                                const body: any = {};
                                if (m.inputValue && m.inputValue.trim()) body.stopLoss = parseFloat(m.inputValue);
                                if (m.inputValue2 && m.inputValue2.trim()) body.takeProfit = parseFloat(m.inputValue2);
                                if (Object.keys(body).length > 0) {
                                  try {
                                    await fetch(`/api/trading/positions/${m.positionData.positionId}/levels`, {
                                      method: 'POST', credentials: 'include',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(body),
                                    });
                                  } catch (err) { console.error('Modify SL/TP failed:', err); }
                                }
                                setModal(null);
                              }}
                              style={{
                                flex: 1, padding: '8px',
                                background: 'rgba(0,212,255,0.12)',
                                border: '1px solid rgba(0,212,255,0.4)',
                                borderRadius: 8, color: '#00D4FF',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'var(--font-ar)',
                              }}
                            >
                              حفظ
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── Close Position ── */}
                      {modal.type === 'close' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{
                            padding: '10px 12px', borderRadius: 8,
                            background: 'rgba(255,71,87,0.08)',
                            border: '1px solid rgba(255,71,87,0.2)',
                            fontSize: 12, color: '#C8D4E4', lineHeight: 1.6,
                          }}>
                            هل أنت متأكد من إغلاق صفقة <strong style={{ color: '#E0ECF8' }}>{modal.positionData.symbol}</strong>؟
                            <br />
                            <span style={{ fontSize: 10, color: '#5A6A80' }}>
                              الحجم: {modal.positionData.qty} @ {modal.positionData.entryPrice.toFixed(modal.positionData.entryPrice > 100 ? 2 : 5)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => setModal(null)}
                              style={{
                                flex: 1, padding: '8px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, color: '#8B92A8',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'var(--font-ar)',
                              }}
                            >
                              إلغاء
                            </button>
                            <button
                              onClick={async () => {
                                const m = modalRef.current;
                                if (!m) return;
                                try {
                                  await fetch(`/api/trading/positions/${m.positionData.positionId}/close`, {
                                    method: 'POST', credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ closeReason: 'MANUAL' }),
                                  });
                                } catch (err) { console.error('Close failed:', err); }
                                setModal(null);
                              }}
                              style={{
                                flex: 1, padding: '8px',
                                background: 'rgba(255,71,87,0.15)',
                                border: '1px solid rgba(255,71,87,0.4)',
                                borderRadius: 8, color: '#FF4757',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'var(--font-ar)',
                              }}
                            >
                              تأكيد الإغلاق
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── Reverse Position ── */}
                      {modal.type === 'reverse' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{
                            padding: '10px 12px', borderRadius: 8,
                            background: 'rgba(255,184,0,0.08)',
                            border: '1px solid rgba(255,184,0,0.2)',
                            fontSize: 12, color: '#C8D4E4', lineHeight: 1.6,
                          }}>
                            تأكيد عكس صفقة <strong style={{ color: '#E0ECF8' }}>{modal.positionData.symbol}</strong>؟
                            <br />
                            <span style={{ fontSize: 10, color: '#5A6A80' }}>
                              سيُغلق المركز الحالي ({modal.positionData.side === 'long' ? 'شراء' : 'بيع'}) ويُفتح مركز عكسي بنفس الحجم.
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => setModal(null)}
                              style={{
                                flex: 1, padding: '8px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, color: '#8B92A8',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'var(--font-ar)',
                              }}
                            >
                              إلغاء
                            </button>
                            <button
                              onClick={async () => {
                                const m = modalRef.current;
                                if (!m) return;
                                try {
                                  await fetch(`/api/trading/positions/${m.positionData.positionId}/close`, {
                                    method: 'POST', credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ closeReason: 'REVERSE' }),
                                  });
                                  const reverseSide = m.positionData.side === 'long' ? 'SELL' : 'BUY';
                                  await fetch('/api/trading/orders', {
                                    method: 'POST', credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      symbol: m.positionData.symbol, side: reverseSide, type: 'MARKET',
                                      quantity: m.positionData.qty, source: 'user_manual',
                                    }),
                                  });
                                } catch (err) { console.error('Reverse failed:', err); }
                                setModal(null);
                              }}
                              style={{
                                flex: 1, padding: '8px',
                                background: 'rgba(255,184,0,0.15)',
                                border: '1px solid rgba(255,184,0,0.4)',
                                borderRadius: 8, color: '#FFB800',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'var(--font-ar)',
                              }}
                            >
                              تأكيد العكس
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── Price Alert ── */}
                      {modal.type === 'alert' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 11, color: '#8B92A8', display: 'block', marginBottom: 4 }}>
                              سعر التنبيه
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={modal.inputValue || ''}
                              onChange={(e) => setModal(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
                              placeholder="أدخل السعر"
                              style={{
                                width: '100%', padding: '8px 12px',
                                background: 'rgba(179,136,255,0.06)',
                                border: '1px solid rgba(179,136,255,0.25)',
                                borderRadius: 8, color: '#E0ECF8',
                                fontSize: 14, fontFamily: 'var(--font-mono)',
                                outline: 'none',
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => setModal(null)}
                              style={{
                                flex: 1, padding: '8px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, color: '#8B92A8',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'var(--font-ar)',
                              }}
                            >
                              إلغاء
                            </button>
                            <button
                              onClick={async () => {
                                const m = modalRef.current;
                                if (!m || !m.inputValue) return;
                                try {
                                  await fetch('/api/price-alerts', {
                                    method: 'POST', credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      symbol: m.positionData.symbol, price: parseFloat(m.inputValue),
                                      condition: 'above',
                                    }),
                                  });
                                } catch (err) { console.error('Alert failed:', err); }
                                setModal(null);
                              }}
                              style={{
                                flex: 1, padding: '8px',
                                background: 'rgba(179,136,255,0.15)',
                                border: '1px solid rgba(179,136,255,0.4)',
                                borderRadius: 8, color: '#B388FF',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'var(--font-ar)',
                              }}
                            >
                              إنشاء التنبيه
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── Position Details ── */}
                      {modal.type === 'details' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {[
                            { label: 'الزوج', value: modal.positionData.symbol, color: '#E0ECF8' },
                            { label: 'الاتجاه', value: modal.positionData.side === 'long' ? 'شراء ▲' : 'بيع ▼', color: modal.positionData.side === 'long' ? '#00FFA3' : '#FF4757' },
                            { label: 'سعر الدخول', value: modal.positionData.entryPrice.toString(), color: '#E0ECF8' },
                            { label: 'الحجم', value: modal.positionData.qty.toString(), color: '#E0ECF8' },
                            { label: 'وقف الخسارة', value: modal.positionData.stopLoss?.toString() || '—', color: '#FF4757' },
                            { label: 'أخذ الربح', value: modal.positionData.takeProfit?.toString() || '—', color: '#00FFA3' },
                            { label: 'المصدر', value: modal.positionData.source || '—', color: '#8B92A8' },
                            { label: 'المعرف', value: modal.positionData.positionId, color: '#5A6A80', mono: true },
                          ].map((row, i) => (
                            <div key={i} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '6px 10px', borderRadius: 6,
                              background: 'rgba(255,255,255,0.02)',
                            }}>
                              <span style={{ fontSize: 11, color: '#5A6A80' }}>{row.label}</span>
                              <span style={{
                                fontSize: 12, fontWeight: 600, color: row.color,
                                fontFamily: row.mono ? 'var(--font-mono)' : 'var(--font-ar)',
                                maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {row.value}
                              </span>
                            </div>
                          ))}
                          <button
                            onClick={() => setModal(null)}
                            style={{
                              marginTop: 8, padding: '8px',
                              background: 'rgba(0,212,255,0.12)',
                              border: '1px solid rgba(0,212,255,0.4)',
                              borderRadius: 8, color: '#00D4FF',
                              fontSize: 11, fontWeight: 700, cursor: 'pointer',
                              fontFamily: 'var(--font-ar)',
                            }}
                          >
                            إغلاق
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                </div>
                <style>{`
                  @keyframes modalSlideIn {
                    from { opacity: 0; transform: scale(0.95) translateY(-10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                  }
                `}</style>
              </>
              , document.body
            )}

            {/* ── Chart Context Menu (right-click on chart) — redesigned ── */}
            {/* ── Chart Context Menu v3 (right-click on chart) ── */}
            {chartContextMenu && typeof document !== 'undefined' && createPortal(
              <>
                {/* Backdrop — NO blur, NO dim, chart stays fully visible */}
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 9998,
                  background: 'transparent',
                }}
                  onClick={() => { setChartContextMenu(null); setChartSubMenu(null); }}
                  onContextMenu={(e) => { e.preventDefault(); setChartContextMenu(null); setChartSubMenu(null); }}
                />
                {/* Menu — draggable from header only */}
                <div style={{
                  position: 'fixed',
                  left: chartMenuPos.x,
                  top: chartMenuPos.y,
                  zIndex: 9999,
                  width: 240,
                  background: 'rgba(11, 14, 20, 0.98)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  borderRadius: 12,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 24px rgba(0,212,255,0.12)',
                  backdropFilter: 'blur(20px)',
                  overflow: 'visible',
                  fontFamily: 'var(--font-ar)',
                  animation: 'panelSlideIn 0.15s ease-out',
                }}>
                  {/* Drag Handle Header — فقط من هنا تُسحب القائمة */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setChartMenuDrag({
                        startX: e.clientX, startY: e.clientY,
                        origX: chartMenuPos.x, origY: chartMenuPos.y,
                      });
                    }}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', gap: 6,
                      cursor: chartMenuDrag ? 'grabbing' : 'grab',
                      background: 'linear-gradient(180deg, rgba(0,212,255,0.06), transparent)',
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ fontSize: 10, color: 'rgba(0,212,255,0.4)' }}>⠿</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#00D4FF' }}>
                      {tc('chartContextMenu.title')}
                    </span>
                    <button
                      onClick={() => { setChartContextMenu(null); setChartSubMenu(null); }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: '#5A6A80', fontSize: 14, lineHeight: 1, padding: '0 2px', marginLeft: 'auto',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#FF4757'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#5A6A80'; }}
                    >✕</button>
                  </div>

                  {/* Menu Body */}
                  <div style={{ padding: '4px 0', position: 'relative' }}>

                    {/* ── Submenu: Chart Type ── */}
                    <div
                      onMouseEnter={() => setChartSubMenu('chartType')}
                      style={{
                        padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8,
                        cursor: 'pointer', color: '#C8D4E4', fontSize: 11, fontWeight: 600,
                        background: chartSubMenu === 'chartType' ? 'rgba(0,212,255,0.1)' : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 13, width: 18, textAlign: 'center' }}>📊</span>
                      <span style={{ flex: 1 }}>{tc('chartType')}</span>
                      <span style={{ fontSize: 8, color: '#5A6A80' }}>{chart.settings.type === 'heikin-ashi' ? 'Heikin' : chart.settings.type}</span>
                      <span style={{ fontSize: 8, color: '#5A6A80' }}>▶</span>
                    </div>
                    {chartSubMenu === 'chartType' && (
                      <div style={{
                        position: 'absolute', left: '100%', top: 0, marginLeft: 4, width: 170,
                        background: 'rgba(11, 14, 20, 0.98)', border: '1px solid rgba(0, 212, 255, 0.25)',
                        borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: '4px 0',
                      }}>
                        {([
                          { type: 'candle', label: tc('chartContextMenu.chartTypeCandle'), icon: '🕯' },
                          { type: 'hollow', label: tc('chartContextMenu.chartTypeHollow'), icon: '⬜' },
                          { type: 'bar', label: tc('chartContextMenu.chartTypeBar'), icon: '▬' },
                          { type: 'line', label: tc('chartContextMenu.chartTypeLine'), icon: '／' },
                          { type: 'area', label: tc('chartContextMenu.chartTypeArea'), icon: '◢' },
                          { type: 'heikin-ashi', label: tc('chartContextMenu.chartTypeHeikin'), icon: '⬛' },
                        ] as const).map(ct => (
                          <div key={ct.type} onClick={() => { chart.setChartType(ct.type); setChartContextMenu(null); setChartSubMenu(null); }}
                            style={{
                              padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
                              cursor: 'pointer', fontSize: 11, fontWeight: 600,
                              color: chart.settings.type === ct.type ? '#00D4FF' : '#C8D4E4',
                              background: chart.settings.type === ct.type ? 'rgba(0,212,255,0.1)' : 'transparent',
                            }}
                            onMouseEnter={(e) => { if (chart.settings.type !== ct.type) { e.currentTarget.style.background = 'rgba(0,212,255,0.06)'; e.currentTarget.style.color = '#00D4FF'; } }}
                            onMouseLeave={(e) => { if (chart.settings.type !== ct.type) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C8D4E4'; } }}>
                            <span style={{ fontSize: 12, width: 16, textAlign: 'center' }}>{ct.icon}</span>
                            <span style={{ flex: 1 }}>{ct.label}</span>
                            {chart.settings.type === ct.type && <span style={{ fontSize: 9, color: '#00D4FF' }}>✓</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Submenu: Timeframes ── */}
                    <div
                      onMouseEnter={() => setChartSubMenu('timeframe')}
                      style={{
                        padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8,
                        cursor: 'pointer', color: '#C8D4E4', fontSize: 11, fontWeight: 600,
                        background: chartSubMenu === 'timeframe' ? 'rgba(0,212,255,0.1)' : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 13, width: 18, textAlign: 'center' }}>⏱</span>
                      <span style={{ flex: 1 }}>{tc('timeframe') || 'Timeframe'}</span>
                      <span style={{ fontSize: 8, color: '#5A6A80' }}>{timeframe_}</span>
                      <span style={{ fontSize: 8, color: '#5A6A80' }}>▶</span>
                    </div>
                    {chartSubMenu === 'timeframe' && (
                      <div style={{
                        position: 'absolute', left: '100%', top: 32, marginLeft: 4, width: 140,
                        background: 'rgba(11, 14, 20, 0.98)', border: '1px solid rgba(0, 212, 255, 0.25)',
                        borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: '4px 0',
                        maxHeight: 280, overflowY: 'auto',
                        scrollbarWidth: 'thin',
                        scrollbarColor: 'rgba(0,212,255,0.3) transparent',
                      }}
                      className="custom-scrollbar">
                        {TIMEFRAMES.filter(tf => tf.category !== 'seconds').map(tf => (
                          <div key={tf.value} onClick={() => { setTimeframe(tf.value); setChartContextMenu(null); setChartSubMenu(null); }}
                            style={{
                              padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 8,
                              cursor: 'pointer', fontSize: 11, fontWeight: 600,
                              color: timeframe_ === tf.value ? '#00D4FF' : '#C8D4E4',
                              background: timeframe_ === tf.value ? 'rgba(0,212,255,0.1)' : 'transparent',
                            }}
                            onMouseEnter={(e) => { if (timeframe_ !== tf.value) { e.currentTarget.style.background = 'rgba(0,212,255,0.06)'; e.currentTarget.style.color = '#00D4FF'; } }}
                            onMouseLeave={(e) => { if (timeframe_ !== tf.value) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C8D4E4'; } }}>
                            <span style={{ flex: 1 }}>{tf.label}</span>
                            {timeframe_ === tf.value && <span style={{ fontSize: 9, color: '#00D4FF' }}>✓</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />

                    {/* ── Tools ── */}
                    {([
                      { icon: '📐', label: tc('chartContextMenu.drawingTools'), color: '#00FFA3', action: 'drawing_tools' },
                      { icon: '📈', label: tc('chartContextMenu.indicators'), color: '#B388FF', action: 'indicators' },
                      { icon: '🤖', label: tc('chartContextMenu.aiAnalysis') || 'AI Analysis', color: '#FF6B35', action: 'ai_analysis' },
                      { icon: '⚙', label: tc('chartContextMenu.settings'), color: '#8B92A8', action: 'settings' },
                    ] as const).map(item => (
                      <div key={item.action}
                        onClick={() => {
                          if (item.action === 'drawing_tools') { setShowDrawingPanel(prev => !prev); setChartContextMenu(null); }
                          else if (item.action === 'indicators') { setShowIndicatorPanel(prev => !prev); setChartContextMenu(null); }
                          else if (item.action === 'settings') { setShowSettingsPanel(prev => !prev); setChartContextMenu(null); }
                          else if (item.action === 'ai_analysis') { window.location.href = '/dashboard/autonomous-trader'; setChartContextMenu(null); }
                        }}
                        style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#C8D4E4', fontSize: 11, fontWeight: 600 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${item.color}15`; e.currentTarget.style.color = item.color; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C8D4E4'; }}>
                        <span style={{ fontSize: 13, width: 18, textAlign: 'center' }}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                    ))}

                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />

                    {/* ── View (zoom in/out merged into one row + pause) ── */}
                    <div style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div onClick={() => { chart.zoomIn(); }} style={{ flex: 1, textAlign: 'center', padding: '3px 0', borderRadius: 4, cursor: 'pointer', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00D4FF', fontSize: 11, fontWeight: 700 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.08)'; }}>
                        {tc('chartContextMenu.zoomIn')}
                      </div>
                      <div onClick={() => { chart.zoomOut(); }} style={{ flex: 1, textAlign: 'center', padding: '3px 0', borderRadius: 4, cursor: 'pointer', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00D4FF', fontSize: 11, fontWeight: 700 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.08)'; }}>
                        {tc('chartContextMenu.zoomOut')}
                      </div>
                    </div>
                    <div
                      onClick={() => { chart.togglePause(); setChartContextMenu(null); }}
                      style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#C8D4E4', fontSize: 11, fontWeight: 600 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = chart.isPaused ? 'rgba(0,255,163,0.1)' : 'rgba(255,184,0,0.1)'; e.currentTarget.style.color = chart.isPaused ? '#00FFA3' : '#FFB800'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C8D4E4'; }}>
                      <span style={{ fontSize: 13, width: 18, textAlign: 'center' }}>{chart.isPaused ? '▶' : '⏸'}</span>
                      <span>{chart.isPaused ? tc('chartContextMenu.resume') : tc('chartContextMenu.pause')}</span>
                    </div>

                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />

                    {/* ── Trading ── */}
                    {([
                      { icon: '⚡', label: tc('chartContextMenu.tradingPanel'), color: '#00FFA3', action: 'trading_panel' },
                      { icon: '🔔', label: tc('chartContextMenu.addAlert'), color: '#B388FF', action: 'add_alert' },
                    ] as const).map(item => (
                      <div key={item.action}
                        onClick={() => {
                          setChartContextMenu(null);
                          if (item.action === 'trading_panel') setShowChartTrading(prev => !prev);
                          else if (item.action === 'add_alert') {
                            const price = currentPrice || candlesRef.current[candlesRef.current.length - 1]?.close || 0;
                            if (price > 0) {
                              const ap = prompt('Alert price:', price.toString());
                              if (ap) fetch('/api/price-alerts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: selectedSymbol_, price: parseFloat(ap), condition: 'above' }) }).catch(() => {});
                            }
                          }
                        }}
                        style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#C8D4E4', fontSize: 11, fontWeight: 600 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${item.color}15`; e.currentTarget.style.color = item.color; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C8D4E4'; }}>
                        <span style={{ fontSize: 13, width: 18, textAlign: 'center' }}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                    ))}

                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />

                    {/* ── Templates & Utilities ── */}
                    <div
                      onClick={() => {
                        const name = prompt('Template name:', `Template_${Date.now()}`);
                        if (name) { chart.saveTemplate(name); }
                        setChartContextMenu(null);
                      }}
                      style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#C8D4E4', fontSize: 11, fontWeight: 600 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,255,163,0.1)'; e.currentTarget.style.color = '#00FFA3'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C8D4E4'; }}>
                      <span style={{ fontSize: 13, width: 18, textAlign: 'center' }}>💾</span>
                      <span>{tc('chartContextMenu.saveTemplate') || 'Save Template'}</span>
                    </div>
                    {([
                      { icon: '📸', label: tc('chartContextMenu.screenshot'), color: '#8B92A8', action: 'screenshot' },
                      { icon: '🔄', label: tc('chartContextMenu.resetChart'), color: '#FF4757', action: 'reset_chart' },
                    ] as const).map(item => (
                      <div key={item.action}
                        onClick={() => {
                          setChartContextMenu(null);
                          if (item.action === 'screenshot') {
                            const canvas = chart.containerRef.current?.querySelector('canvas');
                            if (canvas) { const link = document.createElement('a'); link.download = `chart_${selectedSymbol_}_${Date.now()}.png`; link.href = canvas.toDataURL(); link.click(); }
                          } else if (item.action === 'reset_chart') { chart.zoomOut(); setTimeout(() => chart.zoomIn(), 50); }
                        }}
                        style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#C8D4E4', fontSize: 11, fontWeight: 600 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${item.color}15`; e.currentTarget.style.color = item.color; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C8D4E4'; }}>
                        <span style={{ fontSize: 13, width: 18, textAlign: 'center' }}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
              , document.body
            )}

            {/* Volume Profile rendered as overlay below */}

          {/* ── Quick Trade Widget — MetaTrader 5 One-Click Trading Panel ── */}
          {!mobile && currentPrice && (() => {
            const resolvedPrice = (typeof currentPrice === 'number' && currentPrice > 0) ? currentPrice : (candlesRef.current[candlesRef.current.length - 1]?.close || 0);
            const spreadVal = resolvedPrice * 0.0005;
            const pDec = resolvedPrice > 1000 ? 2 : resolvedPrice > 1 ? 4 : 6;
            const bid = resolvedPrice - spreadVal / 2;
            const ask = resolvedPrice + spreadVal / 2;

            // ── Collapsed: MT5 One-Click Panel (SELL | ▼ Vol ▲ | BUY) ──
            if (tradePanelCollapsed) {
              return (
                <div
                  className="roua-quick-trade"
                  style={{
                    position: 'absolute',
                    top: 32,
                    left: 10,
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: 0,
                    borderRadius: 5,
                    background: 'rgba(18,18,22,0.96)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                    pointerEvents: (chart.activeTool === 'cursor' && !mobile) ? 'auto' : 'none',
                    overflow: 'hidden',
                    fontFamily: "var(--font-mono)",
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  {/* SELL button with BID price */}
                  <button
                    onClick={() => {
                      const { addTrade } = usePaperTradesStore.getState();
                      handlePlaceOrder({ side: 'sell', quantity: lotSize, entryPrice: resolvedPrice, sl: resolvedPrice * 1.02, tp: resolvedPrice * 0.98 });
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '5px 10px 4px',
                      background: 'linear-gradient(180deg, #FF5252 0%, #D32F2F 50%, #B71C1C 100%)',
                      border: 'none',
                      borderRight: '1px solid rgba(0,0,0,0.3)',
                      color: '#FFF',
                      cursor: 'pointer',
                      minWidth: 60,
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                  >
                    <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, lineHeight: 1 }}>SELL</span>
                    <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.3, marginTop: 1 }}>{bid.toFixed(pDec)}</span>
                  </button>
                  {/* Volume with ▲▼ arrows */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px 3px',
                    background: 'rgba(30,30,36,0.95)',
                    minWidth: 40,
                  }}>
                    <button
                      onClick={() => setLotSize(prev => +(prev + 0.01).toFixed(2))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#AAA',
                        cursor: 'pointer',
                        fontSize: 7,
                        lineHeight: 1,
                        padding: '0 0 1px',
                        display: 'block',
                      }}
                    >▲</button>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: '#FFF',
                      lineHeight: 1.2,
                      padding: '0 2px',
                    }}>{lotSize.toFixed(2)}</span>
                    <button
                      onClick={() => setLotSize(prev => Math.max(0.01, +(prev - 0.01).toFixed(2)))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#AAA',
                        cursor: 'pointer',
                        fontSize: 7,
                        lineHeight: 1,
                        padding: '1px 0 0',
                        display: 'block',
                      }}
                    >▼</button>
                  </div>
                  {/* BUY button with ASK price */}
                  <button
                    onClick={() => {
                      const { addTrade } = usePaperTradesStore.getState();
                      handlePlaceOrder({ side: 'buy', quantity: lotSize, entryPrice: resolvedPrice, sl: resolvedPrice * 0.98, tp: resolvedPrice * 1.02 });
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '5px 10px 4px',
                      background: 'linear-gradient(180deg, #69F0AE 0%, #00C853 50%, #009624 100%)',
                      border: 'none',
                      borderLeft: '1px solid rgba(0,0,0,0.3)',
                      color: '#FFF',
                      cursor: 'pointer',
                      minWidth: 60,
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                  >
                    <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, lineHeight: 1 }}>BUY</span>
                    <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.3, marginTop: 1 }}>{ask.toFixed(pDec)}</span>
                  </button>
                  {/* Expand button */}
                  <button
                    onClick={() => setTradePanelCollapsed(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 5px',
                      background: 'rgba(255,255,255,0.06)',
                      border: 'none',
                      borderLeft: '1px solid rgba(255,255,255,0.06)',
                      color: '#888',
                      cursor: 'pointer',
                      fontSize: 9,
                      transition: 'color 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#FFF'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#888'; }}
                  >▸</button>
                </div>
              );
            }

            // ── Expanded: MT5-Style Execution Panel (Dark Theme) ──
            const execPrice = tradeSide === 'buy' ? ask : bid;
            return (
              <div
                className="roua-quick-trade"
                style={{
                  position: 'absolute',
                  top: 32,
                  left: 10,
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 6,
                  background: 'rgba(18,18,22,0.97)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                  overflow: 'hidden',
                  pointerEvents: (chart.activeTool === 'cursor' && !mobile) ? 'auto' : 'none',
                  width: 220,
                  fontFamily: "var(--font-mono)",
                  backdropFilter: 'blur(12px)',
                }}
              >
                {/* ── Header: Symbol + Collapse ── */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px 5px',
                  background: 'rgba(255,255,255,0.03)',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <span style={{ fontSize: 12, color: '#FFF', fontWeight: 800, letterSpacing: 0.5 }}>{selectedSymbol_}</span>
                  <button
                    onClick={() => setTradePanelCollapsed(true)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: 'none',
                      color: '#888',
                      cursor: 'pointer',
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >▾</button>
                </div>

                {/* ── BID / ASK Display ── */}
                <div style={{
                  display: 'flex',
                  padding: '7px 10px 5px',
                  gap: 4,
                }}>
                  <div style={{ flex: 1, textAlign: 'center' as const }}>
                    <div style={{ fontSize: 7, color: '#FF5252', fontWeight: 700, letterSpacing: 1 }}>BID</div>
                    <div style={{ fontSize: 16, color: '#FF5252', fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.2 }}>{bid.toFixed(pDec)}</div>
                  </div>
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
                  <div style={{ flex: 1, textAlign: 'center' as const }}>
                    <div style={{ fontSize: 7, color: '#69F0AE', fontWeight: 700, letterSpacing: 1 }}>ASK</div>
                    <div style={{ fontSize: 16, color: '#69F0AE', fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.2 }}>{ask.toFixed(pDec)}</div>
                  </div>
                </div>

                {/* ── Spread ── */}
                <div style={{
                  textAlign: 'center' as const,
                  padding: '0 10px 6px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <span style={{ fontSize: 7, color: '#555', letterSpacing: 1 }}>SPREAD </span>
                  <span style={{ fontSize: 8, color: '#888', fontWeight: 700 }}>
                    {pDec <= 2 ? spreadVal.toFixed(1) : Math.round(spreadVal * Math.pow(10, pDec))}
                  </span>
                </div>

                {/* ── Order Type Tabs: Market / Limit / Stop ── */}
                <div style={{
                  display: 'flex',
                  padding: '5px 10px 0',
                  gap: 2,
                }}>
                  {(['market', 'limit', 'stop'] as const).map(ot => (
                    <button
                      key={ot}
                      onClick={() => setOrderType(ot)}
                      style={{
                        flex: 1,
                        padding: '4px 0',
                        background: orderType === ot ? 'rgba(255,255,255,0.08)' : 'transparent',
                        border: orderType === ot ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                        borderRadius: '3px 3px 0 0',
                        color: orderType === ot ? '#FFF' : '#555',
                        fontSize: 9,
                        fontWeight: orderType === ot ? 800 : 600,
                        cursor: 'pointer',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase' as const,
                        transition: 'all 0.1s ease',
                      }}
                    >{ot}</button>
                  ))}
                </div>

                {/* ── Form Area ── */}
                <div style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  {/* Volume */}
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 7, color: '#666', fontWeight: 700, letterSpacing: 1, display: 'block', marginBottom: 3 }}>VOLUME</span>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}>
                      <button
                        onClick={() => setLotSize(prev => Math.max(0.01, +(prev - 0.01).toFixed(2)))}
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: 'none',
                          borderRight: '1px solid rgba(255,255,255,0.06)',
                          color: '#AAA',
                          fontSize: 13,
                          cursor: 'pointer',
                          padding: '4px 8px',
                          outline: 'none',
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >−</button>
                      <input
                        type="number"
                        value={lotSize}
                        onChange={e => { const v = parseFloat(e.target.value); if (v > 0) setLotSize(v); }}
                        step="0.01"
                        style={{
                          flex: 1,
                          textAlign: 'center' as const,
                          padding: '4px 0',
                          border: 'none',
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: "var(--font-mono)",
                          color: '#FFF',
                          background: 'transparent',
                          outline: 'none',
                          direction: 'ltr' as const,
                        }}
                      />
                      <button
                        onClick={() => setLotSize(prev => +(prev + 0.01).toFixed(2))}
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: 'none',
                          borderLeft: '1px solid rgba(255,255,255,0.06)',
                          color: '#AAA',
                          fontSize: 13,
                          cursor: 'pointer',
                          padding: '4px 8px',
                          outline: 'none',
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >+</button>
                    </div>
                  </div>

                  {/* Stop Loss */}
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 7, color: '#FF5252', fontWeight: 700, letterSpacing: 1, display: 'block', marginBottom: 2 }}>STOP LOSS</span>
                    <input
                      type="number"
                      value={tradeSl}
                      onChange={e => setTradeSl(e.target.value)}
                      placeholder={tradeSide === 'buy' ? (resolvedPrice * 0.98).toFixed(pDec) : (resolvedPrice * 1.02).toFixed(pDec)}
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        background: 'rgba(255,82,82,0.06)',
                        border: '1px solid rgba(255,82,82,0.2)',
                        borderRadius: 4,
                        color: '#FF5252',
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        outline: 'none',
                        direction: 'ltr' as const,
                        boxSizing: 'border-box' as const,
                      }}
                    />
                  </div>

                  {/* Take Profit */}
                  <div>
                    <span style={{ fontSize: 7, color: '#69F0AE', fontWeight: 700, letterSpacing: 1, display: 'block', marginBottom: 2 }}>TAKE PROFIT</span>
                    <input
                      type="number"
                      value={tradeTp}
                      onChange={e => setTradeTp(e.target.value)}
                      placeholder={tradeSide === 'buy' ? (resolvedPrice * 1.03).toFixed(pDec) : (resolvedPrice * 0.97).toFixed(pDec)}
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        background: 'rgba(105,240,174,0.06)',
                        border: '1px solid rgba(105,240,174,0.2)',
                        borderRadius: 4,
                        color: '#69F0AE',
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        outline: 'none',
                        direction: 'ltr' as const,
                        boxSizing: 'border-box' as const,
                      }}
                    />
                  </div>
                </div>

                {/* ── SELL / BUY Buttons ── */}
                <div style={{
                  display: 'flex',
                  padding: '6px 10px 9px',
                  gap: 4,
                }}>
                  <button
                    onClick={() => {
                      setTradeSide('sell');
                      const { addTrade } = usePaperTradesStore.getState();
                      handlePlaceOrder({ side: 'sell', quantity: lotSize, entryPrice: resolvedPrice, sl: resolvedPrice * 1.02, tp: resolvedPrice * 0.98 });
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      background: tradeSide === 'sell'
                        ? 'linear-gradient(180deg, #FF5252 0%, #D32F2F 50%, #B71C1C 100%)'
                        : 'rgba(255,82,82,0.15)',
                      border: tradeSide === 'sell' ? 'none' : '1px solid rgba(255,82,82,0.3)',
                      borderRadius: 4,
                      color: '#FFF',
                      fontSize: 11,
                      fontWeight: 900,
                      cursor: 'pointer',
                      letterSpacing: 0.5,
                      transition: 'all 0.12s ease',
                      textTransform: 'uppercase' as const,
                      boxShadow: tradeSide === 'sell' ? '0 2px 8px rgba(211,47,47,0.4)' : 'none',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                  >
                    SELL {bid.toFixed(pDec)}
                  </button>
                  <button
                    onClick={() => {
                      setTradeSide('buy');
                      const { addTrade } = usePaperTradesStore.getState();
                      handlePlaceOrder({ side: 'buy', quantity: lotSize, entryPrice: resolvedPrice, sl: resolvedPrice * 0.98, tp: resolvedPrice * 1.02 });
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      background: tradeSide === 'buy'
                        ? 'linear-gradient(180deg, #69F0AE 0%, #00C853 50%, #009624 100%)'
                        : 'rgba(105,240,174,0.15)',
                      border: tradeSide === 'buy' ? 'none' : '1px solid rgba(105,240,174,0.3)',
                      borderRadius: 4,
                      color: '#FFF',
                      fontSize: 11,
                      fontWeight: 900,
                      cursor: 'pointer',
                      letterSpacing: 0.5,
                      transition: 'all 0.12s ease',
                      textTransform: 'uppercase' as const,
                      boxShadow: tradeSide === 'buy' ? '0 2px 8px rgba(0,200,83,0.4)' : 'none',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                  >
                    BUY {ask.toFixed(pDec)}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ── Price-Synced Candle Timer (Desktop Only) ── */}
          {!mobile && candleCountdown && (() => {
            const resolvedPrice = currentPrice || (candlesRef.current.length > 0 ? candlesRef.current[candlesRef.current.length - 1].close : null);
            return resolvedPrice ? (
              <PriceSyncedTimer
                chart={chart}
                currentPrice={resolvedPrice}
                countdown={candleCountdown}
                isBull={(() => {
                  const lc = candlesRef.current[candlesRef.current.length - 1];
                  return lc ? resolvedPrice >= lc.open : true;
                })()}
                compact={compact}
              />
            ) : null;
          })()}

          {/* Candle countdown removed from chart — shown only in header via CrosshairOverlay */}

          {/* ── Volume Profile Overlay — renders INSIDE chart plotting area, left of price scale ── */}
          {showVolumeProfile && (
            <VolumeProfile
              candles={candlesRef.current}
              candleSeries={chart.candleSeriesRef?.current ?? null}
              width={80}
              rows={24}
              visible={showVolumeProfile}
              containerHeight={chart.containerRef?.current?.offsetHeight ?? 400}
              priceScaleWidth={70}
            />
          )}

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

        {/* Volume Profile — now rendered as overlay inside chart area (see above) */}




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
        /* BUG-005 FIX: mcSpin keyframes were missing — loading spinners were static. */
        @keyframes mcSpin {
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
          <span style={{ fontSize: 12, color: '#FF4757', fontFamily: "var(--font-ar)", fontWeight: 700 }}>
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
              handlePlaceOrder({ side, quantity: 0.01, entryPrice: entry, sl, tp });
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

