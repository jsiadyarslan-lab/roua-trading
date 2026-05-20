'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { HelpCircle } from 'lucide-react'

export default function MobileHelpPage() {
  return (
    <div className="r-page">
      <PageHeader title="المساعدة" />
      <Card>
        <div className="r-empty">
          <HelpCircle size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
