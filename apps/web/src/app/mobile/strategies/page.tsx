'use client'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { FlaskConical } from 'lucide-react'

const C = { accent: '#00D4FF', text2: '#8B92A8', text: '#F0F2F5', border: 'rgba(255,255,255,0.06)' }

export default function MobileStrategiesPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="الاستراتيجيات" subtitle="اختبر وبنِ استراتيجياتك" />
      <IOSCard>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <FlaskConical size={40} color={C.text2} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>الاستراتيجيات</div>
          <div style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>اختبر وبنِ استراتيجياتك التداولية</div>
        </div>
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
