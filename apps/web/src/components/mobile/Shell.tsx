'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import {
  Home, BarChart2, TrendingUp, Wallet, Settings, Grid3X3,
  X, Brain, FlaskConical, ScanSearch, Radio, Newspaper, HelpCircle,
  Activity, Zap, Target, BellRing, UserCircle, Link2, CreditCard,
  Fingerprint, Users, GitMerge, Trophy, Eye, Cpu, Code,
  CalendarDays, Shield, Store
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   ROUA MOBILE — Orbital Navigation System
   No tab bar. No bottom bar. One floating button that opens
   a radial menu. Chart pages get 100% viewport.
   ═══════════════════════════════════════════════════════════════ */

// ── Types ──
type NavItem = {
  label: string
  href: string
  icon: any
  color: string
  sub?: string
  isNew?: boolean
}

type RadialItem = {
  label: string
  href: string
  icon: any
  color: string
}

// ── Radial navigation items (5 max for ergonomics) ──
const RADIAL_ITEMS: RadialItem[] = [
  { label: 'الرئيسية', href: '/mobile', icon: Home, color: '#00D4FF' },
  { label: 'الأسواق', href: '/mobile/markets', icon: BarChart2, color: '#B388FF' },
  { label: 'الشارت', href: '/mobile/chart', icon: TrendingUp, color: '#00FFA3' },
  { label: 'المحفظة', href: '/mobile/wallet', icon: Wallet, color: '#FFB800' },
  { label: 'الإعدادات', href: '/mobile/settings', icon: Settings, color: '#8B92A8' },
]

// ── "More" categories for the expanded menu ──
type MoreItem = { label: string; href: string; icon: any; color: string; isNew?: boolean; sub?: string }
type MoreCategory = { title: string; items: MoreItem[] }

const MORE_CATEGORIES: MoreCategory[] = [
  {
    title: 'التداول',
    items: [
      { label: 'المراكز', href: '/mobile/positions', icon: Activity, color: '#00C853', sub: 'تتبع صفقاتك' },
      { label: 'التداول الحي', href: '/mobile/trading', icon: Zap, color: '#00D4FF', sub: 'تداول مباشر' },
      { label: 'الاستراتيجيات', href: '/mobile/strategies', icon: FlaskConical, color: '#B388FF', sub: 'اختبر وبنِ' },
      { label: 'محرر الاستراتيجيات', href: '/mobile/strategy-builder', icon: GitMerge, color: '#00D4FF', isNew: true, sub: 'No-Code' },
      { label: 'اختبار الاستراتيجيات', href: '/mobile/strategies/backtest', icon: FlaskConical, color: '#FF9F43', isNew: true, sub: 'Backtest' },
      { label: 'التداول الاجتماعي', href: '/mobile/social', icon: Users, color: '#FF6B9D', sub: 'تابع الأفضل' },
      { label: 'متابعة الحسابات', href: '/mobile/copy-trading', icon: Eye, color: '#10B981', isNew: true, sub: 'Copy Trading' },
      { label: 'لوحة الصدارة', href: '/mobile/leaderboard', icon: Trophy, color: '#FFB800', isNew: true, sub: 'الأفضل' },
      { label: 'وكيل التداول', href: '/mobile/agent', icon: Cpu, color: '#FF9F43', sub: 'ذكاء اصطناعي' },
      { label: 'المتجر', href: '/mobile/marketplace', icon: Store, color: '#00D4FF', isNew: true, sub: 'استراتيجيات' },
    ],
  },
  {
    title: 'الأدوات',
    items: [
      { label: 'التحليلات', href: '/mobile/ai', icon: Brain, color: '#B388FF', sub: '6 نماذج AI' },
      { label: 'سكانر السوق', href: '/mobile/scanner', icon: ScanSearch, color: '#00FFA3', sub: 'فرص لحظية' },
      { label: 'التوصيات', href: '/mobile/signals', icon: Radio, color: '#FFB800', sub: 'توصيات احترافية' },
      { label: 'التنبؤات', href: '/mobile/prediction-market', icon: Target, color: '#00D4FF', isNew: true, sub: 'AI vs السوق' },
      { label: 'AI Lab', href: '/mobile/neural', icon: Brain, color: '#A259FF', isNew: true, sub: 'مختبر ذكي' },
      { label: 'الارتباط', href: '/mobile/correlation', icon: GitMerge, color: '#00D4FF', isNew: true, sub: 'بيرسون' },
      { label: 'الأجندة', href: '/mobile/calendar', icon: CalendarDays, color: '#FFB800', isNew: true, sub: 'أحداث اقتصادية' },
      { label: 'ملاذ المحفظة', href: '/mobile/sanctuary', icon: Shield, color: '#FFB800', isNew: true, sub: 'تحليل مخاطر' },
      { label: 'الأخبار', href: '/mobile/news', icon: Newspaper, color: '#d4af37', sub: 'أخبار لحظية' },
      { label: 'الإشعارات', href: '/mobile/notifications', icon: BellRing, color: '#FF4757', sub: 'تنبيهات' },
      { label: 'API', href: '/mobile/api-docs', icon: Code, color: '#00D4FF', isNew: true, sub: 'المرجع البرمجي' },
    ],
  },
  {
    title: 'الحساب',
    items: [
      { label: 'الملف الشخصي', href: '/mobile/profile', icon: UserCircle, color: '#00D4FF', sub: 'معلوماتك' },
      { label: 'ربط الحسابات', href: '/mobile/kyc', icon: Link2, color: '#00FFA3', sub: 'ربط الوساطة' },
      { label: 'إعدادات البورصة', href: '/mobile/settings/exchange', icon: Link2, color: '#00D4FF', isNew: true, sub: 'مفاتيح API' },
      { label: 'الفواتير', href: '/mobile/billing', icon: CreditCard, color: '#d4af37', sub: 'الاشتراكات' },
      { label: 'الأمان', href: '/mobile/security', icon: Fingerprint, color: '#32D74B', sub: '2FA' },
      { label: 'المساعدة', href: '/mobile/help', icon: HelpCircle, color: '#8B92A8', sub: 'الدعم' },
    ],
  },
]

