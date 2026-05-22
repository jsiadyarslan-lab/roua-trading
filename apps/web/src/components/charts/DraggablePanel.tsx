// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Draggable & Resizable Panel Wrapper
// Makes any floating panel on the chart draggable and resizable
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

interface DraggablePanelProps {
  children: ReactNode;
  /** Initial position — defaults to top-right */
  defaultPosition?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Minimum width for resize */
  minWidth?: number;
  /** Minimum height for resize */
  minHeight?: number;
  /** Initial width */
  defaultWidth?: number;
  /** Whether resize is allowed */
  resizable?: boolean;
  /** Extra CSS for the outer wrapper */
  style?: React.CSSProperties;
  /** CSS class name */
  className?: string;
}

export function DraggablePanel({
  children,
  defaultPosition = { top: 42, right: 8 },
  minWidth = 200,
  minHeight = 100,
  defaultWidth,
  resizable = true,
  style,
  className,
}: DraggablePanelProps) {
  // ── Position state ──
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Drag state ──
  const dragState = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  }>({ isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });

  // ── Resize state ──
  const resizeState = useRef<{
    isResizing: boolean;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  }>({ isResizing: false, startX: 0, startY: 0, startW: 0, startH: 0 });

  // Initialize position from defaults on first mount
  useEffect(() => {
    if (pos !== null) return;
    if (!panelRef.current) return;

    const parent = panelRef.current.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    let x = 0;
    let y = 0;

    if (defaultPosition.right !== undefined) {
      x = parentRect.width - (defaultPosition.right || 0) - (panelRef.current.offsetWidth || 280);
    } else if (defaultPosition.left !== undefined) {
      x = defaultPosition.left;
    }

    if (defaultPosition.top !== undefined) {
      y = defaultPosition.top;
    } else if (defaultPosition.bottom !== undefined) {
      y = parentRect.height - (defaultPosition.bottom || 0) - (panelRef.current.offsetHeight || 300);
    }

    setPos({ x: Math.max(0, x), y: Math.max(0, y) });
  }, [defaultPosition, pos]);

  // ── Drag handlers ──
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only drag from header area (first child or element with data-drag-handle)
    const target = e.target as HTMLElement;
    if (!target.closest('[data-drag-handle]')) return;

    e.preventDefault();
    e.stopPropagation();

    const currentLeft = panelRef.current?.offsetLeft || 0;
    const currentTop = panelRef.current?.offsetTop || 0;

    dragState.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: currentLeft,
      startTop: currentTop,
    };

    const handleDragMove = (moveEvent: MouseEvent) => {
      if (!dragState.current.isDragging) return;
      const dx = moveEvent.clientX - dragState.current.startX;
      const dy = moveEvent.clientY - dragState.current.startY;
      const newX = dragState.current.startLeft + dx;
      const newY = dragState.current.startTop + dy;
      setPos({ x: Math.max(0, newX), y: Math.max(0, newY) });
    };

    const handleDragEnd = () => {
      dragState.current.isDragging = false;
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  }, []);

  // ── Resize handlers ──
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (!resizable) return;
    e.preventDefault();
    e.stopPropagation();

    const currentW = panelRef.current?.offsetWidth || 280;
    const currentH = panelRef.current?.offsetHeight || 300;

    resizeState.current = {
      isResizing: true,
      startX: e.clientX,
      startY: e.clientY,
      startW: currentW,
      startH: currentH,
    };

    const handleResizeMove = (moveEvent: MouseEvent) => {
      if (!resizeState.current.isResizing) return;
      const dx = moveEvent.clientX - resizeState.current.startX;
      const dy = moveEvent.clientY - resizeState.current.startY;
      setSize({
        w: Math.max(minWidth, resizeState.current.startW + dx),
        h: Math.max(minHeight, resizeState.current.startH + dy),
      });
    };

    const handleResizeEnd = () => {
      resizeState.current.isResizing = false;
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [resizable, minWidth, minHeight]);

  // Convert defaultPosition to CSS for initial render (before drag sets pos)
  const initialStyle: React.CSSProperties = pos === null
    ? {
        position: 'absolute',
        ...defaultPosition,
      }
    : {
        position: 'absolute',
        left: pos.x,
        top: pos.y,
      };

  const sizeStyle: React.CSSProperties = size
    ? { width: size.w, height: size.h }
    : defaultWidth
      ? { width: defaultWidth, minHeight }
      : { minHeight };

  return (
    <div
      ref={panelRef}
      className={className}
      onMouseDown={handleDragStart}
      style={{
        ...initialStyle,
        ...sizeStyle,
        ...style,
        zIndex: 500,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}

      {/* Resize handle — bottom-right corner */}
      {resizable && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 16,
            height: 16,
            cursor: 'nwse-resize',
            zIndex: 501,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: 2,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.3 }}>
            <line x1="9" y1="1" x2="1" y2="9" stroke="#8B92A8" strokeWidth="1" />
            <line x1="9" y1="4" x2="4" y2="9" stroke="#8B92A8" strokeWidth="1" />
            <line x1="9" y1="7" x2="7" y2="9" stroke="#8B92A8" strokeWidth="1" />
          </svg>
        </div>
      )}
    </div>
  );
}
