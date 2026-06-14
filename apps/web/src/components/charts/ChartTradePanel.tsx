// SPLIT (3.2): Extracted from RouaChart.tsx — Quick Trade Controls section
// Renders the floating buy/sell buttons, lot size controls, and collapse toggle
// that appear on the left side of the chart overlay.

'use client';

import React from 'react';

export interface ChartTradePanelProps {
  /** Whether the panel is visible (requires desktop + currentPrice) */
  visible: boolean;
  /** Current drawing tool — panel is pointer-events:none when not 'cursor' */
  activeTool: string;
  /** Whether the trade panel is collapsed to just the toggle button */
  collapsed: boolean;
  /** Toggle collapsed state */
  onToggleCollapsed: () => void;
  /** Current lot size */
  lotSize: number;
  /** Update lot size */
  onSetLotSize: (size: number) => void;
  /** Buy/long action */
  onBuyLong: () => void;
  /** Sell/short action */
  onSellShort: () => void;
  /** Localized label for the buy button (e.g. "▲ شراء") */
  buyLabel: string;
  /** Localized label for the sell button (e.g. "▼ بيع") */
  sellLabel: string;
}

export function ChartTradePanel({
  visible,
  activeTool,
  collapsed,
  onToggleCollapsed,
  lotSize,
  onSetLotSize,
  onBuyLong,
  onSellShort,
  buyLabel,
  sellLabel,
}: ChartTradePanelProps) {
  if (!visible) return null;

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
        alignItems: 'center',
        gap: 3,
        borderRadius: 10,
        background: 'rgba(8,10,18,0.88)',
        backdropFilter: 'blur(24px) saturate(2)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        padding: collapsed ? '3px' : '5px 6px',
        pointerEvents: activeTool === 'cursor' ? 'auto' : 'none',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Collapse Toggle — top center */}
      <button
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand trade panel' : 'Collapse trade panel'}
        aria-expanded={!collapsed}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: 'none',
          borderRadius: 4,
          color: 'rgba(255,255,255,0.35)',
          width: collapsed ? 20 : '100%',
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
          <polyline points={collapsed ? '1 1 5 5 9 1' : '1 5 5 1 9 5'} />
        </svg>
      </button>

      {/* Trade Buttons (collapsible) */}
      {!collapsed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Buy Button */}
          <button
            className="roua-btn-buy"
            aria-label="Buy long"
            onClick={onBuyLong}
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
            {buyLabel}
          </button>

          {/* LOT */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 5, padding: '2px 4px' }}>
            <button
              onClick={() => onSetLotSize(Math.max(0.01, +(lotSize - 0.01).toFixed(2)))}
              aria-label="Decrease lot size"
              style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', padding: '0 2px', outline: 'none' }}
            >−</button>
            <span style={{ color: '#ccc', fontSize: 9, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", minWidth: 28, textAlign: 'center' }}>
              {lotSize.toFixed(2)}
            </span>
            <button
              onClick={() => onSetLotSize(+(lotSize + 0.01).toFixed(2))}
              aria-label="Increase lot size"
              style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', padding: '0 2px', outline: 'none' }}
            >+</button>
          </div>

          {/* Sell Button */}
          <button
            className="roua-btn-sell"
            aria-label="Sell short"
            onClick={onSellShort}
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
            {sellLabel}
          </button>
        </div>
      )}
    </div>
  );
}
