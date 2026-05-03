'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import {
  Home, BarChart2, Wallet, TrendingUp, Settings,
  Grid3X3, Brain, FlaskConical, ScanSearch, Radio,
  Newspaper, HelpCircle, X, Activity, Zap, Target,
  BellRing, UserCircle, Link2, CreditCard, Fingerprint, Users,
  Globe2,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'الرئيسية', href: '/mobile', icon: Home },
  { label: 'الأسواق', href: '/mobile/markets', icon: TrendingUp },
  { label: 'الشارت', href: '/mobile/chart', icon: BarChart2 },
  { label: 'المحفظة', href: '/mobile/wallet', icon: Wallet, isCenter: true },
  { label: 'الإعدادات', href: '/mobile/settings', icon: Settings },
  { label: 'المزيد', href: '__more__', icon: Grid3X3 },
]

/* ═══════════════════════════════════════════════════════════
   Categorized More Items
   ═══════════════════════════════════════════════════════════ */

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
      { label: 'المراكز المفتوحة', href: '/mobile/positions', icon: Activity, color: '#00C853', isNew: true, sub: 'تتبع صفقاتك الحية' },
      { label: 'التداول الحي', href: '/mobile/trading', icon: Zap, color: '#00D4FF', isNew: true, sub: 'تداول مباشر من الجوال' },
      { label: 'الاستراتيجيات', href: '/mobile/strategies', icon: FlaskConical, color: '#B388FF', isNew: true, sub: 'اختبر وبنِ استراتيجياتك' },
      { label: 'التداول الاجتماعي', href: '/mobile/social', icon: Users, color: '#FF6B9D', isNew: true, sub: 'تابع أفضل المتداولين' },
    ],
  },
  {
    title: 'الأدوات',
    items: [
      { label: 'التحليلات', href: '/mobile/ai', icon: Brain, color: '#B388FF', sub: 'رؤى من 6 نماذج AI' },
      { label: 'سكانر السوق', href: '/mobile/scanner', icon: ScanSearch, color: '#00FFA3', sub: 'اكتشف الفرص لحظياً' },
      { label: 'إشارات رؤى', href: '/mobile/signals', icon: Radio, color: '#FFB800', sub: 'توصيات تداول احترافية' },
      { label: 'الأسواق التنبؤية', href: '/dashboard/prediction-market', icon: Target, color: '#00D4FF', isNew: true, sub: 'تنبؤات AI مقابل السوق' },
      { label: 'الأخبار', href: '/mobile/news', icon: Newspaper, color: '#d4af37', isNew: true, sub: 'أخبار الأسواق لحظة بلحظة' },
      { label: 'الإشعارات', href: '/mobile/notifications', icon: BellRing, color: '#FF4757', isNew: true, sub: 'تنبيهات البوت والنظام' },
    ],
  },
  {
    title: 'الحساب',
    items: [
      { label: 'الملف الشخصي', href: '/mobile/profile', icon: UserCircle, color: '#00D4FF', isNew: true, sub: 'معلوماتك الشخصية' },
      { label: 'ربط الحسابات', href: '/mobile/kyc', icon: Link2, color: '#00FFA3', isNew: true, sub: 'ربط حسابات الوساطة' },
      { label: 'الفواتير والاشتراكات', href: '/mobile/billing', icon: CreditCard, color: '#d4af37', isNew: true, sub: 'إدارة الاشتراك والمدفوعات' },
      { label: 'الأمان و 2FA', href: '/mobile/security', icon: Fingerprint, color: '#32D74B', isNew: true, sub: 'حماية حسابك ومصادقتك' },
      { label: 'المساعدة والدعم', href: '/mobile/help', icon: HelpCircle, color: '#8B92A8', isNew: true, sub: 'مركز المساعدة والتذاكر' },
    ],
  },
]

/* Flatten for quick access */
const ALL_MORE_ITEMS = MORE_CATEGORIES.flatMap(c => c.items)

