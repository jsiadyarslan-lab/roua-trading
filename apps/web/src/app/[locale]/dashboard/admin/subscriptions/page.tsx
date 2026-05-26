'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard,
  RefreshCw,
  Users,
  TrendingDown,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { useScopedStyle } from '@/hooks/useScopedStyle'

/* ── design tokens ── */
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
  purple: '#B388FF',
}

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(0,229,255,0.08)',
  borderRadius: 10,
  padding: 20,
  position: 'relative',
  overflow: 'hidden',
}

/* ── tier helpers ── */
const TIER_CONFIG = [
  { key: 'FREE' as const, label: 'مجاني', color: '#8B92A8' },
  { key: 'PRO' as const, label: 'برو', color: '#00E5FF' },
  { key: 'PLUS' as const, label: 'بلس', color: '#FFB800' },
  { key: 'PREMIUM' as const, label: 'مميز', color: '#00E676' },
  { key: 'INSTITUTIONAL' as const, label: 'مؤسسي', color: '#B388FF' },
]

function getTierLabel(tier: string): string {
  const map: Record<string, string> = {
    FREE: 'مجاني', PRO: 'برو', PLUS: 'بلس', PREMIUM: 'مميز', INSTITUTIONAL: 'مؤسسي',
  }
  return map[tier] || tier
}

function getTierColor(tier: string): string {
  const map: Record<string, string> = {
    FREE: '#8B92A8', PRO: '#00E5FF', PLUS: '#FFB800', PREMIUM: '#00E676', INSTITUTIONAL: '#B388FF',
  }
  return map[tier] || '#8B92A8'
}

/* ── types ── */
interface TiersData {
  FREE: number
  PRO: number
  PLUS: number
  PREMIUM: number
  INSTITUTIONAL: number
  total: number
}

interface RegistrationsData {
  today: number
  week: number
  month: number
  year: number
}

interface SubscriptionsData {
  active: number
  cancelled: number
  total: number
  churnRate: number
}

interface RecentChange {
  id: string
  tier: string
  previousTier: string | null
  status: string
  amount: number | null
  startDate: string
  createdAt: string
}

interface SubsApiResponse {
  tiers: TiersData
  registrations: RegistrationsData
  subscriptions: SubscriptionsData
  recentChanges: RecentChange[]
  dailyRegistrations: Record<string, { total: number }>
  error?: string
}

type RegPeriod = 'يومي' | 'أسبوعي' | 'شهري' | 'سنوي'

