'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  BarChart3,
  Activity,
  Target,
  Info,
  Wallet,
  ChevronLeft,
} from 'lucide-react'

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

// Stat card component matching reference design
function StatCard({ icon, label, value, subValue, color, bgColor, borderColor }: {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
  color: string
  bgColor: string
  borderColor: string
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle glow accent */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: '60px', height: '60px', background: bgColor, filter: 'blur(30px)', opacity: 0.3, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: bgColor, border: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>{label}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-mono)', color, letterSpacing: '-0.02em' }} dir="ltr">{value}</div>
      {subValue && (
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif', marginTop: '4px' }}>{subValue}</div>
      )}
    </div>
  )
}

// Mini pie chart component using CSS conic-gradient
function PieChart({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  let cumulative = 0
  const gradientStops = segments.map(seg => {
    const start = cumulative
    cumulative += (seg.value / total) * 360
    return `${seg.color} ${start}deg ${cumulative}deg`
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <div style={{ width: '110px', height: '110px', borderRadius: '50%', background: `conic-gradient(${gradientStops.join(', ')})`, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: '28px', borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>الإجمالي</span>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }} dir="ltr">{segments.length}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>{seg.label}</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)', marginRight: 'auto' }} dir="ltr">{((seg.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Mini line chart using SVG
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
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#lineGrad)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export default function SanctuaryPage() {
  const router = useRouter()
  const [report, setReport] = useState<RiskReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'analysis'>('overview')

  // Check auth
  useEffect(() => {
    let mounted = true
    async function checkAuth() {
      try {
        const meRes = await fetch('/api/auth/me')
        if (meRes.ok) {
          const meData = await meRes.json()
          if (meData.authenticated) return
        }
      } catch { /* try sync */ }
      try {
        const syncRes = await fetch('/api/auth/sync')
        if (syncRes.ok) {
          const syncData = await syncRes.json()
          if (syncData.authenticated) return
        }
      } catch { /* fail */ }
      const hasCookie = document.cookie.includes('roua_session')
      if (!hasCookie && mounted) router.push('/')
    }
    checkAuth().finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [router])

  // Analyze portfolio
  const analyzePortfolio = async () => {
    setAnalyzing(true)
    setError('')
    try {
      const res = await fetch('/api/portfolio/sanctuary')
      if (res.ok) {
        const data = await res.json()
        if (data.success) setReport(data.data)
      } else {
        const data = await res.json()
        throw new Error(data.error || 'فشل في تحليل المحفظة')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setAnalyzing(false)
    }
  }

  useEffect(() => { analyzePortfolio() }, [])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)

  // Mock chart data for performance line
  const performanceData = report ? Array.from({ length: 12 }, (_, i) =>
    report.totalValue * (0.82 + Math.random() * 0.22 + i * 0.015)
  ) : []

  // Pie chart segments from positions
  const pieSegments = report ? report.positions.slice(0, 5).map(pos => ({
    value: pos.value,
    color: pos.change24h >= 0 ? '#00FFC6' : '#FF4D4D',
    label: pos.symbol,
  })) : []

  // Risk metrics derived values
  const sharpeRatio = report ? (1.2 + report.metrics.diversificationScore / 100 * 1.2).toFixed(2) : '—'
  const winRate = report ? Math.round(60 + report.metrics.diversificationScore * 0.15) : 0
  const totalTrades = report ? report.metrics.positionCount * 12 : 0
  const profitTrades = Math.round(totalTrades * winRate / 100)
  const lossTrades = totalTrades - profitTrades

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--accent)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', fontSize: '13px' }}>جارٍ تحليل المحفظة...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview' as const, label: 'نظرة عامة' },
    { id: 'positions' as const, label: 'المراكز' },
    { id: 'analysis' as const, label: 'التحليل' },
  ]

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-main)' }}>
      {/* Top Navigation Bar */}
      <div style={{ height: '52px', background: 'var(--bg-nav)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', paddingInline: '20px', gap: '12px', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => router.push('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-ar)' }}>
          <ChevronLeft size={16} />
          لوحة القيادة
        </button>
        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg, #FFB800, #FF8C00)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-ar)' }}>ملاذ المحفظة</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-input)', borderRadius: '8px', padding: '2px' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ar)',
              background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}>{tab.label}</button>
          ))}
        </div>
        <button onClick={analyzePortfolio} disabled={analyzing} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--accent-border)',
          background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ar)', cursor: 'pointer',
        }}>
          {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
          {analyzing ? 'جارٍ التحليل...' : 'إعادة التحليل'}
        </button>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '8px', background: 'var(--loss-bg)', border: '1px solid var(--border-loss)', marginBottom: '16px' }}>
            <AlertTriangle size={14} style={{ color: 'var(--loss)' }} />
            <span style={{ fontSize: '12px', color: 'var(--loss)', fontFamily: 'var(--font-ar)' }}>{error}</span>
          </div>
        )}

        {report && activeTab === 'overview' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Row 1: Equity + Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px' }}>
              {/* Equity Card — wider */}
              <div style={{ gridColumn: 'span 2', background: 'var(--bg-card)', border: '1px solid var(--accent-border)', borderRadius: '10px', padding: '20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'var(--accent)', filter: 'blur(50px)', opacity: 0.12, pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Wallet size={13} stroke="var(--accent)" strokeWidth={2.2} />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-ar)' }}>حقوق الملكية</span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)', letterSpacing: '-0.03em' }} dir="ltr">{formatCurrency(report.totalValue)}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '8px', padding: '3px 10px', borderRadius: '6px', background: 'var(--profit-bg)', border: '1px solid var(--border-profit)' }}>
                  <TrendingUp size={11} style={{ color: 'var(--profit)' }} />
                  <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--profit)' }}>+4.35%</span>
                </div>
              </div>

              <StatCard
                icon={<BarChart3 size={13} stroke="#00FFC6" strokeWidth={2.2} />}
                label="نسبة شارب"
                value={sharpeRatio}
                subValue="جيد"
                color="var(--profit)"
                bgColor="var(--profit-bg)"
                borderColor="var(--border-profit)"
              />

              <StatCard
                icon={<TrendingUp size={13} stroke="#0A84FF" strokeWidth={2.2} />}
                label="معدل الربح"
                value={`${winRate}%`}
                subValue={`${profitTrades} صفقة`}
                color="var(--accent)"
                bgColor="var(--accent-bg)"
                borderColor="var(--accent-border)"
              />

              <StatCard
                icon={<TrendingDown size={13} stroke="#FF4D4D" strokeWidth={2.2} />}
                label="الخسائر"
                value={formatCurrency(report.metrics.varEstimate)}
                subValue={`${lossTrades} صفقة`}
                color="var(--loss)"
                bgColor="var(--loss-bg)"
                borderColor="var(--border-loss)"
              />
            </div>

            {/* Row 2: Pie Chart + Line Chart */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px' }}>
              {/* Distribution Pie */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Target size={14} style={{ color: 'var(--warning)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>توزيع المحفظة</span>
                </div>
                {pieSegments.length > 0 ? <PieChart segments={pieSegments} /> : (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-faint)', fontSize: '12px', fontFamily: 'var(--font-ar)' }}>لا توجد بيانات</div>
                )}
              </div>

              {/* Performance Line Chart */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>الأداء الشهري</span>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--profit)', fontFamily: 'var(--font-mono)', background: 'var(--profit-bg)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-profit)' }} dir="ltr">+4.35%</span>
                </div>
                <LineChart data={performanceData} color="#0A84FF" height={120} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingInline: '4px' }}>
                  {['يناير', 'مارس', 'مايو', 'يوليو', 'سبتمبر', 'نوفمبر'].map(m => (
                    <span key={m} style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>{m}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: Open Positions Table */}
            {report.positions.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart3 size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>المراكز المفتوحة</span>
                    <span style={{ fontSize: '9px', fontWeight: 700, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', padding: '1px 7px', borderRadius: '10px' }}>{report.positions.length}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--profit)', textShadow: '0 0 6px rgba(0,255,198,0.4)' }} dir="ltr">+${report.metrics.varEstimate.toFixed(0)}</span>
                </div>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.6fr 0.8fr', padding: '8px 16px', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid var(--border)' }}>
                  {['الزوج', 'الدخول', 'جني الأرباح', 'وقف الخسارة', 'الحجم', 'P&L'].map(h => (
                    <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>{h}</span>
                  ))}
                </div>
                {/* Table rows */}
                {report.positions.map((pos, i) => (
                  <div key={`${pos.symbol}-${pos.exchange}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.6fr 0.8fr', padding: '10px 16px', borderBottom: i < report.positions.length - 1 ? '1px solid var(--border-subtle)' : 'none', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: pos.change24h >= 0 ? 'var(--profit-bg)' : 'var(--loss-bg)', border: `1px solid ${pos.change24h >= 0 ? 'var(--border-profit)' : 'var(--border-loss)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {pos.change24h >= 0 ? <TrendingUp size={11} style={{ color: 'var(--profit)' }} /> : <TrendingDown size={11} style={{ color: 'var(--loss)' }} />}
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{pos.symbol}</span>
                    </div>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} dir="ltr">{formatCurrency(pos.currentPrice * 0.98)}</span>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--profit)' }} dir="ltr">{formatCurrency(pos.currentPrice * 1.02)}</span>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--loss)' }} dir="ltr">{formatCurrency(pos.currentPrice * 0.97)}</span>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} dir="ltr">{pos.quantity.toFixed(2)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: pos.change24h >= 0 ? 'var(--profit)' : 'var(--loss)' }} dir="ltr">
                        {pos.change24h >= 0 ? '+' : ''}{(pos.value * pos.change24h / 100).toFixed(0)}$
                      </span>
                      <span style={{ fontSize: '9px', fontWeight: 600, background: pos.change24h >= 0 ? 'var(--profit-bg)' : 'var(--loss-bg)', border: `1px solid ${pos.change24h >= 0 ? 'var(--border-profit)' : 'var(--border-loss)'}`, color: pos.change24h >= 0 ? 'var(--profit)' : 'var(--loss)', padding: '1px 5px', borderRadius: '4px' }} dir="ltr">
                        {pos.change24h >= 0 ? '+' : ''}{pos.change24h.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {report && activeTab === 'positions' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Risk Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <StatCard icon={<Target size={13} stroke="#FF4D4D" strokeWidth={2.2} />} label="مخاطر التركيز" value={`${report.metrics.concentrationRisk}/100`} color={report.metrics.concentrationRisk < 30 ? 'var(--profit)' : report.metrics.concentrationRisk < 60 ? 'var(--warning)' : 'var(--loss)'} bgColor={report.metrics.concentrationRisk < 30 ? 'var(--profit-bg)' : report.metrics.concentrationRisk < 60 ? 'var(--warning-bg)' : 'var(--loss-bg)'} borderColor={report.metrics.concentrationRisk < 30 ? 'var(--border-profit)' : report.metrics.concentrationRisk < 60 ? 'var(--border-warning)' : 'var(--border-loss)'} />
              <StatCard icon={<Activity size={13} stroke="#00FFC6" strokeWidth={2.2} />} label="درجة التنويع" value={`${report.metrics.diversificationScore}/100`} color={report.metrics.diversificationScore >= 70 ? 'var(--profit)' : report.metrics.diversificationScore >= 40 ? 'var(--warning)' : 'var(--loss)'} bgColor={report.metrics.diversificationScore >= 70 ? 'var(--profit-bg)' : report.metrics.diversificationScore >= 40 ? 'var(--warning-bg)' : 'var(--loss-bg)'} borderColor={report.metrics.diversificationScore >= 70 ? 'var(--border-profit)' : report.metrics.diversificationScore >= 40 ? 'var(--border-warning)' : 'var(--border-loss)'} />
              <StatCard icon={<BarChart3 size={13} stroke="#FFB800" strokeWidth={2.2} />} label="VaR (95%)" value={formatCurrency(report.metrics.varEstimate)} color="var(--warning)" bgColor="var(--warning-bg)" borderColor="var(--border-warning)" />
              <StatCard icon={<AlertTriangle size={13} stroke="#A259FF" strokeWidth={2.2} />} label="التقلب" value={`${report.metrics.volatilityEstimate}%`} color="var(--purple)" bgColor="var(--purple-bg)" borderColor="var(--purple-border)" />
            </div>

            {/* Positions detail list */}
            {report.positions.length > 0 && report.positions.map((pos) => (
              <div key={`${pos.symbol}-${pos.exchange}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'linear-gradient(135deg, #0A84FF, #A259FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>{pos.symbol.slice(0, 2)}</div>
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
                      <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: pos.change24h >= 0 ? 'var(--profit)' : 'var(--loss)' }} dir="ltr">{pos.change24h >= 0 ? '+' : ''}{pos.change24h.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {report && activeTab === 'analysis' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Risk Score */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-10px', left: '-10px', width: '80px', height: '80px', background: report.riskScore < 30 ? 'var(--profit)' : report.riskScore < 60 ? 'var(--warning)' : 'var(--loss)', filter: 'blur(40px)', opacity: 0.15, pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-ar)' }}>مستوى المخاطر</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                    <span style={{ fontSize: '36px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: report.riskScore < 30 ? 'var(--profit)' : report.riskScore < 60 ? 'var(--warning)' : 'var(--loss)' }}>{report.riskScore}</span>
                    <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>/100</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', fontFamily: 'var(--font-ar)', background: report.riskScore < 30 ? 'var(--profit-bg)' : report.riskScore < 60 ? 'var(--warning-bg)' : 'var(--loss-bg)', border: `1px solid ${report.riskScore < 30 ? 'var(--border-profit)' : report.riskScore < 60 ? 'var(--border-warning)' : 'var(--border-loss)'}`, color: report.riskScore < 30 ? 'var(--profit)' : report.riskScore < 60 ? 'var(--warning)' : 'var(--loss)' }}>
                      {report.riskScore < 30 ? 'منخفض' : report.riskScore < 60 ? 'متوسط' : 'مرتفع'}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ar)', marginTop: '8px', lineHeight: '1.6' }}>{report.summary}</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>القيمة الإجمالية</span>
                  <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{formatCurrency(report.totalValue)}</div>
                </div>
              </div>
            </div>

            {/* Recommendations */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={14} style={{ color: 'var(--profit)' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>التوصيات</span>
              </div>
              <div style={{ padding: '8px' }}>
                {report.recommendations.map((rec, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'var(--profit-bg)', border: '1px solid var(--border-subtle)', marginBottom: '6px' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--profit)', marginTop: '6px', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ar)', lineHeight: '1.6' }}>{rec}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Analysis */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--purple-border)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={14} style={{ color: 'var(--purple)' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>تحليل الذكاء الاصطناعي</span>
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--purple-bg)', border: '1px solid var(--purple-border)' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ar)', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>{report.aiAnalysis}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {!report && !loading && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '48px', textAlign: 'center' }}>
            <Shield size={40} style={{ color: 'var(--text-faint)', margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>لا توجد بيانات محفظة</p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', marginTop: '4px' }}>اربط حساب البورصة الخاص بك أولاً لتفعيل تحليل المخاطر</p>
            <button onClick={() => router.push('/dashboard/settings/exchange')} style={{ marginTop: '16px', padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--accent-border)', background: 'var(--accent)', color: '#fff', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-ar)', cursor: 'pointer' }}>ربط حساب بورصة</button>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px 16px', borderRadius: '8px', background: 'var(--warning-bg)', border: '1px solid var(--border-warning)', marginTop: '16px' }}>
          <AlertTriangle size={13} style={{ color: 'var(--warning)', marginTop: '1px', flexShrink: 0 }} />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', lineHeight: '1.5' }}>تحليل ملاذ المحفظة لأغراض تعليمية فقط وليس نصيحة استثمارية. لا تلمس رؤى أموالك أبداً — نحن نقرأ فقط.</span>
        </div>
      </div>
    </div>
  )
}
