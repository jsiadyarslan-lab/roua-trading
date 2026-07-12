'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'
import {
  Wifi, WifiOff, Copy, Plus, Trash2, Key, RefreshCw,
  CheckCircle2, AlertTriangle, Loader2, ExternalLink, Eye, EyeOff,
  Cpu, Activity, Clock, Shield
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import T from '@/lib/unified-tokens'

interface EATokenInfo {
  id: string
  token: string
  label: string
  mt5AccountNumber?: string
  mt5Server?: string
  isActive: boolean
  lastHeartbeatAt?: string
  createdAt: string
}

interface EAStatus {
  online: boolean
  lastHeartbeat?: {
    mt5AccountNumber?: string
    balance?: number
    equity?: number
    openPositions?: number
    receivedAt?: string
  }
}

export default function EABridgePage() {
  const { user } = useAuth()
  const t = useTranslations('common')

  const [tokens, setTokens] = useState<EATokenInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showToken, setShowToken] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [eaStatus, setEaStatus] = useState<Record<string, EAStatus>>({})
  const [newLabel, setNewLabel] = useState('MT5 EA')
  const [newAccount, setNewAccount] = useState('')
  const [error, setError] = useState('')

  const apiUrl = typeof window !== 'undefined' ? window.location.origin : ''

  // جلب التوكنات
  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/ea-bridge/list-tokens', {
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          setTokens(Array.isArray(data.data) ? data.data : [])
        }
      }
    } catch {
      // التوكنات قد لا تكون متاحة بعد
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  // جلب حالة EA لكل توكن
  const fetchStatus = useCallback(async () => {
    for (const token of tokens) {
      try {
        const res = await fetch('/api/ea-bridge/status', {
          headers: { 'X-EA-Token': token.token },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data) {
            setEaStatus(prev => ({ ...prev, [token.id]: data.data }))
          }
        }
      } catch {
        // تجاهل
      }
    }
  }, [tokens])

  useEffect(() => {
    if (tokens.length > 0) fetchStatus()
  }, [tokens, fetchStatus])

  // إنشاء توكن جديد
  const generateToken = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/ea-bridge/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel || 'MT5 EA',
          mt5AccountNumber: newAccount || undefined,
        }),
      })
      const data = await res.json()
      if (data.success && data.data?.token) {
        // إعادة جلب القائمة بدلاً من الإضافة اليدوية
        await fetchTokens()
        setNewLabel('MT5 EA')
        setNewAccount('')
      } else {
        setError(data.error || data.message || 'فشل في إنشاء التوكن')
      }
    } catch {
      setError('خطأ في الاتصال بالخادم')
    } finally {
      setGenerating(false)
    }
  }

  // حذف/تعطيل توكن
  const revokeToken = async (tokenId: string) => {
    try {
      await fetch('/api/ea-bridge/revoke-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId }),
      })
      setTokens(prev => prev.filter(t => t.id !== tokenId))
    } catch {
      // تجاهل
    }
  }

  // نسخ التوكن
  const copyToken = (token: string, id: string) => {
    navigator.clipboard.writeText(token)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  // تنسيق التاريخ
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <SubPageLayout
      title="EA Bridge — MetaTrader 5"
      icon={<Cpu size={16} color="#fff" />}
      iconBg="linear-gradient(135deg, #10b981, #06b6d4)"
      backPath="/dashboard/settings"
    >
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ─── شرح ─── */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 16, padding: 24,
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Cpu size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                ربط MetaTrader 5 مع رؤى
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                EA يتلقى توصيات المجلس الذكي وينفذها مباشرة — بدون MetaAPI
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { icon: '💰', text: 'توفير تكلفة MetaAPI' },
              { icon: '⚡', text: 'تنفيذ أسرع (محلي)' },
              { icon: '🛡️', text: 'SL/TP محلي فوري' },
              { icon: '🔒', text: 'عزل طبيعي لكل مستخدم' },
            ].map(item => (
              <div key={item.text} style={{
                background: 'var(--bg-input)', borderRadius: 10, padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600,
              }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>
        </div>

        {/* ─── إنشاء توكن ─── */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 16, padding: 24,
          border: '1px solid var(--border)',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={16} style={{ color: 'var(--accent)' }} />
            إنشاء توكن جديد
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                اسم التعريف
              </label>
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="مثال: MT5 Demo"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  color: 'var(--text-main)', fontSize: 13, outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                رقم حساب MT5 (اختياري)
              </label>
              <input
                value={newAccount}
                onChange={e => setNewAccount(e.target.value)}
                placeholder="مثال: 12345678"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  color: 'var(--text-main)', fontSize: 13, outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: T.loss, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} />
                {error}
              </div>
            )}

            <button
              onClick={generateToken}
              disabled={generating}
              style={{
                padding: '12px 24px', borderRadius: 12,
                background: generating ? 'var(--bg-input)' : 'linear-gradient(135deg, #10b981, #06b6d4)',
                color: generating ? 'var(--text-muted)' : '#fff',
                border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {generating ? 'جاري الإنشاء...' : 'إنشاء توكن'}
            </button>
          </div>
        </div>

        {/* ─── قائمة التوكنات ─── */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 16, padding: 24,
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={16} style={{ color: 'var(--accent)' }} />
              التوكنات النشطة
            </h3>
            <button
              onClick={fetchTokens}
              style={{
                padding: '6px 12px', borderRadius: 8,
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11,
                display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
              }}
            >
              <RefreshCw size={12} />
              تحديث
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontSize: 12 }}>جاري التحميل...</div>
            </div>
          ) : tokens.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
              <Key size={32} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>لا توجد توكنات بعد</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>أنشئ توكن أعلاه لربط MT5 مع رؤى</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tokens.map(token => {
                const status = eaStatus[token.id]
                const isOnline = status?.online === true
                const isRevealed = showToken[token.id]

                return (
                  <div key={token.id} style={{
                    background: 'var(--bg-input)', borderRadius: 12, padding: 16,
                    border: `1px solid ${isOnline ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                  }}>
                    {/* الرأس */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isOnline ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Wifi size={14} color={T.profit} />
                            <span style={{ fontSize: 11, color: T.profit, fontWeight: 700 }}>متصل</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <WifiOff size={14} color="var(--text-muted)" />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>غير متصل</span>
                          </div>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>|</span>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{token.label}</span>
                      </div>
                      <button
                        onClick={() => revokeToken(token.id)}
                        style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: 'rgba(239,68,68,0.1)', border: 'none',
                          color: T.loss, cursor: 'pointer', fontSize: 10,
                          fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                          fontFamily: 'inherit',
                        }}
                      >
                        <Trash2 size={11} />
                        حذف
                      </button>
                    </div>

                    {/* التوكن */}
                    <div style={{
                      background: 'var(--bg-app)', borderRadius: 8, padding: '10px 12px',
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                      border: '1px solid var(--border)',
                    }}>
                      <Key size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <code style={{
                        fontSize: 11, flex: 1, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        direction: 'ltr', textAlign: 'left',
                        color: isRevealed ? 'var(--text-main)' : 'var(--text-muted)',
                        filter: isRevealed ? 'none' : 'blur(3px)',
                        userSelect: isRevealed ? 'text' : 'none',
                      }}>
                        {token.token}
                      </code>
                      <button
                        onClick={() => setShowToken(prev => ({ ...prev, [token.id]: !prev[token.id] }))}
                        style={{
                          padding: 4, borderRadius: 4, background: 'none', border: 'none',
                          color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        onClick={() => copyToken(token.token, token.id)}
                        style={{
                          padding: 4, borderRadius: 4, background: 'none', border: 'none',
                          color: copied === token.id ? T.profit : 'var(--text-muted)',
                          cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        {copied === token.id ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                      </button>
                    </div>

                    {/* التفاصيل */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {token.mt5AccountNumber && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Activity size={10} />
                          حساب: {token.mt5AccountNumber}
                        </div>
                      )}
                      {status?.lastHeartbeat?.balance != null && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          رصيد: ${status.lastHeartbeat.balance.toLocaleString()}
                        </div>
                      )}
                      {status?.lastHeartbeat?.openPositions != null && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          مراكز: {status.lastHeartbeat.openPositions}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={10} />
                        أُنشئ: {formatDate(token.createdAt)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── تعليمات الإعداد ─── */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 16, padding: 24,
          border: '1px solid var(--border)',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExternalLink size={16} style={{ color: 'var(--accent)' }} />
            خطوات الإعداد في MT5
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              {
                step: 1,
                title: 'أنشئ توكن أعلاه',
                desc: 'اضغط "إنشاء توكن" وانسخ الرمز الناتج',
              },
              {
                step: 2,
                title: 'افتح MetaEditor في MT5',
                desc: 'Tools → MetaQuotes Language Editor (أو F4)',
              },
              {
                step: 3,
                title: 'الصق كود EA والcompile',
                desc: 'انسخ كود JABER.mq5 → ملف جديد → Compile → يجب أن يكون 0 أخطاء',
              },
              {
                step: 4,
                title: 'أضف رابط السماح في MT5',
                desc: 'Tools → Options → Expert Advisors → Allow WebRequest → أضف: ' + apiUrl + ' (نفس عنوان المنصة)',
              },
              {
                step: 5,
                title: 'شغّل EA وأدخل التوكن',
                desc: 'اسحب EA على الشارت → EA_Token = التوكن المنسوخ → Cloud_Base_URL = ' + apiUrl,
              },
            ].map(item => (
              <div key={item.step} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: '#fff',
                }}>
                  {item.step}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </SubPageLayout>
  )
}
