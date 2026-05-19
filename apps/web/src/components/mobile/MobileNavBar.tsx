'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import {
  Home, BarChart2, Wallet, TrendingUp, Settings, Grid3X3, X,
  Brain, FlaskConical, ScanSearch, Radio, Newspaper, HelpCircle,
  Activity, Zap, Target, BellRing, UserCircle, Link2, CreditCard,
  Fingerprint, Users, GitMerge, Trophy, Eye, Cpu, Code,
  CalendarDays, Shield, Store
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
// CRITICAL FIX: Navbar buttons stop working after opening the chart page.
//
// ROOT CAUSE: lightweight-charts calls setPointerCapture() on the canvas,
// which captures ALL pointer events, preventing onClick from firing on
// navbar buttons (click events are derived from pointer events).
//
// SOLUTION: Use onTouchEnd handlers for navigation. Touch events are
// NOT affected by setPointerCapture — they always fire on the element
// under the finger. We also release any active pointer captures as a
// belt-and-suspenders measure.
// ═══════════════════════════════════════════════════════════════

/**
 * Release ALL active pointer captures on the page.
 * This ensures the navbar can receive pointer events after chart interaction.
 */
function releaseAllPointerCaptures() {
  try {
    // Walk all elements and release any pointer captures
    const allElements = document.querySelectorAll('*')
    for (const el of allElements) {
      const htmlEl = el as HTMLElement
      if (typeof htmlEl.hasPointerCapture === 'function') {
        // Try common pointer IDs (touch pointers start from 1)
        for (let pid = 1; pid <= 20; pid++) {
          try {
            if (htmlEl.hasPointerCapture(pid)) {
              htmlEl.releasePointerCapture(pid)
            }
          } catch { /* not captured */ }
        }
      }
    }
  } catch { /* best effort */ }
}

type NavItem = {
  label: string
  href: string
  icon: any
  kind: 'page' | 'wallet' | 'more'
}

const NAV_ITEMS: NavItem[] = [
  { label: 'الرئيسية', href: '/mobile', icon: Home, kind: 'page' },
  { label: 'الأسواق', href: '/mobile/markets', icon: BarChart2, kind: 'page' },
  { label: 'الشارت', href: '/mobile/chart', icon: TrendingUp, kind: 'page' },
  { label: 'المحفظة', href: '/mobile/wallet', icon: Wallet, kind: 'wallet' },
  { label: 'الإعدادات', href: '/mobile/settings', icon: Settings, kind: 'page' },
  { label: 'المزيد', href: '#more', icon: Grid3X3, kind: 'more' },
]

interface MoreItem { label: string; href: string; icon: any; color: string; isNew?: boolean; sub?: string }
interface MoreCategory { title: string; items: MoreItem[] }

