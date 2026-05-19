'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Link } from 'lucide-react'

export default function MobileKycPage() {
  return (
    <div className="r-page">
      <PageHeader title="ربط الحسابات" />
      <Card>
        <div className="r-empty">
          <Link size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
