'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
  Brain, FlaskConical, ScanSearch, Radio, CopyCheck,
  BarChart4, Newspaper, HelpCircle, Info, ChevronLeft,
} from 'lucide-react'

const MORE_ITEMS = [
  {
    icon: Brain, label: 'التحليلات', sub: 'تحليل AI متقدم من 6 نماذج',
    color: '#B388FF', href: '/mobile/ai',
  },
  {
    icon: FlaskConical, label: 'المختبر الذكي', sub: 'تجربة الاستراتيجيات الجديدة',
    color: '#00D4FF', href: '#',
  },
  {
    icon: ScanSearch, label: 'السكانر المتقدم', sub: 'اكتشاف الفرص في الوقت الفعلي',
    color: '#00D4FF', href: '/mobile/scanner',
  },
  {
    icon: Radio, label: 'إشارات رؤى', sub: 'إشارات تداول آنية',
    color: '#FFB800', href: '#',
  },
  {
    icon: CopyCheck, label: 'نسخ الصفقات', sub: 'تتبع أفضل المتداولين',
    color: '#FF4757', href: '#',
  },
  {
    icon: BarChart4, label: 'التقويم الاقتصادي', sub: 'أحداث وبيانات الأسواق',
    color: '#00D4FF', href: '#',
  },
  {
    icon: Newspaper, label: 'آخر الأخبار', sub: 'أخبار الأسواق المالية',
    color: '#d4af37', href: '#',
  },
  {
    icon: HelpCircle, label: 'المساعدة والدعم', sub: 'تواصل مع فريق الدعم',
    color: '#8B92A8', href: '/support',
  },
  {
    icon: Info, label: 'عن المنصة', sub: 'رؤى للتداول — الإصدار 2.0',
    color: '#8B92A8', href: '/about',
  },
]

export default function MobileMorePage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: '#0B0E14', direction: 'rtl', paddingBottom: 32 }}>

      {/* ── Header ── */}
      <div style={{ padding: '52px 16px 20px', background: 'linear-gradient(180deg, rgba(179,136,255,0.08), transparent)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
          استكشف المزيد
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif", marginTop: 4 }}>
          جميع أدوات رؤى للتداول في مكان واحد
        </p>
      </div>

      {/* ── Items List ── */}
      <div style={{ margin: '0 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, overflow: 'hidden' }}>
        {MORE_ITEMS.map((item, i) => {
          const Icon = item.icon
          return (
            <motion.button
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              whileTap={{ backgroundColor: 'rgba(255,255,255,0.05)', scale: 0.99 }}
              onClick={() => router.push(item.href)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                width: '100%', padding: '15px 16px', background: 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'right',
                borderBottom: i < MORE_ITEMS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                background: `${item.color}15`, border: `1px solid ${item.color}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={20} color={item.color} />
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
                  {item.label}
                </p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
                  {item.sub}
                </p>
              </div>
              <ChevronLeft size={14} color="rgba(255,255,255,0.2)" style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
            </motion.button>
          )
        })}
      </div>

      {/* ── Footer Badge ── */}
      <div style={{ margin: '24px 16px 0', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 12,
          background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00FFA3' }} className="animate-pulse" />
          <span style={{ fontSize: 11, color: '#d4af37', fontFamily: "'Cairo', sans-serif" }}>
            رؤى للتداول — مدعوم بـ 6 نماذج AI
          </span>
        </div>
      </div>
    </div>
  )
}
