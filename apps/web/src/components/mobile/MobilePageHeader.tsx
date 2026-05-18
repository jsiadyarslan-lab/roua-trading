'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

/**
 * Mobile Page Header — V2
 * Shared header with back button and title.
 * Sticky at top with blur backdrop.
 */
export default function MobilePageHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: React.ReactNode
}) {
  const router = useRouter()

  return (
    <div className="m-header">
      <button className="m-header__back" onClick={onBack || (() => router.back())}>
        <ArrowRight size={18} color="rgba(255,255,255,0.6)" />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="m-header__title">{title}</div>
        {subtitle && <div className="m-header__sub">{subtitle}</div>}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  )
}
