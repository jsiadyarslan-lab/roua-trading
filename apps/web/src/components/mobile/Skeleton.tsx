'use client'

import React from 'react'

/* ═══════════════════════════════════════════════════════════════
   ROUA MOBILE — Reusable Skeleton Loading Components
   Lightweight CSS-driven pulse & shimmer animations.
   ═══════════════════════════════════════════════════════════════ */

// ── SkeletonLine: horizontal line placeholder for text ──
interface SkeletonLineProps {
  width?: string | number
  height?: string | number
  className?: string
  style?: React.CSSProperties
}

export function SkeletonLine({
  width = '100%',
  height = 12,
  className = '',
  style,
}: SkeletonLineProps) {
  return (
    <div
      className={`r-skeleton r-skeleton--shimmer ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: 6,
        ...style,
      }}
    />
  )
}

// ── SkeletonCard: card-shaped placeholder ──
interface SkeletonCardProps {
  width?: string | number
  height?: string | number
  className?: string
  style?: React.CSSProperties
  /** Number of inner lines to render (for richer card skeleton) */
  lines?: number
}

export function SkeletonCard({
  width = '100%',
  height,
  className = '',
  style,
  lines,
}: SkeletonCardProps) {
  return (
    <div
      className={`r-card ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        ...(height ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
        ...style,
      }}
    >
      {lines ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: lines }).map((_, i) => (
            <SkeletonLine
              key={i}
              width={i === lines - 1 ? '60%' : '100%'}
              height={i === 0 ? 16 : 10}
            />
          ))}
        </div>
      ) : (
        <div
          className="r-skeleton r-skeleton--shimmer"
          style={{
            width: '100%',
            height: height ? (typeof height === 'number' ? `${height}px` : height) : '100px',
            borderRadius: 'var(--radius-lg, 12px)',
          }}
        />
      )}
    </div>
  )
}

// ── SkeletonCircle: circular placeholder for icons/avatars ──
interface SkeletonCircleProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function SkeletonCircle({ size = 40, className = '', style }: SkeletonCircleProps) {
  return (
    <div
      className={`r-skeleton r-skeleton--shimmer ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}

// ── SkeletonGrid: grid of skeleton cards for list placeholders ──
interface SkeletonGridProps {
  count?: number
  columns?: number
  cardHeight?: number | string
  className?: string
  style?: React.CSSProperties
  /** Use "line" style cards with inner text lines */
  lines?: number
}

export function SkeletonGrid({
  count = 3,
  columns = 1,
  cardHeight,
  className = '',
  style,
  lines,
}: SkeletonGridProps) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 8,
        ...style,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} height={cardHeight} lines={lines} />
      ))}
    </div>
  )
}

// ── SkeletonRow: single row placeholder (for market list items) ──
interface SkeletonRowProps {
  className?: string
  style?: React.CSSProperties
}

export function SkeletonRow({ className = '', style }: SkeletonRowProps) {
  return (
    <div
      className={`r-card ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        ...style,
      }}
    >
      {/* Icon placeholder */}
      <SkeletonCircle size={34} />
      {/* Text lines */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonLine width="50%" height={12} />
        <SkeletonLine width="30%" height={8} />
      </div>
      {/* Price placeholder */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <SkeletonLine width={60} height={12} />
        <SkeletonLine width={40} height={8} />
      </div>
    </div>
  )
}
