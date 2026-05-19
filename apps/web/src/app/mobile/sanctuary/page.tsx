'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { ShieldCheck } from 'lucide-react'

export default function MobileSanctuaryPage() {
  return (
    <div className="r-page">
      <PageHeader title="ملاذ المحفظة" />
      <Card>
        <div className="r-empty">
          <ShieldCheck size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
