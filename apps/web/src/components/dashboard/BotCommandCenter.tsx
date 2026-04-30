'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Pause, ShieldAlert, Zap, Settings2, RefreshCw, Layers, CheckCircle, Cpu } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useBotStore } from '@/hooks/useBotStore'
import { useTabAlertStore } from '@/hooks/useTabAlertStore'

const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  card:    '#111214',
  border:  'rgba(0, 229, 255, 0.08)',
  accent:  '#00E5FF',
  success: '#00C853',
  danger:  '#FF3B30',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

interface SmartSignal {
  id?: string
  symbol?: string
  pair: string
  type: 'BUY' | 'SELL'
  price: number
  tp: number
  sl: number
  conf: number
  reason: string
  time: string
  timeframe?: string
  sourceEngine?: string
  freshness?: string
  invalidatesWhen?: string
  expiresAt?: string
  source?: string
}

function formatSignalPrice(value: unknown) {
  const price = Number(value)
  return Number.isFinite(price) ? price.toLocaleString() : '—'
}

export function BotCommandCenter() {
  const [risk, setRisk] = useState<'low' | 'med' | 'high'>('med')
  const { setSelectedSymbol } = useSymbolStore()
  const { addTrade } = usePaperTradesStore()
  const { addNotification } = useNotificationStore()
  const { isOn: isActive, setIsOn: setBotActive, engineState, settings } = useBotStore()

  const [signals, setSignals] = useState<SmartSignal[]>([])
  const [loading, setLoading] = useState(false)
  const [executedIds, setExecutedIds] = useState<Record<string, boolean>>({})
  const [lastRefresh, setLastRefresh] = useState<string>('')
  const [countdown, setCountdown] = useState(30)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [hoveredSignal, setHoveredSignal] = useState<string | null>(null)

  const fetchSignals = useCallback(async () => {
    setLoading(true)
    setCountdown(30)
    try {
      const res = await fetch('/api/signals/smart', { signal: AbortSignal.timeout(15000) })
      const j = await res.json()
      if (j.success && j.data) {
        setSignals(j.data)
        setLastRefresh(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

        const strongSignals = j.data.filter((s: SmartSignal) => s.conf >= 70)
        for (const sig of strongSignals) {
          useTabAlertStore.getState().pushAlert('signals', {
            action: sig.type,
            label: `${sig.type === 'BUY' ? '⬆' : '⬇'} ${sig.pair} ${sig.conf}%`,
            color: sig.type === 'BUY' ? '#00C853' : '#FF3B30',
          })
        }
      }
    } catch (e) {
      console.error('Failed to fetch signals', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSignals()
    const int = setInterval(fetchSignals, 30000)
    return () => clearInterval(int)
  }, [fetchSignals])

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return 30
        return prev - 1
      })
    }, 1000)
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const handleExecute = (sig: SmartSignal, e: React.MouseEvent) => {
    e.stopPropagation()

    const qty = risk === 'low' ? 0.05 : risk === 'med' ? 0.15 : 0.30

    addTrade({
      symbol: sig.pair,
      side: sig.type === 'BUY' ? 'long' : 'short',
      qty,
      entryPrice: sig.price,
      currentPrice: sig.price,
      tp: sig.tp,
      sl: sig.sl,
      entryTime: Date.now(),
      strategy: 'Smart Signals',
      source: 'manual'
    })

    setExecutedIds(prev => ({ ...prev, [sig.id || (sig.pair + sig.time)]: true }))

    addNotification({
      title: 'تم تنفيذ الإشارة ✅',
      body: `تم فتح صفقة ${sig.type} ورقية لـ ${sig.pair} بسعر $${formatSignalPrice(sig.price)}`,
      priority: 'high',
      source: 'system',
      action: sig.type,
      pair: sig.pair,
      price: sig.price,
      confidence: sig.conf
    })
  }

  return (
    <div className="custom-scrollbar no-scrollbar" style={{ height: '100%', overflowY: 'auto', padding: '7px', display: 'flex', flexDirection: 'column', gap: 6, background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', borderRadius: 12, border: `1px solid ${T.border}` }}>

      {/* Bot Master Switch */}
      <div style={{
        background: isActive ? 'rgba(0,200,83,0.05)' : 'rgba(255,59,48,0.05)',
        border: `1px solid ${isActive ? 'rgba(0,200,83,0.2)' : 'rgba(255,59,48,0.2)'}`,
        borderRadius: 8, padding: '5px 7px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 16, height: 16, borderRadius: 4, background: isActive ? T.success : T.danger,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            boxShadow: `0 0 8px ${isActive ? T.success : T.danger}40`
          }}>
            {isActive ? <Zap size={8} /> : <Pause size={8} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 7.5, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>محرك التداول الذكي</span>
            <span style={{ fontSize: 5.5, color: isActive ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
              {isActive ? `ONLINE · ${engineState.toUpperCase()}` : 'PAUSED · MANUAL ONLY'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setBotActive(!isActive)}
          style={{
            background: isActive ? 'transparent' : T.success,
            border: `1px solid ${isActive ? T.danger : T.success}`,
            color: isActive ? T.danger : '#fff',
            minHeight: 16,
            padding: '2px 5px', borderRadius: 4, fontSize: 6, fontWeight: 800, cursor: 'pointer',
            fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s ease'
          }}
        >
          {isActive ? 'إيقاف' : 'تفعيل'}
        </button>
      </div>

      {/* Risk Management — compact row */}
      <div style={{ display: 'flex', gap: 3 }}>
        {[
          { id: 'low', label: 'منخفضة', color: T.success, desc: '0.05' },
          { id: 'med', label: 'متوسطة', color: T.amber, desc: '0.15' },
          { id: 'high', label: 'عالية', color: T.danger, desc: '0.30' }
        ].map(r => (
          <button
            key={r.id}
            onClick={() => setRisk(r.id as any)}
            style={{
              flex: 1, minHeight: 18, padding: '2px', borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s ease',
              background: risk === r.id ? `${r.color}12` : 'transparent',
              border: `1px solid ${risk === r.id ? r.color : T.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
              color: risk === r.id ? r.color : T.text2,
              fontSize: 6, fontWeight: risk === r.id ? 800 : 600, fontFamily: "'Cairo', sans-serif"
            }}
          >
            <Settings2 size={6} />
            {r.label}
          </button>
        ))}
      </div>

      {/* Live Signals Stream */}
      <div style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: '5px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ShieldAlert size={8} color={T.accent} />
            <span style={{ fontSize: 7, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>بث الإشارات</span>
            <span style={{ fontSize: 5.5, color: T.text3, fontFamily: 'monospace' }}>{countdown}s</span>
          </div>
          <button onClick={fetchSignals} disabled={loading} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 1 }}>
            <RefreshCw size={7} color={T.text2} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loading && signals.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 40, gap: 4 }}>
              <Layers size={12} color={T.accent} className="animate-pulse" />
              <span style={{ fontSize: 7, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>جاري فحص السوق...</span>
            </div>
          ) : signals.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 7, color: T.text3 }}>لا توجد إشارات قوية حالياً.</div>
          ) : (
            signals.map((sig, i) => {
              const isBuy = sig.type === 'BUY'
              const c = isBuy ? T.success : T.danger
              const sigKey = sig.id || (sig.pair + sig.time)
              const executed = executedIds[sigKey]
              const isHovered = hoveredSignal === sigKey

              return (
                <div key={i} onClick={() => setSelectedSymbol(sig.pair)}
                  onMouseEnter={() => setHoveredSignal(sigKey)}
                  onMouseLeave={() => setHoveredSignal(null)}
                  style={{
                  background: isHovered
                    ? `linear-gradient(180deg, ${c}08, rgba(255,255,255,0.02))`
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isHovered ? `${c}30` : T.border}`,
                  borderRadius: 8,
                  padding: '5px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  cursor: 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>

                  {/* Row 1: Pair + Direction badge + Confidence */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        fontSize: 5.5, fontWeight: 800, color: c,
                        background: `${c}15`, padding: '1px 3px', borderRadius: 2,
                        fontFamily: "'JetBrains Mono', monospace"
                      }}>{sig.type}</span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{sig.pair}</span>
                      <span style={{ fontSize: 7, fontWeight: 700, color: isBuy ? T.success : T.danger, fontFamily: "'Cairo', sans-serif" }}>
                        {isBuy ? '⬆ شراء' : '⬇ بيع'}
                      </span>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 800, color: T.text, fontFamily: 'monospace' }}>{sig.conf}%</span>
                  </div>

                  {/* Confidence progress bar */}
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${sig.conf}%`,
                      background: c,
                      boxShadow: `0 0 6px ${c}40`,
                      borderRadius: 2,
                      transition: 'width 0.3s ease'
                    }} />
                  </div>

                  {/* Row 2: Reason */}
                  <div style={{ fontSize: 6.5, color: T.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.4 }}>
                    {sig.reason}
                  </div>

                  {/* Row 3: TP/SL + Execute */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 5, fontSize: 6, fontFamily: "'JetBrains Mono', monospace", color: T.text2 }}>
                       <span>TP: <span style={{ color: T.success }}>{sig.tp.toFixed(2)}</span></span>
                       <span>SL: <span style={{ color: T.danger }}>{sig.sl.toFixed(2)}</span></span>
                    </div>
                    <button
                      onClick={(e) => !executed && handleExecute(sig, e)}
                      disabled={executed}
                      style={{
                        background: executed ? 'rgba(255,255,255,0.05)' : `${c}12`,
                        border: `1px solid ${executed ? 'rgba(255,255,255,0.1)' : `${c}35`}`,
                        color: executed ? T.text3 : c,
                        minHeight: 14,
                        padding: '1px 4px', borderRadius: 3, fontSize: 5.5, fontWeight: 800,
                        cursor: executed ? 'default' : 'pointer', fontFamily: "'Cairo', sans-serif",
                        display: 'flex', alignItems: 'center', gap: 2,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {executed ? <><CheckCircle size={5} /> تم</> : 'تنفيذ'}
                    </button>
                  </div>

                  {/* Row 4: Meta */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 5, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                    <span>{sig.sourceEngine || 'scanner'} · {sig.timeframe || '1H'}</span>
                    <span>{sig.time}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

    </div>
  )
}
