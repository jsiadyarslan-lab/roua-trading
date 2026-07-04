// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Toolbar Component
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getPortalRoot } from '@/lib/portal-root';
import type { ChartType, DrawingTool } from '@/lib/charts/types';
import { TIMEFRAMES } from '@/lib/charts/types';
import { ScopedStyle } from '@/components/ScopedStyle';
import { useTranslations } from 'next-intl';

interface ChartToolbarProps {
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  onSetTimeframe: (tf: string) => void;
  onSetSymbol?: (symbol: string) => void;
  onSetChartType: (type: ChartType) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleDrawings: () => void;
  onToggleIndicators: () => void;
  onExportPNG: () => void;
  onExportCSV: () => void;
  onExportSVG: () => void;
  onToggleFullscreen: () => void;
  isFullscreen?: boolean;
  activeTool: DrawingTool;
  onSetTool: (tool: DrawingTool) => void;
  onClearDrawings: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
  mobile: boolean;
  height: number;
  // ── Existing Feature Toggle Props ──
  onToggleVolumeProfile?: () => void;
  onToggleAIPanel?: () => void;
  onToggleChartTrading?: () => void;
  onToggleTemplateManager?: () => void;
  onToggleWatchlist?: () => void;
  onToggleChartSettings?: () => void;
  showVolumeProfile?: boolean;
  showAIPanel?: boolean;
  showChartTrading?: boolean;
  showWatchlist?: boolean;
  onToggleCompare?: () => void;
  onToggleSmartGrid?: () => void;
  onToggleShare?: () => void;
  showCompare?: boolean;
  // ── 5 New Feature Toggle Props ──
  showFootprint?: boolean;
  onToggleFootprint?: () => void;
  showAlerts?: boolean;
  onToggleAlerts?: () => void;
  showPatternProgress?: boolean;
  onTogglePatternProgress?: () => void;
  // ── 3 Revolutionary Feature Toggle Props ──
  showReplay?: boolean;
  onToggleReplay?: () => void;
  showHeatmap?: boolean;
  onToggleHeatmap?: () => void;
  priceAlertsCount?: number;
  // ── 4 AI Streaming Toggle Prop ──
  showAIStream?: boolean;
  onToggleAIStream?: () => void;
  // ── Multi-Chart Props ──
  isMultiChart?: boolean;
  onAddChart?: () => void;
  onRemoveChart?: () => void;
  onToggleLayoutSelector?: () => void;
  showLayoutSelector?: boolean;
  chartCount?: number;
}

// Chart type keys — labels resolved via i18n in the component
const CHART_TYPE_KEYS: ChartType[] = ['candle', 'hollow', 'bar', 'line', 'area', 'heikin-ashi'];
const CHART_TYPE_I18N_KEYS: Record<ChartType, string> = {
  'candle': 'candle',
  'hollow': 'hollow',
  'bar': 'bar',
  'line': 'line',
  'area': 'area',
  'heikin-ashi': 'heikinAshi',
};

// Only cursor in toolbar — all other drawing tools in the Drawing Panel
const QUICK_DRAW_TOOLS: { key: DrawingTool; icon: string; i18nKey: string }[] = [
  { key: 'cursor',     icon: '↖', i18nKey: 'cursor' },
];

// Symbol list for toolbar dropdown (V432: all 12 backend-supported crypto + key forex/metals)
const TOOLBAR_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
  'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', 'AVAX/USDT',
  'LINK/USDT', 'UNI/USDT',
  'EUR/USD', 'GBP/USD', 'XAU/USD',
];

