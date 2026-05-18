'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Users, Trophy, Eye, TrendingUp, TrendingDown, Heart, MessageCircle, Star, Flame } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

type SocialTab = 'feed' | 'leaderboard' | 'copy'

interface Trader {
  id: string
  name: string
  avatar: string
  pnlPct: number
  winRate: number
  followers: number
  trades: number
  strategy: string
  isFollowing: boolean
}

interface Activity {
  id: string
  traderName: string
  action: string
  symbol: string
  side: 'buy' | 'sell'
  pnl?: number
  time: string
  likes: number
  comments: number
}

const TOP_TRADERS: Trader[] = [
  { id: '1', name: 'أحمد الشمري', avatar: 'أ', pnlPct: 142.5, winRate: 72, followers: 1243, trades: 856, strategy: 'سوينغ', isFollowing: false },
  { id: '2', name: 'سارة القحطاني', avatar: 'س', pnlPct: 98.3, winRate: 68, followers: 892, trades: 1234, strategy: 'سكالبينغ', isFollowing: true },
  { id: '3', name: 'محمد العتيبي', avatar: 'م', pnlPct: 76.1, winRate: 61, followers: 567, trades: 445, strategy: 'تلقائي', isFollowing: false },
  { id: '4', name: 'نورة المالكي', avatar: 'ن', pnlPct: 54.8, winRate: 65, followers: 324, trades: 678, strategy: 'شبكة', isFollowing: false },
  { id: '5', name: 'خالد الدوسري', avatar: 'خ', pnlPct: 32.1, winRate: 58, followers: 189, trades: 234, strategy: 'عودة للمتوسط', isFollowing: true },
]

const ACTIVITIES: Activity[] = [
  { id: '1', traderName: 'أحمد الشمري', action: 'فتح مركز', symbol: 'BTC/USD', side: 'buy', time: 'منذ 5 دقائق', likes: 24, comments: 8 },
  { id: '2', traderName: 'سارة القحطاني', action: 'إغلاق مركز', symbol: 'ETH/USD', side: 'sell', pnl: 342.50, time: 'منذ 12 دقيقة', likes: 45, comments: 12 },
  { id: '3', traderName: 'محمد العتيبي', action: 'فتح مركز', symbol: 'XAU/USD', side: 'sell', time: 'منذ 25 دقيقة', likes: 11, comments: 3 },
  { id: '4', traderName: 'نورة المالكي', action: 'إغلاق مركز', symbol: 'SOL/USD', side: 'buy', pnl: -56.20, time: 'منذ ساعة', likes: 8, comments: 5 },
  { id: '5', traderName: 'خالد الدوسري', action: 'تعديل وقف الخسارة', symbol: 'EUR/USD', side: 'buy', time: 'منذ ساعتين', likes: 3, comments: 1 },
]

