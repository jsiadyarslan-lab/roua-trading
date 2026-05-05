'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowRight, Trophy, Crown, Medal, TrendingUp, Shield,
  Target, BarChart3, Eye, Lock, Unlock, Star, Zap, Award,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#32D74B', danger: '#FF453A', amber: '#FFB800',
  purple: '#A78BFA', text: '#F0F2F5', text2: 'rgba(235,235,245,0.5)',
  text3: 'rgba(235,235,245,0.25)', border: 'rgba(255,255,255,0.08)',
  silver: '#8B92A8', bronze: '#CD7F32', gold: '#d4af37',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Types ─── */
type CategoryFilter = 'العائد' | 'نسبة الفوز' | 'الاتساق' | 'متابعة الحسابات'

interface Trader {
  id: string; name: string; type: string; avatar: string; returnPct: number;
  winRate: number; maxDrawdown: number; aum: string; followers: number;
  followAvailable: boolean; consistency: number; isCurrentUser?: boolean;
}

/* ─── API Response Types ─── */
interface LeaderboardResponse {
  traders: Trader[]
  badges: Badge[]
  currentUser: Trader | null
  currentUserRank: number | null
}

interface Badge {
  id: string; name: string; icon: string; color: string; unlocked: boolean; desc: string
}

const returnTypeColor = (val: number) => val >= 0 ? C.success : C.danger

/* ─── Badge icon map ─── */
const BADGE_ICONS: Record<string, typeof Zap> = {
  Zap, BarChart3, Crown, Target, Shield, Star,
}

