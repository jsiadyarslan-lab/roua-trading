'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
  Brain, ScanSearch, Radio, Newspaper, HelpCircle, ChevronLeft,
  Activity, Zap, FlaskConical, Users, BellRing, UserCircle,
  Link2, CreditCard, Fingerprint, Store,
} from 'lucide-react'

/* ─── Design Tokens (consistent with all mobile pages) ─── */
const c = {
  accent: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: '#8B92A8',
  text3: '#8B92A8',
  bg: '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
  cyan: '#00D4FF',
  purple: '#B388FF',
  green: '#32D74B',
  gold: '#d4af37',
}

/* ─── Category Structure ─── */
interface MoreItem {
  icon: any
  label: string
  sub: string
  color: string
  href: string
  isNew?: boolean
}

interface MoreCategory {
  title: string
  items: MoreItem[]
}

const MORE_CATEGORIES: MoreCategory[] = [
  {
    title: 'التداول',
    items: [
      { icon: Activity, label: 'المراكز المفتوحة', sub: 'تتبع صفقاتك الحية ومراكزك المفتوحة', color: '#00C853', href: '/mobile/positions', isNew: true },
      { icon: Zap, label: 'التداول الحي', sub: 'تداول مباشر من الجوال بسرعة فائقة', color: c.cyan, href: '/mobile/trading', isNew: true },
      { icon: FlaskConical, label: 'الاستراتيجيات', sub: 'اختبر وبنِ استراتيجياتك الخاصة', color: c.purple, href: '/mobile/strategies', isNew: true },
      { icon: Users, label: 'التداول الاجتماعي', sub: 'تابع وانسخ أفضل المتداولين', color: '#FF6B9D', href: '/mobile/social', isNew: true },
      { icon: Store, label: 'المتجر', sub: 'استراتيجيات وبوتات ومؤشرات', color: c.cyan, href: '/mobile/marketplace', isNew: true },
    ],
  },
  {
    title: 'الأدوات',
    items: [
      { icon: Brain, label: 'التحليلات الذكية', sub: 'رؤية شاملة من 6 نماذج AI', color: c.purple, href: '/mobile/ai' },
      { icon: ScanSearch, label: 'سكانر السوق', sub: 'اكتشاف الفرص الذهبية لحظياً', color: c.green, href: '/mobile/scanner' },
      { icon: Radio, label: 'إشارات رؤى', sub: 'توصيات تداول احترافية', color: c.amber, href: '/mobile/signals' },
      { icon: Newspaper, label: 'الأخبار', sub: 'تغطية حية لأخبار الأسواق المالية', color: c.gold, href: '/mobile/news', isNew: true },
      { icon: BellRing, label: 'الإشعارات', sub: 'تنبيهات البوت والنظام والصفقات', color: c.danger, href: '/mobile/notifications', isNew: true },
    ],
  },
  {
    title: 'الحساب',
    items: [
      { icon: UserCircle, label: 'الملف الشخصي', sub: 'إدارة معلوماتك الشخصية وصورتك', color: c.cyan, href: '/mobile/profile', isNew: true },
      { icon: Link2, label: 'ربط الحسابات', sub: 'ربط حسابات الوساطة والتحقق KYC', color: c.green, href: '/mobile/kyc', isNew: true },
      { icon: CreditCard, label: 'الفواتير والاشتراكات', sub: 'إدارة اشتراكك وعرض الفواتير', color: c.gold, href: '/mobile/billing', isNew: true },
      { icon: Fingerprint, label: 'الأمان و 2FA', sub: 'حماية حسابك وتفعيل المصادقة الثنائية', color: c.success, href: '/mobile/security', isNew: true },
      { icon: HelpCircle, label: 'المساعدة والدعم', sub: 'مركز المساعدة وفتح تذاكر الدعم', color: c.text2, href: '/mobile/help', isNew: true },
    ],
  },
]

const ALL_ITEMS = MORE_CATEGORIES.flatMap(cat => cat.items)

