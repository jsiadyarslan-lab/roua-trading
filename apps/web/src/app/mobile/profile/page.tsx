'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft, User, Mail, Calendar, Trophy, TrendingUp,
  Edit3, Shield, Link2, CheckCircle, AlertCircle, Loader2,
  Crown, Star, BarChart3, Target, Award
} from 'lucide-react'
import { useAuthStore, type AuthUser } from '@/lib/auth-store'

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

/* ─── Exchange info map ─── */
const EXCHANGE_INFO: Record<string, { name: string; nameAr: string; color: string }> = {
  binance: { name: 'Binance', nameAr: 'باينانس', color: '#F0B90B' },
  kucoin: { name: 'KuCoin', nameAr: 'كوکوين', color: '#23AF91' },
  bybit: { name: 'Bybit', nameAr: 'بايبيت', color: '#F7A600' },
  okx: { name: 'OKX', nameAr: 'أو كي إكس', color: '#ffffff' },
  gate: { name: 'Gate.io', nameAr: 'جيت دوت آيو', color: '#2354E6' },
  alpaca: { name: 'Alpaca', nameAr: 'ألباكا', color: '#00D4FF' },
  coinbase: { name: 'Coinbase', nameAr: 'كوينبيس', color: '#0052FF' },
  ibkr: { name: 'Interactive Brokers', nameAr: 'إنتراكتيف بروكرز', color: '#FF453A' },
}

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

