'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Home, TrendingUp, Zap, Wallet, MoreHorizontal } from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('mobile.bottomNav')

  const NAV = [
    { label: t('home'), href: '/mobile', icon: Home },
    { label: t('chart'), href: '/mobile/chart', icon: TrendingUp },
    { label: t('trade'), href: '/mobile/trade', icon: Zap },
    { label: t('wallet'), href: '/mobile/wallet', icon: Wallet },
    { label: t('more'), href: '/mobile/more', icon: MoreHorizontal },
  ]

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
