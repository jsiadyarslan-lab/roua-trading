// SPLIT (3.2): Extracted from RouaChart.tsx — Grid Cell Header section
// Renders the header bar for grid cells in multi-chart mode, including
// symbol selector dropdown, timeframe buttons, expand/collapse, and close button.

'use client';

import React from 'react'

// ── Constants (duplicated from RouaChart to keep this component self-contained) ──

const POPULAR_SYMBOLS_MINI = [
  // V432: all 12 backend-supported crypto + key forex/metals
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

// ── Types ──

export interface ChartGridCellHeaderProps {
  /** Called when user clicks the header to make this cell active */
  onActivate: () => void;
  /** Whether this cell is currently the active chart */
  isActive: boolean;
  /** Currently selected symbol */
  symbol: string;
  /** Currently selected timeframe */
  timeframe: string;
  /** Callback when user changes symbol in dropdown */
  onSymbolChange: (symbol: string) => void;
  /** Callback when user changes timeframe */
  onTimeframeChange: (timeframe: string) => void;
  /** Whether the chart feed is paused */
  isPaused: boolean;
  /** Current feed state (shows spinner when 'waiting') */
  feedState: 'live' | 'fallback' | 'waiting';
  /** Whether the expand/collapse button is shown */
  canToggleExpand: boolean;
  /** Whether the cell is currently expanded */
  isExpanded: boolean;
  /** Callback when user clicks expand/collapse */
  onToggleExpand: () => void;
  /** Whether the close button is shown */
  canClose: boolean;
  /** Callback when user clicks close */
  onClose: () => void;
}

export function ChartGridCellHeader({
  onActivate,
  isActive,
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange,
  isPaused,
  feedState,
  canToggleExpand,
  isExpanded,
  onToggleExpand,
  canClose,
  onClose,
}: ChartGridCellHeaderProps) {
  return (
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
      <select value={symbol} onClick={e => e.stopPropagation()}
        aria-label="Select symbol"
        onChange={e => {
          e.stopPropagation();
          onSymbolChange(e.target.value);
        }}
        style={{
          background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
          borderRadius: 'var(--radius-xs)', color: '#00D4FF', fontFamily: "var(--font-mono)",
          fontSize: 11, fontWeight: 700, padding: '1px 4px', cursor: 'pointer',
          outline: 'none', maxWidth: 95, flexShrink: 0,
        }}
      >
        {POPULAR_SYMBOLS_MINI.map(p => (
          <option key={p} value={p} style={{ background: '#151A22', color: '#F0F2F5' }}>{p}</option>
        ))}
      </select>

      {/* Timeframe buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
        {TIMEFRAME_MINI.map(tf => {
          const active = timeframe === tf.value;
          return (
            <button key={tf.value}
              onClick={e => { e.stopPropagation(); onTimeframeChange(tf.value); }}
              aria-label={`Timeframe ${tf.label}`}
              aria-pressed={active}
              style={{
                background: active ? 'rgba(0,212,255,0.15)' : 'transparent',
                border: active ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
                borderRadius: 'var(--radius-xs)', color: active ? '#00D4FF' : '#6B7280',
                fontFamily: "var(--font-mono)", fontSize: 11,
                fontWeight: active ? 700 : 500, padding: '0 3px', height: 18,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >{tf.label}</button>
          );
        })}
      </div>
      {isPaused && (
        <span style={{ color: '#FFB800', fontSize: 11, fontWeight: 700 }}>⏸</span>
      )}
      {feedState === 'waiting' && (
        <div style={{ width: 8, height: 8, border: '2px solid #1E2530',
          borderTopColor: '#00D4FF', borderRadius: '50%', animation: 'mcSpin 1s linear infinite' }} />
      )}
      <div style={{ flex: 1 }} />
      {/* Expand/Collapse button */}
      {canToggleExpand && (
        <button onClick={e => { e.stopPropagation(); onToggleExpand(); }}
          aria-label={isExpanded ? 'Collapse chart' : 'Maximize chart'}
          aria-pressed={isExpanded}
          style={{
            background: isExpanded ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)',
            border: isExpanded ? '1px solid rgba(0,212,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-xs)', color: isExpanded ? '#00D4FF' : '#6B7280', width: 16, height: 16, cursor: 'pointer',
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
      {canClose && (
        <button onClick={e => { e.stopPropagation(); onClose(); }}
          aria-label="Close chart"
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-xs)', color: '#6B7280', width: 16, height: 16, cursor: 'pointer',
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
  );
}
