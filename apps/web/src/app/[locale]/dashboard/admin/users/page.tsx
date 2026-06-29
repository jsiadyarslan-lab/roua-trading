'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { getDirection } from '@/lib/i18n-utils';
import {
  Users,
  Search,
  Filter,
  X as XIcon,
  Mail,
  Shield,
  TrendingUp,
  Clock,
  ChevronDown,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertCircle,
  Trash2,
} from 'lucide-react'

interface AdminUser {
  id: string
  displayName: string
  email: string
  tier: string
  tradeCount: number
  openPositions: number
  orderCount: number
  createdAt: string
  lastActive: string
}

const COLORS = {
  bg: '#0B0E14',
  card: '#111318',
  accent: '#00E5FF',
  success: '#00E676',
  danger: '#FF5252',
  amber: '#FFB800',
  text: '#F0F2F5',
  muted: '#8B92A8',
  border: 'rgba(0,229,255,0.08)',
}

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(0,229,255,0.08)',
  borderRadius: 10,
  position: 'relative',
  overflow: 'hidden',
}

function getTierStyle(tier: string) {
  switch (tier) {
    case 'PRO':
      return { bg: 'rgba(0,229,255,0.10)', border: 'rgba(0,229,255,0.25)', color: COLORS.accent, label: 'برو' }
    case 'PLUS':
      return { bg: 'rgba(255,184,0,0.10)', border: 'rgba(255,184,0,0.25)', color: COLORS.amber, label: 'بلس' }
    case 'PREMIUM':
      return { bg: 'rgba(0,230,118,0.10)', border: 'rgba(0,230,118,0.25)', color: COLORS.success, label: 'مميز' }
    case 'INSTITUTIONAL':
      return { bg: 'rgba(179,136,255,0.10)', border: 'rgba(179,136,255,0.25)', color: '#B388FF', label: 'مؤسسي' }
    default:
      return { bg: 'rgba(139,146,168,0.10)', border: 'rgba(139,146,168,0.25)', color: COLORS.muted, label: 'مجاني' }
  }
}

