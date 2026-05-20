'use client'

import { useRouter } from 'next/navigation'
import { Header, Card } from '@/components/mobile/FluxComponents'
import {
  Activity, BarChart3, Brain, Zap, Shield,
  TrendingUp, Newspaper, Link2, Settings,
  Lock, HelpCircle, Code, Layers,
  Users, ScanSearch, Radio, Bot,
} from 'lucide-react'

/* ═══ Category Type ═══ */
interface MoreItem {
  label: string
  href: string
  icon: React.ElementType
  color: string
  description: string
}

interface MoreCategory {
  title: string
  items: MoreItem[]
}

/* ═══ Categories ═══ */
const CATEGORIES: MoreCategory[] = [
  {
    title: 'التداول',
    items: [
      { label: 'المراكز', href: '/mobile/positions', icon: Activity, color: '#00FFA3', description: 'إدارة المراكز المفتوحة' },
      { label: 'الاستراتيجيات', href: '/mobile/strategies', icon: Layers, color: '#B388FF', description: 'استراتيجيات التداول' },
      { label: 'التداول الاجتماعي', href: '/mobile/social', icon: Users, color: '#00D4FF', description: 'تداول مع المجتمع' },
      { label: 'البوت', href: '/mobile/bot', icon: Bot, color: '#FF9F43', description: 'محرك البوت الذكي' },
    ],
  },
  {
    title: 'الأدوات',
    items: [
      { label: 'التحليلات', href: '/mobile/ai', icon: Brain, color: '#A78BFA', description: 'تحليلات الذكاء الاصطناعي' },
      { label: 'سكانر السوق', href: '/mobile/scanner', icon: ScanSearch, color: '#00D4FF', description: 'مسح وتحليل الأسواق' },
      { label: 'التوصيات', href: '/mobile/signals', icon: Zap, color: '#FFB800', description: 'توصيات التداول' },
      { label: 'الأخبار', href: '/mobile/news', icon: Newspaper, color: '#FF6B6B', description: 'آخر أخبار الأسواق' },
    ],
  },
  {
    title: 'الحساب',
    items: [
      { label: 'ربط الحسابات', href: '/mobile/kyc', icon: Link2, color: '#00FFA3', description: 'ربط بورصاتك' },
      { label: 'الإعدادات', href: '/mobile/settings', icon: Settings, color: '#8B92A8', description: 'إعدادات التطبيق' },
      { label: 'الأمان', href: '/mobile/security', icon: Lock, color: '#FF4757', description: 'حماية الحساب' },
      { label: 'المساعدة', href: '/mobile/help', icon: HelpCircle, color: '#00D4FF', description: 'مركز المساعدة' },
      { label: 'API', href: '/mobile/api-docs', icon: Code, color: '#B388FF', description: 'توثيق واجهة البرمجة' },
    ],
  },
]

/* ═══ Item Card ═══ */
function ItemCard({ item }: { item: MoreItem }) {
  const router = useRouter()
  const Icon = item.icon

  return (
    <button
      onClick={() => router.push(item.href)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '12px 4px',
        borderRadius: 14,
        background: `${item.color}06`,
        border: `0.5px solid ${item.color}12`,
        cursor: 'pointer',
        touchAction: 'manipulation',
        width: '100%',
      }}
    >
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: `${item.color}12`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `0.5px solid ${item.color}20`,
      }}>
        <Icon size={18} color={item.color} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--f-cairo)', textAlign: 'center', lineHeight: 1.2 }}>
        {item.label}
      </span>
    </button>
  )
}

/* ═══ More Page ═══ */
export default function MorePage() {
  const router = useRouter()

  return (
    <div className="f-page f-stagger">
      <Header title="المزيد" subtitle="استكشف جميع الميزات" />

      {CATEGORIES.map(category => (
        <Card key={category.title}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)', marginBottom: 10 }}>
            {category.title}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {category.items.map(item => (
              <ItemCard key={item.href} item={item} />
            ))}
          </div>
        </Card>
      ))}

      {/* Quick Links */}
      <Card>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)', marginBottom: 10 }}>روابط سريعة</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { label: 'الشارت', href: '/mobile/chart', icon: TrendingUp, color: '#00D4FF' },
            { label: 'المحفظة', href: '/mobile/wallet', icon: BarChart3, color: '#00FFA3' },
            { label: 'الوكيل', href: '/mobile/agent', icon: Shield, color: '#FF9F43' },
            { label: 'الرادار', href: '/mobile/radar', icon: Radio, color: '#B388FF' },
          ].map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)',
                  border: '0.5px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${item.color}12`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={14} color={item.color} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Version Info */}
      <div style={{ textAlign: 'center', padding: '12px 0 0' }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--f-mono)' }}>رؤى v1.0.0</div>
      </div>

      <div style={{ height: 80 }} />
    </div>
  )
}
