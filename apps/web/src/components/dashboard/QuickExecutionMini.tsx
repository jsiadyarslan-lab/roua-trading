'use client'

import { useState, useEffect } from 'react'
import { Zap, ShieldCheck } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'

export function QuickExecutionMini() {
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const [localSymbol, setLocalSymbol] = useState(selectedSymbol)
  
  // Sync when global changes, but allow local typing before commit
  useEffect(() => {
    setLocalSymbol(selectedSymbol)
  }, [selectedSymbol])
  
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
          symbol: localSymbol,
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
      padding: '16px',
      display: 'flex', flexDirection: 'column', gap: 14,
      boxSizing: 'border-box', position: 'relative',
      background: 'var(--bg)'
    }}>
      {/* Symbol & Quantity Wrapper */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 800 }}>الأصل (SYMBOL)</label>
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
          <label style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 800 }}>الكمية (SIZE)</label>
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
          <label style={{ fontSize: 9, color: 'var(--success)', fontWeight: 800 }}>جني أرباح (TP)</label>
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
          <label style={{ fontSize: 9, color: 'var(--danger)', fontWeight: 800 }}>وقف خسارة (SL)</label>
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

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
        <button 
          onClick={() => executeOrder('BUY')}
          disabled={loading}
          className="btn-buy"
          style={{
            flex: 1, height: 48, borderRadius: 12, border: 'none', 
            fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: "'Cairo', sans-serif",
            boxShadow: '0 8px 16px rgba(0,200,83,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'transform 0.1s'
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Zap size={16} fill="white" />
          شراء (BUY)
        </button>
        <button 
          onClick={() => executeOrder('SELL')}
          disabled={loading}
          className="btn-sell"
          style={{
            flex: 1, height: 48, borderRadius: 12, border: 'none', 
            fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: "'Cairo', sans-serif",
            boxShadow: '0 8px 16px rgba(255,59,48,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'transform 0.1s'
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Zap size={16} fill="white" />
          بيع (SELL)
        </button>
      </div>

      {/* Status Overlay */}
      {status.msg && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,17,19,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
          color: status.type === 'success' ? 'var(--success)' : status.type === 'error' ? 'var(--danger)' : 'var(--foreground)',
          backdropFilter: 'blur(8px)', zIndex: 20, borderRadius: 12,
          padding: 24, textAlign: 'center', lineHeight: 1.5
        }}>
          {status.msg}
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
