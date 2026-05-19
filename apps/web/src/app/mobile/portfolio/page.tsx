'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { PieChart } from 'lucide-react'

export default function MobilePortfolioPage() {
  return (
    <div className="r-page">
      <PageHeader title="المحفظة الاستثمارية" />
      <Card>
        <div className="r-empty">
          <PieChart size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
