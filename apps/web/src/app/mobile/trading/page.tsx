'use client'

import { useState, useCallback } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { TrendingUp } from 'lucide-react'

export default function MobileTradingPage() {
  const { selectedSymbol } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const account = usePositionsStore(s => s.account)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market')
  const [quantity, setQuantity] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [tp, setTp] = useState('')
  const [sl, setSl] = useState('')
  const [executing, setExecuting] = useState(false)
  const [execMsg, setExecMsg] = useState('')

  const q = quotes[selectedSymbol]
  const price = q?.price ?? 0

  const executeTrade = useCallback(async () => {
    if (!quantity || Number(quantity) <= 0) return
    setExecuting(true)
    setExecMsg('')
    try {
      const payload: Record<string, unknown> = {
        symbol: selectedSymbol, side: side === 'buy' ? 'BUY' : 'SELL',
        type: orderType.toUpperCase(), quantity: Number(quantity), timeInForce: 'GTC',
      }
      if (orderType === 'limit' && limitPrice) payload.limitPrice = Number(limitPrice)
      if (orderType === 'stop' && stopPrice) payload.stopPrice = Number(stopPrice)
      if (tp) payload.takeProfit = Number(tp)
      if (sl) payload.stopLoss = Number(sl)

      const res = await fetch('/api/smart-executor/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
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
    } finally { setExecuting(false) }
  }, [selectedSymbol, side, orderType, quantity, limitPrice, stopPrice, tp, sl])

  return (
    <div className="m-page">
      <MobilePageHeader title="التداول الحي" subtitle="تنفيذ صفقات فورية" />

      <IOSCard>
        {/* Pair info */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: price >= 0 ? '#FFF' : '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>
              {price > 0 ? price.toLocaleString('en', { minimumFractionDigits: price < 10 ? 4 : 2 }) : '—'}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: (q?.changePercent ?? 0) >= 0 ? '#32D74B' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
              {(q?.changePercent ?? 0) >= 0 ? '+' : ''}{(q?.changePercent ?? 0).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Buy/Sell toggle */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 12, overflow: 'hidden' }}>
          <button onClick={() => setSide('buy')} style={{ flex: 1, padding: '12px 0', background: side === 'buy' ? '#00FFA3' : 'rgba(255,255,255,0.04)', border: 'none', color: side === 'buy' ? '#000' : 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>شراء</button>
          <button onClick={() => setSide('sell')} style={{ flex: 1, padding: '12px 0', background: side === 'sell' ? '#FF453A' : 'rgba(255,255,255,0.04)', border: 'none', color: side === 'sell' ? '#FFF' : 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>بيع</button>
        </div>

        {/* Order type */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {(['market', 'limit', 'stop'] as const).map(t => (
            <button key={t} onClick={() => setOrderType(t)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: orderType === t ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)', border: orderType === t ? '0.5px solid rgba(0,212,255,0.2)' : '0.5px solid rgba(255,255,255,0.06)', color: orderType === t ? '#00D4FF' : 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
              {t === 'market' ? 'سوقي' : t === 'limit' ? 'محدد' : 'وقف'}
            </button>
          ))}
        </div>

        {/* Quantity */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>الكمية</label>
          <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {/* Limit/Stop price */}
        {orderType === 'limit' && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>سعر الحد</label>
            <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} placeholder={price.toString()} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box' }} />
          </div>
        )}

        {/* TP/SL */}
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

        {/* Execute */}
        <button onClick={executeTrade} disabled={executing || !quantity} style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: side === 'buy' ? 'linear-gradient(135deg, #00FFA3, #0A84FF)' : 'linear-gradient(135deg, #FF453A, #FF6B6B)', border: 'none', color: side === 'buy' ? '#000' : '#FFF', fontSize: 15, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: executing ? 'wait' : 'pointer', opacity: executing ? 0.6 : 1 }}>
          {executing ? 'جارٍ التنفيذ...' : side === 'buy' ? `شراء ${selectedSymbol}` : `بيع ${selectedSymbol}`}
        </button>
        {execMsg && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: execMsg.startsWith('✅') ? '#00FFA3' : '#FF453A', fontFamily: "'Cairo', sans-serif", textAlign: 'center' }}>{execMsg}</div>}
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
