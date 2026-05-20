'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { Card } from '@/components/mobile/Card'
import { SkeletonCard, SkeletonLine } from '@/components/mobile/Skeleton'
import {
  Brain, BarChart3, ChevronLeft, TrendingUp, TrendingDown, Wallet,
  Cpu, Activity, Shield, DollarSign, Flame, Zap, Loader2, Link2, Sparkles,
} from 'lucide-react'

const fmt2 = (n: number) => Math.abs(n).toFixed(2)

function safeConfidence(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (val && typeof val === 'object' && 'compositeScore' in (val as Record<string, unknown>)) return (val as { compositeScore: number }).compositeScore ?? 0
  return Number.isFinite(Number(val)) ? Number(val) : 0
}

const MODE_CONFIG: Record<TradingMode, { accent: string; labelAr: string }> = {
  trader: { accent: '#00D4FF', labelAr: 'تاجر' },
  investor: { accent: '#32D74B', labelAr: 'مستثمر' },
  ai: { accent: '#A78BFA', labelAr: 'ذكاء' },
}

// ── Live Ticker ──
function CurrencyTicker() {
  const quotes = useMarketStore(s => s.quotes)
  const displayPairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD']
  return (
    <div className="r-ticker">
      <div style={{ paddingInlineStart: 16, zIndex: 2, display: 'flex', alignItems: 'center', width: 80, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: 80, background: 'linear-gradient(90deg, #0B0E14 60%, transparent)' }} />
        <span style={{ fontSize: 9, fontWeight: 900, color: '#00D4FF', background: 'rgba(0,212,255,0.1)', padding: '2px 6px', borderRadius: 4, border: '0.5px solid rgba(0,212,255,0.2)', position: 'relative', zIndex: 1 }}>LIVE</span>
      </div>
      <div className="r-ticker__track">
        {[...displayPairs, ...displayPairs].map((pair, i) => {
          const quoteKey = Object.keys(quotes).find(k => k.replace('/', '') === pair.replace('/', ''))
          const q = quoteKey ? quotes[quoteKey] : null
          const price = q ? q.price : 0
          const change = q ? q.changePercent : 0
          const pos = change >= 0
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{pair}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: pos ? '#32D74B' : '#FF453A', fontFamily: 'var(--font-mono)' }}>
                {price ? price.toLocaleString('en', { minimumFractionDigits: price < 10 ? 4 : 2 }) : '—'}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, color: pos ? '#32D74B' : '#FF453A', fontFamily: 'var(--font-mono)' }}>
                {pos ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Watchlist ──
function Watchlist() {
  const quotes = useMarketStore(s => s.quotes)
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const router = useRouter()
  const [tab, setTab] = useState<'Crypto' | 'Forex'>('Crypto')
  const SYMBOLS = tab === 'Crypto' ? ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'ADA/USD'] : ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'AUD/USD', 'USD/CHF']
  const hotMover = useMemo(() => SYMBOLS.map(s => ({ s, q: quotes[s] })).filter(x => x.q).sort((a, b) => Math.abs(b.q!.changePercent) - Math.abs(a.q!.changePercent))[0], [quotes, SYMBOLS])

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg, #00D4FF, #5B21B6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BarChart3 size={13} color="#FFF" /></div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>قائمة المراقبة</span>
        </div>
        <button onClick={() => router.push('/mobile/markets')} style={{ fontSize: 11, color: '#00D4FF', fontWeight: 800, fontFamily: 'var(--font-cairo)', background: 'none', border: 'none', cursor: 'pointer' }}>المزيد</button>
      </div>
      <div className="r-tabs" style={{ margin: '0 0 10px' }}>
        {(['Crypto', 'Forex'] as const).map(t => (
          <button key={t} className={`r-tabs__item ${tab === t ? 'r-tabs__item--active' : ''}`} onClick={() => setTab(t)}>
            {t === 'Crypto' ? 'كريبتو' : 'فوركس'}
          </button>
        ))}
      </div>
      {hotMover && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 10, background: 'rgba(255,183,0,0.04)', border: '0.5px solid rgba(255,183,0,0.1)', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flame size={11} color="#FFB800" /><span style={{ fontSize: 9, fontWeight: 800, color: '#FFB800', fontFamily: 'var(--font-cairo)' }}>أكثر حركة</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ fontSize: 10, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{hotMover.s}</span><span style={{ fontSize: 9, fontWeight: 800, color: (hotMover.q?.changePercent ?? 0) >= 0 ? '#32D74B' : '#FF453A', fontFamily: 'var(--font-mono)' }}>{(hotMover.q?.changePercent ?? 0) >= 0 ? '+' : ''}{(hotMover.q?.changePercent ?? 0).toFixed(2)}%</span></div>
        </div>
      )}
      <div style={{ maxHeight: 240, overflowY: 'auto' }} className="r-no-scroll">
        {SYMBOLS.map(sym => {
          const q = quotes[sym]
          const changePct = q?.changePercent ?? 0
          const price = q?.price ?? null
          const isUp = changePct >= 0
          const color = isUp ? '#32D74B' : '#FF453A'
          const sel = sym === selectedSymbol
          return (
            <div key={sym} onClick={() => { setSelectedSymbol(sym); router.push(`/mobile/chart?symbol=${sym}`) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 6px', borderRadius: 10, background: sel ? 'rgba(0,212,255,0.06)' : 'transparent', border: sel ? '0.5px solid rgba(0,212,255,0.15)' : '0.5px solid transparent', marginBottom: 2, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: sel ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: sel ? '#00D4FF' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)', border: sel ? '0.5px solid rgba(0,212,255,0.2)' : '0.5px solid rgba(255,255,255,0.06)' }}>{sym.split('/')[0].slice(0, 2)}</div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{sym}</span>
              </div>
              <div style={{ textAlign: 'left' }}>
                {price !== null ? <div style={{ fontSize: 11, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{price > 100 ? price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(price < 10 ? 4 : 2)}</div> : <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>—</div>}
                {q && <div style={{ fontSize: 9, fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>{isUp ? '+' : ''}{changePct.toFixed(2)}%</div>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const STRATEGY_LABELS: Record<string, string> = { AUTO: 'تلقائي', SWING: 'سوينغ', GRID: 'شبكة', MEAN_REVERSION: 'عودة للمتوسط', MOMENTUM_BREAKOUT: 'اختراق الزخم', DCA: 'متوسط التكلفة', VWAP_RSI: 'VWAP+RSI' }

// ── Agent Widget ──
function AgentWidget() {
  const router = useRouter()
  const { agentState, loading, fetchStatus, startAgent, stopAgent, startAutoRefresh, stopAutoRefresh } = useAgentStore()
  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const strategy = agentState?.config?.strategy ?? StrategyType.AUTO
  const dailyPnL = Number(agentState?.dailyPnL ?? 0)
  const dailyTrades = Number(agentState?.dailyTradesCount ?? 0)
  const consecutiveLosses = Number(agentState?.consecutiveLosses ?? 0)
  const isPaper = agentState?.config?.isPaperTrading ?? false
  useEffect(() => { fetchStatus(); startAutoRefresh(); return () => stopAutoRefresh() }, [fetchStatus, startAutoRefresh, stopAutoRefresh])
  const statusColor = isRunning ? '#00FFA3' : status === AgentStatus.EMERGENCY_STOP ? '#FF4757' : status === AgentStatus.DAILY_LIMIT_REACHED ? '#FFB800' : '#8B92A8'
  const statusLabel = isRunning ? 'يعمل' : status === AgentStatus.EMERGENCY_STOP ? 'إيقاف طارئ' : status === AgentStatus.DAILY_LIMIT_REACHED ? 'حد الخسارة' : 'في الانتظار'
  const handleToggle = useCallback(async () => { if (isRunning) await stopAgent(false); else await startAgent(strategy) }, [isRunning, strategy, startAgent, stopAgent])

  // Show skeleton while first load is happening and no agent state yet
  if (!agentState && loading) {
    return (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="r-skeleton r-skeleton--shimmer" style={{ width: 40, height: 40, borderRadius: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SkeletonLine width={100} height={14} />
              <SkeletonLine width={130} height={10} />
            </div>
          </div>
        </div>
        <div className="r-skeleton r-skeleton--shimmer" style={{ height: 36, borderRadius: 12, marginBottom: 10 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div className="r-skeleton r-skeleton--shimmer" style={{ height: 60, borderRadius: 12 }} />
          <div className="r-skeleton r-skeleton--shimmer" style={{ height: 60, borderRadius: 12 }} />
          <div className="r-skeleton r-skeleton--shimmer" style={{ height: 60, borderRadius: 12 }} />
        </div>
      </Card>
    )
  }

  return (
    <Card onClick={() => router.push('/mobile/agent')} highlight={isRunning}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: isRunning ? 'linear-gradient(135deg, #FF9F43, #A259FF)' : 'rgba(139,146,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.5px solid rgba(255,255,255,0.08)' }}><Cpu size={20} color={isRunning ? '#FFF' : '#8B92A8'} /></div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>الوكيل المستقل</div>
            <div style={{ fontSize: 10, color: '#FF9F43', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>تداول ذاتي بالذكاء الاصطناعي</div>
          </div>
        </div>
        <ChevronLeft size={18} color="rgba(255,255,255,0.2)" />
      </div>
      <div style={{ padding: '8px 12px', borderRadius: 12, background: `${statusColor}08`, border: `0.5px solid ${statusColor}18`, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: statusColor, boxShadow: `0 0 6px ${statusColor}60` }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, fontFamily: 'var(--font-cairo)' }}>{statusLabel}</span>
          {isPaper && isRunning && <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: 'rgba(0,212,255,0.1)', color: '#00D4FF', border: '0.5px solid rgba(0,212,255,0.2)', fontFamily: 'var(--font-cairo)' }}>ورقي</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>{STRATEGY_LABELS[strategy] || strategy}</span>
          <button onClick={(e) => { e.stopPropagation(); handleToggle() }} disabled={loading} style={{ padding: '4px 12px', borderRadius: 8, background: isRunning ? 'rgba(255,71,87,0.1)' : 'linear-gradient(135deg, #00FFC6, #0A84FF)', border: isRunning ? '0.5px solid rgba(255,71,87,0.2)' : 'none', color: isRunning ? '#FF4757' : '#000', fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-cairo)', cursor: 'pointer' }}>
            {isRunning ? 'إيقاف' : 'تشغيل'}
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
          <DollarSign size={11} color={dailyPnL >= 0 ? '#00FFA3' : '#FF4757'} style={{ margin: '0 auto 3px' }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: dailyPnL >= 0 ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>{dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)}</div>
          <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 1 }}>ربح اليوم</div>
        </div>
        <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
          <Activity size={11} color="#00D4FF" style={{ margin: '0 auto 3px' }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{dailyTrades}</div>
          <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 1 }}>صفقات اليوم</div>
        </div>
        <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
          <Shield size={11} color={consecutiveLosses >= 3 ? '#FF4757' : '#B388FF'} style={{ margin: '0 auto 3px' }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: consecutiveLosses >= 3 ? '#FF4757' : '#FFF', fontFamily: 'var(--font-mono)' }}>{consecutiveLosses}</div>
          <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 1 }}>خسائر متتالية</div>
        </div>
      </div>
    </Card>
  )
}

// ── AI Council Widget ──
function AICouncilWidget() {
  const router = useRouter()
  const [consensus, setConsensus] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const { selectedSymbol } = useSymbolStore()
  useEffect(() => {
    async function fetchConsensus() {
      try { const res = await fetch(`/api/ai/consensus?symbol=${selectedSymbol}`); if (res.ok) { const data = await res.json(); if (data.success) setConsensus(data.data) } } catch { /* */ } finally { setLoading(false) }
    }
    fetchConsensus()
    const interval = setInterval(fetchConsensus, 60000)
    return () => clearInterval(interval)
  }, [selectedSymbol])
  const rec = (consensus?.recommendation as string) ?? 'HOLD'
  const score = safeConfidence(consensus?.consensusScore)
  const color = rec === 'BUY' ? '#00FFA3' : rec === 'SELL' ? '#FF4757' : '#FFB800'
  const recLabel = rec === 'BUY' ? 'شراء' : rec === 'SELL' ? 'بيع' : 'انتظار'
  const analyses = (consensus?.analyses as Array<Record<string, unknown>>) ?? []
  const votes = analyses.reduce((acc: { buy: number; sell: number; hold: number }, a: Record<string, unknown>) => { if (a.vote === 'BUY') acc.buy += 1; else if (a.vote === 'SELL') acc.sell += 1; else acc.hold += 1; return acc }, { buy: 0, sell: 0, hold: 0 })
  const total = votes.buy + votes.sell + votes.hold

  // Show skeleton while consensus is loading
  if (loading) {
    return (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="r-skeleton r-skeleton--shimmer" style={{ width: 40, height: 40, borderRadius: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SkeletonLine width={120} height={14} />
              <SkeletonLine width={90} height={10} />
            </div>
          </div>
        </div>
        <div className="r-skeleton r-skeleton--shimmer" style={{ height: 52, borderRadius: 12, marginBottom: 10 }} />
        <div className="r-skeleton r-skeleton--shimmer" style={{ height: 4, borderRadius: 2 }} />
      </Card>
    )
  }

  return (
    <Card onClick={() => router.push('/mobile/ai')}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #B388FF, #A259FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.5px solid rgba(255,255,255,0.08)' }}><Brain size={20} color="#FFF" /></div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>مجلس الذكاء الاصطناعي</div>
            <div style={{ fontSize: 10, color: '#B388FF', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>رؤى من 6 نماذج AI</div>
          </div>
        </div>
        <ChevronLeft size={18} color="rgba(255,255,255,0.2)" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 12px', borderRadius: 12, background: `${color}08`, border: `0.5px solid ${color}18` }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color, fontFamily: 'var(--font-mono)' }}>{score}%</span>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'var(--font-cairo)' }}>توصية: {recLabel}</div>
          <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>{selectedSymbol} — ثقة {score}%</div>
        </div>
      </div>
      {total > 0 && (
        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', direction: 'ltr' }}>
          <div style={{ width: `${(votes.buy / total) * 100}%`, background: '#00FFA3', borderRadius: 2 }} />
          <div style={{ width: `${(votes.hold / total) * 100}%`, background: '#FFB800', borderRadius: 2 }} />
          <div style={{ width: `${(votes.sell / total) * 100}%`, background: '#FF4757', borderRadius: 2 }} />
        </div>
      )}
    </Card>
  )
}

// ── Quick Actions ──
function QuickActions() {
  const router = useRouter()
  const items = [
    { label: 'المنفذ الذكي', icon: Zap, href: '/mobile/bot', color: '#059669' },
    { label: 'التحليلات', icon: Brain, href: '/mobile/ai', color: '#B388FF' },
    { label: 'المراكز', icon: Activity, href: '/mobile/positions', color: '#00C853' },
    { label: 'ربط الحسابات', icon: Link2, href: '/mobile/kyc', color: '#00FFA3' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '0 var(--space-lg)', marginBottom: 12 }}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button key={item.href} onClick={() => router.push(item.href)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 4px', borderRadius: 14, background: `${item.color}08`, border: `0.5px solid ${item.color}18`, cursor: 'pointer', touchAction: 'manipulation' }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={16} color={item.color} /></div>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-cairo)', textAlign: 'center' }}>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Main Page ──
export default function MobileHomePage() {
  const router = useRouter()
  const tradingMode = useDashboardStore(s => s.mode)
  const account = usePositionsStore(s => s.account)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const modeAccent = MODE_CONFIG[tradingMode]?.accent || '#00D4FF'
  useEffect(() => { fetchAccount() }, [fetchAccount])
  const buyingPower = useMemo(() => account?.buying_power ? Number(account.buying_power) : 0, [account?.buying_power])

  return (
    <div className="r-page r-stagger">
      {/* Greeting */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>رؤى</div>
          <div style={{ fontSize: 10, color: modeAccent, fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>منصة ربط الحسابات</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ padding: '4px 10px', borderRadius: 8, background: `${modeAccent}12`, border: `0.5px solid ${modeAccent}25` }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: modeAccent, fontFamily: 'var(--font-cairo)' }}>{MODE_CONFIG[tradingMode]?.labelAr}</span>
          </div>
        </div>
      </div>

      <CurrencyTicker />
      <QuickActions />
      <AgentWidget />
      <AICouncilWidget />
      <Watchlist />
      {buyingPower > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wallet size={16} color="#00D4FF" /><span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>قوة الشراء</span></div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>${buyingPower.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </Card>
      )}
      <div style={{ height: 80 }} />
    </div>
  )
}
