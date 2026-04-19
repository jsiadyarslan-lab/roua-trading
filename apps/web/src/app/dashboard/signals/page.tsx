'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Loader2,
  AlertTriangle,
  XCircle,
  BarChart3,
  Shield,
  Activity,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'

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
  { symbol: 'BTC/USDT', name: 'بيتكوين', icon: '₿', color: '#FFB800' },
  { symbol: 'ETH/USDT', name: 'إيثريوم', icon: 'Ξ', color: '#A259FF' },
  { symbol: 'SOL/USDT', name: 'سولانا', icon: '◎', color: '#0A84FF' },
  { symbol: 'AAPL', name: 'آبل', icon: '', color: '#00FFC6' },
  { symbol: 'TSLA', name: 'تسلا', icon: '', color: '#FF4D4D' },
  { symbol: 'GOLD', name: 'الذهب', icon: '', color: '#FFB800' },
]

function SignalCard({ signal, onRefresh, onCancel }: { signal: Signal; onRefresh: (pair: string) => void; onCancel: (id: string) => void }) {
  const config = signal.action === 'BUY'
    ? { label: 'شراء', Icon: TrendingUp, color: 'var(--profit)', bgColor: 'var(--profit-bg)', borderColor: 'var(--border-profit)' }
    : signal.action === 'SELL'
    ? { label: 'بيع', Icon: TrendingDown, color: 'var(--loss)', bgColor: 'var(--loss-bg)', borderColor: 'var(--border-loss)' }
    : { label: 'انتظار', Icon: Minus, color: 'var(--warning)', bgColor: 'var(--warning-bg)', borderColor: 'var(--border-warning)' }

  const { Icon } = config
  const formatPrice = (p: number | null) => p ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(p) : '—'
  const timeLeft = () => {
    const diff = new Date(signal.expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'منتهية'
    return `${Math.floor(diff / 3600000)}س ${Math.floor((diff % 3600000) / 60000)}د`
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} style={{ background: 'var(--bg-card)', border: `1px solid ${config.borderColor}`, borderRightWidth: '3px', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: config.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={16} style={{ color: config.color }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{signal.pair}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: config.bgColor, border: `1px solid ${config.borderColor}`, color: config.color }}>{config.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                <span>الثقة: <span style={{ color: signal.confidence >= 70 ? 'var(--profit)' : signal.confidence >= 40 ? 'var(--warning)' : 'var(--loss)', fontWeight: 700 }}>{signal.confidence}%</span></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Clock size={10} />{timeLeft()}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>سعر الدخول</span>
              <div style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{formatPrice(signal.entryPrice)}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--loss-bg)', border: '1px solid var(--border-loss)' }}>
              <span style={{ fontSize: '9px', color: 'var(--loss)' }}>وقف الخسارة</span>
              <div style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--loss)' }} dir="ltr">{formatPrice(signal.stopLoss)}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--profit-bg)', border: '1px solid var(--border-profit)' }}>
              <span style={{ fontSize: '9px', color: 'var(--profit)' }}>جني الأرباح</span>
              <div style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--profit)' }} dir="ltr">{formatPrice(signal.takeProfit)}</div>
            </div>
          </div>

          <div style={{ padding: '10px 12px', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ar)', lineHeight: '1.6' }}>
            {signal.reason}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginRight: '12px' }}>
          <button onClick={() => onRefresh(signal.pair)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'var(--font-ar)', cursor: 'pointer' }}>
            <RefreshCw size={10} /> تجديد
          </button>
          <button disabled title="قريباً" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--purple-border)', background: 'var(--purple-bg)', color: 'var(--purple)', fontSize: '10px', fontFamily: 'var(--font-ar)', cursor: 'not-allowed', opacity: 0.6 }}>
            <BarChart3 size={10} /> تنفيذ
          </button>
          <button onClick={() => onCancel(signal.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', border: '1px solid transparent', background: 'none', color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'var(--font-ar)', cursor: 'pointer' }}>
            <XCircle size={10} /> إلغاء
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default function SignalsPage() {
  const { loading: authLoading } = useAuth()
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
      if (!res.ok || !data.success) throw new Error(data.error || data.message || 'فشل في توليد الإشارة')
      await fetchSignals()
    } catch (err: any) { setError(err.message) } finally { setGenerating(null) }
  }

  const handleCancel = async (id: string) => {
    try {
      await fetch(`/api/signals/${id}`, { method: 'DELETE' })
      setSignals(prev => prev.filter(s => s.id !== id))
    } catch { /* silent */ }
  }

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <SubPageLayout
      title="إشارات رؤى"
      icon={<Zap size={15} color="#fff" />}
      iconBg="linear-gradient(135deg, #A259FF, #FF6B9D)"
      actions={
        <button onClick={() => fetchSignals()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ar)', cursor: 'pointer' }}>
          <RefreshCw size={12} /> تحديث
        </button>
      }
    >
      {/* Quick Generate */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Zap size={14} style={{ color: 'var(--purple)' }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>توليد إشارة سريعة</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
          {QUICK_PAIRS.map(pair => (
            <button
              key={pair.symbol}
              onClick={() => handleGenerate(pair.symbol)}
              disabled={generating !== null}
              style={{
                padding: '14px 8px', borderRadius: '10px', border: generating === pair.symbol ? `1px solid ${pair.color}40` : '1px solid var(--border)',
                background: generating === pair.symbol ? `${pair.color}14` : 'var(--bg-input)',
                cursor: generating !== null ? 'not-allowed' : 'pointer', textAlign: 'center',
                transition: 'all 0.15s', opacity: generating !== null && generating !== pair.symbol ? 0.5 : 1,
              }}
            >
              {generating === pair.symbol ? (
                <Loader2 size={20} className="animate-spin" style={{ color: pair.color, margin: '0 auto' }} />
              ) : (
                <>
                  {pair.icon && <span style={{ display: 'block', fontSize: '18px', marginBottom: '4px' }}>{pair.icon}</span>}
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{pair.symbol}</span>
                  <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', marginTop: '2px' }}>{pair.name}</span>
                </>
              )}
            </button>
          ))}
        </div>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'var(--loss-bg)', border: '1px solid var(--border-loss)', marginTop: '10px' }}>
            <AlertTriangle size={13} style={{ color: 'var(--loss)' }} />
            <span style={{ fontSize: '11px', color: 'var(--loss)', fontFamily: 'var(--font-ar)' }}>{error}</span>
          </div>
        )}
      </div>

      {/* Active Signals */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: 'var(--accent)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>جارٍ التحميل...</p>
        </div>
      ) : signals.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '48px', textAlign: 'center' }}>
          <Zap size={36} style={{ color: 'var(--text-faint)', margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>لا توجد إشارات نشطة</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', marginTop: '4px' }}>اضغط على أي زوج أعلاه لتوليد إشارة تداول ذكية</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>الإشارات النشطة</span>
            <span style={{ fontSize: '9px', fontWeight: 700, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', padding: '1px 7px', borderRadius: '10px' }}>{signals.length}</span>
          </div>
          <AnimatePresence>
            {signals.map(signal => (
              <SignalCard key={signal.id} signal={signal} onRefresh={handleGenerate} onCancel={handleCancel} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px 16px', borderRadius: '8px', background: 'var(--warning-bg)', border: '1px solid var(--border-warning)', marginTop: '16px' }}>
        <AlertTriangle size={13} style={{ color: 'var(--warning)', marginTop: '1px', flexShrink: 0 }} />
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', lineHeight: '1.5' }}>إشارات رؤى لأغراض تعليمية فقط وليست نصيحة استثمارية. تداول بمسؤولية.</span>
      </div>
    </SubPageLayout>
  )
}
