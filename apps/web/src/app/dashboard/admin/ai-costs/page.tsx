'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Brain,
  RefreshCw,
  DollarSign,
  Zap,
  Clock,
  BarChart3,
  ToggleLeft,
  ToggleRight,
  Sliders,
} from 'lucide-react'

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

/* ── helpers ── */
function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(6)}`
  if (cost < 1) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

function getEndpointLabel(endpoint: string): string {
  switch (endpoint) {
    case 'chat': return 'محادثة AI'
    case 'consensus': return 'إجماع المجلس'
    case 'narrator': return 'الراوي'
    case 'signal': return 'إشارات'
    case 'backtest': return 'اختبار رجعي'
    case 'coach': return 'المدرب'
    default: return endpoint
  }
}

/* ── types ── */
interface SummaryData {
  today: { requests: number; cost: number; tokens: { input: number; output: number } }
  week: { requests: number; cost: number; tokens: { input: number; output: number } }
  month: { requests: number; cost: number; tokens: { input: number; output: number } }
  cacheRate: number
}

interface CostByModel {
  model: string
  provider: string
  requests: number
  inputTokens: number
  outputTokens: number
  cost: number
  avgLatency: number
}

interface CostByEndpoint {
  endpoint: string
  requests: number
  cost: number
}

interface AiApiResponse {
  summary: SummaryData
  byModel: CostByModel[]
  byEndpoint: CostByEndpoint[]
  dailyCost: Record<string, number>
  error?: string
}

export default function AdminAiCostsPage() {
  const [data, setData] = useState<AiApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [cachingEnabled, setCachingEnabled] = useState(true)
  const [routeCheap, setRouteCheap] = useState(false)
  const [reduceTokens, setReduceTokens] = useState(false)
  const [tooltipInfo, setTooltipInfo] = useState<{ date: string; cost: string } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/dashboard/admin/api/ai-usage/stats')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  /* ── daily cost chart helpers ── */
  const dailyCostEntries = data?.dailyCost
    ? Object.entries(data.dailyCost).sort(([a], [b]) => a.localeCompare(b))
    : []

  const maxDailyCost = dailyCostEntries.length
    ? Math.max(...dailyCostEntries.map(([, c]) => c), 0.001)
    : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>
            تكاليف نماذج AI
          </h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>
            مراقبة التكاليف والأداء والاستخدام
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

      {/* Summary Cards — 4 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {[
          { label: 'تكلفة اليوم', value: formatCost(data?.summary.today.cost ?? 0), icon: Clock, color: COLORS.amber },
          { label: 'تكلفة الأسبوع', value: formatCost(data?.summary.week.cost ?? 0), icon: DollarSign, color: COLORS.accent },
          { label: 'تكلفة الشهر', value: formatCost(data?.summary.month.cost ?? 0), icon: BarChart3, color: COLORS.danger },
          { label: 'معدل التخزين المؤقت', value: `${data?.summary.cacheRate ?? 0}%`, icon: Zap, color: COLORS.success },
        ].map((card, i) => {
          const CardIcon = card.icon
          return (
            <div key={i} style={{
              ...CARD_STYLE,
              display: 'flex', alignItems: 'center', gap: 12,
              animation: `fadeInSlideUp 0.4s ease-out ${i * 0.05}s both`,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${card.color}15`,
                border: `1px solid ${card.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <CardIcon size={18} color={card.color} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                  {loading ? '—' : card.value}
                </div>
                <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>{card.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cost by Model Table */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Brain size={14} color={COLORS.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>التكلفة حسب النموذج</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
              جارٍ التحميل...
            </div>
          ) : !data?.byModel?.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
              لا توجد بيانات استخدام بعد
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  {['النموذج', 'المزود', 'الطلبات', 'الرموز المدخلة', 'الرموز المخرجة', 'التكلفة ($)', 'متوسط الاستجابة'].map(h => (
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
                {data.byModel.map((m, i) => (
                  <tr key={m.model} style={{
                    borderBottom: `1px solid ${COLORS.border}`,
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: COLORS.accent, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }} dir="ltr">
                      {m.model}
                    </td>
                    <td style={{ padding: '10px 14px', color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }} dir="ltr">
                      {m.provider}
                    </td>
                    <td style={{ padding: '10px 14px', color: COLORS.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                      {m.requests.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 14px', color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                      {m.inputTokens.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 14px', color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                      {m.outputTokens.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: COLORS.amber, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                      {formatCost(m.cost)}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: m.avgLatency < 2000 ? COLORS.success : m.avgLatency < 5000 ? COLORS.amber : COLORS.danger }}>
                      {m.avgLatency}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Cost by Endpoint + Cost Reduction Options */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Cost by Endpoint — CSS bar chart */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Zap size={14} color={COLORS.amber} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>التكلفة حسب الميزة</span>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
                جارٍ التحميل...
              </div>
            ) : !data?.byEndpoint?.length ? (
              <div style={{ padding: 20, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
                لا توجد بيانات استخدام بعد
              </div>
            ) : (
              data.byEndpoint.sort((a, b) => b.cost - a.cost).map((ep) => {
                const maxCost = Math.max(...data.byEndpoint.map(e => e.cost), 0.001)
                const barWidth = Math.max(4, (ep.cost / maxCost) * 100)
                return (
                  <div key={ep.endpoint} style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>
                        {getEndpointLabel(ep.endpoint)}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.amber, fontFamily: "'JetBrains Mono', monospace" }}>
                        {formatCost(ep.cost)}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)' }}>
                      <div style={{ width: `${barWidth}%`, height: '100%', borderRadius: 3, background: COLORS.amber, opacity: 0.7, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Cost Reduction Options */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Sliders size={14} color={COLORS.success} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>خيارات تقليل التكلفة</span>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Toggle: AI Caching */}
            <div style={{
              padding: 14, borderRadius: 8,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>
                  تفعيل التخزين المؤقت للذكاء الاصطناعي
                </span>
                <button
                  onClick={() => setCachingEnabled(!cachingEnabled)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {cachingEnabled ? <ToggleRight size={28} color={COLORS.success} /> : <ToggleLeft size={28} color={COLORS.muted} />}
                </button>
              </div>
              <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                تخزين الاستجابات المتكررة لتقليل التكلفة
              </div>
            </div>

            {/* Toggle: Route to cheapest model */}
            <div style={{
              padding: 14, borderRadius: 8,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>
                  توجيه الطلبات للنموذج الأرخص
                </span>
                <button
                  onClick={() => setRouteCheap(!routeCheap)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {routeCheap ? <ToggleRight size={28} color={COLORS.success} /> : <ToggleLeft size={28} color={COLORS.muted} />}
                </button>
              </div>
              <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                استخدام النموذج الأقل تكلفة عندما يكون مناسبًا
              </div>
            </div>

            {/* Toggle: Reduce output tokens */}
            <div style={{
              padding: 14, borderRadius: 8,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>
                  تقليل الرموز المخرجة
                </span>
                <button
                  onClick={() => setReduceTokens(!reduceTokens)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {reduceTokens ? <ToggleRight size={28} color={COLORS.success} /> : <ToggleLeft size={28} color={COLORS.muted} />}
                </button>
              </div>
              <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                تقييد عدد الرموز المخرجة لتقليل التكلفة
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Cost Trend — CSS bar chart */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <BarChart3 size={14} color={COLORS.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>اتجاه التكلفة اليومية</span>
          <span style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>آخر 30 يوم</span>
        </div>
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
              جارٍ التحميل...
            </div>
          ) : !dailyCostEntries.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
              لا توجد بيانات استخدام بعد
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, paddingTop: 8 }}>
                {dailyCostEntries.map(([date, cost], i) => {
                  const height = Math.max(3, (cost / maxDailyCost) * 130)
                  const isToday = i === dailyCostEntries.length - 1
                  return (
                    <div
                      key={date}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                      onMouseEnter={() => setTooltipInfo({ date, cost: formatCost(cost) })}
                      onMouseLeave={() => setTooltipInfo(null)}
                    >
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 20,
                          height,
                          background: isToday ? COLORS.accent : `${COLORS.accent}50`,
                          borderRadius: 2,
                          transition: 'all 0.2s',
                          cursor: 'pointer',
                          opacity: isToday ? 1 : 0.6,
                        }}
                      />
                      {i % 5 === 0 && (
                        <span style={{ fontSize: 7, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                          {date.slice(5)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Tooltip */}
              {tooltipInfo && (
                <div style={{
                  position: 'absolute', top: -8, left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '6px 10px', borderRadius: 6,
                  background: COLORS.card, border: `1px solid ${COLORS.accent}30`,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  zIndex: 10, pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}>
                  <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>{tooltipInfo.date}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.amber, fontFamily: "'JetBrains Mono', monospace" }}>{tooltipInfo.cost}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeInSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 900px) {
          [style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
