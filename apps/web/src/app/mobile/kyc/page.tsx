'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Link2, Shield, Key, CheckCircle2, AlertTriangle,
  Loader2, ChevronLeft, ArrowRight, Eye, EyeOff,
} from 'lucide-react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757',
  amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8',
  bg: '#1A1D29', border: 'rgba(255,255,255,0.06)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Exchange List ─── */
const EXCHANGES = [
  { id: 'binance', name: 'Binance', icon: '🔶', desc: 'أكبر بورصة كريبتو عالمية' },
  { id: 'binance_test', name: 'Binance Testnet', icon: '🧪', desc: 'بيئة تجريبية لـ Binance' },
  { id: 'binance_future_test', name: 'Binance Futures Testnet', icon: '📈', desc: 'بيئة تجريبية للعقود الآجلة' },
  { id: 'kucoin', name: 'KuCoin', icon: '🟢', desc: 'بورصة عالمية متنوعة' },
  { id: 'bybit', name: 'Bybit', icon: '🟠', desc: 'متخصصة في المشتقات' },
  { id: 'okx', name: 'OKX', icon: '⚪', desc: 'بورصة شاملة مع DeFi', requiresPassphrase: true },
  { id: 'gateio', name: 'Gate.io', icon: '🔵', desc: 'بورصة عملات رقمية' },
]

