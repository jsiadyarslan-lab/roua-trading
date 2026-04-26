'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Pause, ShieldAlert, Zap, Settings2, RefreshCw, Layers, CheckCircle, Cpu, Wifi, WifiOff, Brain } from 'lucide-react'
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
  const [aiScanResult, setAiScanResult] = useState<{ symbol: string; recommendation: string; confidence: number } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [countdown, setCountdown] = useState(30)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSignals = useCallback(async () => {
    setLoading(true)
    setCountdown(30)
    try {
      const res = await fetch('/api/signals/smart', { signal: AbortSignal.timeout(15000) })
      const j = await res.json()
      if (j.success && j.data) {
        setSignals(j.data)
        setLastRefresh(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

        // Push alerts for high-confidence signals
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

  // Fetch AI analysis for the active symbol
  const fetchAISignal = useCallback(async (symbol: string) => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
        signal: AbortSignal.timeout(30000),
      })
      const j = await res.json()
      if (j.success && j.data) {
        setAiScanResult({
          symbol,
          recommendation: j.data.recommendation,
          confidence: j.data.consensusScore,
        })
      }
    } catch {
      setAiScanResult(null)
    } finally {
      setAiLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSignals()
    const int = setInterval(fetchSignals, 30000)
    return () => clearInterval(int)
  }, [fetchSignals])

  // Countdown timer — makes the panel feel alive
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
    <div className="custom-scrollbar no-scrollbar" style={{ height: '100%', overflowY: 'auto', padding: '7px', display: 'flex', flexDirection: 'column', gap: 7, background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', borderRadius: 12, border: `1px solid ${T.border}` }}>

      {/* Bot Master Switch */}
      <div style={{
        background: isActive ? 'rgba(0,200,83,0.05)' : 'rgba(255,59,48,0.05)',
        border: `1px solid ${isActive ? 'rgba(0,200,83,0.2)' : 'rgba(255,59,48,0.2)'}`,
        borderRadius: 10, padding: '7px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 20, height: 20, borderRadius: 6, background: isActive ? T.success : T.danger,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            boxShadow: `0 0 10px ${isActive ? T.success : T.danger}40`
          }}>
            {isActive ? <Zap size={10} /> : <Pause size={10} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>محرك التداول الذكي</span>
            <span style={{ fontSize: 6, color: isActive ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
              {isActive ? `SYSTEM ONLINE - ${engineState.toUpperCase()}` : 'SYSTEM PAUSED - MANUAL ONLY'}
            </span>
            {isActive && settings.useAIConsensus && (
              <span style={{ fontSize: 5.5, color: T.purple, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, marginTop: 1 }}>
                🧠 AI CONSENSUS ACTIVE
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setBotActive(!isActive)}
          className="btn-platform-hover"
          style={{
            background: isActive ? 'transparent' : T.success,
            border: `1px solid ${isActive ? T.danger : T.success}`,
            color: isActive ? T.danger : '#fff',
            minHeight: 20,
            padding: '3px 6px', borderRadius: 5, fontSize: 7, fontWeight: 800, cursor: 'pointer',
            fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s ease'
          }}
        >
          {isActive ? 'إيقاف البوت' : 'تفعيل البوت'}
        </button>
      </div>

      {/* Risk Management */}
      <div className="card" style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: '7px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
          <Settings2 size={10} color={T.text2} />
          <span style={{ fontSize: 8, fontWeight: 700, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>إدارة المخاطر</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'low', label: 'مخاطرة منخفضة', color: T.success, desc: 'حجم: 0.05' },
            { id: 'med', label: 'مخاطرة متوسطة', color: T.amber, desc: 'حجم: 0.15' },
            { id: 'high', label: 'عالي المخاطرة', color: T.danger, desc: 'حجم: 0.30' }
          ].map(r => (
            <button
              key={r.id}
              onClick={() => setRisk(r.id as any)}
              className="btn-platform-hover"
              style={{
                flex: 1, minHeight: 26, padding: '3px 2px', borderRadius: 5, cursor: 'pointer', transition: 'all 0.2s ease',
                background: risk === r.id ? `${r.color}15` : 'transparent',
                border: `1px solid ${risk === r.id ? r.color : T.border}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2
              }}
            >
              <span style={{ fontSize: 6.5, fontWeight: risk === r.id ? 800 : 600, color: risk === r.id ? r.color : T.text, fontFamily: "'Cairo', sans-serif", lineHeight: 1 }}>{r.label}</span>
              <span style={{ fontSize: 6, color: T.text3, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{r.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* AI Quick Scan */}
      <div className="card" style={{ border: `1px solid rgba(179,136,255,0.12)`, borderRadius: 10, padding: '7px', background: 'rgba(179,136,255,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Brain size={10} color={T.purple} />
            <span style={{ fontSize: 8, fontWeight: 700, color: T.purple, fontFamily: "'Cairo', sans-serif" }}>فحص AI سريع</span>
          </div>
          <button
            onClick={() => fetchAISignal(useSymbolStore.getState().selectedSymbol)}
            disabled={aiLoading}
            className="btn-platform-hover"
            style={{ background: 'transparent', border: 'none', cursor: aiLoading ? 'not-allowed' : 'pointer', padding: 3, borderRadius: 4 }}
          >
            <RefreshCw size={9} color={T.purple} className={aiLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        {aiLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
            <div className="animate-pulse" style={{ width: 5, height: 5, borderRadius: '50%', background: T.purple }} />
            <span style={{ fontSize: 7, color: T.purple, fontFamily: "'Cairo', sans-serif" }}>جاري استشارة AI...</span>
          </div>
        ) : aiScanResult ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 8, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{aiScanResult.symbol}</span>
              <span style={{ fontSize: 7, marginRight: 4, fontWeight: 700, color: aiScanResult.recommendation === 'BUY' ? T.success : aiScanResult.recommendation === 'SELL' ? T.danger : T.amber }}>
                {aiScanResult.recommendation === 'BUY' ? '⬆ شراء' : aiScanResult.recommendation === 'SELL' ? '⬇ بيع' : '◆ انتظار'}
              </span>
            </div>
            <span style={{ fontSize: 7, color: T.text3, fontFamily: 'monospace' }}>{aiScanResult.confidence}%</span>
          </div>
        ) : (
          <div style={{ fontSize: 7, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>اضغط لفحص الأصل النشط عبر AI</div>
        )}
      </div>

      {/* Live Signals Stream */}
      <div className="card" style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 10, padding: '7px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ShieldAlert size={10} color={T.accent} />
            <span style={{ fontSize: 8, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>بث الإشارات الحية</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 6, color: T.text3, fontFamily: 'monospace' }}>{countdown}s</span>
            <button onClick={fetchSignals} disabled={loading} className="btn-platform-hover" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }}>
              <RefreshCw size={9} color={T.text2} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {lastRefresh && (
          <div style={{ fontSize: 6, color: T.text3, fontFamily: 'monospace', marginBottom: 4 }}>
            آخر تحديث: {lastRefresh}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {loading && signals.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 60, gap: 6 }}>
              <Layers size={16} color={T.accent} className="animate-pulse" />
              <span style={{ fontSize: 8, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>جاري فحص السوق...</span>
            </div>
          ) : signals.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 8, color: T.text3 }}>لا توجد إشارات قوية حالياً.</div>
          ) : (
            signals.map((sig, i) => {
              const isBuy = sig.type === 'BUY'
              const c = isBuy ? T.success : T.danger
              const sigKey = sig.id || (sig.pair + sig.time)
              const executed = executedIds[sigKey]

              return (
                <div key={i} onClick={() => setSelectedSymbol(sig.pair)} className="signal-card-interactive" style={{
                  background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 7px',
                  display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                  position: 'relative', overflow: 'hidden'
                }}>

                  {/* Hover glow overlay */}
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0, transition: 'opacity 0.25s',
                    background: `radial-gradient(circle at 50% 50%, ${c}08, transparent 70%)`
                  }} className="signal-glow-overlay" />

                  {/* Top Row: Asset & Signal */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 6.5, fontWeight: 800, color: c, background: `${c}15`, padding: '1px 4px', borderRadius: 3, fontFamily: "'JetBrains Mono', monospace"
                      }}>{sig.type}</span>
                      <span style={{ fontSize: 8, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{sig.pair}</span>
                    </div>
                    <span style={{ fontSize: 6.5, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>الثقة: {sig.conf}%</span>
                  </div>

                  {/* Middle Row: Details */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '3px 5px', borderRadius: 3, position: 'relative', zIndex: 1 }}>
                    <span style={{ fontSize: 7, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>{sig.reason}</span>
                     <span style={{ fontSize: 6, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                       {sig.timeframe || '1H'} · {sig.time}
                     </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1 }}>
                    <span style={{ fontSize: 6, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                      {sig.sourceEngine || 'scanner-engine'} {sig.freshness ? `· ${sig.freshness}` : ''}
                    </span>
                    {sig.invalidatesWhen && (
                      <span style={{ fontSize: 6, color: T.amber, fontFamily: "'Cairo', sans-serif", textAlign: 'left' }}>
                        {sig.invalidatesWhen}
                      </span>
                    )}
                  </div>

                  {/* Bottom Row: Execute Button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, fontSize: 6.5, fontFamily: "'JetBrains Mono', monospace", color: T.text2 }}>
                       <span>TP: <span style={{ color: T.success }}>{sig.tp.toFixed(2)}</span></span>
                       <span>SL: <span style={{ color: T.danger }}>{sig.sl.toFixed(2)}</span></span>
                    </div>
                    <button
                      onClick={(e) => !executed && handleExecute(sig, e)}
                      disabled={executed}
                      className="btn-platform-hover"
                      style={{
                        background: executed ? 'rgba(255,255,255,0.05)' : `${c}15`,
                        border: `1px solid ${executed ? 'rgba(255,255,255,0.1)' : `${c}40`}`,
                        color: executed ? T.text3 : c,
                        minHeight: 18,
                        padding: '2px 5px', borderRadius: 4, fontSize: 6, fontWeight: 800,
                        cursor: executed ? 'default' : 'pointer', fontFamily: "'Cairo', sans-serif",
                        display: 'flex', alignItems: 'center', gap: 3,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {executed ? <><CheckCircle size={7} /> تم</> : 'تنفيذ'}
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
