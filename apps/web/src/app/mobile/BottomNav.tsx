'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Home, TrendingUp, Zap, Wallet, MoreHorizontal } from 'lucide-react'

const NAV = [
  { label: 'الرئيسية', href: '/mobile', icon: Home },
  { label: 'الشارت', href: '/mobile/chart', icon: TrendingUp },
  { label: 'تداول', href: '/mobile/trade', icon: Zap },
  { label: 'المحفظة', href: '/mobile/wallet', icon: Wallet },
  { label: 'المزيد', href: '/mobile/more', icon: MoreHorizontal },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav className="m-nav">
      {NAV.map((item) => {
        const Icon = item.icon
        const active = item.href === '/mobile'
          ? pathname === '/mobile'
          : pathname.startsWith(item.href)
        return (
          <button
            key={item.href}
            className={`m-nav-btn ${active ? 'm-nav-btn--active' : ''}`}
            onClick={() => router.push(item.href)}
            aria-label={item.label}
          >
            <Icon size={20} color={active ? '#00D4FF' : 'rgba(255,255,255,0.4)'} />
            <span className="m-nav-label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
