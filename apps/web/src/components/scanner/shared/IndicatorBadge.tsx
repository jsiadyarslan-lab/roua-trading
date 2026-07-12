'use client'



type BadgeStatus = 'bullish' | 'bearish' | 'neutral' | 'warning' | 'oversold' | 'overbought'

interface IndicatorBadgeProps {
  label: string
  value: string | number
  status?: BadgeStatus
}

const STATUS_STYLES: Record<BadgeStatus, { color: string; bg: string; border: string }> = {
  bullish:    { color: '#00FFA3',  bg: `${'#00FFA3'}12`,  border: `${'#00FFA3'}30` },
  bearish:    { color: '#FF4757',    bg: `${'#FF4757'}12`,    border: `${'#FF4757'}30` },
  neutral:    { color: '#9CA3B5',  bg: '#0F1117',           border: '#2A313C' },
  warning:    { color: '#FFB800',  bg: `${'#FFB800'}12`,  border: `${'#FFB800'}30` },
  oversold:   { color: '#00D4FF',   bg: `${'#00D4FF'}12`,   border: `${'#00D4FF'}30` },
  overbought: { color: '#B388FF', bg: `${'#B388FF'}12`, border: `${'#B388FF'}30` },
}

export function IndicatorBadge({ label, value, status = 'neutral' }: IndicatorBadgeProps) {
  const s = STATUS_STYLES[status]
  const displayValue = typeof value === 'number' ? value.toFixed(2) : value

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 'var(--radius-sm)',
      background: s.bg, color: s.color,
      border: `0.5px solid ${s.border}`,
      fontSize: 'var(--text-xs)', fontWeight: 700,
      fontFamily: "var(--font-mono)",
      lineHeight: '16px', whiteSpace: 'nowrap',
    }}>
      <span style={{ color: '#9CA3B5', fontWeight: 600, fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)' }}>
        {label}
      </span>
      {displayValue}
    </span>
  )
}
