'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useTabAlertStore } from '@/hooks/useTabAlertStore'
import { RefreshCw, Layers, Activity } from 'lucide-react'

const T = {
  bg:      '#0B0E14',
  bg2:     '#1A1D29',
  border:  'rgba(255,255,255,0.06)',
  accent:  '#00D4FF',
  green:   '#00FFA3',
  red:     '#FF4757',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#F0F2F5',
  text2:   '#8B92A8',
}

export function MultiTfScannerMini() {
  const tm = useTranslations('dashboard.multiTf')
  const { selectedSymbol } = useSymbolStore()
  const [data, setData] = useState<any[]>([])
  const [summary, setSummary] = useState<{ alignment: string; executionHint: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(60)
  const [scanCount, setScanCount] = useState(0)
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Use new multi-timeframe backend API
      const res = await fetch(`/api/scanner/multi-tf/${encodeURIComponent(selectedSymbol)}`, { signal: AbortSignal.timeout(30000) })
      const result = await res.json()

      if (result.success && result.data) {
        const mtData = result.data
        const tfLabels: Record<string, string> = { '15min': '15M', '1h': '1H', '4h': '4H', '1day': '1D' }

        const processed = mtData.timeframes.map((tf: any) => ({
          tf: tfLabels[tf.timeframe] || tf.timeframe.toUpperCase(),
          state: tf.direction === 'STRONG_BUY' || tf.direction === 'BUY' ? 'Bullish' : tf.direction === 'STRONG_SELL' || tf.direction === 'SELL' ? 'Bearish' : 'Neutral',
          strength: tf.confidence,
          color: tf.direction === 'STRONG_BUY' || tf.direction === 'BUY' ? T.green : tf.direction === 'STRONG_SELL' || tf.direction === 'SELL' ? T.red : T.amber,
          technicalScore: tf.technicalScore,
          rsi: tf.rsi,
          macdSignal: tf.macdSignal,
          adx: tf.adx,
        }))

        setData(processed)
        setScanCount(prev => prev + 1)
        setLastUpdate(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

        setSummary({
          alignment: mtData.alignment === 'STRONG_BULLISH' ? tm('strongBullishConsensus') : mtData.alignment === 'BULLISH' ? tm('bullishConsensus') : mtData.alignment === 'STRONG_BEARISH' ? tm('strongBearishConsensus') : mtData.alignment === 'BEARISH' ? tm('bearishConsensus') : tm('mixedSignals'),
          executionHint: mtData.executionHintAr || mtData.executionHint || '',
        })

        // Push alert for strong alignment
        if (Math.abs(mtData.alignmentScore) > 30) {
          const direction = mtData.alignmentScore > 0 ? 'BUY' : 'SELL'
          useTabAlertStore.getState().pushAlert('multi-tf', {
            action: direction,
            label: `${direction === 'BUY' ? '⬆' : '⬇'} ${mtData.alignment} ${selectedSymbol}`,
            color: direction === 'BUY' ? '#00FFA3' : '#FF4757',
          })
        }
      } else {
        // Fallback: no data available
        setData([])
        setSummary(null)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedSymbol])

  useEffect(() => { fetchData() }, [fetchData])

  // Poll every 60s — pauses when tab hidden
  useVisibleInterval(fetchData, 60000)

  // Countdown timer
  useEffect(() => {
    setCountdown(60)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return 60
        return prev - 1
      })
    }, 1000)
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [lastUpdate])

  // Determine overall strategy based on TFs
  const overallStrength = data.reduce((sum, item) => sum + (item.state === 'Bullish' ? item.strength : item.state === 'Bearish' ? -item.strength : 0), 0)
  const strategy = overallStrength > 100 ? tm('trendFollowLong') : overallStrength < -100 ? tm('trendFollowShort') : tm('waitPullback')

  return (
    <div className="custom-scrollbar" style={{  height: '100%', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', borderRadius: 16, border: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, padding: '0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={12} color={T.purple} className={loading ? 'animate-pulse' : ''} />
          <span style={{ fontSize: 11, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>
          {lastUpdate && (
            <span style={{ fontSize: 7, color: T.text2, fontFamily: 'monospace' }}>· {lastUpdate}</span>
          )}
          <span style={{ fontSize: 7, color: T.text2, fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 3 }}>
            #{scanCount}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 7, color: T.text2, fontFamily: 'monospace' }}>{countdown}s</span>
          <span style={{ fontSize: 6.5, background: `${T.purple}15`, border: `0.5px solid ${T.purple}30`, color: T.purple, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
            {loading ? tm('scanning') : tm('liveSync')}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
        {data.length === 0 && !loading ? (
           <div style={{ textAlign: 'center', color: T.text2, fontSize: 10 }}>{tm('noData')}</div>
        ) : (
          (data.length > 0 ? data : [
            { tf: '15M', state: '...', strength: 0, color: T.border },
            { tf: '1H',  state: '...', strength: 0, color: T.border },
            { tf: '4H',  state: '...', strength: 0, color: T.border },
            { tf: '1D',  state: '...', strength: 0, color: T.border }
          ]).map((t, i) => (
            <div key={i} className="card" style={{ borderRadius: 12, border: `0.5px solid ${T.border}`, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: t.color, width: 24, fontFamily: "'JetBrains Mono', monospace" }}>{t.tf}</span>
              <div style={{ flex: 1, height: 4, background: T.bg, borderRadius: 2, overflow: 'hidden', margin: '0 4px' }}>
                <div style={{ height: '100%', width: `${t.strength}%`, background: t.color, boxShadow: `0 0 6px ${t.color}80`, transition: 'width 0.5s ease-out' }} />
              </div>
              <span style={{ fontSize: 9, color: t.color, fontWeight: 800, width: 24, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{t.strength}%</span>
              {t.state && t.state !== '...' && (
                <span style={{ fontSize: 7, fontWeight: 700, color: t.color, fontFamily: 'monospace', minWidth: 42 }}>
                  {t.state === 'Bullish' ? '⬆' : t.state === 'Bearish' ? '⬇' : '◆'} {t.state === 'Bullish' ? tm('bullish') : t.state === 'Bearish' ? tm('bearish') : tm('neutral')}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10, color: T.text2, padding: '10px 12px', border: `1px solid ${T.border}`, borderRadius: 12, fontWeight: 600 }}>
        <div style={{ textAlign: 'center' }}>
          {tm('tfStrategy')} <span style={{color: T.purple}}>{strategy}</span>
        </div>
        {summary && (
          <>
            <div style={{ textAlign: 'center', fontSize: 9, color: T.text }}>
              {summary.alignment}
            </div>
            <div style={{ textAlign: 'center', fontSize: 9, color: T.accent }}>
              {summary.executionHint}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
