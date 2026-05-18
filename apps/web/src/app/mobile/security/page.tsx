'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Shield, Lock, Smartphone, Key, Eye, EyeOff, CheckCircle2,
  AlertTriangle, Fingerprint, Monitor, Trash2, Loader2,
  RefreshCw, ChevronLeft, Globe,
} from 'lucide-react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757',
  amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8',
  bg: '#1A1D29', border: 'rgba(255,255,255,0.06)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Mock Sessions ─── */
const MOCK_SESSIONS = [
  { id: '1', device: 'iPhone 15 Pro', location: 'الرياض، السعودية', ip: '192.168.1.***', lastActive: 'الآن', current: true, icon: Smartphone },
  { id: '2', device: 'MacBook Pro', location: 'جدة، السعودية', ip: '10.0.0.***', lastActive: 'منذ ساعتين', current: false, icon: Monitor },
  { id: '3', device: 'Chrome — Windows', location: 'دبي، الإمارات', ip: '172.16.0.***', lastActive: 'منذ يومين', current: false, icon: Globe },
]

/* ─── Security Score ─── */
function SecurityScore({ score }: { score: number }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 80 ? C.success : score >= 50 ? C.amber : C.danger
  const label = score >= 80 ? 'ممتاز' : score >= 50 ? 'جيد' : 'يحتاج تحسين'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="50" cy="50" r={radius}
            fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6"
          />
          <motion.circle
            cx="50" cy="50" r={radius}
            fill="none" stroke={color} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 22, fontWeight: 900, color, fontFamily: FONT_MONO }}>{score}</span>
          <span style={{ fontSize: 7, fontWeight: 700, color: C.text2, fontFamily: FONT_AR }}>من 100</span>
        </div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: FONT_AR }}>{label}</span>
    </div>
  )
}

