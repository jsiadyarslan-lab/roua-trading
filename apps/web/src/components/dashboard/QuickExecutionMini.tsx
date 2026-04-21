'use client'

import { useState } from 'react'

const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  card:    '#111214',
  primary: '#0A84FF',
  accent:  '#00E5FF',
  success: '#00C853',
  danger:  '#FF3B30',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  border:  'rgba(0, 229, 255, 0.08)',
}

export function QuickExecutionMini() {
  const [symbol, setSymbol] = useState('BTC/USD')
  const [quantity, setQuantity] = useState('0.1')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [status, setStatus] = useState<{ msg: string; type: 'success' | 'error' | '' }>({ msg: '', type: '' })
  const [loading, setLoading] = useState(false)

  const executeOrder = async (side: 'BUY' | 'SELL') => {
    if (!symbol || !quantity) return
    setLoading(true)
    setStatus({ msg: 'جاري التنفيذ...', type: '' })
    try {
      const res = await fetch('/api/trading/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side,
          type: 'MARKET',
          quantity: parseFloat(quantity),
          price: 0,
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          takeProfit: takeProfit ? parseFloat(takeProfit) : null
        })
      })
      const j = await res.json()
      if (j.success) {
        setStatus({ msg: `تم تنفيذ ${side === 'BUY' ? 'شراء' : 'بيع'} بنجاح`, type: 'success' })
      } else {
        setStatus({ msg: j.error || 'فشل التنفيذ', type: 'error' })
      }
    } catch {
      setStatus({ msg: 'خطأ في الشبكة', type: 'error' })
    } finally {
      setLoading(false)
      setTimeout(() => setStatus({ msg: '', type: '' }), 3000)
    }
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      padding: '12px',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxSizing: 'border-box', position: 'relative',
      background: T.card
    }}>
      {/* Symbol & Quantity Wrapper */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: T.text2, fontWeight: 600, paddingRight: 2 }}>الأصل</label>
          <input 
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            aria-label="Symbol"
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`,
              borderRadius: 8, color: T.text, fontSize: 11, padding: '8px 10px',
              fontFamily: "'JetBrains Mono', monospace", outline: 'none',
              transition: 'border-color 0.2s', boxSizing: 'border-box'
            }}
            onFocus={e => e.currentTarget.style.borderColor = T.accent}
            onBlur={e => e.currentTarget.style.borderColor = T.border}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: T.text2, fontWeight: 600, paddingRight: 2 }}>الكمية</label>
          <input 
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            type="number" step="0.01" min="0.01"
            aria-label="Quantity"
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`,
              borderRadius: 8, color: T.text, fontSize: 11, padding: '8px 10px',
              fontFamily: "'JetBrains Mono', monospace", outline: 'none',
              transition: 'border-color 0.2s', boxSizing: 'border-box'
            }}
            onFocus={e => e.currentTarget.style.borderColor = T.accent}
            onBlur={e => e.currentTarget.style.borderColor = T.border}
          />
        </div>
      </div>

      {/* TP & SL Wrapper */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: T.success, fontWeight: 700, paddingRight: 2 }}>TP جني أرباح</label>
          <input 
            value={takeProfit}
            onChange={e => setTakeProfit(e.target.value)}
            placeholder="0.00"
            type="number" step="0.01"
            aria-label="Take Profit"
            style={{
              width: '100%', background: 'rgba(0,200,83,0.04)', border: `1px solid rgba(0,200,83,0.15)`,
              borderRadius: 8, color: T.success, fontSize: 11, padding: '8px 10px',
              fontFamily: "'JetBrains Mono', monospace", outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box'
            }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: T.danger, fontWeight: 700, paddingRight: 2 }}>SL وقف خسارة</label>
          <input 
            value={stopLoss}
            onChange={e => setStopLoss(e.target.value)}
            placeholder="0.00"
            type="number" step="0.01"
            aria-label="Stop Loss"
            style={{
              width: '100%', background: 'rgba(255,59,48,0.04)', border: `1px solid rgba(255,59,48,0.15)`,
              borderRadius: 8, color: T.danger, fontSize: 11, padding: '8px 10px',
              fontFamily: "'JetBrains Mono', monospace", outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button 
          onClick={() => executeOrder('BUY')}
          disabled={loading}
          style={{
            flex: 1, height: 42, borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: `linear-gradient(180deg, ${T.success} 0%, #009624 100%)`,
            color: '#fff',
            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 800,
            transition: 'transform 0.1s, filter 0.2s',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(0,200,83,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
        >
          شراء BUY
        </button>
        <button 
          onClick={() => executeOrder('SELL')}
          disabled={loading}
          style={{
            flex: 1, height: 42, borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: `linear-gradient(180deg, ${T.danger} 0%, #CC2D24 100%)`,
            color: '#fff',
            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 800,
            transition: 'transform 0.1s, filter 0.2s',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(255,59,48,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
        >
          بيع SELL
        </button>
      </div>

      {/* Status Overlay */}
      {status.msg && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,17,19,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
          color: status.type === 'success' ? T.success : status.type === 'error' ? T.danger : T.text2,
          backdropFilter: 'blur(4px)', zIndex: 20, borderRadius: 12,
          padding: 20, textAlign: 'center'
        }}>
          {status.msg}
        </div>
      )}
    </div>
  )
}
