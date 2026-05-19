'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Radar } from 'lucide-react'

export default function MobileScannerPage() {
  return (
    <div className="r-page">
      <PageHeader title="سكانر السوق" />
      <Card>
        <div className="r-empty">
          <Radar size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
