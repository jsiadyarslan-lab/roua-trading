'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from '@/i18n/navigation'
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
  CreditCard,
  Brain,
  Radar,
  Bell,
  LogOut,
  Loader2,
  LineChart,
} from 'lucide-react'
import { useScopedStyle } from '@/hooks/useScopedStyle'

const NAV_ITEMS = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard, path: '/dashboard/admin' },
  { id: 'technical-analysis', label: 'تحليلات فنية', icon: LineChart, path: '/dashboard/admin/technical-analysis' },
  { id: 'users', label: 'المستخدمون', icon: Users, path: '/dashboard/admin/users' },
  { id: 'subscriptions', label: 'الاشتراكات', icon: CreditCard, path: '/dashboard/admin/subscriptions' },
  { id: 'health', label: 'صحة النظام', icon: Activity, path: '/dashboard/admin/health' },
  { id: 'ai-costs', label: 'تكاليف AI', icon: Brain, path: '/dashboard/admin/ai-costs' },
  { id: 'monitor', label: 'وكيل المراقبة', icon: Radar, path: '/dashboard/admin/monitor' },
  { id: 'trading', label: 'ربط الحسابات', icon: TrendingUp, path: '/dashboard/admin/trading' },
  { id: 'signals', label: 'الإشارات', icon: Zap, path: '/dashboard/admin/signals' },
  { id: 'notifications', label: 'التنبيهات', icon: Bell, path: '/dashboard/admin/notifications' },
  { id: 'logs', label: 'السجلات', icon: ScrollText, path: '/dashboard/admin/system-logs' },
  { id: 'settings', label: 'الإعدادات', icon: Settings, path: '/dashboard/admin/settings' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  useScopedStyle(`.admin-sidebar::-webkit-scrollbar { width: 2px; }
        .admin-sidebar::-webkit-scrollbar-track { background: transparent; }
        .admin-sidebar::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 2px; }
        .admin-nav-item { transition: all 0.18s ease; cursor: pointer; }
        .admin-nav-item:hover { background: rgba(0,229,255,0.06); }
        .admin-nav-item--active { background: rgba(0,229,255,0.10); }
        @media (max-width: 767px) {
          .admin-mobile-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 49; }
          .admin-sidebar-mobile { position: fixed; top: 0; inset-inline-end: 0; bottom: 0; z-index: 50; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4,0,0.2,1); }
          .admin-sidebar-mobile--open { transform: translateX(0); }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`)

  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)

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

  // Auth check - skip for login page
  useEffect(() => {
    if (pathname === '/dashboard/admin/login') {
      setAuthChecked(true)
      setChecking(false)
      return
    }

    let cancelled = false

    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/auth/session')
        if (cancelled) return

        let data: any = { authenticated: false }
        try {
          data = await res.json()
        } catch {
          // Non-JSON response — treat as unauthenticated
        }

        if (cancelled) return

        if (res.ok && data.authenticated) {
          setAuthenticated(true)
          // Only set authChecked on first successful check
          if (!authChecked) {
            setAuthChecked(true)
            setChecking(false)
          }
        } else if (res.status === 401) {
          // Session explicitly expired or invalid — redirect to login
          setAuthenticated(false)
          router.replace('/dashboard/admin/login')
          return
        } else {
          // Other HTTP errors (500, 503, etc.) — don't kick user out on re-checks
          // Only redirect on the initial check, not on periodic re-checks
          if (!authChecked) {
            setAuthenticated(false)
            router.replace('/dashboard/admin/login')
            return
          }
          // On periodic re-checks, keep the current auth state
          console.warn('[admin-layout] Session re-check failed — keeping current state')
        }
      } catch {
        if (cancelled) return
        // Network error — don't redirect on periodic re-checks, only on initial
        if (!authChecked) {
          console.warn('[admin-layout] Initial session check failed — network error')
          setAuthenticated(false)
          router.replace('/dashboard/admin/login')
          return
        }
        // On periodic re-checks, keep the user logged in despite network errors
        console.warn('[admin-layout] Session re-check network error — keeping current state')
      }
    }

    checkAuth()
    const interval = setInterval(checkAuth, 60000) // Re-check every minute
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [pathname, router])

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' })
    } catch {}
    setAuthenticated(false)
    router.push('/dashboard/admin/login')
  }

  // Login page renders without sidebar
  if (pathname === '/dashboard/admin/login') {
    return <>{children}</>
  }

  // Loading state while checking auth
  if (checking || !authChecked) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0B0E14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'inherit',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={32} color={'#00D4FF'} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 15, color: '#9CA3B5', fontFamily: "var(--font-ar)" }}>جارٍ التحقق من الهوية...</div>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  const isActive = (path: string) => {
  

    if (path === '/dashboard/admin') return pathname === '/dashboard/admin'
    return pathname.startsWith(path)
  }

  const sidebarWidth = collapsed ? 64 : 220
  const SIDEBAR_BG = '#0B0E14'
  const SIDEBAR_BORDER = 'rgba(0,229,255,0.08)'
  const ACCENT = '#00D4FF'
  const TEXT = '#F0F2F5'
  const TEXT_MUTED = '#9CA3B5'
  const BG = '#0B0E14'

  return (
    <div style={{ display: 'flex', minHeight: '100%', direction: 'inherit', background: BG }}>
      {/* Scoped styles via useScopedStyle */}{/* Mobile overlay */}
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
          borderInlineStart: `1px solid ${SIDEBAR_BORDER}`,
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
            borderRadius: 'var(--radius-md)',
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
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, fontFamily: "var(--font-ar)", whiteSpace: 'nowrap' }}>لوحة الإدارة</div>
              <div style={{ fontSize: 11, color: ACCENT, fontFamily: "var(--font-mono)", fontWeight: 600 }}>ADMIN PANEL</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  padding: collapsed ? '8px 0' : '8px 16px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderInlineEnd: active ? `3px solid ${ACCENT}` : '3px solid transparent',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <Icon size={16} color={active ? ACCENT : TEXT_MUTED} strokeWidth={active ? 2.2 : 1.8} />
                {!collapsed && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    color: active ? TEXT : TEXT_MUTED,
                    fontFamily: "var(--font-ar)",
                    whiteSpace: 'nowrap',
                  }}>
                    {item.label}
                  </span>
                )}
                {active && !collapsed && (
                  <div style={{
                    position: 'absolute',
                    left: 16,
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: ACCENT,
                    boxShadow: `0 0 6px ${ACCENT}`,
                  }} />
                )}
              </div>
            )
          })}
        </nav>

        {/* Logout + Collapse */}
        <div style={{ borderTop: `1px solid ${SIDEBAR_BORDER}`, padding: '8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            onClick={handleLogout}
            className="admin-nav-item"
            role="button"
            tabIndex={0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: collapsed ? '8px 0' : '8px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              color: '#FF4757',
            }}
          >
            <LogOut size={16} />
            {!collapsed && (
              <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "var(--font-ar)", whiteSpace: 'nowrap' }}>
                تسجيل الخروج
              </span>
            )}
          </div>
          {!isMobile && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'توسيع الشريط الجانبي' : 'تصغير الشريط الجانبي'}
              style={{
                background: 'transparent',
                border: `1px solid ${SIDEBAR_BORDER}`,
                borderRadius: 'var(--radius-sm)',
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
          )}
        </div>
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
                borderRadius: 'var(--radius-sm)',
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
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, fontFamily: "var(--font-ar)" }}>لوحة الإدارة</span>
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
