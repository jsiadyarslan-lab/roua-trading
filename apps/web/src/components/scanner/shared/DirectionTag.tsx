'use client'

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

const DIR_MAP: Record<string, { label: string; color: string; bg: string }> = {
  STRONG_BUY:  { label: 'شراء قوي', color: T.green,   bg: `${T.green}15` },
  BUY:         { label: 'شراء',     color: T.greenDim, bg: `${T.greenDim}12` },
  NEUTRAL:     { label: 'محايد',    color: T.text2,    bg: `${T.text2}10` },
  SELL:        { label: 'بيع',      color: T.redDim,   bg: `${T.redDim}12` },
  STRONG_SELL: { label: 'بيع قوي',  color: T.red,     bg: `${T.red}15` },
}

const SIGNAL_MAP: Record<string, { label: string; color: string }> = {
  TREND:         { label: 'اتجاهي',  color: T.blue },
  REVERSION:     { label: 'انعكاسي', color: T.purple },
  BREAKOUT:      { label: 'اختراق',  color: T.amber },
  CONSOLIDATION: { label: 'تماسك',   color: T.text3 },
  WATCH:         { label: 'مراقبة',  color: T.text3 },
  DIVERGENCE:    { label: 'تباعد',   color: T.cyan },
}

const SIZE_MAP: Record<TagSize, { px: number; py: number; fontSize: number }> = {
  sm: { px: 4, py: 1, fontSize: 7 },
  md: { px: 6, py: 2, fontSize: 8 },
  lg: { px: 8, py: 3, fontSize: 9 },
}

export function DirectionTag({ direction, signalClass, size = 'md' }: DirectionTagProps) {
  const dirConf = DIR_MAP[direction] || DIR_MAP.NEUTRAL
  const sigConf = signalClass ? SIGNAL_MAP[signalClass] : null
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
        {dirConf.label}
      </span>
      {sigConf && (
        <span style={{
          padding: `${sz.py}px ${sz.px}px`, borderRadius: 3,
          background: `${sigConf.color}10`, color: sigConf.color,
          fontSize: sz.fontSize, fontWeight: 600,
          fontFamily: "'Cairo', sans-serif",
          lineHeight: 1.4,
        }}>
          {sigConf.label}
        </span>
      )}
    </div>
  )
}
