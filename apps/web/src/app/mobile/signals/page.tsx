'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Zap } from 'lucide-react'

export default function MobileSignalsPage() {
  return (
    <div className="r-page">
      <PageHeader title="التوصيات" />
      <Card>
        <div className="r-empty">
          <Zap size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
