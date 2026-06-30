'use client'

import { useId, useMemo } from 'react'
import { ScopedStyle } from '@/components/ScopedStyle'

function safeMax(arr: number[]): number {
  if (arr.length === 0) return -Infinity;
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] > max) max = arr[i]; }
  return max;
}
function safeMin(arr: number[]): number {
  if (arr.length === 0) return Infinity;
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] < min) min = arr[i]; }
  return min;
}

interface PortfolioSparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
}

export function PortfolioSparkline({
  data,
  color = '#0A84FF',
  width = 200,
  height = 40,
}: PortfolioSparklineProps) {
  // V594 FIX: all hooks must be called BEFORE any early return (React rules of hooks)
  // Previously useId() was called after the early return → React error #310
  const reactId = useId()
  const gradientId = `sparkline-grad-${reactId.replace(/:/g, '')}`

  const pathData = useMemo(() => {
    if (!data || data.length < 2) return { line: '', fill: '' }

    const mn = safeMin(data)
    const mx = safeMax(data)
    const range = mx - mn || 1

    const padding = 2
    const chartW = width - padding * 2
    const chartH = height - padding * 2

    const points = data.map((val, i) => {
      const x = padding + (i / (data.length - 1)) * chartW
      const y = padding + chartH - ((val - mn) / range) * chartH
      return { x, y }
    })

    // Build smooth line path
    let line = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx1 = prev.x + (curr.x - prev.x) * 0.4
      const cpx2 = prev.x + (curr.x - prev.x) * 0.6
      line += ` C ${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`
    }

    // Fill path (close to bottom)
    const fill =
      line +
      ` L ${points[points.length - 1].x},${height}` +
      ` L ${points[0].x},${height} Z`

    return { line, fill }
  }, [data, width, height])

  if (!data || data.length < 2) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6F849C',
          fontSize: 12,
          fontFamily: "var(--font-mono)",
        }}
      >
        —
      </div>
    )
  }

  const lastVal = data[data.length - 1]
  const firstVal = data[0]
  const isUp = lastVal >= firstVal
  const lineColor = isUp ? color : '#FF4757'

  return (
    <div
      style={{
        width,
        height,
        animation: 'sparklineFadeIn 0.5s ease-out',
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Fill area */}
        <path
          d={pathData.fill}
          fill={`url(#${gradientId})`}
        />

        {/* Line */}
        <path
          d={pathData.line}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* End dot */}
        {data.length > 0 && (
          <circle
            cx={
              2 +
              ((data.length - 1) / (data.length - 1)) * (width - 4)
            }
            cy={
              2 +
              (height - 4) -
              ((lastVal - safeMin(data)) /
                (safeMax(data) - safeMin(data) || 1)) *
                (height - 4)
            }
            r={2.5}
            fill={lineColor}
            style={{
              filter: `drop-shadow(0 0 4px ${lineColor})`,
            }}
          />
        )}
      </svg>

      <ScopedStyle>{`
        @keyframes sparklineFadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</ScopedStyle>
    </div>
  )
}
