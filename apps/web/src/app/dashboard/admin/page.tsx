'use client'

import { useState, useEffect } from 'react'
import {
  Users,
  TrendingUp,
  BarChart3,
  Target,
  Activity,
  RefreshCw,
  AlertCircle,
  Zap,
  Shield,
  Server,
  Clock,
  CreditCard,
  Brain,
} from 'lucide-react'

interface AdminStats {
  users: { total: number; free: number; pro: number; plus: number; premium: number; institutional: number }
  trading: { dailyTrades: number; volume: number; winRate: number; activePositions: number }
  system: { uptime: string; lastCheck: string; endpoints: { path: string; status: string; responseTime: number }[] }
  error?: string
}

interface ActivityItem {
  id: string
  action: string
  resource: string
  details: string | null
  userEmail: string | null
  userName: string | null
  createdAt: string
}

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(0,229,255,0.08)',
  borderRadius: 10,
  padding: 20,
  position: 'relative',
  overflow: 'hidden',
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

function getActivityIcon(action: string) {
  if (action.includes('user') || action.includes('register') || action.includes('signup')) return { icon: '👤', color: COLORS.accent }
  if (action.includes('trade') || action.includes('order')) return { icon: '📊', color: COLORS.success }
  if (action.includes('error') || action.includes('fail')) return { icon: '⚠️', color: COLORS.danger }
  if (action.includes('upgrade') || action.includes('subscription')) return { icon: '⬆️', color: COLORS.amber }
  if (action.includes('system') || action.includes('update')) return { icon: '🔧', color: COLORS.accent }
  return { icon: '📋', color: COLORS.muted }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `منذ ${mins} دقيقة`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} ساعة`
  const days = Math.floor(hours / 24)
  return `منذ ${days} يوم`
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    try {
      const res = await fetch('/dashboard/admin/api/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
        setError(null)
      } else {
        setError('فشل في جلب البيانات من الخادم')
      }
    } catch {
      setError('فشل في جلب البيانات من الخادم')
    }
  }

  const fetchActivity = async () => {
    try {
      const res = await fetch('/dashboard/admin/api/activity?limit=20')
      if (res.ok) {
        const data = await res.json()
        setActivities(data.activities || [])
      }
    } catch {
      // Activity fetch failure is non-critical, don't override stats error
    }
  }

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchStats(), fetchActivity()])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30000)
    return () => clearInterval(interval)
  }, [])

  const statCards = [
    {
      label: 'إجمالي المستخدمين',
      value: stats?.users.total ?? '—',
      sub: stats ? `${stats.users.free} مجاني | ${stats.users.pro} برو | ${stats.users.plus} بلس` : '',
      icon: Users,
      color: COLORS.accent,
    },
    {
      label: 'الصفقات اليومية',
      value: stats?.trading.dailyTrades ?? '—',
      sub: 'اليوم',
      icon: TrendingUp,
      color: COLORS.success,
    },
    {
      label: 'حجم التداول',
      value: stats?.trading.volume ? `$${(stats.trading.volume / 1000).toFixed(1)}K` : '—',
      sub: 'اليوم',
      icon: BarChart3,
      color: COLORS.amber,
    },
    {
      label: 'نسبة النجاح',
      value: stats ? `${stats.trading.winRate}%` : '—',
      sub: 'آخر 30 يوم',
      icon: Target,
      color: COLORS.success,
    },
  ]

  const hasDbError = stats?.error

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>نظرة عامة على النظام</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>لوحة تحكم الإدارة المركزية</p>
        </div>
        <button
          onClick={fetchAll}
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

      {/* Fetch Error Banner */}
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
            onClick={fetchAll}
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

      {/* DB Error Banner */}
      {hasDbError && (
        <div style={{
          padding: '12px 16px', borderRadius: 8,
          background: `${COLORS.amber}10`, border: `1px solid ${COLORS.amber}25`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Shield size={16} color={COLORS.amber} />
          <span style={{ fontSize: 12, color: COLORS.amber, fontFamily: "'Cairo', sans-serif" }}>
            {stats.error} — البيانات المعروضة قد لا تكون مكتملة
          </span>
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {statCards.map((card, i) => {
          const Icon = card.icon
          return (
            <div key={i} style={{
              ...CARD_STYLE,
              animation: `fadeInSlideUp 0.4s ease-out ${i * 0.05}s both`,
            }}>
              <div style={{
                position: 'absolute', top: -20, right: -20,
                width: 80, height: 80,
                background: card.color,
                filter: 'blur(40px)',
                opacity: 0.08,
                pointerEvents: 'none',
              }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>{card.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{card.value}</div>
                  <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginTop: 6 }}>{card.sub}</div>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${card.color}15`,
                  border: `1px solid ${card.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={18} color={card.color} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {[
          { label: 'مجاني', value: stats?.users.free ?? 0, color: COLORS.muted, icon: Users },
          { label: 'برو', value: stats?.users.pro ?? 0, color: COLORS.accent, icon: CreditCard },
          { label: 'بلس', value: stats?.users.plus ?? 0, color: COLORS.amber, icon: CreditCard },
          { label: 'مميز', value: stats?.users.premium ?? 0, color: COLORS.success, icon: CreditCard },
          { label: 'مؤسسي', value: stats?.users.institutional ?? 0, color: '#B388FF', icon: Shield },
          { label: 'مراكز مفتوحة', value: stats?.trading.activePositions ?? 0, color: COLORS.accent, icon: Activity },
        ].map((item, i) => {
          const Icon = item.icon
          return (
            <div key={i} style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${COLORS.border}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Icon size={14} color={item.color} />
              <div>
                <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* System Health + Recent Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* System Health */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Server size={14} color={COLORS.accent} />
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>صحة النظام</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.success, boxShadow: `0 0 6px ${COLORS.success}` }} />
              <span style={{ fontSize: 10, color: COLORS.success, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                وقت التشغيل: {stats?.system.uptime ?? '—'}
              </span>
            </div>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }} className="custom-scrollbar">
            {stats?.system.endpoints.length ? stats.system.endpoints.map((ep, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: ep.status === 'healthy' ? COLORS.success : ep.status === 'warning' ? COLORS.amber : COLORS.danger,
                    boxShadow: `0 0 6px ${ep.status === 'healthy' ? COLORS.success : ep.status === 'warning' ? COLORS.amber : COLORS.danger}`,
                  }} />
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: COLORS.text }} dir="ltr">{ep.path}</span>
                </div>
                <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: COLORS.muted }}>{ep.responseTime}ms</span>
              </div>
            )) : (
              <div style={{ textAlign: 'center', padding: 20, color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>
                {loading ? 'جارٍ التحميل...' : 'لا توجد بيانات'}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Activity size={14} color={COLORS.accent} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>النشاط الأخير</span>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }} className="custom-scrollbar">
            {activities.length > 0 ? activities.map((item) => {
              const act = getActivityIcon(item.action)
              return (
                <div key={item.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ fontSize: 14, flexShrink: 0 }}>{act.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: COLORS.text, fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.action} — {item.resource}
                      {item.details && <span style={{ color: COLORS.muted }}> {item.details}</span>}
                    </div>
                    {item.userEmail && (
                      <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }} dir="ltr">{item.userEmail}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Clock size={10} color={COLORS.muted} />
                    <span style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{timeAgo(item.createdAt)}</span>
                  </div>
                </div>
              )
            }) : (
              <div style={{ textAlign: 'center', padding: 20, color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>
                {loading ? 'جارٍ التحميل...' : 'لا يوجد نشاط مسجل بعد'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ ...CARD_STYLE, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Zap size={14} color={COLORS.amber} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>إجراءات سريعة</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'فحص النظام', icon: Shield, color: COLORS.accent },
            { label: 'إدارة الاشتراكات', icon: CreditCard, color: COLORS.amber },
            { label: 'مراقبة AI', icon: Brain, color: '#B388FF' },
            { label: 'إدارة المستخدمين', icon: Users, color: COLORS.accent },
          ].map((action, i) => {
            const ActionIcon = action.icon
            return (
              <button
                key={i}
                onClick={() => {
                  const paths = ['/dashboard/admin/health', '/dashboard/admin/subscriptions', '/dashboard/admin/ai-costs', '/dashboard/admin/users']
                  window.location.href = paths[i]
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8,
                  border: `1px solid ${action.color}25`,
                  background: `${action.color}08`,
                  color: action.color, fontSize: 11, fontWeight: 600,
                  fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <ActionIcon size={14} />
                {action.label}
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes fadeInSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 2px; }
        @media (max-width: 900px) {
          .admin-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
