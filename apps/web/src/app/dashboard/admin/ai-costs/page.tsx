'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Brain,
  RefreshCw,
  DollarSign,
  Zap,
  Clock,
  BarChart3,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Cpu,
  Radio,
  TrendingUp,
  FileText,
} from 'lucide-react'
import { COLORS as BASE_COLORS, CARD_STYLE } from '@/lib/admin-ui'

/* ── design tokens (extends shared palette with AI-specific colors) ── */
const COLORS = {
  ...BASE_COLORS,
  blue: '#448AFF',
  pink: '#FF4081',
  teal: '#1DE9B6',
  orange: '#FF6D00',
}

/* ── helpers ── */
function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(6)}`
  if (cost < 1) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function getProviderColor(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'groq': return COLORS.orange
    case 'zhipu':
    case 'glm': return COLORS.blue
    case 'google':
    case 'gemini': return COLORS.amber
    case 'aws':
    case 'bedrock': return COLORS.teal
    case 'huggingface':
    case 'hf': return COLORS.pink
    case 'openai': return COLORS.success
    case 'ollama': return COLORS.purple
    case 'openrouter': return '#9C27B0'
    default: return COLORS.accent
  }
}

function getProviderLabel(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'groq': return 'Groq'
    case 'zhipu':
    case 'glm': return 'Zhipu AI'
    case 'google':
    case 'gemini': return 'Google'
    case 'aws':
    case 'bedrock': return 'AWS Bedrock'
    case 'huggingface':
    case 'hf': return 'HuggingFace'
    case 'openai': return 'OpenAI'
    case 'ollama': return 'Ollama'
    case 'openrouter': return 'OpenRouter'
    default: return provider
  }
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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'لم يُستخدم'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${mins} دقيقة`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `منذ ${hrs} ساعة`
  const days = Math.floor(hrs / 24)
  return `منذ ${days} يوم`
}

/* ── types ── */
interface SummaryData {
  today: { requests: number; cost: number; tokens: { input: number; output: number } }
  week: { requests: number; cost: number; tokens: { input: number; output: number } }
  month: { requests: number; cost: number; tokens: { input: number; output: number } }
  cacheRate: number
  totalRequests: number
}

interface CostByModel {
  model: string
  provider: string
  requests: number
  inputTokens: number
  outputTokens: number
  cost: number
  avgLatency: number
  errors: number
  successRate: number
  lastUsed: string | null
  isActive: boolean
}

interface CostByProvider {
  provider: string
  models: number
  requests: number
  inputTokens: number
  outputTokens: number
  cost: number
  isActive: boolean
}

interface CostByEndpoint {
  endpoint: string
  requests: number
  cost: number
  inputTokens: number
  outputTokens: number
}

interface AiApiResponse {
  summary: SummaryData
  byModel: CostByModel[]
  byProvider: CostByProvider[]
  byEndpoint: CostByEndpoint[]
  dailyCost: Record<string, number>
  dailyInputTokens: Record<string, number>
  dailyOutputTokens: Record<string, number>
  dailyRequests: Record<string, number>
  activeModelsCount: number
  totalModelsCount: number
  error?: string
}