/* ─── Security Page ─── */
export default function MobileSecurityPage() {
  const router = useRouter()

  // 2FA
  const [tfaEnabled, setTfaEnabled] = useState(false)
  const [showTfaSetup, setShowTfaSetup] = useState(false)
  const [tfaCode, setTfaCode] = useState('')

  // Biometric
  const [biometric, setBiometric] = useState(false)

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  // Sessions
  const [sessions] = useState(MOCK_SESSIONS)
  const [revokingSession, setRevokingSession] = useState<string | null>(null)

  // Compute security score
  const securityScore = (() => {
    let score = 30 // base
    if (tfaEnabled) score += 30
    if (biometric) score += 15
    if (newPassword || true) score += 10 // has password
    if (sessions.length <= 2) score += 15 // few sessions
    return Math.min(score, 100)
  })()

  /* Handle 2FA toggle */
  const handleTfaToggle = (val: boolean) => {
    if (val) {
      setShowTfaSetup(true)
    } else {
      setTfaEnabled(false)
    }
  }

  /* Handle 2FA verify */
  const handleTfaVerify = () => {
    if (tfaCode.length >= 6) {
      setTfaEnabled(true)
      setShowTfaSetup(false)
      setTfaCode('')
    }
  }

  /* Handle password change */
  const handlePasswordChange = async () => {
    setPwError('')
    setPwSuccess(false)

    if (newPassword !== confirmPassword) {
      setPwError('كلمتا المرور غير متطابقتين')
      return
    }
    if (newPassword.length < 8) {
      setPwError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }

    setChangingPassword(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        setPwSuccess(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => {
          setShowPasswordChange(false)
          setPwSuccess(false)
        }, 2000)
      } else {
        const data = await res.json().catch(() => ({}))
        setPwError(data.error || data.message || 'فشل في تغيير كلمة المرور')
      }
    } catch {
      setPwError('خطأ في الاتصال')
    } finally {
      setChangingPassword(false)
    }
  }

  /* Revoke session */
  const handleRevokeSession = (id: string) => {
    setRevokingSession(id)
    setTimeout(() => setRevokingSession(null), 1000)
  }

  /* Password input */
  function PasswordInput({
    value, onChange, placeholder, show, onToggle,
  }: {
    value: string; onChange: (v: string) => void
    placeholder: string; show: boolean; onToggle: () => void
  }) {
    return (
      <div style={{ position: 'relative' }}>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          dir="ltr"
          style={{
            width: '100%', padding: '10px 40px 10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`,
            color: C.text, fontSize: 12, fontFamily: FONT_MONO,
            outline: 'none', direction: 'ltr', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={onToggle}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          }}
        >
          {show ? <EyeOff size={14} color={C.text2} /> : <Eye size={14} color={C.text2} />}
        </button>
      </div>
    )
  }

  return (
    <div className="m-page">
      <MobilePageHeader title="الأمان" subtitle="حماية حسابك" />

      {/* Security Score */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <SecurityScore score={securityScore} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR, marginBottom: 6 }}>
              مستوى الأمان
            </div>
            <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, lineHeight: 1.6 }}>
              {tfaEnabled
                ? 'حسابك محمي بشكل جيد. فعّل المصادقة البيومترية لزيادة الحماية.'
                : 'فعّل المصادقة الثنائية لتحسين أمان حسابك بشكل كبير.'
              }
            </div>
            {!tfaEnabled && (
              <button
                onClick={() => setShowTfaSetup(true)}
                style={{
                  marginTop: 8, padding: '6px 14px', borderRadius: 8,
                  background: `linear-gradient(135deg, ${C.success}, #00CC8E)`,
                  border: 'none', color: '#000', fontSize: 9, fontWeight: 800,
                  fontFamily: FONT_AR, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Shield size={10} />
                تفعيل المصادقة الثنائية
              </button>
            )}
          </div>
        </div>
      </IOSCard>

      {/* 2FA Section */}
      <div className="m-section">
        <div className="m-section__title">المصادقة الثنائية (2FA)</div>
      </div>

      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${C.success}12`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Lock size={14} color={C.success} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                المصادقة الثنائية
              </div>
              <div style={{ fontSize: 9, color: tfaEnabled ? C.success : C.text2, fontFamily: FONT_AR }}>
                {tfaEnabled ? 'مُفعّلة' : 'غير مُفعّلة'}
              </div>
            </div>
          </div>
          <IOSSwitch value={tfaEnabled} onChange={handleTfaToggle} color={C.success} />
        </div>
      </IOSCard>

      {/* 2FA Setup Modal */}
      {showTfaSetup && (
        <IOSCard highlight>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{
              width: 80, height: 80, borderRadius: 14, margin: '0 auto 10px',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Key size={28} color={C.accent} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
              امسح رمز QR بتطبيق المصادقة
            </div>
            <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR, marginTop: 2 }}>
              مثل Google Authenticator أو Authy
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, display: 'block', marginBottom: 4 }}>
              أدخل رمز التحقق
            </label>
            <input
              value={tfaCode}
              onChange={e => setTfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              dir="ltr"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`,
                color: C.text, fontSize: 16, fontFamily: FONT_MONO,
                outline: 'none', textAlign: 'center', letterSpacing: 4,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setShowTfaSetup(false); setTfaCode('') }}
              style={{
                flex: 1, padding: 8, borderRadius: 8,
                background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${C.border}`,
                color: C.text2, fontSize: 10, fontWeight: 700, fontFamily: FONT_AR,
                cursor: 'pointer',
              }}
            >
              إلغاء
            </button>
            <button
              onClick={handleTfaVerify}
              disabled={tfaCode.length < 6}
              style={{
                flex: 1, padding: 8, borderRadius: 8,
                background: tfaCode.length >= 6
                  ? `linear-gradient(135deg, ${C.success}, #00CC8E)`
                  : 'rgba(255,255,255,0.05)',
                border: 'none',
                color: tfaCode.length >= 6 ? '#000' : C.text2,
                fontSize: 10, fontWeight: 800, fontFamily: FONT_AR,
                cursor: tfaCode.length >= 6 ? 'pointer' : 'not-allowed',
              }}
            >
              تحقق
            </button>
          </div>
        </IOSCard>
      )}

      {/* Biometric */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${C.accent}12`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Fingerprint size={14} color={C.accent} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                المصادقة البيومترية
              </div>
              <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>
                بصمة الإصبع / Face ID
              </div>
            </div>
          </div>
          <IOSSwitch value={biometric} onChange={setBiometric} color={C.accent} />
        </div>
      </IOSCard>

      {/* Change Password */}
      <div className="m-section">
        <div className="m-section__title">كلمة المرور</div>
      </div>

      {showPasswordChange ? (
        <IOSCard>
          <PasswordInput
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="كلمة المرور الحالية"
            show={showCurrentPw}
            onToggle={() => setShowCurrentPw(!showCurrentPw)}
          />
          <div style={{ height: 8 }} />
          <PasswordInput
            value={newPassword}
            onChange={setNewPassword}
            placeholder="كلمة المرور الجديدة"
            show={showNewPw}
            onToggle={() => setShowNewPw(!showNewPw)}
          />
          <div style={{ height: 8 }} />
          <PasswordInput
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="تأكيد كلمة المرور"
            show={showNewPw}
            onToggle={() => setShowNewPw(!showNewPw)}
          />

          {pwError && (
            <div style={{
              marginTop: 8, padding: '6px 10px', borderRadius: 8,
              background: `${C.danger}08`, border: `0.5px solid ${C.danger}18`,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <AlertTriangle size={10} color={C.danger} />
              <span style={{ fontSize: 9, color: C.danger, fontFamily: FONT_AR }}>{pwError}</span>
            </div>
          )}

          {pwSuccess && (
            <div style={{
              marginTop: 8, padding: '6px 10px', borderRadius: 8,
              background: `${C.success}08`, border: `0.5px solid ${C.success}18`,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <CheckCircle2 size={10} color={C.success} />
              <span style={{ fontSize: 9, color: C.success, fontFamily: FONT_AR }}>تم تغيير كلمة المرور بنجاح</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button
              onClick={() => {
                setShowPasswordChange(false)
                setPwError('')
                setPwSuccess(false)
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
              }}
              style={{
                flex: 1, padding: 8, borderRadius: 8,
                background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${C.border}`,
                color: C.text2, fontSize: 10, fontWeight: 700, fontFamily: FONT_AR,
                cursor: 'pointer',
              }}
            >
              إلغاء
            </button>
            <button
              onClick={handlePasswordChange}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              style={{
                flex: 1, padding: 8, borderRadius: 8,
                background: (currentPassword && newPassword && confirmPassword && !changingPassword)
                  ? `linear-gradient(135deg, ${C.accent}, #00A8CC)`
                  : 'rgba(255,255,255,0.05)',
                border: 'none',
                color: (currentPassword && newPassword && confirmPassword && !changingPassword) ? '#000' : C.text2,
                fontSize: 10, fontWeight: 800, fontFamily: FONT_AR,
                cursor: changingPassword ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              {changingPassword ? (
                <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <RefreshCw size={10} />
              )}
              تغيير
            </button>
          </div>
        </IOSCard>
      ) : (
        <IOSCard onClick={() => setShowPasswordChange(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${C.amber}12`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Key size={14} color={C.amber} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                تغيير كلمة المرور
              </div>
              <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>
                آخر تغيير: منذ 30 يوماً
              </div>
            </div>
            <ChevronLeft size={14} color="rgba(255,255,255,0.15)" />
          </div>
        </IOSCard>
      )}

      {/* Active Sessions */}
      <div className="m-section" style={{ marginTop: 8 }}>
        <div className="m-section__title">الجلسات النشطة</div>
      </div>

      <IOSCard>
        {sessions.map((session, i) => {
          const Icon = session.icon
          const isRevoking = revokingSession === session.id
          return (
            <div key={session.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0',
              borderBottom: i < sessions.length - 1 ? `0.5px solid ${C.border}` : 'none',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: session.current ? `${C.success}10` : 'rgba(255,255,255,0.04)',
                border: `0.5px solid ${session.current ? `${C.success}20` : C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={13} color={session.current ? C.success : C.text2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                    {session.device}
                  </span>
                  {session.current && (
                    <span style={{
                      fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                      background: `${C.success}10`, color: C.success,
                      border: `0.5px solid ${C.success}20`, fontFamily: FONT_AR,
                    }}>
                      الحالي
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>
                  {session.location} · {session.lastActive}
                </div>
              </div>
              {!session.current && (
                <button
                  onClick={() => handleRevokeSession(session.id)}
                  disabled={isRevoking}
                  style={{
                    padding: '4px 8px', borderRadius: 6,
                    background: `${C.danger}08`, border: `0.5px solid ${C.danger}15`,
                    color: C.danger, fontSize: 8, fontWeight: 700,
                    fontFamily: FONT_AR, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 2,
                  }}
                >
                  {isRevoking ? (
                    <Loader2 size={8} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Trash2 size={8} />
                  )}
                  إنهاء
                </button>
              )}
            </div>
          )
        })}
      </IOSCard>

      <div style={{ height: 16 }} />
    </div>
  )
}
