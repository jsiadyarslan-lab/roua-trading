'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Loader2,
  BarChart3,
  Activity,
  Target,
  Info,
  CreditCard,
  Gauge,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'

// ── Types ──
interface PositionDetail {
  symbol: string
  exchange: string
  quantity: number
  currentPrice: number
  value: number
  weight: number
  change24h: number
  assetType: string
}

interface RiskMetrics {
  concentrationRisk: number
  diversificationScore: number
  largestPositionWeight: number
  positionCount: number
  varEstimate: number
  volatilityEstimate: number
  sharpeRatio?: number
  winRate?: number
  totalTrades?: number
  profitTrades?: number
}

interface RiskReport {
  summary: string
  riskScore: number
  totalValue: number
  currency: string
  positions: PositionDetail[]
  metrics: RiskMetrics
  recommendations: string[]
  aiAnalysis: string
  analyzedAt: string
}

// ── Section Header Component ──
function SectionHeader({ icon, label, gradient, badge }: {
  icon: React.ReactNode
  label: string
  gradient: string
  badge?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
      <div style={{
        width: '26px', height: '26px', borderRadius: '7px',
        background: gradient,
        boxShadow: '0 0 8px rgba(10,132,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>{label}</span>
      {badge}
    </div>
  )
}

// ── Stat Card Component (Enhanced with gradient icons + glow) ──
function StatCard({ icon, label, value, subValue, color, gradient, borderColor }: {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
  color: string
  gradient: string
  borderColor: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle glow accent in top-right */}
      <div style={{
        position: 'absolute', top: '-8px', right: '-8px',
        width: '60px', height: '60px',
        background: color,
        filter: 'blur(32px)',
        opacity: 0.15,
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '7px',
          background: gradient,
          boxShadow: `0 0 8px ${borderColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          fontFamily: 'var(--font-ar), Inter, sans-serif',
        }}>{label}</span>
      </div>
      <div style={{
        fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-mono)',
        color, letterSpacing: '-0.02em',
      }} dir="ltr">{value}</div>
      {subValue && (
        <div style={{
          fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
          fontFamily: 'var(--font-ar), Inter, sans-serif', marginTop: '4px',
        }}>{subValue}</div>
      )}
    </motion.div>
  )
}

// ── Mini Pie Chart Component (Enhanced) ──
function PieChart({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const cumulativeAngles: number[] = []
  segments.forEach((seg) => {
    const prev = cumulativeAngles.length > 0 ? cumulativeAngles[cumulativeAngles.length - 1] : 0
    cumulativeAngles.push(prev + (seg.value / total) * 360)
  })
  const gradientStops = segments.map((seg, i) => {
    const start = i > 0 ? cumulativeAngles[i - 1] : 0
    const end = cumulativeAngles[i]
    return `${seg.color} ${start}deg ${end}deg`
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <div style={{
        width: '110px', height: '110px', borderRadius: '50%',
        background: `conic-gradient(${gradientStops.join(', ')})`,
        position: 'relative', flexShrink: 0,
        boxShadow: '0 0 12px rgba(10,132,255,0.08)',
      }}>
        <div style={{
          position: 'absolute', inset: '28px', borderRadius: '50%',
          background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        }}>
          <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>الإجمالي</span>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }} dir="ltr">{segments.length}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: seg.color, flexShrink: 0, boxShadow: `0 0 4px ${seg.color}44` }} />
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>{seg.label}</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)', marginRight: 'auto' }} dir="ltr">{((seg.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Line Chart Component (Enhanced) ──
function LineChart({ data, color, height }: { data: number[]; color: string; height: number }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 300
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 8) - 4}`).join(' ')
  const areaPoints = `0,${height} ${points} ${w},${height}`

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sanctuaryLineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#sanctuaryLineGrad)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

// ── Risk color helpers ──
function getRiskColor(score: number) {
  return score < 30 ? 'var(--profit)' : score < 60 ? 'var(--warning)' : 'var(--loss)'
}
function getRiskGradient(score: number) {
  return score < 30 ? 'linear-gradient(135deg, #00FFC6, #00B894)' : score < 60 ? 'linear-gradient(135deg, #FFB800, #FF8C00)' : 'linear-gradient(135deg, #FF4D4D, #FF6B6B)'
}
function getRiskBg(score: number) {
  return score < 30 ? 'var(--profit-bg)' : score < 60 ? 'var(--warning-bg)' : 'var(--loss-bg)'
}
function getRiskBorder(score: number) {
  return score < 30 ? 'var(--border-profit)' : score < 60 ? 'var(--border-warning)' : 'var(--border-loss)'
}
function getRiskLabel(score: number) {
  return score < 30 ? 'منخفض' : score < 60 ? 'متوسط' : 'مرتفع'
}

// ── Animation variants ──
const tabVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

// ── Main Component ──
export default function SanctuaryPage() {
  const router = useRouter()
  const { loading: authLoading } = useAuth()
  const [report, setReport] = useState<RiskReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'analysis'>('overview')
  const [showBalance, setShowBalance] = useState(true)

  // Analyze portfolio
  const analyzePortfolio = async () => {
    setAnalyzing(true)
    setError('')
    try {
      const res = await fetch('/api/portfolio/sanctuary')
      if (res.ok) {
        const data = await res.json()
        if (data.success) setReport({ ...data.data, positions: data.data.positions ?? [], metrics: data.data.metrics ?? {} })
      } else {
        const data = await res.json()
        throw new Error(data.error || 'فشل في تحليل المحفظة')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    const run = async () => {
      setAnalyzing(true)
      setError('')
      try {
        const res = await fetch('/api/portfolio/sanctuary')
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (data.success) setReport({ ...data.data, positions: data.data.positions ?? [], metrics: data.data.metrics ?? {} })
        } else {
          const data = await res.json()
          throw new Error(data.error || 'فشل في تحليل المحفظة')
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) {
          setLoading(false)
          setAnalyzing(false)
        }
      }
    }
    run()
    return () => { cancelled = true }
  }, [authLoading])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)

  const formatValue = (val: number) => {
    if (!showBalance) return '••••••'
    return formatCurrency(val)
  }

  // Performance line — generate from position history or show empty
  const performanceData: number[] = report && (report.positions ?? []).length > 0
    ? report.positions.reduce((acc: number[], pos, i) => {
        // Build a simple cumulative performance series from 24h changes
        const baseVal = 100
        const prevVal = acc.length > 0 ? acc[acc.length - 1] : baseVal
        const change = pos.change24h ?? 0
        acc.push(prevVal + (prevVal * change / 100 / (report.positions ?? []).length))
        return acc
      }, [])
    : []

  // Compute portfolio return from positions data, or show dash
  const portfolioReturn = report && (report.positions ?? []).length > 0
    ? report.positions.reduce((sum, pos) => sum + (pos.change24h ?? 0) * pos.weight / 100, 0)
    : null

  // Pie chart segments from positions
  const pieSegments = report ? report.positions.slice(0, 5).map(pos => ({
    value: pos.value,
    color: pos.change24h >= 0 ? '#00FFC6' : '#FF4D4D',
    label: pos.symbol,
  })) : []

  // Risk metrics — use real data from report only, no fabricated values
  const sharpeRatio = report?.metrics?.sharpeRatio?.toFixed(2) ?? '—'
  const winRate = report?.metrics?.winRate ?? 0
  const totalTrades = report?.metrics?.totalTrades ?? 0
  const profitTrades = report?.metrics?.profitTrades ?? 0
  const lossTrades = totalTrades - profitTrades

  // Auth loading state
  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--accent)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', fontSize: '13px' }}>جارٍ التحميل...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'نظرة عامة' },
    { id: 'positions', label: 'المراكز' },
    { id: 'analysis', label: 'التحليل' },
  ]

  return (
    <SubPageLayout
      title="ملاذ المحفظة"
      icon={<Shield size={15} color="#fff" />}
      iconBg="linear-gradient(135deg, #FFB800, #FF8C00)"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as 'overview' | 'positions' | 'analysis')}
      actions={
        <button
          onClick={analyzePortfolio}
          disabled={analyzing}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', borderRadius: '8px',
            border: '1px solid var(--accent-border)',
            background: 'var(--accent-bg)', color: 'var(--accent)',
            fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ar)',
            cursor: analyzing ? 'not-allowed' : 'pointer',
            opacity: analyzing ? 0.7 : 1,
          }}
        >
          {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
          {analyzing ? 'جارٍ التحليل...' : 'إعادة التحليل'}
        </button>
      }
    >
      {/* Error Banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 16px', borderRadius: '8px',
            background: 'var(--loss-bg)', border: '1px solid var(--border-loss)',
            marginBottom: '16px',
          }}
        >
          <AlertTriangle size={14} style={{ color: 'var(--loss)' }} />
          <span style={{ fontSize: '12px', color: 'var(--loss)', fontFamily: 'var(--font-ar)' }}>{error}</span>
        </motion.div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{ width: 32, height: 32, margin: '0 auto 12px' }}
          >
            <Shield size={32} style={{ color: 'var(--accent)', opacity: 0.6 }} />
          </motion.div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>جارٍ تحليل المحفظة...</p>
        </div>
      )}

      {/* Report Tabs Content */}
      {report && !loading && (
        <AnimatePresence mode="wait">
          {/* ── Overview Tab ── */}
          {activeTab === 'overview' && (
            <motion.div key="overview" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Row 1: Equity Hero + Stat Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px' }}>
                {/* Equity Hero Card */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  style={{
                    gridColumn: 'span 2',
                    background: 'linear-gradient(135deg, rgba(10,132,255,0.06), rgba(162,89,255,0.04))',
                    border: '1px solid var(--accent-border)',
                    borderRadius: '10px',
                    padding: '20px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Background glow */}
                  <div style={{
                    position: 'absolute', top: '-20px', right: '-10px',
                    width: '100px', height: '100px',
                    background: 'var(--accent)',
                    filter: 'blur(50px)', opacity: 0.1,
                    pointerEvents: 'none',
                  }} />
                  {/* Top accent line */}
                  <div style={{
                    position: 'absolute', top: '-1px', left: '20%', right: '20%',
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
                    opacity: 0.5,
                  }} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '7px',
                        background: 'linear-gradient(135deg, var(--accent), var(--purple))',
                        boxShadow: '0 0 8px var(--accent-bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <CreditCard size={13} stroke="#fff" strokeWidth={2.2} />
                      </div>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-ar), Inter, sans-serif',
                      }}>حقوق الملكية</span>
                    </div>
                    <button
                      onClick={() => setShowBalance(!showBalance)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                    >
                      {showBalance
                        ? <Eye size={14} stroke="var(--text-muted)" strokeWidth={1.8} />
                        : <EyeOff size={14} stroke="var(--text-muted)" strokeWidth={1.8} />
                      }
                    </button>
                  </div>

                  <div style={{
                    fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-mono)',
                    color: 'var(--text-main)', letterSpacing: '-0.03em', lineHeight: 1.1,
                  }} dir="ltr">{formatValue(report.totalValue)}</div>

                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    marginTop: '10px', padding: '3px 10px', borderRadius: '6px',
                    background: 'var(--profit-bg)', border: '1px solid var(--border-profit)',
                  }}>
                    <ArrowUpRight size={11} style={{ color: 'var(--profit)' }} />
                    <span style={{
                      fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)',
                      color: portfolioReturn !== null && portfolioReturn >= 0 ? 'var(--profit)' : portfolioReturn !== null ? 'var(--loss)' : 'var(--text-muted)',
                    }} dir="ltr">{portfolioReturn !== null ? `${portfolioReturn >= 0 ? '+' : ''}${portfolioReturn.toFixed(2)}%` : '—'}</span>
                  </div>
                </motion.div>

                <StatCard
                  icon={<BarChart3 size={13} stroke="#fff" strokeWidth={2.2} />}
                  label="نسبة شارب"
                  value={sharpeRatio}
                  subValue="جيد"
                  color="var(--profit)"
                  gradient="linear-gradient(135deg, #00FFC6, #00B894)"
                  borderColor="var(--border-profit)"
                />

                <StatCard
                  icon={<TrendingUp size={13} stroke="#fff" strokeWidth={2.2} />}
                  label="معدل الربح"
                  value={`${winRate}%`}
                  subValue={`${profitTrades} صفقة`}
                  color="var(--accent)"
                  gradient="linear-gradient(135deg, #0A84FF, #5E5CE6)"
                  borderColor="var(--accent-border)"
                />

                <StatCard
                  icon={<TrendingDown size={13} stroke="#fff" strokeWidth={2.2} />}
                  label="الخسائر"
                  value={formatCurrency(report.metrics.varEstimate)}
                  subValue={`${lossTrades} صفقة`}
                  color="var(--loss)"
                  gradient="linear-gradient(135deg, #FF4D4D, #FF6B6B)"
                  borderColor="var(--border-loss)"
                />
              </div>

              {/* Row 2: Pie Chart + Line Chart */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px' }}>
                {/* Distribution Pie */}
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '10px', padding: '16px', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: '-8px', left: '-8px', width: '50px', height: '50px', background: '#FFB800', filter: 'blur(30px)', opacity: 0.08, pointerEvents: 'none' }} />
                  <SectionHeader
                    icon={<Target size={12} color="#fff" strokeWidth={2.2} />}
                    label="توزيع المحفظة"
                    gradient="linear-gradient(135deg, #FFB800, #FF8C00)"
                  />
                  {pieSegments.length > 0 ? <PieChart segments={pieSegments} /> : (
                    <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-faint)', fontSize: '12px', fontFamily: 'var(--font-ar)' }}>لا توجد بيانات</div>
                  )}
                </div>

                {/* Performance Line Chart */}
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '10px', padding: '16px', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: '-8px', right: '-8px', width: '50px', height: '50px', background: '#0A84FF', filter: 'blur(30px)', opacity: 0.08, pointerEvents: 'none' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <SectionHeader
                      icon={<Activity size={12} color="#fff" strokeWidth={2.2} />}
                      label="الأداء الشهري"
                      gradient="linear-gradient(135deg, #0A84FF, #5E5CE6)"
                    />
                    <span style={{
                      fontSize: '9px', fontWeight: 800, fontFamily: 'var(--font-mono)',
                      color: portfolioReturn !== null && portfolioReturn >= 0 ? 'var(--profit)' : portfolioReturn !== null ? 'var(--loss)' : 'var(--text-muted)',
                      background: portfolioReturn !== null && portfolioReturn >= 0 ? 'var(--profit-bg)' : portfolioReturn !== null ? 'var(--loss-bg)' : 'rgba(128,128,128,0.08)',
                      padding: '3px 8px', borderRadius: '6px',
                      border: `1px solid ${portfolioReturn !== null && portfolioReturn >= 0 ? 'var(--border-profit)' : portfolioReturn !== null ? 'var(--border-loss)' : 'var(--border)'}`,
                    }} dir="ltr">{portfolioReturn !== null ? `${portfolioReturn >= 0 ? '+' : ''}${portfolioReturn.toFixed(2)}%` : '—'}</span>
                  </div>
                  {performanceData.length > 0 ? (
                    <LineChart data={performanceData} color="#0A84FF" height={120} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--text-faint)', fontSize: '12px', fontFamily: 'var(--font-ar)' }}>لا توجد بيانات أداء</div>
                  )}
                  {performanceData.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingInline: '4px' }}>
                      {['يناير', 'مارس', 'مايو', 'يوليو', 'سبتمبر', 'نوفمبر'].map(m => (
                        <span key={m} style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>{m}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: Open Positions Table */}
              {(report.positions ?? []).length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.3 }}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '10px', overflow: 'hidden', position: 'relative',
                  }}
                >
                  {/* Top accent line */}
                  <div style={{
                    position: 'absolute', top: '-1px', left: '10%', right: '10%',
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
                    opacity: 0.4,
                  }} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <SectionHeader
                      icon={<BarChart3 size={12} color="#fff" strokeWidth={2.2} />}
                      label="المراكز المفتوحة"
                      gradient="linear-gradient(135deg, #0A84FF, #A259FF)"
                      badge={
                        <span style={{
                          fontSize: '9px', fontWeight: 700,
                          background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                          color: 'var(--accent)', padding: '1px 7px', borderRadius: '10px',
                        }}>{(report.positions ?? []).length}</span>
                      }
                    />
                    <span style={{
                      fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)',
                      color: 'var(--profit)', textShadow: '0 0 6px rgba(0,255,198,0.4)',
                    }} dir="ltr">+${report.metrics.varEstimate.toFixed(0)}</span>
                  </div>

                  {/* Table header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.6fr 0.8fr', padding: '8px 16px', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid var(--border)' }}>
                    {['الزوج', 'الدخول', 'جني الأرباح †', 'وقف الخسارة †', 'الحجم', 'P&L'].map(h => (
                      <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>{h}</span>
                    ))}
                  </div>

                  {/* Table rows */}
                  {report.positions.map((pos, i) => (
                    <div key={`${pos.symbol}-${pos.exchange}`} style={{
                      display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.6fr 0.8fr',
                      padding: '10px 16px',
                      borderBottom: i < (report.positions ?? []).length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      alignItems: 'center',
                      transition: 'background 0.15s',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-row-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '6px',
                          background: pos.change24h >= 0
                            ? 'linear-gradient(135deg, rgba(0,255,198,0.15), rgba(0,184,148,0.1))'
                            : 'linear-gradient(135deg, rgba(255,77,77,0.15), rgba(255,107,107,0.1))',
                          border: `1px solid ${pos.change24h >= 0 ? 'var(--border-profit)' : 'var(--border-loss)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {pos.change24h >= 0 ? <TrendingUp size={11} style={{ color: 'var(--profit)' }} /> : <TrendingDown size={11} style={{ color: 'var(--loss)' }} />}
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{pos.symbol}</span>
                      </div>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} dir="ltr">{formatCurrency(pos.currentPrice)}</span>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--profit)' }} dir="ltr">—</span>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--loss)' }} dir="ltr">—</span>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} dir="ltr">{pos.quantity.toFixed(2)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)',
                          color: pos.change24h >= 0 ? 'var(--profit)' : 'var(--loss)',
                        }} dir="ltr">
                          {pos.change24h >= 0 ? '+' : ''}{(pos.value * pos.change24h / 100).toFixed(0)}$
                        </span>
                        <span style={{
                          fontSize: '8px', fontWeight: 700,
                          background: pos.change24h >= 0 ? 'var(--profit-bg)' : 'var(--loss-bg)',
                          border: `1px solid ${pos.change24h >= 0 ? 'var(--border-profit)' : 'var(--border-loss)'}`,
                          color: pos.change24h >= 0 ? 'var(--profit)' : 'var(--loss)',
                          padding: '1px 5px', borderRadius: '4px',
                        }} dir="ltr">
                          {pos.change24h >= 0 ? '+' : ''}{pos.change24h.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
              <div style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)', marginTop: '4px', paddingInline: '8px' }}>† مستويات افتراضية — لم يتم تحديد جني أرباح / وقف خسارة من المستخدم</div>
            </motion.div>
          )}

          {/* ── Positions Tab ── */}
          {activeTab === 'positions' && (
            <motion.div key="positions" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Risk Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <StatCard
                  icon={<Target size={13} stroke="#fff" strokeWidth={2.2} />}
                  label="مخاطر التركيز"
                  value={`${report.metrics.concentrationRisk}/100`}
                  color={getRiskColor(report.metrics.concentrationRisk)}
                  gradient={getRiskGradient(report.metrics.concentrationRisk)}
                  borderColor={getRiskBorder(report.metrics.concentrationRisk)}
                />
                <StatCard
                  icon={<Activity size={13} stroke="#fff" strokeWidth={2.2} />}
                  label="درجة التنويع"
                  value={`${report.metrics.diversificationScore}/100`}
                  color={report.metrics.diversificationScore >= 70 ? 'var(--profit)' : report.metrics.diversificationScore >= 40 ? 'var(--warning)' : 'var(--loss)'}
                  gradient={report.metrics.diversificationScore >= 70 ? 'linear-gradient(135deg, #00FFC6, #00B894)' : report.metrics.diversificationScore >= 40 ? 'linear-gradient(135deg, #FFB800, #FF8C00)' : 'linear-gradient(135deg, #FF4D4D, #FF6B6B)'}
                  borderColor={report.metrics.diversificationScore >= 70 ? 'var(--border-profit)' : report.metrics.diversificationScore >= 40 ? 'var(--border-warning)' : 'var(--border-loss)'}
                />
                <StatCard
                  icon={<BarChart3 size={13} stroke="#fff" strokeWidth={2.2} />}
                  label="VaR (95%)"
                  value={formatCurrency(report.metrics.varEstimate)}
                  color="var(--warning)"
                  gradient="linear-gradient(135deg, #FFB800, #FF8C00)"
                  borderColor="var(--border-warning)"
                />
                <StatCard
                  icon={<Gauge size={13} stroke="#fff" strokeWidth={2.2} />}
                  label="التقلب"
                  value={`${report.metrics.volatilityEstimate}%`}
                  color="var(--purple)"
                  gradient="linear-gradient(135deg, #A259FF, #7C3AED)"
                  borderColor="var(--purple-border)"
                />
              </div>

              {/* Positions detail list */}
              {(report.positions ?? []).length > 0 && report.positions.map((pos, i) => (
                <motion.div
                  key={`${pos.symbol}-${pos.exchange}`}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderInlineEnd: pos.change24h >= 0 ? '3px solid var(--profit)' : '3px solid var(--loss)',
                    borderRadius: '10px', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  {/* Subtle glow */}
                  <div style={{
                    position: 'absolute', top: '-8px', right: '-8px',
                    width: '40px', height: '40px',
                    background: pos.change24h >= 0 ? 'var(--profit)' : 'var(--loss)',
                    filter: 'blur(24px)', opacity: 0.08, pointerEvents: 'none',
                  }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '8px',
                      background: 'linear-gradient(135deg, #0A84FF, #A259FF)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)',
                    }}>{pos.symbol.slice(0, 2)}</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{pos.symbol}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>{pos.exchange} · {pos.assetType}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>القيمة</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{formatCurrency(pos.value)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>الوزن</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: pos.weight > 20 ? 'var(--loss)' : 'var(--text-main)' }}>{pos.weight.toFixed(1)}%</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>24س</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {pos.change24h >= 0 ? <TrendingUp size={11} style={{ color: 'var(--profit)' }} /> : <TrendingDown size={11} style={{ color: 'var(--loss)' }} />}
                        <span style={{
                          fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)',
                          color: pos.change24h >= 0 ? 'var(--profit)' : 'var(--loss)',
                        }} dir="ltr">{pos.change24h >= 0 ? '+' : ''}{pos.change24h.toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* ── Analysis Tab ── */}
          {activeTab === 'analysis' && (
            <motion.div key="analysis" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Risk Score */}
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '20px', position: 'relative', overflow: 'hidden',
              }}>
                {/* Top accent line */}
                <div style={{
                  position: 'absolute', top: '-1px', left: '15%', right: '15%',
                  height: '1px',
                  background: `linear-gradient(90deg, transparent, ${getRiskColor(report.riskScore)}, transparent)`,
                  opacity: 0.5,
                }} />
                {/* Background glow */}
                <div style={{
                  position: 'absolute', top: '-10px', left: '-10px',
                  width: '80px', height: '80px',
                  background: getRiskColor(report.riskScore), filter: 'blur(40px)', opacity: 0.12,
                  pointerEvents: 'none',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <div style={{
                        width: '26px', height: '26px', borderRadius: '7px',
                        background: getRiskGradient(report.riskScore),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Shield size={12} color="#fff" strokeWidth={2.2} />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-ar)' }}>مستوى المخاطر</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span style={{ fontSize: '36px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: getRiskColor(report.riskScore) }}>{report.riskScore}</span>
                      <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>/100</span>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px',
                        fontFamily: 'var(--font-ar)',
                        background: getRiskBg(report.riskScore), border: `1px solid ${getRiskBorder(report.riskScore)}`, color: getRiskColor(report.riskScore),
                      }}>{getRiskLabel(report.riskScore)}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ar)', marginTop: '8px', lineHeight: '1.6', maxWidth: '460px' }}>{report.summary}</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>القيمة الإجمالية</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{formatCurrency(report.totalValue)}</div>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '10px', overflow: 'hidden', position: 'relative',
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '6px',
                    background: 'linear-gradient(135deg, #00FFC6, #00B894)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Info size={11} color="#fff" strokeWidth={2.2} />
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>التوصيات</span>
                </div>
                <div style={{ padding: '8px' }}>
                  {report.recommendations.map((rec, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.25 }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '8px',
                        padding: '10px 12px', borderRadius: '8px',
                        background: 'var(--profit-bg)', border: '1px solid var(--border-subtle)',
                        marginBottom: '6px',
                      }}
                    >
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--profit)', marginTop: '6px', flexShrink: 0, boxShadow: '0 0 4px rgba(0,255,198,0.4)' }} />
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ar)', lineHeight: '1.6' }}>{rec}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* AI Analysis */}
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--purple-border)',
                borderRadius: '10px', overflow: 'hidden', position: 'relative',
              }}>
                {/* Top accent line */}
                <div style={{
                  position: 'absolute', top: '-1px', left: '20%', right: '20%',
                  height: '1px',
                  background: 'linear-gradient(90deg, transparent, var(--purple), transparent)',
                  opacity: 0.5,
                }} />
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '6px',
                    background: 'linear-gradient(135deg, #A259FF, #7C3AED)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Sparkles size={11} color="#fff" strokeWidth={2.2} />
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>تحليل الذكاء الاصطناعي</span>
                </div>
                <div style={{ padding: '16px' }}>
                  <div style={{
                    padding: '14px', borderRadius: '8px',
                    background: 'var(--purple-bg)', border: '1px solid var(--purple-border)',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute', top: '-8px', right: '-8px',
                      width: '40px', height: '40px',
                      background: 'var(--purple)', filter: 'blur(24px)', opacity: 0.1,
                      pointerEvents: 'none',
                    }} />
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ar)', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>{report.aiAnalysis}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Empty State */}
      {!report && !loading && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '56px 48px', textAlign: 'center',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Subtle background glow */}
          <div style={{
            position: 'absolute', top: '20%', left: '30%', right: '30%',
            height: '60px',
            background: 'var(--accent)', filter: 'blur(60px)', opacity: 0.04,
            pointerEvents: 'none',
          }} />
          {/* Top accent line */}
          <div style={{
            position: 'absolute', top: '-1px', left: '25%', right: '25%',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
            opacity: 0.3,
          }} />

          <div style={{
            width: '56px', height: '56px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #FFB800, #FF8C00)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 0 20px rgba(255,184,0,0.2)',
          }}>
            <Shield size={24} color="#fff" strokeWidth={2} />
          </div>
          <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>لا توجد بيانات محفظة</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', marginTop: '6px', lineHeight: '1.6', maxWidth: '340px', marginInline: 'auto' }}>
            اربط حساب البورصة الخاص بك أولاً لتفعيل تحليل المخاطر والحصول على رؤى شاملة
          </p>
          <button
            onClick={() => router.push('/dashboard/settings/exchange')}
            style={{
              marginTop: '20px', padding: '10px 24px', borderRadius: '8px',
              border: '1px solid var(--accent-border)',
              background: 'linear-gradient(135deg, var(--accent), #5E5CE6)',
              color: '#fff', fontSize: '12px', fontWeight: 700,
              fontFamily: 'var(--font-ar)', cursor: 'pointer',
              boxShadow: '0 0 12px var(--accent-bg)',
            }}
          >
            ربط حساب بورصة
          </button>
        </motion.div>
      )}

      {/* Disclaimer */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        padding: '12px 16px', borderRadius: '8px',
        background: 'var(--warning-bg)', border: '1px solid var(--border-warning)',
        marginTop: '16px',
      }}>
        <AlertTriangle size={13} style={{ color: 'var(--warning)', marginTop: '1px', flexShrink: 0 }} />
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', lineHeight: '1.5' }}>
          تحليل ملاذ المحفظة لأغراض تعليمية فقط وليس نصيحة استثمارية. لا تلمس رؤى أموالك أبداً — نحن نقرأ فقط.
        </span>
      </div>
    </SubPageLayout>
  )
}
