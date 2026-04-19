'use client'

import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard, Briefcase, Brain, Radar, FileText, Newspaper, Settings } from 'lucide-react'

const navItems = [
  { icon: LayoutDashboard, label: 'لوحة القيادة', path: '/dashboard' },
  { icon: Briefcase, label: 'المحفظة', path: '/dashboard/sanctuary' },
  { icon: Brain, label: 'التحليل الذكي', path: '/dashboard/signals' },
  { icon: Radar, label: 'الماسح الذكي', path: '/dashboard' },
  { icon: FileText, label: 'التقارير', path: '/dashboard' },
  { icon: Newspaper, label: 'الأخبار', path: '/dashboard' },
  { icon: Settings, label: 'الإعدادات', path: '/dashboard/settings/exchange' },
]

export default function TopNav() {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <nav
      id="top-nav"
      style={{
        gridArea: 'topnav',
        width: '100%',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        background: 'var(--bg-nav)',
        backdropFilter: 'blur(20px) saturate(160%)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 0 var(--accent-bg), var(--shadow-sm)',
        paddingInline: '16px',
        gap: '8px',
        position: 'relative',
        zIndex: 30,
      }}
    >
      {/* Navigation links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: '1 1 0%' }}>
        {navItems.map((item) => {
          const isActive = pathname === item.path
          return (
            <button
              key={item.label}
              onClick={() => router.push(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                position: 'relative',
                background: isActive ? 'var(--bg-active)' : 'transparent',
                border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
                transition: 'border-color 0.15s',
              }}
            >
              <item.icon
                size={14}
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  filter: isActive ? 'drop-shadow(0 0 4px rgba(10,132,255,0.6))' : 'none',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-ar)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  textShadow: isActive ? '0 0 8px rgba(10,132,255,0.4)' : 'none',
                  transition: 'color 0.15s',
                }}
              >
                {item.label}
              </span>
              {/* Active indicator bar */}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-1px',
                    insetInline: '8px',
                    height: '2px',
                    background: 'linear-gradient(90deg, #0A84FF, #A259FF)',
                    borderRadius: '2px',
                    boxShadow: '0 0 8px rgba(10,132,255,0.6)',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Right side: WS status + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 9px', borderRadius: '6px', background: 'var(--profit-bg)', border: '1px solid var(--border-profit)' }}>
          <div className="pulse-live" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--profit)' }}>LIVE</span>
        </div>
      </div>
    </nav>
  )
}
