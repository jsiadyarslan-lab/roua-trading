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
import { Card, SkelCard } from '@/components/mobile/FluxComponents'
import {
  Brain, BarChart3, TrendingUp, TrendingDown, Wallet,
  Cpu, Activity, Shield, DollarSign, Flame, Zap, Link2, ChevronLeft,
} from 'lucide-react'

const MODE_CFG: Record<TradingMode, { accent: string; label: string }> = {
  trader: { accent: '#00D4FF', label: 'تاجر' },
  investor: { accent: '#32D74B', label: 'مستثمر' },
  ai: { accent: '#A78BFA', label: 'ذكاء' },
}

const STRATEGY_LABELS: Record<string, string> = {
  AUTO: 'تلقائي', SWING: 'سوينغ', GRID: 'شبكة',
  MEAN_REVERSION: 'عودة للمتوسط', MOMENTUM_BREAKOUT: 'اختراق الزخم',
  DCA: 'متوسط التكلفة', VWAP_RSI: 'VWAP+RSI',
}

/* ═══ Ticker ═══ */
function Ticker() {
  const quotes = useMarketStore(s => s.quotes)
  const pairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD']
  return (
    <div className="f-ticker">
      <div style={{ paddingInlineStart: 16, zIndex: 2, display: 'flex', alignItems: 'center', width: 80, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: 80, background: 'linear-gradient(90deg, #0B0E14 60%, transparent)' }} />
        <span style={{ fontSize: 9, fontWeight: 900, color: '#00D4FF', background: 'rgba(0,212,255,0.1)', padding: '2px 6px', borderRadius: 4, border: '0.5px solid rgba(0,212,255,0.2)', position: 'relative', zIndex: 1 }}>LIVE</span>
      </div>
      <div className="f-ticker__track">
        {[...pairs, ...pairs].map((pair, i) => {
          const quoteKey = Object.keys(quotes).find(k => k.replace('/', '') === pair.replace('/', ''))
          const q = quoteKey ? quotes[quoteKey] : null
          const price = q ? q.price : 0
          const change = q ? q.changePercent : 0
          const pos = change >= 0
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{pair}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: pos ? '#32D74B' : '#FF453A', fontFamily: 'var(--f-mono)' }}>
                {price ? price.toLocaleString('en', { minimumFractionDigits: price < 10 ? 4 : 2 }) : '—'}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, color: pos ? '#32D74B' : '#FF453A', fontFamily: 'var(--f-mono)' }}>
                {pos ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══ Quick Actions ═══ */
function QuickActions() {
  const router = useRouter()
  const items = [
    { label: 'المنفذ الذكي', icon: Zap, href: '/mobile/trade', color: '#059669' },
    { label: 'التحليلات', icon: Brain, href: '/mobile/ai', color: '#B388FF' },
    { label: 'المراكز', icon: Activity, href: '/mobile/positions', color: '#00C853' },
    { label: 'ربط الحسابات', icon: Link2, href: '/mobile/kyc', color: '#00FFA3' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '0 var(--s4)', marginBottom: 12 }}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button key={item.href} onClick={() => router.push(item.href)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 4px', borderRadius: 14, background: `${item.color}08`, border: `0.5px solid ${item.color}18`, cursor: 'pointer', touchAction: 'manipulation' }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={16} color={item.color} /></div>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--f-cairo)', textAlign: 'center' }}>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ═══ Agent Widget ═══ */
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

  const handleToggle = useCallback(async () => {
    if (isRunning) await stopAgent(false)
    else await startAgent(strategy)
  }, [isRunning, strategy, startAgent, stopAgent])

  if (!agentState && loading) return <SkelCard lines={4} />

  return (
    <Card onClick={() => router.push('/mobile/trade')} highlight={isRunning}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: isRunning ? 'linear-gradient(135deg, #FF9F43, #A259FF)' : 'rgba(139,146,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.5px solid rgba(255,255,255,0.08)' }}>
            <Cpu size={20} color={isRunning ? '#FFF' : '#8B92A8'} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>الوكيل المستقل</div>
            <div style={{ fontSize: 10, color: '#FF9F43', fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>تداول ذاتي بالذكاء الاصطناعي</div>
          </div>
        </div>
        <ChevronLeft size={18} color="rgba(255,255,255,0.2)" />
      </div>

      <div style={{ padding: '8px 12px', borderRadius: 12, background: `${statusColor}08`, border: `0.5px solid ${statusColor}18`, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: statusColor, boxShadow: `0 0 6px ${statusColor}60` }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, fontFamily: 'var(--f-cairo)' }}>{statusLabel}</span>
          {isPaper && isRunning && <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: 'rgba(0,212,255,0.1)', color: '#00D4FF', border: '0.5px solid rgba(0,212,255,0.2)', fontFamily: 'var(--f-cairo)' }}>ورقي</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{STRATEGY_LABELS[strategy] || strategy}</span>
          <button onClick={(e) => { e.stopPropagation(); handleToggle() }} disabled={loading} style={{ padding: '4px 12px', borderRadius: 8, background: isRunning ? 'rgba(255,71,87,0.1)' : 'linear-gradient(135deg, #00FFC6, #0A84FF)', border: isRunning ? '0.5px solid rgba(255,71,87,0.2)' : 'none', color: isRunning ? '#FF4757' : '#000', fontSize: 9, fontWeight: 800, fontFamily: 'var(--f-cairo)', cursor: 'pointer' }}>
            {isRunning ? 'إيقاف' : 'تشغيل'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
          <DollarSign size={11} color={dailyPnL >= 0 ? '#00FFA3' : '#FF4757'} style={{ margin: '0 auto 3px' }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: dailyPnL >= 0 ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-mono)' }}>{dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)}</div>
          <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--f-cairo)', marginTop: 1 }}>ربح اليوم</div>
        </div>
        <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
          <Activity size={11} color="#00D4FF" style={{ margin: '0 auto 3px' }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{dailyTrades}</div>
          <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--f-cairo)', marginTop: 1 }}>صفقات</div>
        </div>
        <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
          <Shield size={11} color={consecutiveLosses >= 3 ? '#FF4757' : '#B388FF'} style={{ margin: '0 auto 3px' }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: consecutiveLosses >= 3 ? '#FF4757' : '#FFF', fontFamily: 'var(--f-mono)' }}>{consecutiveLosses}</div>
          <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--f-cairo)', marginTop: 1 }}>خسائر متتالية</div>
        </div>
      </div>
    </Card>
  )
}

