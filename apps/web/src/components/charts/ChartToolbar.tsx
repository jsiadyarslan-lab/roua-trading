// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Toolbar Component
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChartType, DrawingTool } from '@/lib/charts/types';
import { TIMEFRAMES } from '@/lib/charts/types';
import { DrawingManager } from '@/lib/charts/DrawingManager';

interface ChartToolbarProps {
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  onSetTimeframe: (tf: string) => void;
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
  activeTool: DrawingTool;
  onSetTool: (tool: DrawingTool) => void;
  onClearDrawings: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
  mobile: boolean;
  height: number;
  // ── New Feature Toggle Props ──
  onToggleVolumeProfile?: () => void;
  onToggleAIPanel?: () => void;
  onToggleChartTrading?: () => void;
  onToggleTemplateManager?: () => void;
  onToggleWatchlist?: () => void;
  showVolumeProfile?: boolean;
  showAIPanel?: boolean;
  showChartTrading?: boolean;
  showWatchlist?: boolean;
}

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: 'candle',       label: 'شموع' },
  { key: 'hollow',       label: 'مجوفة' },
  { key: 'bar',          label: 'OHLC' },
  { key: 'line',         label: 'خط' },
  { key: 'area',         label: 'منطقة' },
  { key: 'heikin-ashi',  label: 'HA' },
];

const QUICK_DRAW_TOOLS: { key: DrawingTool; icon: string; title: string }[] = [
  { key: 'cursor',     icon: '↖', title: 'مؤشر' },
  { key: 'trendline',  icon: '╱', title: 'خط اتجاه' },
  { key: 'horizontal', icon: '━', title: 'خط أفقي' },
  { key: 'fibonacci',  icon: '⬡', title: 'فيبوناتشي' },
  { key: 'rectangle',  icon: '▭', title: 'مستطيل' },
];

