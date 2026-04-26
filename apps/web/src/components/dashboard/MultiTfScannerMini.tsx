'use client'

import { useState, useEffect, useRef } from 'react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { RefreshCw, Layers, Activity } from 'lucide-react'

const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  border:  'rgba(0, 229, 255, 0.08)',
  accent:  '#00E5FF',
  green:   '#00C853',
  red:     '#FF3B30',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
}

export function MultiTfScannerMini() {
  const { selectedSymbol } = useSymbolStore()
  const [data, setData] = useState<any[]>([])
  const [summary, setSummary] = useState<{ alignment: string; executionHint: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(60)
  const [scanCount, setScanCount] = useState(0)
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      setLoading(true)
      try {
        const timeframes = ['15m', '1h', '4h', '1d']
        const promises = timeframes.map(tf =>
          fetch(`/api/market-scan?pair=${encodeURIComponent(selectedSymbol)}&tf=${tf}`, { signal: AbortSignal.timeout(15000) }).then(r => r.json())
        )
        const results = await Promise.all(promises)

        if (!mounted) return

        const processed = results.map((res, i) => {
          const timeframes = ['15m', '1h', '4h', '1d']
          if (!res.success || !res.data || res.data.length === 0) {
             return { tf: timeframes[i].toUpperCase(), state: 'Neutral', strength: 50, color: T.amber, entryBias: 'wait', signalClass: 'watch' }
          }
          const item = res.data[0]
          return {
             tf: timeframes[i].toUpperCase(),
             state: item.dir === 'buy' ? 'Bullish' : item.dir === 'sell' ? 'Bearish' : 'Neutral',
             strength: item.strength,
             color: item.dir === 'buy' ? T.green : item.dir === 'sell' ? T.red : T.amber,
             entryBias: item.entryBias,
             signalClass: item.signalClass,
             reasons: item.reasons || [],
          }
        })
        setData(processed)
        setScanCount(prev => prev + 1)
        setLastUpdate(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

        const score = processed.reduce((sum, item, index) => {
          const weight = index === 3 ? 2 : index === 2 ? 1.5 : index === 1 ? 1 : 0.5
          return sum + (item.state === 'Bullish' ? item.strength * weight : item.state === 'Bearish' ? -item.strength * weight : 0)
        }, 0)

        setSummary({
          alignment: Math.abs(score) > 260 ? 'Strong Alignment' : Math.abs(score) > 140 ? 'Mixed Alignment' : 'Counter Trend',
          executionHint: Math.abs(score) > 260
            ? score > 0 ? 'الدخول مع الاتجاه مسموح' : 'الدخول البيعي مع الاتجاه مسموح'
            : Math.abs(score) > 140
              ? 'انتظار تأكيد من 15M قبل التنفيذ'
              : 'لا تدخل ضد الإطار الأعلى الآن',
        })
      } catch (e) {
        console.error(e)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchData()
    const iv = setInterval(fetchData, 60000)
    return () => { mounted = false; clearInterval(iv) }
  }, [selectedSymbol])

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
  const strategy = overallStrength > 100 ? 'Trend Follow (Long)' : overallStrength < -100 ? 'Trend Follow (Short)' : 'Wait / Pullback'

  return (
    <div className="custom-scrollbar" style={{ height: '100%', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', borderRadius: 16, border: `1px solid ${T.border}` }}>
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
            {loading ? 'جاري المسح...' : 'Live Sync'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
        {data.length === 0 && !loading ? (
           <div style={{ textAlign: 'center', color: T.text2, fontSize: 10 }}>لا تتوفر بيانات للرمز المحدد</div>
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
                  {t.state === 'Bullish' ? '⬆' : t.state === 'Bearish' ? '⬇' : '◆'} {t.state}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10, color: T.text2, padding: '10px 12px', border: `1px solid ${T.border}`, borderRadius: 12, fontWeight: 600 }}>
        <div style={{ textAlign: 'center' }}>
          استراتيجية الأطر: <span style={{color: T.purple}}>{strategy}</span>
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
