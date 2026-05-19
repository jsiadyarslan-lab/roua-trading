'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Cpu } from 'lucide-react'

export default function MobileBotPage() {
  return (
    <div className="r-page">
      <PageHeader title="المنفذ الذكي" />
      <Card>
        <div className="r-empty">
          <Cpu size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
