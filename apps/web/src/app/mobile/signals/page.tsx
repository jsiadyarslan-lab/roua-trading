'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { TrendingUp, TrendingDown, Target, ShieldAlert, Loader2, RefreshCw, Zap, Clock } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

interface SmartSignal {
  id: string
  pair: string
  type: 'BUY' | 'SELL'
  price: number
  tp: number
  sl: number
  conf: number
  reason: string
  time: string
  timeframe: string
  sourceEngine: string
  freshness: string
  signalClass: string
  entryBias: string
  reasons: string[]
}

export default function MobileSignalsPage() {
  const router = useRouter()
  const [signals, setSignals] = useState<SmartSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')

  const fetchSignals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/signals/smart?limit=15')
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setSignals(data.data)
        }
      }
    } catch { /* */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, 120000)
    return () => clearInterval(interval)
  }, [fetchSignals])

  const filtered = filter === 'ALL' ? signals : signals.filter(s => s.type === filter)

  return (
    <div className="m-page">
      <MobilePageHeader
        title="الإشارات الذكية"
        subtitle="توصيات تداول مدعومة بالذكاء"
        onBack={() => router.back()}
        right={
          <button onClick={fetchSignals} disabled={loading} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} color={C.text2} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* Filter Tabs */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
          {([['ALL', 'الكل'], ['BUY', 'شراء'], ['SELL', 'بيع']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: filter === key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: filter === key ? C.accent : C.text2, fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 12 }}>
        <div style={{ padding: '8px', borderRadius: 12, textAlign: 'center', background: `${C.success}08`, border: `0.5px solid ${C.success}18` }}>
          <TrendingUp size={14} color={C.success} style={{ margin: '0 auto 3px' }} />
          <div style={{ fontSize: 16, fontWeight: 900, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>{signals.filter(s => s.type === 'BUY').length}</div>
          <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>شراء</div>
        </div>
        <div style={{ padding: '8px', borderRadius: 12, textAlign: 'center', background: `${C.danger}08`, border: `0.5px solid ${C.danger}18` }}>
          <TrendingDown size={14} color={C.danger} style={{ margin: '0 auto 3px' }} />
          <div style={{ fontSize: 16, fontWeight: 900, color: C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{signals.filter(s => s.type === 'SELL').length}</div>
          <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>بيع</div>
        </div>
        <div style={{ padding: '8px', borderRadius: 12, textAlign: 'center', background: `${C.accent}08`, border: `0.5px solid ${C.accent}18` }}>
          <Zap size={14} color={C.accent} style={{ margin: '0 auto 3px' }} />
          <div style={{ fontSize: 16, fontWeight: 900, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>{signals.length}</div>
          <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>إجمالي</div>
        </div>
      </div>

      {/* Signals List */}
      {loading && signals.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={24} className="animate-spin" color={C.accent} />
          <span style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>جارٍ تحميل الإشارات...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <Zap size={32} color={C.text2} style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: 13, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>لا توجد إشارات حالياً</div>
        </div>
      ) : (
        filtered.map((signal) => {
          const isBuy = signal.type === 'BUY'
          const dirColor = isBuy ? C.success : C.danger
          return (
            <IOSCard key={signal.id}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: `${dirColor}12`, border: `0.5px solid ${dirColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isBuy ? <TrendingUp size={16} color={dirColor} /> : <TrendingDown size={16} color={dirColor} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{signal.pair}</div>
                    <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{signal.sourceEngine} · {signal.timeframe}</div>
                  </div>
                </div>
                <div style={{ padding: '4px 12px', borderRadius: 8, background: `${dirColor}12`, border: `0.5px solid ${dirColor}25` }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: dirColor, fontFamily: "'Cairo', sans-serif" }}>{isBuy ? 'شراء' : 'بيع'}</span>
                </div>
              </div>

              {/* Confidence bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الثقة</span>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${signal.conf}%`, background: `linear-gradient(90deg, ${dirColor}, ${dirColor}60)`, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 900, color: dirColor, fontFamily: "'JetBrains Mono', monospace" }}>{signal.conf}%</span>
              </div>

              {/* TP / SL / Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                <div style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>السعر</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{signal.price > 100 ? signal.price.toFixed(2) : signal.price.toFixed(4)}</div>
                </div>
                <div style={{ padding: '6px 8px', borderRadius: 8, background: `${C.success}06`, border: `0.5px solid ${C.success}15` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                    <Target size={8} color={C.success} />
                    <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الهدف</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>{signal.tp > 100 ? signal.tp.toFixed(2) : signal.tp.toFixed(4)}</div>
                </div>
                <div style={{ padding: '6px 8px', borderRadius: 8, background: `${C.danger}06`, border: `0.5px solid ${C.danger}15` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                    <ShieldAlert size={8} color={C.danger} />
                    <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الوقف</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{signal.sl > 100 ? signal.sl.toFixed(2) : signal.sl.toFixed(4)}</div>
                </div>
              </div>

              {/* Reason */}
              <p style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6, margin: 0 }}>{signal.reason}</p>

              {/* Meta */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {signal.reasons?.slice(0, 3).map((r: string, ri: number) => (
                    <span key={ri} style={{ fontSize: 8, fontWeight: 700, color: C.text2, background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4, fontFamily: "'Cairo', sans-serif" }}>{r}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={9} color={C.text2} />
                  <span style={{ fontSize: 8, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{signal.time}</span>
                </div>
              </div>
            </IOSCard>
          )
        })
      )}

      <div style={{ height: 20 }} />
    </div>
  )
}
