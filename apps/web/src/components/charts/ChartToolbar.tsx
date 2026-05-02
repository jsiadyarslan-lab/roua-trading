// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Toolbar Component
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useRef, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Brain,
  Clock3,
  Crosshair,
  Download,
  Eye,
  Layers,
  LineChart,
  List,
  Minus,
  Maximize2,
  Minimize2,
  Pause,
  PenLine,
  Play,
  RectangleHorizontal,
  RotateCcw,
  Settings,
  Trash2,
  TrendingUp,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ChartType, DrawingTool } from '@/lib/charts/types';
import { TIMEFRAMES } from '@/lib/charts/types';

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
  isFullscreen?: boolean;
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
  onToggleChartSettings?: () => void;
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
    onToggleTemplateManager, onToggleWatchlist, onToggleChartSettings,
    showVolumeProfile, showAIPanel, showChartTrading, showWatchlist,
    isFullscreen,
  } = props;

  const [showChartTypePanel, setShowChartTypePanel] = useState(false);
  const [showTimeframePanel, setShowTimeframePanel] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const chartTypeRef = useRef<HTMLDivElement>(null);
  const tfRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close panels on outside click or scroll
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (chartTypeRef.current && !chartTypeRef.current.contains(e.target as Node)) setShowChartTypePanel(false);
      if (tfRef.current && !tfRef.current.contains(e.target as Node)) setShowTimeframePanel(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportPanel(false);
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
    border: 'rgba(148,163,184,0.16)',
    cyan: '#38BDF8',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#64748b',
    card: '#151A22',
    hoverBg: 'rgba(148,163,184,0.10)',
    activeBg: 'rgba(56,189,248,0.16)',
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
    background: isActive ? 'rgba(56,189,248,0.14)' : 'none',
    border: `1px solid ${isActive ? 'rgba(56,189,248,0.28)' : 'transparent'}`,
    color: isActive ? COLORS.cyan : COLORS.textSecondary,
    borderRadius: 4,
  });

  const activeBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: COLORS.activeBg,
    color: COLORS.cyan,
    border: '1px solid rgba(56,189,248,0.28)',
    fontWeight: 700,
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
    border: `1px solid ${COLORS.border}`,
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

  const ToolbarGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 3,
      paddingInline: 4,
      borderInlineStart: '1px solid rgba(148,163,184,0.10)',
    }}>
      <span style={{
        fontSize: 8,
        color: COLORS.textMuted,
        fontFamily: "'Cairo', sans-serif",
        fontWeight: 700,
        lineHeight: 1,
        paddingInline: 3,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      {children}
    </div>
  );

  const IconTool = ({
    title,
    icon: Icon,
    onClick,
    active = false,
    danger = false,
    children,
  }: {
    title: string;
    icon?: LucideIcon;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
    children?: React.ReactNode;
  }) => (
    <button
      style={{
        ...(active ? activeBtnStyle : btnStyle),
        color: danger ? COLORS.danger : active ? COLORS.cyan : btnStyle.color,
      }}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {Icon ? <Icon size={13} strokeWidth={2} /> : children}
    </button>
  );

  // ── Mobile: show only essential tools ──
  if (mobile) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
        height: `${height}px`,
        background: COLORS.bg,
        borderBottom: `1px solid ${COLORS.border}`,
        flexShrink: 0,
        gap: 1,
        direction: 'rtl',
      }}>
        {/* Chart Type */}
        <div ref={chartTypeRef} style={{ position: 'relative' }}>
          <button
            style={{ ...btnStyle, padding: '0 6px' }}
            onClick={() => setShowChartTypePanel(!showChartTypePanel)}
            title="نوع الشارت"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="4" height="16" rx="1"/>
              <rect x="10" y="9" width="4" height="11" rx="1"/>
              <rect x="18" y="2" width="4" height="18" rx="1"/>
            </svg>
          </button>
          {showChartTypePanel && (
            <div style={{ ...panelStyle, left: 0, minWidth: 130 }}>
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
              padding: '0 7px',
            }}
            onClick={() => setShowTimeframePanel(!showTimeframePanel)}
          >
            {tfLabel}
            <svg width="8" height="8" viewBox="0 0 10 6" fill="currentColor" style={{ marginInlineStart: 2 }}>
              <path d="M0 0 L5 6 L10 0Z"/>
            </svg>
          </button>
          {showTimeframePanel && (
            <div style={{ ...panelStyle, right: 0, minWidth: 200 }}>
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
                        padding: '5px 0',
                        fontSize: 9,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: isActive ? 700 : 600,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.1s',
                      }}
                      onClick={() => { onSetTimeframe(tf.value); setShowTimeframePanel(false); }}
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

        {/* Drawing Tool (cursor only on mobile) */}
        <button
          style={activeTool === 'cursor' ? activeBtnStyle : btnStyle}
          onClick={() => onSetTool('cursor')}
          title="مؤشر"
        >
          ↖
        </button>

        {/* Indicators */}
        <button
          style={{ ...btnStyle, width: 'auto', padding: '0 5px', fontWeight: 700 }}
          onClick={onToggleIndicators}
          title="المؤشرات"
        >
          IND
        </button>

        <div style={sepStyle} />

        {/* Zoom In/Out */}
        <button style={btnStyle} onClick={onZoomIn} title="تكبير">+</button>
        <button style={btnStyle} onClick={onZoomOut} title="تصغير">−</button>

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

        {/* Chart Trading */}
        {onToggleChartTrading && (
          <button
            style={toggleBtnStyle(!!showChartTrading)}
            onClick={onToggleChartTrading}
            title="تداول"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
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
          title={isPaused ? 'تشغيل' : 'إيقاف'}
        >
          {isPaused ? '▶' : '⏸'}
        </button>

        <div style={{ flex: 1 }} />

        {/* More tools menu (overflow) */}
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button style={btnStyle} onClick={() => setShowExportPanel(!showExportPanel)} title="المزيد">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
          {showExportPanel && (
            <div style={{ ...panelStyle, left: 0, minWidth: 160 }}>
              {[
                { label: '📐 أدوات الرسم', action: onToggleDrawings },
                { label: '🗑️ مسح الرسومات', action: onClearDrawings },
                { label: '📊 ملف الحجم', action: onToggleVolumeProfile || (() => {}) },
                { label: '📋 قائمة المراقبة', action: onToggleWatchlist || (() => {}) },
                { label: '💾 إدارة القوالب', action: onToggleTemplateManager || (() => {}) },
                { label: '⚙️ إعدادات الشارت', action: onToggleChartSettings || (() => {}) },
                { label: '📥 تصدير PNG', action: onExportPNG },
                { label: '📥 تصدير CSV', action: onExportCSV },
                { label: '⛶ ملء الشاشة', action: onToggleFullscreen },
              ].map(item => (
                <button
                  key={item.label}
                  style={panelItemStyle}
                  onClick={() => { item.action(); setShowExportPanel(false); }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Desktop Toolbar: grouped production layout ──
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      height: `${height}px`,
      background: COLORS.bg,
      borderBottom: `1px solid ${COLORS.border}`,
      flexShrink: 0,
      gap: 4,
      direction: 'rtl',
      overflow: 'visible',
    }}>
      <ToolbarGroup label="timeframe">
        <div ref={tfRef} style={{ position: 'relative' }}>
          <button
            style={{
              ...btnStyle,
              width: 'auto',
              minWidth: 54,
              gap: 5,
              padding: '0 8px',
              background: 'rgba(56,189,248,0.12)',
              border: '1px solid rgba(56,189,248,0.24)',
              color: COLORS.cyan,
              fontWeight: 800,
            }}
            onClick={() => setShowTimeframePanel(!showTimeframePanel)}
            title="الإطار الزمني"
          >
            <Clock3 size={13} />
            {tfLabel}
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
                        background: isActive ? 'rgba(56,189,248,0.16)' : '#1a1f2e',
                        border: `1px solid ${isActive ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.08)'}`,
                        color: isActive ? COLORS.cyan : COLORS.textSecondary,
                        borderRadius: 6,
                        padding: '6px 0',
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: isActive ? 800 : 600,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.1s',
                      }}
                      onClick={() => { onSetTimeframe(tf.value); setShowTimeframePanel(false); }}
                    >
                      {tf.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ToolbarGroup>

      <ToolbarGroup label="chart type">
        <div ref={chartTypeRef} style={{ position: 'relative' }}>
          <IconTool title="نوع الشارت" icon={BarChart3} onClick={() => setShowChartTypePanel(!showChartTypePanel)} active={showChartTypePanel} />
          {showChartTypePanel && (
            <div style={{ ...panelStyle, left: 0, minWidth: 150 }}>
              <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6, fontFamily: "'Cairo', sans-serif" }}>نوع الشارت</div>
              {CHART_TYPES.map(ct => (
                <button
                  key={ct.key}
                  style={{
                    ...panelItemStyle,
                    background: chartType === ct.key ? 'rgba(56,189,248,0.12)' : 'none',
                    color: chartType === ct.key ? COLORS.cyan : COLORS.textSecondary,
                    fontWeight: chartType === ct.key ? 800 : 500,
                  }}
                  onClick={() => { onSetChartType(ct.key); setShowChartTypePanel(false); }}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <IconTool title="شموع" icon={BarChart3} onClick={() => onSetChartType('candle')} active={chartType === 'candle'} />
        <IconTool title="خط" icon={LineChart} onClick={() => onSetChartType('line')} active={chartType === 'line'} />
      </ToolbarGroup>

      <ToolbarGroup label="indicators">
        <button
          style={{ ...btnStyle, width: 'auto', gap: 5, padding: '0 8px', fontWeight: 800 }}
          onClick={onToggleIndicators}
          title="المؤشرات"
        >
          <Activity size={13} />
          IND
        </button>
        {onToggleVolumeProfile && <IconTool title="ملف الحجم" icon={Layers} onClick={onToggleVolumeProfile} active={!!showVolumeProfile} />}
        {onToggleAIPanel && <IconTool title="AI Chart Copilot" icon={Brain} onClick={onToggleAIPanel} active={!!showAIPanel} />}
      </ToolbarGroup>

      <ToolbarGroup label="drawings">
        <IconTool title="مؤشر" icon={Crosshair} onClick={() => onSetTool('cursor')} active={activeTool === 'cursor'} />
        <IconTool title="خط اتجاه" icon={TrendingUp} onClick={() => onSetTool('trendline')} active={activeTool === 'trendline'} />
        <IconTool title="خط أفقي" icon={Minus} onClick={() => onSetTool('horizontal')} active={activeTool === 'horizontal'} />
        <IconTool title="مستطيل" icon={RectangleHorizontal} onClick={() => onSetTool('rectangle')} active={activeTool === 'rectangle'} />
        <IconTool title="أدوات الرسم" icon={PenLine} onClick={onToggleDrawings} />
        <IconTool title="مسح الرسومات" icon={Trash2} onClick={onClearDrawings} danger />
      </ToolbarGroup>

      <ToolbarGroup label="view">
        <IconTool title="تكبير" icon={ZoomIn} onClick={onZoomIn} />
        <IconTool title="تصغير" icon={ZoomOut} onClick={onZoomOut} />
        <IconTool title="إعادة ضبط" icon={RotateCcw} onClick={onResetView} />
        {onToggleWatchlist && <IconTool title="قائمة المراقبة" icon={List} onClick={onToggleWatchlist} active={!!showWatchlist} />}
        {onToggleChartTrading && <IconTool title="تداول من الشارت" icon={TrendingUp} onClick={onToggleChartTrading} active={!!showChartTrading} />}
        {onToggleTemplateManager && <IconTool title="Preset layouts" icon={Eye} onClick={onToggleTemplateManager} />}
        {onToggleChartSettings && <IconTool title="إعدادات الشارت" icon={Settings} onClick={onToggleChartSettings} />}
        <IconTool title={isPaused ? 'تشغيل التحديث' : 'إيقاف التحديث'} icon={isPaused ? Play : Pause} onClick={onTogglePause} active={isPaused} />
      </ToolbarGroup>

      <div style={{ flex: 1 }} />

      <ToolbarGroup label="export">
        <div ref={exportRef} style={{ position: 'relative' }}>
          <IconTool title="تصدير" icon={Download} onClick={() => setShowExportPanel(!showExportPanel)} active={showExportPanel} />
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
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <IconTool
          title={isFullscreen ? 'خروج من ملء الشاشة' : 'ملء الشاشة'}
          icon={isFullscreen ? Minimize2 : Maximize2}
          onClick={onToggleFullscreen}
          active={!!isFullscreen}
        />
      </ToolbarGroup>
    </div>
  );
}
