'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Eye, Shield, Star, TrendingUp, ArrowUpRight, Activity, AlertTriangle, UserCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

type FilterKey = 'performance' | 'risk' | 'popularity'

const TRADERS = [
  { id: '1', name: 'Quantum Alpha', type: 'High Frequency', winRate: '87.5%', profit: '+1,420%', riskKey: 'riskHigh', aum: '$4.2M', score: 95, followers: 1240, drawdown: '-12%' },
  { id: '2', name: 'Institutional Flow', type: 'Macro Swing', winRate: '72.1%', profit: '+310%', riskKey: 'riskMedium', aum: '$12.5M', score: 78, followers: 890, drawdown: '-8%' },
  { id: '3', name: 'Crypto Sniper', type: 'Scalping', winRate: '91.2%', profit: '+840%', riskKey: 'riskVeryHigh', aum: '$1.1M', score: 88, followers: 2100, drawdown: '-22%' },
  { id: '4', name: 'DeFi Yield Master', type: 'Yield Farming', winRate: '68.4%', profit: '+180%', riskKey: 'riskLow', aum: '$8.7M', score: 65, followers: 560, drawdown: '-4%' },
  { id: '5', name: 'Momentum Trader', type: 'Trend Following', winRate: '79.3%', profit: '+560%', riskKey: 'riskMedium', aum: '$3.1M', score: 82, followers: 1680, drawdown: '-15%' },
  { id: '6', name: 'Stable Earn', type: 'Arbitrage', winRate: '94.8%', profit: '+45%', riskKey: 'riskVeryLow', aum: '$22M', score: 70, followers: 320, drawdown: '-2%' },
]

const RISK_ORDER: Record<string, number> = {
  riskVeryLow: 1,
  riskLow: 2,
  riskMedium: 3,
  riskHigh: 4,
  riskVeryHigh: 5,
}

