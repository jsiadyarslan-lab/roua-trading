'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Bot } from 'lucide-react'

export default function MobileAgentPage() {
  return (
    <div className="r-page">
      <PageHeader title="الوكيل المستقل" />
      <Card>
        <div className="r-empty">
          <Bot size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
