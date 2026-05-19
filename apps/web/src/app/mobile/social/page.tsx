'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Users, TrendingUp, Trophy, Eye, Copy, Star, ChevronLeft } from 'lucide-react'

const MOCK_TRADERS = [
  { id: 1, name: 'أحمد التداولي', username: '@ahmed_trader', pnl: '+45.2%', winRate: 72, followers: 1234, isFollowing: false, rank: 1, avatar: 'أ' },
  { id: 2, name: 'سارة المستثمرة', username: '@sara_inv', pnl: '+38.7%', winRate: 68, followers: 987, isFollowing: true, rank: 2, avatar: 'س' },
  { id: 3, name: 'خالد المحلل', username: '@khaled_fx', pnl: '+31.4%', winRate: 65, followers: 756, isFollowing: false, rank: 3, avatar: 'خ' },
  { id: 4, name: 'نورة الخبيرة', username: '@noura_crypto', pnl: '+28.9%', winRate: 63, followers: 623, isFollowing: false, rank: 4, avatar: 'ن' },
  { id: 5, name: 'عمر المتداول', username: '@omar_swing', pnl: '+22.1%', winRate: 60, followers: 445, isFollowing: true, rank: 5, avatar: 'ع' },
]

const RANK_COLORS = ['#FFB800', '#C0C0C0', '#CD7F32', '#8B92A8', '#8B92A8']

export default function MobileSocialPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'leaders' | 'following'>('leaders')

  const leaders = MOCK_TRADERS
  const following = MOCK_TRADERS.filter(t => t.isFollowing)
  const displayList = tab === 'leaders' ? leaders : following

  return (
    <div className="m-page">
      <MobilePageHeader title="التداول الاجتماعي" subtitle="تابع أفضل المتداولين" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, margin: '0 16px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
        {([['leaders', 'المتصدرون'], ['following', 'متابَعي']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: tab === key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: tab === key ? '#00D4FF' : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Stats Banner */}
      <IOSCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <Users size={14} color="#00D4FF" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>2.4K</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>متداول نشط</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Trophy size={14} color="#FFB800" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>68%</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>متوسط الفوز</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <TrendingUp size={14} color="#00FFA3" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>+32%</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>أفضل أداء</div>
          </div>
        </div>
      </IOSCard>

      {/* Traders List */}
      {displayList.map(trader => (
        <IOSCard key={trader.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Avatar + Rank */}
            <div style={{ position: 'relative' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'Cairo', sans-serif", border: '0.5px solid rgba(255,255,255,0.08)' }}>
                {trader.avatar}
              </div>
              <div style={{ position: 'absolute', top: -4, insetInlineEnd: -4, width: 16, height: 16, borderRadius: 8, background: RANK_COLORS[trader.rank - 1], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: trader.rank <= 2 ? '#000' : '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>
                {trader.rank}
              </div>
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{trader.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>{trader.username}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{trader.pnl}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Star size={9} color="#FFB800" />
                <span style={{ fontSize: 9, fontWeight: 700, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>{trader.winRate}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Eye size={9} color="#8B92A8" />
                <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>{trader.followers}</span>
              </div>
            </div>
          </div>

          {/* Follow/Copy Buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: trader.isFollowing ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.06)', border: trader.isFollowing ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid rgba(0,212,255,0.15)', color: '#00D4FF', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', touchAction: 'manipulation' }}>
              {trader.isFollowing ? 'متابَع ✓' : 'متابعة'}
            </button>
            <button style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'rgba(0,255,163,0.06)', border: '0.5px solid rgba(0,255,163,0.15)', color: '#00FFA3', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, touchAction: 'manipulation' }}>
              <Copy size={10} /> نسخ
            </button>
          </div>
        </IOSCard>
      ))}

      <div style={{ height: 16 }} />
    </div>
  )
}
