'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  UserCircle, Mail, Phone, Globe, Clock, Edit3, Save, X,
  TrendingUp, TrendingDown, BarChart3, Trophy, Calendar,
  Activity, Shield, Key, Fingerprint, Trash2, AlertTriangle,
  CheckCircle2, XCircle, LogOut, ChevronLeft, Sparkles, Crown,
  Star, Zap, Eye, MessageSquare, Bot, Cpu
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useAuthStore } from '@/lib/auth-store'
import { ROLE_INFO, type Role } from '@/lib/permissions'

/* ── Design Tokens ── */
const T = {
  bg: '#04050C', bg2: '#0D1117', card: '#08090F', cardHover: '#0B0F19',
  surface: '#1A1D29', cyan: '#00D4FF', green: '#00FFA3', greenDim: '#00CC82',
  red: '#FF4757', redDim: '#FF3344', amber: '#FFB800', purple: '#B388FF',
  blue: '#0A84FF', pink: '#f472b6',
  text: '#F0F2F5', text2: '#94a3b8', text3: '#8B92A8', text4: '#475569',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

/* ── Mock Data ── */
const MOCK_STATS = {
  totalTrades: 847,
  winRate: 68.4,
  bestTrade: '+23.7%',
  totalPnL: '+$12,483',
  memberSince: 'يناير 2025',
  activeDays: 142,
}

const MOCK_ACTIVITY = [
  { id: '1', type: 'login', icon: <Shield size={14} />, label: 'تسجيل دخول ناجح', detail: 'Chrome — الرياض، السعودية', time: 'منذ 5 دقائق', color: T.green },
  { id: '2', type: 'trade', icon: <TrendingUp size={14} />, label: 'رصد صفقة شراء', detail: 'BTC/USDT — 0.015 BTC @ $67,432', time: 'منذ 23 دقيقة', color: T.cyan },
  { id: '3', type: 'trade', icon: <TrendingDown size={14} />, label: 'رصد إغلاق صفقة بيع', detail: 'ETH/USDT — ربح +4.2%', time: 'منذ ساعة', color: T.green },
  { id: '4', type: 'settings', icon: <Activity size={14} />, label: 'تحديث إعدادات الإشعارات', detail: 'تفعيل إشعارات الإشارات الذكية', time: 'منذ 3 ساعات', color: T.amber },
  { id: '5', type: 'login', icon: <Shield size={14} />, label: 'تسجيل دخول من جهاز جديد', detail: 'Safari — جدة، السعودية', time: 'أمس 11:42 م', color: T.purple },
  { id: '6', type: 'ai', icon: <Bot size={14} />, label: 'تفعيل استراتيجية AI', detail: 'استراتيجية الزخم — ثقة 78%', time: 'أمس 3:15 م', color: T.purple },
]

const TIMEZONES = [
  { value: 'Asia/Riyadh', label: 'الرياض (GMT+3)' },
  { value: 'Asia/Dubai', label: 'دبي (GMT+4)' },
  { value: 'Asia/Kuwait', label: 'الكويت (GMT+3)' },
  { value: 'Africa/Cairo', label: 'القاهرة (GMT+2)' },
  { value: 'Europe/London', label: 'لندن (GMT+0)' },
  { value: 'America/New_York', label: 'نيويورك (GMT-5)' },
  { value: 'Asia/Tokyo', label: 'طوكيو (GMT+9)' },
]

/* ── Stat Card ── */
function StatCard({ icon, label, value, color, subtext }: {
  icon: React.ReactNode; label: string; value: string; color: string; subtext?: string
}) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}30` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}14`, color, flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{ fontSize: 11, color: T.text3, fontWeight: 600, fontFamily: "'Cairo', sans-serif" }}>{label}</span>
      </div>
      <div style={{
        fontSize: 20, fontWeight: 900, color,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      {subtext && <div style={{ fontSize: 9, color: T.text4, fontFamily: "'Cairo', sans-serif" }}>{subtext}</div>}
    </div>
  )
}

/* ── Section Card ── */
function SectionCard({ icon, iconColor, iconBg, title, subtitle, children, badge }: {
  icon: React.ReactNode; iconColor: string; iconBg: string; title: string; subtitle: string;
  children: React.ReactNode; badge?: string
}) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 16, overflow: 'hidden',
      transition: 'border-color 0.3s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '18px 20px', borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: iconBg, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Cairo', sans-serif" }}>
            {title}
            {badge && (
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', color: T.text3,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
              }}>{badge}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.text3, marginTop: 2, fontFamily: "'Cairo', sans-serif" }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ padding: '4px 20px 18px' }}>
        {children}
      </div>
    </div>
  )
}

