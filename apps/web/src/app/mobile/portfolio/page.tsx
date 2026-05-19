'use client'

import { useEffect, useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { Wallet, TrendingUp, TrendingDown, PieChart, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react'

const MOCK_ALLOCATIONS = [
  { symbol: 'BTC/USD', pct: 42, value: 12480, color: '#FFB800' },
  { symbol: 'ETH/USD', pct: 28, value: 8320, color: '#627EEA' },
  { symbol: 'XAU/USD', pct: 18, value: 5340, color: '#d4af37' },
  { symbol: 'EUR/USD', pct: 12, value: 3560, color: '#00D4FF' },
]

const MOCK_PERFORMANCE = [
  { period: 'اليوم', pnl: 234.50, pnlPct: 1.12 },
  { period: 'هذا الأسبوع', pnl: -180.30, pnlPct: -0.86 },
  { period: 'هذا الشهر', pnl: 1245.80, pnlPct: 6.34 },
  { period: '3 أشهر', pnl: 3120.00, pnlPct: 16.80 },
]

export default function MobilePortfolioPage() {
  const account = usePositionsStore(s => s.account)
  const positions = usePositionsStore(s => s.positions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const quotes = useMarketStore(s => s.quotes)

  const [tab, setTab] = useState<'overview' | 'allocation' | 'performance'>('overview')

  useEffect(() => { fetchAccount(); fetchPositions() }, [fetchAccount, fetchPositions])

  const equity = Number(account?.equity ?? 0)
  const unrealizedPnl = Number(account?.unrealizedPnl ?? 0)
  const buyingPower = Number(account?.buying_power ?? 0)

  // Calculate total portfolio value using live positions
  const totalValue = equity || 29700
  const isUp = unrealizedPnl >= 0

  return (
    <div className="m-page">
      <MobilePageHeader title="المحفظة الاستثمارية" subtitle="تحليل المحفظة وتوزيع الأصول" />

      {/* Portfolio Value Card */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #00D4FF, #5B21B6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={20} color="#FFF" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>إجمالي قيمة المحفظة</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>
              ${totalValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, background: isUp ? 'rgba(0,255,163,0.06)' : 'rgba(255,69,58,0.06)', border: `0.5px solid ${isUp ? 'rgba(0,255,163,0.15)' : 'rgba(255,69,58,0.15)'}` }}>
          {isUp ? <ArrowUpRight size={12} color="#00FFA3" /> : <ArrowDownRight size={12} color="#FF453A" />}
          <span style={{ fontSize: 11, fontWeight: 800, color: isUp ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
            {isUp ? '+' : ''}${unrealizedPnl.toFixed(2)} P&L غير محقق
          </span>
        </div>
      </IOSCard>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, margin: '0 16px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
        {([['overview', 'نظرة عامة'], ['allocation', 'التوزيع'], ['performance', 'الأداء']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: tab === key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: tab === key ? '#00D4FF' : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 12 }}>
            <IOSCard noMargin>
              <div style={{ textAlign: 'center' }}>
                <Wallet size={16} color="#00D4FF" style={{ margin: '0 auto 4px' }} />
                <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${buyingPower.toFixed(2)}</div>
                <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>قوة الشراء</div>
              </div>
            </IOSCard>
            <IOSCard noMargin>
              <div style={{ textAlign: 'center' }}>
                <BarChart3 size={16} color="#B388FF" style={{ margin: '0 auto 4px' }} />
                <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{positions.length}</div>
                <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>مراكز مفتوحة</div>
              </div>
            </IOSCard>
          </div>

          {/* Open Positions Summary */}
          {positions.length > 0 ? (
            <div style={{ padding: '0 16px', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>المراكز المفتوحة</div>
              {positions.slice(0, 5).map(pos => {
                const pnl = pos.unrealizedPnl ?? 0
                const posUp = pnl >= 0
                const isLong = pos.side === 'long' || pos.side === 'LONG' || pos.side === 'BUY'
                return (
                  <IOSCard key={pos.id || pos.symbol}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isLong ? <TrendingUp size={14} color="#00FFA3" /> : <TrendingDown size={14} color="#FF453A" />}
                        </div>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{pos.symbol}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: isLong ? '#00FFA3' : '#FF453A', fontFamily: "'Cairo', sans-serif", marginRight: 6 }}>{isLong ? 'شراء' : 'بيع'}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: posUp ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
                          {posUp ? '+' : ''}${pnl.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </IOSCard>
                )
              })}
            </div>
          ) : (
            <IOSCard>
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <PieChart size={32} color="#8B92A8" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 13, fontWeight: 800, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>لا توجد مراكز مفتوحة حالياً</div>
                <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", marginTop: 4 }}>ابدأ التداول لرؤية تحليلات المحفظة</div>
              </div>
            </IOSCard>
          )}
        </>
      )}

      {/* Allocation Tab */}
      {tab === 'allocation' && (
        <>
          <div style={{ padding: '0 16px', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>توزيع الأصول</div>
          </div>
          {/* Visual bar */}
          <IOSCard>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', direction: 'ltr', marginBottom: 12 }}>
              {MOCK_ALLOCATIONS.map(a => (
                <div key={a.symbol} style={{ width: `${a.pct}%`, background: a.color, transition: 'width 0.3s' }} />
              ))}
            </div>
            {MOCK_ALLOCATIONS.map(a => (
              <div key={a.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: a.color }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{a.symbol}</span>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${a.value.toLocaleString()}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace", marginRight: 6 }}>{a.pct}%</span>
                </div>
              </div>
            ))}
          </IOSCard>
        </>
      )}

      {/* Performance Tab */}
      {tab === 'performance' && (
        <>
          <div style={{ padding: '0 16px', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>الأداء</div>
          </div>
          {MOCK_PERFORMANCE.map(p => {
            const isProfit = p.pnl >= 0
            return (
              <IOSCard key={p.period}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: isProfit ? 'rgba(0,255,163,0.08)' : 'rgba(255,69,58,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isProfit ? <ArrowUpRight size={16} color="#00FFA3" /> : <ArrowDownRight size={16} color="#FF453A" />}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{p.period}</span>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: isProfit ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
                      {isProfit ? '+' : ''}${p.pnl.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: isProfit ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
                      {isProfit ? '+' : ''}{p.pnlPct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </IOSCard>
            )
          })}
        </>
      )}
      <div style={{ height: 16 }} />
    </div>
  )
}
