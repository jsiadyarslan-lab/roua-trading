'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft, Link2, Key, Shield, CheckCircle, AlertCircle,
  Loader2, ChevronRight, Lock, Eye, EyeOff, Zap, Trash2
} from 'lucide-react'

/* ─── Design Tokens ─── */
const c = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
}

/* ─── Exchange Data ─── */
const EXCHANGES = [
  { id: 'binance', name: 'Binance', nameAr: 'باينانس', color: '#F0B90B', desc: 'أكبر منصة تداول عملات رقمية' },
  { id: 'kucoin', name: 'KuCoin', nameAr: 'كوکوين', color: '#23AF91', desc: 'منصة تداول عملات رقمية' },
  { id: 'bybit', name: 'Bybit', nameAr: 'بايبيت', color: '#F7A600', desc: 'منصة مشتقات رقمية' },
  { id: 'okx', name: 'OKX', nameAr: 'أو كي إكس', color: '#ffffff', desc: 'منصة تداول رقمية متعددة' },
  { id: 'gate', name: 'Gate.io', nameAr: 'جيت دوت آيو', color: '#2354E6', desc: 'منصة تداول عملات رقمية' },
]

/* ─── Credential type ─── */
interface Credential {
  id: string
  exchange: string
  label: string
  permissions: string
  isValid: boolean
  lastValidatedAt: string | null
  createdAt: string
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

/* ─── Step Indicator ─── */
function StepIndicator({ current, total = 3 }: { current: number; total?: number }) {
  const labels = ['اختيار المنصة', 'إدخال المفاتيح', 'التحقق']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, direction: 'rtl' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: i < current ? c.accent : i === current ? `${c.accent}30` : 'rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: i === current ? `1.5px solid ${c.accent}` : 'none',
            transition: '0.3s',
          }}>
            {i < current ? (
              <CheckCircle size={14} color="#000" />
            ) : (
              <span style={{ fontSize: 12, fontWeight: 800, color: i === current ? c.accent : c.text2, fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}</span>
            )}
          </div>
          <span style={{ fontSize: 10, color: i <= current ? c.text : c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: i === current ? 700 : 400, whiteSpace: 'nowrap' }}>
            {labels[i]}
          </span>
          {i < total - 1 && (
            <div style={{ flex: 1, height: 1.5, background: i < current ? c.accent : 'rgba(255,255,255,0.08)', borderRadius: 1 }} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Main Page ─── */
export default function KYCPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [linkedExchanges, setLinkedExchanges] = useState<Record<string, boolean>>({})

  // Flow state
  const [flowActive, setFlowActive] = useState(false)
  const [step, setStep] = useState(0)
  const [selectedExchange, setSelectedExchange] = useState<any>(null)
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  // ── Fetch real credentials from /api/portfolio/credentials ──
  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/credentials')
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setCredentials(data.data)
          // Build linked exchanges map from real credential data
          const linked: Record<string, boolean> = {}
          data.data.forEach((cred: Credential) => {
            if (cred.isValid) {
              linked[cred.exchange] = true
            }
          })
          setLinkedExchanges(linked)
        }
      }
    } catch {
      // Error handled silently — will show exchanges as not linked
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCredentials()
  }, [fetchCredentials])

  const startFlow = (exchange: any) => {
    setSelectedExchange(exchange)
    setLabel('')
    setApiKey('')
    setApiSecret('')
    setVerified(false)
    setVerifyError('')
    setStep(1)
    setFlowActive(true)
  }

  // ── Actually save credentials via /api/portfolio/credentials ──
  const handleVerify = async () => {
    if (!apiKey || !apiSecret || !selectedExchange) return
    setVerifying(true)
    setVerifyError('')
    try {
      const res = await fetch('/api/portfolio/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: selectedExchange.id,
          label: label || `${selectedExchange.id}-key`,
          apiKey,
          apiSecret,
        }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setVerified(true)
        // Refresh credentials list from server
        await fetchCredentials()
        setTimeout(() => {
          setFlowActive(false)
          setStep(0)
        }, 1500)
      } else {
        // REAL error from server — show the actual error message
        setVerifyError(data.error || data.message || 'فشل في التحقق من المفتاح')
        setStep(1) // Go back to edit keys
      }
    } catch (err: any) {
      setVerifyError('فشل الاتصال بالخادم، تأكد من اتصالك بالإنترنت')
      setStep(1) // Go back to edit keys
    } finally {
      setVerifying(false)
    }
  }

  // ── Delete a credential ──
  const handleDelete = async (credId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المفتاح؟ هذا الإجراء لا يمكن التراجع عنه.')) return
    setDeleting(credId)
    try {
      const res = await fetch(`/api/portfolio/credentials/${credId}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchCredentials()
      }
    } catch {
      // Silently fail
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(180deg, rgba(255,184,0,0.06), transparent)',
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => flowActive ? (setFlowActive(false), setStep(0)) : router.back()}
          style={{
            width: 40, height: 40, borderRadius: 14,
            background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `0.5px solid ${c.border}`,
          }}
        >
          <ChevronLeft size={20} color={c.text} />
        </motion.button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>ربط الحسابات</h1>
          <p style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>اربط حسابات التداول بكل أمان</p>
        </div>
      </div>

      {/* ── Flow Steps ── */}
      <AnimatePresence mode="wait">
        {flowActive && (
          <motion.div
            key="flow"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div style={{ padding: '0 20px' }}>
              <StepIndicator current={step} />

              {/* Step 2: Enter Keys */}
              {step === 1 && (
                <IOSCard highlight>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 16,
                      background: `${selectedExchange?.color}15`, border: `0.5px solid ${selectedExchange?.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22, fontWeight: 900, color: selectedExchange?.color,
                    }}>
                      {selectedExchange?.name?.[0]}
                    </div>
                    <div>
                      <p style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{selectedExchange?.nameAr}</p>
                      <p style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{selectedExchange?.desc}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Label field */}
                    <div>
                      <label style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 6 }}>تسمية المفتاح (اختياري)</label>
                      <input
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder={`مثال: ${selectedExchange?.id}-main`}
                        style={{
                          width: '100%', padding: '12px 14px', borderRadius: 14,
                          background: 'rgba(255,255,255,0.05)',
                          border: `0.5px solid ${c.border}`, color: c.text,
                          fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                          outline: 'none', direction: 'ltr', textAlign: 'left',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 6 }}>مفتاح API</label>
                      <div style={{ position: 'relative' }}>
                        <Key size={16} color={c.text2} style={{ position: 'absolute', insetInlineEnd: 14, top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                          value={apiKey}
                          onChange={e => setApiKey(e.target.value)}
                          placeholder="أدخل مفتاح API"
                          style={{
                            width: '100%', padding: '12px 14px 12px 14px', paddingInlineEnd: 40,
                            borderRadius: 14, background: 'rgba(255,255,255,0.05)',
                            border: `0.5px solid ${c.border}`, color: c.text,
                            fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                            outline: 'none', direction: 'ltr', textAlign: 'left',
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 6 }}>المفتاح السري</label>
                      <div style={{ position: 'relative' }}>
                        <Lock size={16} color={c.text2} style={{ position: 'absolute', insetInlineEnd: 14, top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                          value={apiSecret}
                          onChange={e => setApiSecret(e.target.value)}
                          type={showSecret ? 'text' : 'password'}
                          placeholder="أدخل المفتاح السري"
                          style={{
                            width: '100%', padding: '12px 14px 12px 40px', paddingInlineEnd: 40,
                            borderRadius: 14, background: 'rgba(255,255,255,0.05)',
                            border: `0.5px solid ${c.border}`, color: c.text,
                            fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                            outline: 'none', direction: 'ltr', textAlign: 'left',
                          }}
                        />
                        <button
                          onClick={() => setShowSecret(!showSecret)}
                          style={{
                            position: 'absolute', insetInlineStart: 14, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                          }}
                        >
                          {showSecret ? <EyeOff size={16} color={c.text2} /> : <Eye size={16} color={c.text2} />}
                        </button>
                      </div>
                    </div>

                    {/* Error message */}
                    {verifyError && (
                      <div style={{
                        padding: '12px 16px', borderRadius: 14,
                        background: `${c.danger}10`, border: `0.5px solid ${c.danger}30`,
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <AlertCircle size={16} color={c.danger} />
                        <p style={{ fontSize: 12, color: c.danger, fontFamily: "'Cairo', sans-serif", flex: 1 }}>{verifyError}</p>
                      </div>
                    )}

                    {/* Security note */}
                    <div style={{
                      padding: '10px 14px', borderRadius: 12,
                      background: 'rgba(0,212,255,0.04)', border: `0.5px solid rgba(0,212,255,0.1)`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={12} color={c.accent} />
                        <p style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>
                          مفاتيح API مشفرة بـ AES-256-GCM. المفاتيح ذات صلاحيات السحب تُرفض.
                        </p>
                      </div>
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setStep(2); handleVerify() }}
                    disabled={!apiKey || !apiSecret}
                    style={{
                      width: '100%', marginTop: 20, padding: '14px 0', borderRadius: 16,
                      background: (!apiKey || !apiSecret) ? 'rgba(255,255,255,0.05)' : c.accent,
                      color: (!apiKey || !apiSecret) ? c.text2 : '#000',
                      fontSize: 14, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                      border: 'none', cursor: (!apiKey || !apiSecret) ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <Shield size={16} />
                    تحقق وحفظ
                  </motion.button>
                </IOSCard>
              )}

              {/* Step 3: Verification */}
              {step === 2 && (
                <IOSCard highlight>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
                    {verifying ? (
                      <>
                        <Loader2 size={40} className="animate-spin" color={c.accent} />
                        <p style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>جاري التحقق...</p>
                        <p style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>يتم التأكد من صحة المفاتيح وتشفيرها</p>
                      </>
                    ) : verified ? (
                      <>
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                          style={{
                            width: 64, height: 64, borderRadius: '50%',
                            background: `${c.success}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <CheckCircle size={36} color={c.success} />
                        </motion.div>
                        <p style={{ fontSize: 16, fontWeight: 800, color: c.success, fontFamily: "'Cairo', sans-serif" }}>تم الربط بنجاح!</p>
                        <p style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>
                          تم ربط حساب {selectedExchange?.nameAr} وحفظه بشكل مشفر
                        </p>
                      </>
                    ) : verifyError ? (
                      <>
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          style={{
                            width: 64, height: 64, borderRadius: '50%',
                            background: `${c.danger}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <AlertCircle size={36} color={c.danger} />
                        </motion.div>
                        <p style={{ fontSize: 16, fontWeight: 800, color: c.danger, fontFamily: "'Cairo', sans-serif" }}>فشل التحقق</p>
                        <p style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{verifyError}</p>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setStep(1)}
                          style={{
                            padding: '10px 24px', borderRadius: 14, background: c.accent,
                            color: '#000', fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                            border: 'none', cursor: 'pointer',
                          }}
                        >
                          إعادة المحاولة
                        </motion.button>
                      </>
                    ) : null}
                  </div>
                </IOSCard>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Exchange List (when not in flow) ── */}
      {!flowActive && (
        <>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={28} className="animate-spin" color={c.accent} />
            </div>
          ) : (
            <>
              {/* ── Info Banner ── */}
              <div style={{ margin: '0 20px 16px', padding: '14px 16px', borderRadius: 18, background: 'rgba(0,212,255,0.06)', border: '0.5px solid rgba(0,212,255,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Shield size={18} color={c.accent} />
                <p style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", flex: 1 }}>
                  مفاتيح API مشفرة بـ AES-256-GCM وتُستخدم فقط للقراءة. المفاتيح ذات صلاحيات السحب تُرفض.
                </p>
              </div>

              {/* ── Active Credentials ── */}
              {credentials.length > 0 && (
                <div style={{ margin: '0 20px 16px' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif", marginBottom: 10, paddingRight: 4 }}>
                    المفاتيح النشطة ({credentials.length})
                  </p>
                  {credentials.map((cred) => {
                    const exInfo = EXCHANGES.find(e => e.id === cred.exchange)
                    return (
                      <IOSCard key={cred.id} highlight={cred.isValid}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 44, height: 44, borderRadius: 14,
                            background: `${exInfo?.color || c.accent}15`,
                            border: `0.5px solid ${exInfo?.color || c.accent}25`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, fontWeight: 900, color: exInfo?.color || c.accent,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {(exInfo?.name || cred.exchange)[0]}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <p style={{ fontSize: 14, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{cred.label}</p>
                              {cred.isValid ? (
                                <CheckCircle size={13} color={c.success} />
                              ) : (
                                <AlertCircle size={13} color={c.danger} />
                              )}
                            </div>
                            <p style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
                              {exInfo?.nameAr || cred.exchange} • {cred.isValid ? 'صالح' : 'غير صالح'}
                            </p>
                          </div>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(cred.id)}
                            disabled={deleting === cred.id}
                            style={{
                              width: 36, height: 36, borderRadius: 12,
                              background: `${c.danger}10`, border: `0.5px solid ${c.danger}25`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: deleting === cred.id ? 'wait' : 'pointer',
                            }}
                          >
                            {deleting === cred.id ? (
                              <Loader2 size={14} className="animate-spin" color={c.danger} />
                            ) : (
                              <Trash2 size={14} color={c.danger} />
                            )}
                          </motion.button>
                        </div>
                      </IOSCard>
                    )
                  })}
                </div>
              )}

              {/* ── Available Exchanges ── */}
              <div style={{ margin: '0 20px 16px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif", marginBottom: 10, paddingRight: 4 }}>
                  المنصات المتاحة
                </p>
                {EXCHANGES.map((exchange, i) => {
                  const isLinked = linkedExchanges[exchange.id] || false
                  return (
                    <motion.div
                      key={exchange.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      <IOSCard highlight={isLinked}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{
                            width: 52, height: 52, borderRadius: 16,
                            background: `${exchange.color}15`, border: `0.5px solid ${exchange.color}25`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, fontWeight: 900, color: exchange.color,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {exchange.name[0]}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <p style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{exchange.nameAr}</p>
                              {isLinked && <CheckCircle size={14} color={c.success} />}
                            </div>
                            <p style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>{exchange.desc}</p>
                          </div>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => startFlow(exchange)}
                            style={{
                              padding: '8px 14px', borderRadius: 14,
                              background: isLinked ? `${c.success}15` : `${c.accent}15`,
                              border: `0.5px solid ${isLinked ? `${c.success}30` : `${c.accent}30`}`,
                              color: isLinked ? c.success : c.accent,
                              fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                              cursor: 'pointer',
                            }}
                          >
                            {isLinked ? 'ربط آخر' : 'ربط'}
                          </motion.button>
                        </div>
                      </IOSCard>
                    </motion.div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
