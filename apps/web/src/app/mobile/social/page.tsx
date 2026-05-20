'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Users } from 'lucide-react'

export default function MobileSocialPage() {
  return (
    <div className="r-page">
      <PageHeader title="التداول الاجتماعي" />
      <Card>
        <div className="r-empty">
          <Users size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
