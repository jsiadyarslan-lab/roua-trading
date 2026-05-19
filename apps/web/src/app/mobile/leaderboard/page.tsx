'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Trophy, TrendingUp, Star, Zap, Medal } from 'lucide-react'

const MOCK_LEADERS = [
  { id: 1, name: 'أحمد التداولي', pnl: '+45.2%', winRate: 72, trades: 842, totalPnl: '$12,450', rank: 1 },
  { id: 2, name: 'سارة المستثمرة', pnl: '+38.7%', winRate: 68, trades: 634, totalPnl: '$9,820', rank: 2 },
  { id: 3, name: 'خالد المحلل', pnl: '+31.4%', winRate: 65, trades: 521, totalPnl: '$7,340', rank: 3 },
  { id: 4, name: 'نورة الخبيرة', pnl: '+28.9%', winRate: 63, trades: 445, totalPnl: '$5,670', rank: 4 },
  { id: 5, name: 'عمر المتداول', pnl: '+22.1%', winRate: 60, trades: 312, totalPnl: '$3,890', rank: 5 },
  { id: 6, name: 'ليلى الاستراتيجية', pnl: '+18.6%', winRate: 58, trades: 289, totalPnl: '$2,450', rank: 6 },
]

const RANK_STYLES: Record<number, { bg: string; border: string; color: string; icon: string }> = {
  1: { bg: 'rgba(255,184,0,0.1)', border: 'rgba(255,184,0,0.3)', color: '#FFB800', icon: '🥇' },
  2: { bg: 'rgba(192,192,192,0.1)', border: 'rgba(192,192,192,0.3)', color: '#C0C0C0', icon: '🥈' },
  3: { bg: 'rgba(205,127,50,0.1)', border: 'rgba(205,127,50,0.3)', color: '#CD7F32', icon: '🥉' },
}

export default function MobileLeaderboardPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="لوحة الصدارة" subtitle="أفضل المتداولين أداءً" />

      {/* Top 3 Podium */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8, padding: '10px 0 0' }}>
          {/* 2nd Place */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(192,192,192,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', fontSize: 14, fontWeight: 900, color: '#C0C0C0', fontFamily: "'Cairo', sans-serif", border: '1px solid rgba(192,192,192,0.3)' }}>س</div>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#C0C0C0', fontFamily: "'Cairo', sans-serif" }}>سارة</div>
            <div style={{ fontSize: 10, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>+38.7%</div>
            <div style={{ height: 50, background: 'rgba(192,192,192,0.08)', borderRadius: '8px 8px 0 0', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🥈</div>
          </div>
          {/* 1st Place */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,184,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', fontSize: 16, fontWeight: 900, color: '#FFB800', fontFamily: "'Cairo', sans-serif", border: '1px solid rgba(255,184,0,0.3)' }}>أ</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#FFB800', fontFamily: "'Cairo', sans-serif" }}>أحمد</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>+45.2%</div>
            <div style={{ height: 70, background: 'rgba(255,184,0,0.08)', borderRadius: '8px 8px 0 0', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🥇</div>
          </div>
          {/* 3rd Place */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(205,127,50,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', fontSize: 14, fontWeight: 900, color: '#CD7F32', fontFamily: "'Cairo', sans-serif", border: '1px solid rgba(205,127,50,0.3)' }}>خ</div>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#CD7F32', fontFamily: "'Cairo', sans-serif" }}>خالد</div>
            <div style={{ fontSize: 10, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>+31.4%</div>
            <div style={{ height: 38, background: 'rgba(205,127,50,0.08)', borderRadius: '8px 8px 0 0', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🥉</div>
          </div>
        </div>
      </IOSCard>

      {/* Full Leaderboard */}
      {MOCK_LEADERS.map(trader => {
        const rs = RANK_STYLES[trader.rank]
        return (
          <IOSCard key={trader.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: rs?.bg || 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: rs ? 14 : 12, fontWeight: 900, color: rs?.color || '#8B92A8', fontFamily: "'JetBrains Mono', monospace", border: `1px solid ${rs?.border || 'rgba(255,255,255,0.06)'}`, flexShrink: 0 }}>
                {trader.rank}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{trader.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{trader.trades} صفقة</span>
                  <span style={{ fontSize: 9, color: '#8B92A8' }}>•</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}><Star size={8} color="#FFB800" /><span style={{ fontSize: 9, fontWeight: 700, color: '#FFB800', fontFamily: "'JetBrains Mono', monospace" }}>{trader.winRate}%</span></div>
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{trader.pnl}</div>
                <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>{trader.totalPnl}</div>
              </div>
            </div>
          </IOSCard>
        )
      })}
      <div style={{ height: 16 }} />
    </div>
  )
}
