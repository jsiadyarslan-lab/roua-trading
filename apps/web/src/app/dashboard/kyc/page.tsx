'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Shield, User, CreditCard, Camera, CheckCircle2, ChevronLeft,
  ChevronRight, Upload, FileText, AlertCircle, Lock, Eye,
  ArrowRight, Clock, BadgeCheck, TrendingUp,
  Wallet, Sparkles, ShieldCheck, Info, X, Image as ImageIcon,
  ScanFace, IdCard, FileCheck, ShieldAlert, Fingerprint,
  Globe, MapPin, Calendar, Flag, Building, Home, Loader2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

/* ═══════════════════════════════════════════════════════
   Design Tokens
═══════════════════════════════════════════════════════ */
const T = {
  bg: '#04050C',
  bg2: '#0D1117',
  card: '#08090F',
  cardHover: '#0B0F19',
  surface: '#1A1D29',
  cyan: '#00D4FF',
  green: '#00FFA3',
  red: '#FF4757',
  amber: '#FFB800',
  purple: '#B388FF',
  blue: '#0A84FF',
  text: '#F0F2F5',
  text2: '#94a3b8',
  text3: '#8B92A8',
  text4: '#475569',
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(0,212,255,0.16)',
}

/* ═══════════════════════════════════════════════════════
   Types
═══════════════════════════════════════════════════════ */
type StepId = 1 | 2 | 3 | 4
type KycStatus = 'not_started' | 'in_progress' | 'under_review' | 'verified'

interface PersonalInfo {
  firstName: string
  lastName: string
  dateOfBirth: string
  nationality: string
  country: string
  city: string
  address: string
  postalCode: string
}

interface DocumentInfo {
  docType: 'national_id' | 'passport' | 'drivers_license' | ''
  docNumber: string
  frontFile: File | null
  backFile: File | null
  frontPreview: string | null
  backPreview: string | null
}

interface SelfieInfo {
  selfieFile: File | null
  selfiePreview: string | null
  livenessDetected: boolean
}

/* ═══════════════════════════════════════════════════════
   Step Configuration
═══════════════════════════════════════════════════════ */
const STEPS = [
  { id: 1 as StepId, label: 'المعلومات الشخصية', shortLabel: 'شخصي', icon: User, color: T.cyan },
  { id: 2 as StepId, label: 'وثيقة الهوية', shortLabel: 'الهوية', icon: CreditCard, color: T.amber },
  { id: 3 as StepId, label: 'التحقق الذاتي', shortLabel: 'سيلفي', icon: Camera, color: T.purple },
  { id: 4 as StepId, label: 'المراجعة والتأكيد', shortLabel: 'تأكيد', icon: CheckCircle2, color: T.green },
]

const NATIONALITIES = [
  'سعودية', 'إماراتية', 'كويتية', 'بحرينية', 'عمانية', 'قطرية',
  'مصرية', 'أردنية', 'لبنانية', 'عراقية', 'سورية', 'فلسطينية',
  'يمنية', 'سودانية', 'ليبية', 'تونسية', 'جزائرية', 'مغربية',
  'أخرى'
]

const COUNTRIES = [
  'المملكة العربية السعودية', 'الإمارات العربية المتحدة', 'الكويت', 'البحرين', 'عمان', 'قطر',
  'مصر', 'الأردن', 'لبنان', 'العراق', 'سوريا', 'فلسطين',
  'اليمن', 'السودان', 'ليبيا', 'تونس', 'الجزائر', 'المغرب',
  'أخرى'
]

/* ═══════════════════════════════════════════════════════
   Status Badge Component
═══════════════════════════════════════════════════════ */
function StatusBadge({ status }: { status: KycStatus }) {
  const config = {
    not_started: { label: 'لم يبدأ', color: T.text4, bg: T.surface, icon: Clock },
    in_progress: { label: 'قيد التنفيذ', color: T.amber, bg: `${T.amber}12`, icon: Loader2 },
    under_review: { label: 'قيد المراجعة', color: T.cyan, bg: `${T.cyan}12`, icon: Eye },
    verified: { label: 'تم التحقق', color: T.green, bg: `${T.green}12`, icon: BadgeCheck },
  }
  const c = config[status]
  const Icon = c.icon
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 10,
      background: c.bg, border: `1px solid ${c.color}20`,
    }}>
      <Icon size={14} color={c.color} style={status === 'in_progress' ? { animation: 'spin 1s linear infinite' } : {}} />
      <span style={{ fontSize: 12, fontWeight: 700, color: c.color, fontFamily: "'Cairo', sans-serif" }}>{c.label}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Input Field Component
