'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

/* ═══ Page Header ═══ */
export function Header({ title, subtitle, onBack, right }: {
  title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode
}) {
  const router = useRouter()
  return (
    <div className="f-header">
      <button className="f-header__back" onClick={onBack ?? (() => router.back())} aria-label="رجوع">
        <ChevronLeft size={18} color="rgba(255,255,255,0.6)" />
      </button>
      <div style={{ flex: 1 }}>
        <div className="f-header__title">{title}</div>
        {subtitle && <div className="f-header__sub">{subtitle}</div>}
      </div>
      {right}
    </div>
  )
}

/* ═══ Card ═══ */
export function Card({ children, onClick, highlight, noMargin, style }: {
  children: React.ReactNode; onClick?: () => void; highlight?: boolean; noMargin?: boolean; style?: React.CSSProperties
}) {
  const cls = ['f-card', highlight && 'f-card--hl', noMargin && 'f-card--nm'].filter(Boolean).join(' ')
  return <div className={cls} onClick={onClick} style={{ ...(onClick ? { cursor: 'pointer' } : {}), ...style }}>{children}</div>
}

/* ═══ Switch ═══ */
export function Switch({ value, onChange, color = '#00D4FF' }: {
  value: boolean; onChange: (v: boolean) => void; color?: string
}) {
  return (
    <button className="f-switch" style={{ background: value ? color : 'rgba(255,255,255,0.1)' }} onClick={() => onChange(!value)} aria-pressed={value}>
      <div className="f-switch__thumb" style={{ insetInlineStart: value ? 16 : 2 }} />
    </button>
  )
}

/* ═══ Skeleton ═══ */
export function SkelLine({ width = '100%', height = 12 }: { width?: string | number; height?: number }) {
  return <div className="f-skel" style={{ width, height }} />
}

export function SkelCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkelLine key={i} width={i === lines - 1 ? '60%' : '100%'} height={i === 0 ? 16 : 10} />
        ))}
      </div>
    </Card>
  )
}
