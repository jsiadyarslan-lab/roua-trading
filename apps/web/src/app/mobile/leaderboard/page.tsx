'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Trophy } from 'lucide-react'

export default function MobileLeaderboardPage() {
  return (
    <div className="r-page">
      <PageHeader title="لوحة الصدارة" />
      <Card>
        <div className="r-empty">
          <Trophy size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
