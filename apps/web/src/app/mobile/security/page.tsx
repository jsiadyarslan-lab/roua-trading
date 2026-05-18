'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ChevronLeft, Shield, Smartphone, Monitor, Lock, Clock,
  AlertTriangle, CheckCircle, Eye, EyeOff, Fingerprint,
  KeyRound, Globe, Activity, Loader2, X
} from 'lucide-react'

/* ─── Design Tokens ─── */
const c = {
  accent: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: '#8B92A8',
  bg: '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
}

/* ─── iOS Card ─── */
function IOSCard({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        background: highlight
          ? 'linear-gradient(165deg, rgba(35,35,45,0.9) 0%, rgba(20,20,25,0.9) 100%)'
          : 'rgba(28,28,30,0.65)',
        backdropFilter: 'blur(40px) saturate(190%)',
        WebkitBackdropFilter: 'blur(40px) saturate(190%)',
        borderRadius: 28,
        padding: 20,
        margin: '0 20px 16px',
        border: '0.5px solid rgba(255,255,255,0.1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: highlight
          ? '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)'
          : '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
      }}
    >
      {highlight && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
          background: `linear-gradient(90deg, transparent, ${c.accent}66, transparent)`,
          zIndex: 10,
        }} />
      )}
      {children}
    </motion.div>
  )
}

/* ─── Risk Score Indicator ─── */
function RiskScoreIndicator({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return c.success
    if (s >= 50) return c.amber
    return c.danger
  }
  const getLabel = (s: number) => {
    if (s >= 80) return 'آمن'
    if (s >= 50) return 'متوسط'
    return 'ضعيف'
  }
  const color = getColor(score)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          <motion.circle
            cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 42}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - score / 100) }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 24, fontWeight: 900, color, fontFamily: "'JetBrains Mono', monospace" }}>{score}</span>
          <span style={{ fontSize: 9, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>درجة الأمان</span>
        </div>
      </div>
      <div style={{
        padding: '4px 12px', borderRadius: 10,
        background: `${color}15`, border: `0.5px solid ${color}30`,
        fontSize: 11, fontWeight: 800, color, fontFamily: "'Cairo', sans-serif",
      }}>
        {getLabel(score)}
      </div>
    </div>
  )
}

/* ─── Session Item ─── */
function SessionItem({ device, location, time, current }: { device: string; location: string; time: string; current?: boolean }) {
  const isMobile = device.includes('iPhone') || device.includes('Android')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 0', borderBottom: `0.5px solid ${c.border}`,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: current ? `${c.accent}15` : 'rgba(255,255,255,0.04)',
        border: current ? `0.5px solid ${c.accent}30` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isMobile ? <Smartphone size={18} color={current ? c.accent : c.text2} /> : <Monitor size={18} color={current ? c.accent : c.text2} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{device}</p>
          {current && (
            <span style={{ padding: '2px 6px', borderRadius: 6, background: `${c.accent}15`, fontSize: 9, color: c.accent, fontFamily: "'Cairo', sans-serif", fontWeight: 800 }}>حالي</span>
          )}
        </div>
        <p style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
          <Globe size={10} style={{ display: 'inline', verticalAlign: 'middle', marginInlineEnd: 3 }} />
          {location} · {time}
        </p>
      </div>
      {!current && (
        <motion.button whileTap={{ scale: 0.9 }} style={{
          padding: '6px 10px', borderRadius: 10,
          background: `${c.danger}10`, border: `0.5px solid ${c.danger}25`,
          color: c.danger, fontSize: 10, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
          cursor: 'pointer',
        }}>
          إنهاء
        </motion.button>
      )}
    </div>
  )
}

