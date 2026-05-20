'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, Card } from '@/components/mobile/Card'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import {
  TrendingUp, TrendingDown, Shield, BarChart3, Clock,
  Target, Activity, AlertTriangle, ChevronLeft
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   ROUA MOBILE — Portfolio Analytics Dashboard
   Comprehensive portfolio overview with metrics, P&L chart,
   asset allocation, risk assessment, and trade statistics.
   ═══════════════════════════════════════════════════════════════ */

// ── Helpers ──

function fmtUSD(n: number): string {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n: number, decimals = 1): string {
  return n.toFixed(decimals)
}

/** Risk color from score 1-10 (green→yellow→red) */
function riskColor(score: number): string {
  if (score <= 3) return '#00FFA3'
  if (score <= 5) return '#FFB800'
  if (score <= 7) return '#FF9F43'
  return '#FF4757'
}

/** Classify a symbol into asset type */
function classifyAsset(symbol: string): 'Crypto' | 'Forex' | 'Commodities' {
  const s = symbol.toUpperCase()
  const cryptoBases = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC', 'LINK', 'UNI', 'SHIB', 'PEPE']
  const forexBases = ['EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']
  const commodityBases = ['XAU', 'XAG', 'GOLD', 'SILVER', 'OIL', 'WTI', 'BRENT']

  const base = s.split('/')[0]
  if (cryptoBases.includes(base)) return 'Crypto'
  if (commodityBases.includes(base) || base === 'GOLD' || base === 'XAU') return 'Commodities'
  if (forexBases.includes(base) || s.includes('USD') || s.includes('EUR')) return 'Forex'
  return 'Crypto' // default
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  Crypto: 'العملات الرقمية',
  Forex: 'الفوركس',
  Commodities: 'السلع',
}

const ASSET_TYPE_COLORS: Record<string, string> = {
  Crypto: '#00D4FF',
  Forex: '#B388FF',
  Commodities: '#FFB800',
}

// ── Mock P&L data for last 7 days ──
const MOCK_DAILY_PNL = [
  { day: 'سبت', value: 142.50 },
  { day: 'أحد', value: -87.30 },
  { day: 'إثنين', value: 231.80 },
  { day: 'ثلاثاء', value: -56.20 },
  { day: 'أربعاء', value: 318.40 },
  { day: 'خميس', value: -124.60 },
  { day: 'جمعة', value: 195.30 },
]

