'use client'

import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import { ScannerMini } from '@/components/dashboard/ScannerMini'

export default function MobileScannerPage() {
  const router = useRouter()

  return (
    <div className="m-page">
      <MobilePageHeader
        title="سكانر الأسواق"
        subtitle="فحص ذكي للفرص"
        onBack={() => router.back()}
      />
      <div style={{ padding: '0 8px', height: 'calc(100dvh - 120px)' }}>
        <ScannerMini mobile compact={false} />
      </div>
    </div>
  )
}
