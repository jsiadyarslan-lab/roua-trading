'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import {
  ChevronDown, Crosshair, TrendingUp, BarChart3, Pencil,
  MousePointer, Clock, X, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import dynamic from 'next/dynamic'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { ssr: false })

const TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D']
const PAIRS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'EUR/USD', 'GBP/USD', 'XAU/USD']

function ChartContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const account = usePositionsStore(s => s.account)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const [pairOpen, setPairOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market')
  const [quantity, setQuantity] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [tp, setTp] = useState('')
  const [sl, setSl] = useState('')
  const [executing, setExecuting] = useState(false)
  const [execMsg, setExecMsg] = useState('')

  const symbol = searchParams.get('symbol') || selectedSymbol
  const q = quotes[symbol]
  const price = q?.price ?? 0
  const change = q?.changePercent ?? 0
  const isUp = change >= 0

  useEffect(() => { fetchAccount() }, [fetchAccount])

  const executeTrade = useCallback(async () => {
    if (!quantity || Number(quantity) <= 0) return
    setExecuting(true)
    setExecMsg('')
    try {
      const payload: Record<string, unknown> = {
        symbol,
        side: orderSide === 'buy' ? 'BUY' : 'SELL',
        type: orderType.toUpperCase(),
        quantity: Number(quantity),
        timeInForce: 'GTC',
      }
      if (orderType === 'limit' && limitPrice) payload.limitPrice = Number(limitPrice)
      if (orderType === 'stop' && stopPrice) payload.stopPrice = Number(stopPrice)
      if (tp) payload.takeProfit = Number(tp)
      if (sl) payload.stopLoss = Number(sl)

      const res = await fetch('/api/smart-executor/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        setExecMsg('✅ تم تنفيذ الصفقة')
        setQuantity(''); setLimitPrice(''); setStopPrice(''); setTp(''); setSl('')
        usePositionsStore.getState().refreshAfterTrade()
      } else {
        setExecMsg(`❌ ${data.message || 'فشل التنفيذ'}`)
      }
    } catch (e: unknown) {
      setExecMsg(`❌ خطأ: ${e instanceof Error ? e.message : 'غير معروف'}`)
    } finally {
      setExecuting(false)
    }
  }, [symbol, orderSide, orderType, quantity, limitPrice, stopPrice, tp, sl])

  return (
    <div className="m-page--chart" style={{ direction: 'rtl' }}>
      {/* Chart container */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <RouaChart />
      </div>

      {/* Price overlay */}
      <div style={{ position: 'absolute', top: 8, right: 16, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: isUp ? '#32D74B' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
          {price > 0 ? price.toLocaleString('en', { minimumFractionDigits: price < 10 ? 4 : 2 }) : '—'}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: isUp ? '#32D74B' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
          {isUp ? '+' : ''}{change.toFixed(2)}%
        </div>
      </div>

      {/* Pair selector */}
      <div style={{ position: 'absolute', top: 8, left: 16, zIndex: 10, pointerEvents: 'auto' }}>
        <button onClick={() => setPairOpen(!pairOpen)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(11,14,20,0.85)', backdropFilter: 'blur(10px)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', touchAction: 'manipulation' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{symbol}</span>
          <ChevronDown size={14} color="rgba(255,255,255,0.5)" />
        </button>
      </div>

      {/* Pair dropdown */}
      {pairOpen && (
        <div style={{ position: 'absolute', top: 44, left: 16, zIndex: 20, background: 'rgba(26,29,41,0.97)', backdropFilter: 'blur(20px)', borderRadius: 14, border: '0.5px solid rgba(255,255,255,0.1)', padding: 6, maxHeight: 200, overflowY: 'auto', minWidth: 140 }}>
          {PAIRS.map(p => (
            <button key={p} onClick={() => { setSelectedSymbol(p); setPairOpen(false); router.replace(`/mobile/chart?symbol=${p}`) }} style={{ display: 'block', width: '100%', textAlign: 'right', padding: '8px 10px', borderRadius: 8, background: p === symbol ? 'rgba(0,212,255,0.1)' : 'transparent', border: 'none', color: p === symbol ? '#00D4FF' : '#FFF', fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer' }}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ position: 'absolute', top: 44, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'auto' }}>
        <button onClick={() => setOrderOpen(true)} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,255,163,0.1)', border: '0.5px solid rgba(0,255,163,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><TrendingUp size={16} color="#00FFA3" /></button>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Crosshair size={16} color="rgba(255,255,255,0.5)" /></button>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><BarChart3 size={16} color="rgba(255,255,255,0.5)" /></button>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Pencil size={16} color="rgba(255,255,255,0.5)" /></button>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><MousePointer size={16} color="rgba(255,255,255,0.5)" /></button>
      </div>

      {/* Timeframe selector */}
      <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, zIndex: 10, display: 'flex', gap: 4, pointerEvents: 'auto' }}>
        {TIMEFRAMES.map(tf => (
          <button key={tf} onClick={() => setTimeframe(tf)} style={{ flex: 1, padding: '5px 0', borderRadius: 8, background: timeframe === tf ? 'rgba(0,212,255,0.12)' : 'rgba(11,14,20,0.85)', border: timeframe === tf ? '0.5px solid rgba(0,212,255,0.25)' : '0.5px solid rgba(255,255,255,0.06)', color: timeframe === tf ? '#00D4FF' : 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', touchAction: 'manipulation' }}>
            {tf}
          </button>
        ))}
      </div>

      {/* Order Sheet */}
      {orderOpen && (
        <div style={{ position: 'fixed', bottom: 'calc(var(--m-nav-total, 56px) + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, zIndex: 100, background: 'rgba(20,20,28,0.98)', backdropFilter: 'blur(30px)', borderTop: '0.5px solid rgba(0,212,255,0.15)', borderRadius: '20px 20px 0 0', padding: '16px', direction: 'rtl', maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>تنفيذ صفقة</span>
            <button onClick={() => setOrderOpen(false)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color="rgba(255,255,255,0.5)" /></button>
          </div>
          <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 12, overflow: 'hidden' }}>
            <button onClick={() => setOrderSide('buy')} style={{ flex: 1, padding: '10px 0', background: orderSide === 'buy' ? '#00FFA3' : 'rgba(255,255,255,0.04)', border: 'none', color: orderSide === 'buy' ? '#000' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>شراء</button>
            <button onClick={() => setOrderSide('sell')} style={{ flex: 1, padding: '10px 0', background: orderSide === 'sell' ? '#FF453A' : 'rgba(255,255,255,0.04)', border: 'none', color: orderSide === 'sell' ? '#FFF' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>بيع</button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['market', 'limit', 'stop'] as const).map(t => (
              <button key={t} onClick={() => setOrderType(t)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: orderType === t ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)', border: orderType === t ? '0.5px solid rgba(0,212,255,0.2)' : '0.5px solid rgba(255,255,255,0.06)', color: orderType === t ? '#00D4FF' : 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
                {t === 'market' ? 'سوقي' : t === 'limit' ? 'محدد' : 'وقف'}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>الكمية</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {orderType === 'limit' && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>سعر الحد</label>
              <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} placeholder={price.toString()} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box' }} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>جني الأرباح</label>
              <input type="number" value={tp} onChange={e => setTp(e.target.value)} placeholder="—" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>وقف الخسارة</label>
              <input type="number" value={sl} onChange={e => setSl(e.target.value)} placeholder="—" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <button onClick={executeTrade} disabled={executing || !quantity} style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: orderSide === 'buy' ? 'linear-gradient(135deg, #00FFA3, #0A84FF)' : 'linear-gradient(135deg, #FF453A, #FF6B6B)', border: 'none', color: orderSide === 'buy' ? '#000' : '#FFF', fontSize: 15, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: executing ? 'wait' : 'pointer', opacity: executing ? 0.6 : 1 }}>
            {executing ? 'جارٍ التنفيذ...' : orderSide === 'buy' ? `شراء ${symbol}` : `بيع ${symbol}`}
          </button>
          {execMsg && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: execMsg.startsWith('✅') ? '#00FFA3' : '#FF453A', fontFamily: "'Cairo', sans-serif", textAlign: 'center' }}>{execMsg}</div>}
        </div>
      )}
    </div>
  )
}

export default function MobileChartPage() {
  return (
    <Suspense fallback={<div className="m-page--chart" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>جارٍ التحميل...</div></div>}>
      <ChartContent />
    </Suspense>
  )
}
