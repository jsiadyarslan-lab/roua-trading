'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  Search,
  Filter,
  X,
  Mail,
  Shield,
  TrendingUp,
  Clock,
  ChevronDown,
  RefreshCw,
} from 'lucide-react'

interface AdminUser {
  id: string
  displayName: string
  email: string
  tier: string
  trades: number
  balance: number
  status: string
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
    case 'PREMIUM':
      return { bg: 'rgba(0,230,118,0.10)', border: 'rgba(0,230,118,0.25)', color: COLORS.success, label: 'مميز' }
    case 'INSTITUTIONAL':
      return { bg: 'rgba(0,229,255,0.10)', border: 'rgba(0,229,255,0.25)', color: COLORS.accent, label: 'مؤسسي' }
    default:
      return { bg: 'rgba(139,146,168,0.10)', border: 'rgba(139,146,168,0.25)', color: COLORS.muted, label: 'مجاني' }
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'active':
      return { color: COLORS.success, label: 'نشط' }
    case 'suspended':
      return { color: COLORS.danger, label: 'معلق' }
    case 'inactive':
      return { color: COLORS.muted, label: 'غير نشط' }
    default:
      return { color: COLORS.muted, label: status }
  }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [showFilter, setShowFilter] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/dashboard/admin/api/stats')
      if (res.ok) {
        // Generate mock users from stats
        const stats = await res.json()
        const mockUsers: AdminUser[] = []
        const names = ['أحمد محمد', 'سارة علي', 'خالد حسن', 'فاطمة عمر', 'يوسف كريم', 'نورة سعيد', 'عمر أحمد', 'ليلى محمد', 'حسين علي', 'مريم خالد', 'عبدالله سلطان', 'ريم فهد', 'طارق زياد', 'هند بدر', 'سلمان ناصر']
        const statuses = ['active', 'active', 'active', 'active', 'inactive', 'active', 'active', 'suspended', 'active', 'active', 'active', 'active', 'inactive', 'active', 'active']
        const tiers = ['FREE', 'FREE', 'PREMIUM', 'FREE', 'PREMIUM', 'INSTITUTIONAL', 'FREE', 'FREE', 'PREMIUM', 'FREE', 'INSTITUTIONAL', 'FREE', 'FREE', 'PREMIUM', 'FREE']

        for (let i = 0; i < Math.min(15, stats.users.total); i++) {
          mockUsers.push({
            id: `user-${i + 1}`,
            displayName: names[i] || `مستخدم ${i + 1}`,
            email: `user${i + 1}@roua.ai`,
            tier: tiers[i] || 'FREE',
            trades: Math.floor(Math.random() * 500),
            balance: Math.floor(Math.random() * 100000),
            status: statuses[i] || 'active',
            lastActive: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
        }
        setUsers(mockUsers)
      }
    } catch {
      // Fallback mock data
      const mockUsers: AdminUser[] = []
      const names = ['أحمد محمد', 'سارة علي', 'خالد حسن', 'فاطمة عمر', 'يوسف كريم', 'نورة سعيد', 'عمر أحمد', 'ليلى محمد', 'حسين علي', 'مريم خالد']
      for (let i = 0; i < 10; i++) {
        mockUsers.push({
          id: `user-${i + 1}`,
          displayName: names[i],
          email: `user${i + 1}@roua.ai`,
          tier: ['FREE', 'PREMIUM', 'INSTITUTIONAL'][i % 3],
          trades: Math.floor(Math.random() * 500),
          balance: Math.floor(Math.random() * 100000),
          status: i === 7 ? 'suspended' : i === 4 ? 'inactive' : 'active',
          lastActive: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
      }
      setUsers(mockUsers)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const filteredUsers = users.filter(u => {
    const matchSearch = !search || u.displayName.includes(search) || u.email.toLowerCase().includes(search.toLowerCase())
    const matchTier = tierFilter === 'all' || u.tier === tierFilter
    return matchSearch && matchTier
  })

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
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>{users.length} مستخدم مسجل</p>
        </div>
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
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: COLORS.text, fontSize: 12, fontFamily: "'Cairo', sans-serif",
            }}
            dir="rtl"
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer', padding: 0 }}>
              <X size={12} />
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
              {['all', 'FREE', 'PREMIUM', 'INSTITUTIONAL'].map(tier => (
                <button
                  key={tier}
                  onClick={() => { setTierFilter(tier); setShowFilter(false) }}
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
                {['الاسم', 'البريد', 'المستوى', 'الصفقات', 'الرصيد', 'الحالة', 'آخر نشاط'].map(h => (
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
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                    لا توجد نتائج
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, i) => {
                  const tierStyle = getTierStyle(user.tier)
                  const statusStyle = getStatusStyle(user.status)
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
                      <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.text }}>{user.trades}</td>
                      <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.success }}>${user.balance.toLocaleString()}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusStyle.color }} />
                          <span style={{ fontSize: 10, color: statusStyle.color, fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>{statusStyle.label}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{formatDate(user.lastActive)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                <X size={18} />
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
                { label: 'الصفقات', value: `${selectedUser.trades}`, icon: TrendingUp, color: COLORS.accent },
                { label: 'الرصيد', value: `$${selectedUser.balance.toLocaleString()}`, icon: Mail, color: COLORS.success },
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

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{
                flex: 1, padding: '10px', borderRadius: 8,
                border: `1px solid ${COLORS.success}25`, background: `${COLORS.success}08`,
                color: COLORS.success, fontSize: 12, fontWeight: 600,
                fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              }}>
                ترقية المستخدم
              </button>
              <button style={{
                flex: 1, padding: '10px', borderRadius: 8,
                border: `1px solid ${COLORS.danger}25`, background: `${COLORS.danger}08`,
                color: COLORS.danger, fontSize: 12, fontWeight: 600,
                fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              }}>
                تعليق الحساب
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