export default function MobileMorePage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100%', background: '#0B0E14', direction: 'rtl', paddingBottom: 20, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 16px 20px',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.06), transparent)',
      }}>
        <div className="flex items-center gap-3 mb-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => router.back()}
            style={{
              width: 40, height: 40, borderRadius: 14,
              background: 'rgba(255,255,255,0.05)',
              border: `0.5px solid ${c.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color={c.text} />
          </motion.button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: c.text, fontFamily: "'Cairo', sans-serif" }}>
              استكشف المزيد
            </h1>
            <p style={{ fontSize: 13, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
              جميع أدوات رؤى المتقدمة في مكان واحد
            </p>
          </div>
        </div>
      </div>

      {/* ── Categories ── */}
      {MORE_CATEGORIES.map((category, catIdx) => {
        const totalDelay = catIdx * 0.1
        return (
          <div key={category.title} style={{ marginBottom: 24 }}>
            {/* Category Header */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: totalDelay }}
              className="px-5 mb-2"
            >
              <div className="flex items-center gap-2">
                <div style={{
                  width: 3, height: 16, borderRadius: 2,
                  background: c.accent, opacity: 0.6,
                }} />
                <span style={{
                  fontSize: 13, fontWeight: 800, color: c.text3,
                  fontFamily: "'Cairo', sans-serif", letterSpacing: '0.04em',
                }}>
                  {category.title}
                </span>
                <div style={{ flex: 1, height: '0.5px', background: c.border }} />
              </div>
            </motion.div>

            {/* Category Items */}
            <div style={{
              margin: '0 16px',
              background: 'rgba(255,255,255,0.02)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: 24,
              overflow: 'hidden',
            }}>
              {category.items.map((item, i) => {
                const Icon = item.icon
                return (
                  <motion.button
                    key={item.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: totalDelay + i * 0.04 }}
                    whileTap={{ backgroundColor: 'rgba(255,255,255,0.05)', scale: 0.99 }}
                    onClick={() => router.push(item.href)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      width: '100%', padding: '16px 16px', background: 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'right',
                      borderBottom: i < category.items.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none',
                    }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: 14,
                      background: `${item.color}12`, border: `1px solid ${item.color}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      position: 'relative',
                    }}>
                      <Icon size={20} color={item.color} />
                      {item.isNew && (
                        <div style={{
                          position: 'absolute', top: -3, insetInlineStart: -3,
                          width: 9, height: 9, borderRadius: '50%',
                          background: c.accent,
                          boxShadow: '0 0 8px rgba(0,212,255,0.6)',
                          border: '2px solid #000',
                        }} />
                      )}
                    </div>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <div className="flex items-center gap-2">
                        <p style={{
                          fontSize: 14, fontWeight: item.isNew ? 800 : 700,
                          color: c.text, fontFamily: "'Cairo', sans-serif",
                        }}>
                          {item.label}
                        </p>
                        {item.isNew && (
                          <span style={{
                            fontSize: 8, fontWeight: 800, padding: '1px 6px', borderRadius: 6,
                            background: 'rgba(0,212,255,0.12)', color: c.accent,
                            border: '0.5px solid rgba(0,212,255,0.25)',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            NEW
                          </span>
                        )}
                      </div>
                      <p style={{
                        fontSize: 11, color: c.text2,
                        fontFamily: "'Cairo', sans-serif", marginTop: 2,
                      }}>
                        {item.sub}
                      </p>
                    </div>
                    <ChevronLeft size={16} color="rgba(255,255,255,0.15)" style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
                  </motion.button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* ── Footer Badge ── */}
      <div style={{ margin: '8px 16px 0', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 24px', borderRadius: 16,
          background: 'rgba(212,175,55,0.05)', border: '0.5px solid rgba(212,175,55,0.15)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.green, boxShadow: `0 0 10px ${c.green}` }} className="animate-pulse" />
          <span style={{ fontSize: 12, color: c.gold, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
            رؤى للتداول — إصدار الجوال v2.1.0
          </span>
        </div>
      </div>
    </div>
  )
}