export default function MobileSocialPage() {
  const router = useRouter()
  const [tab, setTab] = useState<SocialTab>('feed')
  const [traders, setTraders] = useState(TOP_TRADERS)
  const [likedActivities, setLikedActivities] = useState<Set<string>>(new Set())

  const toggleFollow = (id: string) => {
    setTraders(prev => prev.map(t => t.id === id ? { ...t, isFollowing: !t.isFollowing } : t))
  }

  const toggleLike = (id: string) => {
    setLikedActivities(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="m-page">
      <MobilePageHeader title="التداول الاجتماعي" subtitle="تابع المتداولين الأفضل" />

      {/* Tabs */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 2 }}>
          {([{ key: 'feed' as const, label: 'النشاط' }, { key: 'leaderboard' as const, label: 'المتصدرين' }, { key: 'copy' as const, label: 'متابعة' }]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '7px 0', borderRadius: 10,
              background: tab === t.key ? 'rgba(0,212,255,0.12)' : 'transparent',
              border: 'none', color: tab === t.key ? C.accent : C.text2,
              fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed Tab */}
      {tab === 'feed' && (
        <div style={{ padding: '0 16px' }}>
          {ACTIVITIES.map(activity => {
            const isBuy = activity.side === 'buy'
            const isLiked = likedActivities.has(activity.id)

            return (
              <div key={activity.id} style={{ marginBottom: 8 }}>
                <IOSCard>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: isBuy ? 'rgba(0,255,163,0.08)' : 'rgba(255,71,87,0.08)',
                      border: `0.5px solid ${isBuy ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.15)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {isBuy ? <TrendingUp size={18} color={C.success} /> : <TrendingDown size={18} color={C.danger} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>
                        <span style={{ color: C.accent }}>{activity.traderName}</span> {activity.action}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 900, color: isBuy ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{activity.symbol}</span>
                        {activity.pnl !== undefined && (
                          <span style={{ fontSize: 11, fontWeight: 800, color: activity.pnl >= 0 ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                            {activity.pnl >= 0 ? '+' : ''}{activity.pnl.toFixed(2)}$
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                        <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{activity.time}</span>
                        <button onClick={() => toggleLike(activity.id)} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer' }}>
                          <Heart size={12} color={isLiked ? '#FF6B9D' : C.text2} fill={isLiked ? '#FF6B9D' : 'none'} />
                          <span style={{ fontSize: 9, color: isLiked ? '#FF6B9D' : C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{activity.likes + (isLiked ? 1 : 0)}</span>
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <MessageCircle size={12} color={C.text2} />
                          <span style={{ fontSize: 9, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{activity.comments}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </IOSCard>
              </div>
            )
          })}
        </div>
      )}

      {/* Leaderboard Tab */}
      {tab === 'leaderboard' && (
        <div style={{ padding: '0 16px' }}>
          {traders.sort((a, b) => b.pnlPct - a.pnlPct).map((trader, i) => (
            <div key={trader.id} style={{ marginBottom: 8 }}>
              <IOSCard highlight={i < 3}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Rank */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: i === 0 ? 'linear-gradient(135deg, #FFD700, #FFA500)' : i === 1 ? 'linear-gradient(135deg, #C0C0C0, #808080)' : i === 2 ? 'linear-gradient(135deg, #CD7F32, #8B4513)' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 900, color: i < 3 ? '#000' : C.text2,
                    fontFamily: "'JetBrains Mono', monospace",
                    border: i < 3 ? 'none' : `0.5px solid ${C.border}`,
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>

                  {/* Avatar */}
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: C.accent, fontFamily: "'Cairo', sans-serif", flexShrink: 0 }}>
                    {trader.avatar}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{trader.name}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{trader.strategy}</span>
                      <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>· {trader.followers} متابع</span>
                    </div>
                  </div>

                  {/* P&L */}
                  <div style={{ textAlign: 'left', direction: 'ltr' }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: trader.pnlPct >= 0 ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{trader.pnlPct >= 0 ? '+' : ''}{trader.pnlPct}%</div>
                    <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نسبة الربح {trader.winRate}%</div>
                  </div>
                </div>
              </IOSCard>
            </div>
          ))}
        </div>
      )}

      {/* Copy Tab */}
      {tab === 'copy' && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.1)', marginBottom: 12 }}>
            <Eye size={14} color={C.accent} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>اختر متداولاً لمتابعة صفقاته تلقائياً</span>
          </div>

          {traders.map(trader => (
            <div key={trader.id} style={{ marginBottom: 8 }}>
              <IOSCard>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: C.accent, fontFamily: "'Cairo', sans-serif", flexShrink: 0 }}>
                    {trader.avatar}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{trader.name}</div>
                    <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{trader.strategy} · {trader.winRate}% ربح</div>
                  </div>
                  <button onClick={() => toggleFollow(trader.id)} style={{
                    padding: '5px 14px', borderRadius: 8,
                    background: trader.isFollowing ? 'rgba(255,71,87,0.1)' : C.accent,
                    border: trader.isFollowing ? '0.5px solid rgba(255,71,87,0.2)' : 'none',
                    color: trader.isFollowing ? C.danger : '#000',
                    fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                    cursor: 'pointer',
                  }}>
                    {trader.isFollowing ? 'إلغاء المتابعة' : 'متابعة'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                  <div style={{ textAlign: 'center', padding: '4px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: trader.pnlPct >= 0 ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{trader.pnlPct >= 0 ? '+' : ''}{trader.pnlPct}%</div>
                    <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الربح</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '4px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{trader.trades}</div>
                    <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>صفقات</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '4px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{trader.followers}</div>
                    <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>متابعين</div>
                  </div>
                </div>
              </IOSCard>
            </div>
          ))}

          {/* Navigate to full copy trading page */}
          <button onClick={() => router.push('/mobile/copy-trading')} style={{ width: '100%', padding: '10px 0', borderRadius: 10, background: 'rgba(0,212,255,0.08)', border: '0.5px solid rgba(0,212,255,0.2)', color: C.accent, fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
            صفحة المتابعة الكاملة →
          </button>
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}