// ── P&L Bar Chart (SVG) ──
function PnlBarChart({ data }: { data: typeof MOCK_DAILY_PNL }) {
  const maxAbs = Math.max(...data.map(d => Math.abs(d.value)), 1)
  const chartH = 120
  const barW = 28
  const gap = 16
  const totalW = data.length * (barW + gap) - gap
  const midY = chartH / 2

  return (
    <svg
      viewBox={`0 0 ${totalW + 8} ${chartH + 28}`}
      style={{ width: '100%', height: 'auto', direction: 'ltr' }}
    >
      {/* Zero line */}
      <line
        x1={4} y1={midY} x2={totalW + 4} y2={midY}
        stroke="rgba(255,255,255,0.08)" strokeWidth={1}
      />
      {/* Bars */}
      {data.map((d, i) => {
        const x = 4 + i * (barW + gap)
        const isProfit = d.value >= 0
        const barH = (Math.abs(d.value) / maxAbs) * (midY - 8)
        const barY = isProfit ? midY - barH : midY
        const color = isProfit ? '#00FFA3' : '#FF4757'
        const fillOpacity = isProfit ? '0.85' : '0.85'

        return (
          <g key={i}>
            <rect
              x={x} y={barY} width={barW} height={Math.max(barH, 2)}
              rx={4} fill={color} fillOpacity={fillOpacity}
            />
            {/* Value label */}
            <text
              x={x + barW / 2}
              y={isProfit ? barY - 4 : barY + barH + 12}
              textAnchor="middle"
              fill={color}
              style={{ fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700 }}
            >
              {d.value >= 0 ? '+' : ''}{d.value.toFixed(0)}
            </text>
            {/* Day label */}
            <text
              x={x + barW / 2}
              y={chartH + 22}
              textAnchor="middle"
              fill="#8B92A8"
              style={{ fontSize: 8, fontFamily: 'var(--font-cairo)', fontWeight: 700 }}
            >
              {d.day}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Progress Bar ──
function ProgressBar({ value, max, color, height = 6 }: { value: number; max: number; color: string; height?: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ height, borderRadius: height / 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', direction: 'ltr' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: height / 2, background: color, transition: 'width 0.5s ease' }} />
    </div>
  )
}

// ── Main Page ──
export default function MobilePortfolioPage() {
  const router = useRouter()
  const { account, positions, fetchAccount, fetchPositions } = usePositionsStore()
  const { closedTrades, trades: openPaperTrades } = usePaperTradesStore()

  useEffect(() => {
    fetchAccount()
    fetchPositions()
  }, [fetchAccount, fetchPositions])

  // ── Derived Data ──

  const equity = Number(account?.equity ?? 0) || 0
  const unrealizedPnl = Number(account?.unrealizedPnl ?? 0) || 0
  const initialMargin = Number(account?.initialMargin ?? 0) || 0
  const isUp = unrealizedPnl >= 0

  // Long vs Short
  const longPositions = positions.filter(p => p.side === 'long')
  const shortPositions = positions.filter(p => p.side === 'short')
  const longValue = longPositions.reduce((s, p) => s + Math.abs(Number(p.marketValue || 0)), 0)
  const shortValue = shortPositions.reduce((s, p) => s + Math.abs(Number(p.marketValue || 0)), 0)
  const totalPosValue = longValue + shortValue || 1
  const longPct = (longValue / totalPosValue) * 100
  const shortPct = (shortValue / totalPosValue) * 100

  // Performance Metrics from paper trades
  const allClosed = closedTrades || []
  const totalClosedTrades = allClosed.length
  const wins = allClosed.filter(t => t.realizedPnl > 0)
  const losses = allClosed.filter(t => t.realizedPnl <= 0)
  const winRate = totalClosedTrades > 0 ? (wins.length / totalClosedTrades) * 100 : 0

  const grossProfit = wins.reduce((s, t) => s + t.realizedPnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.realizedPnl, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0

  // Sharpe Ratio (simple approximation from closed trades)
  const sharpeRatio = useMemo(() => {
    if (allClosed.length < 2) return 0
    const returns = allClosed.map(t => t.realizedPct || 0)
    const avg = returns.reduce((s, r) => s + r, 0) / returns.length
    const variance = returns.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / (returns.length - 1)
    const stdDev = Math.sqrt(variance)
    return stdDev > 0 ? avg / stdDev : 0
  }, [allClosed])

  // Max Drawdown from equity curve approximation
  const maxDrawdown = useMemo(() => {
    if (allClosed.length < 2) return 0
    let peak = 0
    let maxDD = 0
    let equityCurve = 0
    for (const t of allClosed) {
      equityCurve += t.realizedPnl
      if (equityCurve > peak) peak = equityCurve
      const dd = peak - equityCurve
      if (dd > maxDD) maxDD = dd
    }
    return maxDD
  }, [allClosed])

  // Asset Allocation
  const allocation = useMemo(() => {
    const groups: Record<string, { total: number; pnl: number; count: number }> = {}
    for (const p of positions) {
      const type = classifyAsset(p.symbol)
      if (!groups[type]) groups[type] = { total: 0, pnl: 0, count: 0 }
      groups[type].total += Math.abs(Number(p.marketValue || 0))
      groups[type].pnl += Number(p.unrealizedPnl || 0)
      groups[type].count++
    }
    return Object.entries(groups)
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.total - a.total)
  }, [positions])

  const totalAllocationValue = allocation.reduce((s, a) => s + a.total, 0) || 1

  // Risk Assessment
  const leverageLevel = equity > 0 ? initialMargin / equity : 0
  const concentrationRisk = useMemo(() => {
    if (positions.length === 0) return 0
    const maxPosValue = Math.max(...positions.map(p => Math.abs(Number(p.marketValue || 0))))
    return totalPosValue > 0 ? (maxPosValue / totalPosValue) * 100 : 0
  }, [positions, totalPosValue])

  const correlationRisk = useMemo((): 'Low' | 'Medium' | 'High' => {
    const types = new Set(positions.map(p => classifyAsset(p.symbol)))
    if (positions.length <= 1) return 'Low'
    if (types.size >= 3) return 'Low'
    if (types.size === 2) return 'Medium'
    return 'High'
  }, [positions])

  const overallRiskScore = useMemo((): number => {
    let score = 0
    // Leverage contribution (0-3)
    if (leverageLevel > 5) score += 3
    else if (leverageLevel > 2) score += 2
    else if (leverageLevel > 0.5) score += 1
    // Concentration contribution (0-3)
    if (concentrationRisk > 60) score += 3
    else if (concentrationRisk > 40) score += 2
    else if (concentrationRisk > 20) score += 1
    // Correlation contribution (0-2)
    if (correlationRisk === 'High') score += 2
    else if (correlationRisk === 'Medium') score += 1
    // Number of positions (0-2)
    if (positions.length > 10) score += 2
    else if (positions.length > 5) score += 1
    return Math.min(score, 10)
  }, [leverageLevel, concentrationRisk, correlationRisk, positions.length])

  const correlationRiskLabel: Record<string, string> = { Low: 'منخفض', Medium: 'متوسط', High: 'مرتفع' }

  // Trade Statistics
  const totalTrades = totalClosedTrades + openPaperTrades.length
  const allPnls = allClosed.map(t => t.realizedPnl)
  const avgPnl = totalClosedTrades > 0 ? allPnls.reduce((s, p) => s + p, 0) / totalClosedTrades : 0
  const bestTrade = allPnls.length > 0 ? Math.max(...allPnls) : 0
  const worstTrade = allPnls.length > 0 ? Math.min(...allPnls) : 0
  const avgHoldingTime = useMemo(() => {
    if (allClosed.length === 0) return '—'
    const totalMs = allClosed.reduce((s, t) => {
      if (t.closeTime && t.entryTime) return s + (t.closeTime - t.entryTime)
      return s
    }, 0)
    const avgMs = totalMs / allClosed.length
    const hours = Math.floor(avgMs / 3600000)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}ي ${hours % 24}س`
    if (hours > 0) return `${hours}س`
    const minutes = Math.floor(avgMs / 60000)
    return `${minutes}د`
  }, [allClosed])

  return (
    <div className="r-page">
      <PageHeader title="المحفظة الاستثمارية" subtitle="تحليلات ومؤشرات الأداء" />

      {/* ── 1. Portfolio Overview Card (highlighted) ── */}
      <Card highlight>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 4 }}>
              إجمالي قيمة المحفظة
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
              ${fmtUSD(equity)}
            </div>
          </div>
          <div style={{
            padding: '8px 14px', borderRadius: 12,
            background: isUp ? 'rgba(0,255,163,0.08)' : 'rgba(255,69,58,0.08)',
            border: `1px solid ${isUp ? 'rgba(0,255,163,0.2)' : 'rgba(255,69,58,0.2)'}`,
            textAlign: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              {isUp ? <TrendingUp size={14} color="#00FFA3" /> : <TrendingDown size={14} color="#FF4757" />}
              <span style={{ fontSize: 16, fontWeight: 900, color: isUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
                {isUp ? '+' : ''}${unrealizedPnl.toFixed(2)}
              </span>
            </div>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 2 }}>24س P&L</div>
          </div>
        </div>

        {/* Asset allocation mini bar */}
        {positions.length > 0 && (
          <>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', direction: 'ltr' }}>
              <div style={{ width: `${longPct}%`, background: '#00FFA3', borderRadius: 3, transition: 'width 0.5s ease' }} />
              <div style={{ width: `${shortPct}%`, background: '#FF4757', borderRadius: 3, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: '#00FFA3' }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
                  شراء {fmtPct(longPct)}%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: '#FF4757' }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
                  بيع {fmtPct(shortPct)}%
                </span>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ── 2. Performance Metrics Grid (2x2) ── */}
      <div className="r-section__title" style={{ marginTop: 8 }}>مؤشرات الأداء</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 var(--space-lg)', marginBottom: 12 }}>
        {/* Win Rate */}
        <Card noMargin>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,255,163,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={14} color="#00FFA3" />
            </div>
            <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>نسبة الفوز</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#00FFA3', fontFamily: 'var(--font-mono)' }}>
            {fmtPct(winRate)}%
          </div>
          <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
            {wins.length} فوز / {totalClosedTrades} صفقة
          </div>
        </Card>

        {/* Sharpe Ratio */}
        <Card noMargin>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart3 size={14} color="#00D4FF" />
            </div>
            <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>معامل شارب</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#00D4FF', fontFamily: 'var(--font-mono)' }}>
            {sharpeRatio.toFixed(2)}
          </div>
          <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
            {sharpeRatio > 1 ? 'ممتاز' : sharpeRatio > 0 ? 'مقبول' : 'ضعيف'}
          </div>
        </Card>

        {/* Max Drawdown */}
        <Card noMargin>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,71,87,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingDown size={14} color="#FF4757" />
            </div>
            <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>أقصى تراجع</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#FF4757', fontFamily: 'var(--font-mono)' }}>
            ${fmtUSD(maxDrawdown)}
          </div>
          <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
            من قمة المحفظة
          </div>
        </Card>

        {/* Profit Factor */}
        <Card noMargin>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(179,136,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={14} color="#B388FF" />
            </div>
            <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>عامل الربح</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: profitFactor >= 1.5 ? '#00FFA3' : profitFactor >= 1 ? '#FFB800' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
            {profitFactor.toFixed(2)}
          </div>
          <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
            {profitFactor >= 2 ? 'ممتاز' : profitFactor >= 1.5 ? 'جيد' : profitFactor >= 1 ? 'مقبول' : 'ضعيف'}
          </div>
        </Card>
      </div>

      {/* ── 3. P&L Timeline ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} color="#00D4FF" />
            <span style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>
              أرباح وخسائر يومية
            </span>
          </div>
          <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>آخر 7 أيام</span>
        </div>
        <PnlBarChart data={MOCK_DAILY_PNL} />
      </Card>

      {/* ── 4. Asset Allocation Section ── */}
      {allocation.length > 0 && (
        <>
          <div className="r-section__title" style={{ marginTop: 8 }}>توزيع الأصول</div>
          {allocation.map((group) => {
            const color = ASSET_TYPE_COLORS[group.type] || '#00D4FF'
            const label = ASSET_TYPE_LABELS[group.type] || group.type
            const pct = (group.total / totalAllocationValue) * 100
            const isProfit = group.pnl >= 0

            return (
              <Card
                key={group.type}
                onClick={() => router.push('/mobile/positions')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 32, borderRadius: 4, background: color }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
                        {group.count} مركز
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
                      ${fmtUSD(group.total)}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: isProfit ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
                      {isProfit ? '+' : ''}{fmtUSD(group.pnl)}
                    </div>
                  </div>
                </div>
                {/* Allocation bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ProgressBar value={pct} max={100} color={color} height={4} />
                  <span style={{ fontSize: 9, fontWeight: 800, color, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {fmtPct(pct)}%
                  </span>
                </div>
                {/* Navigate hint */}
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>عرض المراكز</span>
                    <ChevronLeft size={10} color="#8B92A8" />
                  </div>
                </div>
              </Card>
            )
          })}
        </>
      )}

      {/* ── 5. Risk Assessment Card ── */}
      <div className="r-section__title" style={{ marginTop: 8 }}>تقييم المخاطر</div>
      <Card>
        {/* Overall Risk Score */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} color={riskColor(overallRiskScore)} />
            <span style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>
              درجة المخاطر الإجمالية
            </span>
          </div>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: `${riskColor(overallRiskScore)}15`,
            border: `1px solid ${riskColor(overallRiskScore)}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: riskColor(overallRiskScore), fontFamily: 'var(--font-mono)' }}>
              {overallRiskScore}
            </span>
          </div>
        </div>
        <ProgressBar value={overallRiskScore} max={10} color={riskColor(overallRiskScore)} height={8} />

        {/* Individual Risk Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          {/* Leverage Level */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>مستوى الرافعة</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: leverageLevel > 5 ? '#FF4757' : leverageLevel > 2 ? '#FFB800' : '#00FFA3', fontFamily: 'var(--font-mono)' }}>
              {leverageLevel.toFixed(1)}x
            </div>
            <ProgressBar value={Math.min(leverageLevel * 10, 100)} max={100} color={leverageLevel > 5 ? '#FF4757' : leverageLevel > 2 ? '#FFB800' : '#00FFA3'} height={3} />
          </div>

          {/* Concentration Risk */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>تركيز المخاطر</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: concentrationRisk > 60 ? '#FF4757' : concentrationRisk > 40 ? '#FFB800' : '#00FFA3', fontFamily: 'var(--font-mono)' }}>
              {fmtPct(concentrationRisk)}%
            </div>
            <ProgressBar value={concentrationRisk} max={100} color={concentrationRisk > 60 ? '#FF4757' : concentrationRisk > 40 ? '#FFB800' : '#00FFA3'} height={3} />
          </div>

          {/* Correlation Risk */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>مخاطر الارتباط</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: correlationRisk === 'High' ? '#FF4757' : correlationRisk === 'Medium' ? '#FFB800' : '#00FFA3', fontFamily: 'var(--font-cairo)' }}>
              {correlationRiskLabel[correlationRisk]}
            </div>
            <ProgressBar
              value={correlationRisk === 'High' ? 80 : correlationRisk === 'Medium' ? 50 : 20}
              max={100}
              color={correlationRisk === 'High' ? '#FF4757' : correlationRisk === 'Medium' ? '#FFB800' : '#00FFA3'}
              height={3}
            />
          </div>

          {/* Margin Usage */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>استخدام الهامش</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: equity > 0 && (initialMargin / equity) > 0.8 ? '#FF4757' : equity > 0 && (initialMargin / equity) > 0.5 ? '#FFB800' : '#00FFA3', fontFamily: 'var(--font-mono)' }}>
              {equity > 0 ? fmtPct((initialMargin / equity) * 100) : '0'}%
            </div>
            <ProgressBar value={equity > 0 ? (initialMargin / equity) * 100 : 0} max={100} color={equity > 0 && (initialMargin / equity) > 0.8 ? '#FF4757' : equity > 0 && (initialMargin / equity) > 0.5 ? '#FFB800' : '#00FFA3'} height={3} />
          </div>
        </div>
      </Card>

      {/* ── 6. Trade Statistics ── */}
      <div className="r-section__title" style={{ marginTop: 8 }}>إحصائيات التداول</div>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Total Trades */}
          <div style={{ padding: '8px 0' }}>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 4 }}>إجمالي الصفقات</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{totalTrades}</div>
          </div>

          {/* Average P&L */}
          <div style={{ padding: '8px 0' }}>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 4 }}>متوسط الربح/الخسارة</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: avgPnl >= 0 ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
              {avgPnl >= 0 ? '+' : ''}${fmtUSD(Math.abs(avgPnl))}
            </div>
          </div>

          {/* Best Trade */}
          <div style={{ padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)', borderRight: '0.5px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <TrendingUp size={10} color="#00FFA3" />
              <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>أفضل صفقة</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#00FFA3', fontFamily: 'var(--font-mono)' }}>
              +${fmtUSD(bestTrade)}
            </div>
          </div>

          {/* Worst Trade */}
          <div style={{ padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <TrendingDown size={10} color="#FF4757" />
              <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>أسوأ صفقة</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#FF4757', fontFamily: 'var(--font-mono)' }}>
              -${fmtUSD(Math.abs(worstTrade))}
            </div>
          </div>

          {/* Average Holding Time */}
          <div style={{ padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)', gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <Clock size={10} color="#B388FF" />
              <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>متوسط مدة الاحتفاظ</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#B388FF', fontFamily: 'var(--font-mono)' }}>
              {avgHoldingTime}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Empty State when no positions and no trades ── */}
      {positions.length === 0 && totalTrades === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <AlertTriangle size={28} color="#FFB800" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 12, fontWeight: 900, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
              لا توجد بيانات كافية لحساب التحليلات
            </div>
            <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 4 }}>
              ابدأ بالتداول لرؤية تحليلات المحفظة
            </div>
          </div>
        </Card>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
