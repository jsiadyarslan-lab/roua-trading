'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

function IconHome({ active }: { active: boolean }) {
  const c = active ? '#00D4FF' : 'rgba(255,255,255,0.35)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 10L12 3l9 7v10a1 1 0 01-1 1H5a1 1 0 01-1-1V10z"
        stroke={c} strokeWidth={active ? 2 : 1.5} strokeLinejoin="round"
        fill={active ? 'rgba(0,212,255,0.15)' : 'none'} />
      <path d="M9 21V13h6v8" stroke={c} strokeWidth={active ? 2 : 1.5} strokeLinecap="round" />
    </svg>
  )
}

function IconChart({ active }: { active: boolean }) {
  const c = active ? '#00D4FF' : 'rgba(255,255,255,0.35)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <polyline points="3,17 8,12 13,15 21,7"
        stroke={c} strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round"
        fill="none" />
      <path d="M3 21h18" stroke={c} strokeWidth="1" opacity="0.3" />
      <circle cx="8" cy="12" r="1.5" fill={active ? '#00D4FF' : 'none'} stroke={c} strokeWidth={active ? 0 : 1} />
      <circle cx="13" cy="15" r="1.5" fill={active ? '#00D4FF' : 'none'} stroke={c} strokeWidth={active ? 0 : 1} />
      <circle cx="21" cy="7" r="1.5" fill={active ? '#00D4FF' : 'none'} stroke={c} strokeWidth={active ? 0 : 1} />
    </svg>
  )
}

function IconTrade({ active }: { active: boolean }) {
  const c = active ? '#00D4FF' : 'rgba(255,255,255,0.35)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M13 2L4.5 13.5H11l-1.5 8.5L20 9.5H13.5L15 2z"
        stroke={c} strokeWidth={active ? 2 : 1.5} strokeLinejoin="round"
        fill={active ? 'rgba(0,212,255,0.15)' : 'none'} />
    </svg>
  )
}

function IconWallet({ active }: { active: boolean }) {
  const c = active ? '#00D4FF' : 'rgba(255,255,255,0.35)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="20" height="14" rx="2"
        stroke={c} strokeWidth={active ? 2 : 1.5}
        fill={active ? 'rgba(0,212,255,0.1)' : 'none'} />
      <path d="M2 10h20" stroke={c} strokeWidth={active ? 1.5 : 1} opacity="0.5" />
      <path d="M7 6V4a1 1 0 011-1h8a1 1 0 011 1v2" stroke={c} strokeWidth={active ? 2 : 1.5} />
      <circle cx="16.5" cy="15" r="1.5"
        fill={active ? '#00D4FF' : 'none'} stroke={active ? 'none' : c} strokeWidth="1.5" />
    </svg>
  )
}

function IconMore({ active }: { active: boolean }) {
  const c = active ? '#00D4FF' : 'rgba(255,255,255,0.35)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="12" r="1.5" fill={c} />
      <circle cx="12" cy="12" r="1.5" fill={c} />
      <circle cx="19" cy="12" r="1.5" fill={c} />
    </svg>
  )
}

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('mobile.bottomNav')

  const NAV = [
    { label: t('home'),  href: '/mobile',         Icon: IconHome  },
    { label: t('chart'), href: '/mobile/chart',    Icon: IconChart },
    { label: t('trade'), href: '/mobile/trade',    Icon: IconTrade },
    { label: t('wallet'),href: '/mobile/wallet',   Icon: IconWallet},
    { label: t('more'),  href: '/mobile/more',     Icon: IconMore  },
  ]

  return (
    <nav className="m-nav">
      {NAV.map((item) => {
        const active = item.href === '/mobile'
          ? pathname === '/mobile'
          : pathname.startsWith(item.href)
        return (
          <button
            key={item.href}
            className={`m-nav-btn ${active ? 'm-nav-btn--active' : ''}`}
            onClick={() => router.push(item.href)}
            aria-label={item.label}
            style={{ position: 'relative' }}
          >
            {active && (
              <div style={{
                position: 'absolute', top: 0, left: '50%',
                transform: 'translateX(-50%)',
                width: 28, height: 2,
                background: '#00D4FF',
                borderRadius: '0 0 2px 2px',
                boxShadow: '0 0 8px rgba(0,212,255,0.7)',
              }} />
            )}
            <div style={{
              width: 36, height: 36,
              borderRadius: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? 'rgba(0,212,255,0.09)' : 'transparent',
              transition: 'background 0.15s',
            }}>
              <item.Icon active={active} />
            </div>
            <span className="m-nav-label" style={{
              color: active ? '#00D4FF' : 'rgba(255,255,255,0.35)',
              fontWeight: active ? 800 : 500,
            }}>
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
