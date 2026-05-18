'use client'

import { useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Trophy, TrendingUp, TrendingDown, Medal, Star, Flame, BarChart3, Crown } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all'

interface LeaderEntry {
  id: string
  rank: number
  name: string
  avatar: string
  pnlPct: number
  pnlUsd: number
  winRate: number
  trades: number
  followers: number
  strategy: string
  isHot: boolean
}

const LEADER_DATA: LeaderEntry[] = [
  { id: '1', rank: 1, name: 'أحمد الشمري', avatar: 'أ', pnlPct: 5.2, pnlUsd: 1240, winRate: 72, trades: 8, followers: 1243, strategy: 'سوينغ', isHot: true },
  { id: '2', rank: 2, name: 'سارة القحطاني', avatar: 'س', pnlPct: 4.8, pnlUsd: 980, winRate: 68, trades: 12, followers: 892, strategy: 'سكالبينغ', isHot: false },
  { id: '3', rank: 3, name: 'محمد العتيبي', avatar: 'م', pnlPct: 3.9, pnlUsd: 870, winRate: 61, trades: 5, followers: 567, strategy: 'تلقائي', isHot: true },
  { id: '4', rank: 4, name: 'نورة المالكي', avatar: 'ن', pnlPct: 2.8, pnlUsd: 560, winRate: 65, trades: 7, followers: 324, strategy: 'شبكة', isHot: false },
  { id: '5', rank: 5, name: 'خالد الدوسري', avatar: 'خ', pnlPct: 2.1, pnlUsd: 420, winRate: 58, trades: 3, followers: 189, strategy: 'عودة للمتوسط', isHot: false },
  { id: '6', rank: 6, name: 'فاطمة الحربي', avatar: 'ف', pnlPct: 1.8, pnlUsd: 340, winRate: 63, trades: 9, followers: 456, strategy: 'اختراق الزخم', isHot: false },
  { id: '7', rank: 7, name: 'عبدالله الغامدي', avatar: 'ع', pnlPct: 1.5, pnlUsd: 280, winRate: 55, trades: 6, followers: 234, strategy: 'DCA', isHot: true },
  { id: '8', rank: 8, name: 'ريم السبيعي', avatar: 'ر', pnlPct: 1.2, pnlUsd: 190, winRate: 59, trades: 4, followers: 178, strategy: 'VWAP+RSI', isHot: false },
  { id: '9', rank: 9, name: 'ياسر الزهراني', avatar: 'ي', pnlPct: 0.8, pnlUsd: 150, winRate: 52, trades: 11, followers: 98, strategy: 'سكالبينغ', isHot: false },
  { id: '10', rank: 10, name: 'هدى البقمي', avatar: 'ه', pnlPct: 0.5, pnlUsd: 90, winRate: 50, trades: 2, followers: 67, strategy: 'سوينغ', isHot: false },
]

