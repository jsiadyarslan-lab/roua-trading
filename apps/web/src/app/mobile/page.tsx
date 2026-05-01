'use client'

import { motion } from 'framer-motion'
import { useEffect, useState, useCallback } from 'react'
import { useBotStore } from '@/hooks/useBotStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import {
  Brain, Bot, ScanSearch, ChevronRight, TrendingUp, TrendingDown,
  Bell, Activity, Plus, ShieldCheck, Link2, ChevronLeft, Zap, Loader2, Target,
  RefreshCw, Eye, EyeOff, Wallet
} from 'lucide-react'
import { useRouter } from 'next/navigation'

/* ─── helpers ─────────────────────────────── */
const fmt2 = (n: number) => Math.abs(n).toFixed(2)
const pct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`

// ── Defensive helpers: prevent React Error #31 when API returns objects instead of primitives ──
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

/* ─── Live News Ticker ─────────────────────── */
function NewsTicker() {
  const [news, setNews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchNews() {
      try {
        const res = await fetch('/api/news/latest?limit=5')
        if (res.ok) {
          const data = await res.json()
          if (data.success) setNews(data.data)
        }
      } catch { /* silent */ } finally { setLoading(false) }
    }
    fetchNews()
    const interval = setInterval(fetchNews, 600000) // 10 min
    return () => clearInterval(interval)
  }, [])

  if (loading || news.length === 0) return (
    <div style={{ height: 32, marginTop: 4, marginBottom: 12, padding: '0 20px' }}>
      <div style={{ height: '100%', borderRadius: 16, background: 'rgba(255,255,255,0.03)', animate: 'pulse' }} />
    </div>
  )

  return (
    <div style={{
      overflow: 'hidden', height: 32, display: 'flex', alignItems: 'center',
      marginTop: 4, marginBottom: 12, padding: '0 20px'
    }}>
      <div style={{
        padding: '4px 12px', borderRadius: 16,
        background: 'rgba(255,255,255,0.03)',
        border: '0.5px solid rgba(255,255,255,0.05)',
        display: 'flex', width: '100%', overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex', gap: 32, animation: 'marquee 40s linear infinite',
          whiteSpace: 'nowrap', direction: 'ltr', width: 'max-content'
        }}>
          {[...news, ...news].map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <div style={{ 
                width: 4, height: 4, borderRadius: '50%', 
                background: it.sentiment > 0 ? '#32D74B' : it.sentiment < 0 ? '#FF453A' : '#00D4FF' 
              }} />
              <span style={{ fontSize: 10, color: 'rgba(235,235,245,0.6)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>
                {it.translatedTitle || it.title}
              </span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}

/* ─── Currency Ticker (Dynamic) ───────────── */
function CurrencyTicker() {
  const quotes = useMarketStore(s => s.quotes)
  const router = useRouter()
  const displayPairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'GOLD', 'EUR/USD', 'GBP/USD']
  
  return (
    <div style={{
      overflow: 'hidden', height: 36, display: 'flex', alignItems: 'center',
      background: 'rgba(0,212,255,0.03)',
      borderTop: '0.5px solid rgba(0,212,255,0.1)',
      borderBottom: '0.5px solid rgba(0,212,255,0.1)',
      marginBottom: 8,
      position: 'relative'
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 2,
        background: 'linear-gradient(90deg, #000 0%, transparent 100%)',
        paddingLeft: 20, display: 'flex', alignItems: 'center', width: 100
      }}>
         <div style={{ 
           fontSize: 10, fontWeight: 900, color: '#00D4FF', 
           background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: 4,
           border: '1px solid rgba(0,212,255,0.2)', letterSpacing: 1
         }}>LIVE</div>
      </div>
      
      <div style={{
        display: 'flex', gap: 40, animation: 'tickerScroll 25s linear infinite',
        whiteSpace: 'nowrap', direction: 'ltr', width: 'max-content', paddingLeft: 120
      }}>
        {[...displayPairs, ...displayPairs].map((pair, i) => {
          const quoteKey = Object.keys(quotes).find(k => k.replace('/', '') === pair.replace('/', ''))
          const q = quoteKey ? quotes[quoteKey] : null
          const price = q ? q.price : 0
          const change = q ? q.changePercent : 0
          const pos = change >= 0
          
          return (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", opacity: 0.9 }}>
                {pair}
              </span>
              <span style={{ 
                fontSize: 12, fontWeight: 800, color: pos ? '#32D74B' : '#FF453A',
                fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums'
              }}>
                {price ? price.toLocaleString('en', { minimumFractionDigits: price < 10 ? 4 : 2 }) : '—'}
              </span>
              <span style={{ 
                fontSize: 10, fontWeight: 700, color: pos ? '#32D74B' : '#FF453A',
                opacity: 0.8, fontFamily: "'JetBrains Mono', monospace"
              }}>
                {pos ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}

/* ─── iOS Card ─────────────────────────── */
function IOSCard({ children, onClick, highlight = false, noMargin = false }: { children: React.ReactNode, onClick?: () => void, highlight?: boolean, noMargin?: boolean }) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.98, y: 2 } : undefined}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={onClick}
      style={{
        background: highlight 
          ? 'linear-gradient(165deg, rgba(35,35,45,0.9) 0%, rgba(20,20,25,0.9) 100%)' 
          : 'rgba(28,28,30,0.65)',
        backdropFilter: 'blur(40px) saturate(190%)',
        WebkitBackdropFilter: 'blur(40px) saturate(190%)',
        borderRadius: 28,
        padding: '16px',
        margin: noMargin ? 0 : '0 20px 16px',
        cursor: onClick ? 'pointer' : 'default',
        border: '0.5px solid rgba(255,255,255,0.1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: highlight 
          ? '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)' 
          : '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
      }}
    >
      {highlight && (
        <div style={{ 
          position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, 
          background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)',
          zIndex: 10
        }} />
      )}
      {children}
    </motion.div>
  )
}

/* ─── Real-time Latest Signal Card ─── */
function LatestSignalCard() {
  const [signal, setSignal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function fetchSignal() {
      try {
        const res = await fetch('/api/signals/active')
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data.length > 0) {
            const raw = data.data[0]
            // Sanitize to prevent React Error #31 — API may return SmartScore objects
            setSignal({
              ...raw,
              confidence: safeConfidence(raw.confidence),
              reason: safeReason(raw.reason),
              action: safeAction(raw.action),
              takeProfit: safeNumber(raw.takeProfit),
              entryPrice: safeNumber(raw.entryPrice),
              stopLoss: safeNumber(raw.stopLoss),
            })
          }
        }
      } catch { /* silent */ } finally { setLoading(false) }
    }
    fetchSignal()
  }, [])

  if (loading) return (
    <IOSCard>
       <div className="flex items-center justify-center py-6">
         <Loader2 size={24} className="animate-spin" color="rgba(255,255,255,0.2)" />
       </div>
    </IOSCard>
  )

  if (!signal) return (
    <IOSCard onClick={() => router.push('/mobile/signals')}>
      <div className="flex flex-col items-center py-2 text-center">
        <Zap size={24} color="rgba(255,255,255,0.1)" className="mb-2" />
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif" }}>لا توجد إشارات نشطة حالياً</p>
      </div>
    </IOSCard>
  )

  const isBuy = safeAction(signal.action) === 'BUY'
  const color = isBuy ? '#32D74B' : '#FF453A'

  return (
    <IOSCard onClick={() => router.push('/mobile/signals')} highlight>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div style={{ 
            padding: '4px 10px', borderRadius: 20, 
            background: `${color}15`, 
            color: color, fontSize: 10, fontWeight: 800,
            border: `0.5px solid ${color}30`
          }}>إشارة {isBuy ? 'شراء' : 'بيع'} حية</div>
          <span style={{ fontSize: 11, color: 'rgba(235,235,245,0.3)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>منذ دقائق</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#32D74B', boxShadow: '0 0 10px #32D74B' }} className="animate-pulse" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div style={{ 
            width: 48, height: 48, borderRadius: 16, 
            background: 'rgba(255,255,255,0.03)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: 22, border: '0.5px solid rgba(255,255,255,0.08)' 
          }}>{signal.pair.startsWith('BTC') ? '₿' : signal.pair.startsWith('ETH') ? 'Ξ' : 'S'}</div>
          <div>
            <p style={{ fontSize: 17, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>{signal.pair}</p>
            <p style={{ fontSize: 13, color: color, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>ثقة {signal.confidence}%</p>
          </div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>🎯 {signal.takeProfit || '—'}</p>
          <p style={{ fontSize: 11, color: 'rgba(235,235,245,0.3)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>الهدف</p>
        </div>
      </div>
    </IOSCard>
  )
}

/* ─── Main Page ─────────────────────────── */
export default function MobileHomePage() {
  const router = useRouter()
  const { isOn, setIsOn, stats, syncFromDB, settings } = useBotStore()
  const { trades } = usePaperTradesStore()
  const account = usePositionsStore(s => s.account)
  const [consensus, setConsensus] = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Real portfolio data from API / store
  const totalAssets = Number(account?.equity) || Number(account?.buyingPower) || 0
  const dailyChange = Number(account?.dailyChange) || 0

  useEffect(() => {
    async function fetchConsensus() {
      try {
        const res = await fetch('/api/ai/consensus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: 'BTC/USD' })
        })
        if (res.ok) {
          const data = await res.json()
          if (data.success) setConsensus(data.data)
        }
      } catch { /* silent */ }
    }
    fetchConsensus()
  }, [])

  const openPositions = trades.filter(t => t.status === 'open' || t.status === 'active')

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([
      syncFromDB(),
      fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'BTC/USD' })
      }).then(r => r.json()).then(d => { if (d.success) setConsensus(d.data) }).catch(() => {}),
    ])
    setRefreshing(false)
  }, [syncFromDB])

  // Sync settings on mount
  useEffect(() => {
    syncFromDB()
  }, [syncFromDB])

  return (
    <div style={{ 
      minHeight: '100dvh', 
      background: '#000000', 
      direction: 'rtl', 
      paddingBottom: 20,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* ── Ambient Sentiment Glow ── */}
      <motion.div 
        animate={{ 
          opacity: consensus ? 0.15 : 0,
          background: consensus?.recommendation === 'BUY' 
            ? 'radial-gradient(circle at 50% -20%, #32D74B, transparent 70%)'
            : consensus?.recommendation === 'SELL'
            ? 'radial-gradient(circle at 50% -20%, #FF453A, transparent 70%)'
            : 'radial-gradient(circle at 50% -20%, #00D4FF, transparent 70%)'
        }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 400, pointerEvents: 'none', zIndex: 0 }}
      />

      {/* ── Header ── */}
      <div style={{ 
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 12px', 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', zIndex: 1
      }}>
        <div className="flex items-center gap-4">
          <div style={{
            width: 48, height: 48, borderRadius: 16,
            background: 'linear-gradient(135deg, #00D4FF 0%, #7DD3FC 50%, #BAE6FD 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 900, color: '#000',
            boxShadow: '0 8px 24px rgba(0, 212, 255, 0.35), inset 0 2px 2px rgba(255,255,255,0.4)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>ر</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", letterSpacing: -0.5 }}>
              رؤى للتداول
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ShieldCheck size={13} color="#00D4FF" />
              <span style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>منصة ربط آمنة</span>
            </div>
          </div>
        </div>
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={() => router.push('/mobile/notifications')}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '0.5px solid rgba(255,255,255,0.08)', position: 'relative'
          }}
        >
          <Bell size={22} color="#FFFFFF" />
          <div style={{ position: 'absolute', top: 11, right: 11, width: 9, height: 9, borderRadius: '50%', background: '#FF453A', border: '2.5px solid #1C1C1E' }} />
        </motion.button>
      </div>

      <NewsTicker />
      <CurrencyTicker />

      {/* ── Portfolio Hero Card ── */}
      <IOSCard onClick={() => router.push('/mobile/portfolio')} highlight>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ fontSize: 11, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 600, marginBottom: 2 }}>
              إجمالي الرصيد
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", letterSpacing: -1 }}>
                {totalAssets > 0 ? `$${totalAssets.toLocaleString('en', { minimumFractionDigits: 2 })}` : '—'}
              </span>
              {dailyChange !== 0 && (
                <span style={{ fontSize: 11, color: dailyChange >= 0 ? '#32D74B' : '#FF453A', fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>
                  {pct(dailyChange)}
                </span>
              )}
            </div>
          </div>
          <button style={{
            padding: '8px 14px', borderRadius: 14,
            background: 'rgba(0,212,255,0.1)', color: '#00D4FF', border: '0.5px solid rgba(0,212,255,0.2)',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
          }}>
            <Link2 size={14} strokeWidth={3} />
            إربط حسابك
          </button>
        </div>

        {/* Ultra-compact stats */}
        <div className="flex gap-4 mt-4 pt-3" style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 10, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif" }}>الربح:</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace" }}>+${fmt2(stats.profit)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 10, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif" }}>الفوز:</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>{stats.winRate}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 10, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif" }}>صفقات:</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>{openPositions.length}</span>
          </div>
        </div>
      </IOSCard>
      
      {/* ── Latest Signals ── */}
      <div className="flex items-center justify-between px-6 mb-4 mt-6">
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>
          إشارات السوق
        </h2>
        <button 
          onClick={() => router.push('/mobile/signals')}
          style={{ fontSize: 13, color: '#00D4FF', fontWeight: 800, fontFamily: "'Cairo', sans-serif", background: 'none', border: 'none' }}
        >
          شاهد الكل
        </button>
      </div>
      <LatestSignalCard />

      {/* ── AI Council Card ── */}
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", margin: '24px 24px 12px' }}>
        تحليلات الذكاء الاصطناعي
      </h2>
      <IOSCard onClick={() => router.push('/mobile/ai')}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4 relative">
            <motion.div
              animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.1, 1] }}
              transition={{ duration: 4, repeat: Infinity }}
              style={{
                position: 'absolute', top: -5, left: -5, right: -5, bottom: -5,
                background: 'linear-gradient(135deg, #7C3AED, #00D4FF)',
                borderRadius: 20, filter: 'blur(10px)', zIndex: 0
              }}
            />
            <div style={{
              width: 48, height: 48, borderRadius: 16,
              background: 'linear-gradient(135deg, #7C3AED, #5B21B6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', zIndex: 1, border: '0.5px solid rgba(255,255,255,0.1)'
            }}>
              <Brain size={24} color="#FFFFFF" />
              {!consensus && (
                <motion.div
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ position: 'absolute', inset: 0, borderRadius: 16, border: '2px solid #A78BFA' }}
                />
              )}
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>مجلس الخبراء</p>
              <p style={{ fontSize: 11, color: '#A78BFA', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginTop: 1 }}>
                {consensus ? `${consensus.meta.modelsResponded} نماذج نشطة` : '6 نماذج تفحص السوق'}
              </p>
            </div>
          </div>
          <ChevronLeft size={20} color="rgba(235,235,245,0.3)" />
        </div>
        
        <div style={{
          padding: '14px', borderRadius: 20,
          background: 'rgba(0,212,255,0.05)', border: '0.5px solid rgba(0,212,255,0.1)',
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00D4FF', boxShadow: '0 0 10px #00D4FF' }} className="animate-pulse" />
              <span style={{ fontSize: 13, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>BTC/USD</span>
            </div>
            <span style={{ fontSize: 13, color: '#00D4FF', fontFamily: "'Cairo', sans-serif", fontWeight: 800 }}>
              {consensus ? `إجماع ${consensus.recommendation === 'BUY' ? 'شراء' : consensus.recommendation === 'SELL' ? 'بيع' : 'انتظار'} (${consensus.consensusScore}%)` : 'جاري التحليل...'}
            </span>
          </div>
        </div>
      </IOSCard>

      {/* ── Bot & Scanner Grid ── */}
      <div className="grid grid-cols-2 gap-4 px-5 mb-8">
        {/* Bot Card */}
        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => router.push('/mobile/bot')}
          style={{ background: '#1C1C1E', borderRadius: 28, padding: 20, position: 'relative', overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.06)' }}
        >
          {isOn && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#00D4FF', boxShadow: '0 0 15px #00D4FF' }} />}
          <div className="flex items-center justify-between mb-4">
            <div style={{ width: 40, height: 40, borderRadius: 12, background: isOn ? 'rgba(0,212,255,0.1)' : 'rgba(235,235,245,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={22} color={isOn ? '#00D4FF' : 'rgba(235,235,245,0.3)'} />
            </div>
            <div onClick={(e) => { e.stopPropagation(); setIsOn(!isOn) }} style={{ width: 46, height: 26, borderRadius: 13, background: isOn ? '#32D74B' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', transition: '0.3s' }}>
              <motion.div animate={{ x: isOn ? 22 : 2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>البوت الآلي</p>
          <p style={{ fontSize: 11, color: isOn ? '#32D74B' : 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginTop: 2 }}>{isOn ? 'نشط الآن' : 'متوقف'}</p>
        </motion.div>

        {/* Scanner Card */}
        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => router.push('/mobile/scanner')}
          style={{ background: '#1C1C1E', borderRadius: 28, padding: 20, border: '0.5px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ScanSearch size={22} color="#FFFFFF" />
            </div>
            <div style={{ padding: '4px 10px', borderRadius: 12, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D4FF' }} />
              <span style={{ fontSize: 10, color: '#00D4FF', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>Live</span>
            </div>
          </div>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>سكانر السوق</p>
          <p style={{ fontSize: 11, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginTop: 2 }}>فحص مباشر</p>
        </motion.div>
      </div>

    </div>
  )
}
