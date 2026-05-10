'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import {
  Home, BarChart2, Wallet, TrendingUp, Settings,
  Grid3X3, Brain, FlaskConical, ScanSearch, Radio,
  Newspaper, HelpCircle, X, Activity, Zap, Target,
  BellRing, UserCircle, Link2, CreditCard, Fingerprint, Users,
  Globe2, GitMerge, Trophy, Eye, Cpu, Code, CalendarDays, Shield,
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
      { label: 'المراكز المفتوحة', href: '/mobile/positions', icon: Activity, color: '#00C853', sub: 'تتبع صفقاتك الحية' },
      { label: 'التداول الحي', href: '/mobile/trading', icon: Zap, color: '#00D4FF', sub: 'تداول مباشر من الجوال' },
      { label: 'الاستراتيجيات', href: '/mobile/strategies', icon: FlaskConical, color: '#B388FF', sub: 'اختبر وبنِ استراتيجياتك' },
      { label: 'محرر الاستراتيجيات', href: '/mobile/strategy-builder', icon: GitMerge, color: '#00D4FF', isNew: true, sub: 'محرر بصري No-Code' },
      { label: 'اختبار الاستراتيجيات', href: '/mobile/strategies/backtest', icon: FlaskConical, color: '#FF9F43', isNew: true, sub: 'Backtest على بيانات تاريخية' },
      { label: 'التداول الاجتماعي', href: '/mobile/social', icon: Users, color: '#FF6B9D', sub: 'تابع أفضل المتداولين' },
      { label: 'متابعة الحسابات', href: '/mobile/copy-trading', icon: Eye, color: '#10B981', isNew: true, sub: 'تابع أداء الحسابات المربوطة' },
      { label: 'لوحة الصدارة', href: '/mobile/leaderboard', icon: Trophy, color: '#FFB800', isNew: true, sub: 'أفضل الحسابات المربوطة' },
      { label: 'وكيل التداول', href: '/mobile/agent', icon: Cpu, color: '#FF9F43', sub: 'تداول ذاتي بالذكاء الاصطناعي' },
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

