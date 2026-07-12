'use client'

import { useState, useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useScannerContext } from '../ScannerProvider'
import { DirectionTag } from '../shared/DirectionTag'
import { IndicatorBadge } from '../shared/IndicatorBadge'
import { ScopedStyle } from '@/components/ScopedStyle'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT', 'ADAUSDT', 'DOGEUSDT', 'EURUSD', 'GBPUSD', 'AAPL', 'TSLA', 'XAUUSD']

interface TfData {
  direction: string; signalClass: string; technicalScore: number
  confidence: number; rsi: number | null; macdSignal: string | null; adx: number | null
}

interface MultiTfResult {
  symbol: string; timeframes: Record<string, TfData>
  alignment: string; weightedScore: number
  executionHintAr: string
  executionHint?: string
}

const ALIGN_KEYS: Record<string, { labelKey: string; color: string }> = {
  STRONG_BULLISH: { labelKey: 'multiTf.strongBullishAlignment', color: '#00FFA3' },
  BULLISH:        { labelKey: 'multiTf.bullishAlignment', color: '#00CC82' },
  NEUTRAL:        { labelKey: 'multiTf.neutralAlignment', color: '#FFB800' },
  BEARISH:        { labelKey: 'multiTf.bearishAlignment', color: '#CC3945' },
  STRONG_BEARISH: { labelKey: 'multiTf.strongBearishAlignment', color: '#FF4757' },
}

const TF_KEYS = [
  { key: 'M15', labelKey: 'timeframes.15m', weight: 0.5 },
  { key: 'H1', labelKey: 'timeframes.1h', weight: 1.0 },
  { key: 'H4', labelKey: 'timeframes.4h', weight: 1.5 },
  { key: 'D1', labelKey: 'timeframes.1d', weight: 2.0 },
] as const

