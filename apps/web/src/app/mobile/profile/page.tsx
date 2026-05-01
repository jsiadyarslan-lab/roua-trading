'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  ChevronLeft, User, Mail, Calendar, Trophy, TrendingUp,
  Edit3, Shield, Link2, CheckCircle, AlertCircle, Loader2,
  Crown, Star, BarChart3, Target, Award
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
function LinkedAccountItem({ name, linked, color }: { name: string; linked: boolean; color: string }) {
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
          {linked ? 'مربوط' : 'غير مربوط'}
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
  const [user, setUser] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          setUser(data.user || data.data || data)
        } else {
          // Use mock data
          setUser({
            name: 'مستخدم رؤى',
            email: 'user@roua.trading',
            tier: 'PRO',
            trades: 248,
            winRate: 72.4,
            profit: 4250.80,
            joinedAt: '2024-03-15',
            avatar: null,
            linkedAccounts: [
              { name: 'Binance', linked: true, color: '#F0B90B' },
              { name: 'Alpaca', linked: false, color: c.accent },
              { name: 'Interactive Brokers', linked: false, color: c.danger },
              { name: 'Coinbase', linked: false, color: '#0052FF' },
            ],
          })
        }
      } catch {
        setUser({
          name: 'مستخدم رؤى',
          email: 'user@roua.trading',
          tier: 'PRO',
          trades: 248,
          winRate: 72.4,
          profit: 4250.80,
          joinedAt: '2024-03-15',
          avatar: null,
          linkedAccounts: [
            { name: 'Binance', linked: true, color: '#F0B90B' },
            { name: 'Alpaca', linked: false, color: c.accent },
            { name: 'Interactive Brokers', linked: false, color: c.danger },
            { name: 'Coinbase', linked: false, color: '#0052FF' },
          ],
        })
      } finally {
        setLoading(false)
      }
    }
    fetchUser()
  }, [])

  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')

  const handleSave = () => {
    if (user) user.name = editName
    setEditMode(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} className="animate-spin" color={c.accent} />
      </div>
    )
  }

  if (error && !user) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000', direction: 'rtl', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
        <AlertCircle size={40} color={c.danger} />
        <p style={{ fontSize: 14, color: c.text2, fontFamily: "'Cairo', sans-serif", textAlign: 'center' }}>{error || 'فشل في تحميل البيانات'}</p>
        <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', borderRadius: 14, background: c.accent, color: '#000', fontWeight: 800, fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer' }}>إعادة المحاولة</button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#000', direction: 'rtl', paddingBottom: 100 }}>

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
            {user?.name?.[0] || 'ر'}
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
                {user?.name || 'مستخدم رؤى'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                <Mail size={13} color={c.text2} />
                <span style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{user?.email || 'user@roua.trading'}</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <TierBadge tier={user?.tier || 'FREE'} />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => { setEditMode(true); setEditName(user?.name || '') }}
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

      {/* ── Stats Grid ── */}
      <div style={{ display: 'flex', gap: 10, margin: '0 20px 16px', padding: 0 }}>
        <StatItem icon={BarChart3} label="الصفقات" value={`${user?.trades || 0}`} color={c.accent} />
        <StatItem icon={Target} label="نسبة الفوز" value={`${user?.winRate || 0}%`} color={c.success} />
        <StatItem icon={TrendingUp} label="الربح" value={`$${(user?.profit || 0).toLocaleString()}`} color={c.amber} />
        <StatItem icon={Calendar} label="تاريخ الانضمام" value={user?.joinedAt ? new Date(user.joinedAt).toLocaleDateString('ar-SA', { month: 'short', year: 'numeric' }) : '—'} color={c.text2} />
      </div>

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
              {user?.linkedAccounts?.filter((a: any) => a.linked).length || 0}
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

        {user?.linkedAccounts?.length > 0 ? (
          user.linkedAccounts.map((acc: any, i: number) => (
            <LinkedAccountItem key={i} name={acc.name} linked={acc.linked} color={acc.color} />
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