═══════════════════════════════════════════════════════ */
function FormInput({ label, icon, value, onChange, type = 'text', placeholder, error, required, maxLength }: {
  label: string; icon?: React.ReactNode; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; error?: boolean; required?: boolean; maxLength?: number
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
        fontSize: 12, fontWeight: 600, color: T.text2,
        fontFamily: "'Cairo', sans-serif",
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
          color: T.text, fontSize: 13, fontFamily: "'Cairo', sans-serif",
          outline: 'none', direction: 'rtl', transition: 'all 0.2s',
          boxShadow: focused ? `0 0 0 3px ${T.cyan}15` : 'none',
          boxSizing: 'border-box',
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
   Select Field Component
═══════════════════════════════════════════════════════ */
function FormSelect({ label, icon, value, onChange, options, error, required }: {
  label: string; icon?: React.ReactNode; value: string; onChange: (v: string) => void
  options: string[]; error?: boolean; required?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
        fontSize: 12, fontWeight: 600, color: T.text2,
        fontFamily: "'Cairo', sans-serif",
      }}>
        {icon}
        {label}
        {required && <span style={{ color: T.red, fontSize: 10 }}>*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10,
          background: T.surface, border: `1px solid ${error ? T.red : focused ? T.cyan + '40' : T.border}`,
          color: value ? T.text : T.text3, fontSize: 13, fontFamily: "'Cairo', sans-serif",
          outline: 'none', direction: 'rtl', transition: 'all 0.2s',
          boxShadow: focused ? `0 0 0 3px ${T.cyan}15` : 'none',
          appearance: 'none', cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      >
        <option value="" disabled>اختر...</option>
        {options.map(opt => (
          <option key={opt} value={opt} style={{ background: T.surface, color: T.text }}>{opt}</option>
        ))}
      </select>
      {error && (
        <div style={{ fontSize: 10, color: T.red, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={10} /> هذا الحقل مطلوب
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   File Upload Zone Component
═══════════════════════════════════════════════════════ */
function FileUploadZone({ label, sublabel, file, preview, onFileChange, onRemove, accept = 'image/*' }: {
  label: string; sublabel: string; file: File | null; preview: string | null
  onFileChange: (file: File) => void; onRemove: () => void; accept?: string
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) onFileChange(droppedFile)
  }, [onFileChange])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) onFileChange(selected)
  }, [onFileChange])

  if (preview) {
    return (
      <div style={{
        borderRadius: 12, overflow: 'hidden',
        border: `1px solid ${T.green}30`,
        background: `${T.green}05`,
      }}>
        <div style={{ position: 'relative' }}>
          <img src={preview} alt={label} style={{
            width: '100%', height: 160, objectFit: 'cover',
            filter: 'brightness(0.9)',
          }} />
          <button
            onClick={onRemove}
            style={{
              position: 'absolute', top: 8, left: 8,
              width: 28, height: 28, borderRadius: 8,
              background: 'rgba(0,0,0,0.6)', border: 'none',
              color: T.text, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)',
            }}
          >
            <X size={14} />
          </button>
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 8,
            background: `${T.green}20`, backdropFilter: 'blur(8px)',
          }}>
            <CheckCircle2 size={12} color={T.green} />
            <span style={{ fontSize: 10, fontWeight: 600, color: T.green, fontFamily: "'Cairo', sans-serif" }}>
              تم الرفع
            </span>
          </div>
        </div>
        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ImageIcon size={12} color={T.text3} />
          <span style={{ fontSize: 11, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
            {file?.name}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        borderRadius: 12, padding: '28px 20px',
        border: `2px dashed ${dragOver ? T.cyan + '60' : T.border}`,
        background: dragOver ? `${T.cyan}06` : T.surface,
        cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s',
        boxShadow: dragOver ? `0 0 20px ${T.cyan}10` : 'none',
      }}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} style={{ display: 'none' }} />
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: `${T.cyan}10`, margin: '0 auto 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Upload size={20} color={T.cyan} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
        {sublabel}
      </div>
      <div style={{
        marginTop: 10, fontSize: 9, color: T.text4,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        PNG, JPG, PDF — حد أقصى 10MB
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Document Type Selector
═══════════════════════════════════════════════════════ */
function DocTypeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const types = [
    { id: 'national_id', label: 'الهوية الوطنية', icon: IdCard, color: T.cyan },
    { id: 'passport', label: 'جواز السفر', icon: Globe, color: T.amber },
    { id: 'drivers_license', label: 'رخصة القيادة', icon: FileText, color: T.purple },
  ]
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      {types.map(t => {
        const Icon = t.icon
        const isActive = value === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              flex: 1, padding: '14px 10px', borderRadius: 12,
              border: `1px solid ${isActive ? t.color + '40' : T.border}`,
              background: isActive ? `${t.color}10` : T.surface,
              cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s',
              boxShadow: isActive ? `0 0 16px ${t.color}10` : 'none',
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'center', marginBottom: 6,
              color: isActive ? t.color : T.text3,
            }}>
              <Icon size={20} />
            </div>
            <div style={{
              fontSize: 11, fontWeight: isActive ? 800 : 600,
              color: isActive ? t.color : T.text2,
              fontFamily: "'Cairo', sans-serif",
            }}>
              {t.label}
            </div>
          </button>
        )
      })}
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
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
          {description}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main KYC Page Component