export default function AccountMonitoringPage() {
  const router = useRouter()
  const ct = useTranslations('dashboard.copyTrading')
  const tc = useTranslations('common')
  const [followingTraders, setFollowingTraders] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<FilterKey>('performance')

  const toggleFollow = (traderId: string, traderName: string) => {
    setFollowingTraders(prev => {
      const next = new Set(prev)
      if (next.has(traderId)) {
        next.delete(traderId)
        toast({ title: ct('toastUnfollowed', { name: traderName }), description: ct('toastUnfollowedDesc') })
      } else {
        next.add(traderId)
        toast({ title: ct('toastFollowed', { name: traderName }), description: ct('toastFollowedDesc') })
      }
      return next
    })
  }

  const sortedTraders = [...TRADERS].sort((a, b) => {
    if (activeFilter === 'performance') return b.score - a.score
    if (activeFilter === 'risk') {
      return (RISK_ORDER[a.riskKey] || 3) - (RISK_ORDER[b.riskKey] || 3)
    }
    return b.followers - a.followers
  })

  const filterTabs: { key: FilterKey; icon: typeof TrendingUp; label: string }[] = [
    { key: 'performance', icon: TrendingUp, label: ct('filterPerformance') },
    { key: 'risk', icon: Shield, label: ct('filterRisk') },
    { key: 'popularity', icon: UserCheck, label: ct('filterPopularity') },
  ]

  const riskColor = (riskKey: string) => {
    if (riskKey === 'riskVeryLow' || riskKey === 'riskLow') return '#00FFA3'
    if (riskKey === 'riskMedium') return '#FFB800'
    return '#FF4757'
  }

  return (
    <div className="custom-scrollbar" style={{ padding: '32px 24px', fontFamily: "var(--font-ar)", height: '100%', overflowY: 'auto' }}>
      {/* Demo Disclaimer Banner */}
      <div style={{
        background: `${'#FFB800'}12`, border: `1px solid ${'#FFB800'}35`,
        borderRadius: 'var(--radius-lg)', padding: '12px 18px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <AlertTriangle size={18} color={'#FFB800'} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#FFB800' }}>{tc('demoData')}</span>
        <span style={{ fontSize: 13, color: '#9CA3B5' }}>
          — {tc('disclaimer')}
        </span>
      </div>

      {/* Info Banner */}
      <div style={{
        background: `${'#00D4FF'}10`, border: `1px solid ${'#00D4FF'}30`,
        borderRadius: 'var(--radius-lg)', padding: '12px 18px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Eye size={18} color={'#00D4FF'} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#00D4FF' }}>{ct('title')}</span>
        <span style={{ fontSize: 13, color: '#9CA3B5' }}>
          — {ct('subtitle')}
        </span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Eye size={20} color={'#00FFA3'} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#F0F2F5' }}>{ct('title')}</h1>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-2xl)',
              background: `${'#FFB800'}18`, color: '#FFB800',
              fontFamily: "var(--font-mono)",
            }}>DEMO</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#9CA3B5' }}>
            {ct('subtitle')}
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/portfolio')}
          style={{
            padding: '8px 20px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 800,
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            background: '#151A22', color: '#F0F2F5', border: `1px solid ${'#2A313C'}`,
            transition: 'all 0.2s', fontFamily: "var(--font-ar)",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#00D4FF'; e.currentTarget.style.color = '#00D4FF' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2A313C'; e.currentTarget.style.color = '#F0F2F5' }}
        >
          {tc('portfolio')} <ArrowUpRight size={14} />
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { icon: Star, label: ct('bestAccountThisWeek'), val: 'Quantum Alpha', color: '#FFB800' },
          { icon: Shield, label: ct('totalAum'), val: '--', color: '#0A84FF' },
          { icon: TrendingUp, label: ct('avgMonthlyReturn'), val: '--', color: '#9CA3B5' },
        ].map((f, i) => (
          <div key={i} style={{
            background: '#151A22', border: `0.5px solid ${'#2A313C'}`,
            borderRadius: 'var(--radius-xl)', padding: '20px', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ padding: 12, borderRadius: 'var(--radius-lg)', background: `${f.color}15` }}>
              <f.icon size={24} color={f.color} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#9CA3B5', marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-mono)" }}>{f.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#F0F2F5', margin: 0 }}>{ct('availableAccounts')}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              style={{
                padding: '6px 16px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                background: activeFilter === tab.key ? `${'#00D4FF'}15` : '#151A22',
                border: `1px solid ${activeFilter === tab.key ? `${'#00D4FF'}40` : '#2A313C'}`,
                color: activeFilter === tab.key ? '#00D4FF' : '#9CA3B5',
                transition: 'all 0.2s', fontFamily: "var(--font-ar)",
              }}
            >
              <tab.icon size={13} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trader Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
        {sortedTraders.map((trader) => {
          const isFollowing = followingTraders.has(trader.id)
          const riskLabel = ct(trader.riskKey as any)
          return (
            <div key={trader.id} style={{
              background: '#151A22', border: `1px solid ${isFollowing ? `${'#00FFA3'}35` : '#2A313C'}`,
              borderRadius: 'var(--radius-xl)', padding: 20, transition: 'all 0.2s', cursor: 'pointer',
              boxShadow: isFollowing ? `0 0 20px ${'#00FFA3'}10` : 'none',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: '#151A22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: isFollowing ? `1px solid ${'#00FFA3'}40` : 'none',
                  }}>
                    <Activity size={20} color={isFollowing ? '#00FFA3' : '#00D4FF'} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#F0F2F5', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {trader.name}
                      {isFollowing && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-lg)', background: `${'#00FFA3'}18`, color: '#00FFA3', fontWeight: 800 }}>{ct('following')}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3B5' }}>{trader.type}</div>
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-2xl)', background: `${riskColor(trader.riskKey)}12`, color: riskColor(trader.riskKey), fontWeight: 800 }}>
                  {riskLabel}
                </span>
              </div>

              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div style={{ background: '#151A22', padding: 10, borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{ct('winRateLabel')}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#00FFA3', fontFamily: "var(--font-mono)" }}>{trader.winRate}</div>
                </div>
                <div style={{ background: '#151A22', padding: 10, borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{ct('returnLabel')}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-mono)" }}>{trader.profit}</div>
                </div>
                <div style={{ background: '#151A22', padding: 10, borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{ct('drawdownLabel')}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#FF4757', fontFamily: "var(--font-mono)" }}>{trader.drawdown}</div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 11, color: '#9CA3B5' }}>
                  {ct('assetsLabel')}: <span style={{ color: '#F0F2F5', fontWeight: 700, fontFamily: "var(--font-mono)" }}>{trader.aum}</span>
                  <span style={{ margin: '0 6px', color: '#6B7280' }}>·</span>
                  <span>{ct('followersCount', { count: trader.followers })}</span>
                </div>
                <button
                  onClick={() => toggleFollow(trader.id, trader.name)}
                  style={{
                    padding: '6px 16px', borderRadius: 'var(--radius-2xl)', fontSize: 13, fontWeight: 800,
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    background: isFollowing ? `${'#FF4757'}15` : `${'#00FFA3'}15`,
                    border: `1px solid ${isFollowing ? `${'#FF4757'}40` : `${'#00FFA3'}40`}`,
                    color: isFollowing ? '#FF4757' : '#00FFA3',
                    transition: 'all 0.2s', fontFamily: "var(--font-ar)",
                  }}
                >
                  {isFollowing ? ct('unfollow') : ct('follow')} <Eye size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
