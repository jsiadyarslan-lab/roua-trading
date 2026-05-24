// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Draggable Panel
// Uses DOM manipulation during drag — no React re-render flicker
// ═══════════════════════════════════════════════════════════

import React, { useState, useRef, useCallback, useMemo, type ReactNode } from 'react';

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

  // Convert right→left once at mount
  const initPos = useMemo(() => {
    const p = defaultPosition as any;
    if (p.right !== undefined && p.left === undefined) {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1366;
      return { top: p.top ?? 120, left: Math.max(0, w - defaultWidth - p.right) };
    }
    return { top: p.top ?? 120, left: p.left ?? 20 };
  }, []); // eslint-disable-line

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-drag-handle]')) return;
    e.preventDefault();
    e.stopPropagation();

    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current.dragging || !panelRef.current) return;
      const dx = me.clientX - dragRef.current.startX;
      const dy = me.clientY - dragRef.current.startY;
      const newLeft = Math.max(0, Math.min(window.innerWidth - (panelRef.current.offsetWidth || defaultWidth), dragRef.current.startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startTop + dy));
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
      ref={panelRef}
      data-draggable-panel="true"
      className={className}
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        left: initPos.left,
        top: initPos.top,
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
