'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Shield, ShieldCheck, ShieldAlert, Smartphone, Key, Fingerprint,
  QrCode, Copy, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  AlertTriangle, Download, Trash2, Plus, Lock, Monitor,
  Smartphone as PhoneIcon, Globe, Clock, MapPin, LogOut,
  Info, Eye, EyeOff, RefreshCw, Loader2, Scan, Hash,
  KeyRound, BadgeCheck, Cpu, Laptop, Tablet, Save,
  FileDown, ClipboardList, ShieldQuestion, Lightbulb,
  Fingerprint as BiometricIcon, CircleCheck, CircleX
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import SharedT from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations } from 'next-intl'

/* ═══════════════════════════════════════════════════════
   Design Tokens (canonical + local extensions)
═══════════════════════════════════════════════════════ */
const T = { ...SharedT, pink: '#F472B6', text4: '#6B7280' }

/* ═══════════════════════════════════════════════════════
   Types
═══════════════════════════════════════════════════════ */
interface AuthMethod {
  id: string
  label: string
  enabled: boolean
}

interface Passkey {
  id: string
  name: string
  device: string
  icon: React.ReactNode
  addedAt: string
  lastUsed: string
}

interface Session {
  id: string
  device: string
  deviceIcon: React.ReactNode
  location: string
  lastActive: string
  ip: string
  current: boolean
}

/* ═══════════════════════════════════════════════════════
   Toggle Switch
═══════════════════════════════════════════════════════ */
function Toggle({ checked, onChange, color, size = 'md', ariaLabel, disabled }: {
  checked: boolean; onChange: () => void; color: string; size?: 'sm' | 'md'; ariaLabel?: string; disabled?: boolean
}) {
  const s = size === 'sm' ? { w: 34, h: 18, dot: 13, r: 9 } : { w: 40, h: 22, dot: 16, r: 11 }
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      style={{
        width: s.w, height: s.h, borderRadius: s.r, border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? `${color}25` : '#151A22',
        position: 'relative', transition: 'all 0.3s',
        boxShadow: checked ? `0 0 8px ${color}25` : 'none',
        flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        width: s.dot, height: s.dot, borderRadius: s.dot / 2,
        background: checked ? color : '#6B7280',
        position: 'absolute', top: (s.h - s.dot) / 2,
        insetInlineEnd: checked ? (s.h - s.dot) / 2 : 'auto',
        insetInlineStart: checked ? 'auto' : (s.h - s.dot) / 2,
        transition: 'all 0.3s',
        boxShadow: checked ? `0 0 6px ${color}50` : 'none',
      }} />
    </button>
  )
}

/* ═══════════════════════════════════════════════════════
   Security Score Ring
═══════════════════════════════════════════════════════ */
function SecurityScoreRing({ score, t }: { score: number; t: (key: string) => string }) {
  const radius = 52
  const stroke = 6
  const normalizedRadius = radius - stroke / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (score / 100) * circumference

  const getColor = (s: number) => {
    if (s >= 80) return '#00FFA3'
    if (s >= 50) return '#FFB800'
    return '#FF4757'
  }

  const getLabel = (s: number) => {
    if (s >= 80) return t('scoreExcellent')
    if (s >= 50) return t('scoreMedium')
    return t('scoreWeak')
  }

  const color = getColor(score)

  return (
    <div style={{ position: 'relative', width: radius * 2, height: radius * 2, flexShrink: 0 }}>
      <svg height={radius * 2} width={radius * 2} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background ring */}
        <circle
          stroke={'#151A22'}
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        {/* Progress ring */}
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          style={{ transition: 'stroke-dashoffset 1s ease-in-out, stroke 0.5s' }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', textAlign: 'center',
      }}>
        <div style={{
          fontSize: 26, fontWeight: 900, color,
          fontFamily: "var(--font-mono)",
          lineHeight: 1,
        }}>
          {score}
        </div>
        <div style={{
          fontSize: 9, fontWeight: 700, color: '#6B7280',
          fontFamily: "var(--font-ar)", marginTop: 2,
        }}>
          {getLabel(score)}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Section Card
