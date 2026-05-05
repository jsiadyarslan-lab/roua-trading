'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, Shield, Star, TrendingUp, Activity, AlertTriangle, UserCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#32D74B', danger: '#FF453A', amber: '#FFB800',
  purple: '#A78BFA', text: '#F0F2F5', text2: 'rgba(235,235,245,0.5)',
  text3: 'rgba(235,235,245,0.25)', border: 'rgba(255,255,255,0.08)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

const TRADERS = [
  { id: '1', name: 'Quantum Alpha', type: 'High Frequency', winRate: '87.5%', profit: '+1,420%', risk: 'عالي', aum: '$4.2M', score: 95, followers: 1240, drawdown: '-12%' },
  { id: '2', name: 'Institutional Flow', type: 'Macro Swing', winRate: '72.1%', profit: '+310%', risk: 'متوسط', aum: '$12.5M', score: 78, followers: 890, drawdown: '-8%' },
  { id: '3', name: 'Crypto Sniper', type: 'Scalping', winRate: '91.2%', profit: '+840%', risk: 'مرتفع جداً', aum: '$1.1M', score: 88, followers: 2100, drawdown: '-22%' },
  { id: '4', name: 'DeFi Yield Master', type: 'Yield Farming', winRate: '68.4%', profit: '+180%', risk: 'منخفض', aum: '$8.7M', score: 65, followers: 560, drawdown: '-4%' },
  { id: '5', name: 'Momentum Trader', type: 'Trend Following', winRate: '79.3%', profit: '+560%', risk: 'متوسط', aum: '$3.1M', score: 82, followers: 1680, drawdown: '-15%' },
  { id: '6', name: 'Stable Earn', type: 'Arbitrage', winRate: '94.8%', profit: '+45%', risk: 'منخفض جداً', aum: '$22M', score: 70, followers: 320, drawdown: '-2%' },
]

type FilterTab = 'أداء' | 'مخاطر' | 'شعبية'

export default function MobileCopyTradingPage() {
  const router = useRouter()
  const [followingTraders, setFollowingTraders] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<FilterTab>('أداء')

  const toggleFollow = (traderId: string, traderName: string) => {
    setFollowingTraders(prev => {
      const next = new Set(prev)
      if (next.has(traderId)) { next.delete(traderId); toast({ title: `تم إيقاف متابعة ${traderName}` }) }
      else { next.add(traderId); toast({ title: `تم بدء متابعة ${traderName} ✅` }) }
      return next
    })
  }

  const sortedTraders = [...TRADERS].sort((a, b) => {
    if (activeFilter === 'أداء') return b.score - a.score
    if (activeFilter === 'مخاطر') {
      const ro: Record<string, number> = { 'منخفض جداً': 1, 'منخفض': 2, 'متوسط': 3, 'عالي': 4, 'مرتفع جداً': 5 }
      return (ro[a.risk] || 3) - (ro[b.risk] || 3)
    }
    return b.followers - a.followers
  })

  const riskColor = (risk: string) => {
    if (risk.includes('منخفض')) return C.success
    if (risk === 'متوسط') return C.amber
    return C.danger
  }

  return (
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20 }}>
      {/* ─── Sticky Header ─── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 12px',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => router.back()} style={{
            width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.07)',
            border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowRight size={18} color="#FFFFFF" />
          </motion.button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ color: C.success, display: 'flex' }}><Eye size={20} /></div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>متابعة الحسابات</h1>
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 20,
              background: `${C.amber}18`, color: C.amber,
              fontFamily: FONT_MONO, fontWeight: 800,
            }}>DEMO</span>
          </div>
        </div>
        {/* Filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([{ key: 'أداء', icon: TrendingUp }, { key: 'مخاطر', icon: Shield }, { key: 'شعبية', icon: UserCheck }] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveFilter(tab.key)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
              background: activeFilter === tab.key ? `${C.accent}15` : 'transparent',
              color: activeFilter === tab.key ? C.accent : C.text2,
              fontSize: 11, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <tab.icon size={12} /> {tab.key}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Demo Disclaimer Banner */}
        <div style={{
          background: `${C.amber}12`, border: `0.5px solid ${C.amber}30`,
          borderRadius: 14, padding: '10px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={16} color={C.amber} />
          <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, fontFamily: FONT_AR }}>بيانات تجريبية</span>
          <span style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>
            — هذه بيانات تجريبية لأغراض العرض فقط. لا تمثل نتائج تداول حقيقية.
          </span>
        </div>

        {/* Info Banner */}
        <div style={{
          background: `${C.accent}10`, border: `0.5px solid ${C.accent}25`,
          borderRadius: 14, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Eye size={16} color={C.accent} />
          <span style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>
            تابع أداء الحسابات المربوطة واستفد من رؤى تحليلية. المنصة لا تنفذ صفقات نيابة عنك.
          </span>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { icon: Star, label: 'أفضل حساب هذا الأسبوع (تجريبي)', val: 'Quantum Alpha', color: C.amber },
            { icon: TrendingUp, label: 'متوسط العائد الشهري', val: '--', color: C.text2 },
          ].map((s, i) => (
            <div key={i} style={{ padding: '14px', borderRadius: 14, background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 10, background: `${s.color}12` }}><s.icon size={18} color={s.color} /></div>
              <div>
                <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_MONO }}>{s.val}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Trader Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedTraders.map((trader) => {
            const isFollowing = followingTraders.has(trader.id)
            return (
              <motion.div key={trader.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)',
                  border: `0.5px solid ${isFollowing ? `${C.success}30` : C.border}`,
                  borderRadius: 18, padding: '16px', boxShadow: isFollowing ? `0 0 16px ${C.success}08` : 'none',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(28,28,30,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: isFollowing ? `0.5px solid ${C.success}40` : 'none' }}>
                      <Activity size={18} color={isFollowing ? C.success : C.accent} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT_AR, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {trader.name}
                        {isFollowing && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 8, background: `${C.success}18`, color: C.success, fontWeight: 800 }}>متابَع</span>}
                      </div>
                      <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>{trader.type}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 16, background: `${riskColor(trader.risk)}12`, color: riskColor(trader.risk), fontWeight: 800, fontFamily: FONT_AR }}>{trader.risk}</span>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                  <div style={{ background: 'rgba(28,28,30,0.8)', padding: 8, borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: C.text3, marginBottom: 2 }}>معدل الربح</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.success, fontFamily: FONT_MONO }}>{trader.winRate}</div>
                  </div>
                  <div style={{ background: 'rgba(28,28,30,0.8)', padding: 8, borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: C.text3, marginBottom: 2 }}>العائد</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_MONO }}>{trader.profit}</div>
                  </div>
                  <div style={{ background: 'rgba(28,28,30,0.8)', padding: 8, borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: C.text3, marginBottom: 2 }}>السحب</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.danger, fontFamily: FONT_MONO }}>{trader.drawdown}</div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>
                    الأصول: <span style={{ color: C.text, fontWeight: 700, fontFamily: FONT_MONO }}>{trader.aum}</span> · {trader.followers} متابع
                  </span>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => toggleFollow(trader.id, trader.name)} style={{
                    padding: '6px 14px', borderRadius: 16, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT_AR,
                    background: isFollowing ? `${C.danger}15` : `${C.success}15`,
                    border: `0.5px solid ${isFollowing ? `${C.danger}40` : `${C.success}40`}`,
                    color: isFollowing ? C.danger : C.success,
                  }}>
                    {isFollowing ? 'إلغاء المتابعة' : 'متابعة'} <Eye size={11} />
                  </motion.button>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
