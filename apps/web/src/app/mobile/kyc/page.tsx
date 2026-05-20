'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { ensureAuth } from '@/lib/api-fetch'
import {
  Link2, Plus, Trash2, CheckCircle, AlertCircle, Loader2,
  Eye, EyeOff, Shield, ExternalLink, Building2
} from 'lucide-react'

type Credential = {
  id: string
  credentialId?: string
  exchange: string
  label?: string
  isTestnet?: boolean
  createdAt?: string
  lastSyncedAt?: string
  error?: string
}

export default function MobileKycPage() {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formExchange, setFormExchange] = useState('alpaca')
  const [formLabel, setFormLabel] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formApiSecret, setFormApiSecret] = useState('')
  const [formIsPaper, setFormIsPaper] = useState(true)
  const [showSecret, setShowSecret] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const fetchCredentials = useCallback(async () => {
    setLoading(true)
    try {
      await ensureAuth()
      const res = await fetch('/api/portfolio/credentials')
      if (res.ok) {
        const data = await res.json()
        setCredentials(data.data || data.credentials || [])
      }
    } catch { /* */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCredentials() }, [fetchCredentials])

  const handleSubmit = async () => {
    if (!formApiKey.trim() || !formApiSecret.trim()) {
      setSubmitResult({ ok: false, msg: 'يرجى إدخال مفتاح API والسر' })
      return
    }
    setSubmitting(true)
    setSubmitResult(null)
    try {
      await ensureAuth()
      const res = await fetch('/api/portfolio/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: formExchange,
          label: formLabel || undefined,
          apiKey: formApiKey,
          apiSecret: formApiSecret,
          isPaper: formIsPaper,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubmitResult({ ok: true, msg: 'تم ربط الحساب بنجاح!' })
        setShowForm(false)
        setFormApiKey('')
        setFormApiSecret('')
        setFormLabel('')
        fetchCredentials()
      } else {
        setSubmitResult({ ok: false, msg: data.error || 'فشل في ربط الحساب' })
      }
    } catch {
      setSubmitResult({ ok: false, msg: 'خطأ في الاتصال' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await ensureAuth()
      const res = await fetch(`/api/portfolio/credentials?id=${id}`, { method: 'DELETE' })
      if (res.ok) fetchCredentials()
    } catch { /* */ }
  }

  return (
    <div className="r-page">
      <PageHeader title="ربط الحسابات" subtitle="اربط حسابات البورصة" />

      {/* Existing Credentials */}
      {loading ? (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Loader2 size={20} className="r-anim-spin" color="#00D4FF" />
          </div>
        </Card>
      ) : credentials.length > 0 ? (
        credentials.map((cred, i) => (
          <Card key={cred.id || i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Building2 size={18} color="#00D4FF" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>
                    {cred.exchange || 'بورصة'}
                  </span>
                  {cred.isTestnet && (
                    <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: 'rgba(255,184,0,0.1)', color: '#FFB800', border: '0.5px solid rgba(255,184,0,0.2)', fontFamily: 'var(--font-cairo)' }}>تجريبي</span>
                  )}
                </div>
                {cred.label && <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>{cred.label}</div>}
              </div>
              <button
                onClick={() => handleDelete(cred.id || cred.credentialId || '')}
                style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,69,58,0.06)', border: '0.5px solid rgba(255,69,58,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', touchAction: 'manipulation' }}
              >
                <Trash2 size={14} color="#FF4757" />
              </button>
            </div>
            {cred.error && (
              <div style={{ marginTop: 6, padding: '4px 8px', borderRadius: 6, background: 'rgba(255,69,58,0.06)', border: '0.5px solid rgba(255,69,58,0.15)' }}>
                <span style={{ fontSize: 9, color: '#FF4757', fontFamily: 'var(--font-cairo)' }}>{cred.error}</span>
              </div>
            )}
          </Card>
        ))
      ) : (
        <Card>
          <div className="r-empty">
            <Link2 size={32} color="#8B92A8" />
            <div className="r-empty__title">لا توجد حسابات مرتبطة</div>
          </div>
        </Card>
      )}

      {/* Add New Credential */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '12px 0', borderRadius: 12, border: '1px dashed rgba(0,212,255,0.3)',
            background: 'rgba(0,212,255,0.04)', cursor: 'pointer', touchAction: 'manipulation',
            margin: '0 var(--space-lg)', boxSizing: 'border-box',
          }}
        >
          <Plus size={16} color="#00D4FF" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#00D4FF', fontFamily: 'var(--font-cairo)' }}>ربط حساب جديد</span>
        </button>
      ) : (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>حساب جديد</span>
            <button onClick={() => setShowForm(false)} style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <span style={{ fontSize: 14, color: '#8B92A8' }}>✕</span>
            </button>
          </div>

          {/* Exchange Selector */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>البورصة</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {['alpaca', 'binance'].map(ex => (
                <button key={ex} onClick={() => setFormExchange(ex)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${formExchange === ex ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  background: formExchange === ex ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer', touchAction: 'manipulation',
                }}>
                  <span style={{ fontSize: 10, fontWeight: formExchange === ex ? 800 : 600, color: formExchange === ex ? '#00D4FF' : '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
                    {ex === 'alpaca' ? 'Alpaca' : 'Binance'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Label */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>تسمية (اختياري)</label>
            <input value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="مثال: حسابي الرئيسي" style={{ width: '100%', height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', padding: '0 12px', color: '#FFF', fontSize: 12, fontFamily: 'var(--font-cairo)', outline: 'none', direction: 'rtl', boxSizing: 'border-box' }} />
          </div>

          {/* API Key */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>مفتاح API</label>
            <input value={formApiKey} onChange={e => setFormApiKey(e.target.value)} placeholder="PK..." style={{ width: '100%', height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', padding: '0 12px', color: '#FFF', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', direction: 'ltr', boxSizing: 'border-box' }} />
          </div>

          {/* API Secret */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>السر</label>
            <div style={{ position: 'relative' }}>
              <input value={formApiSecret} onChange={e => setFormApiSecret(e.target.value)} type={showSecret ? 'text' : 'password'} placeholder="أدخل السر..." style={{ width: '100%', height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', padding: '0 36px 0 12px', color: '#FFF', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', direction: 'ltr', boxSizing: 'border-box' }} />
              <button onClick={() => setShowSecret(!showSecret)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                {showSecret ? <EyeOff size={14} color="#8B92A8" /> : <Eye size={14} color="#8B92A8" />}
              </button>
            </div>
          </div>

          {/* Paper Trading Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={14} color="#FFB800" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>حساب ورقي (تجريبي)</span>
            </div>
            <button
              onClick={() => setFormIsPaper(!formIsPaper)}
              style={{
                width: 42, height: 24, borderRadius: 12, position: 'relative', border: 'none',
                background: formIsPaper ? '#00D4FF' : 'rgba(255,255,255,0.1)', cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              <div style={{ position: 'absolute', top: 2, insetInlineStart: formIsPaper ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#FFF', transition: 'inset-inline-start 0.2s' }} />
            </button>
          </div>

          {/* Submit Result */}
          {submitResult && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: submitResult.ok ? 'rgba(0,255,163,0.08)' : 'rgba(255,69,58,0.08)', border: `0.5px solid ${submitResult.ok ? 'rgba(0,255,163,0.2)' : 'rgba(255,69,58,0.2)'}`, marginBottom: 8 }}>
              {submitResult.ok ? <CheckCircle size={14} color="#00FFA3" /> : <AlertCircle size={14} color="#FF4757" />}
              <span style={{ fontSize: 10, color: submitResult.ok ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-cairo)', fontWeight: 600 }}>{submitResult.msg}</span>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="r-trade-btn r-trade-btn--buy"
            style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-cairo)' }}
          >
            {submitting ? <Loader2 size={16} className="r-anim-spin" /> : <Link2 size={14} />}
            {submitting ? 'جارٍ الربط...' : 'ربط الحساب'}
          </button>
        </Card>
      )}

      {/* Security Notice */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Shield size={18} color="#d4af37" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', lineHeight: 1.6 }}>
            مفاتيح API مشفرة ومخزنة بأمان. نستخدم صلاحيات القراءة والتداول فقط — لا يمكن سحب الأموال. أموالك تبقى في بورصتك.
          </div>
        </div>
      </Card>

      <div style={{ height: 80 }} />
    </div>
  )
}
