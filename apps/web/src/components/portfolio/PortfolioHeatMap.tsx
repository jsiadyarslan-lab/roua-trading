'use client'

import { useMemo } from 'react'
import { T } from '@/lib/theme-tokens'
import { getPnlSign } from '@/lib/unified-tokens'

interface HeatMapPosition {
  symbol: string
  unrealizedPnl: number
  marketValue: number
}

interface PortfolioHeatMapProps {
  positions: HeatMapPosition[]
}

function pnlToColor(pnlPct: number): string {
  // Green shades for profitable, red shades for losing, neutral for zero
  if (pnlPct > 0) {
    const intensity = Math.min(Math.abs(pnlPct) / 10, 1) // normalize to 0-1
    const r = Math.round(0 + intensity * 0)
    const g = Math.round(100 + intensity * 155)
    const b = Math.round(60 + intensity * 43)
    const a = 0.3 + intensity * 0.7
    return `rgba(${r},${g},${b},${a})`
  } else if (pnlPct < 0) {
    const intensity = Math.min(Math.abs(pnlPct) / 10, 1)
    const r = Math.round(180 + intensity * 75)
    const g = Math.round(50 - intensity * 30)
    const b = Math.round(50 - intensity * 30)
    const a = 0.3 + intensity * 0.7
    return `rgba(${r},${g},${b},${a})`
  } else {
    return 'rgba(139,146,168,0.3)'
  }
}

export function PortfolioHeatMap({ positions }: PortfolioHeatMapProps) {
  const grid = useMemo(() => {
    if (positions.length === 0) return []

    // Calculate total market value for sizing
    const totalValue = positions.reduce((sum, p) => sum + Math.abs(p.marketValue), 0)
    if (totalValue === 0) return []

    // Sort by absolute market value descending
    const sorted = [...positions].sort(
      (a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue)
    )

    return sorted.map((p) => {
      const pnlPct =
        p.marketValue !== 0
          ? (p.unrealizedPnl / Math.abs(p.marketValue)) * 100
          : 0
      const sizeRatio = Math.abs(p.marketValue) / totalValue

      return {
        symbol: p.symbol,
        pnlPct,
        unrealizedPnl: p.unrealizedPnl,
        marketValue: p.marketValue,
        color: pnlToColor(pnlPct),
        sizeRatio,
      }
    })
  }, [positions])

  if (grid.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 80,
          color: T.textMuted,
          fontSize: 10,
          fontFamily: "'Cairo', sans-serif",
          direction: 'rtl',
        }}
      >
        لا توجد مراكز
      </div>
    )
  }

  // Determine grid layout: try to fit into a near-square
  const count = grid.length
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const cellSize = 36
  const gap = 3

  const svgWidth = cols * (cellSize + gap) - gap
  const svgHeight = rows * (cellSize + gap) - gap

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 8,
        direction: 'rtl',
      }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ overflow: 'visible' }}
      >
        {grid.map((item, i) => {
          const col = i % cols
          const row = Math.floor(i / cols)
          const x = col * (cellSize + gap)
          const y = row * (cellSize + gap)

          // Size proportional to position size (min 60% of cell)
          const scale = 0.6 + item.sizeRatio * 0.4
          const rectSize = cellSize * scale
          const offset = (cellSize - rectSize) / 2

          const pnlLabel =
            item.pnlPct > 0
              ? `+${item.pnlPct.toFixed(1)}%`
              : `${item.pnlPct.toFixed(1)}%`

          return (
            <g key={item.symbol}>
              <rect
                x={x + offset}
                y={y + offset}
                width={rectSize}
                height={rectSize}
                rx={4}
                ry={4}
                fill={item.color}
                stroke={item.pnlPct > 0 ? T.green : item.pnlPct < 0 ? T.red : T.text2}
                strokeWidth={0.5}
                strokeOpacity={0.3}
              >
                <title>
                  {item.symbol}: {pnlLabel} (${Number(item.unrealizedPnl) > 0 ? '+' : ''}
                  {Number(item.unrealizedPnl).toFixed(2)})
                </title>
              </rect>
              {/* Symbol text */}
              <text
                x={x + cellSize / 2}
                y={y + cellSize / 2 - 3}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize={7}
                fontWeight={800}
                fontFamily="'JetBrains Mono', monospace"
                style={{ pointerEvents: 'none' }}
              >
                {item.symbol.length > 6
                  ? item.symbol.slice(0, 6)
                  : item.symbol}
              </text>
              {/* PnL% text */}
              <text
                x={x + cellSize / 2}
                y={y + cellSize / 2 + 7}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={item.pnlPct > 0 ? T.green : item.pnlPct < 0 ? T.red : T.text2}
                fontSize={6}
                fontWeight={700}
                fontFamily="'JetBrains Mono', monospace"
                style={{ pointerEvents: 'none' }}
              >
                {pnlLabel}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