export default function AdminAiCostsPage() {
  const [data, setData] = useState<AiApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chartMode, setChartMode] = useState<'cost' | 'tokens'>('tokens')
  const [tooltipInfo, setTooltipInfo] = useState<{ date: string; cost: string; inputTokens: string; outputTokens: string; requests: string } | null>(null)
  const [sortField, setSortField] = useState<'cost' | 'inputTokens' | 'outputTokens' | 'requests' | 'avgLatency'>('cost')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ai-usage/stats')
      const json = await res.json()
      if (res.ok && !json.error) {
        setData(json)
        setError(null)
      } else if (json.error) {
        // FIX: DB error returned as 503 with error message — show specific error
        setData(null)
        setError(`${json.error}${json.debug ? ` (${json.debug})` : ''}`)
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

  /* ── chart data ── */
  const dailyEntries = data?.dailyCost
    ? Object.entries(data.dailyCost).sort(([a], [b]) => a.localeCompare(b))
    : []

  const maxDailyCost = dailyEntries.length
    ? Math.max(...dailyEntries.map(([, c]) => c), 0.001)
    : 1

  const dailyTokenEntries = data?.dailyInputTokens
    ? Object.entries(data.dailyInputTokens).sort(([a], [b]) => a.localeCompare(b))
    : []

  const maxDailyTokens = dailyTokenEntries.length
    ? Math.max(
        ...dailyTokenEntries.map(([, i]) => i),
        ...Object.values(data?.dailyOutputTokens || {}).map(Number),
        1
      )
    : 1

  /* ── sorted models ── */
  const sortedModels = [...(data?.byModel || [])].sort((a, b) => {
    const mult = sortDir === 'desc' ? -1 : 1
    return mult * ((a[sortField] || 0) - (b[sortField] || 0))
  })

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null
    return sortDir === 'desc'
      ? <ArrowDownRight size={10} style={{ display: 'inline', marginRight: 2 }} />
      : <ArrowUpRight size={10} style={{ display: 'inline', marginRight: 2 }} />
  }

  /* ── total tokens ── */
  const todayInputTokens = data?.summary.today.tokens.input ?? 0
  const todayOutputTokens = data?.summary.today.tokens.output ?? 0
  const monthInputTokens = data?.summary.month.tokens.input ?? 0
  const monthOutputTokens = data?.summary.month.tokens.output ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>
            مراقبة نماذج الذكاء الاصطناعي
          </h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>
            الاستهلاك والتوكن والأداء والحالة لكل نموذج
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

      {/* ─── Section 1: Summary Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        {[
          { label: 'تكلفة اليوم', value: formatCost(data?.summary.today.cost ?? 0), icon: Clock, color: COLORS.amber, sub: `${formatTokens(todayInputTokens + todayOutputTokens)} توكن` },
          { label: 'تكلفة الشهر', value: formatCost(data?.summary.month.cost ?? 0), icon: DollarSign, color: COLORS.danger, sub: `${formatTokens(monthInputTokens + monthOutputTokens)} توكن` },
          { label: 'توكن مدخلة اليوم', value: formatTokens(todayInputTokens), icon: FileText, color: COLORS.blue, sub: `${data?.summary.today.requests ?? 0} طلب` },
          { label: 'توكن مخرجة اليوم', value: formatTokens(todayOutputTokens), icon: TrendingUp, color: COLORS.teal, sub: `${data?.summary.today.requests ?? 0} طلب` },
          { label: 'نماذج نشطة', value: `${data?.activeModelsCount ?? 0}/${data?.totalModelsCount ?? 0}`, icon: Radio, color: COLORS.success, sub: 'آخر ساعة' },
          { label: 'معدل التخزين المؤقت', value: `${data?.summary.cacheRate ?? 0}%`, icon: Zap, color: COLORS.purple, sub: 'توفير التكلفة' },
        ].map((card, i) => {
          const CardIcon = card.icon
          return (
            <div key={i} style={{
              ...CARD_STYLE,
              padding: 20,
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
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                  {loading ? '—' : card.value}
                </div>
                <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>{card.label}</div>
                <div style={{ fontSize: 9, color: `${card.color}99`, fontFamily: "'Cairo', sans-serif", marginTop: 1 }}>{card.sub}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Section 2: Provider Status Cards ─── */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Cpu size={14} color={COLORS.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>حالة مزودي الذكاء الاصطناعي</span>
          <span style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>نشط = طلب خلال آخر ساعة</span>
        </div>
        <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12, width: '100%' }}>
              جارٍ التحميل...
            </div>
          ) : !data?.byProvider?.length ? (
            <div style={{ padding: 20, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12, width: '100%' }}>
              لا توجد بيانات استخدام بعد — سيظهر المزودون عند أول طلب AI
            </div>
          ) : (
            data.byProvider.sort((a, b) => b.cost - a.cost).map((p) => {
              const color = getProviderColor(p.provider)
              return (
                <div key={p.provider} style={{
                  padding: 14, borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${p.isActive ? `${color}30` : COLORS.border}`,
                  minWidth: 200, flex: '1 1 200px',
                  transition: 'all 0.2s',
                  boxShadow: p.isActive ? `0 0 20px ${color}10` : 'none',
                }}>
                  {/* Provider header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: p.isActive ? COLORS.success : COLORS.muted,
                        boxShadow: p.isActive ? `0 0 8px ${COLORS.success}60` : 'none',
                      }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>
                        {getProviderLabel(p.provider)}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: p.isActive ? `${COLORS.success}15` : `${COLORS.muted}10`,
                      color: p.isActive ? COLORS.success : COLORS.muted,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      {p.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </div>
                  {/* Provider stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>النماذج</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: color, fontFamily: "'JetBrains Mono', monospace" }}>{p.models}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>الطلبات</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace" }}>{p.requests.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>توكن مدخلة</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace" }}>{formatTokens(p.inputTokens)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>توكن مخرجة</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.teal, fontFamily: "'JetBrains Mono', monospace" }}>{formatTokens(p.outputTokens)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>التكلفة الإجمالية</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.amber, fontFamily: "'JetBrains Mono', monospace" }}>{formatCost(p.cost)}</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ─── Section 3: Detailed Model Table ─── */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={14} color={COLORS.accent} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>تفاصيل كل نموذج</span>
          </div>
          <span style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>انقر على عنوان العمود للترتيب</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
              جارٍ التحميل...
            </div>
          ) : !data?.byModel?.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
              لا توجد بيانات استخدام بعد — ستظهر النماذج عند أول طلب AI
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  {[
                    { key: 'model', label: 'النموذج', sortable: false },
                    { key: 'cost', label: 'التكلفة ($)', sortable: true },
                    { key: 'inputTokens', label: 'توكن مدخلة', sortable: true },
                    { key: 'outputTokens', label: 'توكن مخرجة', sortable: true },
                    { key: 'requests', label: 'الطلبات', sortable: true },
                    { key: 'avgLatency', label: 'الاستجابة', sortable: true },
                  ].map(col => (
                    <th key={col.key} onClick={col.sortable ? () => handleSort(col.key as typeof sortField) : undefined} style={{
                      padding: '10px 12px', textAlign: 'right',
                      fontSize: 10, fontWeight: 700, color: COLORS.muted,
                      fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap',
                      cursor: col.sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      transition: 'color 0.2s',
                    }}>
                      {col.sortable && <SortIcon field={col.key as typeof sortField} />}
                      {col.label}
                    </th>
                  ))}
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap' }}>الأخطاء</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap' }}>النجاح</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap' }}>آخر استخدام</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap' }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {sortedModels.map((m, i) => {
                  const providerColor = getProviderColor(m.provider)
                  const costPer1KInput = m.inputTokens > 0 ? (m.cost / m.inputTokens) * 1000 : 0
                  return (
                    <tr key={m.model} style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    }}>
                      <td style={{ padding: '10px 12px' }} dir="ltr">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: providerColor, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 600, color: COLORS.accent, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 1.2 }}>{m.model}</div>
                            <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>{getProviderLabel(m.provider)}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: COLORS.amber, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{formatCost(m.cost)}</div>
                        {costPer1KInput > 0 && (
                          <div style={{ fontSize: 8, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                            {formatCost(costPer1KInput)}/1K توكن
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600 }}>{formatTokens(m.inputTokens)}</div>
                        {/* Mini bar showing input vs output proportion */}
                        <div style={{ height: 3, borderRadius: 1.5, background: 'rgba(255,255,255,0.05)', marginTop: 4, width: 80 }}>
                          <div style={{
                            width: `${m.inputTokens + m.outputTokens > 0 ? (m.inputTokens / (m.inputTokens + m.outputTokens)) * 100 : 0}%`,
                            height: '100%', borderRadius: 1.5,
                            background: COLORS.blue, opacity: 0.6,
                          }} />
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ color: COLORS.teal, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600 }}>{formatTokens(m.outputTokens)}</div>
                        <div style={{ height: 3, borderRadius: 1.5, background: 'rgba(255,255,255,0.05)', marginTop: 4, width: 80 }}>
                          <div style={{
                            width: `${m.inputTokens + m.outputTokens > 0 ? (m.outputTokens / (m.inputTokens + m.outputTokens)) * 100 : 0}%`,
                            height: '100%', borderRadius: 1.5,
                            background: COLORS.teal, opacity: 0.6,
                          }} />
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', color: COLORS.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                        {m.requests.toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: m.avgLatency < 2000 ? COLORS.success : m.avgLatency < 5000 ? COLORS.amber : COLORS.danger }}>
                        {m.avgLatency}ms
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {m.errors > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: COLORS.danger, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                            <AlertTriangle size={10} /> {m.errors}
                          </span>
                        ) : (
                          <span style={{ color: COLORS.success, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                          color: m.successRate >= 95 ? COLORS.success : m.successRate >= 80 ? COLORS.amber : COLORS.danger,
                        }}>
                          {m.successRate}%
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap' }}>
                        {timeAgo(m.lastUsed)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 4,
                          fontSize: 10, fontWeight: 600,
                          fontFamily: "'Cairo', sans-serif",
                          background: m.isActive ? `${COLORS.success}15` : `${COLORS.danger}10`,
                          color: m.isActive ? COLORS.success : COLORS.danger,
                          border: `1px solid ${m.isActive ? `${COLORS.success}30` : `${COLORS.danger}20`}`,
                        }}>
                          {m.isActive ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                          {m.isActive ? 'نشط' : 'متوقف'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── Section 4: Daily Chart ─── */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={14} color={COLORS.accent} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>
              {chartMode === 'cost' ? 'اتجاه التكلفة اليومية' : 'اتجاه استهلاك التوكن اليومي'}
            </span>
            <span style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>آخر 30 يوم</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setChartMode('tokens')}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer',
                background: chartMode === 'tokens' ? `${COLORS.accent}20` : 'transparent',
                color: chartMode === 'tokens' ? COLORS.accent : COLORS.muted,
                transition: 'all 0.2s',
              }}
            >
              التوكن
            </button>
            <button
              onClick={() => setChartMode('cost')}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer',
                background: chartMode === 'cost' ? `${COLORS.amber}20` : 'transparent',
                color: chartMode === 'cost' ? COLORS.amber : COLORS.muted,
                transition: 'all 0.2s',
              }}
            >
              التكلفة
            </button>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
              جارٍ التحميل...
            </div>
          ) : chartMode === 'cost' ? (
            /* Cost chart */
            !dailyEntries.length ? (
              <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
                لا توجد بيانات استخدام بعد
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 160, paddingTop: 8 }}>
                  {dailyEntries.map(([date, cost], i) => {
                    const height = Math.max(3, (cost / maxDailyCost) * 150)
                    const isToday = i === dailyEntries.length - 1
                    return (
                      <div
                        key={date}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                        onMouseEnter={() => setTooltipInfo({
                          date, cost: formatCost(cost),
                          inputTokens: formatTokens(data?.dailyInputTokens?.[date] ?? 0),
                          outputTokens: formatTokens(data?.dailyOutputTokens?.[date] ?? 0),
                          requests: `${data?.dailyRequests?.[date] ?? 0}`,
                        })}
                        onMouseLeave={() => setTooltipInfo(null)}
                      >
                        <div style={{
                          width: '100%', maxWidth: 20, height,
                          background: isToday ? COLORS.amber : `${COLORS.amber}50`,
                          borderRadius: 2, transition: 'all 0.2s',
                          cursor: 'pointer', opacity: isToday ? 1 : 0.6,
                        }} />
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
                {tooltipInfo && chartMode === 'cost' && (
                  <div style={{
                    position: 'absolute', top: -8, left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '8px 12px', borderRadius: 8,
                    background: COLORS.card, border: `1px solid ${COLORS.amber}30`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    zIndex: 10, pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}>
                    <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>{tooltipInfo.date}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.amber, fontFamily: "'JetBrains Mono', monospace" }}>{tooltipInfo.cost}</div>
                    <div style={{ fontSize: 9, color: COLORS.blue, fontFamily: "'Cairo', sans-serif" }}>مدخلة: {tooltipInfo.inputTokens}</div>
                    <div style={{ fontSize: 9, color: COLORS.teal, fontFamily: "'Cairo', sans-serif" }}>مخرجة: {tooltipInfo.outputTokens}</div>
                  </div>
                )}
              </div>
            )
          ) : (
            /* Token chart — stacked input/output */
            !dailyTokenEntries.length ? (
              <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
                لا توجد بيانات استخدام بعد
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.blue }} />
                    <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>توكن مدخلة</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.teal }} />
                    <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>توكن مخرجة</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 160, paddingTop: 8 }}>
                  {dailyTokenEntries.map(([date, inputT], i) => {
                    const outputT = data?.dailyOutputTokens?.[date] ?? 0
                    const inputH = Math.max(2, (inputT / maxDailyTokens) * 140)
                    const outputH = Math.max(2, (outputT / maxDailyTokens) * 140)
                    const isToday = i === dailyTokenEntries.length - 1
                    return (
                      <div
                        key={date}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
                        onMouseEnter={() => setTooltipInfo({
                          date, cost: formatCost(data?.dailyCost?.[date] ?? 0),
                          inputTokens: formatTokens(inputT),
                          outputTokens: formatTokens(outputT),
                          requests: `${data?.dailyRequests?.[date] ?? 0}`,
                        })}
                        onMouseLeave={() => setTooltipInfo(null)}
                      >
                        <div style={{
                          display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 20,
                          background: 'transparent', gap: 1,
                        }}>
                          <div style={{
                            width: '100%', height: inputH,
                            background: isToday ? COLORS.blue : `${COLORS.blue}60`,
                            borderRadius: '2px 2px 0 0', transition: 'all 0.2s',
                            cursor: 'pointer', opacity: isToday ? 1 : 0.7,
                          }} />
                          <div style={{
                            width: '100%', height: outputH,
                            background: isToday ? COLORS.teal : `${COLORS.teal}60`,
                            borderRadius: '0 0 2px 2px', transition: 'all 0.2s',
                            cursor: 'pointer', opacity: isToday ? 1 : 0.7,
                          }} />
                        </div>
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
                {tooltipInfo && chartMode === 'tokens' && (
                  <div style={{
                    position: 'absolute', top: -8, left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '8px 12px', borderRadius: 8,
                    background: COLORS.card, border: `1px solid ${COLORS.accent}30`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    zIndex: 10, pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}>
                    <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>{tooltipInfo.date}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace" }}>مدخلة: {tooltipInfo.inputTokens}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.teal, fontFamily: "'JetBrains Mono', monospace" }}>مخرجة: {tooltipInfo.outputTokens}</div>
                    <div style={{ fontSize: 10, color: COLORS.amber, fontFamily: "'JetBrains Mono', monospace" }}>التكلفة: {tooltipInfo.cost}</div>
                    <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>الطلبات: {tooltipInfo.requests}</div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* ─── Section 5: Cost by Endpoint with Tokens ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Endpoint breakdown */}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>
                        {getEndpointLabel(ep.endpoint)}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.amber, fontFamily: "'JetBrains Mono', monospace" }}>
                        {formatCost(ep.cost)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginBottom: 6 }}>
                      <span>مدخلة: <b style={{ color: COLORS.blue }}>{formatTokens(ep.inputTokens)}</b></span>
                      <span>مخرجة: <b style={{ color: COLORS.teal }}>{formatTokens(ep.outputTokens)}</b></span>
                      <span>طلبات: <b style={{ color: COLORS.text }}>{ep.requests}</b></span>
                    </div>
                    <div style={{ height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.05)' }}>
                      <div style={{ width: `${barWidth}%`, height: '100%', borderRadius: 2.5, background: COLORS.amber, opacity: 0.7, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Token Summary Box */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Activity size={14} color={COLORS.teal} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>ملخص التوكن الشهري</span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
                جارٍ التحميل...
              </div>
            ) : (
              <>
                {/* Monthly tokens */}
                <div style={{
                  padding: 16, borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>توكن هذا الشهر</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.blue, fontFamily: "'Cairo', sans-serif" }}>مدخلة</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.2 }}>
                        {formatTokens(monthInputTokens)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.teal, fontFamily: "'Cairo', sans-serif" }}>مخرجة</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.teal, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.2 }}>
                        {formatTokens(monthOutputTokens)}
                      </div>
                    </div>
                  </div>
                  {/* Proportion bar */}
                  <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginTop: 12, overflow: 'hidden', display: 'flex' }}>
                    <div style={{
                      width: `${monthInputTokens + monthOutputTokens > 0 ? (monthInputTokens / (monthInputTokens + monthOutputTokens)) * 100 : 50}%`,
                      height: '100%', background: COLORS.blue, opacity: 0.7,
                    }} />
                    <div style={{
                      flex: 1, height: '100%', background: COLORS.teal, opacity: 0.7,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 8, color: COLORS.blue, fontFamily: "'Cairo', sans-serif" }}>
                      {monthInputTokens + monthOutputTokens > 0 ? Math.round((monthInputTokens / (monthInputTokens + monthOutputTokens)) * 100) : 0}% مدخلة
                    </span>
                    <span style={{ fontSize: 8, color: COLORS.teal, fontFamily: "'Cairo', sans-serif" }}>
                      {monthInputTokens + monthOutputTokens > 0 ? Math.round((monthOutputTokens / (monthInputTokens + monthOutputTokens)) * 100) : 0}% مخرجة
                    </span>
                  </div>
                </div>

                {/* Today vs Average */}
                <div style={{
                  padding: 16, borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>اليوم مقابل المتوسط اليومي</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>توكن اليوم</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace" }}>
                        {formatTokens(todayInputTokens + todayOutputTokens)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>المتوسط اليومي</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                        {dailyTokenEntries.length > 0
                          ? formatTokens(
                              (Object.values(data?.dailyInputTokens || {}).reduce((a: number, b) => a + Number(b), 0)
                              + Object.values(data?.dailyOutputTokens || {}).reduce((a: number, b) => a + Number(b), 0))
                              / (dailyTokenEntries.length || 1)
                            )
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cost efficiency */}
                <div style={{
                  padding: 16, borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>كفاءة التكلفة</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>التكلفة لكل 1K توكن مدخلة</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace" }}>
                        {monthInputTokens > 0 ? formatCost((data?.summary.month.cost ?? 0) / monthInputTokens * 1000) : '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>التكلفة لكل 1K توكن مخرجة</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.teal, fontFamily: "'JetBrains Mono', monospace" }}>
                        {monthOutputTokens > 0 ? formatCost((data?.summary.month.cost ?? 0) / monthOutputTokens * 1000) : '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>نسبة المدخلة/المخرجة</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent, fontFamily: "'JetBrains Mono', monospace" }}>
                        {monthOutputTokens > 0 ? (monthInputTokens / monthOutputTokens).toFixed(2) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
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
