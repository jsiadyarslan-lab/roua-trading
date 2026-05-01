'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Shield, Star, TrendingUp, ArrowUpRight, Activity, AlertTriangle, UserCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const T = {
  bg: '#04050C', bg2: '#0D1117', card: '#08090F', cardHover: '#0B0F19',
  surface: '#1A1D29', cyan: '#00D4FF', green: '#00FFA3', greenDim: '#00CC82',
  red: '#FF4757', redDim: '#FF3344', amber: '#FFB800', purple: '#B388FF',
  blue: '#0A84FF',
  text: '#F0F2F5', text2: '#94a3b8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

const TRADERS = [
  { id: '1', name: 'Quantum Alpha', type: 'High Frequency', winRate: '87.5%', profit: '+1,420%', risk: 'عالي', aum: '$4.2M', score: 95, followers: 1240, drawdown: '-12%' },
  { id: '2', name: 'Institutional Flow', type: 'Macro Swing', winRate: '72.1%', profit: '+310%', risk: 'متوسط', aum: '$12.5M', score: 78, followers: 890, drawdown: '-8%' },
  { id: '3', name: 'Crypto Sniper', type: 'Scalping', winRate: '91.2%', profit: '+840%', risk: 'مرتفع جداً', aum: '$1.1M', score: 88, followers: 2100, drawdown: '-22%' },
  { id: '4', name: 'DeFi Yield Master', type: 'Yield Farming', winRate: '68.4%', profit: '+180%', risk: 'منخفض', aum: '$8.7M', score: 65, followers: 560, drawdown: '-4%' },
  { id: '5', name: 'Momentum Trader', type: 'Trend Following', winRate: '79.3%', profit: '+560%', risk: 'متوسط', aum: '$3.1M', score: 82, followers: 1680, drawdown: '-15%' },
  { id: '6', name: 'Stable Earn', type: 'Arbitrage', winRate: '94.8%', profit: '+45%', risk: 'منخفض جداً', aum: '$22M', score: 70, followers: 320, drawdown: '-2%' },
]

type FilterTab = 'أداء' | 'مخاطر' | 'شعبية'

