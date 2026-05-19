'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Newspaper } from 'lucide-react'

export default function MobileNewsPage() {
  return (
    <div className="r-page">
      <PageHeader title="الأخبار" />
      <Card>
        <div className="r-empty">
          <Newspaper size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
