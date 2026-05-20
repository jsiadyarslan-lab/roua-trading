'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useBotStore } from '@/hooks/useBotStore'
import { ensureAuth } from '@/lib/api-fetch'
import { Header, Card, Switch, SkelCard, SkelLine } from '@/components/mobile/FluxComponents'
import {
  Cpu, Play, Square, Shield, DollarSign, Activity,
  TrendingUp, TrendingDown, Zap, AlertTriangle,
  ChevronDown, X, Loader2, Flame, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'

/* ═══ Strategy Labels ═══ */
const STRATEGY_LABELS: Record<string, string> = {
  AUTO: 'تلقائي', SCALPING: 'سكالبينغ', SWING: 'سوينغ',
  GRID: 'شبكة', MEAN_REVERSION: 'عودة للمتوسط',
  MOMENTUM_BREAKOUT: 'اختراق الزخم', DCA: 'متوسط التكلفة', VWAP_RSI: 'VWAP+RSI',
}
const STRATEGIES = Object.values(StrategyType)

/* ═══ Trade Pairs ═══ */
const TRADE_PAIRS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD',
  'ADA/USD', 'DOGE/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD',
]

/* ═══ Agent Control Section ═══ */
function AgentControl() {
  const router = useRouter()
  const { agentState, loading, fetchStatus, startAgent, stopAgent, changeStrategy, startAutoRefresh, stopAutoRefresh } = useAgentStore()
  const [showStrategyPicker, setShowStrategyPicker] = useState(false)

  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const strategy = agentState?.config?.strategy ?? StrategyType.AUTO
  const isPaper = agentState?.config?.isPaperTrading ?? false

  useEffect(() => { fetchStatus(); startAutoRefresh(); return () => stopAutoRefresh() }, [fetchStatus, startAutoRefresh, stopAutoRefresh])

  const statusColor = isRunning ? '#00FFA3' : status === AgentStatus.EMERGENCY_STOP ? '#FF4757' : status === AgentStatus.DAILY_LIMIT_REACHED ? '#FFB800' : '#8B92A8'
  const statusLabel = isRunning ? 'يعمل' : status === AgentStatus.EMERGENCY_STOP ? 'إيقاف طارئ' : status === AgentStatus.DAILY_LIMIT_REACHED ? 'حد الخسارة اليومية' : status === AgentStatus.PAUSED ? 'متوقف مؤقتاً' : 'في الانتظار'

  const handleToggle = useCallback(async () => {
    if (isRunning) await stopAgent(false)
    else await startAgent(strategy)
  }, [isRunning, strategy, startAgent, stopAgent])

  const handleStrategyChange = useCallback(async (s: StrategyType) => {
    setShowStrategyPicker(false)
    if (isRunning) {
      await changeStrategy(s)
    }
  }, [isRunning, changeStrategy])

  if (!agentState && loading) return <SkelCard lines={4} />

  return (
    <Card highlight={isRunning}>
      {/* Header */}
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
      </div>

      {/* Status Bar */}
      <div style={{ padding: '8px 12px', borderRadius: 12, background: `${statusColor}08`, border: `0.5px solid ${statusColor}18`, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: statusColor, boxShadow: `0 0 6px ${statusColor}60` }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, fontFamily: 'var(--f-cairo)' }}>{statusLabel}</span>
          {isPaper && isRunning && <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: 'rgba(0,212,255,0.1)', color: '#00D4FF', border: '0.5px solid rgba(0,212,255,0.2)', fontFamily: 'var(--f-cairo)' }}>ورقي</span>}
        </div>
        <button onClick={handleToggle} disabled={loading} style={{ padding: '4px 12px', borderRadius: 8, background: isRunning ? 'rgba(255,71,87,0.1)' : 'linear-gradient(135deg, #00FFC6, #0A84FF)', border: isRunning ? '0.5px solid rgba(255,71,87,0.2)' : 'none', color: isRunning ? '#FF4757' : '#000', fontSize: 9, fontWeight: 800, fontFamily: 'var(--f-cairo)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          {loading ? <Loader2 size={10} className="f-skel" /> : isRunning ? <Square size={10} /> : <Play size={10} />}
          {isRunning ? 'إيقاف' : 'تشغيل'}
        </button>
      </div>

      {/* Strategy Selector */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowStrategyPicker(!showStrategyPicker)} style={{ width: '100%', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: '#FFF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={12} color="#00D4FF" />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>الاستراتيجية</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#00D4FF', fontFamily: 'var(--f-cairo)' }}>{STRATEGY_LABELS[strategy] || strategy}</span>
            <ChevronDown size={12} color="rgba(255,255,255,0.4)" />
          </div>
        </button>
        {showStrategyPicker && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'rgba(26,29,41,0.98)', borderRadius: 10, border: '0.5px solid rgba(0,212,255,0.15)', zIndex: 50, padding: 4, backdropFilter: 'blur(20px)' }}>
            {STRATEGIES.map(s => (
              <button key={s} onClick={() => handleStrategyChange(s)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: strategy === s ? 'rgba(0,212,255,0.08)' : 'transparent', border: 'none', color: strategy === s ? '#00D4FF' : '#FFF', fontSize: 11, fontWeight: 700, fontFamily: 'var(--f-cairo)', cursor: 'pointer', textAlign: 'right', display: 'block' }}>
                {STRATEGY_LABELS[s]}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

/* ═══ Daily Stats ═══ */
function DailyStats() {
  const { agentState } = useAgentStore()
  const dailyPnL = Number(agentState?.dailyPnL ?? 0)
  const dailyTrades = Number(agentState?.dailyTradesCount ?? 0)
  const consecutiveLosses = Number(agentState?.consecutiveLosses ?? 0)

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)', marginBottom: 10 }}>إحصائيات اليوم</div>
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

/* ═══ Quick Trade Panel ═══ */
function QuickTradePanel() {
  const router = useRouter()
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const { addTrade } = usePaperTradesStore()
  const { addNotification } = useNotificationStore()
  const { refreshAfterTrade } = usePositionsStore()
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [qty, setQty] = useState('0.01')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [showPairPicker, setShowPairPicker] = useState(false)

  const quote = quotes[selectedSymbol]
  const livePrice = quote?.price ?? 0

  const executeTrade = useCallback(async () => {
    if (!livePrice || !qty) return
    setSubmitting(true)
    setResult(null)

    try {
      await ensureAuth()
      const parsedQty = parseFloat(qty)
      if (isNaN(parsedQty) || parsedQty <= 0) throw new Error('كمية غير صالحة')

      // Try NestJS API first
      let success = false
      try {
        const res = await fetch('/api/smart-executor/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: selectedSymbol,
            side: side === 'long' ? 'BUY' : 'SELL',
            qty: parsedQty,
            orderType: 'MARKET',
          }),
        })
        const data = await res.json()
        if (data.success) success = true
      } catch { /* NestJS unavailable */ }

      // Record paper trade
      addTrade({
        symbol: selectedSymbol,
        side,
        qty: parsedQty,
        entryPrice: livePrice,
        currentPrice: livePrice,
        strategy: 'manual',
        source: 'manual',
        entryTime: Date.now(),
      })

      addNotification({
        source: 'trade',
        priority: 'high',
        action: side === 'long' ? 'BUY' : 'SELL',
        title: `${side === 'long' ? 'شراء' : 'بيع'} ${selectedSymbol}`,
        body: `${parsedQty} ${selectedSymbol} @ $${livePrice.toLocaleString('en', { minimumFractionDigits: 2 })}`,
        pair: selectedSymbol,
        price: livePrice,
      })

      refreshAfterTrade()
      setResult({ ok: true, msg: `تم تنفيذ ${side === 'long' ? 'الشراء' : 'البيع'} بنجاح` })
    } catch (e: any) {
      setResult({ ok: false, msg: e.message || 'فشل التنفيذ' })
    } finally {
      setSubmitting(false)
    }
  }, [selectedSymbol, side, qty, livePrice, addTrade, addNotification, refreshAfterTrade])

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>تداول سريع</div>
        <button onClick={() => setShowPairPicker(!showPairPicker)} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(0,212,255,0.08)', border: '0.5px solid rgba(0,212,255,0.15)', color: '#00D4FF', fontSize: 10, fontWeight: 800, fontFamily: 'var(--f-mono)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          {selectedSymbol} <ChevronDown size={10} />
        </button>
      </div>

      {/* Pair Picker */}
      {showPairPicker && (
        <div style={{ marginBottom: 10, maxHeight: 150, overflowY: 'auto', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '0.5px solid rgba(255,255,255,0.08)', padding: 4 }}>
          {TRADE_PAIRS.map(p => {
            const q = quotes[p]
            const sel = p === selectedSymbol
            return (
              <button key={p} onClick={() => { setSelectedSymbol(p); setShowPairPicker(false) }} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, background: sel ? 'rgba(0,212,255,0.08)' : 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: '#FFF' }}>
                <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--f-mono)', color: sel ? '#00D4FF' : '#FFF' }}>{p}</span>
                {q && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--f-mono)', color: q.changePercent >= 0 ? '#00FFA3' : '#FF4757' }}>{q.price.toLocaleString('en', { minimumFractionDigits: 2 })}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Live Price */}
      <div style={{ textAlign: 'center', marginBottom: 10, padding: '8px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>السعر الحالي</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>
          {livePrice ? `$${livePrice.toLocaleString('en', { minimumFractionDigits: livePrice < 10 ? 4 : 2 })}` : '—'}
        </div>
        {quote && <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--f-mono)', color: quote.changePercent >= 0 ? '#00FFA3' : '#FF4757' }}>{quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%</div>}
      </div>

      {/* Buy/Sell Toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setSide('long')} style={{ flex: 1, padding: '10px', borderRadius: 10, background: side === 'long' ? 'rgba(0,255,163,0.12)' : 'rgba(255,255,255,0.03)', border: side === 'long' ? '1px solid rgba(0,255,163,0.3)' : '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <ArrowUpRight size={14} color={side === 'long' ? '#00FFA3' : '#8B92A8'} />
          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--f-cairo)', color: side === 'long' ? '#00FFA3' : '#8B92A8' }}>شراء</span>
        </button>
        <button onClick={() => setSide('short')} style={{ flex: 1, padding: '10px', borderRadius: 10, background: side === 'short' ? 'rgba(255,71,87,0.12)' : 'rgba(255,255,255,0.03)', border: side === 'short' ? '1px solid rgba(255,71,87,0.3)' : '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <ArrowDownRight size={14} color={side === 'short' ? '#FF4757' : '#8B92A8'} />
          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--f-cairo)', color: side === 'short' ? '#FF4757' : '#8B92A8' }}>بيع</span>
        </button>
      </div>

      {/* Quantity Input */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--f-cairo)', marginBottom: 4 }}>الكمية</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setQty(String(Math.max(0.001, parseFloat(qty) - 0.01)))} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <input type="number" value={qty} onChange={e => setQty(e.target.value)} style={{ flex: 1, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#FFF', fontSize: 13, fontWeight: 800, fontFamily: 'var(--f-mono)', textAlign: 'center', padding: '0 8px', direction: 'ltr' }} />
          <button onClick={() => setQty(String((parseFloat(qty) + 0.01).toFixed(3)))} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>
      </div>

      {/* Execute Button */}
      <button onClick={executeTrade} disabled={submitting || !livePrice} style={{ width: '100%', padding: '12px', borderRadius: 12, background: side === 'long' ? 'linear-gradient(135deg, #00FFA3, #00D4FF)' : 'linear-gradient(135deg, #FF4757, #FF6B6B)', border: 'none', color: side === 'long' ? '#000' : '#FFF', fontSize: 14, fontWeight: 900, fontFamily: 'var(--f-cairo)', cursor: submitting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: submitting || !livePrice ? 0.6 : 1 }}>
        {submitting ? <Loader2 size={16} className="f-skel" /> : <Zap size={16} />}
        {submitting ? 'جارٍ التنفيذ...' : side === 'long' ? 'شراء الآن' : 'بيع الآن'}
      </button>

      {/* Result Feedback */}
      {result && (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, background: result.ok ? 'rgba(0,255,163,0.08)' : 'rgba(255,71,87,0.08)', border: `0.5px solid ${result.ok ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)'}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: result.ok ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-cairo)' }}>{result.msg}</span>
        </div>
      )}
    </Card>
  )
}

/* ═══ Risk Protection Settings ═══ */
function RiskProtection() {
  const { agentState, updateRiskParams } = useAgentStore()
  const botStore = useBotStore()
  const [maxLoss, setMaxLoss] = useState(String(agentState?.config?.maxDailyLossPercent ?? 5))
  const [maxPos, setMaxPos] = useState(String(agentState?.config?.maxPositionSizePercent ?? 10))
  const [riskPct, setRiskPct] = useState(String(agentState?.config?.riskPerTradePercent ?? 2))
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await updateRiskParams({
        maxDailyLossPercent: parseFloat(maxLoss),
        maxPositionSizePercent: parseFloat(maxPos),
        riskPerTradePercent: parseFloat(riskPct),
      })
    } catch { /* silent */ }
    setSaving(false)
  }, [maxLoss, maxPos, riskPct, updateRiskParams])

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Shield size={16} color="#B388FF" />
        <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>إعدادات الحماية</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Max Daily Loss */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>حد الخسارة اليومية</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>أقصى نسبة خسارة مسموحة</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="number" value={maxLoss} onChange={e => setMaxLoss(e.target.value)} style={{ width: 50, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#FF4757', fontSize: 11, fontWeight: 800, fontFamily: 'var(--f-mono)', textAlign: 'center', direction: 'ltr' }} />
            <span style={{ fontSize: 9, color: '#8B92A8' }}>%</span>
          </div>
        </div>

        {/* Max Position Size */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>حجم المركز الأقصى</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>نسبة رأس المال لكل صفقة</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="number" value={maxPos} onChange={e => setMaxPos(e.target.value)} style={{ width: 50, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#FFB800', fontSize: 11, fontWeight: 800, fontFamily: 'var(--f-mono)', textAlign: 'center', direction: 'ltr' }} />
            <span style={{ fontSize: 9, color: '#8B92A8' }}>%</span>
          </div>
        </div>

        {/* Risk Per Trade */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>المخاطرة لكل صفقة</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>نسبة المخاطرة المسموحة</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="number" value={riskPct} onChange={e => setRiskPct(e.target.value)} style={{ width: 50, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#00D4FF', fontSize: 11, fontWeight: 800, fontFamily: 'var(--f-mono)', textAlign: 'center', direction: 'ltr' }} />
            <span style={{ fontSize: 9, color: '#8B92A8' }}>%</span>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '8px', borderRadius: 8, background: 'rgba(179,136,255,0.1)', border: '0.5px solid rgba(179,136,255,0.2)', color: '#B388FF', fontSize: 11, fontWeight: 800, fontFamily: 'var(--f-cairo)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {saving ? <Loader2 size={12} className="f-skel" /> : <Shield size={12} />}
          {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </div>
    </Card>
  )
}

/* ═══ Trade Log ═══ */
function TradeLog() {
  const { trades, closedTrades } = usePaperTradesStore()
  const recentTrades = useMemo(() => {
    const all = [
      ...trades.map(t => ({ ...t, closed: false })),
      ...closedTrades.map(t => ({ ...t, closed: true })),
    ].sort((a, b) => (b.entryTime ?? b.closeTime ?? 0) - (a.entryTime ?? a.closeTime ?? 0))
    return all.slice(0, 10)
  }, [trades, closedTrades])

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)', marginBottom: 10 }}>سجل الصفقات</div>
      {recentTrades.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Activity size={24} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>لا توجد صفقات بعد</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
          {recentTrades.map(t => {
            const isLong = t.side === 'long'
            const pnl = t.closed ? (t as any).realizedPnl : (t as any).unrealizedPnl ?? 0
            const time = t.closed ? (t as any).closeTime : t.entryTime
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,71,87,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isLong ? <ArrowUpRight size={11} color="#00FFA3" /> : <ArrowDownRight size={11} color="#FF4757" />}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{t.symbol}</div>
                    <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{isLong ? 'شراء' : 'بيع'} · {t.qty}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: pnl >= 0 ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-mono)' }}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 7, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>
                    {t.closed ? 'مغلق' : 'مفتوح'} · {t.source === 'agent' ? 'وكيل' : t.source === 'bot' ? 'بوت' : 'يدوي'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/* ═══ Main Page ═══ */
export default function TradePage() {
  return (
    <div className="f-page f-stagger">
      <Header title="التداول" subtitle="تنفيذ الصفقات والتحكم بالوكيل" />
      <AgentControl />
      <DailyStats />
      <QuickTradePanel />
      <RiskProtection />
      <TradeLog />
      <div style={{ height: 80 }} />
    </div>
  )
}
