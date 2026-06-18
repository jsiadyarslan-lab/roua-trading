'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  Trophy, Crown, Medal, TrendingUp, TrendingDown, Users, Shield,
  Target, Clock, BarChart3, Eye, Lock, Unlock, Star,
  ChevronUp, Award,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { T as SharedT } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations, useLocale } from 'next-intl'

/* ──────────────── Design Tokens (canonical + local extensions) ──────────────── */
const T = { ...SharedT, silver: '#8B92A8', bronze: '#CD7F32' }

/* ──────────────── Types (locale-independent string keys) ──────────────── */
type TimePeriod = 'weekly' | 'monthly' | 'yearly' | 'all'
type CategoryFilter = 'return' | 'winRate' | 'consistency' | 'copyTrading'

interface Trader {
  id: string
  name: string
  type: string
  avatar: string
  returnPct: number
  winRate: number
  maxDrawdown: number
  aum: string
  followers: number
  followAvailable: boolean
  consistency: number
  isCurrentUser?: boolean
}

interface Badge {
  id: string
  name: string
  desc: string
  icon: typeof Star
  color: string
  unlocked: boolean
}

interface LeaderboardAPIResponse {
  success: boolean
  traders?: Trader[]
  badges?: Badge[]
  currentUser?: Trader | null
  currentUserRank?: number | null
}

/* ──────────────── Helper Functions ──────────────── */
// V268: formatNumber now accepts a locale for locale-aware grouping.
// Default 'en' for backward compat with callers that don't pass locale.
const formatNumber = (n: number, locale: string = 'en') => {
  try {
    return n.toLocaleString(locale);
  } catch {
    return n.toLocaleString('en-US');
  }
}

const returnTypeColor = (val: number) => val > 0 ? T.green : val < 0 ? T.red : T.text2

const drawdownColor = (val: number) => {
  const abs = Math.abs(val)
  if (abs <= 5) return T.green
  if (abs <= 10) return T.amber
  return T.red
}

