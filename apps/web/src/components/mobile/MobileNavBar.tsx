'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import {
  Home, BarChart2, Wallet, TrendingUp, Settings,
  Grid3X3, Brain, FlaskConical, ScanSearch, Radio,
  CopyCheck, BarChart4, Newspaper, HelpCircle, Info, X,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'الرئيسية', href: '/mobile', icon: Home },
  { label: 'الأسواق', href: '/mobile/markets', icon: TrendingUp },
  { label: 'الشارت', href: '/mobile/chart', icon: BarChart2 },
  { label: 'المحفظة', href: '/mobile/portfolio', icon: Wallet },
  { label: 'الإعدادات', href: '/mobile/settings', icon: Settings },
  { label: 'المزيد', href: '__more__', icon: Grid3X3 },
]

const MORE_ITEMS = [
  { label: 'التحليلات', href: '/mobile/ai', icon: Brain, color: '#B388FF' },
  { label: 'سكانر السوق', href: '/mobile/scanner', icon: ScanSearch, color: '#00FFA3' },
  { label: 'إشارات رؤى', href: '/mobile/signals', icon: Radio, color: '#FFB800' },
  { label: 'الأخبار', href: '/dashboard/news', icon: Newspaper, color: '#d4af37' },
  { label: 'الدعم', href: '/support', icon: HelpCircle, color: '#8B92A8' },
  { label: 'عن رؤى', href: '/about', icon: Info, color: '#8B92A8' },
]

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
        className="fixed bottom-0 left-0 right-0 z-50 block sm:hidden"
        style={{
          height: 'calc(80px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'rgba(11, 14, 20, 0.4)',
          backdropFilter: 'blur(50px) saturate(210%)',
          WebkitBackdropFilter: 'blur(50px) saturate(210%)',
          borderTop: '0.5px solid rgba(255,255,255,0.12)',
        }}
      >
        <div className="flex items-center justify-around h-full px-2" dir="rtl">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)

            return (
              <button
                key={item.href}
                onClick={() => handleNav(item.href)}
                className="flex flex-col items-center justify-center gap-0.5"
                style={{ width: 48, paddingTop: 4 }}
              >
                <motion.div whileTap={{ scale: 0.85 }} className="relative">
                  <Icon size={20} color={active ? '#00D4FF' : 'rgba(255,255,255,0.4)'} />
                  {active && (
                    <motion.div
                      layoutId="navIndicator"
                      style={{
                        position: 'absolute',
                        bottom: -3,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 3,
                        height: 3,
                        borderRadius: '50%',
                        background: '#00D4FF',
                      }}
                    />
                  )}
                </motion.div>
                <span
                  style={{
                    fontSize: 8.5,
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

      {/* More Bottom Sheet */}
      <AnimatePresence>
        {showMore && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMore(false)}
              className="fixed inset-0 z-50 block sm:hidden"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-50 block sm:hidden"
              style={{
                background: 'rgba(11, 14, 20, 0.85)',
                backdropFilter: 'blur(40px) saturate(200%)',
                WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                borderRadius: '28px 28px 0 0',
                borderTop: '0.5px solid rgba(255,255,255,0.15)',
                paddingBottom: 'calc(58px + env(safe-area-inset-bottom))',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3" dir="rtl">
                <span style={{ fontSize: 16, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
                  استكشف المزيد
                </span>
                <button onClick={() => setShowMore(false)}>
                  <X size={20} color="rgba(255,255,255,0.4)" />
                </button>
              </div>

              {/* Grid Items */}
              <div className="grid grid-cols-3 gap-3 px-4 pt-2" dir="rtl">
                {MORE_ITEMS.map((item, i) => {
                  const Icon = item.icon
                  return (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => { router.push(item.href); setShowMore(false) }}
                      className="flex flex-col items-center gap-2 py-4 rounded-2xl"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div
                        style={{
                          width: 44, height: 44, borderRadius: 14,
                          background: `${item.color}18`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: `1px solid ${item.color}30`,
                        }}
                      >
                        <Icon size={20} color={item.color} />
                      </div>
                      <span style={{ fontSize: 11, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif", lineHeight: 1.3 }}>
                        {item.label}
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
