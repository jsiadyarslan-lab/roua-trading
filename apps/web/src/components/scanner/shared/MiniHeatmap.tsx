'use client'

interface MiniHeatmapProps {
  data: number[]
  color?: string
  width?: number
  height?: number
}

export function MiniHeatmap({
  data, color = '#00D4FF', width = 72, height = 24,
}: MiniHeatmapProps) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const bins = 8
  const binSize = range / bins

  // Calculate volume intensity per price bin
  const binCounts = new Array(bins).fill(0)
  for (const v of data) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / binSize))
    binCounts[idx]++
  }
  const maxCount = Math.max(...binCounts, 1)

  const barWidth = width / bins
  const colors = data[data.length - 1] >= data[0] ? ['#00FFA3', '#00CC82', '#00994D'] : ['#FF4757', '#FF3344', '#CC2233']

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
