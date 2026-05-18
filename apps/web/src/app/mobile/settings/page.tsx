'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, Link2, Cpu, Bell, Shield, Globe, ChevronLeft,
  Moon, Volume2, Vibrate, Mail, MessageSquare, Smartphone,
  Lock, Eye, Languages,
} from 'lucide-react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { useAuthStore } from '@/lib/auth-store'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757',
  amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8',
  bg: '#1A1D29', border: 'rgba(255,255,255,0.06)',
}
const FONT_AR = "'Cairo', sans-serif"

/* ─── Settings Section ─── */
function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="m-section">
      <div className="m-section__title">{title}</div>
      {children}
    </div>
  )
}

/* ─── Settings Row ─── */
function SettingsRow({
  icon, iconColor, label, subtitle, right, onClick,
}: {
  icon: React.ReactNode
  iconColor: string
  label: string
  subtitle?: string
  right?: React.ReactNode
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 0', borderBottom: `0.5px solid ${C.border}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `${iconColor}12`, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>{label}</div>
        {subtitle && <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>{subtitle}</div>}
      </div>
      {right || (onClick && <ChevronLeft size={14} color="rgba(255,255,255,0.15)" />)}
    </div>
  )
}

/* ─── Settings Page ─── */
export default function MobileSettingsPage() {
  const router = useRouter()
  const user = useAuthStore(s => s.user)

  // Notification settings
  const [pushNotif, setPushNotif] = useState(true)
  const [emailNotif, setEmailNotif] = useState(false)
  const [tradeNotif, setTradeNotif] = useState(true)
  const [priceAlertNotif, setPriceAlertNotif] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [vibrationEnabled, setVibrationEnabled] = useState(true)

  // Bot settings
  const [autoTrade, setAutoTrade] = useState(false)
  const [paperMode, setPaperMode] = useState(true)
  const [riskLimit, setRiskLimit] = useState(true)

  // Security
  const [biometric, setBiometric] = useState(false)
  const [hideBalance, setHideBalance] = useState(false)

  // Language
  const [lang, setLang] = useState('ar')

  const displayName = user?.displayName || 'مستخدم رؤى'
  const email = user?.email || '—'

  return (
    <div className="m-page">
      <MobilePageHeader title="الإعدادات" />

      {/* Profile Section */}
      <SettingsSection title="الحساب">
        <IOSCard>
          <SettingsRow
            icon={<User size={14} color={C.accent} />}
            iconColor={C.accent}
            label="الملف الشخصي"
            subtitle={`${displayName} — ${email}`}
            onClick={() => router.push('/mobile/profile')}
          />
          <SettingsRow
            icon={<Link2 size={14} color={C.success} />}
            iconColor={C.success}
            label="ربط الحسابات"
            subtitle="إدارة بورصاتك ومفاتيح API"
            onClick={() => router.push('/mobile/kyc')}
          />
          <SettingsRow
            icon={<Link2 size={14} color={C.amber} />}
            iconColor={C.amber}
            label="مفاتيح البورصات"
            subtitle="عرض وتعديل وحذف المفاتيح"
            onClick={() => router.push('/mobile/settings/exchange')}
            right={<ChevronLeft size={14} color="rgba(255,255,255,0.15)" />}
          />
        </IOSCard>
      </SettingsSection>

      {/* Bot Settings */}
      <SettingsSection title="إعدادات البوت">
        <IOSCard>
          <SettingsRow
            icon={<Cpu size={14} color="#A259FF" />}
            iconColor="#A259FF"
            label="التداول التلقائي"
            subtitle="السماح للبوت بتنفيذ الصفقات"
            right={<IOSSwitch value={autoTrade} onChange={setAutoTrade} color={C.accent} />}
          />
          <SettingsRow
            icon={<Eye size={14} color={C.accent} />}
            iconColor={C.accent}
            label="الوضع الورقي"
            subtitle="تداول بأموال وهمية"
            right={<IOSSwitch value={paperMode} onChange={setPaperMode} color={C.success} />}
          />
          <SettingsRow
            icon={<Shield size={14} color={C.amber} />}
            iconColor={C.amber}
            label="حد المخاطرة"
            subtitle="إيقاف تلقائي عند تجاوز الحد"
            right={<IOSSwitch value={riskLimit} onChange={setRiskLimit} color={C.amber} />}
          />
        </IOSCard>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection title="الإشعارات">
        <IOSCard>
          <SettingsRow
            icon={<Bell size={14} color={C.accent} />}
            iconColor={C.accent}
            label="الإشعارات الفورية"
            subtitle="تلقي تنبيهات فورية"
            right={<IOSSwitch value={pushNotif} onChange={setPushNotif} color={C.accent} />}
          />
          <SettingsRow
            icon={<Mail size={14} color="#8B92A8" />}
            iconColor="#8B92A8"
            label="إشعارات البريد"
            subtitle="تلقي تحديثات عبر البريد"
            right={<IOSSwitch value={emailNotif} onChange={setEmailNotif} color={C.accent} />}
          />
          <SettingsRow
            icon={<Smartphone size={14} color={C.success} />}
            iconColor={C.success}
            label="تنبيهات الصفقات"
            subtitle="إشعار عند تنفيذ صفقة"
            right={<IOSSwitch value={tradeNotif} onChange={setTradeNotif} color={C.success} />}
          />
          <SettingsRow
            icon={<MessageSquare size={14} color={C.amber} />}
            iconColor={C.amber}
            label="تنبيهات الأسعار"
            subtitle="إشعار عند وصول السعر للهدف"
            right={<IOSSwitch value={priceAlertNotif} onChange={setPriceAlertNotif} color={C.amber} />}
          />
          <SettingsRow
            icon={<Volume2 size={14} color="#A259FF" />}
            iconColor="#A259FF"
            label="الأصوات"
            subtitle="تشغيل أصوات الإشعارات"
            right={<IOSSwitch value={soundEnabled} onChange={setSoundEnabled} color="#A259FF" />}
          />
          <SettingsRow
            icon={<Vibrate size={14} color="#FF6B6B" />}
            iconColor="#FF6B6B"
            label="الاهتزاز"
            subtitle="اهتزاز الجهاز عند الإشعار"
            right={<IOSSwitch value={vibrationEnabled} onChange={setVibrationEnabled} color="#FF6B6B" />}
          />
        </IOSCard>
      </SettingsSection>

      {/* Security */}
      <SettingsSection title="الأمان">
        <IOSCard>
          <SettingsRow
            icon={<Lock size={14} color={C.danger} />}
            iconColor={C.danger}
            label="المصادقة الثنائية (2FA)"
            subtitle="حماية إضافية لحسابك"
            onClick={() => router.push('/mobile/security')}
          />
          <SettingsRow
            icon={<Cpu size={14} color={C.accent} />}
            iconColor={C.accent}
            label="المصادقة البيومترية"
            subtitle="بصمة / Face ID"
            right={<IOSSwitch value={biometric} onChange={setBiometric} color={C.accent} />}
          />
          <SettingsRow
            icon={<Eye size={14} color={C.amber} />}
            iconColor={C.amber}
            label="إخفاء الرصيد"
            subtitle="إخفاء الأرصدة عند فتح التطبيق"
            right={<IOSSwitch value={hideBalance} onChange={setHideBalance} color={C.amber} />}
          />
          <SettingsRow
            icon={<Shield size={14} color={C.success} />}
            iconColor={C.success}
            label="الجلسات النشطة"
            subtitle="إدارة الأجهزة المتصلة"
            onClick={() => router.push('/mobile/security')}
          />
        </IOSCard>
      </SettingsSection>

      {/* Language */}
      <SettingsSection title="اللغة والمظهر">
        <IOSCard>
          <SettingsRow
            icon={<Languages size={14} color={C.accent} />}
            iconColor={C.accent}
            label="اللغة"
            subtitle={lang === 'ar' ? 'العربية' : 'English'}
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          />
          <SettingsRow
            icon={<Moon size={14} color="#8B92A8" />}
            iconColor="#8B92A8"
            label="المظهر الداكن"
            subtitle="مُفعّل دائماً"
            right={<IOSSwitch value={true} onChange={() => {}} color={C.accent} />}
          />
          <SettingsRow
            icon={<Globe size={14} color={C.success} />}
            iconColor={C.success}
            label="المنطقة الزمنية"
            subtitle="توقيت الرياض (UTC+3)"
            onClick={() => {}}
          />
        </IOSCard>
      </SettingsSection>

      {/* Billing & Help */}
      <SettingsSection title="أخرى">
        <IOSCard>
          <SettingsRow
            icon={<Cpu size={14} color={C.amber} />}
            iconColor={C.amber}
            label="الاشتراك والفوترة"
            subtitle="إدارة خطتك ومدفوعاتك"
            onClick={() => router.push('/mobile/billing')}
          />
          <SettingsRow
            icon={<MessageSquare size={14} color={C.accent} />}
            iconColor={C.accent}
            label="المساعدة والدعم"
            subtitle="الأسئلة الشائعة والتواصل"
            onClick={() => router.push('/mobile/help')}
          />
        </IOSCard>
      </SettingsSection>

      {/* Version */}
      <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)', fontFamily: "'JetBrains Mono', monospace", direction: 'ltr' }}>
          رؤى v2.0.0 — منصة ربط حسابات
        </div>
      </div>

      <div style={{ height: 16 }} />
    </div>
  )
}
