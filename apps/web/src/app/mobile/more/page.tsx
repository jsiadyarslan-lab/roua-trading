'use client'
import { useRouter } from 'next/navigation'
import { Settings, Brain, Newspaper, Link2, Shield, HelpCircle, ChevronLeft } from 'lucide-react'

const ITEMS = [
  { label: 'الإعدادات', icon: Settings, href: '/mobile/settings', color: '#8B92A8' },
  { label: 'الذكاء الاصطناعي', icon: Brain, href: '/mobile/ai', color: '#B388FF' },
  { label: 'الأخبار', icon: Newspaper, href: '/mobile/news', color: '#FFB800' },
  { label: 'ربط الحسابات', icon: Link2, href: '/mobile/kyc', color: '#00FFA3' },
  { label: 'الأسواق', icon: HelpCircle, href: '/mobile/markets', color: '#00D4FF' },
  { label: 'المراكز', icon: Shield, href: '/mobile/positions', color: '#FF9F43' },
]

export default function MorePage() {
  const router = useRouter()
  return (
    <div className="m-page" style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="rgba(255,255,255,0.6)" /></button>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>المزيد</span>
      </div>
      {ITEMS.map(item => {
        const Icon = item.icon
        return (
          <button key={item.href} onClick={() => router.push(item.href)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 12px', background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 12, marginBottom: 8, cursor: 'pointer', direction: 'rtl' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={item.color} /></div>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)', flex: 1, textAlign: 'right' }}>{item.label}</span>
            <ChevronLeft size={16} color="rgba(255,255,255,0.2)" />
          </button>
        )
      })}
    </div>
  )
}