export function ChartToolbar(props: ChartToolbarProps) {
  const {
    symbol, timeframe, chartType,
    onSetTimeframe, onSetChartType,
    onZoomIn, onZoomOut, onResetView,
    onToggleDrawings, onToggleIndicators,
    onExportPNG, onExportCSV, onExportSVG, onToggleFullscreen,
    activeTool, onSetTool, onClearDrawings,
    isPaused, onTogglePause, mobile, height,
    onToggleVolumeProfile, onToggleAIPanel, onToggleChartTrading,
    onToggleTemplateManager, onToggleWatchlist,
    showVolumeProfile, showAIPanel, showChartTrading, showWatchlist,
  } = props;

  const [showChartTypePanel, setShowChartTypePanel] = useState(false);
  const [showTimeframePanel, setShowTimeframePanel] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const chartTypeRef = useRef<HTMLDivElement>(null);
  const tfRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close panels on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (chartTypeRef.current && !chartTypeRef.current.contains(e.target as Node)) setShowChartTypePanel(false);
      if (tfRef.current && !tfRef.current.contains(e.target as Node)) setShowTimeframePanel(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeTF = TIMEFRAMES.find(t => t.value === timeframe);
  const tfLabel = activeTF?.label || timeframe;

  const COLORS = {
    bg: '#0F1117',
    border: 'rgba(42,49,60,0.9)',
    cyan: '#00D4FF',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#64748b',
    card: '#151A22',
    hoverBg: 'rgba(0,212,255,0.08)',
    activeBg: '#00D4FF',
    danger: '#f85149',
    warning: '#fbbf24',
    success: '#3fb950',
  };

  const btnStyle: React.CSSProperties = {
    height: 26,
    minWidth: 26,
    background: 'none',
    border: 'none',
    borderRadius: 4,
    color: COLORS.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.12s',
    flexShrink: 0,
    padding: '0 4px',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
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

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    background: COLORS.card,
    border: `1px solid rgba(0,212,255,0.2)`,
    borderRadius: 8,
    padding: 10,
    zIndex: 500,
    boxShadow: '0 15px 45px rgba(0,0,0,0.85)',
    backdropFilter: 'blur(10px)',
    minWidth: 180,
  };

  const panelItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'right' as const,
    padding: '8px 10px',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    background: 'none',
    border: 'none',
    color: COLORS.textSecondary,
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all 0.15s',
    marginBottom: 2,
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '0 6px',
      height: `${height}px`,
      background: COLORS.bg,
      borderBottom: `1px solid ${COLORS.border}`,
      flexShrink: 0,
      gap: 2,
      overflowX: mobile ? 'auto' : 'visible',
      scrollbarWidth: 'none',
    }}>
      {/* Chart Type */}
      <div ref={chartTypeRef} style={{ position: 'relative' }}>
        <button
          style={btnStyle}
          onClick={() => setShowChartTypePanel(!showChartTypePanel)}
          title="نوع الشارت"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="4" height="16" rx="1"/>
            <rect x="10" y="9" width="4" height="11" rx="1"/>
            <rect x="18" y="2" width="4" height="18" rx="1"/>
          </svg>
        </button>
        {showChartTypePanel && (
          <div style={{ ...panelStyle, left: 0, minWidth: 150 }}>
            <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6, fontFamily: "'Cairo', sans-serif" }}>نوع الشارت</div>
            {CHART_TYPES.map(ct => (
              <button
                key={ct.key}
                style={{
                  ...panelItemStyle,
                  background: chartType === ct.key ? 'rgba(0,212,255,0.12)' : 'none',
                  color: chartType === ct.key ? COLORS.cyan : COLORS.textSecondary,
                  fontWeight: chartType === ct.key ? 700 : 400,
                }}
                onClick={() => { onSetChartType(ct.key); setShowChartTypePanel(false); }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,212,255,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = chartType === ct.key ? 'rgba(0,212,255,0.12)' : 'none')}
              >
                {ct.label}
              </button>
            ))}
          </div>
        )}
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
            padding: '0 8px',
          }}
          onClick={() => setShowTimeframePanel(!showTimeframePanel)}
        >
          {tfLabel}
          <svg width="9" height="9" viewBox="0 0 10 6" fill="currentColor" style={{ marginLeft: 3 }}>
            <path d="M0 0 L5 6 L10 0Z"/>
          </svg>
        </button>
        {showTimeframePanel && (
          <div style={{ ...panelStyle, right: 0, minWidth: 240 }}>
            <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6, fontFamily: "'Cairo', sans-serif" }}>الإطار الزمني</div>
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
                      padding: '6px 0',
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
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
          </div>
        )}
      </div>

      <div style={sepStyle} />

      {/* Quick Drawing Tools */}
      {QUICK_DRAW_TOOLS.map(tool => (
        <button
          key={tool.key}
          style={activeTool === tool.key ? activeBtnStyle : btnStyle}
          onClick={() => onSetTool(tool.key)}
          title={tool.title}
        >
          {tool.icon}
        </button>
      ))}

      <div style={sepStyle} />

      {/* More Drawing Tools */}
      <button style={btnStyle} onClick={onToggleDrawings} title="أدوات الرسم">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/>
        </svg>
      </button>

      {/* Clear Drawings */}
      <button style={{ ...btnStyle, color: COLORS.danger }} onClick={onClearDrawings} title="مسح الرسومات">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>

      <div style={sepStyle} />

      {/* Zoom */}
      <button style={btnStyle} onClick={onZoomIn} title="تكبير (+)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </button>
      <button style={btnStyle} onClick={onZoomOut} title="تصغير (-)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </button>
      <button style={{ ...btnStyle, fontWeight: 700, width: 'auto', padding: '0 5px', fontFamily: "'Cairo', sans-serif" }} onClick={onResetView} title="إعادة ضبط">
        ⊡
      </button>

      <div style={sepStyle} />

      {/* Indicators */}
      <button
        style={{ ...btnStyle, width: 'auto', padding: '0 7px', fontWeight: 700 }}
        onClick={onToggleIndicators}
        title="المؤشرات"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 3 }}>
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
          title="ملف الحجم"
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
          title="تحليل الأنماط بالذكاء الاصطناعي"
        >
          AI
        </button>
      )}

      {/* Chart Trading */}
      {onToggleChartTrading && (
        <button
          style={toggleBtnStyle(!!showChartTrading)}
          onClick={onToggleChartTrading}
          title="تداول من الشارت"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
          </svg>
        </button>
      )}

      {/* Template Manager */}
      {onToggleTemplateManager && (
        <button
          style={btnStyle}
          onClick={onToggleTemplateManager}
          title="إدارة القوالب"
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
          title="قائمة المراقبة"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </button>
      )}

      {/* Play/Pause */}
      <button
        style={{
          ...btnStyle,
          color: isPaused ? COLORS.warning : COLORS.success,
          fontWeight: 700,
        }}
        onClick={onTogglePause}
        title={isPaused ? 'تشغيل التحديث (Space)' : 'إيقاف التحديث (Space)'}
      >
        {isPaused ? '▶' : '⏸'}
      </button>

      <div style={{ flex: 1 }} />

      {/* Export */}
      <div ref={exportRef} style={{ position: 'relative' }}>
        <button style={btnStyle} onClick={() => setShowExportPanel(!showExportPanel)} title="تصدير">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        {showExportPanel && (
          <div style={{ ...panelStyle, right: 0, minWidth: 120 }}>
            {[
              { label: 'PNG صورة', action: onExportPNG },
              { label: 'SVG صورة', action: onExportSVG },
              { label: 'CSV بيانات', action: onExportCSV },
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
          </div>
        )}
      </div>

      {/* Fullscreen */}
      <button style={btnStyle} onClick={onToggleFullscreen} title="ملء الشاشة">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
        </svg>
      </button>
    </div>
  );
}
