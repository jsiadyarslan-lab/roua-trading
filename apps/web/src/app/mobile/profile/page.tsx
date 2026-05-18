'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  User, Mail, Shield, Link2, ChevronLeft, Loader2,
  CheckCircle2, XCircle, Crown, Zap, Star,
} from 'lucide-react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { useAuthStore } from '@/lib/auth-store'

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

const TIER_CONFIG: Record<string, { label: string; color: string; icon: typeof Crown }> = {
  free: { label: 'مجاني', color: C.text2, icon: Star },
  starter: { label: 'مبتدئ', color: C.accent, icon: Zap },
  pro: { label: 'احترافي', color: C.amber, icon: Crown },
  enterprise: { label: 'مؤسسي', color: C.success, icon: Shield },
}

/* ─── Profile Page ─── */
export default function MobileProfilePage() {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const refreshUser = useAuthStore(s => s.refreshUser)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { refreshUser() }, [refreshUser])

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

  const tier = user?.tier || 'free'
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.free
  const TierIcon = tierCfg.icon

  const displayName = user?.displayName || 'مستخدم رؤى'
  const email = user?.email || '—'
  const initials = displayName.slice(0, 2).toUpperCase()
  const validCreds = credentials.filter(c => c.isValid).length
  const totalCreds = credentials.length

  return (
    <div className="m-page">
      <MobilePageHeader title="الملف الشخصي" subtitle="إعدادات حسابك" />

      {/* Avatar Card */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, flexShrink: 0,
            background: `linear-gradient(135deg, ${C.accent}40, ${C.accent}10)`,
            border: `1.5px solid ${C.accent}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 900, color: C.accent, fontFamily: FONT_MONO,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
              {displayName}
            </div>
            <div style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Mail size={10} />
              <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{email}</span>
            </div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 8,
            background: `${tierCfg.color}12`, border: `0.5px solid ${tierCfg.color}25`,
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
          }}>
            <TierIcon size={11} color={tierCfg.color} />
            <span style={{ fontSize: 9, fontWeight: 800, color: tierCfg.color, fontFamily: FONT_AR }}>
              {tierCfg.label}
            </span>
          </div>
        </div>
      </IOSCard>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 12 }}>
        {[
          { label: 'الحسابات المرتبطة', value: totalCreds, color: C.accent },
          { label: 'اتصالات نشطة', value: validCreds, color: C.success },
          { label: 'مستوى الحساب', value: tierCfg.label, color: tierCfg.color, isText: true },
        ].map((stat) => (
          <div key={stat.label} style={{
            padding: '10px 8px', borderRadius: 14, textAlign: 'center',
            background: `${stat.color}06`, border: `0.5px solid ${stat.color}12`,
          }}>
            <div style={{
              fontSize: stat.isText ? 11 : 18, fontWeight: 900, color: stat.color,
              fontFamily: stat.isText ? FONT_AR : FONT_MONO,
            }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 8, color: C.text2, fontFamily: FONT_AR, marginTop: 2 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Linked Exchanges Section */}
      <div className="m-section">
        <div className="m-section__title">الحسابات المرتبطة</div>
      </div>

      {loading ? (
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 }}>
            <Loader2 size={16} color={C.accent} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, color: C.text2, fontFamily: FONT_AR }}>جارٍ التحميل...</span>
          </div>
        </IOSCard>
      ) : credentials.length === 0 ? (
        <IOSCard>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Link2 size={28} color={C.text2} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT_AR, marginBottom: 4 }}>
              لا توجد حسابات مرتبطة
            </div>
            <div style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR, marginBottom: 12 }}>
              اربط حساب البورصة الخاص بك لبدء التداول
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
              ربط حساب جديد
            </button>
          </div>
        </IOSCard>
      ) : (
        credentials.map((cred, i) => {
          const meta = EXCHANGE_META[cred.exchange] || { name: cred.exchange, icon: '💱' }
          return (
            <motion.div
              key={cred.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <IOSCard onClick={() => router.push('/mobile/settings/exchange')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{meta.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                        {meta.name}
                      </div>
                      <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>
                        {cred.label}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {cred.isValid ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircle2 size={12} color={C.success} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.success, fontFamily: FONT_AR }}>نشط</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <XCircle size={12} color={C.danger} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.danger, fontFamily: FONT_AR }}>غير صالح</span>
                      </div>
                    )}
                    {cred.testnet && (
                      <span style={{
                        fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 5,
                        background: 'rgba(0,212,255,0.1)', color: C.accent,
                        border: `0.5px solid rgba(0,212,255,0.2)`, fontFamily: FONT_AR,
                      }}>
                        تجريبي
                      </span>
                    )}
                    <ChevronLeft size={14} color="rgba(255,255,255,0.2)" />
                  </div>
                </div>
              </IOSCard>
            </motion.div>
          )
        })
      )}

      {/* Quick Actions */}
      <div className="m-section" style={{ marginTop: 8 }}>
        <div className="m-section__title">إجراءات سريعة</div>
      </div>

      {[
        { label: 'ربط حساب جديد', icon: Link2, href: '/mobile/kyc', color: C.success },
        { label: 'إدارة المفاتيح', icon: Shield, href: '/mobile/settings/exchange', color: C.amber },
        { label: 'الإعدادات', icon: User, href: '/mobile/settings', color: C.accent },
      ].map((action) => {
        const Icon = action.icon
        return (
          <IOSCard key={action.href} onClick={() => router.push(action.href)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: `${action.color}12`, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={15} color={action.color} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                {action.label}
              </span>
              <ChevronLeft size={14} color="rgba(255,255,255,0.15)" style={{ marginInlineStart: 'auto' }} />
            </div>
          </IOSCard>
        )
      })}

      <div style={{ height: 16 }} />
    </div>
  )
}