export default function Shell() {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const unreadCount = useNotificationStore(s => s.notifications.filter(n => !n.read).length)

  // Hide orbital on chart page when user is interacting
  const isChartPage = pathname === '/mobile/chart'

  const isActive = (href: string) => {
    if (href === '/mobile') return pathname === '/mobile'
    return pathname.startsWith(href)
  }

  const navigate = useCallback((href: string) => {
    router.push(href)
    setMenuOpen(false)
    setMoreOpen(false)
  }, [router])

  // Close menus on route change
  useEffect(() => {
    setMenuOpen(false)
    setMoreOpen(false)
  }, [pathname])

  // Close menus on back gesture
  useEffect(() => {
    const handlePopState = () => {
      setMenuOpen(false)
      setMoreOpen(false)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return (
    <>
      {/* ── Quick Access Bar (subtle, at bottom center) ── */}
      {!isChartPage && !menuOpen && !moreOpen && (
        <div className="r-quick-bar">
          {RADIAL_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <button
                key={item.href}
                className={`r-quick-bar__item ${active ? 'r-quick-bar__item--active' : ''}`}
                onClick={() => navigate(item.href)}
                aria-label={item.label}
              >
                <Icon size={18} color={active ? '#00D4FF' : 'rgba(255,255,255,0.4)'} />
              </button>
            )
          })}
          {/* More button */}
          <button
            className="r-quick-bar__item"
            onClick={() => setMoreOpen(true)}
            aria-label="المزيد"
          >
            <Grid3X3 size={18} color="rgba(255,255,255,0.4)" />
          </button>
          {/* Notification badge */}
          {unreadCount > 0 && (
            <div style={{
              position: 'absolute', top: -2, right: '50%', transform: 'translateX(50%)',
              minWidth: 16, height: 16, borderRadius: 8,
              background: 'linear-gradient(135deg, #ff453a, #ff6b6b)',
              fontSize: 9, fontWeight: 900, color: '#fff', fontFamily: 'var(--font-mono)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              pointerEvents: 'none',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </div>
      )}

      {/* ── Orbital Button ── */}
      {!isChartPage && (
        <button
          className={`r-orbital ${menuOpen ? 'r-orbital--open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'إغلاق' : 'فتح القائمة'}
        >
          {menuOpen ? (
            <X size={22} color="#FFF" strokeWidth={2.5} />
          ) : (
            <Grid3X3 size={20} color="rgba(0,212,255,0.9)" strokeWidth={2} />
          )}
        </button>
      )}

      {/* ── Radial Menu Backdrop ── */}
      {menuOpen && (
        <div
          className={`r-radial__backdrop ${menuOpen ? 'r-radial__backdrop--visible' : ''}`}
          onClick={() => setMenuOpen(false)}
          style={{ zIndex: 'var(--z-modal-backdrop)' }}
        />
      )}

      {/* ── Radial Menu Items ── */}
      {menuOpen && (
        <div className="r-radial" style={{ zIndex: 'var(--z-modal)' }}>
          {RADIAL_ITEMS.map((item, index) => {
            const Icon = item.icon
            const active = isActive(item.href)
            // Position items in an arc above the orbital button
            const angle = -90 + (index - 2) * 35 // spread from -90° center
            const radius = 90
            const radian = (angle * Math.PI) / 180
            const x = Math.cos(radian) * radius
            const y = -Math.sin(radian) * radius

            return (
              <button
                key={item.href}
                className={`r-radial__item ${active ? 'r-radial__item--active' : ''} ${menuOpen ? 'r-radial__item--visible' : ''}`}
                style={{
                  transform: menuOpen ? `translate(${x}px, ${y}px) scale(1)` : 'scale(0)',
                  transitionDelay: `${index * 40}ms`,
                }}
                onClick={() => navigate(item.href)}
                aria-label={item.label}
              >
                <Icon size={20} color={active ? '#00D4FF' : item.color} />
                <span className="r-radial__label">{item.label}</span>
              </button>
            )
          })}
          {/* More button in radial */}
          <button
            className={`r-radial__item ${menuOpen ? 'r-radial__item--visible' : ''}`}
            style={{
              transform: menuOpen ? `translate(0px, ${-90 * 2}px) scale(1)` : 'scale(0)',
              transitionDelay: `${RADIAL_ITEMS.length * 40}ms`,
            }}
            onClick={() => { setMenuOpen(false); setMoreOpen(true) }}
            aria-label="المزيد"
          >
            <Grid3X3 size={20} color="#8B92A8" />
            <span className="r-radial__label">المزيد</span>
          </button>
        </div>
      )}

      {/* ── "More" Expanded Sheet ── */}
      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              zIndex: 'var(--z-modal-backdrop)',
            }}
          />
          <div
            className="r-ai-panel r-ai-panel--open"
            style={{ zIndex: 'var(--z-modal)' }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 10px', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,212,255,0.3)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', marginBottom: 12, flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#F0F2F5', fontFamily: 'var(--font-cairo)' }}>استكشف المزيد</span>
              <button onClick={() => setMoreOpen(false)} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={18} color="rgba(255,255,255,0.5)" />
              </button>
            </div>

            {/* Categories */}
            <div className="r-no-scroll" style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
              {MORE_CATEGORIES.map((cat) => (
                <div key={cat.title} style={{ marginBottom: 12 }}>
                  <div style={{ padding: '8px 0 6px', direction: 'rtl' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-cairo)', letterSpacing: '0.05em' }}>{cat.title}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, direction: 'rtl' }}>
                    {cat.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.href}
                          onClick={() => navigate(item.href)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                            padding: '12px 2px', borderRadius: 14, position: 'relative',
                            background: 'rgba(255,255,255,0.04)',
                            border: `1px solid ${item.isNew ? `${item.color}30` : 'rgba(255,255,255,0.06)'}`,
                            cursor: 'pointer', touchAction: 'manipulation',
                          }}
                        >
                          {item.isNew && <div style={{ position: 'absolute', top: 4, insetInlineStart: 4, width: 6, height: 6, borderRadius: '50%', background: item.color, boxShadow: `0 0 8px ${item.color}` }} />}
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${item.color}30`, pointerEvents: 'none' }}>
                            <Icon size={16} color={item.color} />
                          </div>
                          <span style={{ fontSize: 10, color: item.isNew ? '#F0F2F5' : 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-cairo)', lineHeight: 1.2, textAlign: 'center', fontWeight: item.isNew ? 700 : 500, pointerEvents: 'none' }}>{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
