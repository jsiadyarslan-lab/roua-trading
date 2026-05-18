'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { ensureAuth } from '@/lib/api-fetch'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { Minus, Plus, Target, ShieldAlert, Loader2, CheckCircle, AlertCircle, Zap } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

const PAIRS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'BNB/USD', 'XRP/USD']
type ExecStatus = 'idle' | 'submitting' | 'filled' | 'rejected' | 'error'

export default function MobileTradingPage() {
  const router = useRouter()
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const addPaperTrade = usePaperTradesStore(s => s.addTrade)
  const addNotification = useNotificationStore(s => s.addNotification)
  const refreshAfterTrade = usePositionsStore(s => s.refreshAfterTrade)
  const account = usePositionsStore(s => s.account)

  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market')
  const [quantity, setQuantity] = useState('0.01')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [tpEnabled, setTpEnabled] = useState(false)
  const [slEnabled, setSlEnabled] = useState(false)
  const [tpValue, setTpValue] = useState('')
  const [slValue, setSlValue] = useState('')
  const [execStatus, setExecStatus] = useState<ExecStatus>('idle')
  const [execMessage, setExecMessage] = useState('')
  const [showPairPicker, setShowPairPicker] = useState(false)

  const quoteKey = quotes && selectedSymbol ? Object.keys(quotes).find(k => k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')) : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : null
  const changePercent = quote?.changePercent ?? 0
  const isPositive = changePercent >= 0
  const buyingPower = account?.buying_power ? Number(account.buying_power) : 0

  const adjustQty = (delta: number) => {
    const current = parseFloat(quantity) || 0
    const step = (livePrice && livePrice > 1000) ? 0.01 : (livePrice && livePrice > 10) ? 0.1 : 1
    const newVal = Math.max(0, current + delta * step)
    setQuantity(newVal.toFixed(newVal < 1 ? 4 : newVal < 100 ? 2 : 0))
  }

  const fmtPrice = (p: number | null) => {
    if (!p) return '—'
    if (p > 100) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return p.toFixed(4)
  }

  const validateOrder = (): string | null => {
    const qty = parseFloat(quantity)
    if (!qty || qty <= 0) return 'يرجى إدخال كمية صالحة'
    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) return 'يرجى إدخال سعر الحد'
    if (orderType === 'stop' && (!stopPrice || parseFloat(stopPrice) <= 0)) return 'يرجى إدخال سعر الوقف'
    if (!livePrice || livePrice <= 0) return 'سعر السوق غير متوفر'
    return null
  }

  const executeOrder = async (side: 'buy' | 'sell') => {
    const err = validateOrder()
    if (err) { setExecStatus('error'); setExecMessage(err); setTimeout(() => setExecStatus('idle'), 3000); return }

    setExecStatus('submitting')
    setExecMessage('جارٍ إرسال الأمر...')

    let success = false
    let filledPrice = 0

    try {
      await ensureAuth()
      const credRes = await fetch('/api/portfolio/credentials')
      const credData = await credRes.json()
      const credentials = credData.data || credData.credentials || []
      const credentialId = credentials[0]?.id || credentials[0]?.credentialId

      if (credentialId) {
        const nestBody = {
          credentialId, symbol: selectedSymbol, side: side.toUpperCase(),
          type: orderType.toUpperCase(), quantity: parseFloat(quantity),
          price: orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : undefined,
          stopPrice: orderType === 'stop' && stopPrice ? parseFloat(stopPrice) : undefined,
          stopLoss: slEnabled && slValue ? parseFloat(slValue) : undefined,
          takeProfit: tpEnabled && tpValue ? parseFloat(tpValue) : undefined,
        }
        const res = await fetch('/api/trading/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nestBody) })
        const j = await res.json()
        if (res.ok && j.id) { success = true; filledPrice = j.filledAvgPrice || j.avgFillPrice || livePrice || 0 }
        else if (res.status === 403) { setExecStatus('rejected'); setExecMessage(j.message || 'تم رفض الأمر'); setTimeout(() => setExecStatus('idle'), 5000); return }
        else throw new Error(j.message || 'Error')
      } else { throw new Error('No credentials') }
    } catch {
      try {
        const res = await fetch('/api/alpaca/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: selectedSymbol, side, qty: parseFloat(quantity), type: orderType === 'stop' ? 'stop' : orderType, time_in_force: 'ioc' }) })
        const j = await res.json()
        if (j.success) { success = true; filledPrice = j.filledAvgPrice ? parseFloat(j.filledAvgPrice) : (livePrice || 0) }
        else { setExecStatus('error'); setExecMessage(j.error || 'فشل التنفيذ'); setTimeout(() => setExecStatus('idle'), 4000); return }
      } catch { setExecStatus('error'); setExecMessage('خطأ في الشبكة'); setTimeout(() => setExecStatus('idle'), 4000); return }
    }

    if (success) {
      addPaperTrade({ symbol: selectedSymbol, side: side === 'buy' ? 'long' : 'short', qty: parseFloat(quantity), entryPrice: filledPrice, currentPrice: livePrice || filledPrice, tp: tpEnabled && tpValue ? parseFloat(tpValue) : undefined, sl: slEnabled && slValue ? parseFloat(slValue) : undefined, source: 'manual', entryTime: Date.now() })
      setExecStatus('filled')
      setExecMessage(`تم ${side === 'buy' ? 'شراء' : 'بيع'} ${quantity} ${selectedSymbol} بسعر $${filledPrice.toFixed(2)}`)
      addNotification({ source: 'trade', priority: 'high', action: side === 'buy' ? 'BUY' : 'SELL', title: `تم ${side === 'buy' ? 'شراء' : 'بيع'} ${selectedSymbol}`, body: `${quantity} ${selectedSymbol} @ $${filledPrice.toFixed(2)}`, pair: selectedSymbol, price: filledPrice })
      refreshAfterTrade()
      setTimeout(() => { setExecStatus('idle'); setTpEnabled(false); setSlEnabled(false); setTpValue(''); setSlValue(''); setLimitPrice(''); setStopPrice('') }, 2500)
    }
  }

  return (
    <div className="m-page">
      <MobilePageHeader title="التداول الحي" subtitle="تنفيذ الأوامر مباشرة" />

      {/* Pair Selector */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={() => setShowPairPicker(!showPairPicker)} style={{ fontSize: 16, fontWeight: 900, color: C.accent, fontFamily: "'JetBrains Mono', monospace", background: 'none', border: 'none', cursor: 'pointer' }}>
              {selectedSymbol}
            </button>
            <div style={{ textAlign: 'left', direction: 'ltr' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: isPositive ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPrice(livePrice)}</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: isPositive ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{isPositive ? '+' : ''}{changePercent.toFixed(2)}%</div>
            </div>
          </div>

          {showPairPicker && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {PAIRS.map(pair => (
                <button key={pair} onClick={() => { setSelectedSymbol(pair); setShowPairPicker(false) }} style={{
                  padding: '8px 4px', borderRadius: 8,
                  background: selectedSymbol === pair ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.02)',
                  border: selectedSymbol === pair ? '0.5px solid rgba(0,212,255,0.3)' : `0.5px solid ${C.border}`,
                  color: selectedSymbol === pair ? C.accent : C.text2,
                  fontSize: 10, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                  cursor: 'pointer', textAlign: 'center',
                }}>
                  {pair}
                </button>
              ))}
            </div>
          )}
        </IOSCard>
      </div>

      {/* Buy/Sell Toggle */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 14, padding: 3, display: 'flex', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 3, left: 3, width: 'calc(50% - 3px)', bottom: 3, background: orderSide === 'buy' ? C.success : C.danger, borderRadius: 10, zIndex: 0, transition: 'transform 0.2s', transform: orderSide === 'buy' ? 'translateX(0)' : 'translateX(100%)' }} />
          <button onClick={() => setOrderSide('buy')} style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'buy' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative', cursor: 'pointer' }}>شراء</button>
          <button onClick={() => setOrderSide('sell')} style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'sell' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative', cursor: 'pointer' }}>بيع</button>
        </div>
      </div>

      {/* Order Form */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <IOSCard>
          {/* Order Type */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>نوع الأمر</label>
            <div style={{ display: 'flex', gap: 2, padding: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              {([{ key: 'market' as const, label: 'سوقي' }, { key: 'limit' as const, label: 'محدد' }, { key: 'stop' as const, label: 'وقف' }]).map(ot => (
                <button key={ot.key} onClick={() => setOrderType(ot.key)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, background: orderType === ot.key ? C.accent : 'transparent', color: orderType === ot.key ? '#000' : C.text2, fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer' }}>{ot.label}</button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>الكمية</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => adjustQty(-1)} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Minus size={14} color={C.text} /></button>
              <input value={quantity} onChange={e => setQuantity(e.target.value)} type="number" style={{ flex: 1, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: C.text, fontSize: 13, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr', textAlign: 'center' }} />
              <button onClick={() => adjustQty(1)} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Plus size={14} color={C.text} /></button>
            </div>
          </div>

          {/* Limit/Stop Price */}
          {orderType === 'limit' && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>سعر الحد</label>
              <input value={limitPrice} onChange={e => setLimitPrice(e.target.value)} type="number" placeholder={livePrice?.toString() || '0.00'} style={{ width: '100%', height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: C.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} />
            </div>
          )}
          {orderType === 'stop' && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>سعر الوقف</label>
              <input value={stopPrice} onChange={e => setStopPrice(e.target.value)} type="number" placeholder={livePrice?.toString() || '0.00'} style={{ width: '100%', height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: C.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} />
            </div>
          )}

          {/* TP/SL */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Target size={12} color={C.success} /><span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: "'Cairo', sans-serif" }}>جني الأرباح</span></div>
                <IOSSwitch value={tpEnabled} onChange={setTpEnabled} color={C.success} />
              </div>
              {tpEnabled && <input type="number" placeholder="سعر الهدف..." value={tpValue} onChange={e => setTpValue(e.target.value)} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: '#FFF', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ShieldAlert size={12} color={C.danger} /><span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: "'Cairo', sans-serif" }}>وقف الخسارة</span></div>
                <IOSSwitch value={slEnabled} onChange={setSlEnabled} color={C.danger} />
              </div>
              {slEnabled && <input type="number" placeholder="سعر التوقف..." value={slValue} onChange={e => setSlValue(e.target.value)} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: '#FFF', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} />}
            </div>
          </div>

          {/* Buying Power */}
          {buyingPower > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
              <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>قوة الشراء</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>${buyingPower.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
        </IOSCard>
      </div>

      {/* Execute Button */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        {(execStatus === 'idle' || execStatus === 'error' || execStatus === 'rejected') && (
          <button onClick={() => executeOrder(orderSide)} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: orderSide === 'buy' ? 'linear-gradient(135deg, #32D74B, #28A745)' : 'linear-gradient(135deg, #FF453A, #DC2626)', color: '#FFF', fontSize: 15, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: orderSide === 'buy' ? '0 4px 20px rgba(50,215,75,0.25)' : '0 4px 20px rgba(255,69,58,0.25)' }}>
            <Zap size={18} />
            {orderSide === 'buy' ? 'شراء' : 'بيع'} {selectedSymbol}
          </button>
        )}
        {execStatus === 'submitting' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 14, background: 'rgba(0,212,255,0.08)', border: `0.5px solid rgba(0,212,255,0.2)` }}>
            <Loader2 size={18} className="animate-spin" color={C.accent} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'Cairo', sans-serif" }}>جارٍ التنفيذ...</span>
          </div>
        )}
        {execStatus === 'filled' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 14, background: 'rgba(50,215,75,0.1)' }}>
            <CheckCircle size={18} color={C.success} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.success, fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span>
          </div>
        )}
        {execStatus === 'rejected' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 14, background: 'rgba(255,184,0,0.1)' }}>
            <AlertCircle size={18} color={C.amber} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.amber, fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span>
          </div>
        )}
        {execStatus === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 14, background: 'rgba(255,71,87,0.1)' }}>
            <AlertCircle size={18} color={C.danger} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.danger, fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span>
          </div>
        )}
      </div>

      <div style={{ height: 16 }} />
    </div>
  )
}
