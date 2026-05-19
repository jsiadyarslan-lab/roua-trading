'use client'

import { useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Users, TrendingUp, Trophy, Eye, Copy, Star, ChevronLeft, Info } from 'lucide-react'

const MOCK_TRADERS = [
  { id: 1, name: 'أحمد التداولي', pnl: '+45.2%', winRate: 72, followers: 1234, isFollowing: false, trades: 842, avatar: 'أ' },
  { id: 2, name: 'سارة المستثمرة', pnl: '+38.7%', winRate: 68, followers: 987, isFollowing: true, trades: 634, avatar: 'س' },
  { id: 3, name: 'خالد المحلل', pnl: '+31.4%', winRate: 65, followers: 756, isFollowing: false, trades: 521, avatar: 'خ' },
  { id: 4, name: 'نورة الخبيرة', pnl: '+28.9%', winRate: 63, followers: 623, isFollowing: false, trades: 445, avatar: 'ن' },
]

export default function MobileCopyTradingPage() {
  const [tab, setTab] = useState<'discover' | 'following' | 'how'>('discover')
  const following = MOCK_TRADERS.filter(t => t.isFollowing)

  return (
    <div className="m-page">
      <MobilePageHeader title="متابعة الحسابات" subtitle="Copy Trading" />

      <div style={{ display: 'flex', gap: 0, margin: '0 16px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
        {([['discover', 'اكتشف'], ['following', 'متابَعي'], ['how', 'كيف يعمل؟']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: tab === key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: tab === key ? '#00D4FF' : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {tab === 'how' && (
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><Info size={18} color="#00D4FF" /><span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>كيف يعمل التداول الاجتماعي؟</span></div>
          {['اختر متداول محترف تثق به بناءً على أدائه وإحصائياته', 'حدد مبلغ الاستثمار ونسبة النسخ لكل صفقة', 'سيتم نسخ صفقاته تلقائياً في حسابك بنفس النسب', 'يمكنك الإيقاف في أي وقت — أنت تتحكم كاملاً'].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{i + 1}</div>
              <span style={{ fontSize: 12, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </IOSCard>
      )}

      {(tab === 'discover' ? MOCK_TRADERS : following).map(trader => (
        <IOSCard key={trader.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'Cairo', sans-serif", border: '0.5px solid rgba(255,255,255,0.08)' }}>{trader.avatar}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{trader.name}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}><span style={{ fontSize: 10, fontWeight: 800, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{trader.pnl}</span><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{trader.trades} صفقة</span></div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
            <div style={{ textAlign: 'center', padding: '4px', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}><Star size={10} color="#FFB800" style={{ margin: '0 auto 2px' }} /><div style={{ fontSize: 10, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{trader.winRate}%</div><div style={{ fontSize: 7, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>نسبة الفوز</div></div>
            <div style={{ textAlign: 'center', padding: '4px', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}><Eye size={10} color="#00D4FF" style={{ margin: '0 auto 2px' }} /><div style={{ fontSize: 10, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{trader.followers}</div><div style={{ fontSize: 7, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>متابع</div></div>
            <div style={{ textAlign: 'center', padding: '4px', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}><TrendingUp size={10} color="#00FFA3" style={{ margin: '0 auto 2px' }} /><div style={{ fontSize: 10, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{trader.pnl}</div><div style={{ fontSize: 7, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الربح</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: trader.isFollowing ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.06)', border: trader.isFollowing ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid rgba(0,212,255,0.15)', color: '#00D4FF', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', touchAction: 'manipulation' }}>{trader.isFollowing ? 'متابَع ✓' : 'متابعة'}</button>
            <button style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: 'rgba(0,255,163,0.06)', border: '0.5px solid rgba(0,255,163,0.15)', color: '#00FFA3', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, touchAction: 'manipulation' }}><Copy size={10} /> نسخ التداول</button>
          </div>
        </IOSCard>
      ))}
      <div style={{ height: 16 }} />
    </div>
  )
}
