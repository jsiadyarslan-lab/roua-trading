'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Shield, Loader2, RefreshCw, AlertTriangle, CheckCircle, PieChart, TrendingDown, BarChart3 } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

interface RiskMetric {
  label: string
  value: number
  max: number
  unit: string
  color: string
  status: 'good' | 'warning' | 'danger'
}

interface Allocation {
  symbol: string
  percent: number
  value: number
  color: string
}

export default function MobileSanctuaryPage() {
  const router = useRouter()
  const [portfolioData, setPortfolioData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchPortfolio = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portfolio/summary')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setPortfolioData(data.data || data)
          return
        }
      }
    } catch { /* */ }
    // Set demo data
    setPortfolioData(null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchPortfolio() }, [fetchPortfolio])

  // Risk metrics (demo or from API)
  const riskMetrics: RiskMetric[] = portfolioData?.riskMetrics || [
    { label: 'التنويع', value: 72, max: 100, unit: '%', color: C.success, status: 'good' },
    { label: 'مخاطر التركز', value: 35, max: 100, unit: '%', color: C.amber, status: 'warning' },
    { label: 'التهديد المرتبط', value: 58, max: 100, unit: '%', color: C.amber, status: 'warning' },
    { label: 'أقصى خسارة متوقعة', value: 12, max: 100, unit: '%', color: C.danger, status: 'danger' },
  ]

  // Allocations
  const allocations: Allocation[] = portfolioData?.allocations || [
    { symbol: 'BTC/USD', percent: 42, value: 25200, color: '#FF9F43' },
    { symbol: 'ETH/USD', percent: 28, value: 16800, color: '#00D4FF' },
    { symbol: 'XAU/USD', percent: 18, value: 10800, color: '#FFB800' },
    { symbol: 'EUR/USD', percent: 8, value: 4800, color: '#32D74B' },
    { symbol: 'أخرى', percent: 4, value: 2400, color: '#8B92A8' },
  ]

  // Overall risk score
  const overallRisk = portfolioData?.riskScore ?? 47
  const riskColor = overallRisk >= 70 ? C.danger : overallRisk >= 40 ? C.amber : C.success
  const riskLabel = overallRisk >= 70 ? 'مرتفع' : overallRisk >= 40 ? 'متوسط' : 'منخفض'

  // Diversification score
  const diversificationScore = riskMetrics.find(m => m.label === 'التنويع')?.value ?? 72

  // Concentration alerts
  const concentrationAlerts = allocations.filter(a => a.percent > 30)

  return (
    <div className="m-page">
      <MobilePageHeader
        title="تحليل المخاطر"
        subtitle="تنويع وتقييم المخاطر"
        onBack={() => router.back()}
        right={
          <button onClick={fetchPortfolio} disabled={loading} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} color={C.text2} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* Overall Risk Score */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', border: `3px solid ${riskColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: `${riskColor}08` }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: riskColor, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{overallRisk}</span>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.text, fontFamily: "'Cairo', sans-serif" }}>مستوى المخاطر</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: riskColor, fontFamily: "'Cairo', sans-serif" }}>{riskLabel}</div>
            </div>
          </div>
          <Shield size={28} color={riskColor} style={{ opacity: 0.3 }} />
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${overallRisk}%`, background: `linear-gradient(90deg, ${C.success}, ${C.amber}, ${C.danger})`, borderRadius: 3 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 7, color: C.success, fontFamily: "'Cairo', sans-serif" }}>منخفض</span>
          <span style={{ fontSize: 7, color: C.amber, fontFamily: "'Cairo', sans-serif" }}>متوسط</span>
          <span style={{ fontSize: 7, color: C.danger, fontFamily: "'Cairo', sans-serif" }}>مرتفع</span>
        </div>
      </IOSCard>

      {/* Allocation Donut (Visual) */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <PieChart size={14} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>توزيع المحفظة</span>
        </div>

        {/* Visual bar representation */}
        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
          {allocations.map((a, i) => (
            <div key={i} style={{ width: `${a.percent}%`, background: a.color, transition: 'width 0.5s' }} />
          ))}
        </div>

        {/* Allocation list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allocations.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: a.color }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{a.symbol}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: a.color, fontFamily: "'JetBrains Mono', monospace" }}>{a.percent}%</span>
                <span style={{ fontSize: 9, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>${a.value.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </IOSCard>

      {/* Risk Metrics */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <BarChart3 size={14} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>مقاييس المخاطر</span>
        </div>
        {riskMetrics.map((metric, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {metric.status === 'good' ? <CheckCircle size={10} color={C.success} /> : metric.status === 'warning' ? <AlertTriangle size={10} color={C.amber} /> : <TrendingDown size={10} color={C.danger} />}
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{metric.label}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 900, color: metric.color, fontFamily: "'JetBrains Mono', monospace" }}>{metric.value}{metric.unit}</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${metric.value}%`, background: metric.color, borderRadius: 2, transition: 'width 0.5s' }} />
            </div>
          </div>
        ))}
      </IOSCard>

      {/* Concentration Alerts */}
      {concentrationAlerts.length > 0 && (
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <AlertTriangle size={14} color={C.amber} />
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>تنبيهات التركز</span>
          </div>
          {concentrationAlerts.map((a, i) => (
            <div key={i} style={{ padding: '6px 10px', borderRadius: 8, background: `${C.amber}06`, border: `0.5px solid ${C.amber}15`, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, fontFamily: "'Cairo', sans-serif" }}>{a.symbol} يشكّل {a.percent}% من محفظتك — يُنصح بتقليل التركز.</span>
            </div>
          ))}
        </IOSCard>
      )}

      {/* Diversification Tips */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Shield size={14} color={C.success} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>نصائح التنويع</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {diversificationScore < 60 && (
            <div style={{ padding: '6px 10px', borderRadius: 8, background: `${C.amber}06`, border: `0.5px solid ${C.amber}12` }}>
              <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>درجة التنويع منخفضة — فكّر في إضافة أصول من فئات مختلفة لتقليل الارتباط.</span>
            </div>
          )}
          <div style={{ padding: '6px 10px', borderRadius: 8, background: `${C.accent}06`, border: `0.5px solid ${C.accent}12` }}>
            <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>تنويع بين كريبتو وفوركس ومعادن ثمينة يقلل المخاطر المرتبطة بنسبة تصل إلى 40%.</span>
          </div>
        </div>
      </IOSCard>

      <div style={{ height: 20 }} />
    </div>
  )
}
