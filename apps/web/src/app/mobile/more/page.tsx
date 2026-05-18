'use client'

import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import {
  Brain, BarChart3, TrendingUp, Shield, Newspaper, Bell, Calendar,
  GitCompare, FlaskConical, Code, Wallet, Cpu, Settings, Link2,
  FileText, HelpCircle, Bug, Zap, Target, Activity, PieChart, Eye
} from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

interface FeatureItem {
  label: string
  href: string
  icon: React.ReactNode
  color: string
  description: string
}

const FEATURE_CATEGORIES: { title: string; items: FeatureItem[] }[] = [
  {
    title: 'الذكاء الاصطناعي',
    items: [
      { label: 'مجلس AI', href: '/mobile/ai', icon: <Brain size={18} />, color: '#B388FF', description: 'إجماع 6 نماذج' },
      { label: 'الإشارات الذكية', href: '/mobile/signals', icon: <Zap size={18} />, color: C.success, description: 'توصيات تداول' },
      { label: 'سوق التوقعات', href: '/mobile/prediction-market', icon: <Target size={18} />, color: C.accent, description: 'AI مقابل السوق' },
      { label: 'مختبر التداول', href: '/mobile/neural', icon: <FlaskConical size={18} />, color: '#FF9F43', description: 'اختبار رجعي ومحسّن' },
    ],
  },
  {
    title: 'تحليلات',
    items: [
      { label: 'السكانر', href: '/mobile/scanner', icon: <Eye size={18} />, color: C.accent, description: 'فحص الأسواق' },
      { label: 'الارتباط', href: '/mobile/correlation', icon: <GitCompare size={18} />, color: C.success, description: 'مصفوفة بيرسون' },
      { label: 'التقويم الاقتصادي', href: '/mobile/calendar', icon: <Calendar size={18} />, color: C.amber, description: 'أحداث مؤثرة' },
      { label: 'تحليل المخاطر', href: '/mobile/sanctuary', icon: <Shield size={18} />, color: '#00C853', description: 'تنويع وتقييم' },
    ],
  },
  {
    title: 'محفظة وتداول',
    items: [
      { label: 'المحفظة', href: '/mobile/portfolio', icon: <Wallet size={18} />, color: C.accent, description: 'توزيع وأداء' },
      { label: 'المنفذ الذكي', href: '/mobile/bot', icon: <Cpu size={18} />, color: '#059669', description: 'تداول ذاتي' },
      { label: 'المراكز', href: '/mobile/positions', icon: <Activity size={18} />, color: '#00C853', description: 'المراكز المفتوحة' },
    ],
  },
  {
    title: 'معلومات',
    items: [
      { label: 'الأخبار', href: '/mobile/news', icon: <Newspaper size={18} />, color: C.amber, description: 'أخبار مالية' },
      { label: 'الإشعارات', href: '/mobile/notifications', icon: <Bell size={18} />, color: C.danger, description: 'مركز التنبيهات' },
      { label: 'توثيق API', href: '/mobile/api-docs', icon: <Code size={18} />, color: C.text2, description: 'واجهة برمجة' },
    ],
  },
  {
    title: 'الحساب',
    items: [
      { label: 'ربط الحسابات', href: '/mobile/kyc', icon: <Link2 size={18} />, color: C.success, description: 'ربط البورصات' },
      { label: 'الملف الشخصي', href: '/mobile/profile', icon: <Settings size={18} />, color: C.text2, description: 'الإعدادات' },
    ],
  },
]

export default function MobileMorePage() {
  const router = useRouter()

  return (
    <div className="m-page">
      <MobilePageHeader
        title="المزيد"
        subtitle="جميع الميزات والإعدادات"
        onBack={() => router.back()}
      />

      {FEATURE_CATEGORIES.map((category) => (
        <div key={category.title}>
          {/* Category Title */}
          <div className="m-section">
            <div className="m-section__title">{category.title}</div>
          </div>

          {/* Feature Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 16 }}>
            {category.items.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 8px',
                  borderRadius: 16,
                  background: `${item.color}06`,
                  border: `0.5px solid ${item.color}15`,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: `${item.color}12`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: item.color,
                }}>
                  {item.icon}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{item.label}</div>
                  <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif", marginTop: 1 }}>{item.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Version Info */}
      <div style={{ textAlign: 'center', padding: '16px 16px 8px', opacity: 0.3 }}>
        <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>رؤى — منصة ربط حسابات</div>
        <div style={{ fontSize: 8, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>v2.0.0</div>
      </div>

      <div style={{ height: 20 }} />
    </div>
  )
}
