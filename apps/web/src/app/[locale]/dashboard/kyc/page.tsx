'use client'

import { useState, useCallback } from 'react'
import {
  Shield, Link2, Key, Wifi, CheckCircle2, ChevronLeft,
  ChevronRight, AlertCircle, Lock, Eye, EyeOff,
  ArrowRight, Clock, BadgeCheck, TrendingUp,
  Wallet, Sparkles, ShieldCheck, Info, ShieldAlert,
  Loader2, Zap, BarChart3, Activity, Cpu, Search,
  KeyRound, Plug, Server, Globe, ToggleLeft, ToggleRight
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { T } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations, useLocale } from 'next-intl'

import { getDirection } from '@/lib/i18n-utils';
/* ═══════════════════════════════════════════════════════
   Design Tokens (canonical + local extensions)
═══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   Types
═══════════════════════════════════════════════════════ */
type StepId = 1 | 2 | 3 | 4
type LinkingStatus = 'not_started' | 'in_progress' | 'testing' | 'connected'

interface ExchangeInfo {
  exchangeId: string
  exchangeName: string
}

interface ApiKeyInfo {
  apiKey: string
  apiSecret: string
  label: string
}

interface PermissionInfo {
  readBalance: boolean
  readTrades: boolean
  allowTrading: boolean
}

/* ═══════════════════════════════════════════════════════
   Exchange Configuration
═══════════════════════════════════════════════════════ */
const EXCHANGES = [
  { id: 'binance', name: 'Binance', initial: 'B', color: '#F0B90B', bgColor: '#F0B90B15', desc: 'أكبر بورصة عملات رقمية' },
  { id: 'alpaca', name: 'Alpaca', initial: 'A', color: '#00D4FF', bgColor: '#00D4FF15', desc: 'متابعة أسهم وعملات' },
  { id: 'bybit', name: 'Bybit', initial: 'By', color: '#F7A600', bgColor: '#F7A60015', desc: 'مشتقات وعقود آجلة' },
  { id: 'okx', name: 'OKX', initial: 'OK', color: '#FFFFFF', bgColor: '#FFFFFF10', desc: 'بورصة عالمية متعددة' },
  { id: 'kucoin', name: 'KuCoin', initial: 'K', color: '#23AF91', bgColor: '#23AF9115', desc: 'بورصة متنوعة العملات' },
  { id: 'bitget', name: 'Bitget', initial: 'Bg', color: '#00F0FF', bgColor: '#00F0FF15', desc: 'مشتقات وعقود آجلة' },
  { id: 'gate', name: 'Gate.io', initial: 'G', color: '#2354E6', bgColor: '#2354E615', desc: 'عملات ناشئة ومتنوعة' },
  { id: 'mexc', name: 'MEXC', initial: 'M', color: '#00D4AA', bgColor: '#00D4AA15', desc: 'عملات ناشئة بسرعة' },
]

/* ═══════════════════════════════════════════════════════
   Step Configuration
═══════════════════════════════════════════════════════ */
const STEPS = [
  { id: 1 as StepId, label: 'اختيار البورصة', shortLabel: 'البورصة', icon: Globe, color: T.cyan },
  { id: 2 as StepId, label: 'مفاتيح API', shortLabel: 'المفاتيح', icon: Key, color: T.amber },
  { id: 3 as StepId, label: 'اختبار الاتصال', shortLabel: 'الاتصال', icon: Wifi, color: T.purple },
  { id: 4 as StepId, label: 'تأكيد الربط', shortLabel: 'تأكيد', icon: CheckCircle2, color: T.green },
]

/* ═══════════════════════════════════════════════════════
   Status Badge Component
═══════════════════════════════════════════════════════ */
function StatusBadge({ status }: { status: LinkingStatus }) {
  const config = {
    not_started: { label: 'لم يبدأ', color: T.text4, bg: T.surface, icon: Clock },
    in_progress: { label: 'قيد التنفيذ', color: T.amber, bg: `${T.amber}12`, icon: Loader2 },
    testing: { label: 'جاري الاختبار', color: T.cyan, bg: `${T.cyan}12`, icon: Wifi },
    connected: { label: 'متصل', color: T.green, bg: `${T.green}12`, icon: BadgeCheck },
  }
  const c = config[status]
  const Icon = c.icon
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 10,
      background: c.bg, border: `1px solid ${c.color}20`,
    }}>
      <Icon size={14} color={c.color} style={status === 'in_progress' || status === 'testing' ? { animation: 'spin 1s linear infinite' } : {}} />
      <span style={{ fontSize: 12, fontWeight: 700, color: c.color, fontFamily: "var(--font-ar)" }}>{c.label}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Input Field Component