export default function MobileLeaderboardPage() {
  const router = useRouter()
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('العائد')
  const [followingTraders, setFollowingTraders] = useState<Set<string>>(new Set())
  const [showBadges, setShowBadges] = useState(false)

  /* ─── API Data State ─── */
  const [traders, setTraders] = useState<Trader[]>([])
  const [badges, setBadges] = useState<Badge[]>([])
  const [currentUser, setCurrentUser] = useState<Trader | null>(null)
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* ─── Fetch leaderboard data ─── */
  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/leaderboard')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: LeaderboardResponse = await res.json()
      setTraders(data.traders ?? [])
      setBadges(data.badges ?? [])
      setCurrentUser(data.currentUser ?? null)
      setCurrentUserRank(data.currentUserRank ?? null)
    } catch (err) {
      // API not available or error — show empty state
      setTraders([])
      setBadges([])
      setCurrentUser(null)
      setCurrentUserRank(null)
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  const categoryTabs: { key: CategoryFilter; icon: typeof TrendingUp }[] = [
    { key: 'العائد', icon: TrendingUp }, { key: 'نسبة الفوز', icon: Target },
    { key: 'الاتساق', icon: BarChart3 }, { key: 'متابعة الحسابات', icon: Shield },
  ]

  const sortedTraders = useMemo(() => {
    return [...traders].sort((a, b) => {
      switch (categoryFilter) {
        case 'العائد': return b.returnPct - a.returnPct
        case 'نسبة الفوز': return b.winRate - a.winRate
        case 'الاتساق': return b.consistency - a.consistency
        case 'متابعة الحسابات': return a.consistency - b.consistency
        default: return b.returnPct - a.returnPct
      }
    })
  }, [traders, categoryFilter])

  const top3 = sortedTraders.slice(0, 3)
  const restTraders = sortedTraders.slice(3)

  const toggleFollow = (traderId: string, traderName: string) => {
    setFollowingTraders(prev => {
      const next = new Set(prev)
      if (next.has(traderId)) { next.delete(traderId); toast({ title: `تم إيقاف متابعة ${traderName}` }) }
      else { next.add(traderId); toast({ title: `تم بدء متابعة ${traderName} ✅` }) }
      return next
    })
  }

  const podiumColors: Record<number, { main: string; bg: string; border: string }> = {
    1: { main: C.gold, bg: `${C.gold}08`, border: `${C.gold}25` },
    2: { main: C.silver, bg: `${C.silver}08`, border: `${C.silver}20` },
    3: { main: C.bronze, bg: `${C.bronze}08`, border: `${C.bronze}20` },
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
            <div style={{ color: C.amber, display: 'flex' }}><Trophy size={20} /></div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>لوحة الصدارة</h1>
          </div>
        </div>

        {/* Category Filter */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {categoryTabs.map(tab => (
            <button key={tab.key} onClick={() => setCategoryFilter(tab.key)} style={{
              padding: '7px 12px', borderRadius: 8, whiteSpace: 'nowrap',
              background: categoryFilter === tab.key ? `${C.accent}15` : 'transparent',
              border: `0.5px solid ${categoryFilter === tab.key ? `${C.accent}40` : C.border}`,
              color: categoryFilter === tab.key ? C.accent : C.text2,
              fontSize: 11, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <tab.icon size={12} /> {tab.key}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* ──── Loading State ──── */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 16 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${C.border}`, borderTopColor: C.accent }} />
            <div style={{ fontSize: 13, color: C.text2, fontFamily: FONT_AR }}>جاري تحميل لوحة الصدارة…</div>
          </div>
        )}

        {/* ──── Empty State ──── */}
        {!loading && sortedTraders.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: `${C.accent}10`, border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trophy size={28} color={C.text3} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>لا توجد بيانات حالياً</div>
            <div style={{ fontSize: 12, color: C.text2, fontFamily: FONT_AR, textAlign: 'center', lineHeight: 1.6 }}>
              لم يتم العثور على بيانات لوحة الصدارة. حاول مرة أخرى لاحقاً.
            </div>
            {error && (
              <div style={{ fontSize: 10, color: C.danger, fontFamily: FONT_MONO, padding: '4px 10px', borderRadius: 8, background: `${C.danger}10`, border: `0.5px solid ${C.danger}20` }}>
                {error}
              </div>
            )}
            <motion.button whileTap={{ scale: 0.95 }} onClick={fetchLeaderboard} style={{
              padding: '10px 20px', borderRadius: 12, fontSize: 12, fontWeight: 800,
              fontFamily: FONT_AR, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              background: `${C.accent}15`, border: `0.5px solid ${C.accent}30`, color: C.accent,
            }}>
              <TrendingUp size={14} /> إعادة المحاولة
            </motion.button>
          </div>
        )}

        {/* ──── Top 3 Podium ──── */}
        {!loading && sortedTraders.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end' }}>
          {/* 2nd */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{
            flex: 1, padding: '14px 8px', borderRadius: 18, textAlign: 'center',
            background: `linear-gradient(180deg, ${podiumColors[2].bg}, rgba(28,28,30,0.6))`,
            border: `0.5px solid ${podiumColors[2].border}`,
          }}>
            <Medal size={16} color={podiumColors[2].main} style={{ margin: '0 auto 6px' }} />
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${podiumColors[2].main}30, ${podiumColors[2].main}10)`, border: `1.5px solid ${podiumColors[2].main}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: 16, fontWeight: 900, color: podiumColors[2].main, fontFamily: FONT_AR }}>
              {top3[1]?.avatar}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: FONT_AR, marginBottom: 2 }}>{top3[1]?.name}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: returnTypeColor(top3[1]?.returnPct ?? 0), fontFamily: FONT_MONO }}>+{top3[1]?.returnPct.toFixed(1)}%</div>
            <div style={{ fontSize: 8, color: C.text3, fontFamily: FONT_AR }}>#{2}</div>
          </motion.div>

          {/* 1st */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} style={{
            flex: 1.15, padding: '18px 10px', borderRadius: 18, textAlign: 'center',
            background: `linear-gradient(180deg, ${podiumColors[1].bg}, rgba(28,28,30,0.6))`,
            border: `0.5px solid ${podiumColors[1].border}`, boxShadow: `0 0 30px ${C.gold}10`,
          }}>
            <Crown size={20} color={podiumColors[1].main} fill={podiumColors[1].main} style={{ margin: '0 auto 6px', filter: `drop-shadow(0 0 4px ${C.gold}40)` }} />
            <div style={{ width: 50, height: 50, borderRadius: '50%', background: `linear-gradient(135deg, ${podiumColors[1].main}30, ${podiumColors[1].main}10)`, border: `2px solid ${podiumColors[1].main}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: 20, fontWeight: 900, color: podiumColors[1].main, fontFamily: FONT_AR, boxShadow: `0 0 16px ${C.gold}15` }}>
              {top3[0]?.avatar}
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_AR, marginBottom: 2 }}>{top3[0]?.name}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: returnTypeColor(top3[0]?.returnPct ?? 0), fontFamily: FONT_MONO }}>+{top3[0]?.returnPct.toFixed(1)}%</div>
            <div style={{ fontSize: 8, color: C.text3, fontFamily: FONT_AR }}>#{1}</div>
          </motion.div>

          {/* 3rd */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{
            flex: 1, padding: '14px 8px', borderRadius: 18, textAlign: 'center',
            background: `linear-gradient(180deg, ${podiumColors[3].bg}, rgba(28,28,30,0.6))`,
            border: `0.5px solid ${podiumColors[3].border}`,
          }}>
            <Medal size={16} color={podiumColors[3].main} style={{ margin: '0 auto 6px' }} />
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${podiumColors[3].main}30, ${podiumColors[3].main}10)`, border: `1.5px solid ${podiumColors[3].main}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: 16, fontWeight: 900, color: podiumColors[3].main, fontFamily: FONT_AR }}>
              {top3[2]?.avatar}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: FONT_AR, marginBottom: 2 }}>{top3[2]?.name}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: returnTypeColor(top3[2]?.returnPct ?? 0), fontFamily: FONT_MONO }}>+{top3[2]?.returnPct.toFixed(1)}%</div>
            <div style={{ fontSize: 8, color: C.text3, fontFamily: FONT_AR }}>#{3}</div>
          </motion.div>
        </div>
        )}

        {/* Rankings List */}
        {!loading && sortedTraders.length > 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {restTraders.map((trader, idx) => {
            const rank = idx + 4
            const isFollowing = followingTraders.has(trader.id)
            const isCurrent = trader.isCurrentUser
            return (
              <motion.div key={trader.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.02 }}
                style={{
                  padding: '12px 14px', borderRadius: 14,
                  background: isCurrent ? `${C.accent}08` : 'rgba(28,28,30,0.4)',
                  border: `0.5px solid ${isCurrent ? `${C.accent}20` : C.border}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                {/* Rank */}
                <span style={{ fontSize: 13, fontWeight: 800, color: rank <= 5 ? C.amber : C.text3, fontFamily: FONT_MONO, width: 24, textAlign: 'center', flexShrink: 0 }}>{rank}</span>
                {/* Avatar */}
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C.accent}12`, border: `0.5px solid rgba(255,255,255,0.06)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: C.accent, fontFamily: FONT_AR, flexShrink: 0 }}>{trader.avatar}</div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>{trader.name}</span>
                    {isCurrent && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 8, background: `${C.accent}18`, color: C.accent, fontWeight: 800, fontFamily: FONT_AR }}>أنت</span>}
                  </div>
                  <div style={{ fontSize: 9, color: C.text3, fontFamily: FONT_AR }}>{trader.type} · فوز {trader.winRate.toFixed(1)}%</div>
                </div>
                {/* Return */}
                <span style={{ fontSize: 13, fontWeight: 900, color: returnTypeColor(trader.returnPct), fontFamily: FONT_MONO, flexShrink: 0 }}>
                  +{trader.returnPct.toFixed(1)}%
                </span>
                {/* Follow button */}
                {trader.followAvailable ? (
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => toggleFollow(trader.id, trader.name)} style={{
                    padding: '5px 10px', borderRadius: 16, fontSize: 9, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 3, fontFamily: FONT_AR,
                    background: isFollowing ? `${C.danger}12` : `${C.success}12`,
                    border: `0.5px solid ${isFollowing ? `${C.danger}30` : `${C.success}30`}`,
                    color: isFollowing ? C.danger : C.success, flexShrink: 0,
                  }}>
                    <Eye size={9} /> {isFollowing ? 'إيقاف' : 'متابعة'}
                  </motion.button>
                ) : (
                  <span style={{ fontSize: 8, color: C.text3, display: 'flex', alignItems: 'center', gap: 2, padding: '3px 8px', borderRadius: 16, background: 'rgba(28,28,30,0.5)', border: `0.5px solid ${C.border}` }}>
                    <Lock size={7} /> غير متاح
                  </span>
                )}
              </motion.div>
            )
          })}
        </div>
        )}

        {/* Your Ranking Card */}
        {currentUser && currentUserRank != null && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{
          marginTop: 16, padding: '16px', borderRadius: 20,
          background: `linear-gradient(135deg, ${C.accent}08, rgba(28,28,30,0.6))`,
          border: `0.5px solid rgba(0,212,255,0.15)`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: `${C.accent}12`, border: `0.5px solid ${C.accent}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Star size={22} color={C.accent} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.text, fontFamily: FONT_AR, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              ترتيبك الحالي <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: `${C.accent}15`, color: C.accent, fontFamily: FONT_MONO, fontWeight: 800 }}>#{currentUserRank}</span>
            </div>
            <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>
              {currentUser.name} — عائد +{currentUser.returnPct.toFixed(1)}% | فوز {currentUser.winRate.toFixed(1)}%
            </div>
          </div>
        </motion.div>
        )}

        {/* Badges Toggle */}
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowBadges(!showBadges)} style={{
          width: '100%', marginTop: 16, padding: '14px', borderRadius: 16,
          background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`,
          color: C.text2, fontSize: 13, fontWeight: 800, fontFamily: FONT_AR, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Award size={16} color={C.purple} /> شارات الإنجاز ({badges.filter(b => b.unlocked).length}/{badges.length})
        </motion.button>

        {/* Badges Grid */}
        {showBadges && badges.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {badges.map(badge => {
              const IconComp = BADGE_ICONS[badge.icon] ?? Shield
              return (
                <motion.div key={badge.id} whileTap={{ scale: 0.95 }} onClick={() => toast({ title: badge.unlocked ? `${badge.name} ✅` : `${badge.name} 🔒`, description: badge.desc })} style={{
                  padding: '12px', borderRadius: 14, background: badge.unlocked ? `${badge.color}08` : 'rgba(28,28,30,0.4)',
                  border: `0.5px solid ${badge.unlocked ? `${badge.color}25` : C.border}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center',
                  opacity: badge.unlocked ? 1 : 0.5, cursor: 'pointer',
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: badge.unlocked ? `${badge.color}15` : 'rgba(28,28,30,0.5)', border: `0.5px solid ${badge.unlocked ? `${badge.color}30` : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconComp size={18} color={badge.unlocked ? badge.color : C.text3} />
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: badge.unlocked ? C.text : C.text3, fontFamily: FONT_AR }}>{badge.name}</div>
                  <div style={{ fontSize: 8, color: badge.unlocked ? badge.color : C.text3, fontFamily: FONT_AR, display: 'flex', alignItems: 'center', gap: 2 }}>
                    {badge.unlocked ? <><Unlock size={7} /> مفتوح</> : <><Lock size={7} /> مقفل</>}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
        {showBadges && badges.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: C.text3, fontSize: 12, fontFamily: FONT_AR }}>
            لا توجد شارات متاحة حالياً
          </div>
        )}
      </div>
    </div>
  )
}