/* Flatten for quick access */
const ALL_MORE_ITEMS = MORE_CATEGORIES.flatMap(c => c.items)

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
      {/* Bottom Navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 md:hidden"
        style={{
          zIndex: 50,
          pointerEvents: 'auto',
          height: '56px',
          paddingBottom: '0',
          background: 'linear-gradient(180deg, rgba(0,212,255,0.05) 0%, rgba(11,14,20,0.85) 100%)',
          backdropFilter: 'blur(60px) saturate(250%)',
          WebkitBackdropFilter: 'blur(60px) saturate(250%)',
          borderTop: '0.5px solid rgba(0,212,255,0.15)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.4), 0 -1px 0 rgba(0,212,255,0.1)',
        }}
      >
        <div className="flex items-center justify-around h-full px-0.5" dir="rtl" style={{ pointerEvents: 'auto' }}>
          {NAV_ITEMS.map((item, idx) => {
            /* Center wallet button — compact floating style */
            if ((item as any).isCenter) {
              const active = isActive(item.href)
              return (
                <div key={item.href} style={{ position: 'relative', marginTop: -12, zIndex: 10, pointerEvents: 'auto' }}>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleNav(item.href)}
                    style={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: active
                        ? 'linear-gradient(135deg, #00D4FF 0%, #00A8CC 50%, #0066AA 100%)'
                        : 'linear-gradient(135deg, rgba(0,212,255,0.15) 0%, rgba(0,168,204,0.1) 100%)',
                      border: active 
                        ? '2px solid rgba(0,212,255,0.8)' 
                        : '1.5px solid rgba(0,212,255,0.4)',
                      boxShadow: active
                        ? '0 0 20px rgba(0,212,255,0.6), 0 0 40px rgba(0,212,255,0.3), inset 0 1px 0 rgba(255,255,255,0.3)'
                        : '0 4px 15px rgba(0,0,0,0.3), 0 0 10px rgba(0,212,255,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: 0, cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      padding: 0,
                      pointerEvents: 'auto',
                    }}
                  >
                    <Wallet size={28} color={active ? '#FFFFFF' : '#00D4FF'} strokeWidth={2} />
                  </motion.button>
                  {/* Neon glow ring */}
                  <div style={{
                    position: 'absolute',
                    inset: -4,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(0,212,255,0.3) 0%, transparent 70%)',
                    filter: 'blur(8px)',
                    zIndex: -1,
                    opacity: active ? 1 : 0.5,
                    transition: 'opacity 0.3s ease',
                  }} />
                </div>
              )
            }

            const Icon = item.icon
            const active = isActive(item.href)

            return (
              <motion.button
                key={item.href}
                onClick={() => handleNav(item.href)}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="flex items-center justify-center h-full"
                style={{ 
                  width: 64, 
                  flexShrink: 0, 
                  position: 'relative',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  zIndex: 10,
                  pointerEvents: 'auto',
                }}
              >
                <div 
                  className="relative"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 12px',
                    pointerEvents: 'none',
                    borderRadius: 12,
                    background: active ? 'rgba(0,212,255,0.08)' : 'transparent',
                    border: active ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Icon 
                    size={28} 
                    color={active ? '#00D4FF' : 'rgba(255,255,255,0.5)'} 
                    strokeWidth={active ? 2.5 : 2}
                  />
                  {/* Elegant bottom line indicator */}
                  {active && (
                    <motion.div
                      layoutId="navIndicator"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      style={{
                        width: 20,
                        height: 2,
                        borderRadius: 2,
                        background: 'linear-gradient(90deg, transparent, #00D4FF, transparent)',
                        boxShadow: '0 0 8px rgba(0,212,255,0.8)',
                      }}
                    />
                  )}
                  {/* Notification badge on Home icon */}
                  {item.href === '/mobile' && unreadCount > 0 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      style={{
                        position: 'absolute', top: 2, right: 4,
                        minWidth: 16, height: 16, borderRadius: 8,
                        background: 'linear-gradient(135deg, #FF453A, #FF6B6B)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 800, color: '#FFF',
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: '0 4px',
                        boxShadow: '0 2px 8px rgba(255,69,58,0.5)',
                        border: '1.5px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </motion.div>
                  )}
                </div>
              </motion.button>
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
              className="fixed inset-0 md:hidden"
              style={{ 
                background: 'rgba(0,0,0,0.75)', 
                backdropFilter: 'blur(20px) saturate(180%)', 
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                zIndex: 50 
              }}
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 md:hidden"
              style={{
                zIndex: 50,
                background: 'linear-gradient(180deg, rgba(0,212,255,0.08) 0%, rgba(11,14,20,0.95) 100%)',
                backdropFilter: 'blur(50px) saturate(220%)',
                WebkitBackdropFilter: 'blur(50px) saturate(220%)',
                borderRadius: '32px 32px 0 0',
                borderTop: '1px solid rgba(0,212,255,0.25)',
                paddingBottom: '56px',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.6), 0 -2px 0 rgba(0,212,255,0.15)',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2" style={{ flexShrink: 0 }}>
                <div style={{ 
                  width: 40, 
                  height: 5, 
                  borderRadius: 3, 
                  background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.5), transparent)',
                  boxShadow: '0 0 10px rgba(0,212,255,0.3)',
                }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3" dir="rtl" style={{ flexShrink: 0 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 17, fontWeight: 900, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
                    استكشف المزيد
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,168,204,0.15))',
                    color: '#00D4FF',
                    fontFamily: "'JetBrains Mono', monospace",
                    border: '1px solid rgba(0,212,255,0.35)',
                    boxShadow: '0 0 12px rgba(0,212,255,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}>
                    {ALL_MORE_ITEMS.filter(i => i.isNew).length} جديد
                  </span>
                </div>
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowMore(false)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <X size={20} color="rgba(255,255,255,0.6)" />
                </motion.button>
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
                            className="flex flex-col items-center gap-2 py-4 rounded-2xl relative"
                            style={{
                              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                              backdropFilter: 'blur(10px)',
                              border: `1px solid ${item.isNew ? `${item.color}50` : 'rgba(255,255,255,0.08)'}`,
                              boxShadow: item.isNew 
                                ? `0 4px 20px ${item.color}20, inset 0 1px 0 rgba(255,255,255,0.1)` 
                                : '0 4px 15px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
                              transition: 'all 0.3s ease',
                            }}
                          >
                            {/* New badge */}
                            {item.isNew && (
                              <motion.div 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: globalIdx * 0.03 + 0.2 }}
                                style={{
                                  position: 'absolute', top: 6, insetInlineStart: 6,
                                  width: 8, height: 8, borderRadius: '50%',
                                  background: `linear-gradient(135deg, ${item.color}, #00D4FF)`,
                                  boxShadow: `0 0 10px ${item.color}, 0 0 20px ${item.color}50`,
                                }} 
                              />
                            )}
                            <div
                              style={{
                                width: 44, height: 44, borderRadius: 14,
                                background: `linear-gradient(135deg, ${item.color}25, ${item.color}10)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: `1.5px solid ${item.color}40`,
                                boxShadow: `0 4px 15px ${item.color}20, inset 0 1px 0 rgba(255,255,255,0.1)`,
                              }}
                            >
                              <Icon size={20} color={item.color} strokeWidth={2} />
                            </div>
                            <span style={{
                              fontSize: 11, 
                              color: item.isNew ? '#F0F2F5' : 'rgba(255,255,255,0.85)', 
                              fontFamily: "'Cairo', sans-serif",
                              lineHeight: 1.3, 
                              textAlign: 'center', 
                              fontWeight: item.isNew ? 800 : 600,
                              maxWidth: '90%',
                              textShadow: item.isNew ? `0 0 20px ${item.color}40` : 'none',
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
