'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Home, BarChart2, Wallet, TrendingUp, Settings,
  Grid3X3, Brain, FlaskConical, ScanSearch, Radio,
  Newspaper, HelpCircle, X, Activity, Zap, Target,
  BellRing, UserCircle, Link2, CreditCard, Fingerprint, Users,
  GitMerge, Trophy, Eye, Cpu, Code, CalendarDays, Shield, Store,
} from 'lucide-react'
import { useNotificationStore } from '@/hooks/useNotificationStore'

const NAV_ITEMS = [
  { label: 'الرئيسية', href: '/mobile', icon: Home },
  { label: 'الأسواق', href: '/mobile/markets', icon: TrendingUp },
  { label: 'الشارت', href: '/mobile/chart', icon: BarChart2 },
  { label: 'المحفظة', href: '/mobile/wallet', icon: Wallet, isCenter: true },
  { label: 'الإعدادات', href: '/mobile/settings', icon: Settings },
  { label: 'المزيد', href: '__more__', icon: Grid3X3 },
]

interface MoreItem {
  label: string
  href: string
  icon: any
  color: string
  isNew?: boolean
  sub?: string
}

interface MoreCategory {
  title: string
  items: MoreItem[]
}

const MORE_CATEGORIES: MoreCategory[] = [
  {
    title: 'التداول',
    items: [
      { label: 'المراكز المفتوحة', href: '/mobile/positions', icon: Activity, color: '#00C853', sub: 'تتبع صفقاتك الحية' },
      { label: 'التداول الحي', href: '/mobile/trading', icon: Zap, color: '#00D4FF', sub: 'تداول مباشر من الجوال' },
      { label: 'الاستراتيجيات', href: '/mobile/strategies', icon: FlaskConical, color: '#B388FF', sub: 'اختبر وبنِ استراتيجياتك' },
      { label: 'محرر الاستراتيجيات', href: '/mobile/strategy-builder', icon: GitMerge, color: '#00D4FF', isNew: true, sub: 'محرر بصري No-Code' },
      { label: 'اختبار الاستراتيجيات', href: '/mobile/strategies/backtest', icon: FlaskConical, color: '#FF9F43', isNew: true, sub: 'Backtest على بيانات تاريخية' },
      { label: 'التداول الاجتماعي', href: '/mobile/social', icon: Users, color: '#FF6B9D', sub: 'تابع أفضل المتداولين' },
      { label: 'متابعة الحسابات', href: '/mobile/copy-trading', icon: Eye, color: '#10B981', isNew: true, sub: 'تابع أداء الحسابات المربوطة' },
      { label: 'لوحة الصدارة', href: '/mobile/leaderboard', icon: Trophy, color: '#FFB800', isNew: true, sub: 'أفضل الحسابات المربوطة' },
      { label: 'وكيل التداول', href: '/mobile/agent', icon: Cpu, color: '#FF9F43', sub: 'تداول ذاتي بالذكاء الاصطناعي' },
      { label: 'المتجر', href: '/mobile/marketplace', icon: Store, color: '#00D4FF', isNew: true, sub: 'استراتيجيات وبوتات ومؤشرات' },
    ],
  },
  {
    title: 'الأدوات',
    items: [
      { label: 'التحليلات', href: '/mobile/ai', icon: Brain, color: '#B388FF', sub: 'رؤى من 6 نماذج AI' },
      { label: 'سكانر السوق', href: '/mobile/scanner', icon: ScanSearch, color: '#00FFA3', sub: 'اكتشف الفرص لحظياً' },
      { label: 'أحدث التوصيات', href: '/mobile/signals', icon: Radio, color: '#FFB800', sub: 'توصيات تداول احترافية' },
      { label: 'الأسواق التنبؤية', href: '/mobile/prediction-market', icon: Target, color: '#00D4FF', isNew: true, sub: 'تنبؤات AI مقابل السوق' },
      { label: 'AI Trading Lab', href: '/mobile/neural', icon: Brain, color: '#A259FF', isNew: true, sub: 'مختبر التداول الذكي' },
      { label: 'مصفوفة الارتباط', href: '/mobile/correlation', icon: GitMerge, color: '#00D4FF', isNew: true, sub: 'ارتباط بيرسون بين الأصول' },
      { label: 'الأجندة الاقتصادية', href: '/mobile/calendar', icon: CalendarDays, color: '#FFB800', isNew: true, sub: 'أحداث اقتصادية مع تحليل AI' },
      { label: 'ملاذ المحفظة', href: '/mobile/sanctuary', icon: Shield, color: '#FFB800', isNew: true, sub: 'تحليل مخاطر وتنويع المحفظة' },
      { label: 'الأخبار', href: '/mobile/news', icon: Newspaper, color: '#d4af37', sub: 'أخبار الأسواق لحظة بلحظة' },
      { label: 'الإشعارات', href: '/mobile/notifications', icon: BellRing, color: '#FF4757', sub: 'تنبيهات البوت والنظام' },
      { label: 'توثيق API', href: '/mobile/api-docs', icon: Code, color: '#00D4FF', isNew: true, sub: 'المرجع البرمجي للمنصة' },
    ],
  },
  {
    title: 'الحساب',
    items: [
      { label: 'الملف الشخصي', href: '/mobile/profile', icon: UserCircle, color: '#00D4FF', sub: 'معلوماتك الشخصية' },
      { label: 'ربط الحسابات', href: '/mobile/kyc', icon: Link2, color: '#00FFA3', sub: 'ربط حسابات الوساطة' },
      { label: 'إعدادات البورصة', href: '/mobile/settings/exchange', icon: Link2, color: '#00D4FF', isNew: true, sub: 'مفاتيح API للبورصات' },
      { label: 'الفواتير والاشتراكات', href: '/mobile/billing', icon: CreditCard, color: '#d4af37', sub: 'إدارة الاشتراك والمدفوعات' },
      { label: 'الأمان و 2FA', href: '/mobile/security', icon: Fingerprint, color: '#32D74B', sub: 'حماية حسابك ومصادقتك' },
      { label: 'المساعدة والدعم', href: '/mobile/help', icon: HelpCircle, color: '#8B92A8', sub: 'مركز المساعدة والتذاكر' },
    ],
  },
]