/* ─── Stat Item ─── */
function StatItem({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      padding: '12px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: 16,
      border: `0.5px solid ${c.border}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color={color} />
      </div>
      <span style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
      <span style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>{label}</span>
    </div>
  )
}

/* ─── Tier Badge ─── */
function TierBadge({ tier }: { tier: string }) {
  const tierConfig: Record<string, { color: string; icon: any; label: string }> = {
    FREE: { color: '#8B92A8', icon: Star, label: 'مجاني' },
    PRO: { color: c.accent, icon: Crown, label: 'محترف' },
    PLUS: { color: c.amber, icon: Award, label: 'بلس' },
    PREMIUM: { color: c.success, icon: Trophy, label: 'بريميوم' },
  }
  const cfg = tierConfig[tier] || tierConfig.FREE
  const Icon = cfg.icon
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 20,
      background: `${cfg.color}15`, border: `0.5px solid ${cfg.color}30`,
    }}>
      <Icon size={14} color={cfg.color} />
      <span style={{ fontSize: 12, fontWeight: 800, color: cfg.color, fontFamily: "'Cairo', sans-serif" }}>{cfg.label}</span>
    </div>
  )
}

/* ─── Linked Account Item ─── */
function LinkedAccountItem({ name, linked, color, label }: { name: string; linked: boolean; color: string; label?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 0',
      borderBottom: `0.5px solid ${c.border}`,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: `${color}15`, border: `0.5px solid ${color}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 900, color: color,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {name[0]}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{name}</p>
        <p style={{ fontSize: 11, color: linked ? c.success : c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
          {linked ? (label || 'مربوط') : 'غير مربوط'}
        </p>
      </div>
      {linked ? (
        <CheckCircle size={18} color={c.success} />
      ) : (
        <AlertCircle size={18} color={c.text2} />
      )}
    </div>
  )
}

/* ─── Main Page ─── */
export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [credentialsLoading, setCredentialsLoading] = useState(true)

  // ── Fetch user via auth store ──
  useEffect(() => {
    async function fetchUser() {
      try {
        const authUser = await useAuthStore.getState().refreshUser()
        setUser(authUser)
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    fetchUser()
  }, [])

  // ── Fetch real credentials from /api/portfolio/credentials ──
  const fetchCredentials = useCallback(async () => {
    setCredentialsLoading(true)
    try {
      const res = await fetch('/api/portfolio/credentials')
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setCredentials(data.data)
        }
      }
    } catch {
      // Silently fail
    } finally {
      setCredentialsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCredentials()
  }, [fetchCredentials])

  // ── Build linked accounts from real credential data ──
  const linkedAccounts = credentials
    .filter(c => c.isValid)
    .map(cred => {
      const info = EXCHANGE_INFO[cred.exchange] || { name: cred.exchange, nameAr: cred.exchange, color: c.text2 }
      return {
        name: info.nameAr,
        linked: true,
        color: info.color,
        label: cred.label,
      }
    })

  // Also include exchanges the user has NOT linked yet
  const allExchangeIds = ['binance', 'alpaca', 'coinbase', 'ibkr']
  const linkedExchangeIds = new Set(credentials.filter(c => c.isValid).map(c => c.exchange))
  const unlinkedAccounts = allExchangeIds
    .filter(id => !linkedExchangeIds.has(id))
    .map(id => {
      const info = EXCHANGE_INFO[id]
      return { name: info.nameAr, linked: false, color: info.color, label: undefined as string | undefined }
    })

  const allAccounts = [...linkedAccounts, ...unlinkedAccounts]

  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')

  const handleSave = () => {
    if (user) user.displayName = editName
    setEditMode(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>
        <Loader2 size={32} className="animate-spin" color={c.accent} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(180deg, rgba(0,212,255,0.06), transparent)',
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => router.back()}
          style={{
            width: 40, height: 40, borderRadius: 14,
            background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `0.5px solid ${c.border}`,
          }}
        >
          <ChevronLeft size={20} color={c.text} />
        </motion.button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif", flex: 1 }}>الملف الشخصي</h1>
      </div>

      {/* ── Avatar & Name ── */}
      <IOSCard highlight>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg, #00D4FF 0%, #7DD3FC 50%, #BAE6FD 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 900, color: '#000',
            boxShadow: '0 8px 24px rgba(0, 212, 255, 0.3)',
            border: '2px solid rgba(255,255,255,0.1)',
          }}>
            {(user?.displayName || user?.email || 'ر')[0].toUpperCase()}
          </div>

          {editMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="الاسم الجديد"
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.accent}50`,
                  color: c.text, fontSize: 14, fontFamily: "'Cairo', sans-serif",
                  outline: 'none', direction: 'rtl',
                }}
              />
              <motion.button whileTap={{ scale: 0.9 }} onClick={handleSave} style={{
                padding: '10px 16px', borderRadius: 14, background: c.accent,
                color: '#000', fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer',
              }}>
                حفظ
              </motion.button>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 20, fontWeight: 900, color: c.text, fontFamily: "'Cairo', sans-serif" }}>
                {user?.displayName || 'مستخدم رؤى'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                <Mail size={13} color={c.text2} />
                <span style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{user?.email || '—'}</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <TierBadge tier={user?.tier || 'FREE'} />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => { setEditMode(true); setEditName(user?.displayName || '') }}
              style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Edit3 size={14} color={c.text2} />
            </motion.button>
          </div>
        </div>
      </IOSCard>

      {/* ── Account Info ── */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `${c.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={16} color={c.accent} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>معلومات الحساب</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>البريد الإلكتروني</span>
            <span style={{ fontSize: 13, color: c.text, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{user?.email || '—'}</span>
          </div>
          <div style={{ height: 1, background: c.border }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>الخطة الحالية</span>
            <TierBadge tier={user?.tier || 'FREE'} />
          </div>
          <div style={{ height: 1, background: c.border }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>الحسابات المربوطة</span>
            <span style={{ fontSize: 13, color: c.text, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
              {linkedAccounts.length}
            </span>
          </div>
        </div>
      </IOSCard>

      {/* ── Linked Accounts ── */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `${c.amber}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Link2 size={16} color={c.amber} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>الحسابات المربوطة</span>
        </div>

        {credentialsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <Loader2 size={20} className="animate-spin" color={c.accent} />
          </div>
        ) : allAccounts.length > 0 ? (
          allAccounts.map((acc, i) => (
            <LinkedAccountItem key={acc.name + i} name={acc.name} linked={acc.linked} color={acc.color} label={acc.label} />
          ))
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <Link2 size={28} color={c.text2} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>لا توجد حسابات مربوطة</p>
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/mobile/kyc')}
          style={{
            width: '100%', marginTop: 12, padding: '12px 0', borderRadius: 16,
            background: 'rgba(0,212,255,0.08)', border: `0.5px solid rgba(0,212,255,0.2)`,
            color: c.accent, fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Link2 size={16} />
          ربط حساب جديد
        </motion.button>
      </IOSCard>

    </div>
  )
}
