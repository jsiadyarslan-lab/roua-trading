'use client'

import { useState, useEffect } from 'react'
import {
  Users,
  TrendingUp,
  BarChart3,
  Target,
  Activity,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Shield,
  Server,
  Clock,
} from 'lucide-react'

interface AdminStats {
  users: { total: number; free: number; premium: number; institutional: number }
  trading: { dailyTrades: number; volume: number; winRate: number; activePositions: number }
  system: { uptime: string; lastCheck: string; endpoints: { path: string; status: string; responseTime: number }[] }
}

interface ActivityItem {
  id: string
  type: string
  message: string
  time: string
  color: string
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

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activities] = useState<ActivityItem[]>([
    { id: '1', type: 'user', message: 'مستخدم جديد: أحمد محمد', time: 'منذ 5 دقائق', color: COLORS.accent },
    { id: '2', type: 'trade', message: 'صفقة كبيرة: BTC/USD 2.5 BTC', time: 'منذ 12 دقيقة', color: COLORS.success },
    { id: '3', type: 'alert', message: 'تنبيه: استخدام الذاكرة 85%', time: 'منذ 30 دقيقة', color: COLORS.amber },
    { id: '4', type: 'system', message: 'تحديث: تم تجديد شهادة SSL', time: 'منذ ساعة', color: COLORS.accent },
    { id: '5', type: 'error', message: 'خطأ: فشل الاتصال بـ Binance', time: 'منذ ساعتين', color: COLORS.danger },
    { id: '6', type: 'user', message: 'ترقية: سارة علي → PREMIUM', time: 'منذ 3 ساعات', color: COLORS.success },
  ])

  const fetchStats = async () => {
    try {
      const res = await fetch('/dashboard/admin/api/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch {
      // Use fallback data
      setStats({
        users: { total: 142, free: 98, premium: 35, institutional: 9 },
        trading: { dailyTrades: 87, volume: 245800, winRate: 68.5, activePositions: 23 },
        system: {
          uptime: '99.9%',
          lastCheck: new Date().toISOString(),
          endpoints: [
            { path: '/api/health', status: 'healthy', responseTime: 45 },
            { path: '/api/auth/session', status: 'healthy', responseTime: 120 },
            { path: '/api/exchange/quote/AAPL', status: 'healthy', responseTime: 230 },
            { path: '/api/scanner/scan', status: 'warning', responseTime: 890 },
            { path: '/api/signals/smart', status: 'healthy', responseTime: 340 },
            { path: '/api/portfolio/summary', status: 'healthy', responseTime: 180 },
          ],
        },
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const statCards = [
    {
      label: 'إجمالي المستخدمين',
      value: stats?.users.total ?? '—',
      sub: stats ? `${stats.users.free} مجاني | ${stats.users.premium} مميز | ${stats.users.institutional} مؤسسي` : '',
      icon: Users,
      color: COLORS.accent,
      trend: '+12%',
      trendUp: true,
    },
    {
      label: 'الصفقات اليومية',
      value: stats?.trading.dailyTrades ?? '—',
      sub: 'مقارنة بأمس',
      icon: TrendingUp,
      color: COLORS.success,
      trend: '+8%',
      trendUp: true,
    },
    {
      label: 'حجم التداول',
      value: stats?.trading.volume ? `$${(stats.trading.volume / 1000).toFixed(1)}K` : '—',
      sub: 'اليوم',
      icon: BarChart3,
      color: COLORS.amber,
      trend: '-3%',
      trendUp: false,
    },
    {
      label: 'نسبة النجاح',
      value: stats ? `${stats.trading.winRate}%` : '—',
      sub: 'آخر 30 يوم',
      icon: Target,
      color: COLORS.success,
      trend: '+2.1%',
      trendUp: true,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>نظرة عامة على النظام</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>لوحة تحكم الإدارة المركزية</p>
        </div>
        <button
          onClick={fetchStats}
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

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {statCards.map((card, i) => {
          const Icon = card.icon
          return (
            <div key={i} style={{
              ...CARD_STYLE,
              animation: `fadeInSlideUp 0.4s ease-out ${i * 0.05}s both`,
            }}>
              {/* Glow */}
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
              {card.trend && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
                  {card.trendUp ? (
                    <ArrowUpRight size={12} color={COLORS.success} />
                  ) : (
                    <ArrowDownRight size={12} color={COLORS.danger} />
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, color: card.trendUp ? COLORS.success : COLORS.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                    {card.trend}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* System Health + Recent Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* System Health */}
        <div style={{
          ...CARD_STYLE,
          padding: 0,
        }}>
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
            {stats?.system.endpoints.map((ep, i) => (
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
            )) ?? (
              <div style={{ textAlign: 'center', padding: 20, color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>
                {loading ? 'جارٍ التحميل...' : 'لا توجد بيانات'}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{
          ...CARD_STYLE,
          padding: 0,
        }}>
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
            {activities.map((item) => (
              <div key={item.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: item.color,
                  boxShadow: `0 0 4px ${item.color}`,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: COLORS.text, fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.message}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <Clock size={10} color={COLORS.muted} />
                  <span style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{
        ...CARD_STYLE,
        padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Zap size={14} color={COLORS.amber} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>إجراءات سريعة</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'فحص النظام', icon: Shield, color: COLORS.accent },
            { label: 'إعادة تشغيل البوت', icon: RefreshCw, color: COLORS.amber },
            { label: 'تصدير التقارير', icon: BarChart3, color: COLORS.success },
            { label: 'إدارة المستخدمين', icon: Users, color: COLORS.accent },
          ].map((action, i) => {
            const ActionIcon = action.icon
            return (
              <button
                key={i}
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
