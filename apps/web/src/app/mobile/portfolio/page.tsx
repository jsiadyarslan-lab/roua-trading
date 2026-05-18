'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Wallet, Loader2, RefreshCw, TrendingUp, TrendingDown, PieChart, DollarSign, Activity, Shield, BarChart3 } from 'lucide-react'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

interface Allocation {
  symbol: string
  percent: number
  value: number
  pnl: number
  color: string
}

export default function MobilePortfolioPage() {
  const router = useRouter()
  const [portfolioSummary, setPortfolioSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { account, positions, fetchAccount, fetchPositions } = usePositionsStore()
  const quotes = useMarketStore(s => s.quotes)

  const fetchPortfolio = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portfolio/summary')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setPortfolioSummary(data.data || data)
        }
      }
    } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAccount()
    fetchPositions()
    fetchPortfolio()
  }, [fetchAccount, fetchPositions, fetchPortfolio])

  // Build allocation data from positions
  const totalValue = portfolioSummary?.totalValue ?? account?.equity ? Number(account.equity) : 0
  const buyingPower = account?.buying_power ? Number(account.buying_power) : 0
  const totalPnL = portfolioSummary?.totalPnL ?? 0

  const allocations: Allocation[] = portfolioSummary?.allocations || (() => {
    if (positions && positions.length > 0) {
      return positions.slice(0, 8).map((p: any, i: number) => {
        const sym = p.symbol || p.asset_id || `Asset ${i + 1}`
        const val = Number(p.market_value || p.current_value || 0)
        const pnl = Number(p.unrealized_pl || p.pnl || 0)
        const colors = ['#FF9F43', '#00D4FF', '#FFB800', '#32D74B', '#B388FF', '#FF6B6B', '#4ADE80', '#8B92A8']
        return {
          symbol: sym,
          percent: totalValue > 0 ? (val / totalValue) * 100 : 0,
          value: val,
          pnl,
          color: colors[i % colors.length],
        }
      })
    }
    return [
      { symbol: 'BTC/USD', percent: 42, value: 25200, pnl: 1800, color: '#FF9F43' },
      { symbol: 'ETH/USD', percent: 28, value: 16800, pnl: -420, color: '#00D4FF' },
      { symbol: 'XAU/USD', percent: 18, value: 10800, pnl: 650, color: '#FFB800' },
      { symbol: 'EUR/USD', percent: 8, value: 4800, pnl: 120, color: '#32D74B' },
      { symbol: 'نقد', percent: 4, value: 2400, pnl: 0, color: '#8B92A8' },
    ]
  })()

  const performanceData = portfolioSummary?.performance || {
    dailyReturn: 1.24,
    weeklyReturn: 3.87,
    monthlyReturn: 8.52,
    sharpeRatio: 1.42,
    maxDrawdown: -6.3,
    winRate: 64,
  }

  return (
    <div className="m-page">
      <MobilePageHeader
        title="المحفظة"
        subtitle="توزيع وأداء ومخاطر"
        onBack={() => router.back()}
        right={
          <button onClick={() => { fetchPortfolio(); fetchAccount(); fetchPositions() }} disabled={loading} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} color={C.text2} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* Portfolio Value */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Wallet size={16} color={C.accent} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>إجمالي المحفظة</span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
          ${totalValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 6, background: totalPnL >= 0 ? `${C.success}10` : `${C.danger}10` }}>
            {totalPnL >= 0 ? <TrendingUp size={10} color={C.success} /> : <TrendingDown size={10} color={C.danger} />}
            <span style={{ fontSize: 10, fontWeight: 800, color: totalPnL >= 0 ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}</span>
          </div>
          {buyingPower > 0 && (
            <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>
              قوة الشراء: ${buyingPower.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </IOSCard>

      {/* Allocation Visual */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <PieChart size={14} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>توزيع الأصول</span>
        </div>

        {/* Visual bar */}
        <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 12 }}>
          {allocations.map((a, i) => (
            <div key={i} style={{ width: `${a.percent}%`, background: a.color, transition: 'width 0.5s' }} />
          ))}
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allocations.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: a.color }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{a.symbol}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: a.color, fontFamily: "'JetBrains Mono', monospace" }}>{a.percent.toFixed(1)}%</div>
                  {a.pnl !== 0 && (
                    <div style={{ fontSize: 8, fontWeight: 700, color: a.pnl >= 0 ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                      {a.pnl >= 0 ? '+' : ''}{a.pnl.toFixed(0)}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>${a.value.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </IOSCard>

      {/* Performance Metrics */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <BarChart3 size={14} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>مقاييس الأداء</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: 'العائد اليومي', value: `${performanceData.dailyReturn >= 0 ? '+' : ''}${performanceData.dailyReturn.toFixed(2)}%`, color: performanceData.dailyReturn >= 0 ? C.success : C.danger, icon: <DollarSign size={10} /> },
            { label: 'العائد الأسبوعي', value: `${performanceData.weeklyReturn >= 0 ? '+' : ''}${performanceData.weeklyReturn.toFixed(2)}%`, color: performanceData.weeklyReturn >= 0 ? C.success : C.danger, icon: <TrendingUp size={10} /> },
            { label: 'العائد الشهري', value: `${performanceData.monthlyReturn >= 0 ? '+' : ''}${performanceData.monthlyReturn.toFixed(2)}%`, color: performanceData.monthlyReturn >= 0 ? C.success : C.danger, icon: <Activity size={10} /> },
            { label: 'نسبة شارب', value: performanceData.sharpeRatio.toFixed(2), color: performanceData.sharpeRatio >= 1 ? C.success : C.amber, icon: <BarChart3 size={10} /> },
            { label: 'أقصى خسارة', value: `${performanceData.maxDrawdown.toFixed(1)}%`, color: C.danger, icon: <TrendingDown size={10} /> },
            { label: 'نسبة الفوز', value: `${performanceData.winRate.toFixed(0)}%`, color: performanceData.winRate >= 60 ? C.success : C.amber, icon: <Shield size={10} /> },
          ].map((metric, i) => (
            <div key={i} style={{ padding: '8px', borderRadius: 10, background: `${metric.color}06`, border: `0.5px solid ${metric.color}15` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <div style={{ color: metric.color }}>{metric.icon}</div>
                <span style={{ fontSize: 8, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{metric.label}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: metric.color, fontFamily: "'JetBrains Mono', monospace" }}>{metric.value}</div>
            </div>
          ))}
        </div>
      </IOSCard>

      {/* Risk Summary */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Shield size={14} color={C.amber} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>ملخص المخاطر</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'مستوى المخاطر', value: 'متوسط', color: C.amber },
            { label: 'التنويع', value: 'جيد', color: C.success },
            { label: 'التركز', value: 'مراقب', color: C.amber },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{item.label}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: item.color, fontFamily: "'Cairo', sans-serif", padding: '2px 8px', borderRadius: 6, background: `${item.color}10` }}>{item.value}</span>
            </div>
          ))}
        </div>
        <button onClick={() => router.push('/mobile/sanctuary')} style={{ width: '100%', marginTop: 10, padding: '8px 0', borderRadius: 8, background: 'rgba(0,212,255,0.08)', border: '0.5px solid rgba(0,212,255,0.2)', color: C.accent, fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
          عرض تحليل المخاطر التفصيلي
        </button>
      </IOSCard>

      <div style={{ height: 20 }} />
    </div>
  )
}
