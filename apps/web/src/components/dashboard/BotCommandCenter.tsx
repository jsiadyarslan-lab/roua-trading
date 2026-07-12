'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { Play, Pause, ShieldAlert, Zap, Settings2, RefreshCw, Layers, CheckCircle, Cpu } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useBotStore } from '@/hooks/useBotStore'
import { useTabAlertStore } from '@/hooks/useTabAlertStore'
import { useTranslations, useLocale } from 'next-intl'

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

  const tb = useTranslations('dashboard.botCommand')
  const tc = useTranslations('common')
  const locale = useLocale()

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
        setLastRefresh(new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

        const strongSignals = j.data.filter((s: SmartSignal) => s.conf >= 70)
        for (const sig of strongSignals) {
          useTabAlertStore.getState().pushAlert('signals', {
            action: sig.type,
            label: `${sig.type === 'BUY' ? '⬆' : '⬇'} ${sig.pair} ${sig.conf}%`,
            color: sig.type === 'BUY' ? '#00FFA3' : '#FF4757',
          })
        }
      }
    } catch (e) {
      console.error('Failed to fetch signals', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSignals() }, [fetchSignals])
  // Poll every 30s — pauses when tab hidden
  useVisibleInterval(fetchSignals, 30000)

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
      strategy: tb('smartSignalsLabel'),
      source: 'manual'
    })

    setExecutedIds(prev => ({ ...prev, [sig.id || (sig.pair + sig.time)]: true }))

    addNotification({
      title: tb('signalExecuted'),
      body: tb('paperTradeOpened', { type: sig.type === 'BUY' ? tc('buy') : tc('sell'), pair: sig.pair }),
      priority: 'high',
      source: 'system',
      action: sig.type,
      pair: sig.pair,
      price: sig.price,
      confidence: sig.conf
    })
  }

  return (
    <div className="custom-scrollbar no-scrollbar" style={{ direction: 'inherit', height: '100%', overflowY: 'auto', padding: '7px', display: 'flex', flexDirection: 'column', gap: 6, background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', borderRadius: 'var(--radius-lg)', border: `1px solid ${'#2A313C'}` }}>

      {/* Bot Master Switch */}
      <div style={{
        background: isActive ? 'rgba(0,255,163,0.05)' : 'rgba(255,71,87,0.05)',
        border: `1px solid ${isActive ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)'}`,
        borderRadius: 'var(--radius-md)', padding: '5px 7px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 16, height: 16, borderRadius: 'var(--radius-sm)', background: isActive ? '#00FFA3' : '#FF4757',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            boxShadow: `0 0 8px ${isActive ? '#00FFA3' : '#FF4757'}40`
          }}>
            {isActive ? <Zap size={8} /> : <Pause size={8} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>{tb('smartFollowEngine')}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: isActive ? '#00FFA3' : '#FF4757', fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {isActive ? `${tc('online').toUpperCase()} · ${engineState.toUpperCase()}` : tb('pausedManualOnly')}
            </span>
          </div>
        </div>
        <button
          onClick={() => setBotActive(!isActive)}
          style={{
            background: isActive ? 'transparent' : '#00FFA3',
            border: `1px solid ${isActive ? '#FF4757' : '#00FFA3'}`,
            color: isActive ? '#FF4757' : '#fff',
            minHeight: 16,
            padding: '2px 5px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 800, cursor: 'pointer',
            fontFamily: "var(--font-ar)", transition: 'all 0.2s ease'
          }}
        >
          {isActive ? tb('stop') : tb('activate')}
        </button>
      </div>

      {/* Risk Management — compact row */}
      <div style={{ display: 'flex', gap: 3 }}>
        {[
          { id: 'low', label: tb('low'), color: '#00FFA3', desc: '0.05' },
          { id: 'med', label: tb('medium'), color: '#FFB800', desc: '0.15' },
          { id: 'high', label: tb('high'), color: '#FF4757', desc: '0.30' }
        ].map(r => (
          <button
            key={r.id}
            onClick={() => setRisk(r.id as any)}
            style={{
              flex: 1, minHeight: 18, padding: '2px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.2s ease',
              background: risk === r.id ? `${r.color}12` : 'transparent',
              border: `1px solid ${risk === r.id ? r.color : '#2A313C'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
              color: risk === r.id ? r.color : '#9CA3B5',
              fontSize: 'var(--text-xs)', fontWeight: risk === r.id ? 800 : 600, fontFamily: "var(--font-ar)"
            }}
          >
            <Settings2 size={6} />
            {r.label}
          </button>
        ))}
      </div>

      {/* Live Signals Stream */}
      <div style={{ flex: 1, border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-md)', padding: '5px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ShieldAlert size={8} color={'#059669'} />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>{tb('signalStream')}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-mono)" }}>{countdown}s</span>
          </div>
          <button onClick={fetchSignals} disabled={loading} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 1 }}>
            <RefreshCw size={7} color={'#9CA3B5'} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loading && signals.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 40, gap: 4 }}>
              <Layers size={12} color={'#059669'} className="animate-pulse" />
              <span style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5', fontFamily: "var(--font-ar)" }}>{tb('scanningMarket')}</span>
            </div>
          ) : signals.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 'var(--text-xs)', color: '#6B7280' }}>{tb('noStrongSignals')}</div>
          ) : (
            signals.map((sig, i) => {
              const isBuy = sig.type === 'BUY'
              const c = isBuy ? '#00FFA3' : '#FF4757'
              const sigKey = sig.id || (sig.pair + sig.time)
              const executed = executedIds[sigKey]
              const isHovered = hoveredSignal === sigKey

              return (
                <div key={sigKey} onClick={() => setSelectedSymbol(sig.pair)}
                  onMouseEnter={() => setHoveredSignal(sigKey)}
                  onMouseLeave={() => setHoveredSignal(null)}
                  style={{
                  background: isHovered
                    ? `linear-gradient(180deg, ${c}08, rgba(255,255,255,0.02))`
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isHovered ? `${c}30` : '#2A313C'}`,
                  borderRadius: 'var(--radius-md)',
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
                        fontSize: 'var(--text-xs)', fontWeight: 800, color: c,
                        background: `${c}15`, padding: '1px 3px', borderRadius: 'var(--radius-xs)',
                        fontFamily: "var(--font-mono)"
                      }}>{sig.type}</span>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-mono)" }}>{sig.pair}</span>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: isBuy ? '#00FFA3' : '#FF4757', fontFamily: "var(--font-ar)" }}>
                        {isBuy ? tb('buyArrow') : tb('sellArrow')}
                      </span>
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-mono)" }}>{sig.conf}%</span>
                  </div>

                  {/* Confidence progress bar */}
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${sig.conf}%`,
                      background: c,
                      boxShadow: `0 0 6px ${c}40`,
                      borderRadius: 'var(--radius-xs)',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>

                  {/* Row 2: Reason */}
                  <div style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5', fontFamily: "var(--font-ar)", lineHeight: 1.4 }}>
                    {sig.reason}
                  </div>

                  {/* Row 3: TP/SL + Execute */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 5, fontSize: 'var(--text-xs)', fontFamily: "var(--font-mono)", color: '#9CA3B5' }}>
                       <span>{tc('takeProfit')}: <span style={{ color: '#00FFA3' }}>{sig.tp.toFixed(2)}</span></span>
                       <span>{tc('stopLoss')}: <span style={{ color: '#FF4757' }}>{sig.sl.toFixed(2)}</span></span>
                    </div>
                    <button
                      onClick={(e) => !executed && handleExecute(sig, e)}
                      disabled={executed}
                      style={{
                        background: executed ? 'rgba(255,255,255,0.05)' : `${c}12`,
                        border: `1px solid ${executed ? 'rgba(255,255,255,0.1)' : `${c}35`}`,
                        color: executed ? '#6B7280' : c,
                        minHeight: 14,
                        padding: '1px 4px', borderRadius: 'var(--radius-xs)', fontSize: 'var(--text-xs)', fontWeight: 800,
                        cursor: executed ? 'default' : 'pointer', fontFamily: "var(--font-ar)",
                        display: 'flex', alignItems: 'center', gap: 2,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {executed ? <><CheckCircle size={5} /> {tb('done')}</> : tb('execute')}
                    </button>
                  </div>

                  {/* Row 4: Meta */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-mono)" }}>
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
