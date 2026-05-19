'use client'

import { useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { CalendarDays, Clock, Globe, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const MOCK_EVENTS = [
  { id: 1, event: 'مؤشر أسعار المستهلك الأمريكي', currency: 'USD', date: '2025-05-20', time: '14:30', forecast: '3.4%', previous: '3.5%', impact: 'high' as const },
  { id: 2, event: 'قرار الفائدة البريطاني', currency: 'GBP', date: '2025-05-22', time: '12:00', forecast: '5.25%', previous: '5.25%', impact: 'high' as const },
  { id: 3, event: 'مؤشر PMI التصنيعي الأوروبي', currency: 'EUR', date: '2025-05-23', time: '10:00', forecast: '47.2', previous: '46.8', impact: 'medium' as const },
  { id: 4, event: 'طلبات البطالة الأمريكية', currency: 'USD', date: '2025-05-22', time: '14:30', forecast: '220K', previous: '215K', impact: 'medium' as const },
  { id: 5, event: 'مبيعات التجزئة اليابانية', currency: 'JPY', date: '2025-05-21', time: '01:50', forecast: '1.2%', previous: '0.8%', impact: 'low' as const },
]

const IMPACT_CONFIG = { high: { label: 'مرتفع', color: '#FF4757', bg: 'rgba(255,71,87,0.08)' }, medium: { label: 'متوسط', color: '#FFB800', bg: 'rgba(255,184,0,0.08)' }, low: { label: 'منخفض', color: '#8B92A8', bg: 'rgba(139,146,168,0.08)' } }

export default function MobileCalendarPage() {
  const [tab, setTab] = useState<'today' | 'week'>('today')

  return (
    <div className="m-page">
      <MobilePageHeader title="الأجندة" subtitle="الأحداث الاقتصادية" />

      <div style={{ display: 'flex', gap: 0, margin: '0 16px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
        {([['today', 'اليوم'], ['week', 'هذا الأسبوع']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: tab === key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: tab === key ? '#00D4FF' : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {/* Impact Legend */}
      <div style={{ display: 'flex', gap: 12, padding: '0 16px', marginBottom: 8 }}>
        {(['high', 'medium', 'low'] as const).map(imp => (
          <div key={imp} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: IMPACT_CONFIG[imp].color }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: IMPACT_CONFIG[imp].color, fontFamily: "'Cairo', sans-serif" }}>{IMPACT_CONFIG[imp].label}</span>
          </div>
        ))}
      </div>

      {/* Events */}
      {MOCK_EVENTS.filter((_, i) => tab === 'today' ? i < 2 : true).map(ev => {
        const ic = IMPACT_CONFIG[ev.impact]
        const forecastNum = parseFloat(ev.forecast)
        const previousNum = parseFloat(ev.previous)
        const direction = forecastNum > previousNum ? 'up' : forecastNum < previousNum ? 'down' : 'neutral'
        return (
          <IOSCard key={ev.id}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: ic.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `0.5px solid ${ic.color}25` }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: ic.color, fontFamily: "'JetBrains Mono', monospace" }}>{ev.date.split('-')[2]}</span>
                <span style={{ fontSize: 7, color: ic.color, fontFamily: "'Cairo', sans-serif" }}>{ev.date.split('-')[1]}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{ev.event}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: ic.bg, color: ic.color, fontFamily: "'Cairo', sans-serif" }}>{ic.label}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace" }}>{ev.currency}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={8} color="#8B92A8" /><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>{ev.time} UTC</span></div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div><span style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>التوقع</span><div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{direction === 'up' ? <TrendingUp size={10} color="#00FFA3" /> : direction === 'down' ? <TrendingDown size={10} color="#FF453A" /> : <Minus size={10} color="#8B92A8" />}<span style={{ fontSize: 11, fontWeight: 800, color: direction === 'up' ? '#00FFA3' : direction === 'down' ? '#FF453A' : '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{ev.forecast}</span></div></div>
                  <div><span style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>السابق</span><div style={{ fontSize: 11, fontWeight: 800, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>{ev.previous}</div></div>
                </div>
              </div>
            </div>
          </IOSCard>
        )
      })}
      <div style={{ height: 16 }} />
    </div>
  )
}
