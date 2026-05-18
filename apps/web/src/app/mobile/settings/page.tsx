'use client'

import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { UserCircle, Cpu, Bell, Shield, Globe, ChevronLeft } from 'lucide-react'

export default function MobileSettingsPage() {
  const router = useRouter()
  const settings = useNotificationStore(s => s.settings)
  const updateSettings = useNotificationStore(s => s.updateSettings)

  const sections = [
    { icon: UserCircle, color: '#00D4FF', label: 'الملف الشخصي', href: '/mobile/profile' },
    { icon: Cpu, color: '#059669', label: 'إعدادات البوت', href: '/mobile/bot' },
    { icon: Shield, color: '#B388FF', label: 'الأمان', href: '/mobile/security' },
    { icon: Globe, color: '#d4af37', label: 'اللغة', href: '#', badge: 'العربية' },
  ]

  return (
    <div className="m-page">
      <MobilePageHeader title="الإعدادات" subtitle="تخصيص التطبيق" />

      {/* Profile */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #00D4FF, #5B21B6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCircle size={24} color="#FFF" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>حسابك</div>
            <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>إدارة الملف الشخصي والإعدادات</div>
          </div>
          <ChevronLeft size={16} color="rgba(255,255,255,0.2)" />
        </div>
      </IOSCard>

      {/* Sections */}
      {sections.map(s => (
        <IOSCard key={s.label} onClick={() => s.href !== '#' && router.push(s.href)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <s.icon size={18} color={s.color} />
            </div>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{s.label}</span>
            {s.badge && <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{s.badge}</span>}
            <ChevronLeft size={14} color="rgba(255,255,255,0.15)" />
          </div>
        </IOSCard>
      ))}

      {/* Notifications settings */}
      <IOSCard>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Bell size={16} color="#FFB800" />الإشعارات</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>متصفح</span>
          <IOSSwitch value={settings.browserNotifications} onChange={v => updateSettings({ browserNotifications: v })} color="#059669" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الصوت</span>
          <IOSSwitch value={settings.soundEnabled} onChange={v => updateSettings({ soundEnabled: v })} color="#d4af37" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
          <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>إشعارات التداول</span>
          <IOSSwitch value={settings.tradeAlerts} onChange={v => updateSettings({ tradeAlerts: v })} color="#00D4FF" />
        </div>
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