/* ─── Login History Item ─── */
function LoginHistoryItem({ action, time, ip, success }: { action: string; time: string; ip: string; success: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 0', borderBottom: `0.5px solid ${c.border}`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: success ? `${c.success}15` : `${c.danger}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {success ? <CheckCircle size={14} color={c.success} /> : <AlertTriangle size={14} color={c.danger} />}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{action}</p>
        <p style={{ fontSize: 10, color: c.text2, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>{ip}</p>
      </div>
      <span style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{time}</span>
    </div>
  )
}

/* ─── Main Page ─── */
export default function SecurityPage() {
  const router = useRouter()
  const [twoFA, setTwoFA] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)

  const sessions = [
    { device: 'iPhone 15 Pro', location: 'الرياض، السعودية', time: 'الآن', current: true },
    { device: 'Chrome — macOS', location: 'جدة، السعودية', time: 'منذ ساعتين', current: false },
    { device: 'Android — Samsung', location: 'الدمام، السعودية', time: 'أمس', current: false },
  ]

  const loginHistory = [
    { action: 'تسجيل دخول ناجح', time: 'منذ 5 دقائق', ip: '192.168.1.1', success: true },
    { action: 'تسجيل دخول ناجح', time: 'منذ 3 ساعات', ip: '10.0.0.45', success: true },
    { action: 'محاولة فاشلة', time: 'أمس', ip: '85.203.44.12', success: false },
    { action: 'تسجيل دخول ناجح', time: 'قبل يومين', ip: '192.168.1.1', success: true },
    { action: 'تغيير كلمة المرور', time: 'قبل 3 أيام', ip: '192.168.1.1', success: true },
  ]

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) return
    if (newPassword !== confirmPassword) return
    setChangingPassword(true)
    setTimeout(() => {
      setChangingPassword(false)
      setPasswordChanged(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordChanged(false), 2000)
    }, 1500)
  }

  return (
    <div style={{ minHeight: '100%', background: '#0B0E14', direction: 'rtl', paddingBottom: 20, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(180deg, rgba(50,215,75,0.06), transparent)',
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => router.back()}
          style={{
            width: 40, height: 40, borderRadius: 14,
            background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `0.5px solid ${c.border}`,
          }}
        >
          <ChevronLeft size={20} color={c.text} />
        </motion.button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif", flex: 1 }}>الأمان والخصوصية</h1>
      </div>

      {/* ── Risk Score ── */}
      <IOSCard highlight>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <RiskScoreIndicator score={twoFA ? 85 : 55} />
          <p style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", textAlign: 'center', marginTop: 4 }}>
            {twoFA ? 'حسابك محمي بشكل ممتاز' : 'فعّل المصادقة الثنائية لتحسين الأمان'}
          </p>
        </div>
      </IOSCard>

      {/* ── 2FA Toggle ── */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: twoFA ? `${c.success}15` : `${c.amber}15`,
            border: `0.5px solid ${twoFA ? `${c.success}30` : `${c.amber}30`}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Fingerprint size={20} color={twoFA ? c.success : c.amber} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>المصادقة الثنائية</p>
            <p style={{ fontSize: 11, color: twoFA ? c.success : c.amber, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
              {twoFA ? 'مفعّلة ✓' : 'غير مفعّلة — يُنصح بتفعيلها'}
            </p>
          </div>
          <div
            onClick={() => { setTwoFA(!twoFA); if (!twoFA) setShowSetup(true) }}
            style={{
              width: 50, height: 28, borderRadius: 14,
              background: twoFA ? c.success : 'rgba(255,255,255,0.1)',
              position: 'relative', cursor: 'pointer', transition: '0.3s',
            }}
          >
            <motion.div
              animate={{ x: twoFA ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              style={{
                position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%',
                background: '#FFF', boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
              }}
            />
          </div>
        </div>

        {/* 2FA Setup Instructions */}
        {showSetup && twoFA && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            style={{
              marginTop: 16, padding: '14px 16px', borderRadius: 16,
              background: 'rgba(0,212,255,0.05)', border: `0.5px solid rgba(0,212,255,0.15)`,
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 800, color: c.accent, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>خطوات الإعداد:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['حمّل تطبيق Google Authenticator', 'امسح رمز QR أدناه', 'أدخل رمز التحقق', 'تم التفعيل!'].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 6,
                    background: `${c.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800, color: c.accent, fontFamily: "'JetBrains Mono', monospace",
                  }}>{i + 1}</div>
                  <span style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{step}</span>
                </div>
              ))}
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowSetup(false)}
              style={{
                width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 14,
                background: c.accent, color: '#000', fontSize: 13, fontWeight: 800,
                fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer',
              }}
            >
              فهمت، تم التفعيل
            </motion.button>
          </motion.div>
        )}
      </IOSCard>

      {/* ── Change Password ── */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${c.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <KeyRound size={16} color={c.accent} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>تغيير كلمة المرور</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <input
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              type={showCurrentPass ? 'text' : 'password'}
              placeholder="كلمة المرور الحالية"
              style={{
                width: '100%', padding: '12px 14px', paddingInlineEnd: 14, paddingInlineStart: 40,
                borderRadius: 14, background: 'rgba(255,255,255,0.05)',
                border: `0.5px solid ${c.border}`, color: c.text,
                fontSize: 13, fontFamily: "'Cairo', sans-serif", outline: 'none',
              }}
            />
            <button onClick={() => setShowCurrentPass(!showCurrentPass)} style={{ position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {showCurrentPass ? <EyeOff size={16} color={c.text2} /> : <Eye size={16} color={c.text2} />}
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              type={showNewPass ? 'text' : 'password'}
              placeholder="كلمة المرور الجديدة"
              style={{
                width: '100%', padding: '12px 14px', paddingInlineEnd: 14, paddingInlineStart: 40,
                borderRadius: 14, background: 'rgba(255,255,255,0.05)',
                border: `0.5px solid ${c.border}`, color: c.text,
                fontSize: 13, fontFamily: "'Cairo', sans-serif", outline: 'none',
              }}
            />
            <button onClick={() => setShowNewPass(!showNewPass)} style={{ position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {showNewPass ? <EyeOff size={16} color={c.text2} /> : <Eye size={16} color={c.text2} />}
            </button>
          </div>
          <input
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            type="password"
            placeholder="تأكيد كلمة المرور الجديدة"
            style={{
              width: '100%', padding: '12px 14px',
              borderRadius: 14, background: 'rgba(255,255,255,0.05)',
              border: `0.5px solid ${newPassword && confirmPassword && newPassword !== confirmPassword ? c.danger : c.border}`,
              color: c.text, fontSize: 13, fontFamily: "'Cairo', sans-serif", outline: 'none',
            }}
          />
          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p style={{ fontSize: 11, color: c.danger, fontFamily: "'Cairo', sans-serif" }}>كلمات المرور غير متطابقة</p>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleChangePassword}
            disabled={!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || changingPassword}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 16,
              background: (!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword)
                ? 'rgba(255,255,255,0.05)' : c.accent,
              color: (!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword)
                ? c.text2 : '#000',
              fontSize: 14, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {changingPassword ? <><Loader2 size={16} className="animate-spin" /> جاري التغيير...</> : passwordChanged ? <><CheckCircle size={16} /> تم التغيير!</> : <><Lock size={16} /> تغيير كلمة المرور</>}
          </motion.button>
        </div>
      </IOSCard>

      {/* ── Active Sessions ── */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${c.amber}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Activity size={16} color={c.amber} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>الجلسات النشطة</span>
        </div>

        {sessions.map((session, i) => (
          <SessionItem key={i} {...session} />
        ))}
      </IOSCard>

      {/* ── Login History ── */}
      <div style={{ padding: '8px 20px 0', marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>سجل تسجيل الدخول</h2>
      </div>

      <IOSCard>
        {loginHistory.map((item, i) => (
          <LoginHistoryItem key={i} {...item} />
        ))}
      </IOSCard>

    </div>
  )
}
