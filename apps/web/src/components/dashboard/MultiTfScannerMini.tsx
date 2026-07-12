'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useTabAlertStore } from '@/hooks/useTabAlertStore'
import { RefreshCw, Layers, Activity } from 'lucide-react'

export function MultiTfScannerMini() {
  const tm = useTranslations('dashboard.multiTf')
  const locale = useLocale()
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
          color: tf.direction === 'STRONG_BUY' || tf.direction === 'BUY' ? '#00FFA3' : tf.direction === 'STRONG_SELL' || tf.direction === 'SELL' ? '#FF4757' : '#FFB800',
          technicalScore: tf.technicalScore,
          rsi: tf.rsi,
          macdSignal: tf.macdSignal,
          adx: tf.adx,
        }))

        setData(processed)
        setScanCount(prev => prev + 1)
        setLastUpdate(new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

        setSummary({
          alignment: mtData.alignment === 'STRONG_BULLISH' ? tm('strongBullishConsensus') : mtData.alignment === 'BULLISH' ? tm('bullishConsensus') : mtData.alignment === 'STRONG_BEARISH' ? tm('strongBearishConsensus') : mtData.alignment === 'BEARISH' ? tm('bearishConsensus') : tm('mixedSignals'),
          executionHint: locale === 'ar' ? (mtData.executionHintAr || mtData.executionHint || '') : (mtData.executionHint || mtData.executionHintAr || ''),
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
    <div className="custom-scrollbar" style={{  height: '100%', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', borderRadius: 'var(--radius-xl)', border: `1px solid ${'#2A313C'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, padding: '0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={12} color={'#B388FF'} className={loading ? 'animate-pulse' : ''} />
          <span style={{ fontSize: 11, fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-mono)" }}>{selectedSymbol}</span>
          {lastUpdate && (
            <span style={{ fontSize: 11, color: '#9CA3B5', fontFamily: "var(--font-mono)" }}>· {lastUpdate}</span>
          )}
          <span style={{ fontSize: 11, color: '#9CA3B5', fontFamily: "var(--font-mono)", background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 'var(--radius-xs)' }}>
            #{scanCount}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#9CA3B5', fontFamily: "var(--font-mono)" }}>{countdown}s</span>
          <span style={{ fontSize: 11, background: `${'#B388FF'}15`, border: `0.5px solid ${'#B388FF'}30`, color: '#B388FF', padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontWeight: 700 }}>
            {loading ? tm('scanning') : tm('liveSync')}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
        {data.length === 0 && !loading ? (
           <div style={{ textAlign: 'center', color: '#9CA3B5', fontSize: 11 }}>{tm('noData')}</div>
        ) : (
          (data.length > 0 ? data : [
            { tf: '15M', state: '...', strength: 0, color: '#2A313C' },
            { tf: '1H',  state: '...', strength: 0, color: '#2A313C' },
            { tf: '4H',  state: '...', strength: 0, color: '#2A313C' },
            { tf: '1D',  state: '...', strength: 0, color: '#2A313C' }
          ]).map((t, i) => (
            <div key={i} className="card" style={{ borderRadius: 'var(--radius-lg)', border: `0.5px solid ${'#2A313C'}`, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: t.color, width: 24, fontFamily: "var(--font-mono)" }}>{t.tf}</span>
              <div style={{ flex: 1, height: 4, background: '#0B0E14', borderRadius: 'var(--radius-xs)', overflow: 'hidden', margin: '0 4px' }}>
                <div style={{ height: '100%', width: `${t.strength}%`, background: t.color, boxShadow: `0 0 6px ${t.color}80`, transition: 'width 0.5s ease-out' }} />
              </div>
              <span style={{ fontSize: 11, color: t.color, fontWeight: 800, width: 24, textAlign: 'right', fontFamily: "var(--font-mono)" }}>{t.strength}%</span>
              {t.state && t.state !== '...' && (
                <span style={{ fontSize: 11, fontWeight: 700, color: t.color, fontFamily: "var(--font-mono)", minWidth: 42 }}>
                  {t.state === 'Bullish' ? '⬆' : t.state === 'Bearish' ? '⬇' : '◆'} {t.state === 'Bullish' ? tm('bullish') : t.state === 'Bearish' ? tm('bearish') : tm('neutral')}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: '#9CA3B5', padding: '10px 12px', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-lg)', fontWeight: 600 }}>
        <div style={{ textAlign: 'center' }}>
          {tm('tfStrategy')} <span style={{color: '#B388FF'}}>{strategy}</span>
        </div>
        {summary && (
          <>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#F0F2F5' }}>
              {summary.alignment}
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#059669' }}>
              {summary.executionHint}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
