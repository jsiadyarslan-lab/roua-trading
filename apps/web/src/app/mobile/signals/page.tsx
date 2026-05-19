'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Radio, TrendingUp, TrendingDown, Target, ShieldAlert, CheckCircle, Clock, Zap } from 'lucide-react'

const MOCK_SIGNALS = [
  { id: 1, pair: 'BTC/USD', direction: 'buy', entry: 105200, tp: 108500, sl: 103800, confidence: 87, status: 'active', time: 'منذ 20 دقيقة', source: 'AI' },
  { id: 2, pair: 'XAU/USD', direction: 'sell', entry: 2418, tp: 2380, sl: 2445, confidence: 74, status: 'active', time: 'منذ ساعة', source: 'محلل' },
  { id: 3, pair: 'ETH/USD', direction: 'buy', entry: 3820, tp: 3950, sl: 3740, confidence: 68, status: 'hit_tp', time: 'منذ 3 ساعات', source: 'AI' },
  { id: 4, pair: 'EUR/USD', direction: 'sell', entry: 1.0880, tp: 1.0820, sl: 1.0920, confidence: 61, status: 'hit_sl', time: 'منذ 5 ساعات', source: 'استراتيجية' },
  { id: 5, pair: 'SOL/USD', direction: 'buy', entry: 172, tp: 185, sl: 166, confidence: 79, status: 'active', time: 'منذ 30 دقيقة', source: 'AI' },
]

const STATUS_CONFIG = { active: { label: 'نشط', color: '#00D4FF' }, hit_tp: { label: 'وصل الهدف', color: '#00FFA3' }, hit_sl: { label: 'وصل الوقف', color: '#FF453A' }, expired: { label: 'منتهي', color: '#8B92A8' } }

export default function MobileSignalsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'active' | 'completed'>('active')

  const active = MOCK_SIGNALS.filter(s => s.status === 'active')
  const completed = MOCK_SIGNALS.filter(s => s.status !== 'active')
  const display = tab === 'active' ? active : completed

  return (
    <div className="m-page">
      <MobilePageHeader title="التوصيات" subtitle="توصيات احترافية مباشرة" />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 10 }}>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><Zap size={14} color="#00D4FF" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{active.length}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>نشطة</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><CheckCircle size={14} color="#00FFA3" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>72%</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>نسبة النجاح</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><Target size={14} color="#FFB800" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>156</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>هذا الشهر</div></div></IOSCard>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, margin: '0 16px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
        {([['active', 'النشطة'], ['completed', 'المكتملة']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: tab === key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: tab === key ? '#00D4FF' : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {/* Signals */}
      {display.map(signal => {
        const isBuy = signal.direction === 'buy'
        const sc = STATUS_CONFIG[signal.status as keyof typeof STATUS_CONFIG]
        return (
          <IOSCard key={signal.id} onClick={() => router.push(`/mobile/chart?symbol=${signal.pair}`)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: isBuy ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isBuy ? <TrendingUp size={16} color="#00FFA3" /> : <TrendingDown size={16} color="#FF453A" />}
                </div>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{signal.pair}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: isBuy ? '#00FFA3' : '#FF453A', fontFamily: "'Cairo', sans-serif", marginRight: 6 }}>{isBuy ? 'شراء' : 'بيع'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${sc.color}15`, color: sc.color, fontFamily: "'Cairo', sans-serif" }}>{sc.label}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
              <div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الدخول</div><div style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{signal.entry}</div></div>
              <div><div style={{ fontSize: 8, color: '#00FFA3', fontFamily: "'Cairo', sans-serif" }}>الهدف</div><div style={{ fontSize: 11, fontWeight: 800, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{signal.tp}</div></div>
              <div><div style={{ fontSize: 8, color: '#FF453A', fontFamily: "'Cairo', sans-serif" }}>الوقف</div><div style={{ fontSize: 11, fontWeight: 800, color: '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>{signal.sl}</div></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Radio size={10} color="#B388FF" /><span style={{ fontSize: 9, color: '#B388FF', fontFamily: "'Cairo', sans-serif" }}>{signal.source}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>ثقة</span><span style={{ fontSize: 10, fontWeight: 800, color: signal.confidence >= 75 ? '#00FFA3' : signal.confidence >= 60 ? '#FFB800' : '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>{signal.confidence}%</span></div>
                <Clock size={9} color="#8B92A8" /><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{signal.time}</span>
              </div>
            </div>
          </IOSCard>
        )
      })}
      <div style={{ height: 16 }} />
    </div>
  )
}
