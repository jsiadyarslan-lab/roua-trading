'use client'
import { PageHeader, Card } from '@/components/mobile/Card'
import { UserCircle } from 'lucide-react'

export default function MobileProfilePage() {
  return (
    <div className="r-page">
      <PageHeader title="الملف الشخصي" />
      <Card>
        <div className="r-empty">
          <UserCircle size={32} color="#8B92A8" />
          <div className="r-empty__title">هذه الميزة قيد التطوير</div>
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
