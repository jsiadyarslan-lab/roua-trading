'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Zap, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown } from 'lucide-react'
import { useDashboardStore } from '@/lib/dashboard-store'

const mockPositions = [
  { pair: 'BTC/USD', type: 'BUY' as const, pnl: '+$234', pnlPct: '+0.23%', entry: '67,120' },
  { pair: 'EUR/USD', type: 'SELL' as const, pnl: '-$56', pnlPct: '-0.06%', entry: '1.0852' },
  { pair: 'XAU/USD', type: 'BUY' as const, pnl: '+$89', pnlPct: '+0.09%', entry: '2,341' },
]

export default function OrderPanel() {
  const { selectedPair } = useDashboardStore()
  const [quantity, setQuantity] = useState('0.01')
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [submitting, setSubmitting] = useState<'buy' | 'sell' | null>(null)

  const bidPrice = selectedPair === 'BTC/USD' ? '67,230.50' : '1.0845'
  const askPrice = selectedPair === 'BTC/USD' ? '67,237.80' : '1.0849'

  const submitOrder = async (side: 'BUY' | 'SELL') => {
    if (!stopLoss) {
      alert('وقف الخسارة إجباري — لا يمكن تنفيذ الطلب بدونه')
      return
    }

    setSubmitting(side === 'BUY' ? 'buy' : 'sell')
    try {
      const idempotencyKey = `roua-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const response = await fetch('/api/trading/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchangeCredentialId: 'cred-paper-001',
          symbol: selectedPair,
          side,
          type: 'MARKET',
          quantity: parseFloat(quantity),
          stopLoss: parseFloat(stopLoss),
          takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
          idempotencyKey,
        }),
      })

      if (response.status === 201) {
        const data = await response.json()
        console.log('Order accepted:', data)
        setStopLoss('')
        setTakeProfit('')
      } else if (response.status === 409) {
        console.warn('Duplicate order (409 Conflict)')
      } else if (response.status === 403) {
        const data = await response.json()
        console.warn('Risk rejected:', data)
      } else {
        console.error('Order failed:', response.status)
      }
    } catch (err) {
      console.error('Network error:', err)
    }
    setSubmitting(null)
  }

  const inputStyle = {
    width: '100%',
    borderRadius: '6px',
    padding: '5px 8px',
    fontSize: '10.5px',
    outline: 'none',
    background: 'var(--bg-input)',
    color: 'var(--text-main)',
    fontFamily: 'var(--font-mono), monospace',
    border: '1px solid var(--border-subtle)',
    transition: 'border-color 0.15s',
  } as React.CSSProperties

  return (
    <div style={{
      borderRadius: '10px',
      overflow: 'hidden',
      flexShrink: 0,
      border: '1px solid var(--border)',
      background: 'var(--bg-card)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '7px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--warning), #FF8C00)',
        }}>
          <Zap size={11} stroke="#fff" strokeWidth={2.2} />
        </div>
        <span style={{
          flex: '1 1 0%',
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '0.04em',
          fontFamily: 'var(--font-ar), Inter, sans-serif',
          color: 'var(--text-main)',
        }}>تداول سريع</span>
        <span dir="ltr" style={{
          fontSize: '10px',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent)',
          background: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)',
          padding: '1px 7px',
          borderRadius: '6px',
        }}>{selectedPair}</span>
      </div>

      <div style={{ padding: '8px 10px' }}>
        {/* BID/ASK Display */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
          <div style={{
            background: 'var(--profit-bg)',
            border: '1px solid var(--border-profit)',
            borderRadius: '7px',
            padding: '6px 8px',
            textAlign: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '2px' }}>
              <ArrowUpRight size={9} style={{ color: 'var(--profit)' }} />
              <span style={{ fontSize: '8.5px', fontWeight: 700, color: 'var(--profit)', fontFamily: 'var(--font-mono)' }}>BID</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--profit)' }} dir="ltr">{bidPrice}</div>
          </div>
          <div style={{
            background: 'var(--loss-bg)',
            border: '1px solid var(--border-loss)',
            borderRadius: '7px',
            padding: '6px 8px',
            textAlign: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '2px' }}>
              <ArrowDownRight size={9} style={{ color: 'var(--loss)' }} />
              <span style={{ fontSize: '8.5px', fontWeight: 700, color: 'var(--loss)', fontFamily: 'var(--font-mono)' }}>ASK</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--loss)' }} dir="ltr">{askPrice}</div>
          </div>
        </div>

        {/* Input Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div>
            <label style={{ fontSize: '9.5px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', display: 'block', marginBottom: '3px' }}>الكمية</label>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              style={inputStyle}
              dir="ltr"
            />
          </div>
          <div>
            <label style={{ fontSize: '9.5px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', display: 'block', marginBottom: '3px' }}>جني الأرباح <span style={{ color: 'var(--text-faint)' }}>(اختياري)</span></label>
            <input
              type="text"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder="اختياري"
              style={inputStyle}
              dir="ltr"
            />
          </div>
          <div>
            <label style={{ fontSize: '9.5px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', display: 'block', marginBottom: '3px' }}>
              وقف الخسارة <span style={{ color: 'var(--loss)' }}>*</span>
            </label>
            <input
              type="text"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="إجباري"
              style={{
                ...inputStyle,
                border: stopLoss ? '1px solid var(--border-subtle)' : '1px solid var(--border-loss)',
                boxShadow: stopLoss ? 'none' : '0 0 6px rgba(255,77,77,0.15)',
              }}
              dir="ltr"
            />
          </div>
        </div>

        {/* Buy/Sell Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
          <motion.button
            style={{
              padding: '7px 0',
              borderRadius: '7px',
              fontSize: '11px',
              fontWeight: 800,
              fontFamily: 'var(--font-ar), Inter, sans-serif',
              background: 'var(--profit)',
              color: '#fff',
              boxShadow: 'var(--glow-profit)',
              border: 'none',
              cursor: 'pointer',
              opacity: submitting === 'buy' ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 16px #00FFC64d' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => submitOrder('BUY')}
            disabled={submitting !== null}
          >
            <TrendingUp size={12} />
            {submitting === 'buy' ? 'جارٍ التنفيذ...' : 'شراء'}
          </motion.button>
          <motion.button
            style={{
              padding: '7px 0',
              borderRadius: '7px',
              fontSize: '11px',
              fontWeight: 800,
              fontFamily: 'var(--font-ar), Inter, sans-serif',
              background: 'var(--loss)',
              color: '#fff',
              boxShadow: 'var(--glow-loss)',
              border: 'none',
              cursor: 'pointer',
              opacity: submitting === 'sell' ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 16px #FF4D4D4d' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => submitOrder('SELL')}
            disabled={submitting !== null}
          >
            <TrendingDown size={12} />
            {submitting === 'sell' ? 'جارٍ التنفيذ...' : 'بيع'}
          </motion.button>
        </div>

        {/* Mandatory SL Warning */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
          <AlertTriangle size={9} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ fontSize: '8.5px', fontWeight: 600, color: 'var(--warning)', fontFamily: 'var(--font-ar)' }}>وقف الخسارة إجباري — حماية رأس المال أولاً</span>
        </div>
      </div>

      {/* Open Positions Mini List */}
      <div style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '8px 10px',
        flex: 1,
        overflowY: 'auto',
        minHeight: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>الصفقات المفتوحة</span>
          <span style={{ fontSize: '8px', fontWeight: 700, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', padding: '0px 5px', borderRadius: '6px' }}>{mockPositions.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {mockPositions.map((pos) => (
            <div key={pos.pair} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 7px',
              borderRadius: '6px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: pos.type === 'BUY' ? 'var(--profit-bg)' : 'var(--loss-bg)',
                  border: `1px solid ${pos.type === 'BUY' ? 'var(--border-profit)' : 'var(--border-loss)'}`,
                }}>
                  {pos.type === 'BUY'
                    ? <TrendingUp size={9} style={{ color: 'var(--profit)' }} />
                    : <TrendingDown size={9} style={{ color: 'var(--loss)' }} />
                  }
                </div>
                <div>
                  <div dir="ltr" style={{ fontSize: '9.5px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{pos.pair}</div>
                </div>
              </div>
              <div style={{ textAlign: 'end' }}>
                <div style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: pos.pnl.startsWith('+') ? 'var(--profit)' : 'var(--loss)',
                }} dir="ltr">{pos.pnl}</div>
                <div style={{
                  fontSize: '8px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  color: pos.pnl.startsWith('+') ? 'var(--profit)' : 'var(--loss)',
                  background: pos.pnl.startsWith('+') ? 'var(--profit-bg)' : 'var(--loss-bg)',
                  padding: '0px 4px',
                  borderRadius: '3px',
                  display: 'inline-block',
                }} dir="ltr">{pos.pnlPct}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
