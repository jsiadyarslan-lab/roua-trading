'use client'
import { PageHeader, Card, Switch } from '@/components/mobile/Card'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useRouter } from 'next/navigation'
import { User, Cpu, Shield, Globe, Bell, Volume2 } from 'lucide-react'

export default function MobileSettingsPage() {
  const router = useRouter()
  const settings = useNotificationStore(s => s.settings)
  const updateSettings = useNotificationStore(s => s.updateSettings)
  const items = [
    { label: 'الملف الشخصي', icon: User, href: '/mobile/profile', color: '#00D4FF' },
    { label: 'المنفذ الذكي', icon: Cpu, href: '/mobile/bot', color: '#059669' },
    { label: 'الأمان', icon: Shield, href: '/mobile/security', color: '#32D74B' },
  ]
  return (
    <div className="r-page">
      <PageHeader title="الإعدادات" />
      {items.map(item => {
        const Icon = item.icon
        return (
          <Card key={item.href} onClick={() => router.push(item.href)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={16} color={item.color} /></div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)', flex: 1 }}>{item.label}</span>
            </div>
          </Card>
        )
      })}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bell size={16} color="#00D4FF" /><span style={{ fontSize: 13, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>إشعارات المتصفح</span></div>
          <Switch value={settings.browserNotifications ?? true} onChange={v => updateSettings({ browserNotifications: v })} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Volume2 size={16} color="#FFB800" /><span style={{ fontSize: 13, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>صوت التنبيهات</span></div>
          <Switch value={settings.soundEnabled ?? false} onChange={v => updateSettings({ soundEnabled: v })} />
        </div>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  )
}