/* ═══ AI Council Widget ═══ */
function AICouncilWidget() {
  const router = useRouter()
  const [consensus, setConsensus] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const { selectedSymbol } = useSymbolStore()

  function safeConfidence(val: unknown): number {
    if (typeof val === 'number' && Number.isFinite(val)) return val
    if (val && typeof val === 'object' && 'compositeScore' in (val as Record<string, unknown>)) return (val as { compositeScore: number }).compositeScore ?? 0
    return Number.isFinite(Number(val)) ? Number(val) : 0
  }

  useEffect(() => {
    async function fetchConsensus() {
      try { const res = await fetch(`/api/ai/consensus?symbol=${selectedSymbol}`); if (res.ok) { const data = await res.json(); if (data.success) setConsensus(data.data) } } catch { /* */ } finally { setLoading(false) }
    }
    fetchConsensus()
    const interval = setInterval(fetchConsensus, 60000)
    return () => clearInterval(interval)
  }, [selectedSymbol])

  if (loading) return <SkelCard lines={3} />

  const rec = (consensus?.recommendation as string) ?? 'HOLD'
  const score = safeConfidence(consensus?.consensusScore)
  const color = rec === 'BUY' ? '#00FFA3' : rec === 'SELL' ? '#FF4757' : '#FFB800'
  const recLabel = rec === 'BUY' ? 'شراء' : rec === 'SELL' ? 'بيع' : 'انتظار'

  return (
    <Card onClick={() => router.push('/mobile/ai')}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #B388FF, #A259FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.5px solid rgba(255,255,255,0.08)' }}>
            <Brain size={20} color="#FFF" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>مجلس الذكاء الاصطناعي</div>
            <div style={{ fontSize: 10, color: '#B388FF', fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>6 نماذج AI</div>
          </div>
        </div>
        <ChevronLeft size={18} color="rgba(255,255,255,0.2)" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, background: `${color}08`, border: `0.5px solid ${color}18` }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color, fontFamily: 'var(--f-mono)' }}>{score}%</span>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'var(--f-cairo)' }}>توصية: {recLabel}</div>
          <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{selectedSymbol} — ثقة {score}%</div>
        </div>
      </div>
    </Card>
  )
}

