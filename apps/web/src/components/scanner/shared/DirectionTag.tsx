'use client'

import { useTranslations } from 'next-intl'

type TagSize = 'sm' | 'md' | 'lg'

interface DirectionTagProps {
  direction: string
  signalClass?: string
  size?: TagSize
}

// Normalize direction values: 'Strong Buy', 'strong_buy', 'STRONG BUY' → 'STRONG_BUY'
function normalizeDirection(dir: string): string {
  const upper = (dir || '').toUpperCase().replace(/\s+/g, '_')
  return upper
}

const DIR_KEYS: Record<string, string> = {
  STRONG_BUY: 'direction.strongBuy',
  BUY: 'direction.buy',
  NEUTRAL: 'direction.neutral',
  SELL: 'direction.sell',
  STRONG_SELL: 'direction.strongSell',
}

const DIR_COLORS: Record<string, { color: string; bg: string }> = {
  STRONG_BUY:  { color: '#00FFA3',   bg: `${'#00FFA3'}15` },
  BUY:         { color: '#00CC82', bg: `${'#00CC82'}12` },
  NEUTRAL:     { color: '#9CA3B5',    bg: `${'#9CA3B5'}10` },
  SELL:        { color: '#CC3945',   bg: `${'#CC3945'}12` },
  STRONG_SELL: { color: '#FF4757',     bg: `${'#FF4757'}15` },
}

// Normalize signalClass values: 'Trend', 'trend', 'REVERSION' → uppercase
function normalizeSignalClass(sc: string): string {
  return (sc || '').toUpperCase()
}

const SIGNAL_KEYS: Record<string, string> = {
  TREND: 'signal.trend',
  REVERSION: 'signal.reversion',
  BREAKOUT: 'signal.breakout',
  CONSOLIDATION: 'signal.consolidation',
  WATCH: 'signal.watch',
  DIVERGENCE: 'signal.divergence',
}

const SIGNAL_COLORS: Record<string, string> = {
  TREND: '#0A84FF',
  REVERSION: '#B388FF',
  BREAKOUT: '#FFB800',
  CONSOLIDATION: '#6B7280',
  WATCH: '#6B7280',
  DIVERGENCE: '#00D4FF',
}

const SIZE_MAP: Record<TagSize, { px: number; py: number; fontSize: number }> = {
  sm: { px: 4, py: 1, fontSize: 11 },
  md: { px: 6, py: 2, fontSize: 11 },
  lg: { px: 8, py: 3, fontSize: 11 },
}

export function DirectionTag({ direction, signalClass, size = 'md' }: DirectionTagProps) {
  const t = useTranslations('scannerAdvanced')
  const normDir = normalizeDirection(direction)
  const dirConf = DIR_COLORS[normDir] || DIR_COLORS.NEUTRAL
  const dirKey = DIR_KEYS[normDir] || 'direction.neutral'
  const normSignal = signalClass ? normalizeSignalClass(signalClass) : null
  const sigConf = normSignal ? { color: SIGNAL_COLORS[normSignal] || '#6B7280', key: SIGNAL_KEYS[normSignal] } : null
  const sz = SIZE_MAP[size]

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{
        padding: `${sz.py}px ${sz.px}px`, borderRadius: 'var(--radius-xs)',
        background: dirConf.bg, color: dirConf.color,
        fontSize: sz.fontSize, fontWeight: 700,
        fontFamily: "var(--font-ar)",
        border: `0.5px solid ${dirConf.color}30`,
        lineHeight: 1.4,
      }}>
        {t(dirKey)}
      </span>
      {sigConf && (
        <span style={{
          padding: `${sz.py}px ${sz.px}px`, borderRadius: 'var(--radius-xs)',
          background: `${sigConf.color}10`, color: sigConf.color,
          fontSize: sz.fontSize, fontWeight: 600,
          fontFamily: "var(--font-ar)",
          lineHeight: 1.4,
        }}>
          {t(sigConf.key)}
        </span>
      )}
    </div>
  )
}
