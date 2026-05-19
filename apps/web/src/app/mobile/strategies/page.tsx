'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { FlaskConical, TrendingUp, Play, Plus, BarChart3, Star, GitMerge } from 'lucide-react'

const MOCK_STRATEGIES = [
  { id: 1, name: 'اختراق الزخم', type: 'MOMENTUM_BREAKOUT', winRate: 68, pnl: '+12.4%', trades: 156, isRunning: false, rating: 4.2 },
  { id: 2, name: 'شبكة DCA', type: 'DCA', winRate: 82, pnl: '+8.7%', trades: 432, isRunning: true, rating: 4.7 },
  { id: 3, name: 'عودة للمتوسط', type: 'MEAN_REVERSION', winRate: 61, pnl: '+5.2%', trades: 98, isRunning: false, rating: 3.8 },
  { id: 4, name: 'VWAP + RSI', type: 'VWAP_RSI', winRate: 73, pnl: '+15.1%', trades: 234, isRunning: false, rating: 4.5 },
]

const TYPE_LABELS: Record<string, string> = { MOMENTUM_BREAKOUT: 'اختراق الزخم', DCA: 'متوسط التكلفة', MEAN_REVERSION: 'عودة للمتوسط', VWAP_RSI: 'VWAP+RSI', SWING: 'سوينغ', GRID: 'شبكة', AUTO: 'تلقائي' }

export default function MobileStrategiesPage() {
  const router = useRouter()

  return (
    <div className="m-page">
      <MobilePageHeader title="الاستراتيجيات" subtitle="اختبر وبنِ استراتيجياتك" right={<button onClick={() => router.push('/mobile/strategy-builder')} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(0,212,255,0.1)', border: '0.5px solid rgba(0,212,255,0.2)', color: '#00D4FF', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, touchAction: 'manipulation' }}><Plus size={12} />إنشاء</button>} />

      {MOCK_STRATEGIES.map(strategy => (
        <IOSCard key={strategy.id} highlight={strategy.isRunning}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: strategy.isRunning ? 'rgba(0,255,163,0.1)' : 'rgba(179,136,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${strategy.isRunning ? 'rgba(0,255,163,0.2)' : 'rgba(179,136,255,0.2)'}` }}>
                <FlaskConical size={18} color={strategy.isRunning ? '#00FFA3' : '#B388FF'} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{strategy.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{TYPE_LABELS[strategy.type] || strategy.type}</span>
                  <span style={{ fontSize: 9, color: '#8B92A8' }}>•</span>
                  <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{strategy.trades} صفقة</span>
                </div>
              </div>
            </div>
            {strategy.isRunning && <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><div style={{ width: 6, height: 6, borderRadius: 3, background: '#00FFA3', boxShadow: '0 0 6px rgba(0,255,163,0.6)' }} /><span style={{ fontSize: 9, fontWeight: 700, color: '#00FFA3', fontFamily: "'Cairo', sans-serif" }}>يعمل</span></div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div style={{ textAlign: 'center', padding: '6px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}><TrendingUp size={10} color="#00FFA3" style={{ margin: '0 auto 2px' }} /><div style={{ fontSize: 12, fontWeight: 900, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{strategy.pnl}</div><div style={{ fontSize: 7, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الربح</div></div>
            <div style={{ textAlign: 'center', padding: '6px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}><BarChart3 size={10} color="#00D4FF" style={{ margin: '0 auto 2px' }} /><div style={{ fontSize: 12, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{strategy.winRate}%</div><div style={{ fontSize: 7, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>نسبة الفوز</div></div>
            <div style={{ textAlign: 'center', padding: '6px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}><Star size={10} color="#FFB800" style={{ margin: '0 auto 2px' }} /><div style={{ fontSize: 12, fontWeight: 900, color: '#FFB800', fontFamily: "'JetBrains Mono', monospace" }}>{strategy.rating}</div><div style={{ fontSize: 7, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>التقييم</div></div>
          </div>
        </IOSCard>
      ))}

      <IOSCard>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <GitMerge size={28} color="#B388FF" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>أنشئ استراتيجيتك الخاصة</div>
          <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", marginBottom: 10 }}>استخدم المحرر البصري بدون كتابة كود</div>
          <button onClick={() => router.push('/mobile/strategy-builder')} style={{ padding: '8px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #B388FF, #00D4FF)', border: 'none', color: '#000', fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', touchAction: 'manipulation' }}>ابدأ الآن</button>
        </div>
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
