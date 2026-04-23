'use client'

import { useState, useEffect } from 'react'
import { Zap, ShieldCheck, ChevronDown, ChevronUp, Calculator } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMarketStore } from '@/hooks/useMarketStore'

export function QuickExecutionMini() {
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const [localSymbol, setLocalSymbol] = useState(selectedSymbol)
  const [account, setAccount] = useState<{ cash: number; buyingPower: number } | null>(null)

  // Sync when global symbol changes
  useEffect(() => { setLocalSymbol(selectedSymbol) }, [selectedSymbol])

  // Load Alpaca account balance on mount
  useEffect(() => {
    fetch('/api/alpaca/account')
      .then(r => r.json())
      .then(j => { if (j.success) setAccount({ cash: j.data.cash, buyingPower: j.data.buyingPower }) })
      .catch(() => {})
  }, [])

  const [quantity, setQuantity] = useState('0.1')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [riskPct, setRiskPct] = useState('1') // % of account balance to risk
  const [showRiskCalc, setShowRiskCalc] = useState(false)
  const [status, setStatus] = useState<{ msg: string; type: 'success' | 'error' | 'loading' | 'confirm' | '' }>({ msg: '', type: '' })
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<'buy' | 'sell' | null>(null)

  // Live price from market store for risk calculations
  const globalQuotes = useMarketStore(state => state.quotes)
  const currentPrice = globalQuotes[localSymbol]?.price ?? 0

  // Risk Calculator: auto-compute position size
  const riskAmount = account ? (account.cash * (parseFloat(riskPct) / 100)) : 0
  const slPips = stopLoss && currentPrice > 0 ? Math.abs(currentPrice - parseFloat(stopLoss)) : null
  const autoQty = slPips && slPips > 0 ? (riskAmount / slPips).toFixed(4) : null
  const potentialLoss = slPips && parseFloat(quantity) > 0 ? (slPips * parseFloat(quantity)) : null
  const potentialGain = takeProfit && currentPrice > 0 && parseFloat(quantity) > 0
    ? Math.abs(parseFloat(takeProfit) - currentPrice) * parseFloat(quantity) : null
  const rrRatio = potentialGain && potentialLoss && potentialLoss > 0
    ? (potentialGain / potentialLoss).toFixed(2) : null


  const validateAndConfirm = (side: 'buy' | 'sell') => {
    if (!localSymbol) {
      setStatus({ msg: '❌ يرجى إدخال رمز الأصل', type: 'error' });
      setTimeout(() => setStatus({ msg: '', type: '' }), 3000);
      return;
    }
    const qtyNum = parseFloat(quantity)
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setStatus({ msg: '❌ الكمية غير صالحة', type: 'error' });
      setTimeout(() => setStatus({ msg: '', type: '' }), 3000);
      return;
    }

    setPendingAction(side);
    setStatus({ 
      msg: `تأكيد عملية ${side === 'buy' ? 'الشراء' : 'البيع'} لـ ${quantity} من ${localSymbol}؟`, 
      type: 'confirm' 
    });
  }

  const executeOrder = async () => {
    if (!pendingAction || !localSymbol || !quantity) return
    const side = pendingAction
    setLoading(true)
    setStatus({ msg: `⏳ جارٍ إرسال أمر ${side === 'buy' ? 'شراء' : 'بيع'} عبر Alpaca...`, type: 'loading' })

    try {
      const body: Record<string, any> = {
        symbol:   localSymbol,
        side,
        qty:      parseFloat(quantity),
        type:     'market',
      }
      if (stopLoss)   body.stop_loss   = parseFloat(stopLoss)
      if (takeProfit) body.take_profit = parseFloat(takeProfit)

      const res = await fetch('/api/alpaca/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const j = await res.json()

      if (j.success) {
        setLastOrder(j)
        const filled = j.filledAvgPrice
          ? ` بسعر $${parseFloat(j.filledAvgPrice).toFixed(2)}`
          : ''
        setStatus({
          msg:  `✅ تمت عملية ${side === 'buy' ? 'شراء' : 'بيع'} ${j.qty} ${j.symbol}${filled}\nرقم الأمر: ${j.orderId?.slice(0,8)}...`,
          type: 'success',
        })
        // Refresh account balance
        fetch('/api/alpaca/account').then(r=>r.json()).then(j => {
          if (j.success) setAccount({ cash: j.data.cash, buyingPower: j.data.buyingPower })
        })
      } else {
        setStatus({ msg: `❌ ${j.error || 'فشل التنفيذ'}`, type: 'error' })
      }
    } catch {
      setStatus({ msg: '❌ خطأ في الشبكة — تعذّر الوصول للمزود', type: 'error' })
    } finally {
      setLoading(false)
      setPendingAction(null)
      setTimeout(() => setStatus({ msg: '', type: '' }), 5000)
    }
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      padding: '12px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxSizing: 'border-box', position: 'relative',
      background: 'var(--bg)'
    }}>
      {/* Alpaca Paper Trading Badge + Balance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.2)',
          borderRadius: 6, padding: '3px 8px',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00C853', boxShadow: '0 0 6px #00C853' }} />
          <span style={{ fontSize: 9, fontWeight: 800, color: '#00C853', fontFamily: "'JetBrains Mono', monospace" }}>حساب تجريبي (PAPER)</span>
        </div>
        {account && (
          <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
            القوة الشرائية: <span style={{ color: 'var(--success)', fontWeight: 700 }}>${account.cash.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
          </div>
        )}
      </div>

      {/* Symbol & Quantity Wrapper */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 800 }}>الأصل</label>
          <input 
            value={localSymbol}
            onChange={e => setLocalSymbol(e.target.value.toUpperCase())}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--card-border)'
              setSelectedSymbol(localSymbol)
            }}
            aria-label="Symbol"
            className="number-data"
            style={{
              width: '100%', background: 'var(--surface)', border: '1px solid var(--card-border)',
              borderRadius: 10, color: 'var(--foreground)', fontSize: 13, padding: '12px',
              fontFamily: 'var(--mono)', outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box', fontWeight: 700
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 800 }}>الكمية</label>
          <input 
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            type="number" step="0.01" min="0.01"
            aria-label="Quantity"
            className="number-data"
            style={{
              width: '100%', background: 'var(--surface)', border: '1px solid var(--card-border)',
              borderRadius: 10, color: 'var(--foreground)', fontSize: 13, padding: '12px',
              fontFamily: 'var(--mono)', outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box', fontWeight: 700
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--card-border)'}
          />
        </div>
      </div>

      {/* TP & SL Wrapper */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'var(--success)', fontWeight: 800 }}>جني أرباح</label>
          <input 
            value={takeProfit}
            onChange={e => setTakeProfit(e.target.value)}
            placeholder="0.00"
            type="number" step="0.1"
            aria-label="Take Profit"
            className="number-data"
            style={{
              width: '100%', background: 'rgba(0,200,83,0.05)', border: '1px solid rgba(0,200,83,0.15)',
              borderRadius: 10, color: 'var(--success)', fontSize: 13, padding: '12px',
              fontFamily: 'var(--mono)', outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box', fontWeight: 700
            }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'var(--danger)', fontWeight: 800 }}>وقف خسارة</label>
          <input 
            value={stopLoss}
            onChange={e => setStopLoss(e.target.value)}
            placeholder="0.00"
            type="number" step="0.1"
            aria-label="Stop Loss"
            className="number-data"
            style={{
              width: '100%', background: 'rgba(255,59,48,0.05)', border: '1px solid rgba(255,59,48,0.15)',
              borderRadius: 10, color: 'var(--danger)', fontSize: 13, padding: '12px',
              fontFamily: 'var(--mono)', outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box', fontWeight: 700
            }}
          />
        </div>
      </div>

      {/* ── Risk Calculator ── */}
      <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 8 }}>
        <button
          onClick={() => setShowRiskCalc(v => !v)}
          style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', color: 'var(--muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calculator size={12} color="var(--accent)" />
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Cairo', sans-serif" }}>حاسبة المخاطرة</span>
          </div>
          {showRiskCalc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showRiskCalc && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Risk % slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>نسبة المخاطرة:</span>
              <input
                type="range" min="0.1" max="10" step="0.1"
                value={riskPct}
                onChange={e => setRiskPct(e.target.value)}
                style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)', fontFamily: 'monospace', minWidth: 36, textAlign: 'left' }}>
                {riskPct}%
              </span>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[
                { label: 'مبلغ المخاطرة', value: account ? `$${riskAmount.toFixed(0)}` : '—', color: 'var(--danger)' },
                { label: 'الكمية المثلى', value: autoQty ?? (currentPrice > 0 ? `~${(riskAmount / currentPrice).toFixed(4)}` : '—'), color: 'var(--accent)' },
                { label: 'نسبة المكاسب/خسائر', value: rrRatio ? `${rrRatio}:1` : '—', color: parseFloat(rrRatio ?? '0') >= 2 ? 'var(--success)' : 'var(--warning)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: 'var(--surface)', borderRadius: 8, padding: '6px 8px',
                  border: '1px solid var(--card-border)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color, fontFamily: 'monospace' }}>{value}</div>
                  <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* P&L preview */}
            {(potentialGain !== null || potentialLoss !== null) && (
              <div style={{ display: 'flex', gap: 6 }}>
                {potentialGain !== null && (
                  <div style={{ flex: 1, background: 'rgba(0,200,83,0.07)', borderRadius: 8, padding: '6px 8px', border: '1px solid rgba(0,200,83,0.2)', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--success)', fontFamily: 'monospace' }}>+${potentialGain.toFixed(2)}</div>
                    <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>جني أرباح مقدّر</div>
                  </div>
                )}
                {potentialLoss !== null && (
                  <div style={{ flex: 1, background: 'rgba(255,59,48,0.07)', borderRadius: 8, padding: '6px 8px', border: '1px solid rgba(255,59,48,0.2)', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--danger)', fontFamily: 'monospace' }}>-${potentialLoss.toFixed(2)}</div>
                    <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>وقف خسارة مقدّر</div>
                  </div>
                )}
              </div>
            )}

            {autoQty && (
              <button
                onClick={() => setQuantity(autoQty)}
                style={{
                  fontSize: 10, padding: '5px', borderRadius: 6, border: '1px dashed var(--accent)',
                  background: 'rgba(0,229,255,0.06)', color: 'var(--accent)', cursor: 'pointer',
                  fontWeight: 700, fontFamily: "'Cairo', sans-serif",
                }}
              >
                ← تطبيق الكمية المثلى ({autoQty})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
        <button 
          onClick={() => validateAndConfirm('buy')}
          disabled={loading}
          className="btn-neon-buy"
          style={{
            flex: 1, height: 44, borderRadius: 'var(--radius)', 
            fontSize: 13, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: "'Cairo', sans-serif",
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'transform 0.1s', opacity: loading ? 0.7 : 1,
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Zap size={14} fill="white" />
          شراء
        </button>
        <button 
          onClick={() => validateAndConfirm('sell')}
          disabled={loading}
          className="btn-neon-sell"
          style={{
            flex: 1, height: 44, borderRadius: 'var(--radius)', 
            fontSize: 13, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: "'Cairo', sans-serif",
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'transform 0.1s', opacity: loading ? 0.7 : 1,
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Zap size={14} fill="white" />
          بيع
        </button>
      </div>

      {/* Status Overlay */}
      {status.msg && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,17,19,0.94)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
          color: status.type === 'success' ? 'var(--success)' : status.type === 'error' ? 'var(--danger)' : 'var(--foreground)',
          backdropFilter: 'blur(8px)', zIndex: 20, borderRadius: 12,
          padding: 24, textAlign: 'center', lineHeight: 1.5
        }}>
          <div>{status.msg}</div>
          
          {status.type === 'confirm' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button 
                onClick={executeOrder}
                style={{
                  background: 'var(--success)', border: 'none', borderRadius: 4,
                  padding: '6px 16px', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo', sans-serif"
                }}
              >
                تأكيد
              </button>
              <button 
                onClick={() => setStatus({ msg: '', type: '' })}
                style={{
                  background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '6px 16px', color: 'var(--foreground)', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo', sans-serif"
                }}
              >
                إلغاء
              </button>
            </div>
          )}
        </div>
      )}

      {/* Safety Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0.6, marginTop: 4 }}>
        <ShieldCheck size={12} color="var(--success)" />
        <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)' }}>تداول مؤسسي مشفر 256-bit</span>
      </div>
    </div>
  )
}
