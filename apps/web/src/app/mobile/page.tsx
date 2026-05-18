'use client'

import { motion } from 'framer-motion'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useBotStore } from '@/hooks/useBotStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import {
  Brain, Bot, ScanSearch, ChevronRight, TrendingUp, TrendingDown,
  Bell, Activity, Plus, ShieldCheck, Link2, ChevronLeft, Zap, Loader2, Target,
  RefreshCw, Eye, EyeOff, Wallet, Cpu, Globe2, BarChart3, ArrowUpRight,
  ArrowDownRight, Flame, History, X
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ScopedStyle } from '@/components/ScopedStyle'
import { closePositionUnified, isNestJsId } from '@/lib/api-fetch'

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

/* ─── Trading Mode Config ───────────────── */
const MODE_CONFIG: Record<TradingMode, { accent: string; labelAr: string; icon: string }> = {
  trader: { accent: '#00D4FF', labelAr: 'تاجر', icon: '⚡' },
  investor: { accent: '#32D74B', labelAr: 'مستثمر', icon: '📈' },
  ai: { accent: '#A78BFA', labelAr: 'ذكاء', icon: '🧠' },
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
      <div style={{ height: '100%', borderRadius: 16, background: 'rgba(255,255,255,0.03)' }} />
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
      <ScopedStyle>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</ScopedStyle>
    </div>
  )
}

