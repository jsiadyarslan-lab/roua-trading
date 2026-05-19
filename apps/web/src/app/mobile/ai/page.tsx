'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Brain } from 'lucide-react'

export default function MobileAiPage() {
  return (
    <div className="r-page">
      <PageHeader title="مجلس الذكاء الاصطناعي" />
      <Card>
        <div className="r-empty">
          <Brain size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
