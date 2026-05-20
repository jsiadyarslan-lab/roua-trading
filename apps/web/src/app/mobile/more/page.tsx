'use client'

import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import {
  Brain, FlaskConical, ScanSearch, Radio, Newspaper, HelpCircle,
  Activity, Zap, Target, BellRing, UserCircle, Link2, CreditCard,
  Fingerprint, Users, GitMerge, Trophy, Eye, Cpu, Code,
  CalendarDays, Shield, Store
} from 'lucide-react'

interface MoreItem { label: string; href: string; icon: any; color: string; isNew?: boolean; sub?: string }
interface MoreCategory { title: string; items: MoreItem[] }

const CATEGORIES: MoreCategory[] = [
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

export default function MobileMorePage() {
  const router = useRouter()

  return (
    <div className="m-page">
      <MobilePageHeader title="المزيد" subtitle="استكشف كل الأدوات والميزات" />

      {CATEGORIES.map((cat) => (
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
                  onClick={() => router.push(item.href)}
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
                  {item.sub && <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif", pointerEvents: 'none' }}>{item.sub}</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div style={{ height: 16 }} />
    </div>
  )
}
