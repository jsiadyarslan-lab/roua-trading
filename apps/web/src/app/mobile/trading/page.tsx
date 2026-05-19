'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { CandlestickChart } from 'lucide-react'

export default function MobileTradingPage() {
  return (
    <div className="r-page">
      <PageHeader title="التداول الحي" />
      <Card>
        <div className="r-empty">
          <CandlestickChart size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
