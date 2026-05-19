'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Bell } from 'lucide-react'

export default function MobileNotificationsPage() {
  return (
    <div className="r-page">
      <PageHeader title="الإشعارات" />
      <Card>
        <div className="r-empty">
          <Bell size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
