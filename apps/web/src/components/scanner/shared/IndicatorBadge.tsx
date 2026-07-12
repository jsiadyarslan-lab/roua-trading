'use client'


import T from '@/lib/unified-tokens'

type BadgeStatus = 'bullish' | 'bearish' | 'neutral' | 'warning' | 'oversold' | 'overbought'

interface IndicatorBadgeProps {
  label: string
  value: string | number
  status?: BadgeStatus
}

const STATUS_STYLES: Record<BadgeStatus, { color: string; bg: string; border: string }> = {
  bullish:    { color: T.green,  bg: `${T.green}12`,  border: `${T.green}30` },
  bearish:    { color: T.red,    bg: `${T.red}12`,    border: `${T.red}30` },
  neutral:    { color: T.text2,  bg: T.bg2,           border: T.border },
  warning:    { color: T.amber,  bg: `${T.amber}12`,  border: `${T.amber}30` },
  oversold:   { color: T.cyan,   bg: `${T.cyan}12`,   border: `${T.cyan}30` },
  overbought: { color: T.purple, bg: `${T.purple}12`, border: `${T.purple}30` },
}

export function IndicatorBadge({ label, value, status = 'neutral' }: IndicatorBadgeProps) {
  const s = STATUS_STYLES[status]
  const displayValue = typeof value === 'number' ? value.toFixed(2) : value

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.color,
      border: `0.5px solid ${s.border}`,
      fontSize: 9, fontWeight: 700,
      fontFamily: "var(--font-mono)",
      lineHeight: '16px', whiteSpace: 'nowrap',
    }}>
      <span style={{ color: T.text2, fontWeight: 600, fontFamily: "var(--font-ar)", fontSize: 8 }}>
        {label}
      </span>
      {displayValue}
    </span>
  )
}
