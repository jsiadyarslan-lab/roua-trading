'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Key, Plus, Trash2, Shield, AlertTriangle, CheckCircle2,
  XCircle, Loader2, ChevronLeft, Eye, EyeOff, Link2,
  RefreshCw,
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

/* ─── Types ─── */
interface Credential {
  id: string
  exchange: string
  label: string
  permissions: string
  isValid: boolean
  lastValidatedAt: string | null
  createdAt: string
  testnet?: boolean
}

const EXCHANGE_META: Record<string, { name: string; icon: string }> = {
  binance: { name: 'Binance', icon: '🔶' },
  binance_test: { name: 'Binance Testnet', icon: '🧪' },
  binance_future_test: { name: 'Binance Futures Testnet', icon: '📈' },
  kucoin: { name: 'KuCoin', icon: '🟢' },
  bybit: { name: 'Bybit', icon: '🟠' },
  okx: { name: 'OKX', icon: '⚪' },
  gateio: { name: 'Gate.io', icon: '🔵' },
}

/* ─── Exchange API Key Management Page ─── */
export default function MobileExchangePage() {
  const router = useRouter()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [togglingTestnet, setTogglingTestnet] = useState<string | null>(null)

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/credentials')
      if (res.ok) {
        const data = await res.json()
        if (data.success) setCredentials(data.data || [])
      }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCredentials() }, [fetchCredentials])

  /* Delete credential */
  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/portfolio/credentials/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCredentials(prev => prev.filter(c => c.id !== id))
        setShowDeleteConfirm(null)
      }
    } catch { /* silent */ } finally {
      setDeleting(null)
    }
  }

  /* Toggle testnet */
  const handleToggleTestnet = async (id: string, currentTestnet: boolean) => {
    setTogglingTestnet(id)
    try {
      const res = await fetch(`/api/portfolio/credentials/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testnet: !currentTestnet }),
      })
      if (res.ok) {
        setCredentials(prev => prev.map(c =>
          c.id === id ? { ...c, testnet: !currentTestnet } : c
        ))
      }
    } catch { /* silent */ } finally {
      setTogglingTestnet(null)
    }
  }

  /* Format date */
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('ar-SA', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    } catch { return dateStr }
  }

  return (
    <div className="m-page">
      <MobilePageHeader
        title="مفاتيح البورصات"
        subtitle="إدارة مفاتيح API"
        right={
          <button
            onClick={() => router.push('/mobile/kyc')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 8,
              background: `linear-gradient(135deg, ${C.accent}, #00A8CC)`,
              border: 'none', color: '#000', fontSize: 10, fontWeight: 800,
              fontFamily: FONT_AR, cursor: 'pointer',
            }}
          >
            <Plus size={11} />
            إضافة
          </button>
        }
      />

      {/* Security Notice */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{
          padding: '10px 12px', borderRadius: 12,
          background: `${C.success}06`, border: `0.5px solid ${C.success}12`,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <Shield size={13} color={C.success} style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR, lineHeight: 1.7 }}>
            رؤى لا تلمس أموالك. المفاتيح مشفرة بـ AES-256-GCM.
            <span style={{ color: C.danger, fontWeight: 700 }}> صلاحيات السحب تُرفض.</span>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
            <Loader2 size={16} color={C.accent} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, color: C.text2, fontFamily: FONT_AR }}>جارٍ التحميل...</span>
          </div>
        </IOSCard>
      ) : credentials.length === 0 ? (
        /* Empty state */
        <IOSCard>
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Key size={32} color={C.text2} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT_AR, marginBottom: 4 }}>
              لا توجد مفاتيح بعد
            </div>
            <div style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR, marginBottom: 16 }}>
              أضف مفتاح API لربط حساب البورصة
            </div>
            <button
              onClick={() => router.push('/mobile/kyc')}
              style={{
                padding: '8px 20px', borderRadius: 10,
                background: `linear-gradient(135deg, ${C.accent}, #00A8CC)`,
                border: 'none', color: '#000', fontSize: 11, fontWeight: 800,
                fontFamily: FONT_AR, cursor: 'pointer',
              }}
            >
              <Link2 size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
              ربط حساب
            </button>
          </div>
        </IOSCard>
      ) : (
        /* Credentials List */
        credentials.map((cred, i) => {
          const meta = EXCHANGE_META[cred.exchange] || { name: cred.exchange, icon: '💱' }
          const permissions = (() => { try { return JSON.parse(cred.permissions || '[]') } catch { return [] } })()
          const isDeleting = deleting === cred.id
          const isToggling = togglingTestnet === cred.id

          return (
            <motion.div
              key={cred.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <IOSCard>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{meta.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                        {meta.name}
                      </div>
                      <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, direction: 'ltr', unicodeBidi: 'embed' }}>
                        {cred.label}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {cred.isValid ? (
                      <div style={{
                        padding: '3px 8px', borderRadius: 6,
                        background: `${C.success}10`, border: `0.5px solid ${C.success}20`,
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                        <CheckCircle2 size={10} color={C.success} />
                        <span style={{ fontSize: 8, fontWeight: 700, color: C.success, fontFamily: FONT_AR }}>صالح</span>
                      </div>
                    ) : (
                      <div style={{
                        padding: '3px 8px', borderRadius: 6,
                        background: `${C.danger}10`, border: `0.5px solid ${C.danger}20`,
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                        <XCircle size={10} color={C.danger} />
                        <span style={{ fontSize: 8, fontWeight: 700, color: C.danger, fontFamily: FONT_AR }}>غير صالح</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div style={{
                  padding: '8px 10px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}`,
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 8, color: C.text2, fontFamily: FONT_AR }}>تاريخ الإنشاء</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: FONT_AR, direction: 'ltr', unicodeBidi: 'embed' }}>
                        {formatDate(cred.createdAt)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: C.text2, fontFamily: FONT_AR }}>آخر تحقق</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: FONT_AR, direction: 'ltr', unicodeBidi: 'embed' }}>
                        {formatDate(cred.lastValidatedAt)}
                      </div>
                    </div>
                  </div>
                  {permissions.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {permissions.map((p: string) => (
                        <span key={p} style={{
                          fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.04)', color: C.text2,
                          border: `0.5px solid ${C.border}`, fontFamily: FONT_MONO,
                        }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {/* Testnet toggle */}
                  {cred.exchange.includes('binance') && (
                    <button
                      onClick={() => handleToggleTestnet(cred.id, !!cred.testnet)}
                      disabled={isToggling}
                      style={{
                        flex: 1, padding: 8, borderRadius: 8,
                        background: cred.testnet ? `${C.accent}10` : 'rgba(255,255,255,0.03)',
                        border: `0.5px solid ${cred.testnet ? `${C.accent}20` : C.border}`,
                        color: cred.testnet ? C.accent : C.text2,
                        fontSize: 9, fontWeight: 700, fontFamily: FONT_AR,
                        cursor: isToggling ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}
                    >
                      {isToggling ? (
                        <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <>
                          {cred.testnet ? '🌐' : '🧪'}
                          {cred.testnet ? 'Mainnet' : 'Testnet'}
                        </>
                      )}
                    </button>
                  )}

                  {/* Delete */}
                  {showDeleteConfirm === cred.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(cred.id)}
                        disabled={isDeleting}
                        style={{
                          flex: 1, padding: 8, borderRadius: 8,
                          background: `${C.danger}12`, border: `0.5px solid ${C.danger}25`,
                          color: C.danger, fontSize: 9, fontWeight: 800, fontFamily: FONT_AR,
                          cursor: isDeleting ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}
                      >
                        {isDeleting ? (
                          <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <>
                            <AlertTriangle size={10} />
                            تأكيد الحذف
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(null)}
                        style={{
                          flex: 0.5, padding: 8, borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${C.border}`,
                          color: C.text2, fontSize: 9, fontWeight: 700, fontFamily: FONT_AR,
                          cursor: 'pointer',
                        }}
                      >
                        إلغاء
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(cred.id)}
                      style={{
                        flex: 1, padding: 8, borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${C.border}`,
                        color: C.danger, fontSize: 9, fontWeight: 700, fontFamily: FONT_AR,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}
                    >
                      <Trash2 size={10} />
                      حذف
                    </button>
                  )}
                </div>
              </IOSCard>
            </motion.div>
          )
        })
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}
