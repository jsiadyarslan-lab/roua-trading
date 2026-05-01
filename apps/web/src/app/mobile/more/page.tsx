'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
  Brain, ScanSearch, Radio, Newspaper, HelpCircle, Info, ChevronLeft, TrendingUp
} from 'lucide-react'

const MORE_ITEMS = [
  {
    icon: TrendingUp, label: 'الأسواق العالمية', sub: 'متابعة أسعار العملات والمعادن',
    color: '#00D4FF', href: '/mobile/markets',
  },
  {
    icon: Brain, label: 'التحليلات الذكية', sub: 'رؤية شاملة من 6 نماذج AI',
    color: '#B388FF', href: '/mobile/ai',
  },
  {
    icon: ScanSearch, label: 'سكانر السوق', sub: 'اكتشاف الفرص الذهبية لحظياً',
    color: '#00FFA3', href: '/mobile/scanner',
  },
  {
    icon: Radio, label: 'إشارات رؤى', sub: 'توصيات تداول احترافية',
    color: '#FFB800', href: '/mobile/signals',
  },
  {
    icon: Newspaper, label: 'آخر الأخبار', sub: 'تغطية حية لأخبار الأسواق',
    color: '#d4af37', href: '/dashboard/news',
  },
  {
    icon: HelpCircle, label: 'المساعدة والدعم', sub: 'مركز المساعدة وفتح التذاكر',
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
    <div style={{ minHeight: '100vh', background: '#0B0E14', direction: 'rtl', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 16px 20px', background: 'linear-gradient(180deg, rgba(179,136,255,0.08), transparent)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
          استكشف المزيد
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif", marginTop: 4 }}>
          جميع أدوات رؤى المتقدمة في مكان واحد
        </p>
      </div>

      {/* ── Items List ── */}
      <div style={{ margin: '0 16px', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 24, overflow: 'hidden' }}>
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
                width: '100%', padding: '18px 16px', background: 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'right',
                borderBottom: i < MORE_ITEMS.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none',
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 16,
                background: `${item.color}15`, border: `1px solid ${item.color}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={22} color={item.color} />
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
                  {item.label}
                </p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
                  {item.sub}
                </p>
              </div>
              <ChevronLeft size={16} color="rgba(255,255,255,0.2)" style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
            </motion.button>
          )
        })}
      </div>

      {/* ── Footer Badge ── */}
      <div style={{ margin: '32px 16px 0', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 24px', borderRadius: 16,
          background: 'rgba(212,175,55,0.05)', border: '0.5px solid rgba(212,175,55,0.15)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00FFA3', boxShadow: '0 0 10px #00FFA3' }} className="animate-pulse" />
          <span style={{ fontSize: 12, color: '#d4af37', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
            رؤى للتداول — إصدار الجوال v2.0
          </span>
        </div>
      </div>
    </div>
  )
}
