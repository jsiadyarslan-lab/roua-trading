'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { Home, TrendingUp, Zap, Wallet, MoreHorizontal } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'الرئيسية', href: '/mobile', icon: Home },
  { label: 'الشارت', href: '/mobile/chart', icon: TrendingUp },
  { label: 'تداول', href: '/mobile/trade', icon: Zap },
  { label: 'المحفظة', href: '/mobile/wallet', icon: Wallet },
  { label: 'المزيد', href: '/mobile/more', icon: MoreHorizontal },
]

export default function FluxShell() {
  const pathname = usePathname()
  const router = useRouter()
  const unreadCount = useNotificationStore(s => s.notifications.filter(n => !n.read).length)

  // إخفاء النافبار في صفحة الشارت الكاملة
  const isChartFullscreen = false // سيتم التحكم بها لاحقاً

  const isActive = (href: string) => {
    if (href === '/mobile') return pathname === '/mobile'
    return pathname.startsWith(href)
  }

  return (
    <nav className="f-nav">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        return (
          <button
            key={item.href}
            className={`f-nav__item ${active ? 'f-nav__item--active' : ''}`}
            onClick={() => router.push(item.href)}
            aria-label={item.label}
          >
            <Icon size={20} color={active ? '#00D4FF' : 'rgba(255,255,255,0.4)'} />
            <span className="f-nav__label">{item.label}</span>
            {active && <div className="f-nav__dot" />}
          </button>
        )
      })}
      {/* إشعارات */}
      {unreadCount > 0 && (
        <div className="f-badge" style={{ position: 'fixed', bottom: 'calc(var(--nav-total) + 4px)', right: 'calc(50% - 70px)' }}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </div>
      )}
    </nav>
  )
}