export default function AdminUsersPage() {
  const tn = useTranslations('notifications.admin')
  const t = useTranslations('frontend')
  const tf = useTranslations('frontend')
  const locale = useLocale();
  const dir = getDirection(locale);
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [showFilter, setShowFilter] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [page, setPage] = useState(1)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<{deletedCount: number; errorCount: number} | null>(null)
  const [hideGuests, setHideGuests] = useState(true)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      })
      if (search) params.set('search', search)
      if (tierFilter !== 'all') params.set('tier', tierFilter)
      if (hideGuests) params.set('hideGuests', 'true')

      const res = await fetch(`/api/admin/users?${params}`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
        setError(null)
      } else {
        setError(tn('fetchFailed'))
      }
    } catch {
      setError(tn('fetchFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, search, tierFilter, hideGuests])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // Debounced search
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  const handleCleanupPhantoms = async () => {
    if (!confirm('سيتم حذف جميع الحسابات الوهمية (guest-*, user-*) والمستخدمين غير المحققين نهائياً. هل أنت متأكد؟')) return
    setCleanupLoading(true)
    setCleanupResult(null)
    try {
      const adminToken = localStorage.getItem('admin_token') || ''
      const res = await fetch(`/api/admin/stats`, {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      })
      if (!res.ok) throw new Error(t('msg_e5c97cae25'))
      const stats = await res.json()
      const guestCount = stats.users?.guests || 0
      if (guestCount === 0) {
        setCleanupResult({ deletedCount: 0, errorCount: 0 })
        setCleanupLoading(false)
        return
      }
      // Call cleanup in batches of 500
      let totalDeleted = 0
      let totalErrors = 0
      const batches = Math.ceil(guestCount / 500)
      for (let i = 0; i < batches; i++) {
        const cleanRes = await fetch(`/api/maintenance/cleanup-guests?batchSize=500&dryRun=false&includeUnverified=true`, {
          method: 'POST',
          headers: { 'X-Admin-Token': adminToken },
        })
        if (cleanRes.ok) {
          const data = await cleanRes.json()
          totalDeleted += data.deletedCount || 0
          totalErrors += data.errorCount || 0
          if (data.deletedCount === 0) break
        } else {
          break
        }
      }
      setCleanupResult({ deletedCount: totalDeleted, errorCount: totalErrors })
      fetchUsers()
    } catch {
      setError(tn('cleanDummyFailed'))
    } finally {
      setCleanupLoading(false)
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `منذ ${mins} دقيقة`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `منذ ${hours} ساعة`
    const days = Math.floor(hours / 24)
    return `منذ ${days} يوم`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>إدارة المستخدمين</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>{total} مستخدم مسجل</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setHideGuests(!hideGuests)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              border: `1px solid ${hideGuests ? COLORS.success + '40' : COLORS.border}`,
              background: hideGuests ? 'rgba(0,230,118,0.08)' : 'rgba(255,255,255,0.03)',
              color: hideGuests ? COLORS.success : COLORS.muted,
              fontSize: 11, fontWeight: 600, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            }}
          >
            {hideGuests ? 'إخفاء الوهميين' : 'عرض الكل'}
          </button>
          <button
            onClick={handleCleanupPhantoms}
            disabled={cleanupLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              border: `1px solid ${COLORS.danger}40`, background: 'rgba(255,82,82,0.08)',
              color: COLORS.danger, fontSize: 11, fontWeight: 600,
              fontFamily: "'Cairo', sans-serif", cursor: cleanupLoading ? 'not-allowed' : 'pointer',
              opacity: cleanupLoading ? 0.6 : 1,
            }}
          >
            <Trash2 size={13} /> {cleanupLoading ? 'جارٍ التنظيف...' : 'تنظيف الوهميين'}
          </button>
          <button
            onClick={fetchUsers}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              border: `1px solid ${COLORS.border}`, background: 'rgba(0,229,255,0.06)',
              color: COLORS.accent, fontSize: 12, fontWeight: 600,
              fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={14} /> تحديث
          </button>
        </div>
      </div>

      {/* Cleanup Result */}
      {cleanupResult && (
        <div style={{
          padding: '12px 16px', borderRadius: 8,
          background: cleanupResult.deletedCount > 0 ? `${COLORS.success}10` : `${COLORS.amber}10`,
          border: `1px solid ${cleanupResult.deletedCount > 0 ? COLORS.success + '25' : COLORS.amber + '25'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trash2 size={16} color={cleanupResult.deletedCount > 0 ? COLORS.success : COLORS.amber} />
            <span style={{ fontSize: 12, color: cleanupResult.deletedCount > 0 ? COLORS.success : COLORS.amber, fontFamily: "'Cairo', sans-serif" }}>
              {cleanupResult.deletedCount > 0
                ? `تم حذف ${cleanupResult.deletedCount} حساب وهمي`
                : 'لا توجد حسابات وهمية للحذف'}
              {cleanupResult.errorCount > 0 && ` (${cleanupResult.errorCount} أخطاء)`}
            </span>
          </div>
          <button onClick={() => setCleanupResult(null)} style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer' }}>
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 8,
          background: `${COLORS.danger}10`, border: `1px solid ${COLORS.danger}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={16} color={COLORS.danger} />
            <span style={{ fontSize: 12, color: COLORS.danger, fontFamily: "'Cairo', sans-serif" }}>
              {error}
            </span>
          </div>
          <button
            onClick={fetchUsers}
            style={{
              padding: '4px 10px', borderRadius: 6,
              border: `1px solid ${COLORS.danger}40`, background: `${COLORS.danger}10`,
              color: COLORS.danger, fontSize: 10, fontWeight: 600,
              fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{
          flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${COLORS.border}`,
        }}>
          <Search size={14} color={COLORS.muted} />
          <input
            type="text"
            placeholder="بحث بالاسم أو البريد..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: COLORS.text, fontSize: 12, fontFamily: "'Cairo', sans-serif",
            }}
            dir={dir}
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setSearch('') }} style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer', padding: 0 }}>
              <XIcon size={12} />
            </button>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowFilter(!showFilter)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              border: `1px solid ${COLORS.border}`, background: 'rgba(255,255,255,0.03)',
              color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            }}
          >
            <Filter size={14} />
            {tierFilter === 'all' ? 'المستوى' : getTierStyle(tierFilter).label}
            <ChevronDown size={12} />
          </button>
          {showFilter && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: '#161B22', border: `1px solid ${COLORS.border}`, borderRadius: 8,
              padding: 4, zIndex: 50, minWidth: 140,
            }}>
              {['all', 'FREE', 'PRO', 'PLUS', 'PREMIUM', 'INSTITUTIONAL'].map(tier => (
                <button
                  key={tier}
                  onClick={() => { setTierFilter(tier); setShowFilter(false); setPage(1) }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 12px', borderRadius: 6,
                    border: 'none', background: tierFilter === tier ? 'rgba(0,229,255,0.10)' : 'transparent',
                    color: tierFilter === tier ? COLORS.accent : COLORS.muted,
                    fontSize: 12, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', textAlign: 'right',
                  }}
                >
                  {tier === 'all' ? 'الكل' : getTierStyle(tier).label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                {['الاسم', 'البريد', 'المستوى', 'الصفقات', 'المراكز المفتوحة', 'أول تسجيل', 'آخر نشاط'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'right',
                    fontSize: 10, fontWeight: 700, color: COLORS.muted,
                    fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                    جارٍ التحميل...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                    لا يوجد مستخدمون مسجلون بعد
                  </td>
                </tr>
              ) : (
                users.map((user, i) => {
                  const tierStyle = getTierStyle(user.tier)
                  return (
                    <tr
                      key={user.id}
                      onClick={() => setSelectedUser(user)}
                      style={{
                        borderBottom: `1px solid ${COLORS.border}`,
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,229,255,0.04)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: `${COLORS.accent}15`,
                            border: `1px solid ${COLORS.accent}25`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700, color: COLORS.accent,
                            fontFamily: "'Cairo', sans-serif",
                          }}>
                            {user.displayName.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 600, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>{user.displayName}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.muted }} dir="ltr">{user.email}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4,
                          background: tierStyle.bg, border: `1px solid ${tierStyle.border}`,
                          color: tierStyle.color, fontSize: 10, fontWeight: 700,
                          fontFamily: "'Cairo', sans-serif",
                        }}>
                          {tierStyle.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.text }}>{user.tradeCount}</td>
                      <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.accent }}>{user.openPositions}</td>
                      <td style={{ padding: '10px 14px', fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{formatDate(user.createdAt)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{formatDate(user.lastActive)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '6px 10px', borderRadius: 6,
              border: `1px solid ${COLORS.border}`,
              background: page === 1 ? 'transparent' : 'rgba(0,229,255,0.06)',
              color: page === 1 ? COLORS.muted : COLORS.accent,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontSize: 12, fontFamily: "'Cairo', sans-serif",
            }}
          >
            <ChevronRight size={14} />
          </button>
          <span style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '6px 10px', borderRadius: 6,
              border: `1px solid ${COLORS.border}`,
              background: page === totalPages ? 'transparent' : 'rgba(0,229,255,0.06)',
              color: page === totalPages ? COLORS.muted : COLORS.accent,
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              fontSize: 12, fontFamily: "'Cairo', sans-serif",
            }}
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      )}

      {/* User Detail Panel */}
      {selectedUser && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}
          onClick={() => setSelectedUser(null)}
        >
          <div
            style={{
              ...CARD_STYLE,
              padding: 24,
              width: '100%',
              maxWidth: 480,
              background: '#161B22',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>تفاصيل المستخدم</span>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer' }}>
                <XIcon size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: `${COLORS.accent}15`,
                border: `1px solid ${COLORS.accent}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 700, color: COLORS.accent,
                fontFamily: "'Cairo', sans-serif",
              }}>
                {selectedUser.displayName.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>{selectedUser.displayName}</div>
                <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }} dir="ltr">{selectedUser.email}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'المستوى', value: getTierStyle(selectedUser.tier).label, icon: Shield, color: getTierStyle(selectedUser.tier).color },
                { label: 'الصفقات', value: `${selectedUser.tradeCount}`, icon: TrendingUp, color: COLORS.accent },
                { label: 'المراكز المفتوحة', value: `${selectedUser.openPositions}`, icon: Activity, color: COLORS.amber },
                { label: 'آخر نشاط', value: formatDate(selectedUser.lastActive), icon: Clock, color: COLORS.muted },
              ].map((item, i) => {
                const ItemIcon = item.icon
                return (
                  <div key={i} style={{
                    padding: 12, borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <ItemIcon size={10} color={item.color} />
                      <span style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{item.label}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
