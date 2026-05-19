'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   ROUA MOBILE — Shared Components
   Clean, CSS-class based. Zero inline styles for layout.
   ═══════════════════════════════════════════════════════════════ */

// ── Page Header ──
interface HeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: React.ReactNode
}

export function PageHeader({ title, subtitle, onBack, right }: HeaderProps) {
  const router = useRouter()
  const handleBack = onBack ?? (() => router.back())

  return (
    <div className="r-header">
      <button className="r-header__back" onClick={handleBack} aria-label="رجوع">
        <ChevronLeft size={18} color="rgba(255,255,255,0.6)" />
      </button>
      <div style={{ flex: 1 }}>
        <div className="r-header__title">{title}</div>
        {subtitle && <div className="r-header__sub">{subtitle}</div>}
      </div>
      {right}
    </div>
  )
}

// ── Card ──
interface CardProps {
  children: React.ReactNode
  onClick?: () => void
  highlight?: boolean
  noMargin?: boolean
  className?: string
}

export function Card({ children, onClick, highlight, noMargin, className }: CardProps) {
  const cls = [
    'r-card',
    highlight && 'r-card--highlight',
    noMargin && 'r-card--no-margin',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      {children}
    </div>
  )
}

// ── Switch Toggle ──
interface SwitchProps {
  value: boolean
  onChange: (v: boolean) => void
  color?: string
}

export function Switch({ value, onChange, color = '#00D4FF' }: SwitchProps) {
  return (
    <button
      className="r-switch"
      style={{ background: value ? color : 'rgba(255,255,255,0.1)' }}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    >
      <div
        className="r-switch__thumb"
        style={{ insetInlineStart: value ? 16 : 2 }}
      />
    </button>
  )
}
