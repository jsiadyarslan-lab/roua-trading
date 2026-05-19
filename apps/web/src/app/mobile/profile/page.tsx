'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { UserCircle, Mail, Calendar, TrendingUp, BarChart3, Activity, Pencil } from 'lucide-react'

const MOCK_STATS = { totalTrades: 342, winRate: 67, totalPnl: '+$8,420', bestTrade: '+$1,240', avgTrade: '+$24.6', streak: 5 }

export default function MobileProfilePage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="الملف الشخصي" subtitle="معلوماتك الشخصية" />

      {/* Profile Card */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #00D4FF, #5B21B6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCircle size={28} color="#FFF" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>متداول رؤى</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Mail size={12} color="#8B92A8" /><span style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>trader@roua.io</span>
            </div>
          </div>
          <button style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(0,212,255,0.1)', border: '0.5px solid rgba(0,212,255,0.2)', color: '#00D4FF', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, touchAction: 'manipulation' }}>
            <Pencil size={10} />تعديل
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.1)' }}>
          <Calendar size={12} color="#8B92A8" /><span style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>عضو منذ يناير 2025</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#00D4FF', fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>خطة احترافية</span>
        </div>
      </IOSCard>

      {/* Stats */}
      <div style={{ padding: '0 16px', marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>إحصائيات التداول</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 8 }}>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><Activity size={14} color="#00D4FF" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_STATS.totalTrades}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>إجمالي الصفقات</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><BarChart3 size={14} color="#00FFA3" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_STATS.winRate}%</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>نسبة الفوز</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><TrendingUp size={14} color="#00FFA3" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_STATS.totalPnl}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>إجمالي الربح</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><TrendingUp size={14} color="#FFB800" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFB800', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_STATS.bestTrade}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>أفضل صفقة</div></div></IOSCard>
      </div>

      {/* Details */}
      <IOSCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}><span style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>متوسط الصفقة</span><span style={{ fontSize: 11, fontWeight: 800, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_STATS.avgTrade}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}><span style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>سلسلة فوز</span><span style={{ fontSize: 11, fontWeight: 800, color: '#FFB800', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_STATS.streak} صفقات</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الحسابات المرتبطة</span><span style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>1</span></div>
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
