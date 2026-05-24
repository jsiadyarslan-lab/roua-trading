'use client'

import { useTranslations } from 'next-intl'

const T = {
  green: '#00FFA3', greenDim: '#00CC82', red: '#FF4757', redDim: '#FF3344',
  blue: '#0A84FF', purple: '#B388FF', amber: '#FFB800', cyan: '#00D4FF',
  text2: '#8B92A8', text3: '#8B92A8',
}

type TagSize = 'sm' | 'md' | 'lg'

interface DirectionTagProps {
  direction: string
  signalClass?: string
  size?: TagSize
}

const DIR_KEYS: Record<string, string> = {
  STRONG_BUY: 'direction.strongBuy',
  BUY: 'direction.buy',
  NEUTRAL: 'direction.neutral',
  SELL: 'direction.sell',
  STRONG_SELL: 'direction.strongSell',
}

const DIR_COLORS: Record<string, { color: string; bg: string }> = {
  STRONG_BUY:  { color: T.green,   bg: `${T.green}15` },
  BUY:         { color: T.greenDim, bg: `${T.greenDim}12` },
  NEUTRAL:     { color: T.text2,    bg: `${T.text2}10` },
  SELL:        { color: T.redDim,   bg: `${T.redDim}12` },
  STRONG_SELL: { color: T.red,     bg: `${T.red}15` },
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
  TREND: T.blue,
  REVERSION: T.purple,
  BREAKOUT: T.amber,
  CONSOLIDATION: T.text3,
  WATCH: T.text3,
  DIVERGENCE: T.cyan,
}

const SIZE_MAP: Record<TagSize, { px: number; py: number; fontSize: number }> = {
  sm: { px: 4, py: 1, fontSize: 7 },
  md: { px: 6, py: 2, fontSize: 8 },
  lg: { px: 8, py: 3, fontSize: 9 },
}

export function DirectionTag({ direction, signalClass, size = 'md' }: DirectionTagProps) {
  const t = useTranslations('scannerAdvanced')
  const dirConf = DIR_COLORS[direction] || DIR_COLORS.NEUTRAL
  const dirKey = DIR_KEYS[direction] || 'direction.neutral'
  const sigConf = signalClass ? { color: SIGNAL_COLORS[signalClass] || T.text3, key: SIGNAL_KEYS[signalClass] } : null
  const sz = SIZE_MAP[size]

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{
        padding: `${sz.py}px ${sz.px}px`, borderRadius: 3,
        background: dirConf.bg, color: dirConf.color,
        fontSize: sz.fontSize, fontWeight: 700,
        fontFamily: "'Cairo', sans-serif",
        border: `0.5px solid ${dirConf.color}30`,
        lineHeight: 1.4,
      }}>
        {t(dirKey)}
      </span>
      {sigConf && (
        <span style={{
          padding: `${sz.py}px ${sz.px}px`, borderRadius: 3,
          background: `${sigConf.color}10`, color: sigConf.color,
          fontSize: sz.fontSize, fontWeight: 600,
          fontFamily: "'Cairo', sans-serif",
          lineHeight: 1.4,
        }}>
          {t(sigConf.key)}
        </span>
      )}
    </div>
  )
}
