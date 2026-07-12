'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { getDirection } from '@/lib/i18n-utils'
import T from '@/lib/unified-tokens';
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
  bg: T.bg,
  card: '#111318',
  accent: T.info,
  success: T.success,
  danger: T.danger,
  amber: T.warning,
  text: T.text,
  muted: T.text2,
  border: 'rgba(0,229,255,0.08)',
}

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(0,229,255,0.08)',
  borderRadius: 'var(--radius-lg)',
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
      return { bg: 'rgba(179,136,255,0.10)', border: 'rgba(179,136,255,0.25)', color: T.council, label: 'مؤسسي' }
    default:
      return { bg: 'rgba(139,146,168,0.10)', border: 'rgba(139,146,168,0.25)', color: COLORS.muted, label: 'مجاني' }
  }
}

export default function AdminUsersPage() {
  const tn = useTranslations('notifications.admin')
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
  // BUG-047: Delete user modal state
  const [deleteModalUser, setDeleteModalUser] = useState<AdminUser | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteResult, setDeleteResult] = useState<{ success: boolean; message: string } | null>(null)

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
      if (!res.ok) throw new Error('فشل في جلب الإحصائيات')
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

  // BUG-047: Delete user handler — sends DELETE /api/admin/users/[userId]
  // with confirmation token. The backend cascades deletion to all related data
  // (orders, positions, trades, credentials, auditLogs, etc.) and blocks
  // self-deletion. The audit trail is preserved by logging under admin's userId.
  const handleDeleteUser = async () => {
    if (!deleteModalUser) return
    if (deleteConfirmText !== 'حذف') {
      setDeleteResult({ success: false, message: 'اكتب "حذف" للتأكيد' })
      return
    }

    setDeleteLoading(true)
    setDeleteResult(null)
    try {
      const res = await fetch(`/api/admin/users/${deleteModalUser.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setDeleteResult({
          success: true,
          message: data.message || `تم حذف المستخدم ${deleteModalUser.displayName || deleteModalUser.email} بنجاح`,
        })
        // Close modal after short delay so user sees the success message
        setTimeout(() => {
          setDeleteModalUser(null)
          setDeleteConfirmText('')
          setDeleteResult(null)
          setSelectedUser(null)
          fetchUsers()
        }, 1800)
      } else {
        setDeleteResult({
          success: false,
          message: data.error || data.message || 'فشل في حذف المستخدم',
        })
      }
    } catch (err: any) {
      setDeleteResult({
        success: false,
        message: err?.message || 'خطأ في الاتصال بالخادم',
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  const closeDeleteModal = () => {
    setDeleteModalUser(null)
    setDeleteConfirmText('')
    setDeleteResult(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: COLORS.text, fontFamily: "var(--font-ar)", margin: 0 }}>إدارة المستخدمين</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: COLORS.muted, fontFamily: "var(--font-ar)", margin: '4px 0 0' }}>{total} مستخدم مسجل</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setHideGuests(!hideGuests)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 'var(--radius-md)',
              border: `1px solid ${hideGuests ? COLORS.success + '40' : COLORS.border}`,
              background: hideGuests ? 'rgba(0,230,118,0.08)' : 'rgba(255,255,255,0.03)',
              color: hideGuests ? COLORS.success : COLORS.muted,
              fontSize: 'var(--text-xs)', fontWeight: 600, fontFamily: "var(--font-ar)", cursor: 'pointer',
            }}
          >
            {hideGuests ? 'إخفاء الوهميين' : 'عرض الكل'}
          </button>
          <button
            onClick={handleCleanupPhantoms}
            disabled={cleanupLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 'var(--radius-md)',
              border: `1px solid ${COLORS.danger}40`, background: 'rgba(255,82,82,0.08)',
              color: COLORS.danger, fontSize: 'var(--text-xs)', fontWeight: 600,
              fontFamily: "var(--font-ar)", cursor: cleanupLoading ? 'not-allowed' : 'pointer',
              opacity: cleanupLoading ? 0.6 : 1,
            }}
          >
            <Trash2 size={13} /> {cleanupLoading ? 'جارٍ التنظيف...' : 'تنظيف الوهميين'}
          </button>
          <button
            onClick={fetchUsers}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 'var(--radius-md)',
              border: `1px solid ${COLORS.border}`, background: 'rgba(0,229,255,0.06)',
              color: COLORS.accent, fontSize: 'var(--text-sm)', fontWeight: 600,
              fontFamily: "var(--font-ar)", cursor: 'pointer',
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
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          background: cleanupResult.deletedCount > 0 ? `${COLORS.success}10` : `${COLORS.amber}10`,
          border: `1px solid ${cleanupResult.deletedCount > 0 ? COLORS.success + '25' : COLORS.amber + '25'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trash2 size={16} color={cleanupResult.deletedCount > 0 ? COLORS.success : COLORS.amber} />
            <span style={{ fontSize: 'var(--text-sm)', color: cleanupResult.deletedCount > 0 ? COLORS.success : COLORS.amber, fontFamily: "var(--font-ar)" }}>
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
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          background: `${COLORS.danger}10`, border: `1px solid ${COLORS.danger}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={16} color={COLORS.danger} />
            <span style={{ fontSize: 'var(--text-sm)', color: COLORS.danger, fontFamily: "var(--font-ar)" }}>
              {error}
            </span>
          </div>
          <button
            onClick={fetchUsers}
            style={{
              padding: '4px 10px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${COLORS.danger}40`, background: `${COLORS.danger}10`,
              color: COLORS.danger, fontSize: 'var(--text-xs)', fontWeight: 600,
              fontFamily: "var(--font-ar)", cursor: 'pointer',
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
          padding: '8px 12px', borderRadius: 'var(--radius-md)',
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
              color: COLORS.text, fontSize: 'var(--text-sm)', fontFamily: "var(--font-ar)",
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
              padding: '8px 14px', borderRadius: 'var(--radius-md)',
              border: `1px solid ${COLORS.border}`, background: 'rgba(255,255,255,0.03)',
              color: COLORS.muted, fontSize: 'var(--text-sm)', fontFamily: "var(--font-ar)", cursor: 'pointer',
            }}
          >
            <Filter size={14} />
            {tierFilter === 'all' ? 'المستوى' : getTierStyle(tierFilter).label}
            <ChevronDown size={12} />
          </button>
          {showFilter && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: '#161B22', border: `1px solid ${COLORS.border}`, borderRadius: 'var(--radius-md)',
              padding: 4, zIndex: 50, minWidth: 140,
            }}>
              {['all', 'FREE', 'PRO', 'PLUS', 'PREMIUM', 'INSTITUTIONAL'].map(tier => (
                <button
                  key={tier}
                  onClick={() => { setTierFilter(tier); setShowFilter(false); setPage(1) }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                    border: 'none', background: tierFilter === tier ? 'rgba(0,229,255,0.10)' : 'transparent',
                    color: tierFilter === tier ? COLORS.accent : COLORS.muted,
                    fontSize: 'var(--text-sm)', fontFamily: "var(--font-ar)", cursor: 'pointer', textAlign: 'right',
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                {['الاسم', 'البريد', 'المستوى', 'الصفقات', 'المراكز المفتوحة', 'أول تسجيل', 'آخر نشاط'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'right',
                    fontSize: 'var(--text-xs)', fontWeight: 700, color: COLORS.muted,
                    fontFamily: "var(--font-ar)", whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "var(--font-ar)" }}>
                    جارٍ التحميل...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "var(--font-ar)" }}>
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
                            width: 30, height: 30, borderRadius: 'var(--radius-md)',
                            background: `${COLORS.accent}15`,
                            border: `1px solid ${COLORS.accent}25`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 'var(--text-sm)', fontWeight: 700, color: COLORS.accent,
                            fontFamily: "var(--font-ar)",
                          }}>
                            {user.displayName.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 600, color: COLORS.text, fontFamily: "var(--font-ar)" }}>{user.displayName}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)', color: COLORS.muted }} dir="ltr">{user.email}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                          background: tierStyle.bg, border: `1px solid ${tierStyle.border}`,
                          color: tierStyle.color, fontSize: 'var(--text-xs)', fontWeight: 700,
                          fontFamily: "var(--font-ar)",
                        }}>
                          {tierStyle.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)', color: COLORS.text }}>{user.tradeCount}</td>
                      <td style={{ padding: '10px 14px', fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)', color: COLORS.accent }}>{user.openPositions}</td>
                      <td style={{ padding: '10px 14px', fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)" }}>{formatDate(user.createdAt)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)" }}>{formatDate(user.lastActive)}</td>
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
              padding: '6px 10px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${COLORS.border}`,
              background: page === 1 ? 'transparent' : 'rgba(0,229,255,0.06)',
              color: page === 1 ? COLORS.muted : COLORS.accent,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontSize: 'var(--text-sm)', fontFamily: "var(--font-ar)",
            }}
          >
            <ChevronRight size={14} />
          </button>
          <span style={{ fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-mono)" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '6px 10px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${COLORS.border}`,
              background: page === totalPages ? 'transparent' : 'rgba(0,229,255,0.06)',
              color: page === totalPages ? COLORS.muted : COLORS.accent,
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              fontSize: 'var(--text-sm)', fontFamily: "var(--font-ar)",
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
              <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: COLORS.text, fontFamily: "var(--font-ar)" }}>تفاصيل المستخدم</span>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer' }}>
                <XIcon size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 'var(--radius-lg)',
                background: `${COLORS.accent}15`,
                border: `1px solid ${COLORS.accent}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-lg)', fontWeight: 700, color: COLORS.accent,
                fontFamily: "var(--font-ar)",
              }}>
                {selectedUser.displayName.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: COLORS.text, fontFamily: "var(--font-ar)" }}>{selectedUser.displayName}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-mono)" }} dir="ltr">{selectedUser.email}</div>
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
                    padding: 12, borderRadius: 'var(--radius-md)',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <ItemIcon size={10} color={item.color} />
                      <span style={{ fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)" }}>{item.label}</span>
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: item.color, fontFamily: "var(--font-mono)" }}>{item.value}</div>
                  </div>
                )
              })}
            </div>

            {/* BUG-047: Delete User Button */}
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between',
              padding: 12, borderRadius: 'var(--radius-md)',
              background: `${COLORS.danger}08`,
              border: `1px solid ${COLORS.danger}20`,
              marginTop: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trash2 size={14} color={COLORS.danger} />
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: COLORS.danger, fontFamily: "var(--font-ar)" }}>
                    حذف الحساب نهائياً
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)" }}>
                    سيتم حذف المستخدم وجميع بياناته (الصفقات، المراكز، الاعتمادات، سجلات التدقيق)
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setDeleteModalUser(selectedUser)
                  setSelectedUser(null)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${COLORS.danger}40`,
                  background: `${COLORS.danger}15`,
                  color: COLORS.danger,
                  fontSize: 'var(--text-xs)', fontWeight: 700,
                  fontFamily: "var(--font-ar)", cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Trash2 size={12} /> حذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BUG-047: Delete User Confirmation Modal */}
      {deleteModalUser && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
          onClick={closeDeleteModal}
        >
          <div
            style={{
              ...CARD_STYLE,
              padding: 24,
              width: '100%',
              maxWidth: 460,
              background: '#161B22',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-lg)',
                  background: `${COLORS.danger}15`,
                  border: `1px solid ${COLORS.danger}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trash2 size={18} color={COLORS.danger} />
                </div>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: COLORS.danger, fontFamily: "var(--font-ar)" }}>
                  تأكيد حذف الحساب
                </span>
              </div>
              <button onClick={closeDeleteModal} style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer' }}>
                <XIcon size={18} />
              </button>
            </div>

            {/* Warning Box */}
            <div style={{
              padding: 12, borderRadius: 'var(--radius-md)', marginBottom: 16,
              background: `${COLORS.danger}08`,
              border: `1px solid ${COLORS.danger}20`,
            }}>
              <p style={{ fontSize: 'var(--text-xs)', color: COLORS.danger, fontFamily: "var(--font-ar)", margin: 0, lineHeight: 1.6 }}>
                ⚠️ <strong>تحذير:</strong> هذا الإجراء <strong>لا يمكن التراجع عنه</strong>. سيتم حذف:
              </p>
              <ul style={{ fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)", margin: '8px 0 0 0', paddingRight: 18, lineHeight: 1.7 }}>
                <li>المستخدم: <span style={{ color: COLORS.text, fontWeight: 600 }}>{deleteModalUser.displayName || deleteModalUser.email}</span></li>
                <li>{deleteModalUser.tradeCount} صفقة</li>
                <li>{deleteModalUser.openPositions} مركز مفتوح</li>
                <li>{deleteModalUser.orderCount} أمر</li>
                <li>جميع الاعتمادات والمحافظ وسجلات التدقيق</li>
              </ul>
            </div>

            {/* Confirmation Input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: COLORS.text, fontFamily: "var(--font-ar)", display: 'block', marginBottom: 6 }}>
                اكتب <span style={{ color: COLORS.danger, fontWeight: 700, fontFamily: "var(--font-mono)" }}>حذف</span> للتأكيد:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="حذف"
                dir="rtl"
                autoFocus
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${deleteConfirmText === 'حذف' ? COLORS.danger + '40' : COLORS.border}`,
                  color: COLORS.text, fontSize: 'var(--text-sm)',
                  fontFamily: "var(--font-ar)", outline: 'none',
                }}
              />
            </div>

            {/* Result Banner */}
            {deleteResult && (
              <div style={{
                padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 12,
                background: deleteResult.success ? `${COLORS.success}10` : `${COLORS.danger}10`,
                border: `1px solid ${deleteResult.success ? COLORS.success + '25' : COLORS.danger + '25'}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {deleteResult.success ? (
                  <RefreshCw size={12} color={COLORS.success} className="animate-spin" />
                ) : (
                  <AlertCircle size={12} color={COLORS.danger} />
                )}
                <span style={{ fontSize: 'var(--text-xs)', fontFamily: "var(--font-ar)", color: deleteResult.success ? COLORS.success : COLORS.danger }}>
                  {deleteResult.message}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={closeDeleteModal}
                disabled={deleteLoading}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${COLORS.border}`,
                  background: 'rgba(255,255,255,0.03)',
                  color: COLORS.muted, fontSize: 'var(--text-xs)', fontWeight: 600,
                  fontFamily: "var(--font-ar)", cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  opacity: deleteLoading ? 0.6 : 1,
                }}
              >
                إلغاء
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteLoading || deleteConfirmText !== 'حذف'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${COLORS.danger}40`,
                  background: deleteConfirmText === 'حذف' && !deleteLoading ? `${COLORS.danger}20` : `${COLORS.danger}08`,
                  color: COLORS.danger, fontSize: 'var(--text-xs)', fontWeight: 700,
                  fontFamily: "var(--font-ar)",
                  cursor: deleteLoading || deleteConfirmText !== 'حذف' ? 'not-allowed' : 'pointer',
                  opacity: deleteLoading || deleteConfirmText !== 'حذف' ? 0.5 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {deleteLoading ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    جارٍ الحذف...
                  </>
                ) : (
                  <>
                    <Trash2 size={12} />
                    حذف نهائي
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
