'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

interface SubPageLayoutProps {
  children: React.ReactNode
  title: string
  icon: React.ReactNode
  iconBg?: string
  backPath?: string
  actions?: React.ReactNode
  tabs?: { id: string; label: string }[]
  activeTab?: string
  onTabChange?: (tab: string) => void
}

export default function SubPageLayout({
  children,
  title,
  icon,
  iconBg = 'linear-gradient(135deg, #0A84FF, #A259FF)',
  backPath = '/dashboard',
  actions,
  tabs,
  activeTab,
  onTabChange,
}: SubPageLayoutProps) {
  const router = useRouter()

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-main)' }}>
      {/* Top Navigation Bar */}
      <div style={{
        height: '52px',
        background: 'var(--bg-nav)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        paddingInline: '20px',
        gap: '12px',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        {/* Back button */}
        <button
          onClick={() => router.push(backPath)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-ar)',
          }}
        >
          <ChevronLeft size={16} />
          لوحة القيادة
        </button>

        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

        {/* Title + Icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '8px',
            background: iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-ar)' }}>{title}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Tabs */}
        {tabs && (
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-input)', borderRadius: '8px', padding: '2px' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange?.(tab.id)}
                style={{
                  padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ar)',
                  background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        {actions}
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        {children}
      </div>
    </div>
  )
}
