'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { GitBranch } from 'lucide-react'

export default function MobileCorrelationPage() {
  return (
    <div className="r-page">
      <PageHeader title="الارتباط" />
      <Card>
        <div className="r-empty">
          <GitBranch size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
