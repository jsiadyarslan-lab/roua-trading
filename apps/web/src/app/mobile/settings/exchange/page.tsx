'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Building2 } from 'lucide-react'

export default function MobileSettingsExchangePage() {
  return (
    <div className="r-page">
      <PageHeader title="إعدادات البورصة" />
      <Card>
        <div className="r-empty">
          <Building2 size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
