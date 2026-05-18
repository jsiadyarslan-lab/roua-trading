'use client'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { ScanSearch } from 'lucide-react'

const C = { accent: '#00D4FF', text2: '#8B92A8', text: '#F0F2F5', border: 'rgba(255,255,255,0.06)' }

export default function MobileScannerPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="سكانر السوق" subtitle="بحث عن فرص لحظية" />
      <IOSCard>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <ScanSearch size={40} color={C.text2} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>سكانر السوق</div>
          <div style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>بحث عن فرص لحظية في السوق</div>
        </div>
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