/* ─── Currency Ticker (Dynamic) ───────────── */
function CurrencyTicker() {
  const quotes = useMarketStore(s => s.quotes)
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
        position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, zIndex: 2,
        background: 'linear-gradient(90deg, #000 0%, transparent 100%)',
        paddingInlineStart: 20, display: 'flex', alignItems: 'center', width: 100
      }}>
         <div style={{ 
           fontSize: 10, fontWeight: 900, color: '#00D4FF', 
           background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: 4,
           border: '1px solid rgba(0,212,255,0.2)', letterSpacing: 1
         }}>LIVE</div>
      </div>
      
      <div style={{
        display: 'flex', gap: 40, animation: 'tickerScroll 25s linear infinite',
        whiteSpace: 'nowrap', direction: 'ltr', width: 'max-content', paddingInlineStart: 120
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
      <ScopedStyle>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</ScopedStyle>
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

/* ─── Latest Smart Recommendations Widget ─── */
function LatestRecommendations() {
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        const res = await fetch('/api/signals/smart?limit=3')
        if (res.ok) {
          const data = await res.json()
          if (data.success && Array.isArray(data.data)) {
            setRecommendations(data.data)
          }
        }
      } catch { /* silent */ } finally { setLoading(false) }
    }
    fetchRecommendations()
    const interval = setInterval(fetchRecommendations, 120000) // 2 min refresh
    return () => clearInterval(interval)
  }, [])

  if (loading) return (
    <IOSCard>
       <div className="flex items-center justify-center py-6">
         <Loader2 size={24} className="animate-spin" color="rgba(255,255,255,0.2)" />
       </div>
    </IOSCard>
  )

  if (recommendations.length === 0) return (
    <IOSCard onClick={() => router.push('/mobile/signals')}>
      <div className="flex flex-col items-center py-2 text-center">
        <Brain size={24} color="rgba(255,255,255,0.1)" className="mb-2" />
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif" }}>لا توجد توصيات حالياً — جاري المسح...</p>
      </div>
    </IOSCard>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {recommendations.map((rec, idx) => {
        const isBuy = rec.type === 'BUY'
        const color = isBuy ? '#32D74B' : '#FF453A'
        const freshnessColor = rec.freshness === 'fresh' ? '#32D74B' : rec.freshness === 'stale' ? '#FFB800' : '#FF453A'

        return (
          <IOSCard key={rec.id || idx} onClick={() => router.push(`/mobile/chart?symbol=${rec.pair}`)} highlight={idx === 0}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div style={{ 
                  padding: '3px 8px', borderRadius: 16, 
                  background: `${color}15`, 
                  color: color, fontSize: 10, fontWeight: 800,
                  border: `0.5px solid ${color}30`
                }}>{isBuy ? 'شراء' : 'بيع'}</div>
                <div style={{ 
                  padding: '2px 6px', borderRadius: 10,
                  background: `${freshnessColor}10`, 
                  border: `0.5px solid ${freshnessColor}30`,
                  display: 'flex', alignItems: 'center', gap: 3
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: freshnessColor }} className={rec.freshness === 'fresh' ? 'animate-pulse' : ''} />
                  <span style={{ fontSize: 8, color: freshnessColor, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{rec.freshness === 'fresh' ? 'حية' : rec.freshness === 'stale' ? 'متأخرة' : 'متدهورة'}</span>
                </div>
              </div>
              <span style={{ fontSize: 10, color: 'rgba(235,235,245,0.3)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>{rec.timeframe} • {rec.time}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div style={{ 
                  width: 40, height: 40, borderRadius: 12, 
                  background: `${color}10`, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  fontSize: 16, border: `0.5px solid ${color}20`,
                  color: color, fontWeight: 900,
                  fontFamily: "'JetBrains Mono', monospace"
                }}>{rec.pair.split('/')[0].slice(0, 2)}</div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>{rec.pair}</p>
                  <p style={{ fontSize: 11, color: color, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>ثقة {Math.round(rec.conf || rec.confidence || 0)}%</p>
                </div>
              </div>
              <div style={{ textAlign: 'start' }}>
                <div className="flex items-center gap-3">
                  <div>
                    <p style={{ fontSize: 10, color: 'rgba(235,235,245,0.3)', fontFamily: "'Cairo', sans-serif" }}>هدف</p>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#32D74B', fontFamily: "'JetBrains Mono', monospace" }}>{rec.tp ? `$${rec.tp.toLocaleString()}` : '—'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: 'rgba(235,235,245,0.3)', fontFamily: "'Cairo', sans-serif" }}>وقف</p>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>{rec.sl ? `$${rec.sl.toLocaleString()}` : '—'}</p>
                  </div>
                </div>
              </div>
            </div>
            {rec.reason && (
              <p style={{ fontSize: 10, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", marginTop: 8, lineHeight: 1.5 }}>{rec.reason}</p>
            )}
          </IOSCard>
        )
      })}
    </div>
  )
}

/* ─── Mobile Watchlist Widget ────────────── */
function MobileWatchlist() {
  const quotes = useMarketStore(s => s.quotes)
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'Crypto' | 'Forex' | 'Stocks'>('Crypto')

  const SYMBOLS_BY_TAB = {
    Crypto: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'ADA/USD'],
    Forex:  ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'AUD/USD', 'USD/CHF'],
    Stocks: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META'],
  }

  const symbols = SYMBOLS_BY_TAB[activeTab]

  // Find hot mover (biggest absolute change)
  const hotMover = useMemo(() => {
    return symbols
      .map(sym => ({ sym, quote: quotes[sym] }))
      .filter(item => item.quote)
      .sort((a, b) => Math.abs((b.quote?.changePercent ?? 0)) - Math.abs((a.quote?.changePercent ?? 0)))[0]
  }, [quotes, symbols])

  return (
    <IOSCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #00D4FF, #5B21B6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <BarChart3 size={14} color="#FFFFFF" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>قائمة المراقبة</span>
        </div>
        <button
          onClick={() => router.push('/mobile/markets')}
          style={{ fontSize: 11, color: '#00D4FF', fontWeight: 800, fontFamily: "'Cairo', sans-serif", background: 'none', border: 'none' }}
        >
          المزيد
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 2 }}>
        {(['Crypto', 'Forex', 'Stocks'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 10,
              background: activeTab === tab ? 'rgba(0,212,255,0.12)' : 'transparent',
              border: 'none',
              color: activeTab === tab ? '#00D4FF' : 'rgba(235,235,245,0.4)',
              fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
              cursor: 'pointer', transition: '0.2s',
            }}
          >
            {tab === 'Crypto' ? 'كريبتو' : tab === 'Forex' ? 'فوركس' : 'أسهم'}
          </button>
        ))}
      </div>

      {/* Hot Mover */}
      {hotMover && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px', borderRadius: 12,
          background: 'rgba(255,183,0,0.05)', border: '0.5px solid rgba(255,183,0,0.12)',
          marginBottom: 10,
        }}>
          <div className="flex items-center gap-2">
            <Flame size={12} color="#FFB800" />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#FFB800', fontFamily: "'Cairo', sans-serif" }}>أكثر حركة</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 11, fontWeight: 900, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>{hotMover.sym}</span>
            <span style={{
              fontSize: 10, fontWeight: 800,
              color: (hotMover.quote?.changePercent ?? 0) >= 0 ? '#32D74B' : '#FF453A',
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {(hotMover.quote?.changePercent ?? 0) >= 0 ? '+' : ''}{(hotMover.quote?.changePercent ?? 0).toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {/* Pairs List */}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {symbols.map(sym => {
          const q = quotes[sym]
          const changePct = q?.changePercent ?? 0
          const price = q?.price ?? null
          const isUp = changePct >= 0
          const color = isUp ? '#32D74B' : '#FF453A'
          const isSelected = sym === selectedSymbol

          return (
            <motion.div
              key={sym}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setSelectedSymbol(sym)
                router.push(`/mobile/chart?symbol=${sym}`)
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 8px',
                borderRadius: 12,
                background: isSelected ? 'rgba(0,212,255,0.06)' : 'transparent',
                border: isSelected ? '0.5px solid rgba(0,212,255,0.15)' : '0.5px solid transparent',
                marginBottom: 2,
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              {/* Left color indicator */}
              {q && (
                <div style={{
                  position: 'absolute', right: 0, top: '20%', bottom: '20%', width: 2.5,
                  background: color, borderRadius: '4px 0 0 4px'
                }} />
              )}

              <div className="flex items-center gap-3" style={{ marginRight: 6 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: isSelected ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900, color: isSelected ? '#00D4FF' : 'rgba(235,235,245,0.5)',
                  fontFamily: "'JetBrains Mono', monospace",
                  border: isSelected ? '0.5px solid rgba(0,212,255,0.2)' : '0.5px solid rgba(255,255,255,0.06)',
                }}>
                  {sym.split('/')[0].slice(0, 2)}
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>{sym}</p>
                  {q && (
                    <p style={{ fontSize: 8, color: 'rgba(235,235,245,0.3)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>{q.source}</p>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'left' }}>
                {price !== null ? (
                  <p style={{ fontSize: 12, fontWeight: 900, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>
                    {price > 100 ? price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(price < 10 ? 4 : 2)}
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: 'rgba(235,235,245,0.2)', fontFamily: "'JetBrains Mono', monospace" }}>—</p>
                )}
                {q && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                    padding: '1px 5px', borderRadius: 8,
                    background: isUp ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)',
                    border: `0.5px solid ${color}30`,
                  }}>
                    {isUp ? <TrendingUp size={8} color={color} /> : <TrendingDown size={8} color={color} />}
                    <span style={{ fontSize: 9, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>
                      {isUp ? '+' : ''}{changePct.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </IOSCard>
  )
}

/* ─── Mobile Order Book Preview ──────────── */
function MobileOrderBookPreview() {
  const quotes = useMarketStore(s => s.quotes)
  const selectedSymbol = useSymbolStore(s => s.selectedSymbol)
  const router = useRouter()
  const quote = quotes[selectedSymbol]
  const midPrice = quote?.price ?? 0
  const isPositive = quote ? quote.changePercent >= 0 : true

  // Generate order book levels around the real mid-price
  const { asks, bids, buyPressure } = useMemo(() => {
    if (!midPrice || midPrice === 0) return { asks: [], bids: [], buyPressure: 50 }

    let step: number
    if (midPrice > 50000) step = midPrice * 0.0002
    else if (midPrice > 1000) step = midPrice * 0.0003
    else if (midPrice > 100) step = midPrice * 0.0005
    else step = midPrice * 0.0005

    const askList: { price: string; amount: string; percent: number }[] = []
    const bidList: { price: string; amount: string; percent: number }[] = []

    for (let i = 0; i < 5; i++) {
      const askPrice = midPrice + step * (i + 1)
      const bidPrice = midPrice - step * (i + 1)
      const askVolume = (Math.random() * 3 + 0.5) * (1 - i * 0.08)
      const bidVolume = (Math.random() * 3 + 0.5) * (1 - i * 0.08)

      askList.push({
        price: askPrice.toFixed(midPrice < 10 ? 5 : 2),
        amount: `${askVolume.toFixed(1)}M`,
        percent: Math.round(30 + Math.random() * 65),
      })
      bidList.push({
        price: bidPrice.toFixed(midPrice < 10 ? 5 : 2),
        amount: `${bidVolume.toFixed(1)}M`,
        percent: Math.round(30 + Math.random() * 65),
      })
    }

    const totalAsk = askList.reduce((s, a) => s + a.percent, 0)
    const totalBid = bidList.reduce((s, b) => s + b.percent, 0)
    const pressure = totalAsk + totalBid > 0 ? Math.round((totalBid / (totalAsk + totalBid)) * 100) : 50

    return { asks: askList, bids: bidList, buyPressure: pressure }
  }, [midPrice, isPositive])

  const spread = useMemo(() => {
    if (asks.length === 0 || bids.length === 0) return { value: '—', percent: '—' }
    const diff = parseFloat(asks[0].price) - parseFloat(bids[0].price)
    const pctVal = ((diff / midPrice) * 100).toFixed(4)
    return { value: diff.toFixed(midPrice < 10 ? 5 : 2), percent: `${pctVal}%` }
  }, [asks, bids, midPrice])

  return (
    <IOSCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #32D74B, #FF453A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <BarChart3 size={14} color="#FFFFFF" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>دفتر الأوامر</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(235,235,245,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>
        </div>
        <button
          onClick={() => router.push(`/mobile/chart?symbol=${selectedSymbol}`)}
          style={{ fontSize: 11, color: '#00D4FF', fontWeight: 800, fontFamily: "'Cairo', sans-serif", background: 'none', border: 'none' }}
        >
          التداول
        </button>
      </div>

      {/* Buy/Sell Pressure Bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <div className="flex items-center gap-1">
            <ArrowUpRight size={9} color="#32D74B" />
            <span style={{ fontSize: 9, fontWeight: 800, color: '#32D74B', fontFamily: "'JetBrains Mono', monospace" }} dir="ltr">{buyPressure}%</span>
            <span style={{ fontSize: 8, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif" }}>شراء</span>
          </div>
          <div className="flex items-center gap-1">
            <span style={{ fontSize: 8, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif" }}>بيع</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#FF453A', fontFamily: "'JetBrains Mono', monospace" }} dir="ltr">{100 - buyPressure}%</span>
            <ArrowDownRight size={9} color="#FF453A" />
          </div>
        </div>
        <div style={{
          width: '100%', height: 3, borderRadius: 2, overflow: 'hidden',
          display: 'flex', direction: 'ltr',
        }}>
          <div style={{ width: `${buyPressure}%`, height: '100%', background: '#32D74B', boxShadow: '0 0 6px rgba(50,215,75,0.3)' }} />
          <div style={{ width: `${100 - buyPressure}%`, height: '100%', background: '#FF453A', boxShadow: '0 0 6px rgba(255,69,58,0.3)' }} />
        </div>
      </div>

      {/* Column Headers */}
      <div dir="ltr" style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        padding: '2px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginBottom: 2,
      }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(235,235,245,0.3)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>PRICE</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(235,235,245,0.3)', fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', letterSpacing: '0.05em' }}>AMOUNT</span>
      </div>

      {/* Asks (reversed - lowest ask at bottom) */}
      {asks.slice().reverse().map((ask, i) => (
        <div key={`ask-${i}`} dir="ltr" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          padding: '2px 0', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(255,69,58,0.06)',
            width: `${ask.percent}%`, borderRadius: 2, marginInlineStart: 'auto',
          }} />
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#FF453A', position: 'relative' }}>{ask.price}</span>
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(235,235,245,0.4)', position: 'relative', textAlign: 'right' }}>{ask.amount}</span>
        </div>
      ))}

      {/* Spread / Mid Price */}
      <div style={{
        textAlign: 'center', padding: '6px 0', margin: '3px 0',
        background: 'rgba(0,212,255,0.05)', borderRadius: 8,
        border: '0.5px solid rgba(0,212,255,0.1)',
      }}>
        <div dir="ltr" style={{
          fontSize: 14, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace",
          color: '#00D4FF', textShadow: '0 0 8px rgba(0,212,255,0.3)',
        }}>
          {midPrice > 0 ? (midPrice < 10 ? midPrice.toFixed(5) : midPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '—'}
        </div>
        <div style={{ fontSize: 8, color: 'rgba(235,235,245,0.3)', fontFamily: "'JetBrains Mono', monospace" }} dir="ltr">
          Spread: {spread.value} ({spread.percent})
        </div>
      </div>

      {/* Bids */}
      {bids.map((bid, i) => (
        <div key={`bid-${i}`} dir="ltr" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          padding: '2px 0', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(50,215,75,0.06)',
            width: `${bid.percent}%`, borderRadius: 2, marginInlineStart: 'auto',
          }} />
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#32D74B', position: 'relative' }}>{bid.price}</span>
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(235,235,245,0.4)', position: 'relative', textAlign: 'right' }}>{bid.amount}</span>
        </div>
      ))}
    </IOSCard>
  )
}

/* ─── Mobile Positions / Recent Trades ───── */
function MobilePositions() {
  const positions = usePositionsStore(s => s.positions)
  const account = usePositionsStore(s => s.account)
  const { trades: paperTrades, closedTrades, closeTrade: closePaperTrade } = usePaperTradesStore()
  const [closing, setClosing] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const router = useRouter()

  // FIX: Determine if user has a real exchange linked by checking the
  // positions store account data. When linked, don't merge paper trades
  // into the display — they confuse users who think they have real positions.
  const hasRealAccount = useMemo(() => {
    if (!account) return false
    const equity = Number((account as any).equity) || 0
    // If the account has any equity (even from testnet), it means they linked an exchange
    return equity > 0 || positions.length > 0
  }, [account, positions])

  // Merge real positions + paper trades
  // FIX: When real exchange is linked, do NOT include paper trades.
  // Only show paper trades in pure demo mode (no linked exchange).
  const allPositions = useMemo(() => {
    const realPos = positions.map(p => ({
      id: (p as any).rawSymbol ?? p.symbol,
      symbol: p.symbol,
      side: p.side,
      qty: p.qty,
      entryPrice: p.avgEntryPrice,
      currentPrice: p.currentPrice,
      unrealizedPnl: p.unrealizedPnl,
      isPaper: false,
      // FIX: Pass both source (data source) and tradeSource (trade origin from DB).
      // Previously only source was passed (which is 'nestjs'), so the UI couldn't
      // determine whether the trade was from the agent or smart executor.
      source: (p as any).source,
      tradeSource: (p as any).tradeSource,
    }))

    // Only include paper trades if no real exchange is linked (pure demo mode)
    // FIX: NEVER include paper trades. They were the source of phantom trades
    // that appeared and "danced" every second. Show empty state instead.
    return realPos
  }, [positions, paperTrades, hasRealAccount])

  // Fetch positions on mount
  useEffect(() => {
    fetchPositions()
    fetchAccount()
  }, [fetchPositions, fetchAccount])

  const closePosition = async (id: string, isPaper: boolean, symbol: string) => {
    if (confirmClose !== id) {
      setConfirmClose(id)
      setTimeout(() => setConfirmClose(null), 3000)
      return
    }
    setConfirmClose(null)
    setClosing(id)
    if (isPaper) {
      closePaperTrade(id)
      setClosing(null)
      return
    }
    try {
      // FIX: Use closePositionUnified which tries NestJS first (for DB positions)
      // and falls back to Alpaca (for exchange positions). Previously, this
      // always called Alpaca directly, causing 404 for DB-only positions.
      // CRITICAL: Use isNestJsId() instead of UUID_RE — Prisma uses cuid() IDs.
      const result = await closePositionUnified(id, undefined, { dbId: isNestJsId(id) ? id : undefined })
      if (result.success) {
        await fetchPositions()
        await fetchAccount()
      }
    } catch { /* silent */ } finally {
      setClosing(null)
    }
  }

  const fmtPnl = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toLocaleString('en', { maximumFractionDigits: 2 })}$`

  return (
    <IOSCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(0,212,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '0.5px solid rgba(0,212,255,0.2)',
          }}>
            <Wallet size={14} color="#00D4FF" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>المراكز المفتوحة</span>
          {allPositions.length > 0 && (
            <span style={{
              padding: '1px 6px', borderRadius: 8,
              background: 'rgba(0,212,255,0.12)', color: '#00D4FF',
              fontSize: 9, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
              border: '0.5px solid rgba(0,212,255,0.2)',
            }}>{allPositions.length}</span>
          )}
        </div>
        <button
          onClick={() => router.push('/mobile/portfolio')}
          style={{ fontSize: 11, color: '#00D4FF', fontWeight: 800, fontFamily: "'Cairo', sans-serif", background: 'none', border: 'none' }}
        >
          المحفظة
        </button>
      </div>

      {allPositions.length === 0 ? (
        <div style={{
          padding: '20px 0', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 6, textAlign: 'center',
        }}>
          <Activity size={24} color="rgba(255,255,255,0.08)" />
          <p style={{ fontSize: 12, color: 'rgba(235,235,245,0.3)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>لا توجد مراكز مفتوحة حالياً</p>
          <p style={{ fontSize: 10, color: 'rgba(235,235,245,0.2)', fontFamily: "'Cairo', sans-serif" }}>عند فتح صفقة ستظهر هنا</p>
        </div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allPositions.map(pos => {
            const isLong = pos.side === 'long' || pos.side === 'LONG'
            const pnlUp = pos.unrealizedPnl > 0
            const pnlColor = pnlUp ? '#32D74B' : '#FF453A'

            return (
              <motion.div
                key={pos.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push(`/mobile/chart?symbol=${pos.symbol}`)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 10px', borderRadius: 14,
                  background: `linear-gradient(180deg, rgba(26,29,41,0.8), rgba(31,35,53,0.6))`,
                  border: `0.5px solid ${pnlUp ? 'rgba(50,215,75,0.12)' : 'rgba(255,69,58,0.12)'}`,
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                {/* Left side indicator */}
                <div style={{
                  position: 'absolute', right: 0, top: '15%', bottom: '15%', width: 2,
                  background: isLong ? '#32D74B' : '#FF453A', borderRadius: '4px 0 0 4px',
                }} />

                <div className="flex items-center gap-3" style={{ marginRight: 4 }}>
                  {/* Side icon */}
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: isLong ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `0.5px solid ${isLong ? 'rgba(50,215,75,0.2)' : 'rgba(255,69,58,0.2)'}`,
                  }}>
                    {isLong ? <ArrowUpRight size={14} color="#32D74B" /> : <ArrowDownRight size={14} color="#FF453A" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize: 12, fontWeight: 900, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>{pos.symbol}</span>
                      <span style={{
                        padding: '1px 4px', borderRadius: 6,
                        background: isLong ? 'rgba(50,215,75,0.12)' : 'rgba(255,69,58,0.12)',
                        color: isLong ? '#32D74B' : '#FF453A',
                        fontSize: 7, fontWeight: 900, fontFamily: "'Cairo', sans-serif",
                        border: `0.5px solid ${isLong ? 'rgba(50,215,75,0.2)' : 'rgba(255,69,58,0.2)'}`,
                      }}>{isLong ? 'شراء' : 'بيع'}</span>
                      {pos.isPaper && (
                        <span style={{
                          padding: '1px 4px', borderRadius: 6,
                          background: 'rgba(255,184,0,0.1)', color: '#FFB800',
                          fontSize: 6, fontWeight: 800,
                          border: '0.5px solid rgba(255,184,0,0.2)',
                        }}>ورقي</span>
                      )}
                      {/* FIX: Check tradeSource (from DB) for correct source badge.
                          Previously only checked source='bot' which never matched
                          because source='nestjs' (data source, not trade source). */}
                      {(pos.tradeSource === 'smart_executor' || pos.tradeSource === 'auto_paper' || pos.source === 'bot') && (
                        <span style={{
                          padding: '1px 4px', borderRadius: 6,
                          background: 'rgba(0,212,255,0.1)', color: '#00D4FF',
                          fontSize: 6, fontWeight: 800,
                          border: '0.5px solid rgba(0,212,255,0.2)',
                        }}>المنفذ</span>
                      )}
                      {pos.tradeSource === 'agent' && (
                        <span style={{
                          padding: '1px 4px', borderRadius: 6,
                          background: 'rgba(162,89,255,0.1)', color: '#A259FF',
                          fontSize: 6, fontWeight: 800,
                          border: '0.5px solid rgba(162,89,255,0.2)',
                        }}>الوكيل</span>
                      )}
                    </div>
                    <span style={{ fontSize: 9, color: 'rgba(235,235,245,0.3)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {pos.qty} @ {pos.entryPrice > 100 ? pos.entryPrice.toLocaleString('en', { maximumFractionDigits: 2 }) : pos.entryPrice.toFixed(4)}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: pnlColor, fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtPnl(pos.unrealizedPnl)}
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      closePosition(pos.id, pos.isPaper, pos.symbol)
                    }}
                    style={{
                      padding: '3px 8px', borderRadius: 6,
                      background: confirmClose === pos.id ? 'rgba(255,69,58,0.16)' : 'rgba(255,69,58,0.06)',
                      border: `0.5px solid ${confirmClose === pos.id ? 'rgba(255,69,58,0.4)' : 'rgba(255,69,58,0.15)'}`,
                      color: '#FF453A', fontSize: 8, fontWeight: 900,
                      fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 2,
                    }}
                  >
                    {closing === pos.id ? (
                      <RefreshCw size={8} className="animate-spin" color="#FF453A" />
                    ) : confirmClose === pos.id ? (
                      'تأكيد'
                    ) : (
                      <>
                        <X size={8} />
                        إغلاق
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Closed Trades */}
      {closedTrades.length > 0 && (
        <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 8 }}>
          <button
            onClick={() => setShowClosed(!showClosed)}
            style={{
              width: '100%', padding: '6px 0', background: 'transparent', border: 'none',
              color: 'rgba(235,235,245,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', fontFamily: "'Cairo', sans-serif", fontSize: 10, fontWeight: 700,
            }}
          >
            <div className="flex items-center gap-2">
              <History size={12} />
              الصفقات المغلقة ({closedTrades.length})
            </div>
            <span style={{ fontSize: 8, transform: showClosed ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s', display: 'inline-block' }}>▼</span>
          </button>

          {showClosed && (
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {closedTrades.map((ct: any) => {
                const isLong = ct.side === 'long'
                const pnlUp = ct.realizedPnl >= 0
                return (
                  <div key={ct.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 8px', borderRadius: 8,
                    border: `0.5px solid ${pnlUp ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)'}`,
                    background: 'rgba(31,35,53,0.5)',
                  }}>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 10, fontWeight: 900, color: isLong ? '#32D74B' : '#FF453A' }}>
                        {isLong ? '⬆' : '⬇'}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>{ct.symbol}</span>
                      {/* FIX: Check both source and tradeSource for closed trade badges */}
                      {(ct.source === 'bot' || ct.source === 'smart_executor' || ct.tradeSource === 'smart_executor') && (
                        <span style={{ padding: '1px 3px', borderRadius: 4, background: 'rgba(0,212,255,0.1)', color: '#00D4FF', fontSize: 6, fontWeight: 800 }}>المنفذ</span>
                      )}
                      {(ct.source === 'agent' || ct.tradeSource === 'agent') && (
                        <span style={{ padding: '1px 3px', borderRadius: 4, background: 'rgba(162,89,255,0.1)', color: '#A259FF', fontSize: 6, fontWeight: 800 }}>الوكيل</span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 900, color: pnlUp ? '#32D74B' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtPnl(ct.realizedPnl)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
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
  const unreadNotifCount = useNotificationStore(s => s.notifications.filter(n => !n.read).length)
  const mode = useDashboardStore(s => s.mode)
  const setMode = useDashboardStore(s => s.setMode)
  const modeConfig = MODE_CONFIG[mode]

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

  const openPositions = trades

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
      background: '#0B0E14', 
      direction: 'rtl', 
      /* paddingBottom removed — the layout's <main> already provides
         calc(68px + env(safe-area-inset-bottom)) padding for the navbar */
      position: 'relative',
      overflowX: 'hidden',
      width: '100%',
      minHeight: '100%',
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
        padding: 'calc(env(safe-area-inset-top, 20px) + 10px) 20px 10px', 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', zIndex: 1
      }}>
        <div className="flex items-center gap-3">
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'radial-gradient(circle at 50% 40%, #0D1520, #020308)',
            border: '1.5px solid rgba(0,200,255,0.3)',
            boxShadow: '0 0 16px rgba(0,200,255,0.3), 0 0 0 3px rgba(0,200,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Globe2 size={20} color="#00D4FF" strokeWidth={2.5} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", letterSpacing: -0.5, lineHeight: 1.1 }}>
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
          {unreadNotifCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              style={{
                position: 'absolute', top: 8, right: 8,
                minWidth: 18, height: 18, borderRadius: 9,
                background: '#FF453A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 900, color: '#FFF',
                fontFamily: "'JetBrains Mono', monospace",
                padding: '0 4px',
                border: '2px solid #1C1C1E',
                boxShadow: '0 0 8px rgba(255,69,58,0.5)',
              }}
            >
              {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
            </motion.div>
          )}
        </motion.button>
      </div>

      {/* ── Trading Mode Switcher ── */}
      <div style={{ padding: '0 20px', marginBottom: 8, position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'flex', gap: 0,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 16, padding: 3,
          border: '0.5px solid rgba(255,255,255,0.06)',
        }}>
          {(['trader', 'investor', 'ai'] as TradingMode[]).map(m => {
            const cfg = MODE_CONFIG[m]
            const isActive = mode === m
            return (
              <motion.button
                key={m}
                whileTap={{ scale: 0.95 }}
                onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 13,
                  background: isActive ? `${cfg.accent}18` : 'transparent',
                  border: isActive ? `0.5px solid ${cfg.accent}40` : '0.5px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  cursor: 'pointer', transition: '0.2s',
                }}
              >
                <span style={{ fontSize: 11 }}>{cfg.icon}</span>
                <span style={{
                  fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                  color: isActive ? cfg.accent : 'rgba(235,235,245,0.4)',
                }}>{cfg.labelAr}</span>
              </motion.button>
            )
          })}
        </div>
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
      
      {/* ── أحدث التوصيات من محرك المتابعة الذكي ── */}
      <div className="flex items-center justify-between px-6 mb-4 mt-6">
        <div className="flex items-center gap-2">
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>
            أحدث التوصيات
          </h2>
          <span style={{
            fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 8,
            background: 'rgba(0,212,255,0.12)', color: '#00D4FF',
            fontFamily: "'JetBrains Mono', monospace",
            border: '0.5px solid rgba(0,212,255,0.2)',
          }}>ذكي</span>
        </div>
        <button 
          onClick={() => router.push('/mobile/signals')}
          style={{ fontSize: 13, color: '#00D4FF', fontWeight: 800, fontFamily: "'Cairo', sans-serif", background: 'none', border: 'none' }}
        >
          شاهد الكل
        </button>
      </div>
      <LatestRecommendations />

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

      {/* ── Watchlist Section ── */}
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", margin: '24px 24px 12px' }}>
        قائمة المراقبة
      </h2>
      <MobileWatchlist />

      {/* ── Order Book Preview ── */}
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", margin: '24px 24px 12px' }}>
        دفتر الأوامر
      </h2>
      <MobileOrderBookPreview />

      {/* ── Positions / Recent Trades ── */}
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", margin: '24px 24px 12px' }}>
        المراكز والصفقات
      </h2>
      <MobilePositions />

      {/* ── Agent, Bot & Scanner Grid ── */}
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", margin: '24px 24px 12px' }}>
        الأدوات الذكية
      </h2>
      <div className="grid grid-cols-3 gap-3 px-5 mb-8">
        {/* Agent Card */}
        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => router.push('/mobile/agent')}
          style={{ background: '#1C1C1E', borderRadius: 28, padding: 16, position: 'relative', overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.06)' }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,159,67,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Cpu size={20} color="#FF9F43" />
          </div>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>الوكيل</p>
          <p style={{ fontSize: 10, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginTop: 2 }}>تداول ذاتي</p>
        </motion.div>

        {/* Bot Card */}
        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => router.push('/mobile/bot')}
          style={{ background: '#1C1C1E', borderRadius: 28, padding: 16, position: 'relative', overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.06)' }}
        >
          {isOn && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#00D4FF', boxShadow: '0 0 15px #00D4FF' }} />}
          <div style={{ width: 36, height: 36, borderRadius: 10, background: isOn ? 'rgba(0,212,255,0.1)' : 'rgba(235,235,245,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Bot size={20} color={isOn ? '#00D4FF' : 'rgba(235,235,245,0.3)'} />
          </div>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>البوت</p>
          <p style={{ fontSize: 10, color: isOn ? '#32D74B' : 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginTop: 2 }}>{isOn ? 'نشط' : 'متوقف'}</p>
        </motion.div>

        {/* Scanner Card */}
        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => router.push('/mobile/scanner')}
          style={{ background: '#1C1C1E', borderRadius: 28, padding: 16, border: '0.5px solid rgba(255,255,255,0.06)' }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <ScanSearch size={20} color="#FFFFFF" />
          </div>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>السكانر</p>
          <p style={{ fontSize: 10, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginTop: 2 }}>فحص مباشر</p>
        </motion.div>
      </div>

    </div>
  )
}