═══════════════════════════════════════════════════════ */
function FormInput({ label, icon, value, onChange, type = 'text', placeholder, error, required, maxLength, dir }: {
  label: string; icon?: React.ReactNode; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; error?: boolean; required?: boolean; maxLength?: number; dir?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
        fontSize: 12, fontWeight: 600, color: T.text2,
        fontFamily: "var(--font-ar)",
      }}>
        {icon}
        {label}
        {required && <span style={{ color: T.red, fontSize: 10 }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10,
          background: T.surface, border: `1px solid ${error ? T.red : focused ? T.cyan + '40' : T.border}`,
          color: T.text, fontSize: 13, fontFamily: dir === 'ltr' ? "'JetBrains Mono', monospace" : "'Cairo', sans-serif",
          outline: 'none', direction: (dir || 'rtl') as React.CSSProperties['direction'], transition: 'all 0.2s',
          boxShadow: focused ? `0 0 0 3px ${T.cyan}15` : 'none',
          boxSizing: 'border-box',
          letterSpacing: dir === 'ltr' ? '0.5px' : 'normal',
        }}
      />
      {error && (
        <div style={{ fontSize: 10, color: T.red, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={10} /> هذا الحقل مطلوب
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   API Key Input with Toggle Visibility
═══════════════════════════════════════════════════════ */
function ApiKeyInput({ label, icon, value, onChange, placeholder, error, required }: {
  label: string; icon?: React.ReactNode; value: string; onChange: (v: string) => void
  placeholder?: string; error?: boolean; required?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [visible, setVisible] = useState(false)

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
        fontSize: 12, fontWeight: 600, color: T.text2,
        fontFamily: "var(--font-ar)",
      }}>
        {icon}
        {label}
        {required && <span style={{ color: T.red, fontSize: 10 }}>*</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '10px 42px 10px 14px', borderRadius: 10,
            background: T.surface, border: `1px solid ${error ? T.red : focused ? T.cyan + '40' : T.border}`,
            color: T.text, fontSize: 12, fontFamily: "var(--font-mono)",
            outline: 'none', direction: 'ltr', transition: 'all 0.2s',
            boxShadow: focused ? `0 0 0 3px ${T.cyan}15` : 'none',
            boxSizing: 'border-box',
            letterSpacing: '0.5px',
          }}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: T.text3, padding: 2, display: 'flex', alignItems: 'center',
          }}
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {error && (
        <div style={{ fontSize: 10, color: T.red, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={10} /> هذا الحقل مطلوب
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Permission Toggle Component
═══════════════════════════════════════════════════════ */
function PermissionToggle({ label, description, enabled, onChange, color, icon, disabled }: {
  label: string; description: string; enabled: boolean; onChange: (v: boolean) => void
  color: string; icon: React.ReactNode; disabled?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 10,
      background: enabled ? `${color}06` : T.surface,
      border: `1px solid ${enabled ? color + '25' : T.border}`,
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.2s',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: enabled ? `${color}15` : `${T.text4}10`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: T.text3, fontFamily: "var(--font-ar)", lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
      <button
        onClick={() => !disabled && onChange(!enabled)}
        style={{
          background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          padding: 0, display: 'flex', alignItems: 'center', color: enabled ? color : T.text4,
          transition: 'all 0.2s',
        }}
      >
        {enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Benefit Card
═══════════════════════════════════════════════════════ */
function BenefitCard({ icon, title, description, color }: {
  icon: React.ReactNode; title: string; description: string; color: string
}) {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: T.surface, border: `1px solid ${T.border}`,
      display: 'flex', gap: 12, alignItems: 'flex-start',
      transition: 'all 0.3s',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)", marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: T.text3, fontFamily: "var(--font-ar)", lineHeight: 1.6 }}>
          {description}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Account Linking Page Component
═══════════════════════════════════════════════════════ */
export default function AccountLinkingPage() {
  const locale = useLocale();
  const dir = getDirection(locale);
  useScopedStyle(`@keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulseGlow { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes successPulse { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        .kyc-step-content { animation: fadeIn 0.3s ease-out; }
        .success-pulse { animation: successPulse 0.5s ease-out; }
        @media (max-width: 767px) {
          .kyc-stepper-desktop { display: none !important; }
          .kyc-stepper-mobile { display: flex !important; }
          .kyc-content { padding: 16px !important; }
          .kyc-benefits-grid { grid-template-columns: 1fr !important; }
          .kyc-form-grid { grid-template-columns: 1fr !important; }
          .kyc-review-grid { grid-template-columns: 1fr !important; }
          .exchange-grid { grid-template-columns: 1fr 1fr !important; }
          .permission-grid { grid-template-columns: 1fr !important; }
        }`)

  const { toast } = useToast()
  const tn = useTranslations('notifications.kyc')
  const tc = useTranslations('common')
  const [currentStep, setCurrentStep] = useState<StepId>(1)
  const [linkingStatus, setLinkingStatus] = useState<LinkingStatus>('not_started')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [connectionTestResult, setConnectionTestResult] = useState<'none' | 'success' | 'error'>('none')

  // Form data
  const [exchangeInfo, setExchangeInfo] = useState<ExchangeInfo>({
    exchangeId: '', exchangeName: '',
  })
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo>({
    apiKey: '', apiSecret: '', label: '',
  })
  const [permissions, setPermissions] = useState<PermissionInfo>({
    readBalance: true,
    readTrades: true,
    allowTrading: false,
  })

  // Validation
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  // Step completion tracking
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set())

  /* ─── Helpers ─── */
  const getSelectedExchange = () => EXCHANGES.find(e => e.id === exchangeInfo.exchangeId)

  const validateStep = (step: StepId): boolean => {
    const newErrors: Record<string, boolean> = {}
    if (step === 1) {
      if (!exchangeInfo.exchangeId) newErrors.exchangeId = true
    } else if (step === 2) {
      if (!apiKeyInfo.apiKey) newErrors.apiKey = true
      if (!apiKeyInfo.apiSecret) newErrors.apiSecret = true
    } else if (step === 3) {
      if (connectionTestResult !== 'success') newErrors.connectionTest = true
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const goToStep = (step: StepId) => {
    if (completedSteps.has(step) || step <= currentStep || step === (currentStep + 1) as StepId) {
      setCurrentStep(step)
    }
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCompletedSteps(prev => new Set([...prev, currentStep]))
      setLinkingStatus('in_progress')
      if (currentStep < 4) {
        setCurrentStep((currentStep + 1) as StepId)
      }
    } else {
      if (currentStep === 3 && connectionTestResult !== 'success') {
        toast({ title: tn('connectionTestRequired'), description: tn('connectionTestRequiredDesc') })
      } else {
        toast({ title: tn('requiredFields'), description: tn('requiredFieldsDesc') })
      }
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as StepId)
    }
  }

  const handleConnectionTest = async () => {
    setIsTesting(true)
    setConnectionTestResult('none')
    setLinkingStatus('testing')
    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 2500))
    setIsTesting(false)
    setConnectionTestResult('success')
    setLinkingStatus('in_progress')
    toast({
      title: tn('connectionSuccess'),
      description: tn('connectionSuccessDesc', { exchange: getSelectedExchange()?.name || tc('exchange') }),
    })
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 2500))
    setLinkingStatus('connected')
    setIsSubmitting(false)
    toast({
      title: tn('accountLinkedSuccess'),
      description: tn('accountLinkedSuccessDesc', { exchange: getSelectedExchange()?.name || tc('exchange') }),
    })
  }

  const maskApiKey = (key: string) => {
    if (!key) return '—'
    if (key.length <= 8) return '••••••••'
    return key.slice(0, 4) + '••••••••' + key.slice(-4)
  }

  const maskApiSecret = (secret: string) => {
  

    if (!secret) return '—'
    return '••••••••••••••••'
  }

  /* ═══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div className="custom-scrollbar" style={{
      direction: 'inherit', fontFamily: "var(--font-ar)",
      height: '100%', overflowY: 'auto', background: T.bg,
    }}>
      {/* Scoped styles via useScopedStyle */}{/* ═══ Header ═══ */}
      <div style={{
        padding: '28px 24px 0',
        background: `linear-gradient(180deg, ${T.bg2}, ${T.bg})`,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 20px ${T.cyan}30`,
            }}>
              <Link2 size={22} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>
                ربط الحسابات
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: T.text3, marginTop: 2 }}>
                اربط حسابات البورصة الخاصة بك لمتابعة المحفظة وتلقي توصيات AI
              </p>
            </div>
            <StatusBadge status={linkingStatus} />
          </div>

          {/* ═══ Stepper — Desktop ═══ */}
          <div className="kyc-stepper-desktop" style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {STEPS.map((step, idx) => {
              const Icon = step.icon
              const isCompleted = completedSteps.has(step.id)
              const isCurrent = currentStep === step.id
              const isAccessible = isCompleted || isCurrent || completedSteps.has((step.id - 1) as StepId)

              return (
                <div key={step.id} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <button
                    onClick={() => isAccessible && goToStep(step.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '12px 8px', border: 'none', cursor: isAccessible ? 'pointer' : 'default',
                      background: 'transparent', flex: 1, position: 'relative',
                    }}
                  >
                    {/* Step circle */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isCompleted ? `${T.green}15` : isCurrent ? `${step.color}15` : T.surface,
                      border: `2px solid ${isCompleted ? T.green : isCurrent ? step.color : T.border}`,
                      transition: 'all 0.3s',
                      boxShadow: isCurrent ? `0 0 16px ${step.color}20` : isCompleted ? `0 0 12px ${T.green}15` : 'none',
                    }}>
                      {isCompleted ? (
                        <CheckCircle2 size={18} color={T.green} />
                      ) : (
                        <Icon size={18} color={isCurrent ? step.color : T.text4} />
                      )}
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: isCurrent ? 800 : 500,
                      color: isCurrent ? step.color : isCompleted ? T.green : T.text4,
                      fontFamily: "var(--font-ar)", textAlign: 'center',
                    }}>
                      {step.label}
                    </div>
                    {/* Step number */}
                    <div style={{
                      position: 'absolute', top: 6, left: 'calc(50% + 10px)',
                      width: 16, height: 16, borderRadius: 8,
                      background: isCompleted ? T.green : isCurrent ? step.color : T.surface,
                      border: `1px solid ${isCompleted ? T.green : isCurrent ? step.color : T.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 800, color: '#fff',
                      fontFamily: "var(--font-mono)",
                    }}>
                      {isCompleted ? '✓' : step.id}
                    </div>
                  </button>
                  {/* Connector line */}
                  {idx < STEPS.length - 1 && (
                    <div style={{
                      height: 2, width: 32, borderRadius: 1,
                      background: isCompleted ? T.green : T.border,
                      margin: '0 -4px', marginTop: -16, transition: 'all 0.3s',
                    }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* ═══ Stepper — Mobile ═══ */}
          <div className="kyc-stepper-mobile" style={{
            display: 'none', overflowX: 'auto', gap: 4, paddingBottom: 8,
          }}>
            {STEPS.map((step) => {
              const Icon = step.icon
              const isCompleted = completedSteps.has(step.id)
              const isCurrent = currentStep === step.id
              return (
                <button
                  key={step.id}
                  onClick={() => goToStep(step.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 10,
                    border: `1px solid ${isCurrent ? step.color + '30' : T.border}`,
                    background: isCurrent ? `${step.color}10` : T.surface,
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
                  }}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={14} color={T.green} />
                  ) : (
                    <Icon size={14} color={isCurrent ? step.color : T.text4} />
                  )}
                  <span style={{
                    fontSize: 11, fontWeight: isCurrent ? 800 : 500,
                    color: isCurrent ? step.color : isCompleted ? T.green : T.text3,
                    fontFamily: "var(--font-ar)",
                  }}>
                    {step.shortLabel}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ═══ Main Content ═══ */}
      <div className="kyc-content" style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ─── Step 1: Exchange Selection ─── */}
          {currentStep === 1 && (
            <div className="kyc-step-content">
              <div style={{
                background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 16, overflow: 'hidden',
              }}>
                {/* Section header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '18px 20px', borderBottom: `1px solid ${T.border}`,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11,
                    background: `${T.cyan}14`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Globe size={18} color={T.cyan} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
                      اختيار البورصة
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      اختر البورصة التي تريد ربط حسابك بها
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Info banner */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '12px 14px', borderRadius: 10,
                    background: `${T.cyan}06`, border: `1px solid ${T.cyan}12`,
                    marginBottom: 18,
                  }}>
                    <Info size={16} color={T.cyan} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.7 }}>
                      ربط حسابك لا يمنحنا أي صلاحية سحب الأموال. نستخدم مفاتيح API للقراءة فقط بشكل افتراضي.
                    </div>
                  </div>

                  {/* Search hint */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 14,
                  }}>
                    <Search size={14} color={T.text3} />
                    <span style={{ fontSize: 11, color: T.text3 }}>
                      اختر البورصة التي تملك حساباً عليها
                    </span>
                  </div>

                  {/* Exchange grid */}
                  <div className="exchange-grid" style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                    gap: 10,
                  }}>
                    {EXCHANGES.map(exchange => {
                      const isSelected = exchangeInfo.exchangeId === exchange.id
                      return (
                        <button
                          key={exchange.id}
                          onClick={() => {
                            setExchangeInfo({ exchangeId: exchange.id, exchangeName: exchange.name })
                            if (errors.exchangeId) {
                              setErrors(prev => { const n = { ...prev }; delete n.exchangeId; return n })
                            }
                          }}
                          style={{
                            padding: '16px 12px', borderRadius: 12,
                            border: `1px solid ${isSelected ? exchange.color + '40' : T.border}`,
                            background: isSelected ? exchange.bgColor : T.surface,
                            cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s',
                            boxShadow: isSelected ? `0 0 16px ${exchange.color}15` : 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                          }}
                        >
                          {/* Exchange logo circle */}
                          <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: isSelected ? `${exchange.color}20` : `${exchange.color}10`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 900,
                            color: exchange.color,
                            fontFamily: "var(--font-mono)",
                            transition: 'all 0.3s',
                            border: `1px solid ${isSelected ? exchange.color + '30' : 'transparent'}`,
                          }}>
                            {exchange.initial}
                          </div>
                          <div>
                            <div style={{
                              fontSize: 12, fontWeight: isSelected ? 800 : 600,
                              color: isSelected ? exchange.color : T.text,
                              fontFamily: "var(--font-ar)",
                              marginBottom: 2,
                            }}>
                              {exchange.name}
                            </div>
                            <div style={{
                              fontSize: 9, color: T.text4,
                              fontFamily: "var(--font-ar)",
                              lineHeight: 1.4,
                            }}>
                              {exchange.desc}
                            </div>
                          </div>
                          {isSelected && (
                            <div style={{
                              position: 'relative', marginTop: -2,
                              display: 'flex', alignItems: 'center', gap: 3,
                            }}>
                              <CheckCircle2 size={12} color={exchange.color} />
                              <span style={{ fontSize: 9, fontWeight: 700, color: exchange.color, fontFamily: "var(--font-ar)" }}>
                                محدد
                              </span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {errors.exchangeId && !exchangeInfo.exchangeId && (
                    <div style={{ fontSize: 10, color: T.red, display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
                      <AlertCircle size={10} /> يرجى اختيار بورصة
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 2: API Keys ─── */}
          {currentStep === 2 && (
            <div className="kyc-step-content">
              <div style={{
                background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 16, overflow: 'hidden',
              }}>
                {/* Section header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '18px 20px', borderBottom: `1px solid ${T.border}`,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11,
                    background: `${T.amber}14`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Key size={18} color={T.amber} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
                      مفاتيح API
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      أدخل مفاتيح API من حسابك على {getSelectedExchange()?.name || 'البورصة'}
                    </div>
                  </div>
                  {/* Selected exchange badge */}
                  {getSelectedExchange() && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 8,
                      background: `${getSelectedExchange()!.color}10`,
                      border: `1px solid ${getSelectedExchange()!.color}20`,
                      marginRight: 'auto',
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6,
                        background: `${getSelectedExchange()!.color}20`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, fontWeight: 900,
                        color: getSelectedExchange()!.color,
                        fontFamily: "var(--font-mono)",
                      }}>
                        {getSelectedExchange()!.initial}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: getSelectedExchange()!.color, fontFamily: "var(--font-ar)" }}>
                        {getSelectedExchange()!.name}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Security warning */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '12px 14px', borderRadius: 10,
                    background: `${T.amber}06`, border: `1px solid ${T.amber}12`,
                    marginBottom: 18,
                  }}>
                    <ShieldAlert size={16} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.7 }}>
                      <strong style={{ color: T.amber }}>تنبيه أمني:</strong> نوصي بشدة باستخدام مفاتيح API بصلاحية القراءة فقط. لا تفعّل صلاحية السحب أبداً. يتم تشفير مفاتيحك بتقنية AES-256-GCM.
                    </div>
                  </div>

                  {/* How to get API keys guide */}
                  <div style={{
                    padding: '14px 16px', borderRadius: 10,
                    background: T.surface, border: `1px solid ${T.border}`,
                    marginBottom: 18,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <KeyRound size={14} color={T.cyan} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.cyan, fontFamily: "var(--font-ar)" }}>
                        كيفية الحصول على مفاتيح API
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: T.text3, lineHeight: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, background: `${T.cyan}15`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: T.cyan, flexShrink: 0 }}>1</span>
                        سجّل الدخول إلى حسابك على {getSelectedExchange()?.name || 'البورصة'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, background: `${T.cyan}15`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: T.cyan, flexShrink: 0 }}>2</span>
                        انتقل إلى إعدادات API Management
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, background: `${T.cyan}15`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: T.cyan, flexShrink: 0 }}>3</span>
                        أنشئ مفتاح API جديد بصلاحيات القراءة فقط
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, background: `${T.cyan}15`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: T.cyan, flexShrink: 0 }}>4</span>
                        انسخ API Key و API Secret وألصقهما أدناه
                      </div>
                    </div>
                  </div>

                  {/* Label for connection */}
                  <FormInput
                    label="اسم الاتصال (اختياري)"
                    icon={<Plug size={12} color={T.green} />}
                    value={apiKeyInfo.label}
                    onChange={v => setApiKeyInfo(prev => ({ ...prev, label: v }))}
                    placeholder="مثال: حساب Binance الرئيسي"
                    dir={dir}
                  />

                  {/* API Key */}
                  <ApiKeyInput
                    label="API Key"
                    icon={<Key size={12} color={T.amber} />}
                    value={apiKeyInfo.apiKey}
                    onChange={v => {
                      setApiKeyInfo(prev => ({ ...prev, apiKey: v }))
                      if (errors.apiKey) {
                        setErrors(prev => { const n = { ...prev }; delete n.apiKey; return n })
                      }
                    }}
                    placeholder="أدخل API Key"
                    error={errors.apiKey}
                    required
                  />

                  {/* API Secret */}
                  <ApiKeyInput
                    label="API Secret"
                    icon={<Lock size={12} color={T.red} />}
                    value={apiKeyInfo.apiSecret}
                    onChange={v => {
                      setApiKeyInfo(prev => ({ ...prev, apiSecret: v }))
                      if (errors.apiSecret) {
                        setErrors(prev => { const n = { ...prev }; delete n.apiSecret; return n })
                      }
                    }}
                    placeholder="أدخل API Secret"
                    error={errors.apiSecret}
                    required
                  />

                  {/* Security tips */}
                  <div style={{
                    marginTop: 8, padding: '12px 14px', borderRadius: 10,
                    background: `${T.red}06`, border: `1px solid ${T.red}12`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <ShieldAlert size={14} color={T.red} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.red, fontFamily: "var(--font-ar)" }}>
                        نصائح أمنية هامة
                      </span>
                    </div>
                    <ul style={{ margin: 0, padding: '0 16px', fontSize: 10, color: T.text3, lineHeight: 2.2 }}>
                      <li>لا تفعّل صلاحية <span style={{ color: T.red, fontWeight: 700 }}>السحب (Withdraw)</span> أبداً — المنصة لا تحتاجها</li>
                      <li>قيّد المفتاح بعنوان IP الخاص بك إن أمكن</li>
                      <li>استخدم صلاحية <span style={{ color: T.green, fontWeight: 700 }}>القراءة فقط (Read Only)</span> للأمان الأقصى</li>
                      <li>صلاحية التداول اختيارية فقط لتنفيذ إشارات AI عبر حسابك المربوط</li>
                      <li>لا تشارك مفاتيح API مع أي شخص</li>
                      <li>يمكنك حذف المفتاح من البورصة في أي وقت لقطع الاتصال</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 3: Connection Test ─── */}
          {currentStep === 3 && (
            <div className="kyc-step-content">
              <div style={{
                background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 16, overflow: 'hidden',
              }}>
                {/* Section header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '18px 20px', borderBottom: `1px solid ${T.border}`,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11,
                    background: `${T.purple}14`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Wifi size={18} color={T.purple} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
                      اختبار الاتصال
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      تحقق من صحة المفاتيح واختبر الاتصال بالبورصة
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Permissions section */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                      <Shield size={14} color={T.cyan} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                        صلاحيات الاتصال
                      </span>
                    </div>
                    <div className="permission-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <PermissionToggle
                        label="قراءة الرصيد"
                        description="عرض أرصدة المحفظة والعملات"
                        enabled={permissions.readBalance}
                        onChange={v => setPermissions(prev => ({ ...prev, readBalance: v }))}
                        color={T.green}
                        icon={<Wallet size={16} color={permissions.readBalance ? T.green : T.text4} />}
                      />
                      <PermissionToggle
                        label="قراءة الصفقات"
                        description="عرض سجل التداول والصفقات المفتوحة"
                        enabled={permissions.readTrades}
                        onChange={v => setPermissions(prev => ({ ...prev, readTrades: v }))}
                        color={T.cyan}
                        icon={<BarChart3 size={16} color={permissions.readTrades ? T.cyan : T.text4} />}
                      />
                      <PermissionToggle
                        label="السماح بالتداول (اختياري)"
                        description="تنفيذ إشارات AI تلقائياً عبر حسابك المربوط فقط"
                        enabled={permissions.allowTrading}
                        onChange={v => setPermissions(prev => ({ ...prev, allowTrading: v }))}
                        color={T.amber}
                        icon={<TrendingUp size={16} color={permissions.allowTrading ? T.amber : T.text4} />}
                      />
                    </div>

                    {/* No withdrawal notice */}
                    <div style={{
                      marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', borderRadius: 10,
                      background: `${T.green}06`, border: `1px solid ${T.green}15`,
                    }}>
                      <ShieldCheck size={16} color={T.green} />
                      <span style={{ fontSize: 11, color: T.green, fontWeight: 600, fontFamily: "var(--font-ar)" }}>
                        المنصة لا تطلب صلاحية السحب أبداً — أموالك تبقى آمنة في حسابك على البورصة
                      </span>
                    </div>
                  </div>

                  {/* Connection test area */}
                  <div style={{
                    padding: '20px', borderRadius: 12,
                    background: T.surface, border: `1px solid ${connectionTestResult === 'success' ? T.green + '25' : connectionTestResult === 'error' ? T.red + '25' : T.border}`,
                    textAlign: 'center',
                  }}>
                    {isTesting ? (
                      <div>
                        <div style={{
                          width: 56, height: 56, borderRadius: 16,
                          background: `${T.purple}10`, margin: '0 auto 14px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Loader2 size={28} color={T.purple} style={{ animation: 'spin 1s linear infinite' }} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: T.purple, fontFamily: "var(--font-ar)", marginBottom: 4 }}>
                          جاري اختبار الاتصال...
                        </div>
                        <div style={{ fontSize: 11, color: T.text3, fontFamily: "var(--font-ar)" }}>
                          يتم التحقق من المفاتيح مع {getSelectedExchange()?.name || 'البورصة'}
                        </div>
                        {/* Progress steps */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
                          {[
                            { label: 'التحقق من المفتاح', icon: KeyRound },
                            { label: 'الاتصال بالبورصة', icon: Server },
                            { label: 'قراءة البيانات', icon: Activity },
                          ].map((s, idx) => (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                              <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: `${T.purple}10`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                animation: `pulseGlow 1.5s ease-in-out ${idx * 0.3}s infinite`,
                              }}>
                                <s.icon size={14} color={T.purple} />
                              </div>
                              <span style={{ fontSize: 9, color: T.text3, fontFamily: "var(--font-ar)" }}>{s.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : connectionTestResult === 'success' ? (
                      <div className="success-pulse">
                        <div style={{
                          width: 56, height: 56, borderRadius: 16,
                          background: `${T.green}10`, margin: '0 auto 14px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <CheckCircle2 size={28} color={T.green} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: T.green, fontFamily: "var(--font-ar)", marginBottom: 4 }}>
                          تم الاتصال بنجاح!
                        </div>
                        <div style={{ fontSize: 11, color: T.text3, fontFamily: "var(--font-ar)", lineHeight: 1.7 }}>
                          تم التحقق من صحة مفاتيح API والاتصال بـ {getSelectedExchange()?.name}
                        </div>
                        {/* Connection details */}
                        <div style={{
                          display: 'flex', justifyContent: 'center', gap: 16,
                          marginTop: 14, flexWrap: 'wrap',
                        }}>
                          {[
                            { label: 'وقت الاستجابة', value: '245ms', color: T.green },
                            { label: 'حالة الاتصال', value: 'مستقر', color: T.cyan },
                            { label: 'صلاحيات', value: permissions.allowTrading ? 'قراءة + تداول' : 'قراءة فقط', color: T.amber },
                          ].map((detail, idx) => (
                            <div key={idx} style={{
                              padding: '6px 12px', borderRadius: 8,
                              background: `${detail.color}08`, border: `1px solid ${detail.color}15`,
                            }}>
                              <div style={{ fontSize: 8, color: T.text4, fontFamily: "var(--font-ar)" }}>{detail.label}</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: detail.color, fontFamily: "var(--font-mono)" }}>{detail.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : connectionTestResult === 'error' ? (
                      <div>
                        <div style={{
                          width: 56, height: 56, borderRadius: 16,
                          background: `${T.red}10`, margin: '0 auto 14px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <AlertCircle size={28} color={T.red} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: T.red, fontFamily: "var(--font-ar)", marginBottom: 4 }}>
                          فشل الاتصال
                        </div>
                        <div style={{ fontSize: 11, color: T.text3, fontFamily: "var(--font-ar)", lineHeight: 1.7 }}>
                          تعذر الاتصال بالبورصة. تأكد من صحة المفاتيح والصلاحيات.
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{
                          width: 56, height: 56, borderRadius: 16,
                          background: `${T.purple}08`, margin: '0 auto 14px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Wifi size={28} color={T.purple} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "var(--font-ar)", marginBottom: 4 }}>
                          جاهز لاختبار الاتصال
                        </div>
                        <div style={{ fontSize: 11, color: T.text3, fontFamily: "var(--font-ar)", lineHeight: 1.7, marginBottom: 16 }}>
                          سيتم التحقق من مفاتيح API واختبار الاتصال بـ {getSelectedExchange()?.name || 'البورصة'}
                        </div>
                        <button
                          onClick={handleConnectionTest}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '12px 28px', borderRadius: 10,
                            background: `linear-gradient(135deg, ${T.purple}, #8B5CF6)`,
                            border: 'none', color: '#fff', fontSize: 13, fontWeight: 800,
                            cursor: 'pointer', fontFamily: "var(--font-ar)",
                            boxShadow: `0 0 20px ${T.purple}25`, transition: 'all 0.2s',
                          }}
                        >
                          <Zap size={16} />
                          بدء اختبار الاتصال
                        </button>
                      </div>
                    )}

                    {/* Re-test button */}
                    {connectionTestResult === 'success' && (
                      <button
                        onClick={handleConnectionTest}
                        style={{
                          marginTop: 14, padding: '6px 16px', borderRadius: 8,
                          background: `${T.green}10`, border: `1px solid ${T.green}20`,
                          color: T.green, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "var(--font-ar)",
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Wifi size={12} /> إعادة الاختبار
                      </button>
                    )}
                    {connectionTestResult === 'error' && (
                      <button
                        onClick={handleConnectionTest}
                        style={{
                          marginTop: 14, padding: '8px 20px', borderRadius: 8,
                          background: `linear-gradient(135deg, ${T.purple}, #8B5CF6)`,
                          border: 'none', color: '#fff', fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', fontFamily: "var(--font-ar)",
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <Zap size={14} /> إعادة المحاولة
                      </button>
                    )}
                  </div>

                  {errors.connectionTest && connectionTestResult !== 'success' && (
                    <div style={{ fontSize: 10, color: T.red, display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                      <AlertCircle size={10} /> يرجى إجراء اختبار الاتصال بنجاح قبل المتابعة
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 4: Review & Confirm ─── */}
          {currentStep === 4 && (
            <div className="kyc-step-content">
              <div style={{
                background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 16, overflow: 'hidden',
              }}>
                {/* Section header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '18px 20px', borderBottom: `1px solid ${T.border}`,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11,
                    background: `${T.green}14`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CheckCircle2 size={18} color={T.green} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
                      تأكيد الربط
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      راجع جميع البيانات قبل تأكيد ربط الحساب
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Exchange Review */}
                  <div style={{
                    padding: 14, borderRadius: 12,
                    background: T.surface, border: `1px solid ${T.border}`,
                    marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Globe size={14} color={T.cyan} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                          البورصة
                        </span>
                      </div>
                      <button
                        onClick={() => setCurrentStep(1)}
                        style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: `${T.cyan}10`, border: `1px solid ${T.cyan}20`,
                          color: T.cyan, fontSize: 10, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "var(--font-ar)",
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <ChevronRight size={10} /> تعديل
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {getSelectedExchange() && (
                        <div style={{
                          width: 44, height: 44, borderRadius: 12,
                          background: `${getSelectedExchange()!.color}15`,
                          border: `1px solid ${getSelectedExchange()!.color}25`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 15, fontWeight: 900,
                          color: getSelectedExchange()!.color,
                          fontFamily: "var(--font-mono)",
                        }}>
                          {getSelectedExchange()!.initial}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                          {getSelectedExchange()?.name || '—'}
                        </div>
                        <div style={{ fontSize: 10, color: T.text3, fontFamily: "var(--font-ar)" }}>
                          {getSelectedExchange()?.desc || ''}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* API Keys Review */}
                  <div style={{
                    padding: 14, borderRadius: 12,
                    background: T.surface, border: `1px solid ${T.border}`,
                    marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Key size={14} color={T.amber} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                          مفاتيح API
                        </span>
                      </div>
                      <button
                        onClick={() => setCurrentStep(2)}
                        style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: `${T.amber}10`, border: `1px solid ${T.amber}20`,
                          color: T.amber, fontSize: 10, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "var(--font-ar)",
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <ChevronRight size={10} /> تعديل
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: T.text4 }}>اسم الاتصال</span>
                        <span style={{ fontSize: 12, color: T.text, fontWeight: 600, fontFamily: "var(--font-ar)" }}>
                          {apiKeyInfo.label || '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: T.text4 }}>API Key</span>
                        <span style={{ fontSize: 12, color: T.text, fontWeight: 600, fontFamily: "var(--font-mono)", direction: 'ltr' }}>
                          {maskApiKey(apiKeyInfo.apiKey)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: T.text4 }}>API Secret</span>
                        <span style={{ fontSize: 12, color: T.text, fontWeight: 600, fontFamily: "var(--font-mono)", direction: 'ltr' }}>
                          {maskApiSecret(apiKeyInfo.apiSecret)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Permissions Review */}
                  <div style={{
                    padding: 14, borderRadius: 12,
                    background: T.surface, border: `1px solid ${T.border}`,
                    marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Shield size={14} color={T.purple} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                          الصلاحيات
                        </span>
                      </div>
                      <button
                        onClick={() => setCurrentStep(3)}
                        style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: `${T.purple}10`, border: `1px solid ${T.purple}20`,
                          color: T.purple, fontSize: 10, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "var(--font-ar)",
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <ChevronRight size={10} /> تعديل
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[
                        { label: 'قراءة الرصيد', enabled: permissions.readBalance, color: T.green },
                        { label: 'قراءة الصفقات', enabled: permissions.readTrades, color: T.cyan },
                        { label: 'السماح بالتداول (اختياري)', enabled: permissions.allowTrading, color: T.amber },
                      ].map((perm, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: T.text3, fontFamily: "var(--font-ar)" }}>{perm.label}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: perm.enabled ? perm.color : T.text4,
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontFamily: "var(--font-ar)",
                          }}>
                            {perm.enabled ? (
                              <><CheckCircle2 size={12} /> مفعّل</>
                            ) : (
                              <><AlertCircle size={12} /> معطّل</>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Connection Test Review */}
                  <div style={{
                    padding: 14, borderRadius: 12,
                    background: T.surface, border: `1px solid ${T.border}`,
                    marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Wifi size={14} color={T.green} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                        اختبار الاتصال
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <CheckCircle2 size={14} color={T.green} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.green, fontFamily: "var(--font-ar)" }}>
                        تم اختبار الاتصال بنجاح
                      </span>
                    </div>
                  </div>

                  {/* Agreement */}
                  <div style={{
                    padding: 14, borderRadius: 12,
                    background: `${T.cyan}04`, border: `1px solid ${T.cyan}12`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <ShieldAlert size={16} color={T.cyan} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)", marginBottom: 4 }}>
                          إقرار الموافقة
                        </div>
                        <div style={{ fontSize: 10, color: T.text3, lineHeight: 1.8 }}>
                          بالنقر على "تأكيد الربط"، أقر بأنني أمتلك الحق في ربط هذا الحساب، وأن مفاتيح API يتم تخزينها بشكل مشفر،
                          وأن المنصة لن تقوم بأي عملية سحب دون موافقتي الصريحة. أوافق على
                          <span style={{ color: T.cyan }}> شروط الاستخدام </span>
                          و<span style={{ color: T.cyan }}>سياسة الخصوصية</span> المتعلقة بربط حسابات الطرف الثالث.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Navigation Buttons ═══ */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            padding: '0 4px',
          }}>
            {/* Back button */}
            <button
              onClick={handleBack}
              disabled={currentStep === 1}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '12px 20px', borderRadius: 10,
                background: currentStep === 1 ? T.surface : 'rgba(255,255,255,0.04)',
                border: `1px solid ${currentStep === 1 ? T.border : 'rgba(255,255,255,0.10)'}`,
                color: currentStep === 1 ? T.text4 : T.text2,
                fontSize: 13, fontWeight: 700, cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
                fontFamily: "var(--font-ar)", transition: 'all 0.2s',
              }}
            >
              <ChevronRight size={16} />
              السابق
            </button>

            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {STEPS.map(s => (
                <div key={s.id} style={{
                  width: currentStep === s.id ? 24 : 8, height: 8,
                  borderRadius: 4,
                  background: completedSteps.has(s.id)
                    ? T.green
                    : currentStep === s.id
                      ? s.color
                      : T.surface,
                  transition: 'all 0.3s',
                }} />
              ))}
            </div>

            {/* Next / Submit button */}
            {currentStep < 4 ? (
              <button
                onClick={handleNext}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '12px 24px', borderRadius: 10,
                  background: `linear-gradient(135deg, ${T.cyan}, #0A84FF)`,
                  border: 'none', color: '#000', fontSize: 13, fontWeight: 800,
                  cursor: 'pointer', fontFamily: "var(--font-ar)",
                  boxShadow: `0 0 20px ${T.cyan}25`, transition: 'all 0.2s',
                }}
              >
                التالي
                <ChevronLeft size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || linkingStatus === 'connected'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '12px 28px', borderRadius: 10,
                  background: isSubmitting || linkingStatus === 'connected'
                    ? T.surface
                    : `linear-gradient(135deg, ${T.green}, #00CC82)`,
                  border: 'none',
                  color: isSubmitting || linkingStatus === 'connected' ? T.text3 : '#000',
                  fontSize: 13, fontWeight: 800, cursor: isSubmitting || linkingStatus === 'connected' ? 'not-allowed' : 'pointer',
                  fontFamily: "var(--font-ar)",
                  boxShadow: isSubmitting || linkingStatus === 'connected' ? 'none' : `0 0 20px ${T.green}25`,
                  transition: 'all 0.2s',
                }}
              >
                {isSubmitting ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> جاري الربط...</>
                ) : linkingStatus === 'connected' ? (
                  <><BadgeCheck size={16} /> تم الربط</>
                ) : (
                  <><Link2 size={16} /> تأكيد الربط</>
                )}
              </button>
            )}
          </div>

          {/* ═══ Benefits Section ═══ */}
          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '18px 20px', borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 11,
                background: `${T.green}14`, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={18} color={T.green} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
                  لماذا ربط حسابك؟
                </div>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                  افتح كافة إمكانيات منصة رؤى بربط حساباتك
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <div className="kyc-benefits-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <BenefitCard
                  icon={<Activity size={16} color={T.cyan} />}
                  title="متابعة المحفظة"
                  description="راقب جميع أرصدتك وصفقاتك من مكان واحد"
                  color={T.cyan}
                />
                <BenefitCard
                  icon={<Cpu size={16} color={T.green} />}
                  title="تحليلات AI"
                  description="احصل على توصيات وتحليلات ذكية مبنية على بياناتك"
                  color={T.green}
                />
                <BenefitCard
                  icon={<BarChart3 size={16} color={T.amber} />}
                  title="تتبع الأداء"
                  description="تتبع أرباحك وخسائلك عبر جميع البورصات"
                  color={T.amber}
                />
                <BenefitCard
                  icon={<Zap size={16} color={T.purple} />}
                  title="تنبيهات فورية"
                  description="تنبيهات لحظية لحركات السوق وتغييرات الرصيد"
                  color={T.purple}
                />
              </div>
            </div>
          </div>

          {/* ═══ Security Notice ═══ */}
          <div style={{
            padding: 18, borderRadius: 14,
            background: `linear-gradient(135deg, ${T.surface}, ${T.card})`,
            border: `1px solid ${T.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${T.cyan}10`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Lock size={20} color={T.cyan} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "var(--font-ar)", marginBottom: 6 }}>
                  أمان مفاتيح API
                </div>
                <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.9 }}>
                  نستخدم تشفير <span style={{ color: T.cyan, fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 10 }}>AES-256-GCM</span> لحماية مفاتيح API الخاصة بك. تُخزن المفاتيح بشكل مشفر ولا يمكن الوصول إليها إلا من قبل النظام المصرّح له.
                  نوصي بشدة باستخدام صلاحية <span style={{ color: T.green, fontWeight: 700 }}>القراءة فقط</span> وعدم تفعيل صلاحية
                  <span style={{ color: T.red, fontWeight: 700 }}> السحب (Withdraw)</span>.
                  يمكنك قطع الاتصال في أي وقت بحذف المفتاح من البورصة أو من إعدادات المنصة.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {[
                    { label: 'AES-256', color: T.cyan },
                    { label: 'Read-Only', color: T.green },
                    { label: 'No Withdraw', color: T.red },
                    { label: 'Encrypted', color: T.purple },
                  ].map((badge, idx) => (
                    <span key={idx} style={{
                      padding: '3px 10px', borderRadius: 8,
                      background: `${badge.color}10`, border: `1px solid ${badge.color}20`,
                      fontSize: 9, fontWeight: 700, color: badge.color,
                      fontFamily: "var(--font-mono)",
                    }}>
                      {badge.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom spacer */}
          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>
  )
}
