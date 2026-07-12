// SPLIT (3.2): Extracted from RouaChart.tsx — Overlay rendering section
// Renders fill zones (colored bands between entry-SL/TP), trade line labels
// (entry/SL/TP badges on the left side), and the drag overlay for SL/TP adjustment.

'use client';

import React from 'react'

// ── Types ──

export interface TradeOverlayItem {
  key: string;
  y: number | null;
  price: number;
  type: 'entry' | 'sl' | 'tp';
  direction: 'long' | 'short';
  source: 'manual' | 'bot' | 'exchange';
  qty: number;
  pnl?: number;
  linePnl?: number;
  positionId?: string;
}

export interface FillZone {
  top: number;
  height: number;
  type: 'sl' | 'tp';
  key: string;
}

export interface DragState {
  key: string;
  type: 'sl' | 'tp';
  startY: number;
  currentY: number;
  originalPrice: number;
  positionKey: string;
}

export interface ChartOverlayPanelProps {
  /** Colored fill zones between entry and SL/TP lines */
  fillZones: FillZone[];
  /** Trade overlay labels (entry/SL/TP) positioned by price */
  tradeOverlays: TradeOverlayItem[];
  /** Current drag state for SL/TP line adjustment */
  dragState: DragState | null;
  /** Called when user starts dragging an SL/TP label */
  onStartDrag: (key: string, type: 'sl' | 'tp', clientY: number, price: number, positionKey: string) => void;
  /** Called during SL/TP drag — mouse move */
  onDragMove: (clientY: number) => void;
  /** Called when SL/TP drag ends — mouse up */
  onDragEnd: (clientY: number) => void;
  /** Called when drag is cancelled (mouse leaves) */
  onDragCancel: () => void;
}

export function ChartOverlayPanel({
  fillZones,
  tradeOverlays,
  dragState,
  onStartDrag,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: ChartOverlayPanelProps) {
  return (
    <>
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

        const color = isEntry ? (ov.direction === 'long' ? '#00D4FF' : '#FFB800')
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

        const isDraggable = (isSL || isTP);

        return (
          <div key={ov.key} data-trade-label={ov.key} data-price={String(ov.price)} style={{
            position: 'absolute',
            top: 0,
            left: 6,
            zIndex: 15,
            pointerEvents: isDraggable ? 'auto' : 'none',
            touchAction: isDraggable ? 'none' : 'auto',
            // Position ABOVE the line (label height ~20px + 4px gap)
            transform: `translateY(${ov.y - 24}px)`,
            willChange: 'transform',
            cursor: isDraggable ? 'ns-resize' : 'default',
            userSelect: 'none',
          }}
            onMouseDown={isDraggable ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              const posKey = ov.key.replace(/-(sl|tp)-.*$/, '');
              onStartDrag(ov.key, ov.type as 'sl' | 'tp', e.clientY, ov.price, posKey);
            } : undefined}
          >
            {/* Main label badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: bgSolid,
              border: `1.5px solid ${color}`,
              borderRadius: 'var(--radius-sm)',
              padding: '2px 7px 2px 6px',
              boxShadow: `0 0 8px ${color}55, 0 2px 4px rgba(0,0,0,0.4)`,
            }}>
              <span style={{
                color,
                fontFamily: "var(--font-mono)",
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                letterSpacing: 0.5,
                whiteSpace: 'nowrap',
              }}>
                {typeLabel}
              </span>
              {pnlText && (
                <span style={{
                  color: ov.linePnl !== undefined && ov.linePnl >= 0 ? '#00FFA3' : '#FF4757',
                  fontFamily: "var(--font-mono)",
                  fontSize: 'var(--text-xs)',
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
                  fontSize: 'var(--text-xs)',
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
        }}
          onMouseMove={(e) => {
            onDragMove(e.clientY);
          }}
          onMouseUp={(e) => {
            onDragEnd(e.clientY);
          }}
          onMouseLeave={onDragCancel}
        />
      )}
    </>
  );
}
