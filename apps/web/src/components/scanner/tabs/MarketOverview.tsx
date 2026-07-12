'use client'

import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useScannerContext } from '../ScannerProvider'
import { DirectionTag } from '../shared/DirectionTag'
import { ScoreGauge } from '../shared/ScoreGauge'
import { ScopedStyle } from '@/components/ScopedStyle'
import { T } from '@/lib/unified-tokens'

export function MarketOverview() {
  const t = useTranslations('scannerAdvanced')
  const ctx = useScannerContext()
  const { scanData, overview } = ctx

  const SECTORS = [
    { key: 'CRYPTO', label: t('sectors.crypto'), color: T.cyan },
    { key: 'FOREX', label: t('sectors.forex'), color: T.green },
    { key: 'STOCK', label: t('sectors.stocks'), color: T.amber },
    { key: 'COMMODITY', label: t('sectors.commodities'), color: T.purple },
  ]

  // Sentiment calculation
  const sentiment = useMemo(() => {
    if (!scanData.length) return { score: 0, label: t('neutral'), color: T.text3, bullCount: 0, bearCount: 0, neutralCount: 0 }
    let bullCount = 0, bearCount = 0, neutralCount = 0, totalScore = 0
    scanData.forEach(d => {
      if (d.direction.includes('BUY')) bullCount++
      else if (d.direction.includes('SELL')) bearCount++
      else neutralCount++
      totalScore += d.technicalScore
    })
    const avg = totalScore / scanData.length
    const label = avg >= 30 ? t('bullish') : avg <= -30 ? t('bearish') : t('neutral')
    const color = avg >= 30 ? T.green : avg <= -30 ? T.red : T.amber
    return { score: Math.round(avg), label, color, bullCount, bearCount, neutralCount }
  }, [scanData, t])

  // Strongest signals
  const strongest = useMemo(() =>
    [...scanData].sort((a, b) => b.technicalScore - a.technicalScore).slice(0, 5),
    [scanData]
  )

  // Top gainers / losers
  const gainers = useMemo(() =>
    [...scanData].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5),
    [scanData]
  )
  const losers = useMemo(() =>
    [...scanData].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5),
    [scanData]
  )

  // Sector averages
  const sectorAvg = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {}
    scanData.forEach(d => {
      if (!map[d.category]) map[d.category] = { total: 0, count: 0 }
      map[d.category].total += d.technicalScore
      map[d.category].count++
    })
    return Object.fromEntries(
      Object.entries(map).map(([k, v]) => [k, v.count ? Math.round(v.total / v.count) : 0])
    )
  }, [scanData])

  return (
    <div style={{ flex: 1, overflow: 'auto', direction: 'inherit', background: T.card, padding: 16 }}>
      <ScopedStyle>{`
        @keyframes fadeInMO { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</ScopedStyle>
      <div style={{ animation: 'fadeInMO 0.4s ease' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <BarChart3 size={18} color={T.cyan} />
          <span style={{ fontSize: 15, fontWeight: 800, color: T.text, fontFamily: "var(--font-ar)" }}>{t('overview.marketOverview')}</span>
        </div>

        {/* Sentiment Gauge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '20px 16px', borderRadius: 10, background: T.bg2, border: `0.5px solid ${T.border}`, marginBottom: 16 }}>
          <ScoreGauge score={sentiment.score} size={80} label={t('overview.marketSentiment')} showValue />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: sentiment.color, fontFamily: "var(--font-ar)" }}>{sentiment.label}</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.green, fontFamily: "var(--font-ar)" }}>{t('bullish')}: {sentiment.bullCount}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.red, fontFamily: "var(--font-ar)" }}>{t('bearish')}: {sentiment.bearCount}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, fontFamily: "var(--font-ar)" }}>{t('neutral')}: {sentiment.neutralCount}</span>
            </div>
          </div>
        </div>

        {/* Three columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          {/* Strongest Signals */}
          <div style={{ borderRadius: 8, border: `0.5px solid ${T.border}`, background: T.bg2, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.cyan, fontFamily: "var(--font-ar)", marginBottom: 10 }}>{t('overview.strongestSignals')}</div>
            {strongest.map(item => (
              <div key={item.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `0.5px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: T.text, fontFamily: "var(--font-mono)" }}>{item.symbol}</span>
                  <DirectionTag direction={item.direction} size="sm" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: item.technicalScore >= 40 ? T.green : T.amber, fontFamily: "var(--font-mono)" }}>
                    {item.technicalScore > 0 ? '+' : ''}{item.technicalScore}
                  </span>
                  <span style={{ fontSize: 8, color: T.text3, fontFamily: "var(--font-mono)", marginInlineEnd: 4 }}>
                    {item.confidence.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Top Gainers */}
          <div style={{ borderRadius: 8, border: `0.5px solid ${T.border}`, background: T.bg2, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.green, fontFamily: "var(--font-ar)", marginBottom: 10 }}>{t('overview.topGainers')}</div>
            {gainers.map(item => (
              <div key={item.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `0.5px solid ${T.border}` }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: T.text, fontFamily: "var(--font-mono)" }}>{item.symbol}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.green, fontFamily: "var(--font-mono)" }}>
                    +{item.changePercent.toFixed(2)}%
                  </div>
                  <div style={{ fontSize: 8, color: T.text3, fontFamily: "var(--font-mono)" }}>
                    ${item.price.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Top Losers */}
          <div style={{ borderRadius: 8, border: `0.5px solid ${T.border}`, background: T.bg2, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.red, fontFamily: "var(--font-ar)", marginBottom: 10 }}>{t('overview.topLosers')}</div>
            {losers.map(item => (
              <div key={item.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `0.5px solid ${T.border}` }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: T.text, fontFamily: "var(--font-mono)" }}>{item.symbol}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.red, fontFamily: "var(--font-mono)" }}>
                    {item.changePercent.toFixed(2)}%
                  </div>
                  <div style={{ fontSize: 8, color: T.text3, fontFamily: "var(--font-mono)" }}>
                    ${item.price.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sector Distribution */}
        <div style={{ borderRadius: 8, border: `0.5px solid ${T.border}`, background: T.bg2, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, fontFamily: "var(--font-ar)", marginBottom: 10 }}>{t('overview.sectorDistribution')}</div>
          {SECTORS.map(s => {
            const avg = sectorAvg[s.key] ?? 0
            const pct = Math.min(Math.max((avg + 100) / 200 * 100, 3), 100)
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 70, fontSize: 9, fontWeight: 700, color: s.color, fontFamily: "var(--font-ar)", textAlign: 'right', flexShrink: 0 }}>{s.label}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: T.surface, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${s.color}50, ${s.color})`, transition: 'width 0.5s' }} />
                </div>
                <span style={{ width: 32, fontSize: 9, fontWeight: 800, color: avg >= 0 ? T.green : T.red, fontFamily: "var(--font-mono)", textAlign: 'left', flexShrink: 0 }}>
                  {avg > 0 ? '+' : ''}{avg}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