═══════════════════════════════════════════════════════ */
export default function KYCPage() {
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState<StepId>(1)
  const [kycStatus, setKycStatus] = useState<KycStatus>('not_started')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form data
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    firstName: '', lastName: '', dateOfBirth: '',
    nationality: '', country: '', city: '',
    address: '', postalCode: '',
  })
  const [docInfo, setDocInfo] = useState<DocumentInfo>({
    docType: '', docNumber: '',
    frontFile: null, backFile: null,
    frontPreview: null, backPreview: null,
  })
  const [selfieInfo, setSelfieInfo] = useState<SelfieInfo>({
    selfieFile: null, selfiePreview: null, livenessDetected: false,
  })

  // Validation
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  // Step completion tracking
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set())

  /* ─── Helpers ─── */
  const updatePersonal = (field: keyof PersonalInfo, value: string) => {
    setPersonalInfo(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }
  }

  const validateStep = (step: StepId): boolean => {
    const newErrors: Record<string, boolean> = {}
    if (step === 1) {
      if (!personalInfo.firstName) newErrors.firstName = true
      if (!personalInfo.lastName) newErrors.lastName = true
      if (!personalInfo.dateOfBirth) newErrors.dateOfBirth = true
      if (!personalInfo.nationality) newErrors.nationality = true
      if (!personalInfo.country) newErrors.country = true
      if (!personalInfo.city) newErrors.city = true
      if (!personalInfo.address) newErrors.address = true
    } else if (step === 2) {
      if (!docInfo.docType) newErrors.docType = true
      if (!docInfo.docNumber) newErrors.docNumber = true
      if (!docInfo.frontFile) newErrors.frontFile = true
      if (!docInfo.backFile) newErrors.backFile = true
    } else if (step === 3) {
      if (!selfieInfo.selfieFile) newErrors.selfieFile = true
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const goToStep = (step: StepId) => {
    // Allow navigating to completed steps or the next step
    if (completedSteps.has(step) || step <= currentStep || step === (currentStep + 1) as StepId) {
      setCurrentStep(step)
    }
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCompletedSteps(prev => new Set([...prev, currentStep]))
      setKycStatus('in_progress')
      if (currentStep < 4) {
        setCurrentStep((currentStep + 1) as StepId)
      }
    } else {
      toast({ title: 'حقول مطلوبة', description: 'يرجى ملء جميع الحقول المطلوبة قبل المتابعة' })
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as StepId)
    }
  }

  const handleFileUpload = (
    type: 'front' | 'back' | 'selfie',
    file: File
  ) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      if (type === 'front') {
        setDocInfo(prev => ({ ...prev, frontFile: file, frontPreview: result }))
      } else if (type === 'back') {
        setDocInfo(prev => ({ ...prev, backFile: file, backPreview: result }))
      } else {
        setSelfieInfo(prev => ({ ...selfieFile: file, selfiePreview: result, livenessDetected: true }))
      }
    }
    reader.readAsDataURL(file)
    if (errors[`docFile_${type}`]) {
      setErrors(prev => { const n = { ...prev }; delete n[`docFile_${type}`]; return n })
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    // Simulate API submission
    await new Promise(resolve => setTimeout(resolve, 2500))
    setKycStatus('under_review')
    setIsSubmitting(false)
    toast({
      title: 'تم إرسال الطلب بنجاح',
      description: 'سيتم مراجعة بياناتك والرد خلال 24-48 ساعة عمل',
    })
  }

  /* ─── Format date display ─── */
  const formatDate = (d: string) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {
      return d
    }
  }

  const docTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      national_id: 'الهوية الوطنية',
      passport: 'جواز السفر',
      drivers_license: 'رخصة القيادة',
    }
    return map[type] || type
  }

  /* ═══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div className="custom-scrollbar" style={{
      direction: 'rtl', fontFamily: "'Cairo', sans-serif",
      height: '100%', overflowY: 'auto', background: T.bg,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulseGlow { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .kyc-step-content { animation: fadeIn 0.3s ease-out; }
        @media (max-width: 767px) {
          .kyc-stepper-desktop { display: none !important; }
          .kyc-stepper-mobile { display: flex !important; }
          .kyc-content { padding: 16px !important; }
          .kyc-benefits-grid { grid-template-columns: 1fr !important; }
          .kyc-doc-upload-grid { grid-template-columns: 1fr !important; }
          .kyc-review-grid { grid-template-columns: 1fr !important; }
          .kyc-form-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ═══ Header ═══ */}
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
              <Shield size={22} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>
                التحقق من الهوية (KYC)
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: T.text3, marginTop: 2 }}>
                أكمل عملية التحقق للوصول إلى جميع ميزات منصة رؤى
              </p>
            </div>
            <StatusBadge status={kycStatus} />
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
                      fontFamily: "'Cairo', sans-serif", textAlign: 'center',
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
                      fontFamily: "'JetBrains Mono', monospace",
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
                    fontFamily: "'Cairo', sans-serif",
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

          {/* ─── Step 1: Personal Information ─── */}
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
                    <User size={18} color={T.cyan} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
                      المعلومات الشخصية
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      أدخل بياناتك الشخصية كما تظهر في وثيقة الهوية
                    </div>
                  </div>
                </div>

                {/* Form fields */}
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
                      يجب أن تتطابق المعلومات مع وثيقة الهوية الرسمية. لن يمكن تعديلها بعد الإرسال.
                    </div>
                  </div>

                  {/* Name row */}
                  <div className="kyc-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <FormInput
                      label="الاسم الأول"
                      icon={<User size={12} color={T.cyan} />}
                      value={personalInfo.firstName}
                      onChange={v => updatePersonal('firstName', v)}
                      placeholder="أدخل الاسم الأول"
                      error={errors.firstName}
                      required
                    />
                    <FormInput
                      label="اسم العائلة"
                      icon={<User size={12} color={T.cyan} />}
                      value={personalInfo.lastName}
                      onChange={v => updatePersonal('lastName', v)}
                      placeholder="أدخل اسم العائلة"
                      error={errors.lastName}
                      required
                    />
                  </div>

                  {/* DOB & Nationality */}
                  <div className="kyc-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <FormInput
                      label="تاريخ الميلاد"
                      icon={<Calendar size={12} color={T.amber} />}
                      value={personalInfo.dateOfBirth}
                      onChange={v => updatePersonal('dateOfBirth', v)}
                      type="date"
                      error={errors.dateOfBirth}
                      required
                    />
                    <FormSelect
                      label="الجنسية"
                      icon={<Flag size={12} color={T.amber} />}
                      value={personalInfo.nationality}
                      onChange={v => updatePersonal('nationality', v)}
                      options={NATIONALITIES}
                      error={errors.nationality}
                      required
                    />
                  </div>

                  {/* Country & City */}
                  <div className="kyc-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <FormSelect
                      label="الدولة"
                      icon={<Globe size={12} color={T.green} />}
                      value={personalInfo.country}
                      onChange={v => updatePersonal('country', v)}
                      options={COUNTRIES}
                      error={errors.country}
                      required
                    />
                    <FormInput
                      label="المدينة"
                      icon={<Building size={12} color={T.green} />}
                      value={personalInfo.city}
                      onChange={v => updatePersonal('city', v)}
                      placeholder="أدخل اسم المدينة"
                      error={errors.city}
                      required
                    />
                  </div>

                  {/* Address */}
                  <FormInput
                    label="العنوان"
                    icon={<MapPin size={12} color={T.purple} />}
                    value={personalInfo.address}
                    onChange={v => updatePersonal('address', v)}
                    placeholder="الشارع، الحي، رقم المبنى"
                    error={errors.address}
                    required
                  />

                  {/* Postal Code */}
                  <FormInput
                    label="الرمز البريدي (اختياري)"
                    icon={<Home size={12} color={T.text3} />}
                    value={personalInfo.postalCode}
                    onChange={v => updatePersonal('postalCode', v)}
                    placeholder="مثال: 12345"
                    maxLength={10}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 2: Identity Document ─── */}
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
                    <CreditCard size={18} color={T.amber} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
                      وثيقة الهوية
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      ارفع صورة واضحة لوثيقة الهوية الرسمية
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Document type selection */}
                  <div style={{ marginBottom: 4 }}>
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                      fontSize: 12, fontWeight: 600, color: T.text2,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      <IdCard size={12} color={T.amber} />
                      نوع الوثيقة
                      <span style={{ color: T.red, fontSize: 10 }}>*</span>
                    </label>
                    <DocTypeSelector
                      value={docInfo.docType}
                      onChange={v => setDocInfo(prev => ({ ...prev, docType: v }))}
                    />
                    {errors.docType && !docInfo.docType && (
                      <div style={{ fontSize: 10, color: T.red, display: 'flex', alignItems: 'center', gap: 4, marginTop: -8, marginBottom: 8 }}>
                        <AlertCircle size={10} /> اختر نوع الوثيقة
                      </div>
                    )}
                  </div>

                  {/* Document number */}
                  <FormInput
                    label="رقم الوثيقة"
                    icon={<Fingerprint size={12} color={T.amber} />}
                    value={docInfo.docNumber}
                    onChange={v => setDocInfo(prev => ({ ...prev, docNumber: v }))}
                    placeholder="أدخل رقم الوثيقة كما يظهر فيها"
                    error={errors.docNumber}
                    required
                  />

                  {/* File uploads */}
                  <div style={{ marginTop: 8 }}>
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                      fontSize: 12, fontWeight: 600, color: T.text2,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      <Upload size={12} color={T.amber} />
                      صور الوثيقة
                      <span style={{ color: T.red, fontSize: 10 }}>*</span>
                    </label>
                    <div className="kyc-doc-upload-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <FileUploadZone
                        label="الوجه الأمامي"
                        sublabel="اسحب الصورة هنا أو انقر للاختيار"
                        file={docInfo.frontFile}
                        preview={docInfo.frontPreview}
                        onFileChange={f => handleFileUpload('front', f)}
                        onRemove={() => setDocInfo(prev => ({ ...prev, frontFile: null, frontPreview: null }))}
                      />
                      <FileUploadZone
                        label="الوجه الخلفي"
                        sublabel="اسحب الصورة هنا أو انقر للاختيار"
                        file={docInfo.backFile}
                        preview={docInfo.backPreview}
                        onFileChange={f => handleFileUpload('back', f)}
                        onRemove={() => setDocInfo(prev => ({ ...prev, backFile: null, backPreview: null }))}
                      />
                    </div>
                    {(errors.frontFile && !docInfo.frontFile) && (
                      <div style={{ fontSize: 10, color: T.red, display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                        <AlertCircle size={10} /> يرجى رفع صورة الوجه الأمامي
                      </div>
                    )}
                    {(errors.backFile && !docInfo.backFile) && (
                      <div style={{ fontSize: 10, color: T.red, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <AlertCircle size={10} /> يرجى رفع صورة الوجه الخلفي
                      </div>
                    )}
                  </div>

                  {/* Upload tips */}
                  <div style={{
                    marginTop: 16, padding: '12px 14px', borderRadius: 10,
                    background: `${T.amber}06`, border: `1px solid ${T.amber}12`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <FileCheck size={14} color={T.amber} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.amber, fontFamily: "'Cairo', sans-serif" }}>
                        نصائح للحصول على أفضل نتيجة
                      </span>
                    </div>
                    <ul style={{ margin: 0, padding: '0 16px', fontSize: 10, color: T.text3, lineHeight: 2 }}>
                      <li>تأكد من وضوح جميع التفاصيل والنصوص</li>
                      <li>اجعل الوثيقة تملأ إطار الصورة بالكامل</li>
                      <li>تجنب الانعكاسات والظلال على الوثيقة</li>
                      <li>استخدم إضاءة جيدة عند التقاط الصورة</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 3: Selfie Verification ─── */}
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
                    <Camera size={18} color={T.purple} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
                      التحقق الذاتي
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      ارفع صورة شخصية للتأكد من تطابق هويتك
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Instructions */}
                  <div style={{
                    padding: '16px 18px', borderRadius: 12,
                    background: `${T.purple}06`, border: `1px solid ${T.purple}12`,
                    marginBottom: 20,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <ScanFace size={18} color={T.purple} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: T.purple, fontFamily: "'Cairo', sans-serif" }}>
                        تعليمات التصوير
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { icon: <Eye size={14} color={T.green} />, text: 'وجّه وجهك مباشرة نحو الكاميرا' },
                        { icon: <ShieldCheck size={14} color={T.green} />, text: 'تأكد من إضاءة جيدة وبدون ظلال' },
                        { icon: <User size={14} color={T.green} />, text: 'أزل النظارات والقبعات إن أمكن' },
                        { icon: <Lock size={14} color={T.green} />, text: 'لا تُدخل أي مرشحات أو تعديلات على الصورة' },
                        { icon: <ImageIcon size={14} color={T.green} />, text: 'اجعل وجهك يملأ 70% على الأقل من الإطار' },
                      ].map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {item.icon}
                          <span style={{ fontSize: 11, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Selfie upload */}
                  <div style={{ maxWidth: 400, margin: '0 auto' }}>
                    <FileUploadZone
                      label="صورة شخصية (سيلفي)"
                      sublabel="اسحب الصورة هنا أو انقر للاختيار"
                      file={selfieInfo.selfieFile}
                      preview={selfieInfo.selfiePreview}
                      onFileChange={f => handleFileUpload('selfie', f)}
                      onRemove={() => setSelfieInfo(prev => ({ ...prev, selfieFile: null, selfiePreview: null, livenessDetected: false }))}
                      accept="image/*"
                    />
                    {errors.selfieFile && !selfieInfo.selfieFile && (
                      <div style={{ fontSize: 10, color: T.red, display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                        <AlertCircle size={10} /> يرجى رفع صورة شخصية
                      </div>
                    )}
                  </div>

                  {/* Liveness indicator */}
                  {selfieInfo.livenessDetected && (
                    <div style={{
                      marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '10px 16px', borderRadius: 10,
                      background: `${T.green}08`, border: `1px solid ${T.green}20`,
                    }}>
                      <ShieldCheck size={16} color={T.green} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.green, fontFamily: "'Cairo', sans-serif" }}>
                        تم التحقق من مطابقة الوجه بنجاح
                      </span>
                    </div>
                  )}

                  {/* Privacy note */}
                  <div style={{
                    marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '10px 14px', borderRadius: 10,
                    background: T.surface, border: `1px solid ${T.border}`,
                  }}>
                    <Lock size={14} color={T.text3} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 10, color: T.text3, lineHeight: 1.7 }}>
                      صورك الشخصية مشفرة بالكامل وتُستخدم فقط للتحقق من الهوية. لن يتم مشاركتها مع أطراف ثالثة.
                    </div>
                  </div>
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
                      المراجعة والتأكيد
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      راجع جميع بياناتك قبل الإرسال النهائي
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Personal Info Review */}
                  <div style={{
                    padding: 14, borderRadius: 12,
                    background: T.surface, border: `1px solid ${T.border}`,
                    marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <User size={14} color={T.cyan} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                          المعلومات الشخصية
                        </span>
                      </div>
                      <button
                        onClick={() => setCurrentStep(1)}
                        style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: `${T.cyan}10`, border: `1px solid ${T.cyan}20`,
                          color: T.cyan, fontSize: 10, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <ChevronRight size={10} /> تعديل
                      </button>
                    </div>
                    <div className="kyc-review-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                      {[
                        { label: 'الاسم', value: `${personalInfo.firstName} ${personalInfo.lastName}` },
                        { label: 'تاريخ الميلاد', value: formatDate(personalInfo.dateOfBirth) },
                        { label: 'الجنسية', value: personalInfo.nationality },
                        { label: 'الدولة', value: personalInfo.country },
                        { label: 'المدينة', value: personalInfo.city },
                        { label: 'العنوان', value: personalInfo.address },
                      ].map((item, idx) => (
                        <div key={idx}>
                          <div style={{ fontSize: 10, color: T.text4, fontFamily: "'Cairo', sans-serif" }}>{item.label}</div>
                          <div style={{ fontSize: 12, color: T.text, fontWeight: 600, fontFamily: "'Cairo', sans-serif" }}>{item.value || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Document Review */}
                  <div style={{
                    padding: 14, borderRadius: 12,
                    background: T.surface, border: `1px solid ${T.border}`,
                    marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CreditCard size={14} color={T.amber} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                          وثيقة الهوية
                        </span>
                      </div>
                      <button
                        onClick={() => setCurrentStep(2)}
                        style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: `${T.amber}10`, border: `1px solid ${T.amber}20`,
                          color: T.amber, fontSize: 10, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <ChevronRight size={10} /> تعديل
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, color: T.text4 }}>نوع الوثيقة</span>
                        <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{docTypeLabel(docInfo.docType) || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, color: T.text4 }}>رقم الوثيقة</span>
                        <span style={{ fontSize: 12, color: T.text, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                          {docInfo.docNumber ? `${docInfo.docNumber.slice(0, 4)}${'•'.repeat(Math.max(0, docInfo.docNumber.length - 4))}` : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, color: T.text4 }}>الوجه الأمامي</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: docInfo.frontFile ? T.green : T.red, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {docInfo.frontFile ? <><CheckCircle2 size={12} /> مرفق</> : <><AlertCircle size={12} /> غير مرفق</>}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, color: T.text4 }}>الوجه الخلفي</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: docInfo.backFile ? T.green : T.red, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {docInfo.backFile ? <><CheckCircle2 size={12} /> مرفق</> : <><AlertCircle size={12} /> غير مرفق</>}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Selfie Review */}
                  <div style={{
                    padding: 14, borderRadius: 12,
                    background: T.surface, border: `1px solid ${T.border}`,
                    marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Camera size={14} color={T.purple} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                          التحقق الذاتي
                        </span>
                      </div>
                      <button
                        onClick={() => setCurrentStep(3)}
                        style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: `${T.purple}10`, border: `1px solid ${T.purple}20`,
                          color: T.purple, fontSize: 10, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <ChevronRight size={10} /> تعديل
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {selfieInfo.selfiePreview ? (
                        <img src={selfieInfo.selfiePreview} alt="Selfie preview" style={{
                          width: 48, height: 48, borderRadius: 10, objectFit: 'cover',
                          border: `1px solid ${T.green}30`,
                        }} />
                      ) : (
                        <div style={{
                          width: 48, height: 48, borderRadius: 10,
                          background: T.surface, border: `1px solid ${T.border}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <User size={18} color={T.text4} />
                        </div>
                      )}
                      <div>
                        <div style={{
                          fontSize: 12, fontWeight: 600,
                          color: selfieInfo.selfieFile ? T.green : T.red,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          {selfieInfo.selfieFile ? (
                            <><CheckCircle2 size={12} /> صورة شخصية مرفقة</>
                          ) : (
                            <><AlertCircle size={12} /> صورة شخصية غير مرفقة</>
                          )}
                        </div>
                        {selfieInfo.livenessDetected && (
                          <div style={{ fontSize: 10, color: T.green, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ShieldCheck size={10} /> تم التحقق من مطابقة الوجه
                          </div>
                        )}
                      </div>
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
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
                          إقرار الموافقة
                        </div>
                        <div style={{ fontSize: 10, color: T.text3, lineHeight: 1.8 }}>
                          بالنقر على "إرسال الطلب"، أقر بأن جميع المعلومات المقدمة صحيحة ودقيقة، وأوافق على
                          شروط وأحكام منصة رؤى المتعلقة بالتحقق من الهوية وحماية البيانات الشخصية وفقاً
                          لسياسة الخصوصية المعمول بها.
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
                fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
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
                  cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
                  boxShadow: `0 0 20px ${T.cyan}25`, transition: 'all 0.2s',
                }}
              >
                التالي
                <ChevronLeft size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || kycStatus === 'under_review'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '12px 28px', borderRadius: 10,
                  background: isSubmitting || kycStatus === 'under_review'
                    ? T.surface
                    : `linear-gradient(135deg, ${T.green}, #00CC82)`,
                  border: 'none',
                  color: isSubmitting || kycStatus === 'under_review' ? T.text3 : '#000',
                  fontSize: 13, fontWeight: 800, cursor: isSubmitting || kycStatus === 'under_review' ? 'not-allowed' : 'pointer',
                  fontFamily: "'Cairo', sans-serif",
                  boxShadow: isSubmitting || kycStatus === 'under_review' ? 'none' : `0 0 20px ${T.green}25`,
                  transition: 'all 0.2s',
                }}
              >
                {isSubmitting ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> جاري الإرسال...</>
                ) : kycStatus === 'under_review' ? (
                  <><Clock size={16} /> قيد المراجعة</>
                ) : (
                  <><CheckCircle2 size={16} /> إرسال الطلب</>
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
                  لماذا التحقق من الهوية؟
                </div>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                  افتح كافة إمكانيات منصة رؤى بالتحقق من هويتك
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <div className="kyc-benefits-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <BenefitCard
                  icon={<TrendingUp size={16} color={T.cyan} />}
                  title="حدود تداول أعلى"
                  description="زيادة حدود الإيداع والسحب والتداول بعد التحقق"
                  color={T.cyan}
                />
                <BenefitCard
                  icon={<Wallet size={16} color={T.green} />}
                  title="تداول حقيقي"
                  description="الوصول إلى التداول الحقيقي والتنفيذ المباشر للصفقات"
                  color={T.green}
                />
                <BenefitCard
                  icon={<ArrowRight size={16} color={T.amber} />}
                  title="سحوبات غير محدودة"
                  description="سحب أموالك في أي وقت بدون قيود على المبالغ"
                  color={T.amber}
                />
                <BenefitCard
                  icon={<Sparkles size={16} color={T.purple} />}
                  title="ميزات مميزة"
                  description="الوصول إلى أدوات AI المتقدمة والنسخ الاجتماعي"
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
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif", marginBottom: 6 }}>
                  أمان وخصوصية بياناتك
                </div>
                <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.9 }}>
                  نستخدم تشفير <span style={{ color: T.cyan, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>AES-256-GCM</span> لحماية جميع بياناتك الشخصية ووثائقك. تُخزن الملفات على خوادم مؤمّنة بمعايير
                  <span style={{ color: T.green, fontWeight: 700 }}> SOC 2 Type II </span>
                  ولا يمكن الوصول إليها إلا من قبل فريق الامتثال المصرّح له. نلتزم بمعايير
                  <span style={{ color: T.amber, fontWeight: 700 }}> GDPR </span>
                  وسياسات حماية البيانات المحلية، ولن نشارك بياناتك مع أي طرف ثالث دون موافقتك الصريحة.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {[
                    { label: 'AES-256', color: T.cyan },
                    { label: 'SOC 2', color: T.green },
                    { label: 'GDPR', color: T.amber },
                    { label: 'End-to-End', color: T.purple },
                  ].map((badge, idx) => (
                    <span key={idx} style={{
                      padding: '3px 10px', borderRadius: 8,
                      background: `${badge.color}10`, border: `1px solid ${badge.color}20`,
                      fontSize: 9, fontWeight: 700, color: badge.color,
                      fontFamily: "'JetBrains Mono', monospace",
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