const RANK_STYLES = [
  { bg: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000', border: '1px solid rgba(255,215,0,0.5)' },
  { bg: 'linear-gradient(135deg, #C0C0C0, #808080)', color: '#000', border: '1px solid rgba(192,192,192,0.5)' },
  { bg: 'linear-gradient(135deg, #CD7F32, #8B4513)', color: '#FFF', border: '1px solid rgba(205,127,50,0.5)' },
]

export default function MobileLeaderboardPage() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('daily')

  return (
    <div className="m-page">
      <MobilePageHeader title="لوحة الصدارة" subtitle="أفضل المتداولين أداءً" />

      {/* Period Tabs */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 2 }}>
          {([{ key: 'daily' as const, label: 'يومي' }, { key: 'weekly' as const, label: 'أسبوعي' }, { key: 'monthly' as const, label: 'شهري' }, { key: 'all' as const, label: 'كلي' }]).map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)} style={{
              flex: 1, padding: '6px 0', borderRadius: 10,
              background: period === p.key ? 'rgba(0,212,255,0.12)' : 'transparent',
              border: 'none', color: period === p.key ? C.accent : C.text2,
              fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top 3 Podium */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <IOSCard highlight>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Crown size={18} color={C.amber} />
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>المنصة</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            {/* 2nd Place */}
            {LEADER_DATA[1] && (
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: RANK_STYLES[1].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', fontSize: 18, fontWeight: 900, color: RANK_STYLES[1].color, fontFamily: "'Cairo', sans-serif", border: RANK_STYLES[1].border }}>
                  {LEADER_DATA[1].avatar}
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{LEADER_DATA[1].name.split(' ')[0]}</div>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>+{LEADER_DATA[1].pnlPct}%</div>
                <Medal size={16} color="#C0C0C0" style={{ margin: '2px auto 0' }} />
              </div>
            )}

            {/* 1st Place */}
            {LEADER_DATA[0] && (
              <div style={{ flex: 1.2, textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: RANK_STYLES[0].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', fontSize: 22, fontWeight: 900, color: RANK_STYLES[0].color, fontFamily: "'Cairo', sans-serif", border: RANK_STYLES[0].border, boxShadow: '0 4px 16px rgba(255,215,0,0.3)' }}>
                  {LEADER_DATA[0].avatar}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{LEADER_DATA[0].name.split(' ')[0]}</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>+{LEADER_DATA[0].pnlPct}%</div>
                <Crown size={18} color="#FFD700" style={{ margin: '2px auto 0' }} />
              </div>
            )}

            {/* 3rd Place */}
            {LEADER_DATA[2] && (
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: RANK_STYLES[2].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', fontSize: 18, fontWeight: 900, color: RANK_STYLES[2].color, fontFamily: "'Cairo', sans-serif", border: RANK_STYLES[2].border }}>
                  {LEADER_DATA[2].avatar}
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{LEADER_DATA[2].name.split(' ')[0]}</div>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>+{LEADER_DATA[2].pnlPct}%</div>
                <Medal size={16} color="#CD7F32" style={{ margin: '2px auto 0' }} />
              </div>
            )}
          </div>
        </IOSCard>
      </div>

      {/* Full Rankings */}
      <div className="m-section">
        <div className="m-section__title">الترتيب الكامل</div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {LEADER_DATA.map((entry, i) => {
          const pnlColor = entry.pnlPct >= 0 ? C.success : C.danger
          const isTop3 = i < 3

          return (
            <div key={entry.id} style={{ marginBottom: 6 }}>
              <IOSCard highlight={isTop3}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Rank */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: isTop3 ? RANK_STYLES[i].bg : 'rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 900,
                    color: isTop3 ? RANK_STYLES[i].color : C.text2,
                    fontFamily: "'JetBrains Mono', monospace",
                    border: isTop3 ? 'none' : `0.5px solid ${C.border}`,
                  }}>
                    {entry.rank}
                  </div>

                  {/* Avatar */}
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: isTop3 ? `${C.accent}15` : 'rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 900, color: isTop3 ? C.accent : C.text2,
                    fontFamily: "'Cairo', sans-serif",
                  }}>
                    {entry.avatar}
                  </div>

                  {/* Name + Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{entry.name}</span>
                      {entry.isHot && <Flame size={10} color={C.amber} />}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{entry.strategy}</span>
                      <span style={{ fontSize: 8, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{entry.winRate}% W</span>
                    </div>
                  </div>

                  {/* P&L */}
                  <div style={{ textAlign: 'left', direction: 'ltr' }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: pnlColor, fontFamily: "'JetBrains Mono', monospace" }}>{entry.pnlPct >= 0 ? '+' : ''}{entry.pnlPct}%</div>
                    <div style={{ fontSize: 8, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{entry.pnlUsd >= 0 ? '+' : ''}{entry.pnlUsd}$</div>
                  </div>
                </div>
              </IOSCard>
            </div>
          )
        })}
      </div>

      <div style={{ height: 16 }} />
    </div>
  )
}
