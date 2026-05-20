'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header, Card, Switch, SkelCard } from '@/components/mobile/FluxComponents'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { Key, Plus, Trash2, CheckCircle, XCircle, Loader2, Eye, EyeOff, Shield, AlertTriangle } from 'lucide-react'

/* ═══ Types ═══ */
interface Credential {
  id: string
  exchange: string
  label?: string
  isValid: boolean
  isTestnet?: boolean
  keyType?: string
  createdAt?: string
  lastValidatedAt?: string
}

const EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'kucoin', label: 'KuCoin' },
  { value: 'okx', label: 'OKX' },
  { value: 'bybit', label: 'Bybit' },
  { value: 'alpaca', label: 'Alpaca' },
]

/* ═══ Credential Card ═══ */
function CredentialCard({ cred, onDelete, onTest, testing }: {
  cred: Credential; onDelete: (id: string) => void; onTest: (id: string) => void; testing: string | null
}) {
  const exchangeLabel = EXCHANGES.find(e => e.value === cred.exchange)?.label ?? cred.exchange
  const isTesting = testing === cred.id

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12, flexShrink: 0,
            background: cred.isValid ? 'rgba(0,255,163,0.08)' : 'rgba(255,71,87,0.08)',
            border: `0.5px solid ${cred.isValid ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Key size={18} color={cred.isValid ? '#00FFA3' : '#FF4757'} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>
              {cred.label || exchangeLabel}
            </div>
            <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>
              {exchangeLabel}{cred.isTestnet ? ' — شبكة تجريبية' : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {cred.isValid ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(0,255,163,0.08)', border: '0.5px solid rgba(0,255,163,0.15)' }}>
              <CheckCircle size={10} color="#00FFA3" />
              <span style={{ fontSize: 9, fontWeight: 800, color: '#00FFA3', fontFamily: 'var(--f-cairo)' }}>صالح</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,71,87,0.08)', border: '0.5px solid rgba(255,71,87,0.15)' }}>
              <XCircle size={10} color="#FF4757" />
              <span style={{ fontSize: 9, fontWeight: 800, color: '#FF4757', fontFamily: 'var(--f-cairo)' }}>غير صالح</span>
            </div>
          )}
        </div>
      </div>

      {/* ID preview */}
      <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)', marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)', marginBottom: 2 }}>المعرف</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--f-mono)', direction: 'ltr', textAlign: 'left' }}>
          {cred.id.slice(0, 12)}...{cred.id.slice(-6)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onTest(cred.id)}
          disabled={isTesting}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: '0.5px solid rgba(0,212,255,0.2)',
            background: 'rgba(0,212,255,0.06)', color: '#00D4FF', fontSize: 10, fontWeight: 800,
            fontFamily: 'var(--f-cairo)', cursor: isTesting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          {isTesting ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Shield size={12} />}
          {isTesting ? 'جارٍ الفحص...' : 'فحص الاتصال'}
        </button>
        <button
          onClick={() => onDelete(cred.id)}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '0.5px solid rgba(255,71,87,0.2)',
            background: 'rgba(255,71,87,0.06)', color: '#FF4757', fontSize: 10, fontWeight: 800,
            fontFamily: 'var(--f-cairo)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <Trash2 size={12} />
          حذف
        </button>
      </div>
    </Card>
  )
}

/* ═══ Add Credential Form ═══ */
function AddCredentialForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [exchange, setExchange] = useState('binance')
  const [apiKey, setApiKey] = useState('')
  const [secret, setSecret] = useState('')
  const [label, setLabel] = useState('')
  const [isTestnet, setIsTestnet] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const addNotification = useNotificationStore(s => s.addNotification)

  const handleSubmit = useCallback(async () => {
    if (!apiKey.trim() || !secret.trim()) {
      setError('مفتاح API والسر مطلوبان')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchange, apiKey, secret, label: label || undefined, isTestnet }),
      })
      const data = await res.json()
      if (data.success || res.ok) {
        addNotification({ source: 'system', priority: 'medium', action: 'INFO', title: 'تمت الإضافة', body: `تم ربط حساب ${EXCHANGES.find(e => e.value === exchange)?.label ?? exchange} بنجاح` })
        setApiKey('')
        setSecret('')
        setLabel('')
        setIsTestnet(false)
        setOpen(false)
        onAdded()
      } else {
        setError(data.message || data.error || 'فشل في إضافة البيانات')
      }
    } catch (e: any) {
      setError(e.message || 'خطأ في الاتصال')
    } finally {
      setSubmitting(false)
    }
  }, [exchange, apiKey, secret, label, isTestnet, onAdded, addNotification])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          margin: '0 var(--s4) var(--s3)', padding: '12px 0', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(0,255,163,0.06))',
          border: '0.5px solid rgba(0,212,255,0.15)', color: '#00D4FF',
          fontSize: 12, fontWeight: 800, fontFamily: 'var(--f-cairo)', cursor: 'pointer', width: 'calc(100% - var(--s4) * 2)',
        }}
      >
        <Plus size={16} />
        إضافة مفتاح API جديد
      </button>
    )
  }

  return (
    <Card highlight>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>إضافة مفتاح API</div>
        <button onClick={() => { setOpen(false); setError(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <XCircle size={18} color="rgba(255,255,255,0.4)" />
        </button>
      </div>

      {/* Exchange select */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--f-cairo)', marginBottom: 4 }}>البورصة</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {EXCHANGES.map(ex => (
            <button
              key={ex.value}
              onClick={() => setExchange(ex.value)}
              style={{
                padding: '5px 10px', borderRadius: 8, border: `0.5px solid ${exchange === ex.value ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                background: exchange === ex.value ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.02)',
                color: exchange === ex.value ? '#00D4FF' : '#8B92A8',
                fontSize: 10, fontWeight: 800, fontFamily: 'var(--f-cairo)', cursor: 'pointer',
              }}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Label */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--f-cairo)', marginBottom: 4 }}>تسمية (اختياري)</div>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="مثال: حساب Binance الرئيسي"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)',
            color: '#FFF', fontSize: 11, fontFamily: 'var(--f-cairo)', direction: 'rtl',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* API Key */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--f-cairo)', marginBottom: 4 }}>مفتاح API</div>
        <input
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="أدخل مفتاح API"
          dir="ltr"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)',
            color: '#FFF', fontSize: 11, fontFamily: 'var(--f-mono)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Secret */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--f-cairo)', marginBottom: 4 }}>السر (Secret)</div>
        <div style={{ position: 'relative' }}>
          <input
            value={secret}
            onChange={e => setSecret(e.target.value)}
            placeholder="أدخل المفتاح السري"
            type={showSecret ? 'text' : 'password'}
            dir="ltr"
            style={{
              width: '100%', padding: '8px 36px 8px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)',
              color: '#FFF', fontSize: 11, fontFamily: 'var(--f-mono)',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={() => setShowSecret(!showSecret)}
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            {showSecret ? <EyeOff size={14} color="rgba(255,255,255,0.4)" /> : <Eye size={14} color="rgba(255,255,255,0.4)" />}
          </button>
        </div>
      </div>

      {/* Testnet toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>شبكة تجريبية (Testnet)</div>
          <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>استخدام خوادم الاختبار بدلاً من الحقيقية</div>
        </div>
        <Switch value={isTestnet} onChange={setIsTestnet} color="#FFB800" />
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,71,87,0.08)', border: '0.5px solid rgba(255,71,87,0.15)', marginBottom: 10 }}>
          <AlertTriangle size={12} color="#FF4757" />
          <span style={{ fontSize: 10, color: '#FF4757', fontFamily: 'var(--f-cairo)' }}>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: '100%', padding: '10px 0', borderRadius: 10,
          background: submitting ? 'rgba(0,212,255,0.3)' : 'linear-gradient(135deg, #00D4FF, #00FFA3)',
          border: 'none', color: submitting ? 'rgba(255,255,255,0.5)' : '#000',
          fontSize: 12, fontWeight: 900, fontFamily: 'var(--f-cairo)', cursor: submitting ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {submitting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
        {submitting ? 'جارٍ الإضافة...' : 'إضافة المفتاح'}
      </button>
    </Card>
  )
}

/* ═══ Main Page ═══ */
export default function KYCPage() {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)
  const addNotification = useNotificationStore(s => s.addNotification)

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/credentials')
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setCredentials(data.data)
        } else if (Array.isArray(data.data)) {
          setCredentials(data.data)
        }
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCredentials() }, [fetchCredentials])

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/portfolio/credentials/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCredentials(prev => prev.filter(c => c.id !== id))
        addNotification({ source: 'system', priority: 'medium', action: 'INFO', title: 'تم الحذف', body: 'تم حذف مفتاح API بنجاح' })
      } else {
        addNotification({ source: 'system', priority: 'high', action: 'WARN', title: 'فشل الحذف', body: 'لم يتم حذف مفتاح API' })
      }
    } catch {
      addNotification({ source: 'system', priority: 'high', action: 'WARN', title: 'خطأ', body: 'خطأ في الاتصال أثناء الحذف' })
    }
  }, [addNotification])

  const handleTest = useCallback(async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch(`/api/portfolio/credentials/${id}/test`, { method: 'POST' })
      const data = await res.json()
      if (data.success || data.valid) {
        addNotification({ source: 'system', priority: 'medium', action: 'INFO', title: 'الاتصال ناجح', body: 'مفتاح API يعمل بشكل صحيح' })
        // Refresh to get updated validity status
        fetchCredentials()
      } else {
        addNotification({ source: 'system', priority: 'high', action: 'WARN', title: 'فشل الاتصال', body: data.message || data.error || 'مفتاح API غير صالح أو منتهي' })
      }
    } catch {
      addNotification({ source: 'system', priority: 'high', action: 'WARN', title: 'خطأ', body: 'لم يتم التحقق من الاتصال' })
    } finally {
      setTesting(null)
    }
  }, [addNotification, fetchCredentials])

  const validCount = credentials.filter(c => c.isValid).length
  const invalidCount = credentials.length - validCount

  return (
    <div className="f-page">
      <Header title="ربط الحسابات" subtitle="إدارة مفاتيح API" />

      {/* Summary */}
      {!loading && credentials.length > 0 && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{credentials.length}</div>
              <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>إجمالي</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#00FFA3', fontFamily: 'var(--f-mono)' }}>{validCount}</div>
              <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>صالح</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#FF4757', fontFamily: 'var(--f-mono)' }}>{invalidCount}</div>
              <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>غير صالح</div>
            </div>
          </div>
        </Card>
      )}

      {/* Add form */}
      <AddCredentialForm onAdded={fetchCredentials} />

      {/* Credentials list */}
      {loading ? (
        <>{[1, 2].map(i => <SkelCard key={i} lines={4} />)}</>
      ) : (
        <div className="f-stagger">
          {credentials.map(cred => (
            <CredentialCard key={cred.id} cred={cred} onDelete={handleDelete} onTest={handleTest} testing={testing} />
          ))}
        </div>
      )}

      {!loading && credentials.length === 0 && (
        <div className="f-empty">
          <Key size={40} color="rgba(255,255,255,0.1)" />
          <div className="f-empty__title">لا توجد مفاتيح API مربوطة</div>
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
