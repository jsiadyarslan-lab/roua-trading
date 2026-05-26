// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Draggable Panel
// BULLETPROOF v3: Position via useState + transform: translate
//
// Why this approach works:
// 1. Uses useState for position → React ALWAYS knows current position
// 2. Uses transform: translate for rendering → GPU accelerated, RTL-safe
// 3. Updates position in requestAnimationFrame during drag → smooth 60fps
// 4. No stale closures, no DOM vs React state conflicts, no remount issues
// ═══════════════════════════════════════════════════════════

import React, { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

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
  // ── Compute initial position (right→left conversion) ──
  const computeInitPos = useCallback(() => {
    const p = defaultPosition as any;
    if (p.right !== undefined && p.left === undefined) {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1366;
      return { x: Math.max(0, w - defaultWidth - p.right), y: p.top ?? 120 };
    }
    return { x: p.left ?? 20, y: p.top ?? 120 };
  }, [defaultPosition, defaultWidth]);

  // ── Position is React state — React always knows the current position ──
  const [pos, setPos] = useState(computeInitPos);

  // ── Drag state in ref — not affected by re-renders ──
  const dragRef = useRef({
    active: false,
    startMouseX: 0,
    startMouseY: 0,
    startPosX: 0,
    startPosY: 0,
    rafId: 0,
    currentX: 0,
    currentY: 0,
  });

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (dragRef.current.rafId) {
        cancelAnimationFrame(dragRef.current.rafId);
      }
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-drag-handle]')) return;
    e.preventDefault();
    e.stopPropagation();

    // Store drag start state
    dragRef.current.active = true;
    dragRef.current.startMouseX = e.clientX;
    dragRef.current.startMouseY = e.clientY;
    dragRef.current.startPosX = pos.x;
    dragRef.current.startPosY = pos.y;
    dragRef.current.currentX = pos.x;
    dragRef.current.currentY = pos.y;

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current.active) return;

      const dx = me.clientX - dragRef.current.startMouseX;
      const dy = me.clientY - dragRef.current.startMouseY;
      const newX = Math.max(0, Math.min(window.innerWidth - defaultWidth, dragRef.current.startPosX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startPosY + dy));

      dragRef.current.currentX = newX;
      dragRef.current.currentY = newY;

      // Use requestAnimationFrame for smooth rendering
      // Batch position update to React state
      if (dragRef.current.rafId) cancelAnimationFrame(dragRef.current.rafId);
      dragRef.current.rafId = requestAnimationFrame(() => {
        setPos({ x: dragRef.current.currentX, y: dragRef.current.currentY });
      });
    };

    const onUp = () => {
      dragRef.current.active = false;
      if (dragRef.current.rafId) {
        cancelAnimationFrame(dragRef.current.rafId);
        dragRef.current.rafId = 0;
      }
      // Final position update (ensure React state matches final position)
      setPos({ x: dragRef.current.currentX, y: dragRef.current.currentY });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [pos.x, pos.y, defaultWidth]);

  return (
    <div
      data-draggable-panel="true"
      className={className}
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: defaultWidth,
        minHeight,
        zIndex: 9999,
        userSelect: 'none',
        // Use transform for positioning — GPU accelerated and RTL-safe
        // React state ensures position survives re-renders
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
