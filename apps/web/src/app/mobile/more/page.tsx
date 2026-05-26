'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Settings, Brain, Newspaper, Link2, Shield, HelpCircle, ChevronLeft } from 'lucide-react'

export default function MorePage() {
  const router = useRouter()
  const t = useTranslations('mobile.more')

  const ITEMS = [
    { label: t('settings'), icon: Settings, href: '/mobile/settings', color: '#8B92A8' },
    { label: t('ai'), icon: Brain, href: '/mobile/ai', color: '#B388FF' },
    { label: t('news'), icon: Newspaper, href: '/mobile/news', color: '#FFB800' },
    { label: t('linkAccounts'), icon: Link2, href: '/mobile/kyc', color: '#00FFA3' },
    { label: t('markets'), icon: HelpCircle, href: '/mobile/markets', color: '#00D4FF' },
    { label: t('positions'), icon: Shield, href: '/mobile/positions', color: '#FF9F43' },
  ]

  return (
    <div className="m-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="rgba(255,255,255,0.6)" /></button>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>{t('title')}</span>
      </div>
      {ITEMS.map(item => {
        const Icon = item.icon
        return (
          <button key={item.href} onClick={() => router.push(item.href)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 12px', background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 12, marginBottom: 8, cursor: 'pointer' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={item.color} /></div>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)', flex: 1, textAlign: 'start' }}>{item.label}</span>
            <ChevronLeft size={16} color="rgba(255,255,255,0.2)" />
          </button>
        )
      })}
    </div>
  )
}
