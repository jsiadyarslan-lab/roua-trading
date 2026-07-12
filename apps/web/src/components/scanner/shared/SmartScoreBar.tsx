'use client'

import { useTranslations } from 'next-intl'
import T from '@/lib/unified-tokens'

interface SmartScore {
  trendScore: number
  momentumScore: number
  volatilityScore: number
  volumeScore: number
  compositeScore: number
}

interface SmartScoreBarProps {
  smartScore: SmartScore | null
}

function getBarColor(val: number): string {
  if (val >= 60) return T.green
  if (val >= 40) return T.greenDim
  if (val >= 20) return T.amber
  if (val >= 0) return T.redDim
  return T.red
}

const BAR_KEYS: { key: keyof SmartScore; labelKey: string }[] = [
  { key: 'trendScore',      labelKey: 'smartScore.trend' },
  { key: 'momentumScore',   labelKey: 'smartScore.momentum' },
  { key: 'volatilityScore', labelKey: 'smartScore.volatility' },
  { key: 'volumeScore',     labelKey: 'smartScore.volume' },
  { key: 'compositeScore',  labelKey: 'smartScore.composite' },
]

export function SmartScoreBar({ smartScore }: SmartScoreBarProps) {
  const t = useTranslations('scannerAdvanced')
  if (!smartScore) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {BAR_KEYS.map(({ key, labelKey }) => {
        const val = smartScore[key]
        const pct = Math.min(Math.max((val + 100) / 200 * 100, 0), 100) // -100..100 → 0..100%
        const color = getBarColor(val)
        const isComposite = key === 'compositeScore'

        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 32, fontSize: 'var(--text-xs)', fontWeight: 700, color: T.text3,
              fontFamily: "var(--font-ar)", textAlign: 'right', flexShrink: 0,
            }}>
              {t(labelKey)}
            </span>
            <div style={{
              flex: 1, height: isComposite ? 6 : 4,
              borderRadius: 'var(--radius-xs)', background: T.surface, overflow: 'hidden',
            }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 'var(--radius-xs)',
                background: `linear-gradient(90deg, ${color}60, ${color})`,
                transition: 'width 0.5s ease',
                boxShadow: isComposite ? `0 0 6px ${color}30` : 'none',
              }} />
            </div>
            <span style={{
              width: 26, fontSize: 'var(--text-xs)', fontWeight: 800, color,
              fontFamily: "var(--font-mono)", textAlign: 'left', flexShrink: 0,
            }}>
              {val > 0 ? '+' : ''}{val}
            </span>
          </div>
        )
      })}
    </div>
  )
}
