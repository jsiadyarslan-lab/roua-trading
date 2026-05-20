'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { CalendarDays } from 'lucide-react'

export default function MobileCalendarPage() {
  return (
    <div className="r-page">
      <PageHeader title="الأجندة الاقتصادية" />
      <Card>
        <div className="r-empty">
          <CalendarDays size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