/* ── Form Input ── */
function FormInput({ label, value, onChange, placeholder, readonly, type, icon }: {
  label: string; value: string; onChange?: (v: string) => void; placeholder?: string;
  readonly?: boolean; type?: string; icon?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            color: T.text4, display: 'flex', alignItems: 'center', pointerEvents: 'none',
          }}>
            {icon}
          </span>
        )}
        <input
          type={type || 'text'}
          value={value}
          onChange={onChange ? e => onChange(e.target.value) : undefined}
          readOnly={readonly}
          placeholder={placeholder}
          style={{
            width: '100%', background: readonly ? 'rgba(255,255,255,0.02)' : T.surface,
            border: `1px solid ${readonly ? T.border : T.border2}`,
            borderRadius: 10, padding: icon ? '10px 40px 10px 14px' : '10px 14px',
            color: readonly ? T.text3 : T.text, fontSize: 13,
            fontFamily: type === 'email' ? "'JetBrains Mono', monospace" : "'Cairo', sans-serif",
            fontWeight: readonly ? 500 : 600, outline: 'none',
            direction: 'rtl', transition: 'border-color 0.2s',
            cursor: readonly ? 'default' : 'text',
          }}
          onFocus={!readonly ? e => { e.target.style.borderColor = T.cyan; e.target.style.boxShadow = `0 0 0 3px ${T.cyan}15` } : undefined}
          onBlur={!readonly ? e => { e.target.style.borderColor = T.border2; e.target.style.boxShadow = 'none' } : undefined}
        />
      </div>
    </div>
  )
}

/* ── Form Select ── */
function FormSelect({ label, value, onChange, options, icon }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; icon?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            color: T.text4, display: 'flex', alignItems: 'center', pointerEvents: 'none',
          }}>
            {icon}
          </span>
        )}
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', background: T.surface,
            border: `1px solid ${T.border2}`, borderRadius: 10,
            padding: icon ? '10px 40px 10px 14px' : '10px 14px',
            color: T.text, fontSize: 13, fontWeight: 600,
            fontFamily: "'Cairo', sans-serif", outline: 'none',
            direction: 'rtl', appearance: 'none', cursor: 'pointer',
          }}
          onFocus={e => { e.target.style.borderColor = T.cyan; e.target.style.boxShadow = `0 0 0 3px ${T.cyan}15` }}
          onBlur={e => { e.target.style.borderColor = T.border2; e.target.style.boxShadow = 'none' }}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronLeft size={14} color={T.text4} style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%) rotate(180deg)',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   Main Profile Page
