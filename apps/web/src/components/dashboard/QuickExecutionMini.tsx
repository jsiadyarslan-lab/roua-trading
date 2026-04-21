'use client'

import { useState } from 'react'

const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  border:  'rgba(10,132,255,0.12)',
  blue:    '#0A84FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  text:    '#E6EBF5',
  text2:   '#8090A8',
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
          price: 0, // API will fetch current price if 0/null
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          takeProfit: takeProfit ? parseFloat(takeProfit) : null
        })
      })
      const j = await res.json()
      if (j.success) {
        setStatus({ msg: `تم تنفيذ ${side}`, type: 'success' })
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
      padding: '6px 8px',
      display: 'flex', flexDirection: 'column', gap: 6,
      boxSizing: 'border-box', position: 'relative'
    }}>
      {/* inputs block */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input 
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          placeholder="الرمز"
          style={{
            flex: 1.5, background: T.bg2, border: `0.5px solid ${T.border}`,
            borderRadius: 4, color: T.text, fontSize: 10, padding: '4px 6px',
            fontFamily: "'JetBrains Mono', monospace", outline: 'none',
            minWidth: 0, width: '100%'
          }}
        />
        <input 
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          placeholder="الكمية"
          type="number" step="0.01" min="0.01"
          style={{
            flex: 1, background: T.bg2, border: `0.5px solid ${T.border}`,
            borderRadius: 4, color: T.text, fontSize: 10, padding: '4px 6px',
            fontFamily: "'JetBrains Mono', monospace", outline: 'none',
            minWidth: 0, width: '100%'
          }}
        />
      </div>

      {/* Risk Management block */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input 
          value={takeProfit}
          onChange={e => setTakeProfit(e.target.value)}
          placeholder="جني أرباح TP"
          type="number" step="0.01" min="0"
          style={{
            flex: 1, background: T.bg2, border: `0.5px solid ${T.border}`,
            borderRadius: 4, color: T.green, fontSize: 10, padding: '4px 6px',
            fontFamily: "'JetBrains Mono', monospace", outline: 'none',
            minWidth: 0, width: '100%'
          }}
        />
        <input 
          value={stopLoss}
          onChange={e => setStopLoss(e.target.value)}
          placeholder="وقف خسارة SL"
          type="number" step="0.01" min="0"
          style={{
            flex: 1, background: T.bg2, border: `0.5px solid ${T.border}`,
            borderRadius: 4, color: T.red, fontSize: 10, padding: '4px 6px',
            fontFamily: "'JetBrains Mono', monospace", outline: 'none',
            minWidth: 0, width: '100%'
          }}
        />
      </div>

      {/* buttons block */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button 
          onClick={() => executeOrder('BUY')}
          disabled={loading}
          style={{
            flex: 1, height: 28, borderRadius: 4, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: `${T.green}18`, color: T.green,
            borderBottom: `1px solid ${T.green}40`,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 800,
            transition: 'background 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = `${T.green}30`}
          onMouseLeave={e => e.currentTarget.style.background = `${T.green}18`}
        >
          BUY
        </button>
        <button 
          onClick={() => executeOrder('SELL')}
          disabled={loading}
          style={{
            flex: 1, height: 28, borderRadius: 4, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: `${T.red}18`, color: T.red,
            borderBottom: `1px solid ${T.red}40`,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 800,
            transition: 'background 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = `${T.red}30`}
          onMouseLeave={e => e.currentTarget.style.background = `${T.red}18`}
        >
          SELL
        </button>
      </div>

      {/* Status Msg Overlay */}
      {status.msg && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: T.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
          color: status.type === 'success' ? T.green : status.type === 'error' ? T.red : T.text2,
          backdropFilter: 'blur(2px)', zIndex: 10, borderRadius: 4
        }}>
          {status.msg}
        </div>
      )}
    </div>
  )
}