export default function AdminSubscriptionsPage() {
  useScopedStyle(`@keyframes fadeInSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 900px) {
          [style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }`)

  const [data, setData] = useState<SubsApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [regPeriod, setRegPeriod] = useState<RegPeriod>('شهري')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/subscriptions/stats')
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setError(null)
      } else {
        setError('فشل في جلب البيانات من الخادم')
      }
    } catch {
      setError('فشل في جلب البيانات من الخادم')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  const regPeriodMap: Record<RegPeriod, keyof RegistrationsData> = {
    'يومي': 'today',
    'أسبوعي': 'week',
    'شهري': 'month',
    'سنوي': 'year',
  }

  const regPeriodLabelsAr: Record<RegPeriod, string> = {
    'يومي': 'اليوم',
    'أسبوعي': 'هذا الأسبوع',
    'شهري': 'هذا الشهر',
    'سنوي': 'هذا العام',
  }

  const formatDate = (iso: string) => {
  

    const d = new Date(iso)
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const totalUsers = data?.tiers?.total ?? 0

  const hasSubscriptionData = data && (data.subscriptions?.total > 0)
  const hasRecentChanges = data && Array.isArray(data.recentChanges) && data.recentChanges.length > 0
  const isAllEmpty = data && totalUsers === 0 && (data.subscriptions?.total ?? 0) === 0 && (!data.recentChanges || data.recentChanges.length === 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>
            إدارة الاشتراكات
          </h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>
            إحصائيات المستويات والتسجيلات والاشتراكات
          </p>
        </div>
        <button
          onClick={fetchData}
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
            onClick={fetchData}
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

      {/* 5 Tier Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {TIER_CONFIG.map((tier, i) => {
          const count = data?.tiers[tier.key] ?? 0
          const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0
          return (
            <div key={tier.key} style={{
              ...CARD_STYLE,
              animation: `fadeInSlideUp 0.4s ease-out ${i * 0.05}s both`,
            }}>
              {/* Glow effect */}
              <div style={{
                position: 'absolute', top: -20, right: -20,
                width: 80, height: 80,
                background: tier.color,
                filter: 'blur(40px)',
                opacity: 0.12,
                pointerEvents: 'none',
                borderRadius: '50%',
              }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: `${tier.color}15`,
                  border: `1px solid ${tier.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CreditCard size={16} color={tier.color} />
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: tier.color,
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: '2px 6px', borderRadius: 4,
                  background: `${tier.color}10`, border: `1px solid ${tier.color}20`,
                }}>
                  {pct}%
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                {loading ? '—' : count}
              </div>
              <div style={{ fontSize: 11, color: tier.color, fontFamily: "'Cairo', sans-serif", marginTop: 4, fontWeight: 600 }}>
                {tier.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Registration Stats + Churn Rate */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Registration Stats */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Users size={14} color={COLORS.accent} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>التسجيلات الجديدة</span>
          </div>
          <div style={{ padding: 16 }}>
            {/* Tab selector */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
              {(['يومي', 'أسبوعي', 'شهري', 'سنوي'] as RegPeriod[]).map(period => (
                <button
                  key={period}
                  onClick={() => setRegPeriod(period)}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    border: `1px solid ${regPeriod === period ? COLORS.accent + '40' : COLORS.border}`,
                    background: regPeriod === period ? `${COLORS.accent}10` : 'transparent',
                    color: regPeriod === period ? COLORS.accent : COLORS.muted,
                    fontSize: 11, fontWeight: 600,
                    fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {period}
                </button>
              ))}
            </div>
            <div style={{
              padding: 24,
              borderRadius: 8,
              background: 'rgba(0,229,255,0.04)',
              border: `1px solid ${COLORS.accent}15`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: COLORS.accent, fontFamily: "'JetBrains Mono', monospace" }}>
                {loading ? '—' : (data?.registrations[regPeriodMap[regPeriod]] ?? 0)}
              </div>
              <div style={{ fontSize: 13, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginTop: 6 }}>
                مستخدم جديد — {regPeriodLabelsAr[regPeriod]}
              </div>
            </div>
          </div>
        </div>

        {/* Churn Rate Card */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <TrendingDown size={14} color={COLORS.danger} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>معدل الانسحاب</span>
          </div>
          <div style={{ padding: 16 }}>
            {!hasSubscriptionData ? (
              <div style={{
                padding: 40, textAlign: 'center',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 8, border: `1px solid ${COLORS.border}`,
              }}>
                <span style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                  لا توجد بيانات اشتراك بعد
                </span>
              </div>
            ) : (
              <>
                <div style={{
                  padding: 24,
                  borderRadius: 8,
                  background: 'rgba(255,82,82,0.04)',
                  border: `1px solid ${COLORS.danger}15`,
                  textAlign: 'center',
                  marginBottom: 16,
                }}>
                  <div style={{
                    fontSize: 40, fontWeight: 800,
                    color: (data?.subscriptions.churnRate ?? 0) > 5 ? COLORS.danger : COLORS.success,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {loading ? '—' : `${data?.subscriptions.churnRate ?? 0}%`}
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginTop: 6 }}>
                    معدل إلغاء الاشتراكات
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1, padding: 12, borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${COLORS.border}`,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace" }}>
                      {data?.subscriptions.total ?? 0}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>إجمالي الاشتراكات</div>
                  </div>
                  <div style={{
                    flex: 1, padding: 12, borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${COLORS.border}`,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                      {data?.subscriptions.cancelled ?? 0}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>ملغاة</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recent Subscription Changes Table */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Clock size={14} color={COLORS.amber} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>نشاط الاشتراكات الأخير</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
              جارٍ التحميل...
            </div>
          ) : isAllEmpty || !hasRecentChanges ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
              لا توجد بيانات بعد
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  {['المستوى الجديد', 'المستوى السابق', 'الحالة', 'المبلغ', 'التاريخ'].map(h => (
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
                {data!.recentChanges.map((sub, i) => (
                  <tr key={sub.id} style={{
                    borderBottom: `1px solid ${COLORS.border}`,
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4,
                        background: `${getTierColor(sub.tier)}10`,
                        border: `1px solid ${getTierColor(sub.tier)}25`,
                        color: getTierColor(sub.tier), fontSize: 10, fontWeight: 700,
                        fontFamily: "'Cairo', sans-serif",
                      }}>
                        {getTierLabel(sub.tier)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 11 }}>
                      {sub.previousTier ? (
                        <span style={{
                          padding: '2px 8px', borderRadius: 4,
                          background: `${getTierColor(sub.previousTier)}10`,
                          border: `1px solid ${getTierColor(sub.previousTier)}25`,
                          color: getTierColor(sub.previousTier), fontSize: 10, fontWeight: 700,
                          fontFamily: "'Cairo', sans-serif",
                        }}>
                          {getTierLabel(sub.previousTier)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: sub.status === 'active' ? COLORS.success : sub.status === 'cancelled' ? COLORS.danger : COLORS.amber,
                        fontFamily: "'Cairo', sans-serif",
                      }}>
                        {sub.status === 'active' ? 'نشط' : sub.status === 'cancelled' ? 'ملغي' : sub.status === 'expired' ? 'منتهي' : sub.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.text }}>
                      {sub.amount ? `$${sub.amount}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                      {formatDate(sub.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Empty state for entire page */}
      {!loading && isAllEmpty && (
        <div style={{
          padding: 40, textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 8, border: `1px solid ${COLORS.border}`,
        }}>
          <span style={{ fontSize: 13, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
            لا توجد بيانات بعد
          </span>
        </div>
      )}

      {/* Scoped styles via useScopedStyle */}</div>
  )
}
