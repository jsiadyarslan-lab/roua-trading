'use client'

import { motion } from 'framer-motion'
import { ChevronLeft, Link, Key, Bell, Shield, Globe, Moon, FileText, HelpCircle, LogOut, Crown } from 'lucide-react'
import { useRouter } from 'next/navigation'

const SETTINGS_SECTIONS = [
  {
    title: 'حسابات التداول',
    items: [
      { icon: Link, label: 'ربط حساب Binance', sub: 'غير مربوط', color: '#FFB800', href: '/settings' },
      { icon: Link, label: 'ربط حساب Alpaca', sub: 'غير مربوط', color: '#00D4FF', href: '/settings' },
      { icon: Key, label: 'إدارة مفاتيح API', sub: '2 مفتاح نشط', color: '#B388FF', href: '/settings' },
    ],
  },
  {
    title: 'التفضيلات',
    items: [
      { icon: Bell, label: 'إعدادات الإشعارات', sub: 'الكل مفعّل', color: '#00FFA3', href: '/settings' },
      { icon: Shield, label: 'الأمان (Passkeys)', sub: 'مفعّل', color: '#059669', href: '/settings' },
      { icon: Globe, label: 'اللغة', sub: 'العربية', color: '#00D4FF', href: '/settings' },
      { icon: Moon, label: 'المظهر', sub: 'داكن', color: '#B388FF', href: '/settings' },
    ],
  },
  {
    title: 'قانوني',
    items: [
      { icon: FileText, label: 'سياسة الخصوصية', sub: '', color: '#8B92A8', href: '/privacy' },
      { icon: FileText, label: 'شروط الاستخدام', sub: '', color: '#8B92A8', href: '/terms' },
    ],
  },
  {
    title: 'الدعم',
    items: [
      { icon: HelpCircle, label: 'المساعدة والدعم', sub: '', color: '#FFB800', href: '/support' },
    ],
  },
]

export default function MobileSettingsPage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: '#0B0E14', direction: 'rtl', paddingBottom: 32 }}>

      {/* ── Header ── */}
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 16px 20px', background: 'linear-gradient(180deg, rgba(212,175,55,0.08), transparent)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>الإعدادات</h1>
      </div>

      {/* ── Profile Card ── */}
      <div style={{ margin: '0 16px 20px' }}>
        <motion.div
          whileTap={{ scale: 0.99 }}
          style={{
            padding: '20px', borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(5,150,105,0.08))',
            border: '1px solid rgba(212,175,55,0.2)',
          }}
        >
          <div className="flex items-center gap-4">
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'linear-gradient(135deg, #d4af37, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 800, color: '#fff',
              boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
            }}>ر</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>مستخدم رؤى</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
                user@roua.trading
              </p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Crown size={16} color="#d4af37" />
              <span style={{ fontSize: 9, color: '#d4af37', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>Pro</span>
            </div>
          </div>

          {/* Subscription Badge */}
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 12,
            background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, color: '#d4af37', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
              🌟 خطة Pro — نشط
            </span>
            <button style={{
              padding: '4px 12px', borderRadius: 8, background: '#d4af37',
              border: 'none', fontSize: 11, color: '#0B0E14', fontWeight: 700,
              fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            }}>
              ترقية
            </button>
          </div>
        </motion.div>
      </div>

      {/* ── Settings Sections ── */}
      {SETTINGS_SECTIONS.map((section, si) => (
        <div key={si} style={{ margin: '0 16px 16px' }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif", marginBottom: 8, paddingRight: 4 }}>
            {section.title}
          </p>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16, overflow: 'hidden',
          }}>
            {section.items.map((item, ii) => {
              const Icon = item.icon
              return (
                <motion.button
                  key={ii}
                  whileTap={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                  onClick={() => router.push(item.href)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    width: '100%', padding: '14px 16px', background: 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'right',
                    borderBottom: ii < section.items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: `${item.color}15`, border: `1px solid ${item.color}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={16} color={item.color} />
                  </div>
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
                      {item.label}
                    </p>
                    {item.sub && (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif", marginTop: 1 }}>
                        {item.sub}
                      </p>
                    )}
                  </div>
                  <ChevronLeft size={14} color="rgba(255,255,255,0.2)" style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
                </motion.button>
              )
            })}
          </div>
        </div>
      ))}

      {/* ── Logout ── */}
      <div style={{ margin: '0 16px' }}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            // Clear all relevant cookies and storage
            document.cookie = 'roua_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
            localStorage.clear()
            sessionStorage.clear()
            window.location.href = '/login'
          }}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 16,
            background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.2)',
            color: '#FF4757', fontSize: 14, fontWeight: 700,
            fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <LogOut size={16} />
          تسجيل الخروج
        </motion.button>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: "'Cairo', sans-serif", marginTop: 16 }}>
          رؤى للتداول v2.0.0 — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  )
}
