'use client'

import T from '@/lib/unified-tokens'
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

interface SparklineChartProps {
  data: number[]
  color?: string
  width?: number
  height?: number
  showArea?: boolean
}

export function SparklineChart({
  data, color = T.success, width = 80, height = 28, showArea = true,
}: SparklineChartProps) {
  if (!data || data.length < 2) return null

  const min = safeMin(data)
  const max = safeMax(data)
  const range = max - min || 1
  const padY = 2

  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: padY + ((max - v) / range) * (height - padY * 2),
  }))

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ')
  const minIdx = data.indexOf(min)
  const maxIdx = data.indexOf(max)

  const gradId = `sp-${Math.random().toString(36).slice(2, 8)}`

  // Area path
  const areaPath = showArea
    ? `M${points[0].x},${points[0].y} ` +
      points.slice(1).map(p => `L${p.x},${p.y}`).join(' ') +
      ` L${width},${height} L0,${height} Z`
    : ''

  return (
    <svg width={width} height={height} style={{ flexShrink: 0, direction: 'ltr' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Area fill */}
      {showArea && <path d={areaPath} fill={`url(#${gradId})`} />}

      {/* Line */}
      <polyline points={polyline} fill="none" stroke={color}
        strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* Min dot */}
      <circle cx={points[minIdx].x} cy={points[minIdx].y} r={2}
        fill={color} opacity={0.7} />

      {/* Max dot */}
      <circle cx={points[maxIdx].x} cy={points[maxIdx].y} r={2}
        fill={color} opacity={0.7} />
    </svg>
  )
}
