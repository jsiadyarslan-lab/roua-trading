'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  DollarSign,
  Activity,
  Bot,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Package,
} from 'lucide-react'

const COLORS = {
  bg: '#0B0E14',
  card: '#111318',
  accent: '#00E5FF',
  success: '#00E676',
  danger: '#FF5252',
  amber: '#FFB800',
  text: '#F0F2F5',
  muted: '#8B92A8',
  border: 'rgba(0,229,255,0.08)',
}

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(0,229,255,0.08)',
  borderRadius: 10,
  position: 'relative',
  overflow: 'hidden',
}

interface Position {
  symbol: string
  side: 'BUY' | 'SELL'
  qty: number
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercent: number
}

interface Order {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  type: string
  qty: number
  price: number
  status: string
  time: string
}

export default function AdminTradingPage() {
  const [loading, setLoading] = useState(true)

  const [positions] = useState<Position[]>([
    { symbol: 'BTC/USD', side: 'BUY', qty: 0.5, entryPrice: 62450, currentPrice: 63120, pnl: 335, pnlPercent: 1.07 },
    { symbol: 'ETH/USD', side: 'BUY', qty: 5, entryPrice: 3420, currentPrice: 3395, pnl: -125, pnlPercent: -0.73 },
    { symbol: 'AAPL', side: 'SELL', qty: 10, entryPrice: 189.5, currentPrice: 187.2, pnl: 23, pnlPercent: 0.12 },
    { symbol: 'XAU/USD', side: 'BUY', qty: 2, entryPrice: 2340, currentPrice: 2358, pnl: 36, pnlPercent: 0.77 },
  ])

  const [orders] = useState<Order[]>([
    { id: 'ord-001', symbol: 'BTC/USD', side: 'BUY', type: 'LIMIT', qty: 0.1, price: 62000, status: 'PENDING', time: 'منذ 5 دقائق' },
    { id: 'ord-002', symbol: 'SOL/USD', side: 'SELL', type: 'MARKET', qty: 50, price: 148.5, status: 'FILLED', time: 'منذ 15 دقيقة' },
    { id: 'ord-003', symbol: 'ETH/USD', side: 'BUY', type: 'LIMIT', qty: 2, price: 3400, status: 'PENDING', time: 'منذ 30 دقيقة' },
    { id: 'ord-004', symbol: 'TSLA', side: 'BUY', type: 'MARKET', qty: 5, price: 245.8, status: 'FILLED', time: 'منذ ساعة' },
    { id: 'ord-005', symbol: 'EUR/USD', side: 'SELL', type: 'LIMIT', qty: 10000, price: 1.0845, status: 'CANCELLED', time: 'منذ ساعتين' },
  ])

  const [botStatus] = useState({
    isActive: true,
    strategy: 'Scalp AI',
    totalTrades: 1247,
    winRate: 68.5,
    dailyPnl: 3450,
    statusMessage: 'نشط - يبحث عن فرص',
  })

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800)
    return () => clearTimeout(timer)
  }, [])

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>إدارة التداول</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>المراكز النشطة والأوامر ومحرك البوت</p>
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 8,
          border: `1px solid ${COLORS.border}`, background: 'rgba(0,229,255,0.06)',
          color: COLORS.accent, fontSize: 12, fontWeight: 600,
          fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
        }}>
          <RefreshCw size={14} /> تحديث
        </button>
      </div>

      {/* P&L Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {[
          { label: 'إجمالي P&L', value: `$${totalPnl.toLocaleString()}`, color: totalPnl >= 0 ? COLORS.success : COLORS.danger, icon: DollarSign, trend: totalPnl >= 0 ? '+' : '' },
          { label: 'المراكز النشطة', value: `${positions.length}`, color: COLORS.accent, icon: Package, trend: '' },
          { label: 'أوامر معلقة', value: `${orders.filter(o => o.status === 'PENDING').length}`, color: COLORS.amber, icon: Clock, trend: '' },
          { label: 'صفقات اليوم', value: '87', color: COLORS.success, icon: BarChart3, trend: '+8%' },
        ].map((card, i) => {
          const CardIcon = card.icon
          return (
            <div key={i} style={{ ...CARD_STYLE, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `${card.color}15`,
                border: `1px solid ${card.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CardIcon size={16} color={card.color} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: card.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                  {card.trend && <span style={{ fontSize: 11, marginRight: 4 }}>{card.trend}</span>}
                  {card.value}
                </div>
                <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>{card.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bot Engine Status */}
      <div style={{ ...CARD_STYLE, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={16} color={COLORS.accent} />
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>محرك البوت</span>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 4,
              background: botStatus.isActive ? `${COLORS.success}10` : `${COLORS.danger}10`,
              border: `1px solid ${botStatus.isActive ? COLORS.success + '25' : COLORS.danger + '25'}`,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: botStatus.isActive ? COLORS.success : COLORS.danger,
                boxShadow: `0 0 4px ${botStatus.isActive ? COLORS.success : COLORS.danger}`,
              }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: botStatus.isActive ? COLORS.success : COLORS.danger, fontFamily: "'Cairo', sans-serif" }}>
                {botStatus.isActive ? 'نشط' : 'متوقف'}
              </span>
            </div>
          </div>
          <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{botStatus.statusMessage}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {[
            { label: 'الاستراتيجية', value: botStatus.strategy, color: COLORS.accent },
            { label: 'إجمالي الصفقات', value: `${botStatus.totalTrades}`, color: COLORS.text },
            { label: 'نسبة النجاح', value: `${botStatus.winRate}%`, color: COLORS.success },
            { label: 'P&L اليومي', value: `$${botStatus.dailyPnl.toLocaleString()}`, color: COLORS.success },
          ].map((item, i) => (
            <div key={i} style={{
              padding: '10px 12px', borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Active Positions */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Activity size={14} color={COLORS.accent} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>المراكز النشطة</span>
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {positions.map((pos, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${COLORS.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: pos.side === 'BUY' ? `${COLORS.success}15` : `${COLORS.danger}15`,
                    border: `1px solid ${pos.side === 'BUY' ? COLORS.success + '30' : COLORS.danger + '30'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {pos.side === 'BUY' ? <ArrowUpRight size={12} color={COLORS.success} /> : <ArrowDownRight size={12} color={COLORS.danger} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.text }} dir="ltr">{pos.symbol}</div>
                    <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }} dir="ltr">
                      {pos.qty} @ ${pos.entryPrice.toLocaleString()}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: pos.pnl >= 0 ? COLORS.success : COLORS.danger,
                  }}>
                    {pos.pnl >= 0 ? '+' : ''}${pos.pnl}
                  </div>
                  <div style={{
                    fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                    color: pos.pnlPercent >= 0 ? COLORS.success : COLORS.danger,
                  }}>
                    {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Orders */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <TrendingUp size={14} color={COLORS.amber} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>الأوامر الأخيرة</span>
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {orders.map((order) => (
              <div key={order.id} style={{
                padding: '10px 12px', borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${COLORS.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: order.side === 'BUY' ? COLORS.success : COLORS.danger,
                  }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.text }} dir="ltr">
                      {order.symbol} • {order.side === 'BUY' ? 'شراء' : 'بيع'}
                    </div>
                    <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }} dir="ltr">
                      {order.type} • {order.qty} @ ${order.price}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700,
                    fontFamily: "'Cairo', sans-serif",
                    color: order.status === 'FILLED' ? COLORS.success : order.status === 'PENDING' ? COLORS.amber : COLORS.muted,
                  }}>
                    {order.status === 'FILLED' ? 'منفذ' : order.status === 'PENDING' ? 'معلق' : 'ملغي'}
                  </div>
                  <div style={{ fontSize: 8, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{order.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .admin-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
