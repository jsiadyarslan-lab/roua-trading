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
  Loader2,
  AlertTriangle,
  XCircle,
  Shield,
  Activity,
  Sparkles,
  Timer,
  Crosshair,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'

// ── Defensive helpers: ensure primitive types for React rendering ──
// Prevents React Error #31 when API returns objects (e.g., SmartScore) instead of primitives
function safeConfidence(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (val && typeof val === 'object' && 'compositeScore' in (val as any)) return (val as any).compositeScore ?? (val as any).confidence ?? 0
  const n = Number(val)
  return Number.isFinite(n) ? n : 0
}

function safeReason(val: unknown): string {
  if (typeof val === 'string') return val
  if (val && typeof val === 'object') {
    try { return JSON.stringify(val) } catch { return '' }
  }
  return val != null ? String(val) : ''
}

function safeNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null
  if (val && typeof val === 'object') return null
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

function safeAction(val: unknown): 'BUY' | 'SELL' | 'WAIT' {
  if (val === 'BUY' || val === 'SELL' || val === 'WAIT') return val
  if (val && typeof val === 'object' && 'action' in (val as any)) {
    const inner = (val as any).action
    if (inner === 'STRONG_BUY' || inner === 'BUY') return 'BUY'
    if (inner === 'STRONG_SELL' || inner === 'SELL') return 'SELL'
  }
  return 'WAIT'
}

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
  { symbol: 'BTC/USDT', name: 'بيتكوين', icon: '₿', color: '#FFB800', gradient: 'linear-gradient(135deg, #FFB800, #FF8C00)' },
  { symbol: 'ETH/USDT', name: 'إيثريوم', icon: 'Ξ', color: '#A259FF', gradient: 'linear-gradient(135deg, #A259FF, #7C3AED)' },
  { symbol: 'SOL/USDT', name: 'سولانا', icon: '◎', color: '#0A84FF', gradient: 'linear-gradient(135deg, #0A84FF, #6366F1)' },
  { symbol: 'AAPL', name: 'آبل', icon: '', color: '#00FFC6', gradient: 'linear-gradient(135deg, #00FFC6, #10B981)' },
  { symbol: 'TSLA', name: 'تسلا', icon: '', color: '#FF4D4D', gradient: 'linear-gradient(135deg, #FF4D4D, #EF4444)' },
  // FIX: Changed 'GOLD' → 'XAU/USD' — backend cannot resolve 'GOLD' as a symbol.
  // Exchange adapters require BASE/QUOTE format. 'GOLD' returned zero-price data.
  { symbol: 'XAU/USD', name: 'الذهب', icon: '', color: '#FFB800', gradient: 'linear-gradient(135deg, #FFB800, #F59E0B)' },
]

// ── Signal type config ──
function getSignalConfig(action: 'BUY' | 'SELL' | 'WAIT') {
  if (action === 'BUY') return {
    label: 'شراء',
    Icon: TrendingUp,
    color: 'var(--profit)',
    bgColor: 'var(--profit-bg)',
    borderColor: 'var(--border-profit)',
    gradient: 'linear-gradient(135deg, #00FFC6, #10B981)',
    glowColor: 'rgba(0, 255, 198, 0.15)',
  }
  if (action === 'SELL') return {
    label: 'بيع',
    Icon: TrendingDown,
    color: 'var(--loss)',
    bgColor: 'var(--loss-bg)',
    borderColor: 'var(--border-loss)',
    gradient: 'linear-gradient(135deg, #FF4D4D, #EF4444)',
    glowColor: 'rgba(255, 77, 77, 0.15)',
  }
  return {
    label: 'انتظار',
    Icon: Minus,
    color: 'var(--warning)',
    bgColor: 'var(--warning-bg)',
    borderColor: 'var(--border-warning)',
    gradient: 'linear-gradient(135deg, #FFB800, #F59E0B)',
    glowColor: 'rgba(255, 184, 0, 0.15)',
  }
}

