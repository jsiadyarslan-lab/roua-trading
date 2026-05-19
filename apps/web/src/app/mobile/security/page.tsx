'use client'

import { useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Fingerprint, Shield, Smartphone, Monitor, Globe, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react'

const MOCK_SESSIONS = [
  { id: 1, device: 'iPhone 15 Pro', location: 'الرياض، السعودية', time: 'الآن', isCurrent: true, icon: Smartphone },
  { id: 2, device: 'Chrome - Windows', location: 'جدة، السعودية', time: 'منذ ساعتين', isCurrent: false, icon: Monitor },
  { id: 3, device: 'Safari - iPad', location: 'الدمام، السعودية', time: 'منذ يوم', isCurrent: false, icon: Globe },
]

export default function MobileSecurityPage() {
  const [twoFA, setTwoFA] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="m-page">
      <MobilePageHeader title="الأمان" subtitle="حماية حسابك" />

      {/* 2FA */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: twoFA ? 'rgba(0,255,163,0.1)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${twoFA ? 'rgba(0,255,163,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
              <Fingerprint size={18} color={twoFA ? '#00FFA3' : '#8B92A8'} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>المصادقة الثنائية (2FA)</div>
              <div style={{ fontSize: 10, color: twoFA ? '#00FFA3' : '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{twoFA ? 'مفعّلة' : 'غير مفعّلة'}</div>
            </div>
          </div>
          <button onClick={() => setTwoFA(!twoFA)} style={{ width: 44, height: 24, borderRadius: 12, background: twoFA ? '#00FFA3' : 'rgba(255,255,255,0.1)', position: 'relative', border: 'none', cursor: 'pointer', touchAction: 'manipulation', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, insetInlineStart: twoFA ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#FFF', transition: 'inset-inline-start 0.2s' }} />
          </button>
        </div>
      </IOSCard>

      {/* Password Change */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Lock size={16} color="#d4af37" />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>تغيير كلمة المرور</span>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 3 }}>كلمة المرور الحالية</label>
          <div style={{ position: 'relative' }}>
            <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" style={{ width: '100%', padding: '8px 36px 8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', insetInlineEnd: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{showPassword ? <EyeOff size={14} color="#8B92A8" /> : <Eye size={14} color="#8B92A8" />}</button>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 3 }}>كلمة المرور الجديدة</label>
          <input type="password" placeholder="••••••••" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button style={{ width: '100%', padding: '8px 0', borderRadius: 8, background: 'rgba(0,212,255,0.1)', border: '0.5px solid rgba(0,212,255,0.2)', color: '#00D4FF', fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', touchAction: 'manipulation' }}>تحديث كلمة المرور</button>
      </IOSCard>

      {/* Active Sessions */}
      <div style={{ padding: '0 16px', marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>الجلسات النشطة</span></div>
      {MOCK_SESSIONS.map(session => {
        const Icon = session.icon
        return (
          <IOSCard key={session.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: session.isCurrent ? 'rgba(0,255,163,0.1)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={session.isCurrent ? '#00FFA3' : '#8B92A8'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{session.device}</span>
                  {session.isCurrent && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(0,255,163,0.1)', color: '#00FFA3', fontFamily: "'Cairo', sans-serif" }}>هذا الجهاز</span>}
                </div>
                <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{session.location} • {session.time}</div>
              </div>
              {!session.isCurrent && <button style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255,69,58,0.08)', border: '0.5px solid rgba(255,69,58,0.15)', color: '#FF453A', fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', touchAction: 'manipulation' }}>إنهاء</button>}
            </div>
          </IOSCard>
        )
      })}

      {/* Security Tips */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Shield size={16} color="#d4af37" /><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>نصائح أمنية</span></div>
        {['فعّل المصادقة الثنائية لحماية إضافية', 'لا تشارك مفاتيح API مع أي شخص', 'غيّر كلمة المرور بشكل دوري', 'تأكد من تسجيل الخروج من الأجهزة المشتركة'].map((tip, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, padding: '4px 0' }}><AlertTriangle size={10} color="#d4af37" style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.4 }}>{tip}</span></div>
        ))}
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