/* ──────────────── Podium Card Component ──────────────── */
function PodiumCard({ trader, rank }: { trader: Trader; rank: 1 | 2 | 3 }) {
  const t = useTranslations('leaderboardPage')
  const isFirst = rank === 1
  const colors = {
    1: { main: T.gold, bg: `${T.gold}08`, border: `${T.gold}25`, glow: `${T.gold}15` },
    2: { main: T.silver, bg: `${T.silver}08`, border: `${T.silver}20`, glow: `${T.silver}10` },
    3: { main: T.bronze, bg: `${T.bronze}08`, border: `${T.bronze}20`, glow: `${T.bronze}10` },
  }[rank]

  return (
    <div style={{
      background: `linear-gradient(180deg, ${colors.bg}, ${T.card})`,
      border: `1px solid ${colors.border}`,
      borderRadius: 20, padding: isFirst ? 28 : 22,
      position: 'relative', overflow: 'hidden',
      boxShadow: isFirst ? `0 0 40px ${colors.glow}` : `0 0 20px ${colors.glow}`,
      transition: 'transform 0.3s, box-shadow 0.3s',
      cursor: 'pointer',
      flex: isFirst ? 1.15 : 1,
      minWidth: 0,
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = `0 0 50px ${colors.glow}` }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = isFirst ? `0 0 40px ${colors.glow}` : `0 0 20px ${colors.glow}` }}
    >
      {/* Crown / Medal */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {isFirst ? (
          <Crown size={22} color={colors.main} fill={colors.main} style={{ filter: `drop-shadow(0 0 6px ${colors.main}60)` }} />
        ) : (
          <Medal size={18} color={colors.main} />
        )}
        <span style={{ fontSize: 12, fontWeight: 800, color: colors.main, fontFamily: "'JetBrains Mono', monospace" }}>
          #{rank}
        </span>
      </div>

      {/* Radial decoration for 1st */}
      {isFirst && (
        <div style={{
          position: 'absolute', top: '-40%', right: '-20%', width: '70%', height: '120%',
          background: `radial-gradient(ellipse, ${T.gold}06, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* Avatar */}
      <div style={{
        display: 'flex', justifyContent: 'center', marginBottom: 14,
        marginTop: 8,
      }}>
        <div style={{
          width: isFirst ? 68 : 56, height: isFirst ? 68 : 56, borderRadius: '50%',
          background: `linear-gradient(135deg, ${colors.main}30, ${colors.main}10)`,
          border: `2px solid ${colors.main}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: isFirst ? 24 : 20, fontWeight: 900, color: colors.main,
          fontFamily: "'Cairo', sans-serif",
          boxShadow: `0 0 20px ${colors.main}20`,
        }}>
          {trader.avatar}
        </div>
      </div>

      {/* Name & Type */}
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: isFirst ? 16 : 14, fontWeight: 900, color: T.text, marginBottom: 3 }}>
          {trader.name}
        </div>
        <div style={{ fontSize: 11, color: T.text3 }}>{trader.type}</div>
      </div>

      {/* Return */}
      <div style={{
        textAlign: 'center', marginBottom: 12,
        padding: '8px 0', borderRadius: 10,
        background: `${returnTypeColor(trader.returnPct)}10`,
        border: `1px solid ${returnTypeColor(trader.returnPct)}20`,
      }}>
        <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>{t('returnLabel')}</div>
        <div style={{
          fontSize: isFirst ? 20 : 17, fontWeight: 900,
          color: returnTypeColor(trader.returnPct),
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          +{trader.returnPct.toFixed(1)}%
        </div>
      </div>

      {/* Win Rate & Followers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ background: T.surface, borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>{t('winRateLabel')}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
            {trader.winRate.toFixed(1)}%
          </div>
        </div>
        <div style={{ background: T.surface, borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>{t('followers')}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
            {formatNumber(trader.followers)}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ──────────────── Badge Card Component ──────────────── */
function BadgeCard({ badge }: { badge: Badge }) {
  const tc = useTranslations('common')
  return (
    <div style={{
      background: badge.unlocked ? `${badge.color}08` : T.card,
      border: `1px solid ${badge.unlocked ? `${badge.color}25` : T.border}`,
      borderRadius: 14, padding: 16,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
      opacity: badge.unlocked ? 1 : 0.55,
      position: 'relative', overflow: 'hidden',
    }}
      onMouseEnter={e => { if (badge.unlocked) e.currentTarget.style.transform = 'translateY(-3px)' }}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
      onClick={() => toast({
        title: badge.unlocked ? `${badge.name} ✅` : `${badge.name} 🔒`,
        description: badge.desc,
      })}
    >
      {/* Lock overlay for locked badges */}
      {!badge.unlocked && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
        }}>
          <Lock size={10} color={T.text3} />
        </div>
      )}
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: badge.unlocked ? `${badge.color}15` : T.surface,
        border: badge.unlocked ? `1px solid ${badge.color}30` : `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <badge.icon size={20} color={badge.unlocked ? badge.color : T.text3} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: badge.unlocked ? T.text : T.text3 }}>
        {badge.name}
      </div>
      {!badge.unlocked && (
        <div style={{ fontSize: 9, color: T.text3, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Lock size={8} /> {tc('locked')}
        </div>
      )}
      {badge.unlocked && (
        <div style={{ fontSize: 9, color: badge.color, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Unlock size={8} /> {tc('unlocked')}
        </div>
      )}
    </div>
  )
}

/* ──────────────── Main Page Component ──────────────── */
export default function LeaderboardPage() {
  useScopedStyle(`@keyframes spin { to { transform: rotate(360deg); } }`)

  const [timePeriod, setTimePeriod] = useState<TimePeriod>('monthly')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('return')
  const [followingTraders, setCopyingTraders] = useState<Set<string>>(new Set())
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  /* API-driven state */
  const [traders, setTraders] = useState<Trader[]>([])
  const [badges, setBadges] = useState<Badge[]>([])
  const [currentUser, setCurrentUser] = useState<Trader | null>(null)
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const t = useTranslations('leaderboardPage')
  const tn = useTranslations('notifications.leaderboard')
  const tc = useTranslations('common')

  const timePeriods: { key: TimePeriod; label: string }[] = [
    { key: 'weekly', label: t('timeWeekly') },
    { key: 'monthly', label: t('timeMonthly') },
    { key: 'yearly', label: t('timeYearly') },
    { key: 'all', label: t('timeAll') },
  ]
  const categoryTabs: { key: CategoryFilter; icon: typeof TrendingUp; label: string }[] = [
    { key: 'return', icon: TrendingUp, label: t('catReturn') },
    { key: 'winRate', icon: Target, label: t('catWinRate') },
    { key: 'consistency', icon: BarChart3, label: t('catConsistency') },
    { key: 'copyTrading', icon: Shield, label: t('catCopyTrading') },
  ]

  /* Fetch leaderboard data from API */
  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch('/api/leaderboard')
        const data: LeaderboardAPIResponse = await res.json()
        if (data.success) {
          setTraders(data.traders ?? [])
          setBadges(data.badges ?? [])
          setCurrentUser(data.currentUser ?? null)
          setCurrentUserRank(data.currentUserRank ?? null)
        }
      } catch {
        setError(t('loadError'))
      } finally {
        setLoading(false)
      }
    }
    fetchLeaderboard()
  }, [])

  /* Sort traders based on selected category */
  const sortedTraders = useMemo(() => {
    return [...traders].sort((a, b) => {
      switch (categoryFilter) {
        case 'return': return b.returnPct - a.returnPct
        case 'winRate': return b.winRate - a.winRate
        case 'consistency': return b.consistency - a.consistency
        case 'copyTrading': return a.consistency - b.consistency
        default: return b.returnPct - a.returnPct
      }
    })
  }, [categoryFilter, traders])

  const top3 = sortedTraders.slice(0, 3)
  const restTraders = sortedTraders.slice(3)

  const toggleFollow = (traderId: string, traderName: string) => {
    setCopyingTraders(prev => {
      const next = new Set(prev)
      if (next.has(traderId)) {
        next.delete(traderId)
        toast({ title: tn('unfollowed', { name: traderName }), description: tn('unfollowedDesc') })
      } else {
        next.add(traderId)
        toast({ title: tn('followed', { name: traderName }) + ' ✅', description: tn('followedDesc') })
      }
      return next
    })
  }

  /* Stats summary */
  const totalActiveTraders = traders.length
  const totalReturns = traders.length > 0 ? `${(traders.reduce((s, t2) => s + t2.returnPct, 0) / traders.length).toFixed(1)}%` : '--'
  const avgWinRate = traders.length > 0 ? `${(traders.reduce((s, t2) => s + t2.winRate, 0) / traders.length).toFixed(1)}%` : '--'

  /* Loading state */
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', direction: 'inherit', fontFamily: "'Cairo', sans-serif",
        background: T.bg,
      }}>
        <div style={{ textAlign: 'center', color: T.text2 }}>
          <div style={{
            width: 40, height: 40,
            border: `3px solid ${T.cyan}`, borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }} />
          <div style={{ fontSize: 13 }}>{t('loading')}</div>
        </div>
      </div>
    )
  }

  /* Empty state when no data at all */
  if (!loading && traders.length === 0) {
    return (
      <div style={{
        padding: '32px 24px', direction: 'inherit',
        fontFamily: "'Cairo', sans-serif",
        height: '100%', overflowY: 'auto',
        background: T.bg,
      }}>
        {/* Header still visible */}
        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                padding: 8, borderRadius: 12, background: `${T.amber}12`,
                border: `1px solid ${T.amber}25`,
              }}>
                <Trophy size={20} color={T.amber} />
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>{t('title')}</h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
              {t('subtitle')}
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '48px 24px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 16,
          textAlign: 'center',
        }}>
          <Trophy size={36} style={{ color: T.amber, marginBottom: 12, opacity: 0.5 }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: '0 0 8px' }}>
            {error ? t('errorTitle') : t('emptyTitle')}
          </p>
          <p style={{ fontSize: 12, color: T.text2, margin: 0 }}>
            {error || t('emptyDesc')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="custom-scrollbar" style={{
      padding: '32px 24px', direction: 'inherit',
      fontFamily: "'Cairo', sans-serif",
      height: '100%', overflowY: 'auto',
      background: T.bg,
    }}>
      {/* ──── Header ──── */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              padding: 8, borderRadius: 12, background: `${T.amber}12`,
              border: `1px solid ${T.amber}25`,
            }}>
              <Trophy size={20} color={T.amber} />
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>{t('title')}</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
            {t('subtitle')}
          </p>
        </div>
      </div>

      {/* ──── Stats Summary Row ──── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { icon: Users, label: t('totalActiveAccounts'), val: formatNumber(totalActiveTraders), color: T.cyan },
          { icon: TrendingUp, label: t('avgReturn'), val: totalReturns, color: T.green },
          { icon: Target, label: t('avgWinRate'), val: avgWinRate, color: T.amber },
        ].map((s, i) => (
          <div key={i} style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ padding: 10, borderRadius: 12, background: `${s.color}12` }}>
              <s.icon size={22} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.text2, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{s.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ──── Time Period Filter ──── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {timePeriods.map(period => (
            <button key={period.key} onClick={() => setTimePeriod(period.key)} style={{
              padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 5,
              background: timePeriod === period.key ? `${T.cyan}15` : T.surface,
              border: `1px solid ${timePeriod === period.key ? `${T.cyan}40` : T.border}`,
              color: timePeriod === period.key ? T.cyan : T.text2,
              fontFamily: "'Cairo', sans-serif",
            }}>
              <Clock size={12} /> {period.label}
            </button>
          ))}
        </div>

        {/* Category Filter Tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categoryTabs.map(tab => (
            <button key={tab.key} onClick={() => setCategoryFilter(tab.key)} style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 6,
              background: categoryFilter === tab.key ? `${T.cyan}15` : T.surface,
              border: `1px solid ${categoryFilter === tab.key ? `${T.cyan}40` : T.border}`,
              color: categoryFilter === tab.key ? T.cyan : T.text2,
              fontFamily: "'Cairo', sans-serif",
            }}>
              <tab.icon size={13} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ──── Top 3 Podium ──── */}
      {top3.length >= 3 && (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.15fr 1fr',
        gap: 16, marginBottom: 28,
        alignItems: 'end',
      }}>
        {/* 2nd Place */}
        <PodiumCard trader={top3[1]} rank={2} />
        {/* 1st Place */}
        <PodiumCard trader={top3[0]} rank={1} />
        {/* 3rd Place */}
        <PodiumCard trader={top3[2]} rank={3} />
      </div>
      )}

      {/* ──── Full Rankings Table ──── */}
      {restTraders.length > 0 && (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} color={T.cyan} />
            {t('fullRanking')}
          </h2>
          <span style={{ fontSize: 11, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
            {sortedTraders.length} {sortedTraders.length === 1 ? t('linkedAccount') : t('linkedAccounts')}
          </span>
        </div>

        {/* Scrollable Table Container */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 16, overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontFamily: "'Cairo', sans-serif",
              minWidth: 800,
            }}>
              {/* Table Header */}
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {[
                    { label: t('colRank'), width: 50 },
                    { label: t('colAccount'), width: 'auto' },
                    { label: t('colReturn'), width: 100 },
                    { label: t('colWinRate'), width: 95 },
                    { label: t('colMaxDrawdown'), width: 105 },
                    { label: t('colAum'), width: 110 },
                    { label: t('colFollowers'), width: 90 },
                    { label: t('colCopyAvailable'), width: 110 },
                  ].map((col, i) => (
                    <th key={i} style={{
                      padding: '12px 14px', fontSize: 11, fontWeight: 800,
                      color: T.text3, textAlign: i === 0 ? 'center' : 'right',
                      background: T.surface, whiteSpace: 'nowrap',
                      width: col.width,
                    }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody>
                {restTraders.map((trader, idx) => {
                  const rank = idx + 4
                  const isExpanded = expandedRow === trader.id
                  const isCurrent = trader.isCurrentUser

                  return (
                <tr key={trader.id} style={{
                  borderBottom: `1px solid ${T.border}`,
                  background: isCurrent ? `${T.cyan}06` : 'transparent',
                  transition: 'background 0.2s',
                  cursor: 'pointer',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = `${T.cyan}04`}
                  onMouseLeave={e => e.currentTarget.style.background = isCurrent ? `${T.cyan}06` : 'transparent'}
                  onClick={() => setExpandedRow(isExpanded ? null : trader.id)}
                >
                  {/* Rank */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: rank <= 5 ? T.amber : T.text3,
                    textAlign: 'center',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {rank}
                  </td>

                  {/* Trader */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `${T.cyan}12`, border: `1px solid ${T.border2}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 900, color: T.cyan,
                        fontFamily: "'Cairo', sans-serif", flexShrink: 0,
                      }}>
                        {trader.avatar}
                      </div>
                      <div>
                        <div style={{
                          fontSize: 13, fontWeight: 800, color: T.text,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          {trader.name}
                          {isCurrent && (
                            <span style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 10,
                              background: `${T.cyan}18`, color: T.cyan, fontWeight: 800,
                            }}>{t('you')}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: T.text3 }}>{trader.type}</div>
                      </div>
                    </div>
                  </td>

                  {/* Return */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: returnTypeColor(trader.returnPct),
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {trader.returnPct > 0 ? <ChevronUp size={12} /> : <TrendingDown size={12} />}
                      {trader.returnPct > 0 ? '+' : ''}{trader.returnPct.toFixed(1)}%
                    </span>
                  </td>

                  {/* Win Rate */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: T.text,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    {trader.winRate.toFixed(1)}%
                  </td>

                  {/* Max Drawdown */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: drawdownColor(trader.maxDrawdown),
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    {trader.maxDrawdown.toFixed(1)}%
                  </td>

                  {/* AUM */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: T.text2,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    {trader.aum}
                  </td>

                  {/* Followers */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: T.text2,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    {formatNumber(trader.followers)}
                  </td>

                  {/* Copy Available */}
                  <td style={{ padding: '12px 14px' }}>
                    {trader.followAvailable ? (
                      <button
                        onClick={e => { e.stopPropagation(); toggleFollow(trader.id, trader.name) }}
                        style={{
                          padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                          cursor: 'pointer', transition: 'all 0.2s',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: followingTraders.has(trader.id) ? `${T.red}12` : `${T.green}12`,
                          border: `1px solid ${followingTraders.has(trader.id) ? `${T.red}35` : `${T.green}35`}`,
                          color: followingTraders.has(trader.id) ? T.red : T.green,
                          fontFamily: "'Cairo', sans-serif",
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {followingTraders.has(trader.id) ? t('unfollow') : t('follow')}
                        <Eye size={11} />
                      </button>
                    ) : (
                      <span style={{
                        fontSize: 10, color: T.text3,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 20,
                        background: T.surface, border: `1px solid ${T.border}`,
                      }}>
                        <Lock size={9} /> {t('notAvailable')}
                      </span>
                    )}
                  </td>
                </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* ──── Your Ranking Card ──── */}
      {currentUser && currentUserRank != null && (
      <div style={{
        background: `linear-gradient(135deg, ${T.cyan}08, ${T.card})`,
        border: `1px solid ${T.border2}`,
        borderRadius: 16, padding: '20px 24px', marginBottom: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', top: '-50%', right: '-10%', width: '40%', height: '150%',
          background: `radial-gradient(ellipse, ${T.cyan}06, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: `${T.cyan}12`, border: `1px solid ${T.cyan}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Star size={24} color={T.cyan} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: T.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              {t('yourRanking')}
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 10,
                background: `${T.cyan}15`, color: T.cyan,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 800,
              }}>
                #{currentUserRank}
              </span>
            </div>
            <div style={{ fontSize: 12, color: T.text2 }}>
              {currentUser.name} — {t('returnLabel')} +{currentUser.returnPct.toFixed(1)}% | {t('winRateLabel')} {currentUser.winRate.toFixed(1)}%
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: T.text3, marginBottom: 3 }}>{t('consistency')}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.amber, fontFamily: "'JetBrains Mono', monospace" }}>
              {currentUser.consistency}%
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: T.border }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: T.text3, marginBottom: 3 }}>{t('maxDrawdown')}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: drawdownColor(currentUser.maxDrawdown), fontFamily: "'JetBrains Mono', monospace" }}>
              {currentUser.maxDrawdown.toFixed(1)}%
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: T.border }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: T.text3, marginBottom: 3 }}>{t('followers')}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
              {formatNumber(currentUser.followers)}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ──── Achievement Badges ──── */}
      {badges.length > 0 && (
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Award size={16} color={T.purple} />
          <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>{t('achievementBadges')}</h2>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: `${T.purple}15`, color: T.purple,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {badges.filter(b => b.unlocked).length}/{badges.length}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 12,
        }}>
          {badges.map(badge => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      </div>
      )}

      {/* ──── Footer Spacer ──── */}
      <div style={{ height: 24 }} />
    </div>
  )
}
