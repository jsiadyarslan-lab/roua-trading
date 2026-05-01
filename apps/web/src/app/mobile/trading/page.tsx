'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  ChevronLeft, ArrowUpRight, ArrowDownRight, Plus, Minus,
  ToggleLeft, ToggleRight, Target, TrendingUp, TrendingDown,
  Clock, Loader2, CheckCircle, AlertCircle, Zap
} from 'lucide-react'
import SlideToConfirm from '@/components/mobile/SlideToConfirm'

/* ─── Design Tokens ─── */
const c = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
}

/* ─── Popular Pairs ─── */
const PAIRS = [
  { symbol: 'BTC/USD', price: 94250, change: 2.4 },
  { symbol: 'ETH/USD', price: 3420, change: -1.2 },
  { symbol: 'SOL/USD', price: 178.5, change: 5.8 },
  { symbol: 'GOLD', price: 2340, change: 0.3 },
  { symbol: 'EUR/USD', price: 1.0845, change: -0.1 },
  { symbol: 'AAPL', price: 189.2, change: 1.1 },
  { symbol: 'TSLA', price: 245.8, change: -2.3 },
  { symbol: 'XRP/USD', price: 2.34, change: 3.2 },
]

/* ─── Recent Orders Mock ─── */
const RECENT_ORDERS = [
  { id: '1', pair: 'BTC/USD', side: 'buy', qty: '0.05', price: '$94,180', time: 'منذ 5 دقائق', status: 'filled' },
  { id: '2', pair: 'ETH/USD', side: 'sell', qty: '2.0', price: '$3,435', time: 'منذ 20 دقيقة', status: 'filled' },
  { id: '3', pair: 'SOL/USD', side: 'buy', qty: '50', price: '$176.20', time: 'منذ ساعة', status: 'pending' },
  { id: '4', pair: 'GOLD', side: 'sell', qty: '2', price: '$2,338', time: 'منذ 3 ساعات', status: 'filled' },
]

/* ─── iOS Card ─── */
function IOSCard({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        background: highlight
          ? 'linear-gradient(165deg, rgba(35,35,45,0.9) 0%, rgba(20,20,25,0.9) 100%)'
          : 'rgba(28,28,30,0.65)',
        backdropFilter: 'blur(40px) saturate(190%)',
        WebkitBackdropFilter: 'blur(40px) saturate(190%)',
        borderRadius: 28,
        padding: 20,
        margin: '0 20px 16px',
        border: '0.5px solid rgba(255,255,255,0.1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: highlight
          ? '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)'
          : '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
      }}
    >
      {highlight && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
          background: `linear-gradient(90deg, transparent, ${c.accent}66, transparent)`,
          zIndex: 10,
        }} />
      )}
      {children}
    </motion.div>
  )
}

