'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { UserCheck } from 'lucide-react'

export default function MobileCopyTradingPage() {
  return (
    <div className="r-page">
      <PageHeader title="متابعة الحسابات" />
      <Card>
        <div className="r-empty">
          <UserCheck size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