/* ─── Step Indicator ─── */
function StepIndicator({ step }: { step: number }) {
  const steps = [
    { n: 1, label: 'اختر البورصة' },
    { n: 2, label: 'أدخل المفاتيح' },
    { n: 3, label: 'تحقق' },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 16px', marginBottom: 16 }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flex: 1,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, flexShrink: 0,
              background: step >= s.n ? C.accent : 'rgba(255,255,255,0.06)',
              border: step >= s.n ? `1px solid ${C.accent}40` : `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 900, color: step >= s.n ? '#000' : C.text2,
              fontFamily: FONT_MONO, transition: 'all 0.3s',
            }}>
              {step > s.n ? <CheckCircle2 size={12} color="#000" /> : s.n}
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, color: step >= s.n ? C.text : C.text2,
              fontFamily: FONT_AR, whiteSpace: 'nowrap',
            }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 0.5, height: 1, background: step > s.n ? C.accent : C.border, marginInline: 4,
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── KYC Page ─── */
export default function MobileKYCPage() {
  const router = useRouter()

  // Step state
  const [step, setStep] = useState(1)
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null)

  // Form state
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [testnet, setTestnet] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [verifyResult, setVerifyResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const exchangeInfo = EXCHANGES.find(e => e.id === selectedExchange)
  const requiresPassphrase = exchangeInfo?.requiresPassphrase ?? false

  /* ─── Step 1: Select Exchange ─── */
  function renderStep1() {
    return (
      <div style={{ padding: '0 16px' }}>
        <div style={{
          padding: '10px 14px', borderRadius: 12, marginBottom: 12,
          background: `${C.accent}06`, border: `0.5px solid ${C.accent}12`,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <Shield size={14} color={C.accent} style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, lineHeight: 1.7 }}>
            رؤى لا تلمس أموالك أبداً. المفاتيح مشفرة بـ AES-256-GCM وتُستخدم فقط للقراءة.
            <span style={{ color: C.danger, fontWeight: 700 }}> المفاتيح ذات صلاحية السحب تُرفض.</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {EXCHANGES.map((ex) => (
            <motion.button
              key={ex.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedExchange(ex.id)}
              style={{
                padding: 14, borderRadius: 14, border: 'none',
                background: selectedExchange === ex.id ? `${C.accent}0D` : 'rgba(28,28,30,0.65)',
                border: selectedExchange === ex.id ? `1px solid ${C.accent}30` : `0.5px solid ${C.border}`,
                cursor: 'pointer', textAlign: 'center', direction: 'rtl',
                backdropFilter: 'blur(30px)',
              }}
            >
              <span style={{ fontSize: 28, display: 'block', marginBottom: 6 }}>{ex.icon}</span>
              <div style={{ fontSize: 11, fontWeight: 800, color: selectedExchange === ex.id ? C.accent : C.text, fontFamily: FONT_AR }}>
                {ex.name}
              </div>
              <div style={{ fontSize: 8, color: C.text2, fontFamily: FONT_AR, marginTop: 2 }}>
                {ex.desc}
              </div>
            </motion.button>
          ))}
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!selectedExchange}
          onClick={() => { setStep(2); setErrorMsg('') }}
          style={{
            width: '100%', padding: 12, borderRadius: 12, marginTop: 16,
            background: selectedExchange
              ? `linear-gradient(135deg, ${C.accent}, #00A8CC)`
              : 'rgba(255,255,255,0.05)',
            border: 'none', color: selectedExchange ? '#000' : C.text2,
            fontSize: 13, fontWeight: 800, fontFamily: FONT_AR,
            cursor: selectedExchange ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          التالي
          <ArrowRight size={14} />
        </motion.button>
      </div>
    )
  }

  /* ─── Step 2: Enter API Keys ─── */
  function renderStep2() {
    return (
      <div style={{ padding: '0 16px' }}>
        <IOSCard noMargin highlight>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>{exchangeInfo?.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                {exchangeInfo?.name}
              </div>
              <button
                onClick={() => setStep(1)}
                style={{ fontSize: 9, color: C.accent, fontFamily: FONT_AR, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                تغيير البورصة
              </button>
            </div>
          </div>
        </IOSCard>

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Label */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, display: 'block', marginBottom: 4 }}>
              تسمية المفتاح (اختياري)
            </label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={`${selectedExchange}-main`}
              dir="ltr"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`,
                color: C.text, fontSize: 12, fontFamily: FONT_MONO,
                outline: 'none', direction: 'ltr', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* API Key */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, display: 'block', marginBottom: 4 }}>
              مفتاح API
            </label>
            <div style={{ position: 'relative' }}>
              <input
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                type={showKey ? 'text' : 'password'}
                placeholder="أدخل مفتاح API"
                dir="ltr"
                style={{
                  width: '100%', padding: '10px 40px 10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`,
                  color: C.text, fontSize: 12, fontFamily: FONT_MONO,
                  outline: 'none', direction: 'ltr', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                }}
              >
                {showKey ? <EyeOff size={14} color={C.text2} /> : <Eye size={14} color={C.text2} />}
              </button>
            </div>
          </div>

          {/* API Secret */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, display: 'block', marginBottom: 4 }}>
              المفتاح السري
            </label>
            <div style={{ position: 'relative' }}>
              <input
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
                type={showSecret ? 'text' : 'password'}
                placeholder="أدخل المفتاح السري"
                dir="ltr"
                style={{
                  width: '100%', padding: '10px 40px 10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`,
                  color: C.text, fontSize: 12, fontFamily: FONT_MONO,
                  outline: 'none', direction: 'ltr', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => setShowSecret(!showSecret)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                }}
              >
                {showSecret ? <EyeOff size={14} color={C.text2} /> : <Eye size={14} color={C.text2} />}
              </button>
            </div>
          </div>

          {/* Passphrase (OKX) */}
          {requiresPassphrase && (
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, display: 'block', marginBottom: 4 }}>
                عبارة المرور (Passphrase)
              </label>
              <input
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                type="password"
                placeholder="أدخل عبارة المرور"
                dir="ltr"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`,
                  color: C.text, fontSize: 12, fontFamily: FONT_MONO,
                  outline: 'none', direction: 'ltr', boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* Testnet toggle (Binance) */}
          {(selectedExchange?.includes('binance')) && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 10,
              background: testnet ? `${C.accent}08` : 'rgba(255,255,255,0.02)',
              border: `0.5px solid ${testnet ? `${C.accent}18` : C.border}`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                وضع التجريب (Testnet)
              </span>
              <button
                onClick={() => setTestnet(!testnet)}
                style={{
                  width: 42, height: 24, borderRadius: 12, position: 'relative',
                  background: testnet ? C.accent : 'rgba(255,255,255,0.1)',
                  border: 'none', cursor: 'pointer', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 10,
                  background: '#FFF', transition: 'inset-inline-start 0.2s',
                  insetInlineStart: testnet ? 20 : 2,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 10,
              background: `${C.danger}08`, border: `0.5px solid ${C.danger}18`,
            }}>
              <AlertTriangle size={12} color={C.danger} />
              <span style={{ fontSize: 10, color: C.danger, fontFamily: FONT_AR }}>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => setStep(1)}
            style={{
              flex: 1, padding: 12, borderRadius: 12,
              background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`,
              color: C.text2, fontSize: 12, fontWeight: 800, fontFamily: FONT_AR,
              cursor: 'pointer',
            }}
          >
            رجوع
          </button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={!apiKey || !apiSecret || submitting}
            onClick={handleVerify}
            style={{
              flex: 2, padding: 12, borderRadius: 12,
              background: (apiKey && apiSecret && !submitting)
                ? `linear-gradient(135deg, ${C.accent}, #00A8CC)`
                : 'rgba(255,255,255,0.05)',
              border: 'none',
              color: (apiKey && apiSecret && !submitting) ? '#000' : C.text2,
              fontSize: 12, fontWeight: 800, fontFamily: FONT_AR,
              cursor: (apiKey && apiSecret && !submitting) ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                جارٍ التحقق...
              </>
            ) : (
              <>
                <Shield size={14} />
                تحقق وربط
              </>
            )}
          </motion.button>
        </div>
      </div>
    )
  }

  /* ─── Step 3: Verify Result ─── */
  function renderStep3() {
    const isSuccess = verifyResult === 'success'
    return (
      <div style={{ padding: '0 16px', textAlign: 'center' }}>
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        >
          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: '16px auto',
            background: isSuccess ? `${C.success}10` : `${C.danger}10`,
            border: `1px solid ${isSuccess ? `${C.success}25` : `${C.danger}25`}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isSuccess ? (
              <CheckCircle2 size={32} color={C.success} />
            ) : (
              <AlertTriangle size={32} color={C.danger} />
            )}
          </div>
        </motion.div>

        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: FONT_AR, marginBottom: 6 }}>
          {isSuccess ? 'تم الربط بنجاح!' : 'فشل التحقق'}
        </div>
        <div style={{ fontSize: 12, color: C.text2, fontFamily: FONT_AR, marginBottom: 20, lineHeight: 1.7 }}>
          {isSuccess
            ? `تم ربط حساب ${exchangeInfo?.name} بنجاح. يمكنك الآن متابعة محفظتك وتداولاتك.`
            : `لم نتمكن من التحقق من المفاتيح. تأكد من صحة المفاتيح وأنها لا تحتوي على صلاحيات السحب.`
          }
        </div>

        {isSuccess && (
          <IOSCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>{exchangeInfo?.icon}</span>
              <div style={{ textAlign: 'right', flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                  {exchangeInfo?.name}
                </div>
                <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>
                  {label || `${selectedExchange}-key`}
                </div>
              </div>
              <div style={{
                padding: '3px 8px', borderRadius: 6,
                background: `${C.success}10`, border: `0.5px solid ${C.success}20`,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <CheckCircle2 size={10} color={C.success} />
                <span style={{ fontSize: 8, fontWeight: 700, color: C.success, fontFamily: FONT_AR }}>مؤكد</span>
              </div>
            </div>
          </IOSCard>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {!isSuccess && (
            <button
              onClick={() => { setStep(2); setVerifyResult(null); setErrorMsg('') }}
              style={{
                flex: 1, padding: 12, borderRadius: 12,
                background: `${C.amber}10`, border: `0.5px solid ${C.amber}25`,
                color: C.amber, fontSize: 12, fontWeight: 800, fontFamily: FONT_AR,
                cursor: 'pointer',
              }}
            >
              إعادة المحاولة
            </button>
          )}
          <button
            onClick={() => router.push('/mobile/profile')}
            style={{
              flex: 1, padding: 12, borderRadius: 12,
              background: isSuccess
                ? `linear-gradient(135deg, ${C.accent}, #00A8CC)`
                : 'rgba(255,255,255,0.05)',
              border: isSuccess ? 'none' : `0.5px solid ${C.border}`,
              color: isSuccess ? '#000' : C.text2,
              fontSize: 12, fontWeight: 800, fontFamily: FONT_AR,
              cursor: 'pointer',
            }}
          >
            {isSuccess ? 'الذهاب للملف الشخصي' : 'رجوع'}
          </button>
        </div>
      </div>
    )
  }

  /* ─── Handle Verify & Submit ─── */
  async function handleVerify() {
    if (!selectedExchange || !apiKey || !apiSecret) return
    setSubmitting(true)
    setErrorMsg('')
    setVerifyResult(null)

    try {
      const res = await fetch('/api/portfolio/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: selectedExchange,
          label: label || `${selectedExchange}-key`,
          apiKey,
          apiSecret,
          passphrase: passphrase || undefined,
          testnet,
        }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setVerifyResult('success')
        setStep(3)
      } else {
        const err = data.error || data.message || 'فشل في إضافة المفتاح'
        setErrorMsg(err)
        setVerifyResult('error')
        setStep(3)
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطأ في الاتصال')
      setVerifyResult('error')
      setStep(3)
    } finally {
      setSubmitting(false)
    }
  }

  /* ─── Render ─── */
  return (
    <div className="m-page">
      <MobilePageHeader
        title="ربط الحسابات"
        subtitle={step === 1 ? 'اختر البورصة' : step === 2 ? 'أدخل مفاتيح API' : 'التحقق'}
      />

      <StepIndicator step={step} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2 }}
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </motion.div>
      </AnimatePresence>

      <div style={{ height: 24 }} />
    </div>
  )
}
