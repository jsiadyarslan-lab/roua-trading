'use client'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Cpu } from 'lucide-react'

const C = { accent: '#00D4FF', text2: '#8B92A8', text: '#F0F2F5', border: 'rgba(255,255,255,0.06)' }

export default function MobileAgentPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="وكيل التداول" subtitle="تداول ذاتي بالذكاء الاصطناعي" />
      <IOSCard>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Cpu size={40} color={C.text2} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>وكيل التداول</div>
          <div style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>تداول ذاتي بالذكاء الاصطناعي مع إدارة مخاطر متقدمة</div>
        </div>
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
