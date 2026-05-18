'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import {
  Home, BarChart2, Wallet, TrendingUp, Settings, Grid3X3, X,
  Brain, FlaskConical, ScanSearch, Radio, Newspaper, HelpCircle,
  Activity, Zap, Target, BellRing, UserCircle, Link2, CreditCard,
  Fingerprint, Users, GitMerge, Trophy, Eye, Cpu, Code,
  CalendarDays, Shield, Store
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'الرئيسية', href: '/mobile', icon: Home },
  { label: 'الأسواق', href: '/mobile/markets', icon: BarChart2 },
  { label: 'الشارت', href: '/mobile/chart', icon: TrendingUp },
  { label: '__wallet__', href: '/mobile/wallet', icon: Wallet },
  { label: 'الإعدادات', href: '/mobile/settings', icon: Settings },
  { label: '__more__', href: '__more__', icon: Grid3X3 },
]

const MORE_CATEGORIES = [
  {
    title: 'التداول',
    items: [
      { label: 'المراكز المفتوحة', href: '/mobile/positions', icon: Activity },
      { label: 'التداول الحي', href: '/mobile/trading', icon: Zap },
      { label: 'الاستراتيجيات', href: '/mobile/strategies', icon: FlaskConical },
      { label: 'محرر الاستراتيجيات', href: '/mobile/strategy-builder', icon: GitMerge },
      { label: 'اختبار الاستراتيجيات', href: '/mobile/strategies/backtest', icon: FlaskConical },
      { label: 'التداول الاجتماعي', href: '/mobile/social', icon: Users },
      { label: 'متابعة الحسابات', href: '/mobile/copy-trading', icon: Eye },
      { label: 'لوحة الصدارة', href: '/mobile/leaderboard', icon: Trophy },
      { label: 'وكيل التداول', href: '/mobile/agent', icon: Cpu },
      { label: 'المتجر', href: '/mobile/marketplace', icon: Store },
    ],
  },
  {
    title: 'الأدوات',
    items: [
      { label: 'التحليلات', href: '/mobile/ai', icon: Brain },
      { label: 'سكانر السوق', href: '/mobile/scanner', icon: ScanSearch },
      { label: 'التوصيات', href: '/mobile/signals', icon: Radio },
      { label: 'التنبؤات', href: '/mobile/prediction-market', icon: Target },
      { label: 'AI Lab', href: '/mobile/neural', icon: Brain },
      { label: 'الارتباط', href: '/mobile/correlation', icon: GitMerge },
      { label: 'الأجندة', href: '/mobile/calendar', icon: CalendarDays },
      { label: 'ملاذ المحفظة', href: '/mobile/sanctuary', icon: Shield },
      { label: 'الأخبار', href: '/mobile/news', icon: Newspaper },
      { label: 'الإشعارات', href: '/mobile/notifications', icon: BellRing },
      { label: 'API', href: '/mobile/api-docs', icon: Code },
    ],
  },
  {
    title: 'الحساب',
    items: [
      { label: 'الملف الشخصي', href: '/mobile/profile', icon: UserCircle },
      { label: 'ربط الحسابات', href: '/mobile/kyc', icon: Link2 },
      { label: 'إعدادات البورصة', href: '/mobile/settings/exchange', icon: CreditCard },
      { label: 'الفواتير', href: '/mobile/billing', icon: CreditCard },
      { label: 'الأمان', href: '/mobile/security', icon: Fingerprint },
      { label: 'المساعدة', href: '/mobile/help', icon: HelpCircle },
    ],
  },
]

export default function MobileNavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  const notifications = useNotificationStore(s => s.notifications)
  const unreadCount = notifications.filter(n => !n.read).length

  const isActive = (href: string) => {
    if (href === '/mobile') return pathname === '/mobile'
    return pathname.startsWith(href)
  }

  return (
    <>
      <nav className="m-nav">
        {NAV_ITEMS.map((item) => {
          if (item.href === '__wallet__') {
            const active = isActive(item.href)
            return (
              <button
                key={item.href}
                className={`m-nav-wallet ${active ? 'm-nav-wallet--active' : ''}`}
                onClick={() => router.push(item.href)}
                aria-label={item.label}
              >
                <Wallet size={20} color={active ? '#000' : '#00D4FF'} />
              </button>
            )
          }
          if (item.href === '__more__') {
            return (
              <button
                key="__more__"
                className={`m-nav-btn ${moreOpen ? 'm-nav-btn--active' : ''}`}
                onClick={() => setMoreOpen(true)}
                aria-label={item.label}
              >
                <Grid3X3 size={20} />
                <span className="m-nav-btn__label">{item.label}</span>
                {moreOpen && <div className="m-nav-btn__dot" />}
              </button>
            )
          }
          const active = isActive(item.href)
          return (
            <button
              key={item.href}
              className={`m-nav-btn ${active ? 'm-nav-btn--active' : ''}`}
              onClick={() => router.push(item.href)}
              aria-label={item.label}
            >
              <item.icon size={20} />
              <span className="m-nav-btn__label">{item.label}</span>
              {item.href === '/mobile' && unreadCount > 0 && (
                <span className="m-nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
              {active && <div className="m-nav-btn__dot" />}
            </button>
          )
        })}
      </nav>

      {/* More Bottom Sheet */}
      {moreOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setMoreOpen(false)}
        >
          <div
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: '#1A1D29', borderRadius: '20px 20px 0 0',
              padding: '12px 16px 24px', maxHeight: '70vh', overflowY: 'auto',
              direction: 'rtl', fontFamily: "'Cairo', sans-serif",
              borderTop: '0.5px solid rgba(0,212,255,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#F0F2F5' }}>المزيد</span>
              <button onClick={() => setMoreOpen(false)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} color="rgba(255,255,255,0.5)" />
              </button>
            </div>
            {MORE_CATEGORIES.map((cat) => (
              <div key={cat.title} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#00D4FF', marginBottom: 8, letterSpacing: 1 }}>{cat.title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {cat.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.href}
                        onClick={() => { setMoreOpen(false); router.push(item.href) }}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          padding: '10px 4px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
                          border: '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', touchAction: 'manipulation',
                        }}
                      >
                        <Icon size={18} color="rgba(255,255,255,0.6)" />
                        <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.2 }}>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
