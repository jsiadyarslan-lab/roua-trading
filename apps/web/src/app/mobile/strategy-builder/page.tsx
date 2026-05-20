'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Code } from 'lucide-react'

export default function MobileStrategyBuilderPage() {
  return (
    <div className="r-page">
      <PageHeader title="محرر الاستراتيجيات" />
      <Card>
        <div className="r-empty">
          <Code size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
