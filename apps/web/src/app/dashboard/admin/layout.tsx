'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Activity,
  TrendingUp,
  Zap,
  ScrollText,
  Settings,
  Shield,
  ChevronLeft,
  Menu,
} from 'lucide-react'

const NAV_ITEMS = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard, path: '/dashboard/admin' },
  { id: 'users', label: 'المستخدمون', icon: Users, path: '/dashboard/admin/users' },
  { id: 'health', label: 'صحة النظام', icon: Activity, path: '/dashboard/admin/health' },
  { id: 'trading', label: 'التداول', icon: TrendingUp, path: '/dashboard/admin/trading' },
  { id: 'signals', label: 'الإشارات', icon: Zap, path: '/dashboard/admin/signals' },
  { id: 'logs', label: 'السجلات', icon: ScrollText, path: '/dashboard/admin/logs' },
  { id: 'settings', label: 'الإعدادات', icon: Settings, path: '/dashboard/admin/settings' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setMobileOpen(false)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const isActive = (path: string) => {
    if (path === '/dashboard/admin') return pathname === '/dashboard/admin'
    return pathname.startsWith(path)
  }

  const sidebarWidth = collapsed ? 64 : 220
  const SIDEBAR_BG = '#0D1017'
  const SIDEBAR_BORDER = 'rgba(0,229,255,0.08)'
  const ACCENT = '#00E5FF'
  const TEXT = '#F0F2F5'
  const TEXT_MUTED = '#8B92A8'
  const BG = '#0B0E14'

  return (
    <div style={{ display: 'flex', minHeight: '100%', direction: 'rtl', background: BG }}>
      <style>{`
        .admin-sidebar::-webkit-scrollbar { width: 2px; }
        .admin-sidebar::-webkit-scrollbar-track { background: transparent; }
        .admin-sidebar::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 2px; }
        .admin-nav-item { transition: all 0.18s ease; cursor: pointer; }
        .admin-nav-item:hover { background: rgba(0,229,255,0.06); }
        .admin-nav-item--active { background: rgba(0,229,255,0.10); border-right: 3px solid ${ACCENT}; }
        @media (max-width: 767px) {
          .admin-mobile-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 49; }
          .admin-sidebar-mobile { position: fixed; top: 0; right: 0; bottom: 0; z-index: 50; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4,0,0.2,1); }
          .admin-sidebar-mobile--open { transform: translateX(0); }
        }
      `}</style>

      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div className="admin-mobile-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`admin-sidebar${isMobile ? ' admin-sidebar-mobile' + (mobileOpen ? ' admin-sidebar-mobile--open' : '') : ''}`}
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          background: SIDEBAR_BG,
          borderLeft: `1px solid ${SIDEBAR_BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'width 0.2s ease, min-width 0.2s ease',
        }}
      >
        {/* Admin header */}
        <div style={{
          padding: collapsed ? '16px 8px' : '16px 16px',
          borderBottom: `1px solid ${SIDEBAR_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 56,
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #00E5FF, #0A84FF)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Shield size={16} color="#000" strokeWidth={2.5} />
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap' }}>لوحة الإدارة</div>
              <div style={{ fontSize: 9, color: ACCENT, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>ADMIN PANEL</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            return (
              <div
                key={item.id}
                className={`admin-nav-item${active ? ' admin-nav-item--active' : ''}`}
                onClick={() => {
                  router.push(item.path)
                  if (isMobile) setMobileOpen(false)
                }}
                role="button"
                tabIndex={0}
                aria-label={item.label}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { router.push(item.path); if (isMobile) setMobileOpen(false) } }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: collapsed ? '10px 0' : '10px 16px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRight: active ? `3px solid ${ACCENT}` : '3px solid transparent',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <Icon size={18} color={active ? ACCENT : TEXT_MUTED} strokeWidth={active ? 2.2 : 1.8} />
                {!collapsed && (
                  <span style={{
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    color: active ? TEXT : TEXT_MUTED,
                    fontFamily: "'Cairo', sans-serif",
                    whiteSpace: 'nowrap',
                  }}>
                    {item.label}
                  </span>
                )}
                {active && !collapsed && (
                  <div style={{
                    position: 'absolute',
                    left: 16,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: ACCENT,
                    boxShadow: `0 0 8px ${ACCENT}`,
                  }} />
                )}
              </div>
            )
          })}
        </nav>

        {/* Collapse button (desktop only) */}
        {!isMobile && (
          <div style={{
            padding: '8px',
            borderTop: `1px solid ${SIDEBAR_BORDER}`,
            display: 'flex',
            justifyContent: 'center',
          }}>
            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'توسيع الشريط الجانبي' : 'تصغير الشريط الجانبي'}
              style={{
                background: 'transparent',
                border: `1px solid ${SIDEBAR_BORDER}`,
                borderRadius: 6,
                color: TEXT_MUTED,
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
              }}
            >
              <ChevronLeft size={14} style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: `1px solid ${SIDEBAR_BORDER}`,
            background: SIDEBAR_BG,
          }}>
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="فتح القائمة"
              style={{
                background: 'transparent',
                border: `1px solid ${SIDEBAR_BORDER}`,
                borderRadius: 6,
                color: TEXT_MUTED,
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Menu size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={16} color={ACCENT} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, fontFamily: "'Cairo', sans-serif" }}>لوحة الإدارة</span>
            </div>
          </div>
        )}
        <div style={{ flex: 1, padding: 16 }}>
          {children}
        </div>
      </main>
    </div>
  )
}