export default function MobileNavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const [showMore, setShowMore] = useState(false)

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
      {/* Bottom Navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          height: 'calc(60px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'rgba(11, 14, 20, 0.4)',
          backdropFilter: 'blur(50px) saturate(210%)',
          WebkitBackdropFilter: 'blur(50px) saturate(210%)',
          borderTop: '0.5px solid rgba(255,255,255,0.12)',
        }}
      >
        <div className="flex items-center justify-around h-full px-1" dir="rtl">
          {NAV_ITEMS.map((item, idx) => {
            /* Center wallet button — elevated floating style */
            if ((item as any).isCenter) {
              const active = isActive(item.href)
              return (
                <div key={item.href} style={{ position: 'relative', marginTop: -20, zIndex: 10 }}>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleNav(item.href)}
                    style={{
                      width: 50, height: 50, borderRadius: '50%',
                      background: active
                        ? 'linear-gradient(135deg, #00D4FF, #0099CC)'
                        : 'linear-gradient(135deg, #1C1C1E, #0D0D0F)',
                      border: active ? '2px solid rgba(0,212,255,0.5)' : '1.5px solid rgba(255,255,255,0.15)',
                      boxShadow: active
                        ? '0 0 16px rgba(0,212,255,0.4), 0 0 0 3px rgba(0,212,255,0.1)'
                        : '0 4px 12px rgba(0,0,0,0.4)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: 0, cursor: 'pointer',
                    }}
                  >
                    <Wallet size={18} color={active ? '#FFFFFF' : '#00D4FF'} strokeWidth={2.5} />
                  </motion.button>
                  <span style={{
                    display: 'block', textAlign: 'center', marginTop: 2,
                    fontSize: 7, color: active ? '#00D4FF' : 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                  }}>المحفظة</span>
                </div>
              )
            }

            const Icon = item.icon
            const active = isActive(item.href)

            return (
              <button
                key={item.href}
                onClick={() => handleNav(item.href)}
                className="flex flex-col items-center justify-center h-full"
                style={{ width: 44, flexShrink: 0 }}
              >
                <motion.div 
                  whileTap={{ scale: 0.9 }} 
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="relative"
                >
                  <Icon size={18} color={active ? '#00D4FF' : 'rgba(255,255,255,0.4)'} />
                  {active && (
                    <motion.div
                      layoutId="navIndicator"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      style={{
                        position: 'absolute',
                        bottom: -3,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 3,
                        height: 3,
                        borderRadius: '50%',
                        background: '#00D4FF',
                        boxShadow: '0 0 8px #00D4FF',
                      }}
                    />
                  )}
                </motion.div>
                <span
                  style={{
                    fontSize: 8,
                    color: active ? '#00D4FF' : 'rgba(255,255,255,0.35)',
                    fontFamily: "'Cairo', sans-serif",
                    fontWeight: active ? 800 : 500,
                  }}
                >
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* More Bottom Sheet — Categorized & Scrollable */}
      <AnimatePresence>
        {showMore && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMore(false)}
              className="fixed inset-0 z-50 md:hidden"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
              style={{
                background: 'rgba(11, 14, 20, 0.92)',
                backdropFilter: 'blur(40px) saturate(200%)',
                WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                borderRadius: '28px 28px 0 0',
                borderTop: '0.5px solid rgba(255,255,255,0.15)',
                paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1" style={{ flexShrink: 0 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3" dir="rtl" style={{ flexShrink: 0 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 17, fontWeight: 900, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
                    استكشف المزيد
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 8,
                    background: 'rgba(0,212,255,0.12)', color: '#00D4FF',
                    fontFamily: "'JetBrains Mono', monospace",
                    border: '0.5px solid rgba(0,212,255,0.2)',
                  }}>
                    {ALL_MORE_ITEMS.filter(i => i.isNew).length} جديد
                  </span>
                </div>
                <button onClick={() => setShowMore(false)}>
                  <X size={20} color="rgba(255,255,255,0.4)" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }} className="custom-scrollbar">
                {MORE_CATEGORIES.map((category, catIdx) => (
                  <div key={category.title} style={{ marginBottom: catIdx < MORE_CATEGORIES.length - 1 ? 8 : 0 }}>
                    {/* Category Title */}
                    <div className="px-5 pt-3 pb-2" dir="rtl">
                      <span style={{
                        fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.3)',
                        fontFamily: "'Cairo', sans-serif", letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}>
                        {category.title}
                      </span>
                    </div>

                    {/* Category Items Grid */}
                    <div className="grid grid-cols-3 gap-2.5 px-4" dir="rtl" style={{ overflow: 'hidden' }}>
                      {category.items.map((item, i) => {
                        const Icon = item.icon
                        const globalIdx = catIdx * 100 + i
                        return (
                          <motion.button
                            key={item.href}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: globalIdx * 0.03 }}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => { router.push(item.href); setShowMore(false) }}
                            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl relative"
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.05)',
                            }}
                          >
                            {/* New badge */}
                            {item.isNew && (
                              <div style={{
                                position: 'absolute', top: 4, insetInlineStart: 4,
                                width: 7, height: 7, borderRadius: '50%',
                                background: '#00D4FF',
                                boxShadow: '0 0 6px rgba(0,212,255,0.6)',
                              }} />
                            )}
                            <div
                              style={{
                                width: 40, height: 40, borderRadius: 12,
                                background: `${item.color}14`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: `1px solid ${item.color}28`,
                              }}
                            >
                              <Icon size={18} color={item.color} />
                            </div>
                            <span style={{
                              fontSize: 10, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif",
                              lineHeight: 1.2, textAlign: 'center', fontWeight: item.isNew ? 800 : 600,
                              maxWidth: '90%',
                            }}>
                              {item.label}
                            </span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
