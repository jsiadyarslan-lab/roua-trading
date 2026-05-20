'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Target } from 'lucide-react'

export default function MobilePredictionMarketPage() {
  return (
    <div className="r-page">
      <PageHeader title="سوق التنبؤات" />
      <Card>
        <div className="r-empty">
          <Target size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
