import T from '@/lib/unified-tokens'

'use client'

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

interface MiniHeatmapProps {
  data: number[]
  color?: string
  width?: number
  height?: number
}

export function MiniHeatmap({
  data, color = T.info, width = 72, height = 24,
}: MiniHeatmapProps) {
  if (!data || data.length < 2) return null

  const min = safeMin(data)
  const max = safeMax(data)
  const range = max - min || 1
  const bins = 8
  const binSize = range / bins

  // Calculate volume intensity per price bin
  const binCounts = new Array(bins).fill(0)
  for (const v of data) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / binSize))
    binCounts[idx]++
  }
  const maxCount = Math.max(safeMax(binCounts), 1)

  const barWidth = width / bins
  const colors = data[data.length - 1] >= data[0] ? [T.success, T.greenDim, '#00994D'] : [T.danger, '#FF3344', '#CC2233']

  return (
    <svg width={width} height={height} style={{ flexShrink: 0, direction: 'ltr' }}>
      {binCounts.map((count, i) => {
        const intensity = count / maxCount
        const barHeight = Math.max(2, intensity * (height - 2))
        const colorIdx = intensity > 0.7 ? 0 : intensity > 0.4 ? 1 : 2
        return (
          <rect
            key={i}
            x={i * barWidth + 1}
            y={height - barHeight}
            width={barWidth - 2}
            height={barHeight}
            rx={1}
            fill={colors[colorIdx]}
            opacity={0.3 + intensity * 0.7}
          />
        )
      })}
    </svg>
  )
}