══════════════════════════════════════════════════════ */
export default function ProfilePage() {
  const user = useAuthStore(state => state.user)
  const authLogout = useAuthStore(state => state.logout)

  // Edit mode
  const [isEditing, setIsEditing] = useState(false)
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [phone, setPhone] = useState('')
  const [bio, setBio] = useState('')
  const [language, setLanguage] = useState('ar')
  const [timezone, setTimezone] = useState('Asia/Riyadh')
  const [isSaving, setIsSaving] = useState(false)

  // Delete account confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const userTier = (user?.tier || 'FREE') as Role
  const roleInfo = ROLE_INFO[userTier] || ROLE_INFO.FREE

  // Sync display name from auth store
  useMemo(() => {
    if (user?.displayName && !isEditing) {
      setDisplayName(user.displayName)
    }
  }, [user?.displayName, isEditing])

  /* ── Save Profile ── */
  const handleSave = useCallback(async () => {
    if (!displayName.trim()) {
      toast({ title: 'اسم مطلوب', description: 'يرجى إدخال اسم العرض', variant: 'destructive' })
      return
    }
    setIsSaving(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast({ title: 'تم حفظ التغييرات', description: 'تم تحديث ملفك الشخصي بنجاح' })
      setIsEditing(false)
    } catch {
      toast({ title: 'خطأ في الحفظ', description: 'حدث خطأ أثناء حفظ التغييرات', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }, [displayName])

  /* ── Cancel Edit ── */
  const handleCancel = useCallback(() => {
    setDisplayName(user?.displayName || '')
    setPhone('')
    setBio('')
    setLanguage('ar')
    setTimezone('Asia/Riyadh')
    setIsEditing(false)
  }, [user?.displayName])

  /* ── Delete Account ── */
  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== 'حذف') {
      toast({ title: 'تأكيد مطلوب', description: 'يرجى كتابة "حذف" للتأكيد', variant: 'destructive' })
      return
    }
    try {
      await new Promise(resolve => setTimeout(resolve, 800))
      toast({ title: 'تم حذف الحساب', description: 'سيتم حذف حسابك خلال 30 يوماً', variant: 'destructive' })
      authLogout()
    } catch {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء حذف الحساب', variant: 'destructive' })
    }
  }, [deleteConfirmText, authLogout])

  const avatarLetter = user?.displayName?.[0] || user?.email?.[0]?.toUpperCase() || 'R'

  return (
    <div className="custom-scrollbar" style={{ direction: 'rtl', fontFamily: "'Cairo', sans-serif", height: '100%', overflowY: 'auto', background: T.bg }}>
      <style>{`
        @media (max-width: 767px) {
          .profile-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .profile-form-grid { grid-template-columns: 1fr !important; }
          .profile-content { padding: 12px !important; }
          .profile-hero-inner { flex-direction: column !important; text-align: center !important; }
          .profile-hero-actions { margin-top: 12px !important; }
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .profile-stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        @keyframes profile-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .profile-section { animation: profile-fade-in 0.4s ease-out; }
      `}</style>

      {/* ═══ Header ═══ */}
      <div style={{
        padding: '24px 24px 0', borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(180deg, ${T.bg2}, ${T.bg})`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #00d4ff, #0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <UserCircle size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: T.text, fontFamily: "'Cairo', sans-serif" }}>الملف الشخصي</h1>
            <p style={{ margin: 0, fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>إدارة بياناتك الشخصية وإعدادات حسابك على منصة رؤى</p>
          </div>
        </div>
      </div>

      {/* ═══ Content ═══ */}
      <div className="profile-content" style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>

        {/* ═══ Profile Hero Card ═══ */}
        <div className="profile-section" style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 16, overflow: 'hidden', position: 'relative',
        }}>
          {/* Background Glow */}
          <div style={{
            position: 'absolute', top: -40, right: -40,
            width: 160, height: 160, borderRadius: '50%',
            background: `${roleInfo.color}08`, filter: 'blur(60px)',
            pointerEvents: 'none',
          }} />

          <div className="profile-hero-inner" style={{
            padding: 24, display: 'flex', alignItems: 'center', gap: 20,
            position: 'relative',
          }}>
            {/* Avatar */}
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: `linear-gradient(135deg, ${roleInfo.color}, ${roleInfo.color}88)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 900, color: '#fff',
              fontFamily: "'JetBrains Mono', monospace",
              boxShadow: `0 0 24px ${roleInfo.color}30`,
              flexShrink: 0,
            }}>
              {avatarLetter}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: T.text, marginBottom: 4, fontFamily: "'Cairo', sans-serif" }}>
                {user?.displayName || 'مستخدم رؤى'}
              </div>
              <div style={{ fontSize: 12, color: T.text2, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                <Mail size={12} />
                <span>{user?.email || 'user@roua.io'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Tier Badge */}
                <span style={{
                  padding: '3px 10px', borderRadius: 10,
                  background: `${roleInfo.color}15`, color: roleInfo.color,
                  fontSize: 10, fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  border: `1px solid ${roleInfo.color}25`,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {['PREMIUM', 'INSTITUTIONAL', 'PLUS'].includes(userTier) ? <Sparkles size={10} /> : userTier === 'PRO' ? <Star size={10} /> : <Crown size={10} />}
                  {roleInfo.label}
                </span>
                {/* Member Since */}
                <span style={{ fontSize: 10, color: T.text4, display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'Cairo', sans-serif" }}>
                  <Calendar size={10} />
                  عضو منذ {MOCK_STATS.memberSince}
                </span>
              </div>
            </div>

            {/* Edit Button */}
            <div className="profile-hero-actions">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  style={{
                    padding: '8px 16px', borderRadius: 10, border: `1px solid ${T.border2}`,
                    background: 'rgba(0,212,255,0.06)', color: T.cyan,
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Cairo', sans-serif",
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.2s', flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.12)'; e.currentTarget.style.boxShadow = `0 0 12px ${T.cyan}20` }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.06)'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <Edit3 size={14} />
                  تعديل الملف
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    style={{
                      padding: '8px 16px', borderRadius: 10, border: 'none',
                      background: `linear-gradient(135deg, ${T.cyan}, #0A84FF)`,
                      color: '#000', fontSize: 11, fontWeight: 800, cursor: isSaving ? 'wait' : 'pointer',
                      fontFamily: "'Cairo', sans-serif",
                      display: 'flex', alignItems: 'center', gap: 6,
                      transition: 'all 0.2s', opacity: isSaving ? 0.7 : 1,
                    }}
                  >
                    <Save size={14} />
                    {isSaving ? 'جارٍ الحفظ...' : 'حفظ'}
                  </button>
                  <button
                    onClick={handleCancel}
                    style={{
                      padding: '8px 14px', borderRadius: 10, border: `1px solid ${T.border}`,
                      background: T.surface, color: T.text3,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      fontFamily: "'Cairo', sans-serif",
                      display: 'flex', alignItems: 'center', gap: 4,
                      transition: 'all 0.2s',
                    }}
                  >
                    <X size={13} />
                    إلغاء
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ Editable Profile Form ═══ */}
        <div className="profile-section">
          <SectionCard
            icon={<Edit3 size={18} color={T.cyan} />}
            iconColor={T.cyan}
            iconBg={`${T.cyan}14`}
            title="البيانات الشخصية"
            subtitle={isEditing ? 'قم بتعديل بياناتك ثم اضغط حفظ' : 'عرض وتعديل بياناتك الشخصية'}
          >
            <div className="profile-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '12px 0' }}>
              {/* Display Name */}
              <FormInput
                label="اسم العرض"
                value={displayName}
                onChange={isEditing ? setDisplayName : undefined}
                placeholder="أدخل اسمك"
                readonly={!isEditing}
                icon={<UserCircle size={14} />}
              />

              {/* Email (readonly) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>
                  البريد الإلكتروني
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    color: T.text4, display: 'flex', alignItems: 'center', pointerEvents: 'none',
                  }}>
                    <Mail size={14} />
                  </span>
                  <input
                    type="email"
                    value={user?.email || 'user@roua.io'}
                    readOnly
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${T.border}`, borderRadius: 10,
                      padding: '10px 40px 10px 14px',
                      color: T.text3, fontSize: 13,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 500, outline: 'none', direction: 'rtl', cursor: 'default',
                    }}
                  />
                  {isEditing && (
                    <button
                      onClick={() => toast({ title: 'تغيير البريد', description: 'سيتم إرسال رابط تأكيد إلى بريدك الجديد' })}
                      style={{
                        position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: T.cyan, fontSize: 10, fontWeight: 700,
                        fontFamily: "'Cairo', sans-serif",
                        padding: '4px 8px', borderRadius: 6,
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = `${T.cyan}12` }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                    >
                      تغيير
                    </button>
                  )}
                </div>
              </div>

              {/* Phone */}
              <FormInput
                label="رقم الهاتف"
                value={phone}
                onChange={isEditing ? setPhone : undefined}
                placeholder={isEditing ? '+966 5XX XXX XXXX' : 'غير محدد'}
                readonly={!isEditing}
                icon={<Phone size={14} />}
              />

              {/* Preferred Language */}
              <FormSelect
                label="اللغة المفضلة"
                value={language}
                onChange={setLanguage}
                options={[
                  { value: 'ar', label: 'عربي' },
                  { value: 'en', label: 'English' },
                ]}
                icon={<Globe size={14} />}
              />

              {/* Timezone */}
              <FormSelect
                label="المنطقة الزمنية"
                value={timezone}
                onChange={setTimezone}
                options={TIMEZONES}
                icon={<Clock size={14} />}
              />

              {/* Bio / About */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>
                  نبذة عنك
                </label>
                <textarea
                  value={bio}
                  onChange={isEditing ? e => setBio(e.target.value) : undefined}
                  readOnly={!isEditing}
                  placeholder={isEditing ? 'اكتب نبذة مختصرة عنك...' : 'لم يتم إضافة نبذة بعد'}
                  rows={3}
                  style={{
                    width: '100%', background: isEditing ? T.surface : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isEditing ? T.border2 : T.border}`,
                    borderRadius: 10, padding: '10px 14px',
                    color: isEditing ? T.text : T.text3, fontSize: 13,
                    fontFamily: "'Cairo', sans-serif", fontWeight: isEditing ? 600 : 500,
                    outline: 'none', direction: 'rtl', resize: isEditing ? 'vertical' : 'none',
                    transition: 'border-color 0.2s', lineHeight: 1.8,
                  }}
                  onFocus={isEditing ? e => { e.target.style.borderColor = T.cyan; e.target.style.boxShadow = `0 0 0 3px ${T.cyan}15` } : undefined}
                  onBlur={isEditing ? e => { e.target.style.borderColor = T.border2; e.target.style.boxShadow = 'none' } : undefined}
                />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ═══ Trading Statistics ═══ */}
        <div className="profile-section">
          <SectionCard
            icon={<BarChart3 size={18} color={T.green} />}
            iconColor={T.green}
            iconBg={`${T.green}14`}
            title="إحصائيات المتابعة"
            subtitle="أداء حساباتك المربوطة على منصة رؤى منذ الانضمام"
            badge="مباشر"
          >
            <div className="profile-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '12px 0' }}>
              <StatCard
                icon={<Activity size={14} />}
                label="إجمالي الصفقات المتابعة"
                value={String(MOCK_STATS.totalTrades)}
                color={T.cyan}
              />
              <StatCard
                icon={<Trophy size={14} />}
                label="نسبة الفوز"
                value={`${MOCK_STATS.winRate}%`}
                color={T.green}
                subtext="آخر 90 يوماً"
              />
              <StatCard
                icon={<Zap size={14} />}
                label="أفضل صفقة"
                value={MOCK_STATS.bestTrade}
                color={T.amber}
              />
              <StatCard
                icon={<TrendingUp size={14} />}
                label="إجمالي الربح"
                value={MOCK_STATS.totalPnL}
                color={T.green}
              />
              <StatCard
                icon={<Calendar size={14} />}
                label="عضو منذ"
                value={MOCK_STATS.memberSince}
                color={T.purple}
              />
              <StatCard
                icon={<Eye size={14} />}
                label="أيام النشاط"
                value={String(MOCK_STATS.activeDays)}
                color={T.cyan}
                subtext="من آخر 180 يوماً"
              />
            </div>
          </SectionCard>
        </div>

        {/* ═══ Activity Feed ═══ */}
        <div className="profile-section">
          <SectionCard
            icon={<Activity size={18} color={T.amber} />}
            iconColor={T.amber}
            iconBg={`${T.amber}14`}
            title="سجل النشاط"
            subtitle="آخر الإجراءات على حسابك"
          >
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column' }}>
              {MOCK_ACTIVITY.map((item, i) => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 0',
                  borderBottom: i < MOCK_ACTIVITY.length - 1 ? `1px solid ${T.border}` : 'none',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${item.color}12`, color: item.color,
                    flexShrink: 0, marginTop: 2,
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
                      {item.detail}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, marginTop: 2 }}>
                    <span style={{
                      fontSize: 10, color: T.text4,
                      fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}>
                      {item.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* ═══ Connected Accounts ═══ */}
        <div className="profile-section">
          <SectionCard
            icon={<Key size={18} color={T.purple} />}
            iconColor={T.purple}
            iconBg={`${T.purple}14`}
            title="الحسابات المرتبطة"
            subtitle="إدارة الاتصالات والبورصات المرتبطة بحسابك"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>

              {/* Google */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', borderRadius: 12,
                background: T.surface, border: `1px solid ${T.border}`,
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${T.cyan}20` }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${T.red}14`, flexShrink: 0,
                }}>
                  <Mail size={16} color={T.red} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>Google</div>
                  <div style={{ fontSize: 11, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{user?.email || 'user@roua.io'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} color={T.green} />
                  <span style={{ fontSize: 11, color: T.green, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>متصل</span>
                </div>
              </div>

              {/* Exchange Accounts */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', borderRadius: 12,
                background: T.surface, border: `1px solid ${T.border}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${T.amber}14`, flexShrink: 0,
                }}>
                  <Cpu size={16} color={T.amber} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>حسابات البورصة</div>
                  <div style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>Binance, Alpaca</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 8,
                    background: `${T.amber}15`, color: T.amber,
                    fontSize: 11, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>2</span>
                  <span style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>مرتبط</span>
                </div>
              </div>

              {/* WebAuthn Passkeys */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', borderRadius: 12,
                background: T.surface, border: `1px solid ${T.border}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${T.green}14`, flexShrink: 0,
                }}>
                  <Fingerprint size={16} color={T.green} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>مفاتيح المرور (WebAuthn)</div>
                  <div style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>مصادقة بيومترية سريعة وآمنة</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 8,
                    background: `${T.green}15`, color: T.green,
                    fontSize: 11, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>1</span>
                  <span style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>مفتاح</span>
                </div>
              </div>

            </div>
          </SectionCard>
        </div>

        {/* ═══ Danger Zone ═══ */}
        <div className="profile-section" style={{
          border: `1px solid rgba(255,71,87,0.15)`, borderRadius: 16,
          background: 'rgba(255,71,87,0.02)', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: `1px solid rgba(255,71,87,0.10)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={16} color={T.red} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.red, fontFamily: "'Cairo', sans-serif" }}>منطقة الخطر</span>
            </div>
            <div style={{ fontSize: 11, color: T.text4, marginTop: 4, fontFamily: "'Cairo', sans-serif" }}>
              إجراءات لا يمكن التراجع عنها — يرجى التوخي الحذر
            </div>
          </div>

          <div style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Logout */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LogOut size={14} color={T.red} />
                <div>
                  <div style={{ fontSize: 13, color: T.text, fontWeight: 600, fontFamily: "'Cairo', sans-serif" }}>تسجيل الخروج</div>
                  <div style={{ fontSize: 10, color: T.text4, fontFamily: "'Cairo', sans-serif" }}>إنهاء الجلسة الحالية من جميع الأجهزة</div>
                </div>
              </div>
              <button
                onClick={authLogout}
                style={{
                  padding: '6px 14px', borderRadius: 8,
                  background: 'rgba(255,71,87,0.10)', border: `1px solid rgba(255,71,87,0.20)`,
                  color: T.red, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.18)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.10)' }}
              >
                خروج
              </button>
            </div>

            {/* Delete Account */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '10px 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Trash2 size={14} color={T.red} style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 13, color: T.text, fontWeight: 600, fontFamily: "'Cairo', sans-serif" }}>حذف الحساب نهائياً</div>
                  <div style={{ fontSize: 10, color: T.text4, fontFamily: "'Cairo', sans-serif", lineHeight: 1.7, maxWidth: 400 }}>
                    سيتم حذف حسابك وجميع بياناتك نهائياً بعد 30 يوماً من الطلب. لا يمكن التراجع عن هذا الإجراء بعد تأكيده.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  padding: '6px 14px', borderRadius: 8,
                  background: 'rgba(255,71,87,0.10)', border: `1px solid rgba(255,71,87,0.20)`,
                  color: T.red, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.18)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.10)' }}
              >
                حذف الحساب
              </button>
            </div>

            {/* Delete Confirmation */}
            {showDeleteConfirm && (
              <div style={{
                background: 'rgba(255,71,87,0.04)', border: `1px solid rgba(255,71,87,0.15)`,
                borderRadius: 12, padding: 16,
                animation: 'profile-fade-in 0.3s ease-out',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <XCircle size={16} color={T.red} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: T.red, fontFamily: "'Cairo', sans-serif" }}>تأكيد حذف الحساب</span>
                </div>
                <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.8, marginBottom: 14, fontFamily: "'Cairo', sans-serif" }}>
                  هذا الإجراء لا يمكن التراجع عنه. سيتم حذف جميع بياناتك بما في ذلك سجل التداول والإعدادات والمفاتيح المرتبطة.
                  اكتب <strong style={{ color: T.red }}>&quot;حذف&quot;</strong> للتأكيد.
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder='اكتب "حذف" هنا'
                    style={{
                      flex: 1, background: T.surface, border: `1px solid rgba(255,71,87,0.20)`,
                      borderRadius: 8, padding: '8px 12px',
                      color: T.text, fontSize: 12, fontWeight: 600,
                      fontFamily: "'Cairo', sans-serif", outline: 'none',
                      direction: 'rtl',
                    }}
                  />
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== 'حذف'}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: deleteConfirmText === 'حذف' ? T.red : 'rgba(255,71,87,0.2)',
                      color: deleteConfirmText === 'حذف' ? '#fff' : T.text4,
                      fontSize: 11, fontWeight: 800, cursor: deleteConfirmText === 'حذف' ? 'pointer' : 'not-allowed',
                      fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
                    }}
                  >
                    تأكيد الحذف
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                    style={{
                      padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`,
                      background: T.surface, color: T.text3,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      fontFamily: "'Cairo', sans-serif",
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
