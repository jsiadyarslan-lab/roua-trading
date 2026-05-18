'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Key, Plus, Trash2, Shield, AlertTriangle, CheckCircle2, Loader2, Link2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800',
  purple: '#A78BFA', text: '#F0F2F5', text2: '#8B92A8',
  text3: '#8B92A8', border: 'rgba(255,255,255,0.06)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

interface Credential {
  id: string; exchange: string; label: string; permissions: string;
  isValid: boolean; lastValidatedAt: string | null; createdAt: string;
}

const SUPPORTED_EXCHANGES = [
  { id: 'binance', name: 'Binance', icon: '🔶' },
  { id: 'binance_test', name: 'Binance Spot Testnet', icon: '🧪' },
  { id: 'binance_future_test', name: 'Binance Futures Testnet', icon: '📈' },
  { id: 'kucoin', name: 'KuCoin', icon: '🟢', requiresPassphrase: false },
  { id: 'bybit', name: 'Bybit', icon: '🟠' },
  { id: 'okx', name: 'OKX', icon: '⚪', requiresPassphrase: true },
  { id: 'gateio', name: 'Gate.io', icon: '🔵' },
]

export default function MobileExchangeSettingsPage() {
  const router = useRouter()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [exchange, setExchange] = useState('binance')
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [passphrase, setPassphrase] = useState('')

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/credentials')
      if (res.ok) { const data = await res.json(); if (data.success) setCredentials(data.data) }
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCredentials() }, [fetchCredentials])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/portfolio/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchange, label: label || `${exchange}-key`, apiKey, apiSecret, passphrase: passphrase || undefined }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل في إضافة المفتاح')
      setSuccess('تم إضافة المفتاح بنجاح! ✅')
      setLabel(''); setApiKey(''); setApiSecret(''); setPassphrase('')
      setShowForm(false); fetchCredentials()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)) } finally { setSubmitting(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المفتاح؟')) return
    try { const res = await fetch(`/api/portfolio/credentials/${id}`, { method: 'DELETE' }); if (res.ok) setCredentials(prev => prev.filter(c => c.id !== id)) } catch {}
  }

  return (
    <div style={{ minHeight: '100%', background: '#0B0E14', direction: 'rtl', paddingBottom: 20 }}>
      {/* ─── Sticky Header ─── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 16px',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => router.back()} style={{
          width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.07)',
          border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowRight size={18} color="#FFFFFF" />
        </motion.button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #FFB800, #FF8C00)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Key size={16} color="#fff" />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>مفاتيح البورصات</h1>
        </div>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowForm(!showForm)} style={{
          padding: '8px 14px', borderRadius: 10, background: C.accent, border: 'none',
          color: '#000', fontSize: 11, fontWeight: 800, fontFamily: FONT_AR, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Plus size={14} /> إضافة
        </motion.button>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Security Notice */}
        <div style={{
          padding: '12px 14px', borderRadius: 14, marginBottom: 16,
          background: 'rgba(0,255,163,0.04)', border: '0.5px solid rgba(0,255,163,0.1)',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <Shield size={16} color={C.success} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: FONT_AR, marginBottom: 3 }}>مبدأ Non-Custodial</div>
            <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, lineHeight: 1.5 }}>
              رؤى لا تلمس أموالك أبداً. مفاتيح API مشفرة بـ AES-256-GCM وتُستخدم فقط للقراءة.
              <span style={{ color: C.danger, fontWeight: 600 }}> المفاتيح التي تحتوي على صلاحيات سحب تُرفض فوراً.</span>
            </p>
          </div>
        </div>

        {/* Add Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '16px', borderRadius: 18, background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <Link2 size={14} color={C.accent} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>إضافة مفتاح API جديد</span>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Exchange Selection */}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, display: 'block', marginBottom: 6 }}>البورصة</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                      {SUPPORTED_EXCHANGES.map(ex => (
                        <button key={ex.id} type="button" onClick={() => setExchange(ex.id)} style={{
                          padding: '8px 4px', borderRadius: 12, textAlign: 'center',
                          background: exchange === ex.id ? `${C.accent}12` : 'rgba(28,28,30,0.8)',
                          border: `0.5px solid ${exchange === ex.id ? `${C.accent}30` : C.border}`,
                          color: exchange === ex.id ? C.accent : C.text2, fontSize: 9, fontFamily: FONT_AR, cursor: 'pointer',
                        }}>
                          <span style={{ display: 'block', fontSize: 18, marginBottom: 2 }}>{ex.icon}</span>
                          {ex.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Label */}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, display: 'block', marginBottom: 4 }}>تسمية المفتاح (اختياري)</label>
                    <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder={`مثال: ${exchange}-main`} dir="ltr"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: `0.5px solid ${C.border}`, color: C.text, fontSize: 13, fontFamily: FONT_MONO, outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* API Key */}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, display: 'block', marginBottom: 4 }}>API Key</label>
                    <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="أدخل مفتاح API" dir="ltr" required
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: `0.5px solid ${C.border}`, color: C.text, fontSize: 13, fontFamily: FONT_MONO, outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* API Secret */}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, display: 'block', marginBottom: 4 }}>API Secret</label>
                    <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="أدخل المفتاح السري" dir="ltr" required
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: `0.5px solid ${C.border}`, color: C.text, fontSize: 13, fontFamily: FONT_MONO, outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* Passphrase */}
                  {SUPPORTED_EXCHANGES.find(e => e.id === exchange)?.requiresPassphrase && (
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, display: 'block', marginBottom: 4 }}>عبارة المرور (Passphrase)</label>
                      <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="أدخل عبارة المرور" dir="ltr" required
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: `0.5px solid ${C.border}`, color: C.text, fontSize: 13, fontFamily: FONT_MONO, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  )}

                  {/* Error/Success */}
                  {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: `${C.danger}10`, border: `0.5px solid ${C.danger}20` }}>
                      <AlertTriangle size={12} color={C.danger} />
                      <span style={{ fontSize: 10, color: C.danger, fontFamily: FONT_AR }}>{error}</span>
                    </div>
                  )}
                  {success && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: `${C.success}10`, border: `0.5px solid ${C.success}20` }}>
                      <CheckCircle2 size={12} color={C.success} />
                      <span style={{ fontSize: 10, color: C.success, fontFamily: FONT_AR }}>{success}</span>
                    </div>
                  )}

                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button whileTap={{ scale: 0.95 }} type="submit" disabled={submitting || !apiKey || !apiSecret} style={{
                      flex: 1, padding: '12px', borderRadius: 12, background: C.success, border: 'none',
                      color: '#000', fontSize: 13, fontWeight: 800, fontFamily: FONT_AR, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: submitting || !apiKey || !apiSecret ? 0.5 : 1,
                    }}>
                      {submitting ? <><Loader2 size={14} className="animate-spin" /> جارٍ التحقق...</> : <><Shield size={14} /> إضافة وتحقق</>}
                    </motion.button>
                    <button type="button" onClick={() => { setShowForm(false); setError(''); setSuccess('') }} style={{
                      padding: '12px 20px', borderRadius: 12, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`,
                      color: C.text2, fontSize: 13, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer',
                    }}>إلغاء</button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Credentials List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Loader2 size={24} color={C.accent} className="animate-spin" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 12, color: C.text2, fontFamily: FONT_AR }}>جارٍ التحميل...</p>
          </div>
        ) : credentials.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, borderRadius: 18, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}` }}>
            <Key size={36} color="rgba(255,255,255,0.08)" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT_AR, marginBottom: 4 }}>لا توجد مفاتيح بعد</p>
            <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR, marginBottom: 12 }}>أضف مفتاح API لربط حساب البورصة</p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowForm(true)} style={{
              padding: '10px 20px', borderRadius: 12, background: `${C.accent}15`, border: `0.5px solid ${C.accent}30`,
              color: C.accent, fontSize: 12, fontWeight: 800, fontFamily: FONT_AR, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, margin: '0 auto',
            }}>
              <Plus size={14} /> إضافة مفتاح أول
            </motion.button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {credentials.map(cred => {
              const exInfo = SUPPORTED_EXCHANGES.find(e => e.id === cred.exchange)
              const permissions = JSON.parse(cred.permissions || '[]')
              return (
                <motion.div key={cred.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                  style={{
                    padding: '14px', borderRadius: 16, background: 'rgba(28,28,30,0.6)',
                    border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{exInfo?.icon || '💱'}</span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>{cred.label}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`, color: C.text2, fontFamily: FONT_AR }}>{exInfo?.name || cred.exchange}</span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: cred.isValid ? `${C.success}15` : `${C.danger}15`, border: `0.5px solid ${cred.isValid ? `${C.success}25` : `${C.danger}25`}`, color: cred.isValid ? C.success : C.danger, fontWeight: 700, fontFamily: FONT_AR }}>
                          {cred.isValid ? '✓ صالح' : '✗ غير صالح'}
                        </span>
                        {permissions.map((p: string) => (
                          <span key={p} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, background: 'rgba(255,255,255,0.02)', color: C.text3, fontFamily: FONT_AR }}>{p}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleDelete(cred.id)} style={{
                    width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.text3,
                  }}>
                    <Trash2 size={14} />
                  </motion.button>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
