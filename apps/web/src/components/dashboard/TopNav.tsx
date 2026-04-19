'use client'

import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard, Briefcase, Brain, Radar, FileText, Newspaper, Settings, Bell, User } from 'lucide-react'

const navItems = [
  { icon: LayoutDashboard, label: 'لوحة القيادة', path: '/dashboard' },
  { icon: Briefcase, label: 'المحفظة', path: '/dashboard/sanctuary' },
  { icon: Brain, label: 'التحليل الذكي', path: '/dashboard/signals' },
  { icon: Radar, label: 'الماسح', path: '/dashboard/signals' },
  { icon: FileText, label: 'التقارير', path: '/dashboard/positions' },
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
        paddingInline: '12px',
        gap: '4px',
        position: 'relative',
        zIndex: 30,
      }}
    >
      {/* Navigation Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1px', flex: '1 1 0%' }}>
        {navItems.map((item) => {
          const isActive = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path))
          return (
            <button
              key={item.label}
              onClick={() => router.push(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                position: 'relative',
                background: isActive ? 'var(--bg-active)' : 'transparent',
                border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--bg-row-hover)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <item.icon
                size={13}
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  filter: isActive ? 'drop-shadow(0 0 4px rgba(10,132,255,0.5))' : 'none',
                  transition: 'color 0.15s',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-ar)',
                  fontSize: '11px',
                  fontWeight: isActive ? 700 : 600,
                  letterSpacing: '0.02em',
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  textShadow: isActive ? '0 0 8px rgba(10,132,255,0.3)' : 'none',
                  transition: 'color 0.15s',
                }}
              >
                {item.label}
              </span>
              {/* Active indicator */}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  bottom: '-1px',
                  insetInline: '6px',
                  height: '2px',
                  background: 'linear-gradient(90deg, var(--accent), var(--purple))',
                  borderRadius: '2px',
                  boxShadow: '0 0 8px rgba(10,132,255,0.5)',
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Right Side Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* LIVE Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          borderRadius: '6px',
          background: 'var(--profit-bg)',
          border: '1px solid var(--border-profit)',
        }}>
          <div className="pulse-live" />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            fontWeight: 800,
            color: 'var(--profit)',
            letterSpacing: '0.08em',
          }}>LIVE</span>
        </div>

        {/* Notifications */}
        <button style={{
          width: '28px',
          height: '28px',
          borderRadius: '7px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          cursor: 'pointer',
          position: 'relative',
        }}>
          <Bell size={13} style={{ color: 'var(--text-muted)' }} />
          <div style={{
            position: 'absolute',
            top: '3px',
            right: '3px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--loss)',
            boxShadow: '0 0 4px var(--loss)',
          }} />
        </button>

        {/* User Avatar */}
        <button style={{
          width: '28px',
          height: '28px',
          borderRadius: '7px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--accent), var(--purple))',
          border: '1px solid var(--accent-border)',
          cursor: 'pointer',
        }}>
          <User size={13} style={{ color: '#fff' }} />
        </button>
      </div>
    </nav>
  )
}
