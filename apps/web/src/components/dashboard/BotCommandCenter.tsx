'use client'

import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, ShieldAlert, Zap, Settings2, RefreshCw, Layers, CheckCircle } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useBotStore } from '@/hooks/useBotStore'

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
  const { isOn: isActive, setIsOn: setBotActive, engineState } = useBotStore()

  const [signals, setSignals] = useState<SmartSignal[]>([])
  const [loading, setLoading] = useState(false)
  const [executedIds, setExecutedIds] = useState<Record<string, boolean>>({})

  const fetchSignals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/signals/smart')
      const j = await res.json()
      if (j.success && j.data) {
        setSignals(j.data)
      }
    } catch (e) {
      console.error('Failed to fetch signals', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSignals()
    const int = setInterval(fetchSignals, 30000) // Refresh every 30s
    return () => clearInterval(int)
  }, [fetchSignals])

  const handleExecute = (sig: SmartSignal, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering the row click (setSelectedSymbol)
    
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
    <div className="custom-scrollbar no-scrollbar" style={{ height: '100%', overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 12, background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', borderRadius: 16, border: `1px solid ${T.border}` }}>
      
      {/* Bot Master Switch */}
      <div style={{
        background: isActive ? 'rgba(0,200,83,0.05)' : 'rgba(255,59,48,0.05)',
        border: `1px solid ${isActive ? 'rgba(0,200,83,0.2)' : 'rgba(255,59,48,0.2)'}`,
        borderRadius: 14, padding: '14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: isActive ? T.success : T.danger,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            boxShadow: `0 0 12px ${isActive ? T.success : T.danger}40`
          }}>
            {isActive ? <Zap size={16} /> : <Pause size={16} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>محرك التداول الذكي</span>
            <span style={{ fontSize: 9, color: isActive ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
              {isActive ? `SYSTEM ONLINE - ${engineState.toUpperCase()}` : 'SYSTEM PAUSED - MANUAL ONLY'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setBotActive(!isActive)}
          style={{
            background: isActive ? 'transparent' : T.success,
            border: `1px solid ${isActive ? T.danger : T.success}`,
            color: isActive ? T.danger : '#fff',
            padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer',
            fontFamily: "'Cairo', sans-serif", transition: '0.2s'
          }}
        >
          {isActive ? 'إيقاف البوت' : 'تفعيل البوت'}
        </button>
      </div>

      {/* Risk Management */}
      <div className="card" style={{ border: `1px solid ${T.border}`, borderRadius: 14, padding: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Settings2 size={12} color={T.text2} />
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>إدارة المخاطر (لحجم الإشارة)</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'low', label: 'مخاطرة منخفضة', color: T.success, desc: 'حجم: 0.05' },
            { id: 'med', label: 'مخاطرة متوسطة', color: T.amber, desc: 'حجم: 0.15' },
            { id: 'high', label: 'عالي المخاطرة', color: T.danger, desc: 'حجم: 0.30' }
          ].map(r => (
            <button
              key={r.id}
              onClick={() => setRisk(r.id as any)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 6, cursor: 'pointer', transition: '0.2s',
                background: risk === r.id ? `${r.color}15` : 'transparent',
                border: `1px solid ${risk === r.id ? r.color : T.border}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
              }}
            >
              <span style={{ fontSize: 10, fontWeight: risk === r.id ? 800 : 500, color: risk === r.id ? r.color : T.text, fontFamily: "'Cairo', sans-serif" }}>{r.label}</span>
              <span style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{r.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Live Signals Stream */}
      <div className="card" style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 14, padding: '12px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldAlert size={12} color={T.accent} />
            <span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>بث الإشارات الحية (Live Signals)</span>
          </div>
          <button onClick={fetchSignals} disabled={loading} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <RefreshCw size={12} color={T.text2} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading && signals.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 80, gap: 8 }}>
              <Layers size={20} color={T.accent} className="animate-pulse" />
              <span style={{ fontSize: 10, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>جاري فحص السوق...</span>
            </div>
          ) : signals.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 10, color: T.text3 }}>لا توجد إشارات قوية حالياً.</div>
          ) : (
            signals.map((sig, i) => {
              const isBuy = sig.type === 'BUY'
              const c = isBuy ? T.success : T.danger
              const sigKey = sig.id || (sig.pair + sig.time)
              const executed = executedIds[sigKey]

              return (
                <div key={i} onClick={() => setSelectedSymbol(sig.pair)} className="card" style={{
                  background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 11px',
                  display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', transition: '0.2s'
                }} onMouseEnter={e => e.currentTarget.style.borderColor = c} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                  
                  {/* Top Row: Asset & Signal */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, color: c, background: `${c}15`, padding: '2px 6px', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace"
                      }}>{sig.type}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{sig.pair}</span>
                    </div>
                    <span style={{ fontSize: 9, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>الثقة: {sig.conf}%</span>
                  </div>

                  {/* Middle Row: Details */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '4px 6px', borderRadius: 4 }}>
                    <span style={{ fontSize: 9, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>{sig.reason}</span>
                     <span style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                       {sig.timeframe || '1H'} · {sig.time}
                     </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                      {sig.sourceEngine || 'scanner-engine'} {sig.freshness ? `· ${sig.freshness}` : ''}
                    </span>
                    {sig.invalidatesWhen && (
                      <span style={{ fontSize: 8, color: T.amber, fontFamily: "'Cairo', sans-serif", textAlign: 'left' }}>
                        {sig.invalidatesWhen}
                      </span>
                    )}
                  </div>

                  {/* Bottom Row: Execute Button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 8, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: T.text2 }}>
                       <span>TP: <span style={{ color: T.success }}>{sig.tp.toFixed(2)}</span></span>
                       <span>SL: <span style={{ color: T.danger }}>{sig.sl.toFixed(2)}</span></span>
                    </div>
                    <button 
                      onClick={(e) => !executed && handleExecute(sig, e)}
                      disabled={executed}
                      style={{
                        background: executed ? 'rgba(255,255,255,0.05)' : `${c}15`,
                        border: `1px solid ${executed ? 'rgba(255,255,255,0.1)' : `${c}40`}`,
                        color: executed ? T.text3 : c,
                        padding: '4px 10px', borderRadius: 4, fontSize: 9, fontWeight: 800,
                        cursor: executed ? 'default' : 'pointer', fontFamily: "'Cairo', sans-serif",
                        display: 'flex', alignItems: 'center', gap: 4
                      }}
                    >
                      {executed ? <><CheckCircle size={10} /> تم التنفيذ</> : 'تنفيذ ⚡'}
                    </button>
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
