'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { FileCode } from 'lucide-react'

export default function MobileApiDocsPage() {
  return (
    <div className="r-page">
      <PageHeader title="API المرجع البرمجي" />
      <Card>
        <div className="r-empty">
          <FileCode size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