// ── Signal Card Component ──
function SignalCard({ signal, index, onRefresh, onCancel, onExecute }: { signal: Signal; index: number; onRefresh: (pair: string) => void; onCancel: (id: string) => void; onExecute: (signal: Signal) => void }) {
  const config = getSignalConfig(signal.action)
  const { Icon } = config

  const formatPrice = (p: number | null) =>
    p ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(p) : '—'

  const timeLeft = () => {
    const diff = new Date(signal.expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'منتهية'
    return `${Math.floor(diff / 3600000)}س ${Math.floor((diff % 3600000) / 60000)}د`
  }

  const isExpired = new Date(signal.expiresAt).getTime() <= Date.now()

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${config.borderColor}`,
        borderInlineEndWidth: '3px',
        borderInlineEndColor: config.color,
        borderRadius: '10px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Subtle glow accent */}
      <div style={{
        position: 'absolute', top: '-20px', right: '-20px',
        width: '80px', height: '80px',
        background: config.color,
        filter: 'blur(40px)',
        opacity: 0.12,
        pointerEvents: 'none',
      }} />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, paddingInlineEnd: '8px' }}>
          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              background: config.gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon size={16} color="#fff" strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{signal.pair}</span>
                <span style={{
                  fontSize: '9px', fontWeight: 700,
                  padding: '2px 8px', borderRadius: '4px',
                  background: config.bgColor, border: `1px solid ${config.borderColor}`,
                  color: config.color,
                  fontFamily: 'var(--font-ar), Inter, sans-serif',
                }}>{config.label}</span>
                {isExpired && (
                  <span style={{
                    fontSize: '8px', fontWeight: 700,
                    padding: '1px 6px', borderRadius: '4px',
                    background: 'var(--loss-bg)', border: '1px solid var(--border-loss)',
                    color: 'var(--loss)',
                    fontFamily: 'var(--font-ar), Inter, sans-serif',
                  }}>منتهية</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', fontSize: '10px', color: 'var(--text-muted)' }}>
                <span style={{ fontFamily: 'var(--font-ar), Inter, sans-serif' }}>
                  الثقة:{' '}
                  <span style={{
                    color: signal.confidence >= 70 ? 'var(--profit)' : signal.confidence >= 40 ? 'var(--warning)' : 'var(--loss)',
                    fontWeight: 700,
                  }}>
                    {Math.round(signal.confidence)}%
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>
                  <Timer size={10} /> {timeLeft()}
                </span>
              </div>
            </div>
          </div>

          {/* Price Grid */}
          <div className="signal-price-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                <Crosshair size={8} style={{ color: 'var(--text-faint)' }} />
                <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>سعر الدخول</span>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{formatPrice(signal.entryPrice)}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--loss-bg)', border: '1px solid var(--border-loss)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                <Shield size={8} style={{ color: 'var(--loss)' }} />
                <span style={{ fontSize: '9px', color: 'var(--loss)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>وقف الخسارة</span>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--loss)' }} dir="ltr">{formatPrice(signal.stopLoss)}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--profit-bg)', border: '1px solid var(--border-profit)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                <TrendingUp size={8} style={{ color: 'var(--profit)' }} />
                <span style={{ fontSize: '9px', color: 'var(--profit)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>جني الأرباح</span>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--profit)' }} dir="ltr">{formatPrice(signal.takeProfit)}</div>
            </div>
          </div>

          {/* Reason */}
          <div style={{
            padding: '10px 12px', borderRadius: '6px',
            background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
            fontSize: '11px', color: 'var(--text-secondary)',
            fontFamily: 'var(--font-ar), Inter, sans-serif', lineHeight: '1.6',
          }}>
            {signal.reason}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: '6px', marginInlineStart: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
          <button
            onClick={() => onRefresh(signal.pair)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '5px 10px', borderRadius: '6px',
              minHeight: 36, minWidth: 60,
              border: '1px solid var(--border)', background: 'var(--bg-input)',
              color: 'var(--text-muted)', fontSize: '10px',
              fontFamily: 'var(--font-ar), Inter, sans-serif', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <RefreshCw size={10} /> تجديد
          </button>
          <button
            onClick={() => onExecute(signal)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '5px 10px', borderRadius: '6px',
              minHeight: 36, minWidth: 60,
              border: '1px solid var(--purple-border)',
              background: 'linear-gradient(135deg, var(--purple-bg), rgba(162, 89, 255, 0.08))',
              color: 'var(--purple)', fontSize: '10px',
              fontFamily: 'var(--font-ar), Inter, sans-serif',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.15s',
            }}
          >
            <Sparkles size={10} /> تنفيذ
          </button>
          <button
            onClick={() => onCancel(signal.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '5px 10px', borderRadius: '6px',
              minHeight: 36, minWidth: 60,
              border: '1px solid transparent', background: 'none',
              color: 'var(--text-muted)', fontSize: '10px',
              fontFamily: 'var(--font-ar), Inter, sans-serif', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <XCircle size={10} /> إلغاء
          </button>
        </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main Page ──
export default function SignalsPage() {
  const router = useRouter()
  const { loading: authLoading } = useAuth()
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [hoveredPair, setHoveredPair] = useState<string | null>(null)

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/signals/active')
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          // Sanitize signal data to prevent React Error #31
          const sanitized = data.data.map((s: any) => ({
            id: s.id || `sig-${Math.random().toString(36).slice(2, 8)}`,
            pair: s.pair || s.symbol || '—',
            action: safeAction(s.action),
            confidence: safeConfidence(s.confidence),
            reason: safeReason(s.reason),
            entryPrice: safeNumber(s.entryPrice),
            stopLoss: safeNumber(s.stopLoss),
            takeProfit: safeNumber(s.takeProfit),
            status: s.status || 'ACTIVE',
            expiresAt: s.expiresAt || new Date(Date.now() + 3600000).toISOString(),
            createdAt: s.createdAt || new Date().toISOString(),
          }))
          setSignals(sanitized)
        }
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
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)) } finally { setGenerating(null) }
  }

  const handleCancel = async (id: string) => {
    try {
      await fetch(`/api/signals/${id}`, { method: 'DELETE' })
      setSignals(prev => prev.filter(s => s.id !== id))
    } catch { /* silent */ }
  }

  const handleExecute = (signal: Signal) => {
    // Navigate to trading page with signal context via query params
    const params = new URLSearchParams({
      symbol: signal.pair,
      side: signal.action === 'BUY' ? 'BUY' : signal.action === 'SELL' ? 'SELL' : 'BUY',
    })
    if (signal.entryPrice) params.set('price', String(signal.entryPrice))
    router.push(`/dashboard/trading?${params.toString()}`)
  }

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--accent)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>جارٍ التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <SubPageLayout
      title="إشارات رؤى"
      icon={<Zap size={15} color="#fff" />}
      iconBg="linear-gradient(135deg, #A259FF, #FF6B9D)"
      actions={
        <button
          onClick={() => fetchSignals()}
          aria-label="تحديث الإشارات"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', borderRadius: '8px',
            border: '1px solid var(--accent-border)',
            background: 'var(--accent-bg)', color: 'var(--accent)',
            fontSize: '11px', fontWeight: 600,
            fontFamily: 'var(--font-ar), Inter, sans-serif', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <RefreshCw size={12} /> تحديث
        </button>
      }
    >
      <style>{`
        @media (max-width: 767px) {
          .signals-quick-pairs { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .signals-quick-pairs { grid-template-columns: repeat(2, 1fr) !important; }
          .signal-price-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* ── Quick Generate Section ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '16px', marginBottom: '16px',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Section glow */}
        <div style={{
          position: 'absolute', top: '-30px', left: '-30px',
          width: '100px', height: '100px',
          background: 'var(--purple)',
          filter: 'blur(50px)', opacity: 0.08,
          pointerEvents: 'none',
        }} />

        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '7px',
            background: 'linear-gradient(135deg, var(--purple), #FF6B9D)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={11} color="#fff" strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>توليد إشارة سريعة</span>
          <span style={{
            fontSize: '8px', fontWeight: 700,
            background: 'var(--purple-bg)', border: '1px solid var(--purple-border)',
            color: 'var(--purple)', padding: '1px 6px', borderRadius: '6px',
            fontFamily: 'var(--font-ar), Inter, sans-serif',
          }}>AI</span>
        </div>

        {/* Quick Pair Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }} className="signals-quick-pairs">
          {QUICK_PAIRS.map((pair, i) => {
            const isGenerating = generating === pair.symbol
            const isDisabled = generating !== null && !isGenerating
            const isHovered = hoveredPair === pair.symbol

            return (
              <motion.button
                key={pair.symbol}
                onClick={() => handleGenerate(pair.symbol)}
                disabled={generating !== null}
                onMouseEnter={() => setHoveredPair(pair.symbol)}
                onMouseLeave={() => setHoveredPair(null)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.2 }}
                style={{
                  padding: '14px 8px', borderRadius: '10px',
                  minHeight: 56,
                  border: isGenerating
                    ? `1px solid ${pair.color}50`
                    : isHovered
                      ? `1px solid ${pair.color}30`
                      : '1px solid var(--border)',
                  background: isGenerating
                    ? `${pair.color}14`
                    : isHovered
                      ? `linear-gradient(135deg, ${pair.color}08, ${pair.color}04)`
                      : 'var(--bg-input)',
                  cursor: generating !== null ? 'not-allowed' : 'pointer',
                  textAlign: 'center', transition: 'all 0.2s',
                  opacity: isDisabled ? 0.45 : 1,
                  position: 'relative', overflow: 'hidden',
                  boxShadow: isHovered && !isDisabled
                    ? `0 0 20px ${pair.color}15, inset 0 0 12px ${pair.color}08`
                    : 'none',
                }}
              >
                {/* Hover glow ring */}
                {isHovered && !isDisabled && (
                  <div style={{
                    position: 'absolute', inset: '-1px',
                    borderRadius: '10px',
                    background: `linear-gradient(135deg, ${pair.color}20, transparent)`,
                    pointerEvents: 'none',
                  }} />
                )}

                {isGenerating ? (
                  <Loader2 size={20} className="animate-spin" style={{ color: pair.color, margin: '0 auto' }} />
                ) : (
                  <>
                    {pair.icon && (
                      <span style={{ display: 'block', fontSize: '18px', marginBottom: '4px', position: 'relative' }}>{pair.icon}</span>
                    )}
                    <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)', position: 'relative' }} dir="ltr">{pair.symbol}</span>
                    <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif', marginTop: '2px', position: 'relative' }}>{pair.name}</span>
                  </>
                )}
              </motion.button>
            )
          })}
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'var(--loss-bg)', border: '1px solid var(--border-loss)', marginTop: '10px', overflow: 'hidden' }}
            >
              <AlertTriangle size={13} style={{ color: 'var(--loss)', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: 'var(--loss)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Active Signals Section ── */}
      {loading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '48px', textAlign: 'center',
          }}
        >
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--purple), #FF6B9D)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', opacity: 0.6,
          }}>
            <Loader2 size={20} className="animate-spin" color="#fff" />
          </div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>جارٍ تحميل الإشارات...</p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif', marginTop: '4px' }}>يتم جلب البيانات من المحلل الذكي</p>
        </motion.div>
      ) : signals.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '48px', textAlign: 'center',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Empty state glow */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '120px', height: '120px',
            background: 'linear-gradient(135deg, var(--purple), #FF6B9D)',
            filter: 'blur(60px)', opacity: 0.08,
            pointerEvents: 'none',
          }} />
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: 'linear-gradient(135deg, var(--purple), #FF6B9D)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', opacity: 0.25,
          }}>
            <Zap size={24} color="#fff" />
          </div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>لا توجد إشارات نشطة</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif', marginTop: '6px', lineHeight: '1.6' }}>
            اضغط على أي زوج أعلاه لتوليد إشارة تداول ذكية
          </p>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Section Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '7px',
              background: 'linear-gradient(135deg, #00FFC6, #10B981)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Activity size={11} color="#fff" strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>الإشارات النشطة</span>
            <span style={{
              fontSize: '9px', fontWeight: 700,
              background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
              color: 'var(--accent)', padding: '1px 7px', borderRadius: '10px',
              fontFamily: 'var(--font-mono)',
            }}>{signals.length}</span>
          </div>

          {/* Signal Cards */}
          <AnimatePresence mode="popLayout">
            {signals.map((signal, i) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                index={i}
                onRefresh={handleGenerate}
                onCancel={handleCancel}
                onExecute={handleExecute}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Disclaimer Section ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        padding: '12px 16px', borderRadius: '8px',
        background: 'var(--warning-bg)', border: '1px solid var(--border-warning)',
        marginTop: '16px',
      }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '6px',
          background: 'linear-gradient(135deg, #FFB800, #F59E0B)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: '0px',
        }}>
          <AlertTriangle size={10} color="#fff" strokeWidth={2.2} />
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif', lineHeight: '1.6' }}>
          إشارات رؤى لأغراض تعليمية فقط وليست نصيحة استثمارية. تداول بمسؤولية.
        </span>
      </div>
    </SubPageLayout>
  )
}
