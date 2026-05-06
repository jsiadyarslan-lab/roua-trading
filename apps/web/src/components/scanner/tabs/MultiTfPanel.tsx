'use client'

import { useState, useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import { useScannerContext } from '../ScannerProvider'
import { DirectionTag } from '../shared/DirectionTag'
import { IndicatorBadge } from '../shared/IndicatorBadge'
import { ScopedStyle } from '@/components/ScopedStyle'

const T = {
  bg: '#0B0E14', bg2: '#1A1D29', card: '#1A1D29', cardHover: '#1F2335',
  surface: '#1A1D29', blue: '#0A84FF', cyan: '#00D4FF', green: '#00FFA3',
  greenDim: '#00CC82', red: '#FF4757', redDim: '#FF3344', amber: '#FFB800',
  purple: '#B388FF', text: '#F0F2F5', text2: '#8B92A8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT', 'ADAUSDT', 'DOGEUSDT', 'EURUSD', 'GBPUSD', 'AAPL', 'TSLA', 'XAUUSD']

const TIMEFRAMES = [
  { key: 'M15', label: '15 دقيقة', weight: 0.5 },
  { key: 'H1', label: '1 ساعة', weight: 1.0 },
  { key: 'H4', label: '4 ساعات', weight: 1.5 },
  { key: 'D1', label: 'يومي', weight: 2.0 },
] as const

interface TfData {
  direction: string; signalClass: string; technicalScore: number
  confidence: number; rsi: number | null; macdSignal: string | null; adx: number | null
}

interface MultiTfResult {
  symbol: string; timeframes: Record<string, TfData>
  alignment: string; weightedScore: number
  executionHintAr: string
}

const ALIGN_MAP: Record<string, { label: string; color: string }> = {
  STRONG_BULLISH: { label: 'توافق صعودي قوي', color: T.green },
  BULLISH:        { label: 'توافق صعودي', color: T.greenDim },
  NEUTRAL:        { label: 'توافق محايد', color: T.amber },
  BEARISH:        { label: 'توافق هبوطي', color: T.redDim },
  STRONG_BEARISH: { label: 'توافق هبوطي قوي', color: T.red },
}

function getStrategy(alignment: string): string {
  if (alignment.includes('BULLISH')) return 'اتبع الاتجاه الصاعد (Long)'
  if (alignment.includes('BEARISH')) return 'اتبع الاتجاه الهابط (Short)'
  return 'انتظر / ارتداد'
}

function TfRow({ tf, data, weight }: { tf: typeof TIMEFRAMES[number]; data: TfData | undefined; weight: number }) {
  if (!data) return (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, opacity: 0.4 }}>
      <div style={{ fontSize: 10, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>لا توجد بيانات</div>
    </div>
  )
  const scorePct = Math.min(Math.max((data.technicalScore + 100) / 200 * 100, 2), 100)
  const scoreColor = data.technicalScore >= 40 ? T.green : data.technicalScore >= 0 ? T.amber : T.red

  return (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>{tf.label}</span>
          <DirectionTag direction={data.direction} signalClass={data.signalClass} size="sm" />
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: T.purple, fontFamily: "'JetBrains Mono', monospace" }}>
          {weight.toFixed(1)}x
        </span>
      </div>
      {/* Score bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.surface, overflow: 'hidden' }}>
          <div style={{ width: `${scorePct}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${scoreColor}60, ${scoreColor})`, transition: 'width 0.5s ease' }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: scoreColor, fontFamily: "'JetBrains Mono', monospace", minWidth: 32, textAlign: 'left' }}>
          {data.technicalScore > 0 ? '+' : ''}{data.technicalScore}
        </span>
      </div>
      {/* Indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <IndicatorBadge label="RSI" value={data.rsi !== null ? data.rsi.toFixed(0) : '—'} status={data.rsi !== null ? (data.rsi <= 30 ? 'oversold' : data.rsi >= 70 ? 'overbought' : data.rsi < 50 ? 'bearish' : 'bullish') : 'neutral'} />
        <IndicatorBadge label="MACD" value={data.macdSignal ?? '—'} status={data.macdSignal?.includes('BUY') ? 'bullish' : data.macdSignal?.includes('SELL') ? 'bearish' : 'neutral'} />
        <IndicatorBadge label="ADX" value={data.adx !== null ? data.adx.toFixed(0) : '—'} status={(data.adx ?? 0) > 25 ? 'bullish' : 'neutral'} />
        <span style={{ fontSize: 8, fontWeight: 700, color: T.text3, fontFamily: "'Cairo', sans-serif", marginInlineEnd: 4 }}>
          ثقة: {data.confidence.toFixed(0)}%
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
        const color = isBull ? T.green : isBear ? T.red : T.amber
        return (
          <div key={k} style={{ flex: 1, height: 8, borderRadius: 4, background: T.surface, overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', borderRadius: 4, background: color, opacity: d ? 0.8 : 0.15, transition: 'all 0.4s' }} />
          </div>
        )
      })}
    </div>
  )
}

export function MultiTfPanel() {
  const ctx = useScannerContext()
  const [localSymbol, setLocalSymbol] = useState('BTCUSDT')
  const effectiveSymbol = ctx.selectedSymbol || localSymbol
  const [data, setData] = useState<MultiTfResult | null>(null)
  const [loading, setLoading] = useState(true)
  const prevSymbolRef = useRef(effectiveSymbol)

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

  const alignConf = data ? (ALIGN_MAP[data.alignment] || ALIGN_MAP.NEUTRAL) : ALIGN_MAP.NEUTRAL

  return (
    <div style={{ flex: 1, overflow: 'auto', direction: 'rtl', background: T.card, padding: 16 }}>
      <ScopedStyle>{`
        @keyframes fadeInMT { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .mt-scroll::-webkit-scrollbar { width: 5px; }
        .mt-scroll::-webkit-scrollbar-track { background: ${T.bg2}; }
        .mt-scroll::-webkit-scrollbar-thumb { background: ${T.surface}; border-radius: 3px; }
      `}</ScopedStyle>
      <div style={{ animation: 'fadeInMT 0.4s ease' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Clock size={18} color={T.amber} />
              <span style={{ fontSize: 15, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>تحليل متعدد الأطر الزمنية</span>
            </div>
            <p style={{ fontSize: 10, color: T.text3, fontFamily: "'Cairo', sans-serif", margin: 0 }}>
              تحليل التوافق (Confluence) بين الأطر لاتخاذ قرار متوافق
            </p>
          </div>
          <select value={effectiveSymbol} onChange={e => setLocalSymbol(e.target.value)}
            style={{ background: T.surface, color: T.text, border: `0.5px solid ${T.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', direction: 'ltr' }}>
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading && !data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ height: 80, borderRadius: 8, background: T.surface, opacity: 0.3 + i * 0.1 }} />
            ))}
          </div>
        ) : (
          <>
            {/* TF Rows */}
            <div style={{ borderRadius: 8, border: `0.5px solid ${T.border}`, background: T.bg2, marginBottom: 16, overflow: 'hidden' }}>
              {TIMEFRAMES.map(tf => (
                <TfRow key={tf.key} tf={tf} data={data?.timeframes?.[tf.key]} weight={tf.weight} />
              ))}
            </div>

            {/* Alignment Card */}
            {data && (
              <div style={{ borderRadius: 8, border: `0.5px solid ${alignConf.color}30`, background: `${alignConf.color}06`, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: alignConf.color, fontFamily: "'Cairo', sans-serif" }}>
                      {alignConf.label}
                    </span>
                    <div style={{ fontSize: 9, color: T.text3, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
                      {data.executionHintAr}
                    </div>
                  </div>
                  <span style={{ fontSize: 28, fontWeight: 900, color: alignConf.color, fontFamily: "'JetBrains Mono', monospace" }}>
                    {data.weightedScore > 0 ? '+' : ''}{data.weightedScore.toFixed(0)}
                  </span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
                  الاستراتيجية: <span style={{ color: alignConf.color }}>{getStrategy(data.alignment)}</span>
                </div>
                <ConfluenceMeter timeframes={data.timeframes} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  {TIMEFRAMES.map(tf => (
                    <span key={tf.key} style={{ fontSize: 7, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{tf.label}</span>
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
