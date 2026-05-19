'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Shield } from 'lucide-react'

export default function MobileSecurityPage() {
  return (
    <div className="r-page">
      <PageHeader title="الأمان" />
      <Card>
        <div className="r-empty">
          <Shield size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
