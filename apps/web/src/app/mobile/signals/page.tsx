'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, RefreshCw, TrendingUp, TrendingDown, Minus,
  Loader2, AlertTriangle, XCircle, Shield, Activity,
  Sparkles, Timer, Crosshair, ChevronRight, ArrowRight
} from 'lucide-react'
import { useMarketStore } from '@/hooks/useMarketStore'

interface Signal {
  id: string
  pair: string
  action: 'BUY' | 'SELL' | 'WAIT'
  confidence: number
  reason: string
  entryPrice: number | null
  stopLoss: number | null
  takeProfit: number | null
  status: string
  expiresAt: string
  createdAt: string
}

const QUICK_PAIRS = [
  { symbol: 'BTC/USD', name: 'Bitcoin', icon: '₿', color: '#FFB800' },
  { symbol: 'ETH/USD', name: 'Ethereum', icon: 'Ξ', color: '#A259FF' },
  { symbol: 'SOL/USD', name: 'Solana', icon: '◎', color: '#00D4FF' },
  { symbol: 'GOLD', name: 'Gold', icon: 'AU', color: '#FFB800' },
]

function getSignalConfig(action: 'BUY' | 'SELL' | 'WAIT') {
  if (action === 'BUY') return { label: 'شراء', color: '#32D74B', icon: TrendingUp }
  if (action === 'SELL') return { label: 'بيع', color: '#FF453A', icon: TrendingDown }
  return { label: 'انتظار', color: '#FFB800', icon: Minus }
}

export default function MobileSignalsPage() {
  const router = useRouter()
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState('')

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/signals/active')
      if (res.ok) {
        const data = await res.json()
        if (data.success) setSignals(data.data)
      }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSignals() }, [fetchSignals])

  const handleGenerate = async (pair: string) => {
    setGenerating(pair)
    setError('')
    try {
      const res = await fetch(`/api/signals/generate/${encodeURIComponent(pair)}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل توليد الإشارة')
      await fetchSignals()
    } catch (err: any) { setError(err.message) } finally { setGenerating(null) }
  }

  const handleExecute = (signal: Signal) => {
    router.push(`/mobile/chart?symbol=${signal.pair}&side=${signal.action}`)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000000', direction: 'rtl', paddingBottom: 100 }}>
      
      {/* ── Header ── */}
      <div style={{
        padding: '24px 20px 16px',
        background: 'rgba(28, 28, 30, 0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.1)',
        position: 'sticky', top: 0, zIndex: 50
      }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.07)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ArrowRight size={18} color="#FFFFFF" />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>
              إشارات التداول
            </h1>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif" }}>
              توصيات ذكاء اصطناعي حية
            </p>
          </div>
          <button onClick={() => fetchSignals()} style={{ marginRight: 'auto', background: 'none', border: 'none' }}>
            <RefreshCw size={18} color="#00D4FF" className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Quick Generate Grid ── */}
      <div style={{ padding: '24px 20px 12px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)', fontFamily: "'Cairo', sans-serif", marginBottom: 12 }}>
          توليد إشارة فورية
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {QUICK_PAIRS.map(pair => (
            <motion.button
              key={pair.symbol}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleGenerate(pair.symbol)}
              disabled={generating !== null}
              style={{
                padding: '16px', borderRadius: 20,
                background: 'rgba(28,28,30,0.6)',
                backdropFilter: 'blur(12px)',
                border: generating === pair.symbol ? `1.5px solid ${pair.color}` : '0.5px solid rgba(255,255,255,0.08)',
                textAlign: 'right', position: 'relative', overflow: 'hidden'
              }}
            >
              {generating === pair.symbol && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                  <Loader2 size={20} className="animate-spin" color={pair.color} />
                </div>
              )}
              <div style={{ fontSize: 18, marginBottom: 4 }}>{pair.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>{pair.symbol}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif" }}>{pair.name}</div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* ── Active Signals List ── */}
      <div style={{ padding: '12px 20px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)', fontFamily: "'Cairo', sans-serif", marginBottom: 12 }}>
          الإشارات النشطة
        </h2>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Loader2 size={32} className="animate-spin" color="#00D4FF" style={{ margin: '0 auto' }} />
          </div>
        ) : signals.length === 0 ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            background: 'rgba(255,255,255,0.02)', borderRadius: 24, border: '1px dashed rgba(255,255,255,0.1)'
          }}>
            <Zap size={32} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif" }}>
              لا توجد إشارات نشطة حالياً. ابدأ بتوليد إشارة أعلاه.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AnimatePresence>
              {signals.map((signal, i) => {
                const config = getSignalConfig(signal.action)
                const Icon = config.icon
                return (
                  <motion.div
                    key={signal.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    style={{
                      background: 'rgba(28,28,30,0.7)',
                      backdropFilter: 'blur(20px)',
                      borderRadius: 24,
                      border: '0.5px solid rgba(255,255,255,0.1)',
                      padding: '20px',
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div style={{
                          width: 40, height: 40, borderRadius: 12,
                          background: `${config.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <Icon size={20} color={config.color} />
                        </div>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>{signal.pair}</div>
                          <div style={{ fontSize: 11, color: config.color, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{config.label} • ثقة {signal.confidence}%</div>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleExecute(signal)}
                        style={{
                          padding: '8px 16px', borderRadius: 12,
                          background: config.color, color: '#000', border: 'none',
                          fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif"
                        }}
                      >
                        تنفيذ
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>دخول</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{signal.entryPrice || '—'}</div>
                      </div>
                      <div style={{ background: 'rgba(255,69,58,0.05)', padding: '10px', borderRadius: 12, border: '0.5px solid rgba(255,69,58,0.1)' }}>
                        <div style={{ fontSize: 9, color: '#FF453A', opacity: 0.6, marginBottom: 2 }}>وقف</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>{signal.stopLoss || '—'}</div>
                      </div>
                      <div style={{ background: 'rgba(50,215,75,0.05)', padding: '10px', borderRadius: 12, border: '0.5px solid rgba(50,215,75,0.1)' }}>
                        <div style={{ fontSize: 9, color: '#32D74B', opacity: 0.6, marginBottom: 2 }}>هدف</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#32D74B', fontFamily: "'JetBrains Mono', monospace" }}>{signal.takeProfit || '—'}</div>
                      </div>
                    </div>

                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
                      {signal.reason}
                    </p>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Warning Footer ── */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          padding: '16px', borderRadius: 20,
          background: 'rgba(255,184,0,0.05)', border: '0.5px solid rgba(255,184,0,0.1)',
          display: 'flex', gap: 12
        }}>
          <AlertTriangle size={16} color="#FFB800" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 11, color: 'rgba(255,184,0,0.6)', fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>
            هذه الإشارات تعليمية فقط وليست نصيحة استثمارية. تداول بمسؤولية.
          </p>
        </div>
      </div>
    </div>
  )
}