/* ─── Main Page ─── */
export default function TradingPage() {
  const router = useRouter()

  // Trading state
  const [selectedPair, setSelectedPair] = useState(PAIRS[0])
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('0.01')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [limitPrice, setLimitPrice] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [executing, setExecuting] = useState(false)
  const [executed, setExecuted] = useState(false)
  const [execError, setExecError] = useState('')

  // Calculate order value
  const qty = parseFloat(quantity) || 0
  const orderValue = qty * selectedPair.price

  const handleExecute = () => {
    if (qty <= 0) return
    setExecuting(true)
    setExecError('')
    setTimeout(() => {
      setExecuting(false)
      setExecuted(true)
      setTimeout(() => {
        setExecuted(false)
        setQuantity('0.01')
        setTakeProfit('')
        setStopLoss('')
      }, 2000)
    }, 2000)
  }

  const adjustQty = (delta: number) => {
    const current = parseFloat(quantity) || 0
    const newVal = Math.max(0, current + delta)
    setQuantity(newVal.toFixed(newVal < 1 ? 4 : 2))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', direction: 'rtl', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: side === 'buy'
          ? 'linear-gradient(180deg, rgba(50,215,75,0.06), transparent)'
          : 'linear-gradient(180deg, rgba(255,69,58,0.06), transparent)',
        transition: '0.3s',
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => router.back()}
          style={{
            width: 40, height: 40, borderRadius: 14,
            background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `0.5px solid ${c.border}`,
          }}
        >
          <ChevronLeft size={20} color={c.text} />
        </motion.button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif", flex: 1 }}>التداول المباشر</h1>
      </div>

      {/* ── Pair Selector (Horizontal Scroll) ── */}
      <div style={{
        display: 'flex', gap: 8, padding: '0 20px 16px',
        overflowX: 'auto', direction: 'ltr',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {PAIRS.map((pair) => {
          const isActive = selectedPair.symbol === pair.symbol
          const isUp = pair.change >= 0
          return (
            <motion.button
              key={pair.symbol}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedPair(pair)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '10px 16px', borderRadius: 16, minWidth: 80,
                background: isActive ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
                border: isActive ? `1px solid rgba(0,212,255,0.3)` : `0.5px solid ${c.border}`,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, color: isActive ? c.accent : c.text, fontFamily: "'JetBrains Mono', monospace" }}>
                {pair.symbol}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: isUp ? c.success : c.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                {isUp ? '+' : ''}{pair.change.toFixed(1)}%
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* ── Current Price Display ── */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{selectedPair.symbol}</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: c.text, fontFamily: "'JetBrains Mono', monospace", letterSpacing: -1, marginTop: 2 }}>
              {selectedPair.price < 10
                ? selectedPair.price.toFixed(4)
                : selectedPair.price.toLocaleString('en', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div style={{
            padding: '8px 14px', borderRadius: 14,
            background: selectedPair.change >= 0 ? `${c.success}15` : `${c.danger}15`,
            border: `0.5px solid ${selectedPair.change >= 0 ? `${c.success}30` : `${c.danger}30`}`,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {selectedPair.change >= 0 ? <TrendingUp size={16} color={c.success} /> : <TrendingDown size={16} color={c.danger} />}
            <span style={{ fontSize: 14, fontWeight: 800, color: selectedPair.change >= 0 ? c.success : c.danger, fontFamily: "'JetBrains Mono', monospace" }}>
              {selectedPair.change >= 0 ? '+' : ''}{selectedPair.change}%
            </span>
          </div>
        </div>

        {/* ── Buy/Sell Toggle ── */}
        <div style={{
          display: 'flex', gap: 8, padding: 4,
          background: 'rgba(255,255,255,0.03)', borderRadius: 16,
        }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setSide('buy')}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 14,
              background: side === 'buy' ? c.success : 'transparent',
              color: side === 'buy' ? '#000' : c.text2,
              fontSize: 15, fontWeight: 900, fontFamily: "'Cairo', sans-serif",
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: '0.2s',
            }}
          >
            <ArrowUpRight size={18} />
            شراء
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setSide('sell')}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 14,
              background: side === 'sell' ? c.danger : 'transparent',
              color: side === 'sell' ? '#FFF' : c.text2,
              fontSize: 15, fontWeight: 900, fontFamily: "'Cairo', sans-serif",
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: '0.2s',
            }}
          >
            <ArrowDownRight size={18} />
            بيع
          </motion.button>
        </div>
      </IOSCard>

      {/* ── Order Settings ── */}
      <IOSCard>
        {/* Market/Limit Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif" }}>نوع الأمر</span>
          <div style={{
            display: 'flex', gap: 6, padding: 3,
            background: 'rgba(255,255,255,0.03)', borderRadius: 12,
          }}>
            <button
              onClick={() => setOrderType('market')}
              style={{
                padding: '6px 14px', borderRadius: 10,
                background: orderType === 'market' ? c.accent : 'transparent',
                color: orderType === 'market' ? '#000' : c.text2,
                fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                border: 'none', cursor: 'pointer', transition: '0.2s',
              }}
            >
              سوقي
            </button>
            <button
              onClick={() => setOrderType('limit')}
              style={{
                padding: '6px 14px', borderRadius: 10,
                background: orderType === 'limit' ? c.accent : 'transparent',
                color: orderType === 'limit' ? '#000' : c.text2,
                fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                border: 'none', cursor: 'pointer', transition: '0.2s',
              }}
            >
              محدد
            </button>
          </div>
        </div>

        {/* Limit Price (only when limit) */}
        {orderType === 'limit' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ marginBottom: 14 }}
          >
            <label style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 6 }}>سعر الحد</label>
            <input
              value={limitPrice}
              onChange={e => setLimitPrice(e.target.value)}
              placeholder={selectedPair.price.toString()}
              type="number"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 14,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                color: c.text, fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
                outline: 'none', direction: 'ltr', textAlign: 'left',
              }}
            />
          </motion.div>
        )}

        {/* Quantity Input with +/- */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 6 }}>الكمية</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => adjustQty(selectedPair.price > 1000 ? -0.01 : -1)}
              style={{
                width: 44, height: 44, borderRadius: 14,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <Minus size={18} color={c.text} />
            </motion.button>
            <input
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              type="number"
              style={{
                flex: 1, padding: '12px 14px', borderRadius: 14,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                color: c.text, fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                outline: 'none', direction: 'ltr', textAlign: 'center',
              }}
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => adjustQty(selectedPair.price > 1000 ? 0.01 : 1)}
              style={{
                width: 44, height: 44, borderRadius: 14,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <Plus size={18} color={c.text} />
            </motion.button>
          </div>
        </div>

        {/* Quick Qty Buttons */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {['25%', '50%', '75%', '100%'].map(pct => (
            <motion.button
              key={pct}
              whileTap={{ scale: 0.95 }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${c.border}`,
                color: c.text2, fontSize: 11, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer',
              }}
            >
              {pct}
            </motion.button>
          ))}
        </div>

        {/* TP/SL Inputs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Target size={12} color={c.success} />
              <label style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>جني الأرباح (TP)</label>
            </div>
            <input
              value={takeProfit}
              onChange={e => setTakeProfit(e.target.value)}
              placeholder="اختياري"
              type="number"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                color: c.text, fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                outline: 'none', direction: 'ltr', textAlign: 'left',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Target size={12} color={c.danger} />
              <label style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>وقف الخسارة (SL)</label>
            </div>
            <input
              value={stopLoss}
              onChange={e => setStopLoss(e.target.value)}
              placeholder="اختياري"
              type="number"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                color: c.text, fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                outline: 'none', direction: 'ltr', textAlign: 'left',
              }}
            />
          </div>
        </div>
      </IOSCard>

      {/* ── Order Summary ── */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Zap size={16} color={c.accent} />
          <span style={{ fontSize: 14, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>ملخص الأمر</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>الزوج</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{selectedPair.symbol}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>الاتجاه</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: side === 'buy' ? c.success : c.danger, fontFamily: "'Cairo', sans-serif" }}>
              {side === 'buy' ? 'شراء' : 'بيع'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>النوع</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif" }}>
              {orderType === 'market' ? 'سوقي' : 'محدد'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>الكمية</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{quantity}</span>
          </div>
          <div style={{ height: 1, background: c.border, margin: '4px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>القيمة الإجمالية</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: side === 'buy' ? c.success : c.danger, fontFamily: "'JetBrains Mono', monospace" }}>
              ${orderValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </IOSCard>

      {/* ── Execute with SlideToConfirm ── */}
      <div style={{ margin: '0 20px 24px' }}>
        {executed ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              padding: '16px', borderRadius: 18,
              background: `${c.success}15`, border: `1px solid ${c.success}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            <CheckCircle size={24} color={c.success} />
            <span style={{ fontSize: 16, fontWeight: 900, color: c.success, fontFamily: "'Cairo', sans-serif" }}>
              تم تنفيذ أمر ال{side === 'buy' ? 'شراء' : 'بيع'} بنجاح!
            </span>
          </motion.div>
        ) : executing ? (
          <div style={{
            padding: '16px', borderRadius: 18,
            background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <Loader2 size={24} className="animate-spin" color={c.accent} />
            <span style={{ fontSize: 14, fontWeight: 800, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>جاري التنفيذ...</span>
          </div>
        ) : (
          <SlideToConfirm
            onConfirm={handleExecute}
            label={`اسحب لتنفيذ أمر ال${side === 'buy' ? 'شراء' : 'بيع'}`}
            color={side === 'buy' ? c.success : c.danger}
          />
        )}
      </div>

      {/* ── Recent Orders ── */}
      <div style={{ padding: '0 20px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>أوامر حديثة</h2>
        <Clock size={16} color={c.text2} />
      </div>

      <IOSCard>
        {RECENT_ORDERS.length > 0 ? (
          RECENT_ORDERS.map((order) => (
            <div key={order.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0', borderBottom: `0.5px solid ${c.border}`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: order.side === 'buy' ? `${c.success}15` : `${c.danger}15`,
                border: `0.5px solid ${order.side === 'buy' ? `${c.success}25` : `${c.danger}25`}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {order.side === 'buy' ? <ArrowUpRight size={16} color={c.success} /> : <ArrowDownRight size={16} color={c.danger} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{order.pair}</span>
                  <span style={{ fontSize: 10, color: order.side === 'buy' ? c.success : c.danger, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
                    {order.side === 'buy' ? 'شراء' : 'بيع'}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{order.qty} @ {order.price}</span>
              </div>
              <div style={{ textAlign: 'left' }}>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: order.status === 'filled' ? c.success : c.amber,
                  fontFamily: "'Cairo', sans-serif",
                  padding: '3px 8px', borderRadius: 6,
                  background: order.status === 'filled' ? `${c.success}15` : `${c.amber}15`,
                }}>
                  {order.status === 'filled' ? 'مكتمل' : 'معلّق'}
                </span>
                <p style={{ fontSize: 9, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 3 }}>{order.time}</p>
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <Clock size={24} color={c.text2} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 8 }}>لا توجد أوامر حديثة</p>
          </div>
        )}
      </IOSCard>

    </div>
  )
}