═══════════════════════════════════════════════════════ */
function SectionCard({ icon, iconColor, iconBg, title, subtitle, children, badge, badgeColor, expandable, expanded, onToggle, rightAction }: {
  icon: React.ReactNode; iconColor: string; iconBg: string; title: string; subtitle: string;
  children: React.ReactNode; badge?: string; badgeColor?: string;
  expandable?: boolean; expanded?: boolean; onToggle?: () => void;
  rightAction?: React.ReactNode
}) {
  return (
    <div style={{
      background: '#151A22', border: `1px solid ${'#2A313C'}`,
      borderRadius: 16, overflow: 'hidden',
      transition: 'border-color 0.3s',
    }}>
      <div
        onClick={expandable ? onToggle : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '18px 20px', borderBottom: expanded ? `1px solid ${'#2A313C'}` : 'none',
          cursor: expandable ? 'pointer' : 'default',
          transition: 'all 0.2s',
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: iconBg, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 800, color: '#F0F2F5',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {title}
            {badge && (
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                background: badgeColor ? `${badgeColor}15` : 'rgba(255,255,255,0.04)',
                color: badgeColor || '#6B7280',
                fontFamily: "var(--font-mono)", fontWeight: 600,
              }}>{badge}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{subtitle}</div>
        </div>
        {rightAction}
        {expandable && (
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: '#151A22', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.3s',
          }}>
            {expanded ? <ChevronUp size={14} color={'#6B7280'} /> : <ChevronDown size={14} color={'#6B7280'} />}
          </div>
        )}
      </div>
      {(!expandable || expanded) && (
        <div style={{ padding: '4px 20px 18px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   OTP Input
═══════════════════════════════════════════════════════ */
function OTPInput({ value, onChange, length = 6 }: {
  value: string; onChange: (v: string) => void; length?: number
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return
    const newVal = value.split('')
    newVal[index] = char
    const joined = newVal.join('').slice(0, length)
    onChange(joined)
    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, direction: 'ltr', justifyContent: 'center' }}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={el => { inputRefs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          style={{
            width: 44, height: 52, borderRadius: 10,
            background: '#151A22', border: `1px solid ${value[i] ? '#00D4FF' + '40' : '#2A313C'}`,
            color: '#F0F2F5', fontSize: 20, fontWeight: 800, textAlign: 'center',
            fontFamily: "var(--font-mono)",
            outline: 'none', transition: 'all 0.2s',
            boxShadow: value[i] ? `0 0 8px ${'#00D4FF'}15` : 'none',
          }}
        />
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main 2FA Page Component
═══════════════════════════════════════════════════════ */
export default function TwoFactorAuthPage() {
  const t = useTranslations('dashboard.security2fa')
  useScopedStyle(`@keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        .twofa-content { animation: fadeIn 0.3s ease-out; }
        .twofa-scroll::-webkit-scrollbar { width: 4px; }
        .twofa-scroll::-webkit-scrollbar-track { background: transparent; }
        .twofa-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        @media (max-width: 767px) {
          .twofa-page-content { padding: 16px !important; }
          .twofa-status-grid { flex-direction: column !important; align-items: center !important; }
          .twofa-methods-list { grid-template-columns: 1fr !important; }
          .twofa-codes-grid { grid-template-columns: 1fr !important; }
          .twofa-best-grid { grid-template-columns: 1fr !important; }
          .twofa-session-row { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
        }`)

  const { toast } = useToast()

  /* ─── Auth Methods State ─── */
  const [methods, setMethods] = useState<AuthMethod[]>([
    { id: 'email', label: t('methodEmail'), enabled: true },
    { id: 'webauthn', label: t('methodWebauthn'), enabled: false },
    { id: 'totp', label: t('methodTotp'), enabled: false },
  ])

  /* ─── TOTP State ─── */
  const [totpExpanded, setTotpExpanded] = useState(false)
  const [totpStep, setTotpStep] = useState(0) // 0=not started, 1=install, 2=scan, 3=verify, 4=done
  const [totpCode, setTotpCode] = useState('')
  const [totpKey] = useState('JBSW Y3DP EHPK 3PXP')
  const [showTotpKey, setShowTotpKey] = useState(false)
  const [totpVerifying, setTotpVerifying] = useState(false)

  /* ─── WebAuthn State ─── */
  const [webauthnExpanded, setWebauthnExpanded] = useState(false)
  const [passkeys, setPasskeys] = useState<Passkey[]>([
    { id: '1', name: 'MacBook Pro Touch ID', device: 'macOS', icon: <Laptop size={16} color={'#00D4FF'} />, addedAt: '2025-11-15', lastUsed: t('toastTwoHoursAgo') },
    { id: '2', name: 'iPhone Face ID', device: 'iOS', icon: <PhoneIcon size={16} color={'#B388FF'} />, addedAt: '2025-12-20', lastUsed: t('toastOneDayAgo') },
  ])
  const [registeringPasskey, setRegisteringPasskey] = useState(false)

  /* ─── Recovery Codes State ─── */
  const [recoveryExpanded, setRecoveryExpanded] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [generatingCodes, setGeneratingCodes] = useState(false)
  const [codesRevealed, setCodesRevealed] = useState(false)

  /* ─── Sessions State ─── */
  const [sessions] = useState<Session[]>([
    { id: '1', device: 'MacBook Pro — Chrome', deviceIcon: <Laptop size={16} color={'#00FFA3'} />, location: t('sessionLocation1'), lastActive: t('sessionLastActive1'), ip: '192.168.1.***', current: true },
    { id: '2', device: 'iPhone 15 Pro — Safari', deviceIcon: <PhoneIcon size={16} color={'#00D4FF'} />, location: t('sessionLocation2'), lastActive: t('sessionLastActive2'), ip: '192.168.1.***', current: false },
    { id: '3', device: 'iPad Air — Safari', deviceIcon: <Tablet size={16} color={'#B388FF'} />, location: t('sessionLocation3'), lastActive: t('sessionLastActive3'), ip: '10.0.0.***', current: false },
    { id: '4', device: 'Windows PC — Edge', deviceIcon: <Monitor size={16} color={'#FFB800'} />, location: t('sessionLocation4'), lastActive: t('sessionLastActive4'), ip: '172.16.0.***', current: false },
  ])

  /* ─── Computed Values ─── */
  const enabledCount = methods.filter(m => m.enabled).length
  const securityScore = Math.min(100, Math.round((enabledCount / methods.length) * 70) + (recoveryCodes.length > 0 ? 15 : 0) + (enabledCount >= 2 ? 15 : 0))

  const updateMethod = (id: string, enabled: boolean) => {
  

    setMethods(prev => prev.map(m => m.id === id ? { ...m, enabled } : m))
  }

  /* ─── Handlers ─── */
  const handleCopyText = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, '')).then(() => {
      toast({ title: t('toastCopied'), description: t('toastCopiedDesc', { label }) })
    }).catch(() => {
      toast({ title: t('toastCopyError'), description: t('toastCopyErrorDesc') })
    })
  }, [toast, t])

  const handleTotpVerify = useCallback(async () => {
    if (totpCode.length !== 6) {
      toast({ title: t('toastIncompleteCode'), description: t('toastIncompleteCodeDesc') })
      return
    }
    setTotpVerifying(true)
    await new Promise(r => setTimeout(r, 1500))
    setTotpVerifying(false)
    if (totpCode === '123456' || totpCode.length === 6) {
      setTotpStep(4)
      updateMethod('totp', true)
      toast({ title: t('toastActivated'), description: t('toastActivatedDesc') })
    }
  }, [totpCode, toast, t])

  const handleTotpDisable = useCallback(() => {
    setTotpStep(0)
    setTotpCode('')
    updateMethod('totp', false)
    toast({ title: t('toastDeactivated'), description: t('toastDeactivatedDesc') })
  }, [toast, t])

  const handleRegisterPasskey = useCallback(async () => {
    setRegisteringPasskey(true)
    await new Promise(r => setTimeout(r, 2000))
    const newPasskey: Passkey = {
      id: String(Date.now()),
      name: t('toastNewPasskeyName'),
      device: t('toastNewPasskeyDevice'),
      icon: <Fingerprint size={16} color={'#00FFA3'} />,
      addedAt: new Date().toISOString().split('T')[0],
      lastUsed: t('toastNow'),
    }
    setPasskeys(prev => [...prev, newPasskey])
    updateMethod('webauthn', true)
    setRegisteringPasskey(false)
    toast({ title: t('toastKeyRegistered'), description: t('toastKeyRegisteredDesc') })
  }, [toast, t])

  const handleDeletePasskey = useCallback((id: string) => {
    setPasskeys(prev => {
      const updated = prev.filter(p => p.id !== id)
      if (updated.length === 0) {
        updateMethod('webauthn', false)
      }
      return updated
    })
    toast({ title: t('toastKeyDeleted'), description: t('toastKeyDeletedDesc') })
  }, [toast, t])

  const handleGenerateRecoveryCodes = useCallback(async () => {
    setGeneratingCodes(true)
    await new Promise(r => setTimeout(r, 1500))
    const codes = Array.from({ length: 8 }, () =>
      `${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    )
    setRecoveryCodes(codes)
    setCodesRevealed(true)
    setGeneratingCodes(false)
    toast({ title: t('toastCodesGenerated'), description: t('toastCodesGeneratedDesc') })
  }, [toast, t])

  const handleDownloadRecoveryCodes = useCallback(() => {
    const content = `${t('recoveryFileHeader')}\n========================\n${t('recoveryFileDate', { date: new Date().toLocaleDateString() })}\n\n${recoveryCodes.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n⚠️ ${t('recoveryFileWarning')}`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `roua-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: t('recoveryDownloadTitle'), description: t('recoveryDownloadDesc') })
  }, [recoveryCodes, toast, t])

  const handleCopyAllRecoveryCodes = useCallback(() => {
    handleCopyText(recoveryCodes.join('\n'), t('recoveryAllCodesLabel'))
  }, [recoveryCodes, handleCopyText, t])

  const handleKillOtherSessions = useCallback(() => {
    toast({ title: t('toastSessionsTerminated'), description: t('toastSessionsTerminatedDesc') })
  }, [toast, t])

  /* ─── Best Practices Data ─── */
  const bestPractices = [
    { icon: <ShieldCheck size={16} color={'#00FFA3'} />, title: t('tipEnableTwoTitle'), desc: t('tipEnableTwoDesc'), color: '#00FFA3' },
    { icon: <KeyRound size={16} color={'#00D4FF'} />, title: t('tipSaveCodesTitle'), desc: t('tipSaveCodesDesc'), color: '#00D4FF' },
    { icon: <AlertTriangle size={16} color={'#FFB800'} />, title: t('tipNeverShareTitle'), desc: t('tipNeverShareDesc'), color: '#FFB800' },
    { icon: <RefreshCw size={16} color={'#B388FF'} />, title: t('tipRotateCodesTitle'), desc: t('tipRotateCodesDesc'), color: '#B388FF' },
    { icon: <Monitor size={16} color={'#0A84FF'} />, title: t('tipMonitorSessionsTitle'), desc: t('tipMonitorSessionsDesc'), color: '#0A84FF' },
    { icon: <Lock size={16} color={'#FF4757'} />, title: t('tipStrongPasswordTitle'), desc: t('tipStrongPasswordDesc'), color: '#FF4757' },
  ]

  /* ═══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div className="custom-scrollbar" style={{
      direction: 'inherit', fontFamily: "var(--font-ar)",
      height: '100%', overflowY: 'auto', background: '#0B0E14',
    }}>
      {/* Scoped styles via useScopedStyle */}{/* ═══ Header ═══ */}
      <div style={{
        padding: '28px 24px 0',
        background: `linear-gradient(180deg, ${'#0F1117'}, ${'#0B0E14'})`,
        borderBottom: `1px solid ${'#2A313C'}`,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 20px ${'#00D4FF'}30`,
            }}>
              <Shield size={22} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#F0F2F5' }}>
                {t('title')}
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                {t('subtitle')}
              </p>
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 10,
              background: securityScore >= 80 ? `${'#00FFA3'}12` : securityScore >= 50 ? `${'#FFB800'}12` : `${'#FF4757'}12`,
              border: `1px solid ${securityScore >= 80 ? '#00FFA3' + '20' : securityScore >= 50 ? '#FFB800' + '20' : '#FF4757' + '20'}`,
            }}>
              {securityScore >= 80 ? <ShieldCheck size={14} color={'#00FFA3'} /> : securityScore >= 50 ? <Shield size={14} color={'#FFB800'} /> : <ShieldAlert size={14} color={'#FF4757'} />}
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: securityScore >= 80 ? '#00FFA3' : securityScore >= 50 ? '#FFB800' : '#FF4757',
                fontFamily: "var(--font-ar)",
              }}>
                {securityScore >= 80 ? t('statusProtected') : securityScore >= 50 ? t('statusImprovable') : t('statusNeedsProtection')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Main Content ═══ */}
      <div className="twofa-page-content" style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ═══ Security Status Overview Card ═══ */}
          <div style={{
            background: '#151A22', border: `1px solid ${'#2A313C'}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            <div style={{ padding: '20px 20px 0' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
              }}>
                <ShieldCheck size={14} color={'#00D4FF'} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#9CA3B5', fontFamily: "var(--font-ar)" }}>
                  {t('securityOverview')}
                </span>
              </div>
            </div>

            <div className="twofa-status-grid" style={{
              display: 'flex', gap: 24, padding: '0 20px 20px',
              alignItems: 'center',
            }}>
              {/* Score Ring */}
              <SecurityScoreRing score={securityScore} t={t} />

              {/* Methods List */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {methods.map(method => {
                  const methodConfig: Record<string, { icon: React.ReactNode; color: string }> = {
                    email: { icon: <Smartphone size={16} />, color: '#FFB800' },
                    webauthn: { icon: <Fingerprint size={16} />, color: '#B388FF' },
                    totp: { icon: <Key size={16} />, color: '#00D4FF' },
                  }
                  const config = methodConfig[method.id] || { icon: <Key size={16} />, color: '#6B7280' }

                  return (
                    <div key={method.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 10,
                      background: method.enabled ? `${config.color}08` : '#151A22',
                      border: `1px solid ${method.enabled ? `${config.color}15` : '#2A313C'}`,
                      transition: 'all 0.3s',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: method.enabled ? `${config.color}14` : '#151A22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: method.enabled ? config.color : '#6B7280',
                        transition: 'all 0.3s',
                      }}>
                        {config.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 700, color: method.enabled ? '#F0F2F5' : '#6B7280',
                          fontFamily: "var(--font-ar)",
                        }}>
                          {method.label}
                        </div>
                        <div style={{
                          fontSize: 10, color: method.enabled ? config.color : '#6B7280',
                          fontFamily: "var(--font-ar)", marginTop: 1,
                        }}>
                          {method.enabled ? t('methodEnabled') : t('methodDisabled')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {method.enabled ? (
                          <CircleCheck size={16} color={config.color} />
                        ) : (
                          <CircleX size={16} color={'#6B7280'} />
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Enabled count indicator */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 8,
                  background: `${'#00D4FF'}06`, border: `1px solid ${'#00D4FF'}10`,
                  marginTop: 4,
                }}>
                  <Info size={13} color={'#00D4FF'} />
                  <span style={{ fontSize: 10, color: '#9CA3B5', lineHeight: 1.6 }}>
                    {enabledCount >= 2
                      ? t('enabledCountExcellent', { count: enabledCount })
                      : enabledCount === 1
                        ? t('enabledCountOne')
                        : t('enabledCountNone')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════
             TOTP Section
          ════════════════════════════════════════════════ */}
          <SectionCard
            icon={<Key size={18} color={'#00D4FF'} />}
            iconColor={'#00D4FF'}
            iconBg={`${'#00D4FF'}14`}
            title={t('totpTitle')}
            subtitle={t('totpSubtitle')}
            badge={methods.find(m => m.id === 'totp')?.enabled ? t('totpBadgeEnabled') : t('totpBadgeDisabled')}
            badgeColor={methods.find(m => m.id === 'totp')?.enabled ? '#00FFA3' : '#6B7280'}
            expandable
            expanded={totpExpanded}
            onToggle={() => setTotpExpanded(!totpExpanded)}
            rightAction={
              <Toggle
                checked={methods.find(m => m.id === 'totp')?.enabled || false}
                onChange={() => {
                  if (methods.find(m => m.id === 'totp')?.enabled) {
                    handleTotpDisable()
                  } else {
                    setTotpExpanded(true)
                    if (totpStep === 0) setTotpStep(1)
                  }
                }}
                color={'#00D4FF'}
                size="sm"
                ariaLabel={t('totpToggleAria')}
              />
            }
          >
            <div style={{ padding: '8px 0' }}>
              {methods.find(m => m.id === 'totp')?.enabled && totpStep === 4 ? (
                /* ─── TOTP Enabled State ─── */
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', borderRadius: 10,
                    background: `${'#00FFA3'}08`, border: `1px solid ${'#00FFA3'}15`,
                    marginBottom: 14,
                  }}>
                    <CheckCircle2 size={16} color={'#00FFA3'} />
                    <div style={{ fontSize: 12, color: '#9CA3B5', lineHeight: 1.6 }}>
                      {t('totpEnabledMessage')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setTotpStep(1) }}
                      style={{
                        padding: '8px 16px', borderRadius: 8,
                        background: '#151A22', border: `1px solid ${'#2A313C'}`,
                        color: '#9CA3B5', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        fontFamily: "var(--font-ar)", display: 'flex',
                        alignItems: 'center', gap: 6, transition: 'all 0.2s',
                      }}
                    >
                      <RefreshCw size={12} />
                      {t('totpReSetup')}
                    </button>
                  </div>
                </div>
              ) : !methods.find(m => m.id === 'totp')?.enabled ? (
                /* ─── TOTP Setup Flow ─── */
                <div>
                  {/* Steps indicator */}
                  <div style={{
                    display: 'flex', gap: 4, marginBottom: 20,
                    padding: '0 4px',
                  }}>
                    {[
                      { n: 1, label: t('totpStep1') },
                      { n: 2, label: t('totpStep2') },
                      { n: 3, label: t('totpStep3') },
                      { n: 4, label: t('totpStep4') },
                    ].map((step, idx) => (
                      <div key={step.n} style={{ flex: 1 }}>
                        <div style={{
                          height: 3, borderRadius: 2,
                          background: totpStep >= step.n ? '#00D4FF' : '#151A22',
                          transition: 'all 0.3s', marginBottom: 6,
                        }} />
                        <div style={{
                          fontSize: 9, fontWeight: totpStep >= step.n ? 700 : 400,
                          color: totpStep >= step.n ? '#00D4FF' : '#6B7280',
                          fontFamily: "var(--font-ar)", textAlign: 'center',
                          whiteSpace: 'nowrap',
                        }}>
                          {step.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Step 1: Install App */}
                  {totpStep === 1 && (
                    <div className="twofa-content">
                      <div style={{
                        padding: '20px', borderRadius: 12,
                        background: '#151A22', border: `1px solid ${'#2A313C'}`,
                        textAlign: 'center',
                      }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: 14,
                          background: `${'#00D4FF'}14`, margin: '0 auto 14px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Smartphone size={24} color={'#00D4FF'} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#F0F2F5', marginBottom: 8, fontFamily: "var(--font-ar)" }}>
                          {t('totpInstallTitle')}
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7, marginBottom: 16 }}>
                          {t('totpInstallDesc')}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                          {[
                            { name: 'Google Authenticator', color: '#FFB800' },
                            { name: 'Authy', color: '#0A84FF' },
                            { name: 'Microsoft Authenticator', color: '#B388FF' },
                          ].map(app => (
                            <div key={app.name} style={{
                              padding: '8px 14px', borderRadius: 8,
                              background: `${app.color}08`, border: `1px solid ${app.color}15`,
                              fontSize: 11, fontWeight: 600, color: app.color,
                              fontFamily: "var(--font-ar)",
                            }}>
                              {app.name}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 16 }}>
                        <button
                          onClick={() => setTotpStep(2)}
                          style={{
                            padding: '10px 24px', borderRadius: 10,
                            background: `linear-gradient(135deg, ${'#00D4FF'}, #0A84FF)`,
                            border: 'none', color: '#000', fontSize: 12, fontWeight: 800,
                            cursor: 'pointer', fontFamily: "var(--font-ar)",
                            boxShadow: `0 0 16px ${'#00D4FF'}25`,
                            transition: 'all 0.2s',
                          }}
                        >
                          {t('totpNextScan')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Scan QR Code */}
                  {totpStep === 2 && (
                    <div className="twofa-content">
                      <div style={{
                        padding: '20px', borderRadius: 12,
                        background: '#151A22', border: `1px solid ${'#2A313C'}`,
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
                        }}>
                          <QrCode size={14} color={'#00D4FF'} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>
                            {t('totpScanTitle')}
                          </span>
                        </div>

                        {/* Mock QR Code */}
                        <div style={{
                          width: 180, height: 180, margin: '0 auto 16px',
                          background: '#fff', borderRadius: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          position: 'relative',
                        }}>
                          {/* QR pattern simulation */}
                          <div style={{
                            width: 160, height: 160, position: 'relative',
                            display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gridTemplateRows: 'repeat(15, 1fr)',
                            gap: 1, padding: 4,
                          }}>
                            {Array.from({ length: 225 }).map((_, i) => {
                              const row = Math.floor(i / 15)
                              const col = i % 15
                              const isCorner = (row < 4 && col < 4) || (row < 4 && col > 10) || (row > 10 && col < 4)
                              const isFilled = isCorner || Math.random() > 0.5
                              return (
                                <div key={i} style={{
                                  width: '100%', height: '100%',
                                  background: isFilled ? '#04050C' : '#fff',
                                  borderRadius: 1,
                                }} />
                              )
                            })}
                          </div>
                          {/* Center logo */}
                          <div style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: 36, height: 36, borderRadius: 8,
                            background: '#0B0E14', border: '3px solid #fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Shield size={16} color={'#00D4FF'} />
                          </div>
                        </div>

                        <div style={{ textAlign: 'center', marginBottom: 14 }}>
                          <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.6 }}>
                            {t('totpScanDesc')}
                          </div>
                        </div>

                        {/* Manual Key */}
                        <div style={{
                          padding: '12px 14px', borderRadius: 10,
                          background: `${'#B388FF'}06`, border: `1px solid ${'#B388FF'}12`,
                        }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: 6,
                          }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', fontFamily: "var(--font-ar)" }}>
                              {t('totpManualKey')}
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                onClick={() => setShowTotpKey(!showTotpKey)}
                                style={{
                                  width: 26, height: 26, borderRadius: 6,
                                  background: '#151A22', border: `1px solid ${'#2A313C'}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', color: '#6B7280',
                                }}
                              >
                                {showTotpKey ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                              <button
                                onClick={() => handleCopyText(totpKey, t('totpManualKey').split('(')[0].trim())}
                                style={{
                                  width: 26, height: 26, borderRadius: 6,
                                  background: '#151A22', border: `1px solid ${'#2A313C'}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', color: '#6B7280',
                                }}
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          </div>
                          <div style={{
                            fontSize: 14, fontWeight: 700, color: '#F0F2F5',
                            fontFamily: "var(--font-mono)",
                            letterSpacing: 2, direction: 'ltr', textAlign: 'center',
                            filter: showTotpKey ? 'none' : 'blur(4px)',
                            transition: 'filter 0.3s',
                            userSelect: showTotpKey ? 'auto' : 'none',
                          }}>
                            {totpKey}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                        <button
                          onClick={() => setTotpStep(1)}
                          style={{
                            padding: '10px 18px', borderRadius: 10,
                            background: '#151A22', border: `1px solid ${'#2A313C'}`,
                            color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            fontFamily: "var(--font-ar)", transition: 'all 0.2s',
                          }}
                        >
                          {t('totpPrevious')}
                        </button>
                        <button
                          onClick={() => setTotpStep(3)}
                          style={{
                            padding: '10px 24px', borderRadius: 10,
                            background: `linear-gradient(135deg, ${'#00D4FF'}, #0A84FF)`,
                            border: 'none', color: '#000', fontSize: 12, fontWeight: 800,
                            cursor: 'pointer', fontFamily: "var(--font-ar)",
                            boxShadow: `0 0 16px ${'#00D4FF'}25`,
                            transition: 'all 0.2s',
                          }}
                        >
                          {t('totpNextEnterCode')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Verify Code */}
                  {totpStep === 3 && (
                    <div className="twofa-content">
                      <div style={{
                        padding: '20px', borderRadius: 12,
                        background: '#151A22', border: `1px solid ${'#2A313C'}`,
                        textAlign: 'center',
                      }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: 14,
                          background: `${'#00D4FF'}14`, margin: '0 auto 14px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Hash size={24} color={'#00D4FF'} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#F0F2F5', marginBottom: 6, fontFamily: "var(--font-ar)" }}>
                          {t('totpEnterTitle')}
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6, marginBottom: 20 }}>
                          {t('totpEnterDesc')}
                        </div>

                        <OTPInput value={totpCode} onChange={setTotpCode} length={6} />

                        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 8 }}>
                          <button
                            onClick={handleTotpVerify}
                            disabled={totpCode.length !== 6 || totpVerifying}
                            style={{
                              padding: '10px 32px', borderRadius: 10,
                              background: totpCode.length === 6
                                ? `linear-gradient(135deg, ${'#00D4FF'}, #0A84FF)`
                                : '#151A22',
                              border: 'none',
                              color: totpCode.length === 6 ? '#000' : '#6B7280',
                              fontSize: 12, fontWeight: 800, cursor: totpCode.length === 6 ? 'pointer' : 'default',
                              fontFamily: "var(--font-ar)",
                              boxShadow: totpCode.length === 6 ? `0 0 16px ${'#00D4FF'}25` : 'none',
                              transition: 'all 0.2s',
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                          >
                            {totpVerifying ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />}
                            {totpVerifying ? t('totpVerifying') : t('totpVerify')}
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 16 }}>
                        <button
                          onClick={() => setTotpStep(2)}
                          style={{
                            padding: '10px 18px', borderRadius: 10,
                            background: '#151A22', border: `1px solid ${'#2A313C'}`,
                            color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            fontFamily: "var(--font-ar)", transition: 'all 0.2s',
                          }}
                        >
                          {t('totpPrevious')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Confirmed (shown briefly then switches to enabled state) */}
                  {totpStep === 4 && !methods.find(m => m.id === 'totp')?.enabled && (
                    <div className="twofa-content" style={{ textAlign: 'center', padding: 20 }}>
                      <CheckCircle2 size={32} color={'#00FFA3'} style={{ margin: '0 auto 12px' }} />
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#00FFA3', fontFamily: "var(--font-ar)" }}>
                        {t('totpActivated')}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </SectionCard>

          {/* ═══════════════════════════════════════════════
             WebAuthn / Passkeys Section
          ════════════════════════════════════════════════ */}
          <SectionCard
            icon={<Fingerprint size={18} color={'#B388FF'} />}
            iconColor={'#B388FF'}
            iconBg={`${'#B388FF'}14`}
            title={t('webauthnTitle')}
            subtitle={t('webauthnSubtitle')}
            badge={t('webauthnBadge', { count: passkeys.length })}
            badgeColor={passkeys.length > 0 ? '#B388FF' : '#6B7280'}
            expandable
            expanded={webauthnExpanded}
            onToggle={() => setWebauthnExpanded(!webauthnExpanded)}
            rightAction={
              <Toggle
                checked={methods.find(m => m.id === 'webauthn')?.enabled || false}
                onChange={() => {
                  if (methods.find(m => m.id === 'webauthn')?.enabled && passkeys.length === 0) {
                    updateMethod('webauthn', false)
                  } else if (!methods.find(m => m.id === 'webauthn')?.enabled) {
                    setWebauthnExpanded(true)
                  }
                }}
                color={'#B388FF'}
                size="sm"
                ariaLabel={t('webauthnToggleAria')}
              />
            }
          >
            <div style={{ padding: '8px 0' }}>
              {/* How Passkeys Work */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', borderRadius: 10,
                background: `${'#B388FF'}06`, border: `1px solid ${'#B388FF'}12`,
                marginBottom: 16,
              }}>
                <Info size={16} color={'#B388FF'} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 11, color: '#9CA3B5', lineHeight: 1.7 }}>
                  {t('webauthnInfo')}
                </div>
              </div>

              {/* Passkeys List */}
              {passkeys.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {passkeys.map(passkey => (
                    <div key={passkey.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 10,
                      background: '#151A22', border: `1px solid ${'#2A313C'}`,
                      transition: 'all 0.2s',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `${'#B388FF'}14`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {passkey.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 700, color: '#F0F2F5',
                          fontFamily: "var(--font-ar)",
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {passkey.name}
                        </div>
                        <div style={{
                          fontSize: 10, color: '#6B7280',
                          fontFamily: "var(--font-mono)",
                          marginTop: 2, display: 'flex', gap: 10,
                        }}>
                          <span>{passkey.device}</span>
                          <span>•</span>
                          <span>{t('webauthnLastUsed', { time: passkey.lastUsed })}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeletePasskey(passkey.id)}
                        style={{
                          width: 30, height: 30, borderRadius: 8,
                          background: `${'#FF4757'}08`, border: `1px solid ${'#FF4757'}15`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: '#FF4757', flexShrink: 0,
                          transition: 'all 0.2s',
                        }}
                        title={t('webauthnDeleteTitle')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: 24, borderRadius: 12, background: '#151A22',
                  border: `1px dashed ${'#2A313C'}`, textAlign: 'center', marginBottom: 16,
                }}>
                  <Fingerprint size={28} color={'#6B7280'} style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontSize: 12, color: '#6B7280', fontFamily: "var(--font-ar)" }}>
                    {t('webauthnEmptyState')}
                  </div>
                </div>
              )}

              {/* Register New Passkey */}
              <button
                onClick={handleRegisterPasskey}
                disabled={registeringPasskey}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 10,
                  border: `1px dashed ${'#B388FF'}40`, background: `${'#B388FF'}06`,
                  color: '#B388FF', fontSize: 13, fontWeight: 700, cursor: registeringPasskey ? 'wait' : 'pointer',
                  fontFamily: "var(--font-ar)",
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                {registeringPasskey ? (
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Plus size={14} />
                )}
                {registeringPasskey ? t('webauthnRegistering') : t('webauthnRegisterNew')}
              </button>
            </div>
          </SectionCard>

          {/* ═══════════════════════════════════════════════
             Recovery Codes Section
          ════════════════════════════════════════════════ */}
          <SectionCard
            icon={<KeyRound size={18} color={'#FFB800'} />}
            iconColor={'#FFB800'}
            iconBg={`${'#FFB800'}14`}
            title={t('recoveryTitle')}
            subtitle={t('recoverySubtitle')}
            badge={recoveryCodes.length > 0 ? t('recoveryBadge', { count: recoveryCodes.length }) : undefined}
            badgeColor={'#FFB800'}
            expandable
            expanded={recoveryExpanded}
            onToggle={() => setRecoveryExpanded(!recoveryExpanded)}
          >
            <div style={{ padding: '8px 0' }}>
              {/* Warning Banner */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', borderRadius: 10,
                background: `${'#FFB800'}06`, border: `1px solid ${'#FFB800'}12`,
                marginBottom: 16,
              }}>
                <AlertTriangle size={16} color={'#FFB800'} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 11, color: '#9CA3B5', lineHeight: 1.7 }}>
                  {t('recoveryWarning')}
                  <span style={{ color: '#FF4757', fontWeight: 600 }}>{t('recoveryWarningShare')}</span>
                </div>
              </div>

              {recoveryCodes.length === 0 ? (
                /* Generate Codes Button */
                <div style={{ textAlign: 'center', padding: 12 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: `${'#FFB800'}14`, margin: '0 auto 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ShieldQuestion size={24} color={'#FFB800'} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', marginBottom: 6, fontFamily: "var(--font-ar)" }}>
                    {t('recoveryNotGenerated')}
                  </div>
                  <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('recoveryGenerateDesc')}
                  </div>
                  <button
                    onClick={handleGenerateRecoveryCodes}
                    disabled={generatingCodes}
                    style={{
                      padding: '10px 28px', borderRadius: 10,
                      background: `linear-gradient(135deg, ${'#FFB800'}, #FF8C00)`,
                      border: 'none', color: '#000', fontSize: 12, fontWeight: 800,
                      cursor: generatingCodes ? 'wait' : 'pointer',
                      fontFamily: "var(--font-ar)",
                      boxShadow: `0 0 16px ${'#FFB800'}25`,
                      transition: 'all 0.2s',
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    {generatingCodes ? (
                      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Hash size={14} />
                    )}
                    {generatingCodes ? t('recoveryGenerating') : t('recoveryGenerate')}
                  </button>
                </div>
              ) : (
                /* Display Recovery Codes */
                <div>
                  <div className="twofa-codes-grid" style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: 8, marginBottom: 16,
                  }}>
                    {recoveryCodes.map((code, i) => (
                      <div key={i} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: '#151A22', border: `1px solid ${'#2A313C'}`,
                        display: 'flex', alignItems: 'center', gap: 8,
                        transition: 'all 0.2s',
                      }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: '#6B7280',
                          fontFamily: "var(--font-mono)",
                          width: 18, textAlign: 'center', flexShrink: 0,
                        }}>
                          {i + 1}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 800, color: codesRevealed ? '#F0F2F5' : '#6B7280',
                          fontFamily: "var(--font-mono)",
                          letterSpacing: 1, direction: 'ltr',
                          filter: codesRevealed ? 'none' : 'blur(4px)',
                          transition: 'filter 0.3s',
                          userSelect: codesRevealed ? 'auto' : 'none',
                        }}>
                          {code}
                        </span>
                        <button
                          onClick={() => handleCopyText(code, t('recoveryCodeLabel', { number: i + 1 }))}
                          style={{
                            width: 24, height: 24, borderRadius: 6,
                            background: 'transparent', border: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: '#6B7280', flexShrink: 0,
                            transition: 'color 0.2s',
                          }}
                          title={t('recoveryCopyCodeTitle')}
                        >
                          <Copy size={11} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Actions Row */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setCodesRevealed(!codesRevealed)}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        background: '#151A22', border: `1px solid ${'#2A313C'}`,
                        color: '#9CA3B5', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        fontFamily: "var(--font-ar)", display: 'flex',
                        alignItems: 'center', gap: 6, transition: 'all 0.2s',
                      }}
                    >
                      {codesRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                      {codesRevealed ? t('recoveryHideCodes') : t('recoveryShowCodes')}
                    </button>
                    <button
                      onClick={handleDownloadRecoveryCodes}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        background: '#151A22', border: `1px solid ${'#2A313C'}`,
                        color: '#9CA3B5', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        fontFamily: "var(--font-ar)", display: 'flex',
                        alignItems: 'center', gap: 6, transition: 'all 0.2s',
                      }}
                    >
                      <FileDown size={12} />
                      {t('recoveryDownloadCodes')}
                    </button>
                    <button
                      onClick={handleCopyAllRecoveryCodes}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        background: '#151A22', border: `1px solid ${'#2A313C'}`,
                        color: '#9CA3B5', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        fontFamily: "var(--font-ar)", display: 'flex',
                        alignItems: 'center', gap: 6, transition: 'all 0.2s',
                      }}
                    >
                      <ClipboardList size={12} />
                      {t('recoveryCopyAll')}
                    </button>
                    <button
                      onClick={handleGenerateRecoveryCodes}
                      disabled={generatingCodes}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        background: `${'#FFB800'}08`, border: `1px solid ${'#FFB800'}15`,
                        color: '#FFB800', fontSize: 11, fontWeight: 600,
                        cursor: generatingCodes ? 'wait' : 'pointer',
                        fontFamily: "var(--font-ar)", display: 'flex',
                        alignItems: 'center', gap: 6, transition: 'all 0.2s',
                      }}
                    >
                      {generatingCodes ? (
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      {t('recoveryRegenerate')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ═══════════════════════════════════════════════
             Security Best Practices
          ════════════════════════════════════════════════ */}
          <SectionCard
            icon={<Lightbulb size={18} color={'#FFB800'} />}
            iconColor={'#FFB800'}
            iconBg={`${'#FFB800'}14`}
            title={t('tipsTitle')}
            subtitle={t('tipsSubtitle')}
          >
            <div className="twofa-best-grid" style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 10, padding: '8px 0',
            }}>
              {bestPractices.map((tip, i) => (
                <div key={i} style={{
                  padding: 14, borderRadius: 10,
                  background: '#151A22', border: `1px solid ${'#2A313C'}`,
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  transition: 'all 0.3s',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: `${tip.color}12`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {tip.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: '#F0F2F5',
                      fontFamily: "var(--font-ar)", marginBottom: 3,
                    }}>
                      {tip.title}
                    </div>
                    <div style={{
                      fontSize: 10, color: '#6B7280', lineHeight: 1.6,
                      fontFamily: "var(--font-ar)",
                    }}>
                      {tip.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ═══════════════════════════════════════════════
             Session Management
          ════════════════════════════════════════════════ */}
          <SectionCard
            icon={<Monitor size={18} color={'#00D4FF'} />}
            iconColor={'#00D4FF'}
            iconBg={`${'#00D4FF'}14`}
            title={t('sessionsTitle')}
            subtitle={t('sessionsSubtitle')}
            badge={t('sessionsBadge', { count: sessions.length })}
            badgeColor={'#00D4FF'}
          >
            <div style={{ padding: '8px 0' }}>
              {/* Active Sessions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {sessions.map(session => (
                  <div key={session.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 10,
                    background: session.current ? `${'#00FFA3'}06` : '#151A22',
                    border: `1px solid ${session.current ? `${'#00FFA3'}15` : '#2A313C'}`,
                    transition: 'all 0.2s',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: session.current ? `${'#00FFA3'}14` : `${'#151A22'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, border: `1px solid ${session.current ? `${'#00FFA3'}20` : '#2A313C'}`,
                    }}>
                      {session.deviceIcon}
                    </div>
                    <div className="twofa-session-row" style={{
                      flex: 1, minWidth: 0,
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 700, color: '#F0F2F5',
                          fontFamily: "var(--font-ar)",
                          display: 'flex', alignItems: 'center', gap: 6,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {session.device}
                          {session.current && (
                            <span style={{
                              fontSize: 8, padding: '2px 6px', borderRadius: 6,
                              background: `${'#00FFA3'}15`, color: '#00FFA3',
                              fontFamily: "var(--font-mono)", fontWeight: 700,
                              flexShrink: 0,
                            }}>
                              {t('sessionsThisDevice')}
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 10, color: '#6B7280', marginTop: 2,
                          display: 'flex', gap: 8, flexWrap: 'wrap',
                          fontFamily: "var(--font-ar)",
                        }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <MapPin size={9} />
                            {session.location}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={9} />
                            {session.lastActive}
                          </span>
                          <span style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9, color: '#6B7280',
                          }}>
                            {session.ip}
                          </span>
                        </div>
                      </div>
                      {!session.current && (
                        <button
                          onClick={() => toast({ title: t('toastSessionTerminated'), description: t('toastSessionTerminatedDesc', { device: session.device }) })}
                          style={{
                            padding: '6px 10px', borderRadius: 6,
                            background: `${'#FF4757'}08`, border: `1px solid ${'#FF4757'}15`,
                            color: '#FF4757', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                            fontFamily: "var(--font-ar)", flexShrink: 0,
                            display: 'flex', alignItems: 'center', gap: 4,
                            transition: 'all 0.2s',
                          }}
                        >
                          <LogOut size={10} />
                          {t('sessionsTerminate')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Kill All Other Sessions */}
              <button
                onClick={handleKillOtherSessions}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 10,
                  border: `1px solid rgba(255,71,87,0.20)`,
                  background: 'rgba(255,71,87,0.06)',
                  color: '#FF4757', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "var(--font-ar)",
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                <LogOut size={14} />
                {t('sessionsTerminateAll')}
              </button>
            </div>
          </SectionCard>

          {/* Bottom Spacing */}
          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>
  )
}