const MORE_CATEGORIES: MoreCategory[] = [
  {
    title: 'التداول',
    items: [
      { label: 'المراكز المفتوحة', href: '/mobile/positions', icon: Activity, color: '#00C853', sub: 'تتبع صفقاتك' },
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

export default function MobileNavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  const unreadCount = useNotificationStore(s => s.notifications.filter(n => !n.read).length)
  const navRef = useRef<HTMLElement>(null)

  // Track whether a touch navigation just happened to avoid double-fire with click
  const touchNavRef = useRef(false)

  // ── TOUCH NAVIGATION HANDLERS ──
  // These use touch events which are NOT affected by setPointerCapture.
  // When the chart has pointer capture, onClick never fires (click comes from
  // pointer events), but onTouchEnd ALWAYS fires because touch events bypass capture.
  const handleNavTouch = useCallback((href: string, e: React.TouchEvent) => {
    e.preventDefault() // Prevent subsequent click event
    touchNavRef.current = true
    setTimeout(() => { touchNavRef.current = false }, 400)
    releaseAllPointerCaptures()
    router.push(href)
  }, [router])

  const handleWalletTouch = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    touchNavRef.current = true
    setTimeout(() => { touchNavRef.current = false }, 400)
    releaseAllPointerCaptures()
    router.push('/mobile/wallet')
  }, [router])

  const handleMoreTouch = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    touchNavRef.current = true
    setTimeout(() => { touchNavRef.current = false }, 400)
    releaseAllPointerCaptures()
    setMoreOpen(true)
  }, [])

  // Safe click handler that skips if touch already handled navigation
  const safeClick = useCallback((action: () => void) => {
    if (touchNavRef.current) return // Touch already handled it
    releaseAllPointerCaptures()
    action()
  }, [])

  const isActive = (href: string) => {
    if (href === '/mobile') return pathname === '/mobile'
    return pathname.startsWith(href)
  }

  return (
    <>
      <nav ref={navRef} className="m-nav">
        {NAV_ITEMS.map((item) => {
          // Wallet: circle button, no text label
          if (item.kind === 'wallet') {
            const active = isActive(item.href)
            return (
              <button
                key={item.href}
                className={`m-nav-wallet ${active ? 'm-nav-wallet--active' : ''}`}
                onTouchEnd={handleWalletTouch}
                onClick={() => safeClick(() => router.push(item.href))}
                aria-label="المحفظة"
              >
                <Wallet size={20} color={active ? '#FFF' : '#00D4FF'} strokeWidth={2} />
              </button>
            )
          }

          // More: opens bottom sheet
          if (item.kind === 'more') {
            const active = moreOpen
            return (
              <button
                key="more"
                className={`m-nav-btn ${active ? 'm-nav-btn--active' : ''}`}
                onTouchEnd={handleMoreTouch}
                onClick={() => safeClick(() => setMoreOpen(true))}
                aria-label="المزيد"
              >
                <Grid3X3 size={20} color={active ? '#00D4FF' : 'rgba(255,255,255,0.4)'} strokeWidth={active ? 2.5 : 2} />
                <span className="m-nav-btn__label" style={{ color: active ? '#00D4FF' : 'rgba(255,255,255,0.4)' }}>المزيد</span>
                {active && <div className="m-nav-btn__dot" />}
              </button>
            )
          }

          // Regular page buttons
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <button
              key={item.href}
              className={`m-nav-btn ${active ? 'm-nav-btn--active' : ''}`}
              onTouchEnd={(e) => handleNavTouch(item.href, e)}
              onClick={() => safeClick(() => router.push(item.href))}
              aria-label={item.label}
            >
              <Icon size={20} color={active ? '#00D4FF' : 'rgba(255,255,255,0.4)'} strokeWidth={active ? 2.5 : 2} />
              <span className="m-nav-btn__label" style={{ color: active ? '#00D4FF' : 'rgba(255,255,255,0.4)' }}>{item.label}</span>
              {active && <div className="m-nav-btn__dot" />}
              {item.href === '/mobile' && unreadCount > 0 && (
                <div className="m-nav-badge">{unreadCount > 9 ? '9+' : unreadCount}</div>
              )}
            </button>
          )
        })}
      </nav>

      {/* More Menu Sheet */}
      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            onTouchEnd={(e) => { e.preventDefault(); releaseAllPointerCaptures(); setMoreOpen(false) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(16px)', zIndex: 100 }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
            background: 'linear-gradient(180deg, rgba(0,212,255,0.06) 0%, rgba(11,14,20,0.97) 100%)',
            backdropFilter: 'blur(40px) saturate(200%)',
            borderRadius: '28px 28px 0 0',
            borderTop: '1px solid rgba(0,212,255,0.2)',
            paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,212,255,0.3)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 10px', direction: 'rtl', flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>استكشف المزيد</span>
              <button onTouchEnd={(e) => { e.preventDefault(); setMoreOpen(false) }} onClick={() => setMoreOpen(false)} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={18} color="rgba(255,255,255,0.5)" />
              </button>
            </div>

            {/* Content */}
            <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }} className="m-no-scroll">
              {MORE_CATEGORIES.map((cat) => (
                <div key={cat.title} style={{ marginBottom: 12 }}>
                  <div style={{ padding: '8px 16px 6px', direction: 'rtl' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.25)', fontFamily: "'Cairo', sans-serif", letterSpacing: '0.05em' }}>{cat.title}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 12px', direction: 'rtl' }}>
                    {cat.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.href}
                          onTouchEnd={(e) => { e.preventDefault(); releaseAllPointerCaptures(); router.push(item.href); setMoreOpen(false) }}
                          onClick={() => { if (!touchNavRef.current) { router.push(item.href); setMoreOpen(false) } }}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                            padding: '12px 2px', borderRadius: 14, position: 'relative',
                            background: 'rgba(255,255,255,0.04)', border: `1px solid ${item.isNew ? `${item.color}30` : 'rgba(255,255,255,0.06)'}`,
                            cursor: 'pointer', touchAction: 'manipulation',
                          }}
                        >
                          {item.isNew && <div style={{ position: 'absolute', top: 4, insetInlineStart: 4, width: 6, height: 6, borderRadius: '50%', background: item.color, boxShadow: `0 0 8px ${item.color}` }} />}
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${item.color}30`, pointerEvents: 'none' }}>
                            <Icon size={16} color={item.color} />
                          </div>
                          <span style={{ fontSize: 10, color: item.isNew ? '#F0F2F5' : 'rgba(255,255,255,0.7)', fontFamily: "'Cairo', sans-serif", lineHeight: 1.2, textAlign: 'center', fontWeight: item.isNew ? 700 : 500, pointerEvents: 'none' }}>{item.label}</span>
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
