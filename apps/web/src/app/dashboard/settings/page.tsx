import { Settings, Shield, Key, Bell, User, Palette, ArrowUpRight } from 'lucide-react'

const T = {
  blue: '#0A84FF', cyan: '#00C8FF', green: '#00FFC6', red: '#FF4D4D', amber: '#FFB800',
  text: '#E6EBF5', text2: '#8090A8', border: 'rgba(10,132,255,0.14)',
  card: 'rgba(13,21,32,0.9)',
}

const SECTIONS = [
  { icon: User,    label: 'الملف الشخصي',    color: T.blue,  desc: 'تعديل بياناتك الشخصية' },
  { icon: Shield,  label: 'الأمان والمصادقة', color: T.green, desc: 'Passkeys وإعدادات WebAuthn' },
  { icon: Key,     label: 'مفاتيح API',       color: T.amber, desc: 'ربط منصات التداول' },
  { icon: Bell,    label: 'الإشعارات',        color: T.cyan,  desc: 'تخصيص التنبيهات والتحذيرات' },
  { icon: Palette, label: 'المظهر واللغة',    color: T.blue,  desc: 'ثيم المنصة وإعدادات RTL' },
  { icon: Settings,label: 'التداول',          color: T.amber, desc: 'الرافعة الافتراضية وحجم الأوامر' },
]

export default function SettingsPage() {
  return (
    <div style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Settings size={20} color={T.text2} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>الإعدادات</h1>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: 'rgba(255,255,255,0.06)', color: T.text2,
            fontFamily: "'JetBrains Mono', monospace",
          }}>SETTINGS</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
          تخصيص منصة رؤى وفق تفضيلاتك
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {SECTIONS.map((s, i) => (
          <div key={i} style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 14, padding: '20px',
            display: 'flex', alignItems: 'center', gap: 16,
            cursor: 'pointer',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${s.color}14`, border: `0.5px solid ${s.color}30`,
              flexShrink: 0,
            }}>
              <s.icon size={18} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: T.text2 }}>{s.desc}</div>
            </div>
            <div style={{ marginRight: 'auto' }}>
              <div style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', color: T.text2,
                fontFamily: "'JetBrains Mono', monospace",
              }}>قريباً</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
