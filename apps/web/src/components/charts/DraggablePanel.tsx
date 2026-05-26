// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Draggable Panel
// BULLETPROOF: Position managed entirely via DOM manipulation.
// - Initial position set via ref callback (synchronous, before paint)
// - Drag position updated via direct DOM style manipulation
// - React style prop NEVER includes left/top → re-renders cannot reset position
// ═══════════════════════════════════════════════════════════

import React, { useRef, useCallback, type ReactNode } from 'react';

interface DraggablePanelProps {
  children: ReactNode;
  defaultPosition?: { top?: number; left?: number; right?: number; bottom?: number };
  defaultWidth?: number;
  minHeight?: number;
  minWidth?: number;
  resizable?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export function DraggablePanel({
  children,
  defaultPosition = { top: 120, right: 290 },
  defaultWidth = 340,
  minHeight = 360,
  minWidth = 280,
  resizable = false,
  style,
  className,
}: DraggablePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });

  // Compute initial position (right→left conversion)
  const computeInitPos = () => {
    const p = defaultPosition as any;
    if (p.right !== undefined && p.left === undefined) {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1366;
      return { top: p.top ?? 120, left: Math.max(0, w - defaultWidth - p.right) };
    }
    return { top: p.top ?? 120, left: p.left ?? 20 };
  };

  // ── Ref callback: set initial position SYNCHRONOUSLY before paint ──
  // Uses data-positioned flag to ensure it only runs once.
  // This avoids the flash of panel at (0,0) that useEffect would cause.
  const setRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    panelRef.current = el;
    if (el.dataset.positioned) return; // already positioned
    el.dataset.positioned = 'true';
    const pos = computeInitPos();
    el.style.left = `${pos.left}px`;
    el.style.top = `${pos.top}px`;
  }, []); // eslint-disable-line — computeInitPos uses props which are stable

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-drag-handle]')) return;
    e.preventDefault();
    e.stopPropagation();

    const panel = panelRef.current;
    if (!panel) return;

    // Read ACTUAL current position from the DOM (not from React state)
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current.dragging || !panelRef.current) return;
      const dx = me.clientX - dragRef.current.startX;
      const dy = me.clientY - dragRef.current.startY;
      const newLeft = Math.max(0, Math.min(window.innerWidth - (panelRef.current.offsetWidth || defaultWidth), dragRef.current.startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startTop + dy));
      // Direct DOM manipulation only — React never touches left/top
      panelRef.current.style.left = `${newLeft}px`;
      panelRef.current.style.top = `${newTop}px`;
    };

    const onUp = () => {
      dragRef.current.dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [defaultWidth]);

  return (
    <div
      ref={setRef}
      data-draggable-panel="true"
      className={className}
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        // ⚠️ left and top are NEVER in the React style prop.
        // They are set via ref callback (initial) + DOM manipulation (drag).
        // This makes position immune to React re-render resets.
        width: defaultWidth,
        minHeight,
        zIndex: 9999,
        userSelect: 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
