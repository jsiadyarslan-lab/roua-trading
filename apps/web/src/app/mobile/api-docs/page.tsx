'use client'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Code } from 'lucide-react'

const C = { accent: '#00D4FF', text2: '#8B92A8', text: '#F0F2F5', border: 'rgba(255,255,255,0.06)' }

export default function MobileApiDocsPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="API" subtitle="المرجع البرمجي" />
      <IOSCard>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Code size={40} color={C.text2} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>API</div>
          <div style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>المرجع البرمجي لواجهة برمجة التطبيقات</div>
        </div>
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