const ALL_MORE_ITEMS = MORE_CATEGORIES.flatMap(c => c.items)

/**
 * MOBILE NAVBAR (v5 Rebuild)
 *
 * KEY DESIGN DECISIONS:
 * - position: fixed (not flex child, not absolute)
 * - isolation: isolate (creates separate stacking context)
 * - z-index: 9999 (above touch barrier at 9998)
 * - ALL styling via CSS classes, NOT inline
 * - touch-action: manipulation on everything
 * - pointer-events: auto explicitly
 * - NO framer-motion on nav buttons (simpler = more reliable)
 * - Simple HTML buttons (not motion.button) for instant response
 */
export default function MobileNavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const [showMore, setShowMore] = useState(false)
  const unreadCount = useNotificationStore(s => s.notifications.filter(n => !n.read).length)

  const handleNav = (href: string) => {
    if (href === '__more__') {
      setShowMore(true)
      return
    }
    router.push(href)
  }

  const isActive = (href: string) => {
    if (href === '__more__') return false
    if (href === '/mobile') return pathname === '/mobile'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* ═══ NAVBAR ═══ */}
      <nav className="mobile-navbar">
        <div className="mobile-navbar__row">
          {NAV_ITEMS.map((item) => {
            /* ── Center wallet button ── */
            if ((item as any).isCenter) {
              const active = isActive(item.href)
              return (
                <button
                  key={item.href}
                  className={`mobile-navbar__wallet ${active ? 'mobile-navbar__wallet--active' : ''}`}
                  onClick={() => handleNav(item.href)}
                >
                  <Wallet
                    size={22}
                    color={active ? '#FFFFFF' : '#00D4FF'}
                    strokeWidth={2}
                  />
                </button>
              )
            }

            /* ── Regular nav button ── */
            const Icon = item.icon
            const active = isActive(item.href)

            return (
              <button
                key={item.href}
                className={`mobile-navbar__btn ${active ? 'mobile-navbar__btn--active' : ''}`}
                onClick={() => handleNav(item.href)}
              >
                <div className="mobile-navbar__btn-inner">
                  <Icon
                    size={20}
                    color={active ? '#00D4FF' : 'rgba(255,255,255,0.5)'}
                    strokeWidth={active ? 2.5 : 2}
                  />
                  {active && <div className="mobile-navbar__indicator" />}
                </div>

                {/* Notification badge on Home */}
                {item.href === '/mobile' && unreadCount > 0 && (
                  <div className="mobile-navbar__badge">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* ═══ MORE MENU ═══ */}
      {showMore && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowMore(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              zIndex: 100,
            }}
          />

          {/* Sheet */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 100,
              background: 'linear-gradient(180deg, rgba(0,212,255,0.08) 0%, rgba(11,14,20,0.95) 100%)',
              backdropFilter: 'blur(50px) saturate(220%)',
              WebkitBackdropFilter: 'blur(50px) saturate(220%)',
              borderRadius: '32px 32px 0 0',
              borderTop: '1px solid rgba(0,212,255,0.25)',
              paddingBottom: 'calc(48px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.6), 0 -2px 0 rgba(0,212,255,0.15)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8, flexShrink: 0 }}>
              <div style={{
                width: 40, height: 5, borderRadius: 3,
                background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.5), transparent)',
                boxShadow: '0 0 10px rgba(0,212,255,0.3)',
              }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px 12px', direction: 'rtl', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 17, fontWeight: 900, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
                  استكشف المزيد
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,168,204,0.15))',
                  color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace",
                  border: '1px solid rgba(0,212,255,0.35)',
                  boxShadow: '0 0 12px rgba(0,212,255,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}>
                  {ALL_MORE_ITEMS.filter(i => i.isNew).length} جديد
                </span>
              </div>
              <button
                onClick={() => setShowMore(false)}
                style={{
                  width: 36, height: 36, borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                <X size={20} color="rgba(255,255,255,0.6)" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }} className="custom-scrollbar">
              {MORE_CATEGORIES.map((category, catIdx) => (
                <div key={category.title} style={{ marginBottom: catIdx < MORE_CATEGORIES.length - 1 ? 8 : 0 }}>
                  <div style={{ padding: '12px 20px 8px', direction: 'rtl' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.3)',
                      fontFamily: "'Cairo', sans-serif", letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}>
                      {category.title}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '0 16px', direction: 'rtl', overflow: 'hidden' }}>
                    {category.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.href}
                          onClick={() => { router.push(item.href); setShowMore(false) }}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                            padding: '16px 4px', borderRadius: 16, position: 'relative',
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${item.isNew ? `${item.color}50` : 'rgba(255,255,255,0.08)'}`,
                            boxShadow: item.isNew
                              ? `0 4px 20px ${item.color}20, inset 0 1px 0 rgba(255,255,255,0.1)`
                              : '0 4px 15px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
                            cursor: 'pointer', touchAction: 'manipulation',
                          }}
                        >
                          {item.isNew && (
                            <div style={{
                              position: 'absolute', top: 6, insetInlineStart: 6,
                              width: 8, height: 8, borderRadius: '50%',
                              background: `linear-gradient(135deg, ${item.color}, #00D4FF)`,
                              boxShadow: `0 0 10px ${item.color}, 0 0 20px ${item.color}50`,
                            }} />
                          )}
                          <div style={{
                            width: 44, height: 44, borderRadius: 14,
                            background: `linear-gradient(135deg, ${item.color}25, ${item.color}10)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1.5px solid ${item.color}40`,
                            boxShadow: `0 4px 15px ${item.color}20, inset 0 1px 0 rgba(255,255,255,0.1)`,
                            pointerEvents: 'none',
                          }}>
                            <Icon size={20} color={item.color} strokeWidth={2} />
                          </div>
                          <span style={{
                            fontSize: 11, color: item.isNew ? '#F0F2F5' : 'rgba(255,255,255,0.85)',
                            fontFamily: "'Cairo', sans-serif", lineHeight: 1.3, textAlign: 'center',
                            fontWeight: item.isNew ? 800 : 600, maxWidth: '90%', pointerEvents: 'none',
                            textShadow: item.isNew ? `0 0 20px ${item.color}40` : 'none',
                          }}>
                            {item.label}
                          </span>
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
