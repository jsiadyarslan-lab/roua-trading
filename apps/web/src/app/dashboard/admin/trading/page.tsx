'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp,
  BarChart3,
  DollarSign,
  Activity,
  Bot,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Package,
  AlertCircle,
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

interface PositionData {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: string
  entryPrice: string
  currentPrice: string | null
  unrealizedPnl: string
  stopLoss: string | null
  takeProfit: string | null
  exchange: string
  openedAt: string
}

interface TradeData {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  type: string
  quantity: string
  price: string
  pnl: string | null
  exchange: string
  executedAt: string
}

interface BotData {
  id: string
  name: string
  strategy: string
  isActive: boolean
  winRate: string
  totalTrades: number
  dailyPnl: string
  statusMessage: string
  updatedAt: string
}

interface TradingStats {
  totalPnl: number
  activePositions: number
  pendingOrders: number
  dailyTrades: number
  winRate: number
}

interface TradingData {
  positions: PositionData[]
  recentTrades: TradeData[]
  stats: TradingStats
  bots: BotData[]
  error?: string
}

async function fetchTradingData(): Promise<TradingData> {
  const res = await fetch('/dashboard/admin/api/trading/stats')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export default function AdminTradingPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TradingData>({
    positions: [],
    recentTrades: [],
    stats: { totalPnl: 0, activePositions: 0, pendingOrders: 0, dailyTrades: 0, winRate: 0 },
    bots: [],
  })

  const load = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const json = await fetchTradingData()
      if (json.error) {
        setError(json.error)
      }
      setData(json)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const { positions, recentTrades, stats, bots } = data

  // Compute the primary bot (first active, or first overall)
  const primaryBot = bots.find(b => b.isActive) || bots[0]

  const totalPnl = stats.totalPnl

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>إدارة التداول</h1>
            <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>جاري تحميل البيانات...</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ ...CARD_STYLE, padding: 16, height: 68 }}>
              <div style={{ background: 'rgba(0,229,255,0.04)', borderRadius: 6, height: '100%', animation: 'pulse 1.5s infinite' }} />
            </div>
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>إدارة التداول</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>المراكز النشطة والأوامر ومحرك البوت</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            border: `1px solid ${COLORS.border}`, background: 'rgba(0,229,255,0.06)',
            color: COLORS.accent, fontSize: 12, fontWeight: 600,
            fontFamily: "'Cairo', sans-serif", cursor: refreshing ? 'wait' : 'pointer',
            opacity: refreshing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'جاري التحديث...' : 'تحديث'}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 8,
          background: `${COLORS.danger}10`, border: `1px solid ${COLORS.danger}30`,
          color: COLORS.danger, fontSize: 12, fontFamily: "'Cairo', sans-serif",
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* P&L Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {[
          { label: 'إجمالي P&L', value: `$${totalPnl.toLocaleString()}`, color: totalPnl >= 0 ? COLORS.success : COLORS.danger, icon: DollarSign, trend: totalPnl >= 0 ? '+' : '' },
          { label: 'المراكز النشطة', value: `${stats.activePositions}`, color: COLORS.accent, icon: Package, trend: '' },
          { label: 'أوامر معلقة', value: `${stats.pendingOrders}`, color: COLORS.amber, icon: Clock, trend: '' },
          { label: 'صفقات اليوم', value: `${stats.dailyTrades}`, color: COLORS.success, icon: BarChart3, trend: stats.winRate > 0 ? `${stats.winRate}%` : '' },
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
              background: primaryBot?.isActive ? `${COLORS.success}10` : `${COLORS.danger}10`,
              border: `1px solid ${primaryBot?.isActive ? COLORS.success + '25' : COLORS.danger + '25'}`,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: primaryBot?.isActive ? COLORS.success : COLORS.danger,
                boxShadow: `0 0 4px ${primaryBot?.isActive ? COLORS.success : COLORS.danger}`,
              }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: primaryBot?.isActive ? COLORS.success : COLORS.danger, fontFamily: "'Cairo', sans-serif" }}>
                {primaryBot?.isActive ? 'نشط' : 'متوقف'}
              </span>
            </div>
          </div>
          <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{primaryBot?.statusMessage || 'لا يوجد بوت'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {[
            { label: 'الاستراتيجية', value: primaryBot?.strategy || '—', color: COLORS.accent },
            { label: 'إجمالي الصفقات', value: `${primaryBot?.totalTrades ?? 0}`, color: COLORS.text },
            { label: 'نسبة النجاح', value: primaryBot ? `${Number(primaryBot.winRate) * 100}%` : '—', color: COLORS.success },
            { label: 'P&L اليومي', value: primaryBot ? `$${Number(primaryBot.dailyPnl).toLocaleString()}` : '—', color: Number(primaryBot?.dailyPnl ?? 0) >= 0 ? COLORS.success : COLORS.danger },
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
            <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>({positions.length})</span>
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }} className="custom-scrollbar">
            {positions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>لا توجد مراكز نشطة</div>
            ) : positions.map((pos) => {
              const pnl = Number(pos.unrealizedPnl || 0)
              const entryPrice = Number(pos.entryPrice || 0)
              const currentPrice = pos.currentPrice ? Number(pos.currentPrice) : null
              const pnlPercent = entryPrice > 0 && currentPrice ? ((currentPrice - entryPrice) / entryPrice) * 100 * (pos.side === 'SELL' ? -1 : 1) : 0
              return (
                <div key={pos.id} style={{
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
                        {Number(pos.quantity).toFixed(Number(pos.quantity) < 1 ? 4 : 2)} @ ${entryPrice.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: pnl >= 0 ? COLORS.success : COLORS.danger,
                    }}>
                      {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                    </div>
                    <div style={{
                      fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                      color: pnlPercent >= 0 ? COLORS.success : COLORS.danger,
                    }}>
                      {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent Trades */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <TrendingUp size={14} color={COLORS.amber} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>الصفقات الأخيرة</span>
            <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>({recentTrades.length})</span>
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }} className="custom-scrollbar">
            {recentTrades.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>لا توجد صفقات</div>
            ) : recentTrades.map((trade) => {
              const pnl = trade.pnl ? Number(trade.pnl) : null
              return (
                <div key={trade.id} style={{
                  padding: '10px 12px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${COLORS.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: trade.side === 'BUY' ? COLORS.success : COLORS.danger,
                    }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.text }} dir="ltr">
                        {trade.symbol} • {trade.side === 'BUY' ? 'شراء' : 'بيع'}
                      </div>
                      <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }} dir="ltr">
                        {trade.type} • {Number(trade.quantity).toFixed(Number(trade.quantity) < 1 ? 4 : 2)} @ ${Number(trade.price).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      fontSize: 9, fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: pnl !== null ? (pnl >= 0 ? COLORS.success : COLORS.danger) : COLORS.muted,
                    }}>
                      {pnl !== null ? `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : '—'}
                    </div>
                    <div style={{ fontSize: 8, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                      {new Date(trade.executedAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .admin-grid-2 { grid-template-columns: 1fr !important; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 2px; }
      `}</style>
    </div>
  )
}