export function ChartToolbar(props: ChartToolbarProps) {
  const {
    symbol, timeframe, chartType,
    onSetTimeframe, onSetChartType, onSetSymbol,
    onZoomIn, onZoomOut, onResetView,
    onToggleDrawings, onToggleIndicators,
    onExportPNG, onExportCSV, onExportSVG, onToggleFullscreen,
    activeTool, onSetTool, onClearDrawings,
    isPaused, onTogglePause, mobile, height,
    onToggleVolumeProfile, onToggleAIPanel, onToggleChartTrading,
    onToggleTemplateManager, onToggleWatchlist, onToggleChartSettings,
    showVolumeProfile, showAIPanel, showChartTrading, showWatchlist,
    onToggleCompare, onToggleSmartGrid, onToggleShare, showCompare,
    showFootprint, onToggleFootprint,
    showAlerts, onToggleAlerts,
    showPatternProgress, onTogglePatternProgress,
    showReplay, onToggleReplay,
    showHeatmap, onToggleHeatmap,
    showAIStream, onToggleAIStream,
    priceAlertsCount,
    isFullscreen,
    // ── Multi-Chart Props ──
    isMultiChart, onAddChart, onRemoveChart,
    onToggleLayoutSelector, showLayoutSelector, chartCount,
  } = props;

  const t = useTranslations('chartToolbar');
  const [showChartTypePanel, setShowChartTypePanel] = useState(false);
  const [showTimeframePanel, setShowTimeframePanel] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const chartTypeRef = useRef<HTMLDivElement>(null);
  const tfRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  // Refs for portal dropdown panels (rendered in document.body via createPortal)
  const tfPanelRef = useRef<HTMLDivElement>(null);
  const ctPanelRef = useRef<HTMLDivElement>(null);
  const exportPanelRef = useRef<HTMLDivElement>(null);

  // ── Fixed-position dropdown placement (avoids overflow clipping) ──
  const [tfPanelPos, setTfPanelPos] = useState<{ top: number; right: number; left: number } | null>(null);
  const [ctPanelPos, setCtPanelPos] = useState<{ top: number; left: number } | null>(null);
  const [exportPanelPos, setExportPanelPos] = useState<{ top: number; left: number } | null>(null);

  const updateTfPos = useCallback(() => {
    if (tfRef.current && showTimeframePanel) {
      const rect = tfRef.current.getBoundingClientRect();
      // Use left instead of right to avoid RTL positioning issues
      // Ensure panel stays within viewport bounds
      const panelWidth = mobile ? 200 : 240;
      let left = rect.left;
      if (left + panelWidth > window.innerWidth) {
        left = window.innerWidth - panelWidth - 8;
      }
      setTfPanelPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right, left });
    }
  }, [showTimeframePanel]);

  const updateCtPos = useCallback(() => {
    if (chartTypeRef.current && showChartTypePanel) {
      const rect = chartTypeRef.current.getBoundingClientRect();
      const panelWidth = mobile ? 130 : 150;
      let left = rect.left;
      if (left + panelWidth > window.innerWidth) {
        left = window.innerWidth - panelWidth - 8;
      }
      setCtPanelPos({ top: rect.bottom + 4, left });
    }
  }, [showChartTypePanel]);

  const updateExportPos = useCallback(() => {
    if (exportRef.current && showExportPanel) {
      const rect = exportRef.current.getBoundingClientRect();
      const panelWidth = mobile ? 160 : 120;
      let left = rect.left;
      if (left + panelWidth > window.innerWidth) {
        left = window.innerWidth - panelWidth - 8;
      }
      setExportPanelPos({ top: rect.bottom + 4, left });
    }
  }, [showExportPanel]);

  // Calculate panel positions when they open
  useEffect(() => {
    if (showTimeframePanel) updateTfPos();
    else setTfPanelPos(null);
  }, [showTimeframePanel, updateTfPos]);

  useEffect(() => {
    if (showChartTypePanel) updateCtPos();
    else setCtPanelPos(null);
  }, [showChartTypePanel, updateCtPos]);

  useEffect(() => {
    if (showExportPanel) updateExportPos();
    else setExportPanelPos(null);
  }, [showExportPanel, updateExportPos]);

  // Close panels on outside click
  // FIX: Also check portal panel refs — panels are rendered via createPortal into
  // document.body, so clicks inside them are NOT inside the trigger button refs.
  // Without this check, mousedown on a portal button closes the panel BEFORE the
  // click event fires, making the buttons unresponsive.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Chart type panel
      const ctInside = (chartTypeRef.current && chartTypeRef.current.contains(target))
        || (ctPanelRef.current && ctPanelRef.current.contains(target));
      if (!ctInside) setShowChartTypePanel(false);
      // Timeframe panel
      const tfInside = (tfRef.current && tfRef.current.contains(target))
        || (tfPanelRef.current && tfPanelRef.current.contains(target));
      if (!tfInside) setShowTimeframePanel(false);
      // Export panel
      const exportInside = (exportRef.current && exportRef.current.contains(target))
        || (exportPanelRef.current && exportPanelRef.current.contains(target));
      if (!exportInside) setShowExportPanel(false);
    };
    const scrollHandler = () => {
      setShowChartTypePanel(false);
      setShowTimeframePanel(false);
      setShowExportPanel(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('scroll', scrollHandler, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('scroll', scrollHandler, true);
    };
  }, []);

  const activeTF = TIMEFRAMES.find(t => t.value === timeframe);
  const tfLabel = activeTF?.label || timeframe;

  const COLORS = {
    bg: '#0F1117',
    border: 'rgba(42,49,60,0.9)',
    cyan: '#00D4FF',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#8B92A8',
    card: '#151A22',
    hoverBg: 'rgba(0,212,255,0.08)',
    activeBg: '#00D4FF',
    danger: '#FF4757',
    warning: '#fbbf24',
    success: '#00FFA3',
  };

  // FIX: على الجوال الضيق جداً نُخفي الأزرار الثانوية
  const isNarrow = mobile && typeof window !== 'undefined' && window.innerWidth < 420;
  // FIX: احترام معيار 44px لأهداف اللمس على الجوال
  const touchSize = mobile ? 40 : 26;
  const btnStyle: React.CSSProperties = {
    height: touchSize,
    minWidth: touchSize,
    background: 'none',
    border: 'none',
    borderRadius: mobile ? 6 : 4,
    color: COLORS.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.12s',
    flexShrink: 0,
    padding: mobile ? '0 8px' : '0 4px',
    fontSize: mobile ? 12 : 11,
    fontFamily: "var(--font-mono)",
  };

  const toggleBtnStyle = (isActive: boolean): React.CSSProperties => ({
    ...btnStyle,
    background: isActive ? 'rgba(0,212,255,0.15)' : 'none',
    border: `1px solid ${isActive ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
    color: isActive ? COLORS.cyan : COLORS.textSecondary,
    borderRadius: 4,
  });

  const activeBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: COLORS.activeBg,
    color: '#000',
    fontWeight: 700,
    boxShadow: '0 0 10px rgba(0,212,255,0.35)',
  };

  const sepStyle: React.CSSProperties = {
    width: 1,
    height: 18,
    background: COLORS.border,
    margin: '0 2px',
    flexShrink: 0,
  };

  const panelBaseStyle: React.CSSProperties = {
    position: 'fixed',
    background: COLORS.card,
    border: `1px solid rgba(0,212,255,0.2)`,
    borderRadius: 8,
    padding: 10,
    zIndex: 99999,
    boxShadow: '0 15px 45px rgba(0,0,0,0.85)',
    backdropFilter: 'blur(10px)',
    minWidth: 180,
  };

  const panelItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'start' as const,
    padding: '8px 10px',
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    background: 'none',
    border: 'none',
    color: COLORS.textSecondary,
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all 0.15s',
    marginBottom: 2,
  };

  // ── Fullscreen button style (prominent) ──
  const fullscreenBtnStyle: React.CSSProperties = isFullscreen
    ? { ...btnStyle, color: COLORS.cyan, background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)' }
    : { ...btnStyle, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' };

  const fullscreenIcon = isFullscreen ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );

  // ── Portal dropdown panels ──
  const tfPanelPortal = showTimeframePanel && tfPanelPos ? createPortal(
    <div ref={tfPanelRef} style={{ ...panelBaseStyle, top: tfPanelPos.top, left: tfPanelPos.left, right: 'auto', minWidth: mobile ? 200 : 240 }}>
      <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6, fontFamily: "var(--font-ar)" }}>{t('timeframe')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
        {TIMEFRAMES.map(tf => {
          const isActive = timeframe === tf.value;
          return (
            <button
              key={tf.value}
              style={{
                background: isActive ? COLORS.cyan : '#1a1f2e',
                border: `1px solid ${isActive ? COLORS.cyan : 'rgba(255,255,255,0.08)'}`,
                color: isActive ? '#000' : COLORS.textSecondary,
                borderRadius: 6,
                padding: mobile ? '5px 0' : '6px 0',
                fontSize: mobile ? 9 : 10,
                fontFamily: "var(--font-mono)",
                fontWeight: isActive ? 700 : 600,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.1s',
              }}
              onClick={() => { onSetTimeframe(tf.value); setShowTimeframePanel(false); }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,212,255,0.1)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#1a1f2e'; }}
            >
              {tf.label}
            </button>
          );
        })}
      </div>
    </div>,
    getPortalRoot()
  ) : null;

  const ctPanelPortal = showChartTypePanel && ctPanelPos ? createPortal(
    <div ref={ctPanelRef} style={{ ...panelBaseStyle, top: ctPanelPos.top, left: ctPanelPos.left, minWidth: mobile ? 130 : 150 }}>
      <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6, fontFamily: "var(--font-ar)" }}>{t('chartType')}</div>
      {CHART_TYPE_KEYS.map(ctKey => (
        <button
          key={ctKey}
          style={{
            ...panelItemStyle,
            background: chartType === ctKey ? 'rgba(0,212,255,0.12)' : 'none',
            color: chartType === ctKey ? COLORS.cyan : COLORS.textSecondary,
            fontWeight: chartType === ctKey ? 700 : 400,
          }}
          onClick={() => { onSetChartType(ctKey); setShowChartTypePanel(false); }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,212,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = chartType === ctKey ? 'rgba(0,212,255,0.12)' : 'none')}
        >
          {t(CHART_TYPE_I18N_KEYS[ctKey])}
        </button>
      ))}
    </div>,
    getPortalRoot()
  ) : null;

  const exportPanelPortal = showExportPanel && exportPanelPos ? createPortal(
    <div ref={exportPanelRef} style={{ ...panelBaseStyle, top: exportPanelPos.top, left: exportPanelPos.left, right: 'auto', minWidth: mobile ? 160 : 120 }}>
      {mobile ? [
        { label: `📐 ${t('drawings')}`, action: onToggleDrawings },
        { label: `🗑️ ${t('clearDrawings')}`, action: onClearDrawings },
        { label: `📊 ${t('volumeProfile')}`, action: onToggleVolumeProfile || (() => {}) },
        { label: `🧠 ${t('aiAnalysis')}`, action: onToggleAIPanel || (() => {}) },
        { label: `📈 ${t('patternProgress')}`, action: onTogglePatternProgress || (() => {}) },
        { label: '👣 Footprint', action: onToggleFootprint || (() => {}) },
        { label: `🔔 ${t('alerts')}`, action: onToggleAlerts || (() => {}) },
        { label: '⏪ Replay Mode', action: onToggleReplay || (() => {}) },
        { label: '🔲 Heatmap', action: onToggleHeatmap || (() => {}) },
        { label: `⚖️ ${t('compare')}`, action: onToggleCompare || (() => {}) },
        { label: `🔲 ${t('chartGrid')}`, action: onToggleSmartGrid || (() => {}) },
        { label: `🔗 ${t('share')}`, action: onToggleShare || (() => {}) },
        { label: `📋 ${t('watchlist')}`, action: onToggleWatchlist || (() => {}) },
        { label: `💾 ${t('templateManager')}`, action: onToggleTemplateManager || (() => {}) },
        { label: `⚙️ ${t('chartSettings')}`, action: onToggleChartSettings || (() => {}) },
        { label: `📥 ${t('exportPNG')}`, action: onExportPNG },
        { label: `📥 ${t('exportCSV')}`, action: onExportCSV },
      ].map(item => (
        <button
          key={item.label}
          style={panelItemStyle}
          onClick={() => { item.action(); setShowExportPanel(false); }}
        >
          {item.label}
        </button>
      )) : [
        { label: t('exportImage'), action: onExportPNG },
        { label: t('exportSVG'), action: onExportSVG },
        { label: t('exportData'), action: onExportCSV },
      ].map(item => (
        <button
          key={item.label}
          style={panelItemStyle}
          onClick={() => { item.action(); setShowExportPanel(false); }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,212,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          {item.label}
        </button>
      ))}
    </div>,
    getPortalRoot()
  ) : null;

  // ── Mobile: show only essential tools ──
  if (mobile) {
    return (
      <>
        <div
          className="toolbar-scrollable"
          style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 4px',
          // FIX: على الجوال نستخدم minHeight لإعطاء الأزرار مساحتها الطبيعية
          // height صارم كان يقتطع الأزرار ويُنشئ scrollbar مرئياً
          minHeight: `${height}px`,
          height: mobile ? 'auto' : `${height}px`,
          background: COLORS.bg,
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
          gap: 1,
          direction: 'inherit',
          overflowX: 'auto',
          overflowY: 'hidden',
          // FIX: إخفاء الـ scrollbar بصرياً (لا يزال قابلاً للتمرير)
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        } as React.CSSProperties}>
          {/* Chart Type */}
          <div ref={chartTypeRef} style={{ position: 'relative' }}>
            <button
              style={{ ...btnStyle, padding: '0 6px' }}
              onClick={() => setShowChartTypePanel(!showChartTypePanel)}
              title={t('chartType')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="4" height="16" rx="1"/>
                <rect x="10" y="9" width="4" height="11" rx="1"/>
                <rect x="18" y="2" width="4" height="18" rx="1"/>
              </svg>
            </button>
          </div>

          <div style={sepStyle} />

          {/* Timeframe */}
          <div ref={tfRef} style={{ position: 'relative' }}>
            <button
              style={{
                ...btnStyle,
                background: 'rgba(0,212,255,0.1)',
                border: '1px solid rgba(0,212,255,0.3)',
                color: COLORS.cyan,
                fontWeight: 700,
                padding: '0 7px',
              }}
              onClick={() => setShowTimeframePanel(!showTimeframePanel)}
            >
              {tfLabel}
              <svg width="8" height="8" viewBox="0 0 10 6" fill="currentColor" style={{ marginInlineStart: 2 }}>
                <path d="M0 0 L5 6 L10 0Z"/>
              </svg>
            </button>
          </div>

          <div style={sepStyle} />

          {/* ★ Fullscreen — PROMINENT, always visible as first action button */}
          <button
            style={fullscreenBtnStyle}
            onClick={onToggleFullscreen}
            title={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
          >
            {fullscreenIcon}
          </button>

          <div style={sepStyle} />

          {/* Drawing Tool (cursor only on mobile) */}
          <button
            style={activeTool === 'cursor' ? activeBtnStyle : btnStyle}
            onClick={() => onSetTool('cursor')}
            title={t('cursor')}
          >
            ↖
          </button>

          {/* Indicators */}
          <button
            style={{ ...btnStyle, width: 'auto', padding: '0 5px', fontWeight: 700 }}
            onClick={onToggleIndicators}
            title={t('indicators')}
          >
            IND
          </button>

          <div style={sepStyle} />

          {/* Zoom In/Out */}
          <button style={btnStyle} onClick={onZoomIn} title={t('zoomIn')}>+</button>
          <button style={btnStyle} onClick={onZoomOut} title={t('zoomOut')}>−</button>

          <div style={sepStyle} />

          {/* AI */}
          {onToggleAIPanel && (
            <button
              style={toggleBtnStyle(!!showAIPanel)}
              onClick={onToggleAIPanel}
              title="AI"
            >
              AI
            </button>
          )}

          {/* AI Stream (SSE) */}
          {onToggleAIStream && (
            <button
              style={toggleBtnStyle(!!showAIStream)}
              onClick={onToggleAIStream}
              title="AI Live Stream"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 12h4l3-9 6 18 3-9h4"/>
              </svg>
            </button>
          )}

          {/* Chart Trading — hidden on narrow screens */}
          {!isNarrow && onToggleChartTrading && (
            <button
              style={toggleBtnStyle(!!showChartTrading)}
              onClick={onToggleChartTrading}
              title={t('chartTrading')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
              </svg>
            </button>
          )}

          {/* Compare — hidden on narrow screens */}
          {!isNarrow && onToggleCompare && (
            <button
              style={toggleBtnStyle(!!showCompare)}
              onClick={onToggleCompare}
              title={t('compareAsset')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </button>
          )}

          {/* Smart Grid — hidden on narrow screens */}
          {!isNarrow && onToggleSmartGrid && (
            <button
              style={btnStyle}
              onClick={onToggleSmartGrid}
              title={t('chartGridTooltip')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
          )}

          {/* Share — hidden on narrow screens */}
          {!isNarrow && onToggleShare && (
            <button
              style={btnStyle}
              onClick={onToggleShare}
              title={t('shareChart')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          )}

          {/* Replay Mode — hidden on narrow screens */}
          {!isNarrow && onToggleReplay && (
            <button
              style={toggleBtnStyle(!!showReplay)}
              onClick={onToggleReplay}
              title="Chart Replay Mode"
            >
              ⏪
            </button>
          )}

          {/* Heatmap — hidden on narrow screens */}
          {!isNarrow && onToggleHeatmap && (
            <button
              style={toggleBtnStyle(!!showHeatmap)}
              onClick={onToggleHeatmap}
              title="Mini Heatmap"
            >
              🔲
            </button>
          )}

          <div style={sepStyle} />

          {/* Play/Pause — hidden on narrow screens */}
          {!isNarrow && <button
            style={{
              ...btnStyle,
              color: isPaused ? COLORS.warning : COLORS.success,
              fontWeight: 700,
            }}
            onClick={onTogglePause}
            title={isPaused ? t('play') : t('pause')}
          >
            {isPaused ? '▶' : '⏸'}
          </button>}

          <div style={{ flex: 1 }} />

          {/* More tools menu (overflow) */}
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button style={btnStyle} onClick={() => setShowExportPanel(!showExportPanel)} title={t('more')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Portal dropdowns */}
        {ctPanelPortal}
        {tfPanelPortal}
        {exportPanelPortal}
      </>
    );
  }

  // ── Desktop Toolbar ──
  return (
    <>
      <div
        className="toolbar-scrollable"
        style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 6px',
        height: `${height}px`,
        background: COLORS.bg,
        borderBottom: `1px solid ${COLORS.border}`,
        flexShrink: 0,
        gap: 2,
        direction: 'inherit',
        overflowX: 'auto',
        overflowY: 'visible',
      }}>
        {/* Chart Type */}
        <div ref={chartTypeRef} style={{ position: 'relative' }}>
          <button
            style={btnStyle}
            onClick={() => setShowChartTypePanel(!showChartTypePanel)}
            title={t('chartType')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="4" height="16" rx="1"/>
              <rect x="10" y="9" width="4" height="11" rx="1"/>
              <rect x="18" y="2" width="4" height="18" rx="1"/>
            </svg>
          </button>
        </div>

        <div style={sepStyle} />

        {/* Symbol Selector (only when onSetSymbol is provided — multi-chart mode) */}
        {onSetSymbol && (
          <>
            <select value={symbol}
              onChange={e => onSetSymbol(e.target.value)}
              style={{
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 4,
                color: COLORS.cyan,
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                padding: '0 2px',
                cursor: 'pointer',
                outline: 'none',
                height: 18,
                maxWidth: 68,
              }}
            >
              {TOOLBAR_SYMBOLS.map(s => (
                <option key={s} value={s} style={{ background: '#111620', color: '#F0F2F5' }}>{s}</option>
              ))}
            </select>
            <div style={sepStyle} />
          </>
        )}

        {/* Timeframe */}
        <div ref={tfRef} style={{ position: 'relative' }}>
          <button
            style={{
              ...btnStyle,
              background: 'rgba(0,212,255,0.1)',
              border: '1px solid rgba(0,212,255,0.3)',
              color: COLORS.cyan,
              fontWeight: 700,
              padding: '0 8px',
            }}
            onClick={() => setShowTimeframePanel(!showTimeframePanel)}
          >
            {tfLabel}
            <svg width="9" height="9" viewBox="0 0 10 6" fill="currentColor" style={{ marginInlineStart: 3 }}>
              <path d="M0 0 L5 6 L10 0Z"/>
            </svg>
          </button>
        </div>

        <div style={sepStyle} />

        {/* ★ Fullscreen — PROMINENT, always visible right after timeframe */}
        <button
          style={fullscreenBtnStyle}
          onClick={onToggleFullscreen}
          title={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
        >
          {fullscreenIcon}
        </button>

        <div style={sepStyle} />

        {/* Cursor + Drawing Panel (drawing tools are in the panel) */}
        {QUICK_DRAW_TOOLS.map(tool => (
          <button
            key={tool.key}
            style={activeTool === tool.key ? activeBtnStyle : btnStyle}
            onClick={() => onSetTool(tool.key)}
            title={tool.i18nKey ? t(tool.i18nKey) : (tool as any).title || ''}
          >
            {tool.icon}
          </button>
        ))}

        {/* Drawing Panel */}
        <button style={btnStyle} onClick={onToggleDrawings} title={t('drawings')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/>
          </svg>
        </button>

        {/* Clear Drawings */}
        <button style={{ ...btnStyle, color: COLORS.danger }} onClick={onClearDrawings} title={t('clearDrawings')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>

        <div style={sepStyle} />

        {/* Zoom */}
        <button style={btnStyle} onClick={onZoomIn} title={`${t('zoomIn')} (+)`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button style={btnStyle} onClick={onZoomOut} title={`${t('zoomOut')} (-)`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button style={{ ...btnStyle, fontWeight: 700, width: 'auto', padding: '0 5px', fontFamily: "var(--font-ar)" }} onClick={onResetView} title={t('resetView')}>
          ⊡
        </button>

        <div style={sepStyle} />

        {/* Indicators */}
        <button
          style={{ ...btnStyle, width: 'auto', padding: '0 7px', fontWeight: 700 }}
          onClick={onToggleIndicators}
          title={t('indicators')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginInlineEnd: 3 }}>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          IND
        </button>

        <div style={sepStyle} />

        {/* Volume Profile Toggle */}
        {onToggleVolumeProfile && (
          <button
            style={toggleBtnStyle(!!showVolumeProfile)}
            onClick={onToggleVolumeProfile}
            title={t('volumeProfile')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="14" width="4" height="8"/><rect x="8" y="8" width="4" height="14"/><rect x="14" y="2" width="4" height="20"/>
            </svg>
          </button>
        )}

        {/* AI Pattern Detection */}
        {onToggleAIPanel && (
          <button
            style={toggleBtnStyle(!!showAIPanel)}
            onClick={onToggleAIPanel}
            title={t('aiPatternAnalysis')}
          >
            🧠 AI
          </button>
        )}

        {/* AI Streaming — SSE Consensus War Room */}
        {onToggleAIStream && (
          <button
            style={toggleBtnStyle(!!showAIStream)}
            onClick={onToggleAIStream}
            title="AI Live Stream (SSE)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12h4l3-9 6 18 3-9h4"/>
            </svg>
            <span style={{ fontSize: 8, fontWeight: 700, marginInlineStart: 2 }}>SSE</span>
          </button>
        )}

        {/* Pattern Progress */}
        {onTogglePatternProgress && (
          <button
            style={toggleBtnStyle(!!showPatternProgress)}
            onClick={onTogglePatternProgress}
            title={t('livePatternProgress')}
          >
            📈
          </button>
        )}

        <div style={sepStyle} />

        {/* ── Group 4: Footprint ── */}
        {onToggleFootprint && (
          <button
            style={toggleBtnStyle(!!showFootprint)}
            onClick={onToggleFootprint}
            title="Footprint Chart"
          >
            👣
          </button>
        )}

        <div style={sepStyle} />

        {/* ── Group 5: Trading ── */}

        {/* Chart Trading (existing) */}
        {onToggleChartTrading && (
          <button
            style={toggleBtnStyle(!!showChartTrading)}
            onClick={onToggleChartTrading}
            title={t('chartTrading')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
            </svg>
          </button>
        )}

        <div style={sepStyle} />

        {/* ── Group 7: Display ── */}
        {onToggleCompare && (
          <button
            style={toggleBtnStyle(!!showCompare)}
            onClick={onToggleCompare}
            title={t('compareAsset')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </button>
        )}

        {/* Smart Grid */}
        {onToggleSmartGrid && (
          <button
            style={toggleBtnStyle(!!isMultiChart)}
            onClick={onToggleSmartGrid}
            title={isMultiChart ? t('exitMultiChart') || 'Exit Multi-Chart' : t('chartGridTooltip')}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/>
            </svg>
            <span style={{ fontSize: 8, fontWeight: 700, marginInlineStart: 2 }}>{isMultiChart ? '1×1' : 'Grid'}</span>
          </button>
        )}

        {/* ── Multi-Chart: Layout Selector ▦ ── */}
        {onToggleLayoutSelector && (
          <button
            style={{
              ...btnStyle,
              background: isMultiChart ? 'rgba(0,212,255,0.15)' : 'none',
              border: isMultiChart ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
              color: isMultiChart ? COLORS.cyan : COLORS.textSecondary,
              padding: '0 5px',
            }}
            onClick={onToggleLayoutSelector}
            title="Chart Layout"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span style={{ fontSize: 8, fontWeight: 700, marginInlineStart: 2 }}>▦</span>
          </button>
        )}

        {/* Share */}
        {onToggleShare && (
          <button
            style={btnStyle}
            onClick={onToggleShare}
            title={t('shareChart')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
        )}

        {/* Template Manager */}
        {onToggleTemplateManager && (
          <button
            style={btnStyle}
            onClick={onToggleTemplateManager}
            title={t('templateManager')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
          </button>
        )}

        {/* Watchlist */}
        {onToggleWatchlist && (
          <button
            style={toggleBtnStyle(!!showWatchlist)}
            onClick={onToggleWatchlist}
            title={t('watchlist')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
        )}

        {/* Chart Settings */}
        {onToggleChartSettings && (
          <button style={btnStyle} onClick={onToggleChartSettings} title={t('chartSettings')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        )}

        {/* Alerts — placed after Settings */}
        {onToggleAlerts && (
          <button
            style={toggleBtnStyle(!!showAlerts)}
            onClick={onToggleAlerts}
            title={t('alerts')}
          >
            🔔
          </button>
        )}

        <div style={sepStyle} />

        {/* ── 3 Revolutionary Features ── */}

        {/* Replay Mode */}
        {onToggleReplay && (
          <button
            style={toggleBtnStyle(!!showReplay)}
            onClick={onToggleReplay}
            title="Chart Replay Mode (Bar-by-Bar)"
          >
            ⏪
          </button>
        )}

        {/* Heatmap */}
        {onToggleHeatmap && (
          <button
            style={toggleBtnStyle(!!showHeatmap)}
            onClick={onToggleHeatmap}
            title="Mini Heatmap"
          >
            🔲
          </button>
        )}

        {/* Price Alerts count badge */}
        {priceAlertsCount !== undefined && priceAlertsCount > 0 && (
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}>
            <span style={{
              position: 'absolute',
              top: -4,
              right: -4,
              background: COLORS.danger,
              color: '#fff',
              fontSize: 7,
              fontWeight: 900,
              width: 14,
              height: 14,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "var(--font-mono)",
              zIndex: 1,
              boxShadow: '0 0 4px rgba(255,71,87,0.5)',
            }}>
              {priceAlertsCount}
            </span>
            <span style={{ fontSize: 13 }}>🔔</span>
          </div>
        )}

        <div style={sepStyle} />

        {/* Play/Pause */}
        <button
          style={{
            ...btnStyle,
            color: isPaused ? COLORS.warning : COLORS.success,
            fontWeight: 700,
          }}
          onClick={onTogglePause}
          title={isPaused ? `${t('playUpdate')} (Space)` : `${t('pauseUpdate')} (Space)`}
        >
          {isPaused ? '▶' : '⏸'}
        </button>

        <div style={{ flex: 1 }} />

        {/* Export */}
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button style={btnStyle} onClick={() => setShowExportPanel(!showExportPanel)} title={t('export')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
        </div>

        <ScopedStyle>{`
          .toolbar-scrollable::-webkit-scrollbar {
            height: 0px;
            display: none;
          }
          .toolbar-scrollable::-webkit-scrollbar-track {
            background: transparent;
          }
          .toolbar-scrollable::-webkit-scrollbar-thumb {
            background: rgba(42,49,60,0.6);
            border-radius: 3px;
          }
          .toolbar-scrollable::-webkit-scrollbar-thumb:hover {
            background: rgba(42,49,60,0.9);
          }
        `}</ScopedStyle>
      </div>

      {/* Portal dropdowns */}
      {ctPanelPortal}
      {tfPanelPortal}
      {exportPanelPortal}
    </>
  );
}