/* ═══ Watchlist Widget ═══ */
function WatchlistWidget() {
  const quotes = useMarketStore(s => s.quotes)
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const router = useRouter()
  const pairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'XAU/USD', 'EUR/USD']
  const hotMover = useMemo(() => pairs.map(s => ({ s, q: quotes[s] })).filter(x => x.q).sort((a, b) => Math.abs(b.q!.changePercent) - Math.abs(a.q!.changePercent))[0], [quotes, pairs])

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg, #00D4FF, #5B21B6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BarChart3 size={13} color="#FFF" /></div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>قائمة المراقبة</span>
        </div>
        <button onClick={() => router.push('/mobile/markets')} style={{ fontSize: 11, color: '#00D4FF', fontWeight: 800, fontFamily: 'var(--f-cairo)', background: 'none', border: 'none', cursor: 'pointer' }}>المزيد</button>
      </div>
      {hotMover && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 10, background: 'rgba(255,183,0,0.04)', border: '0.5px solid rgba(255,183,0,0.1)', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flame size={11} color="#FFB800" /><span style={{ fontSize: 9, fontWeight: 800, color: '#FFB800', fontFamily: 'var(--f-cairo)' }}>أكثر حركة</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{hotMover.s}</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: (hotMover.q?.changePercent ?? 0) >= 0 ? '#32D74B' : '#FF453A', fontFamily: 'var(--f-mono)' }}>{(hotMover.q?.changePercent ?? 0) >= 0 ? '+' : ''}{(hotMover.q?.changePercent ?? 0).toFixed(2)}%</span>
          </div>
        </div>
      )}
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {pairs.map(sym => {
          const q = quotes[sym]
          const changePct = q?.changePercent ?? 0
          const price = q?.price ?? null
          const isUp = changePct >= 0
          const sel = sym === selectedSymbol
          return (
            <div key={sym} onClick={() => { setSelectedSymbol(sym); router.push(`/mobile/chart?symbol=${sym}`) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 6px', borderRadius: 10, background: sel ? 'rgba(0,212,255,0.06)' : 'transparent', border: sel ? '0.5px solid rgba(0,212,255,0.15)' : '0.5px solid transparent', marginBottom: 2, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: sel ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: sel ? '#00D4FF' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--f-mono)', border: sel ? '0.5px solid rgba(0,212,255,0.2)' : '0.5px solid rgba(255,255,255,0.06)' }}>{sym.split('/')[0].slice(0, 2)}</div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{sym}</span>
              </div>
              <div style={{ textAlign: 'left' }}>
                {price !== null ? <div style={{ fontSize: 11, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{price > 100 ? price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(price < 10 ? 4 : 2)}</div> : <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>—</div>}
                {q && <div style={{ fontSize: 9, fontWeight: 800, color: isUp ? '#32D74B' : '#FF453A', fontFamily: 'var(--f-mono)' }}>{isUp ? '+' : ''}{changePct.toFixed(2)}%</div>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ═══ Main Page ═══ */
export default function MobileHome() {
  const tradingMode = useDashboardStore(s => s.mode)
  const account = usePositionsStore(s => s.account)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const modeAccent = MODE_CFG[tradingMode]?.accent || '#00D4FF'

  useEffect(() => { fetchAccount() }, [fetchAccount])
  const buyingPower = useMemo(() => account?.buying_power ? Number(account.buying_power) : 0, [account?.buying_power])

  return (
    <div className="f-page f-stagger">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>رؤى</div>
          <div style={{ fontSize: 10, color: modeAccent, fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>منصة ربط الحسابات</div>
        </div>
        <div style={{ padding: '4px 10px', borderRadius: 8, background: `${modeAccent}12`, border: `0.5px solid ${modeAccent}25` }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: modeAccent, fontFamily: 'var(--f-cairo)' }}>{MODE_CFG[tradingMode]?.label}</span>
        </div>
      </div>

      <Ticker />
      <QuickActions />
      <AgentWidget />
      <AICouncilWidget />
      <WatchlistWidget />
      {buyingPower > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Wallet size={16} color="#00D4FF" />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>قوة الشراء</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>${buyingPower.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </Card>
      )}
      <div style={{ height: 80 }} />
    </div>
  )
}