export default function AccountMonitoringPage() {
  const router = useRouter()
  const [followingTraders, setFollowingTraders] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<FilterTab>('أداء')

  const toggleFollow = (traderId: string, traderName: string) => {
    setFollowingTraders(prev => {
      const next = new Set(prev)
      if (next.has(traderId)) {
        next.delete(traderId)
        toast({ title: `تم إيقاف متابعة ${traderName}`, description: 'لن يتم عرض تحديثات أداء هذا الحساب بعد الآن' })
      } else {
        next.add(traderId)
        toast({ title: `تم بدء متابعة ${traderName} ✅`, description: 'ستظهر تحديثات أداء هذا الحساب في لوحتك' })
      }
      return next
    })
  }

  const sortedTraders = [...TRADERS].sort((a, b) => {
    if (activeFilter === 'أداء') return b.score - a.score
    if (activeFilter === 'مخاطر') {
      const riskOrder: Record<string, number> = { 'منخفض جداً': 1, 'منخفض': 2, 'متوسط': 3, 'عالي': 4, 'مرتفع جداً': 5 }
      return (riskOrder[a.risk] || 3) - (riskOrder[b.risk] || 3)
    }
    return b.followers - a.followers
  })

  const filterTabs: { key: FilterTab; icon: typeof TrendingUp }[] = [
    { key: 'أداء', icon: TrendingUp },
    { key: 'مخاطر', icon: Shield },
    { key: 'شعبية', icon: UserCheck },
  ]

  const riskColor = (risk: string) => {
    if (risk.includes('منخفض')) return T.green
    if (risk === 'متوسط') return T.amber
    return T.red
  }

  return (
    <div className="custom-scrollbar" style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", height: '100%', overflowY: 'auto' }}>
      {/* Info Banner */}
      <div style={{
        background: `${T.cyan}10`, border: `1px solid ${T.cyan}30`,
        borderRadius: 12, padding: '12px 18px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Eye size={18} color={T.cyan} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.cyan }}>متابعة الأداء</span>
        <span style={{ fontSize: 12, color: T.text2 }}>
          — تابع أداء الحسابات المربوطة واستفد من رؤى تحليلية. المنصة لا تنفذ صفقات نيابة عنك بل توفر بيانات وتحليلات فقط.
        </span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Eye size={20} color={T.green} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>متابعة الحسابات</h1>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 20,
              background: `${T.green}18`, color: T.green,
              fontFamily: "'JetBrains Mono', monospace",
            }}>LIVE</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
            تابع أداء أفضل الحسابات المربوطة واحصل على رؤى تحليلية متقدمة لمساعدتك في اتخاذ قراراتك.
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/portfolio')}
          style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 800,
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            background: T.surface, color: T.text, border: `1px solid ${T.border}`,
            transition: 'all 0.2s', fontFamily: "'Cairo', sans-serif",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.cyan; e.currentTarget.style.color = T.cyan }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text }}
        >
          إدارة المحفظة <ArrowUpRight size={14} />
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { icon: Star, label: 'أفضل حساب هذا الأسبوع', val: 'Quantum Alpha', color: T.amber },
          { icon: Shield, label: 'إجمالي الأصول المراقبة (AUM)', val: '$18.4M', color: T.blue },
          { icon: TrendingUp, label: 'متوسط العائد الشهري', val: '+12.4%', color: T.green },
        ].map((f, i) => (
          <div key={i} style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 14, padding: '20px', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ padding: 12, borderRadius: 12, background: `${f.color}15` }}>
              <f.icon size={24} color={f.color} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.text2, marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{f.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>الحسابات المتاحة للمتابعة</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                background: activeFilter === tab.key ? `${T.cyan}15` : T.surface,
                border: `1px solid ${activeFilter === tab.key ? `${T.cyan}40` : T.border}`,
                color: activeFilter === tab.key ? T.cyan : T.text2,
                transition: 'all 0.2s', fontFamily: "'Cairo', sans-serif",
              }}
            >
              <tab.icon size={13} /> {tab.key}
            </button>
          ))}
        </div>
      </div>

      {/* Trader Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {sortedTraders.map((trader) => {
          const isFollowing = followingTraders.has(trader.id)
          return (
            <div key={trader.id} style={{
              background: T.card, border: `1px solid ${isFollowing ? `${T.green}35` : T.border}`,
              borderRadius: 16, padding: 20, transition: 'all 0.2s', cursor: 'pointer',
              boxShadow: isFollowing ? `0 0 20px ${T.green}10` : 'none',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, background: T.surface,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: isFollowing ? `1px solid ${T.green}40` : 'none',
                  }}>
                    <Activity size={20} color={isFollowing ? T.green : T.cyan} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {trader.name}
                      {isFollowing && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: `${T.green}18`, color: T.green, fontWeight: 800 }}>متابَع</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.text2 }}>{trader.type}</div>
                  </div>
                </div>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: `${riskColor(trader.risk)}12`, color: riskColor(trader.risk), fontWeight: 800 }}>
                  {trader.risk}
                </span>
              </div>

              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div style={{ background: T.surface, padding: 10, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: T.text3, marginBottom: 4 }}>معدل الربح</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.green, fontFamily: "'JetBrains Mono', monospace" }}>{trader.winRate}</div>
                </div>
                <div style={{ background: T.surface, padding: 10, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: T.text3, marginBottom: 4 }}>العائد</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{trader.profit}</div>
                </div>
                <div style={{ background: T.surface, padding: 10, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: T.text3, marginBottom: 4 }}>السحب</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>{trader.drawdown}</div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 11, color: T.text2 }}>
                  الأصول: <span style={{ color: T.text, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{trader.aum}</span>
                  <span style={{ margin: '0 6px', color: T.text3 }}>·</span>
                  <span>{trader.followers} متابع</span>
                </div>
                <button
                  onClick={() => toggleFollow(trader.id, trader.name)}
                  style={{
                    padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 800,
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    background: isFollowing ? `${T.red}15` : `${T.green}15`,
                    border: `1px solid ${isFollowing ? `${T.red}40` : `${T.green}40`}`,
                    color: isFollowing ? T.red : T.green,
                    transition: 'all 0.2s', fontFamily: "'Cairo', sans-serif",
                  }}
                >
                  {isFollowing ? 'إلغاء المتابعة' : 'متابعة'} <Eye size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