function TfRow({ tf, data, weight, t }: { tf: typeof TF_KEYS[number]; data: TfData | undefined; weight: number; t: any }) {
  if (!data) return (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${'#2A313C'}`, opacity: 0.4 }}>
      <div style={{ fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-ar)" }}>{t('multiTf.noData')}</div>
    </div>
  )
  const scorePct = Math.min(Math.max((data.technicalScore + 100) / 200 * 100, 2), 100)
  const scoreColor = data.technicalScore >= 40 ? '#00FFA3' : data.technicalScore >= 0 ? '#FFB800' : '#FF4757'

  return (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${'#2A313C'}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>{t(tf.labelKey)}</span>
          <DirectionTag direction={data.direction} signalClass={data.signalClass} size="sm" />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#B388FF', fontFamily: "var(--font-mono)" }}>
          {weight.toFixed(1)}x
        </span>
      </div>
      {/* Score bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 'var(--radius-xs)', background: '#151A22', overflow: 'hidden' }}>
          <div style={{ width: `${scorePct}%`, height: '100%', borderRadius: 'var(--radius-xs)', background: `linear-gradient(90deg, ${scoreColor}60, ${scoreColor})`, transition: 'width 0.5s ease' }} />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: scoreColor, fontFamily: "var(--font-mono)", minWidth: 32, textAlign: 'left' }}>
          {data.technicalScore > 0 ? '+' : ''}{data.technicalScore}
        </span>
      </div>
      {/* Indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <IndicatorBadge label={t('indicators.rsi')} value={data.rsi !== null ? data.rsi.toFixed(0) : '—'} status={data.rsi !== null ? (data.rsi <= 30 ? 'oversold' : data.rsi >= 70 ? 'overbought' : data.rsi < 50 ? 'bearish' : 'bullish') : 'neutral'} />
        <IndicatorBadge label={t('indicators.macd')} value={data.macdSignal === 'NONE' ? t('indicators.none') : (data.macdSignal ?? '—')} status={data.macdSignal?.includes('BUY') ? 'bullish' : data.macdSignal?.includes('SELL') ? 'bearish' : 'neutral'} />
        <IndicatorBadge label={t('indicators.adx')} value={data.adx !== null ? data.adx.toFixed(0) : '—'} status={(data.adx ?? 0) > 25 ? 'bullish' : 'neutral'} />
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#6B7280', fontFamily: "var(--font-ar)", marginInlineEnd: 4 }}>
          {t('multiTf.confidence')} {data.confidence.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}

function ConfluenceMeter({ timeframes }: { timeframes: Record<string, TfData> }) {
  const tfKeys = ['M15', 'H1', 'H4', 'D1']
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
      {tfKeys.map(k => {
        const d = timeframes[k]
        const isBull = d?.direction?.includes('BUY') || d?.direction === 'STRONG_BUY'
        const isBear = d?.direction?.includes('SELL') || d?.direction === 'STRONG_SELL'
        const color = isBull ? '#00FFA3' : isBear ? '#FF4757' : '#FFB800'
        return (
          <div key={k} style={{ flex: 1, height: 8, borderRadius: 'var(--radius-sm)', background: '#151A22', overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', borderRadius: 'var(--radius-sm)', background: color, opacity: d ? 0.8 : 0.15, transition: 'all 0.4s' }} />
          </div>
        )
      })}
    </div>
  )
}

export function MultiTfPanel() {
  const t = useTranslations('scannerAdvanced')
  const locale = useLocale()
  const ctx = useScannerContext()
  const [localSymbol, setLocalSymbol] = useState('BTCUSDT')
  const effectiveSymbol = ctx.selectedSymbol || localSymbol
  const [data, setData] = useState<MultiTfResult | null>(null)
  const [loading, setLoading] = useState(true)
  const prevSymbolRef = useRef(effectiveSymbol)

  function getStrategy(alignment: string): string {
    if (alignment.includes('BULLISH')) return t('multiTf.followLong')
    if (alignment.includes('BEARISH')) return t('multiTf.followShort')
    return t('multiTf.waitBounce')
  }

  useEffect(() => {
    if (prevSymbolRef.current !== effectiveSymbol) {
      setLoading(true)
      prevSymbolRef.current = effectiveSymbol
    }
    let stale = false
    ;(async () => {
      try {
        const res = await fetch(`/api/scanner/multitf?symbol=${effectiveSymbol}`)
        if (stale) return
        if (!res.ok) throw new Error('Failed')
        const j = await res.json()
        if (!stale && j.success && j.data) setData(j.data)
        else if (!stale) setData(null)
      } catch { if (!stale) setData(null) }
      if (!stale) setLoading(false)
    })()
    return () => { stale = true }
  }, [effectiveSymbol])

  const alignConf = data ? (ALIGN_KEYS[data.alignment] || ALIGN_KEYS.NEUTRAL) : ALIGN_KEYS.NEUTRAL

  return (
    <div style={{ flex: 1, overflow: 'auto', direction: 'inherit', background: '#151A22', padding: 16 }}>
      <ScopedStyle>{`
        @keyframes fadeInMT { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .mt-scroll::-webkit-scrollbar { width: 5px; }
        .mt-scroll::-webkit-scrollbar-track { background: ${'#0F1117'}; }
        .mt-scroll::-webkit-scrollbar-thumb { background: ${'#151A22'}; border-radius: 3px; }
      `}</ScopedStyle>
      <div style={{ animation: 'fadeInMT 0.4s ease' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Clock size={18} color={'#FFB800'} />
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>{t('multiTf.title')}</span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-ar)", margin: 0 }}>
              {t('multiTf.subtitle')}
            </p>
          </div>
          <select value={effectiveSymbol} onChange={e => setLocalSymbol(e.target.value)}
            style={{ background: '#151A22', color: '#F0F2F5', border: `0.5px solid ${'#2A313C'}`, borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: "var(--font-mono)", cursor: 'pointer', direction: 'ltr' }}>
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading && !data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ height: 80, borderRadius: 'var(--radius-md)', background: '#151A22', opacity: 0.3 + i * 0.1 }} />
            ))}
          </div>
        ) : (
          <>
            {/* TF Rows */}
            <div style={{ borderRadius: 'var(--radius-md)', border: `0.5px solid ${'#2A313C'}`, background: '#0F1117', marginBottom: 16, overflow: 'hidden' }}>
              {TF_KEYS.map(tf => (
                <TfRow key={tf.key} tf={tf} data={data?.timeframes?.[tf.key]} weight={tf.weight} t={t} />
              ))}
            </div>

            {/* Alignment Card */}
            {data && (
              <div style={{ borderRadius: 'var(--radius-md)', border: `0.5px solid ${alignConf.color}30`, background: `${alignConf.color}06`, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: alignConf.color, fontFamily: "var(--font-ar)" }}>
                      {t(alignConf.labelKey)}
                    </span>
                    <div style={{ fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-ar)", marginTop: 2 }}>
                      {locale === 'ar' ? data.executionHintAr : (data.executionHint || data.executionHintAr)}
                    </div>
                  </div>
                  <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, color: alignConf.color, fontFamily: "var(--font-mono)" }}>
                    {data.weightedScore > 0 ? '+' : ''}{data.weightedScore.toFixed(0)}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#9CA3B5', fontFamily: "var(--font-ar)", marginBottom: 4 }}>
                  {t('multiTf.strategy')} <span style={{ color: alignConf.color }}>{getStrategy(data.alignment)}</span>
                </div>
                <ConfluenceMeter timeframes={data.timeframes} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  {TF_KEYS.map(tf => (
                    <span key={tf.key} style={{ fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-ar)" }}>{t(tf.labelKey)}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
