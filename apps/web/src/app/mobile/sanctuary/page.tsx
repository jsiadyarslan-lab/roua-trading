'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Shield, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, BarChart3, Activity } from 'lucide-react'

const MOCK_METRICS = { var95: '$1,240', maxDrawdown: '-8.4%', sharpeRatio: '1.72', healthScore: 78 }
const MOCK_RECOMMENDATIONS = [
  { type: 'warning', text: 'تركيز عالي في BTC — يُنصح بتوزيع أكثر', icon: AlertTriangle, color: '#FFB800' },
  { type: 'success', text: 'نسبة الفوز جيدة عند 67% — استمر', icon: CheckCircle, color: '#00FFA3' },
  { type: 'danger', text: 'وقف الخسارة غير محدد في 3 صفقات', icon: Shield, color: '#FF453A' },
]

export default function MobileSanctuaryPage() {
  const healthColor = MOCK_METRICS.healthScore >= 75 ? '#00FFA3' : MOCK_METRICS.healthScore >= 50 ? '#FFB800' : '#FF453A'

  return (
    <div className="m-page">
      <MobilePageHeader title="ملاذ المحفظة" subtitle="تحليل المخاطر" />

      {/* Health Score */}
      <IOSCard highlight>
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: `${healthColor}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', border: `2px solid ${healthColor}40`, boxShadow: `0 0 20px ${healthColor}20` }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: healthColor, fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_METRICS.healthScore}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>صحة المحفظة</div>
          <div style={{ fontSize: 11, color: healthColor, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>{MOCK_METRICS.healthScore >= 75 ? 'جيدة' : MOCK_METRICS.healthScore >= 50 ? 'متوسطة' : 'ضعيفة'}</div>
        </div>
      </IOSCard>

      {/* Risk Metrics */}
      <div style={{ padding: '0 16px', marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>مقاييس المخاطر</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 8 }}>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><Shield size={14} color="#FF453A" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_METRICS.var95}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>VaR 95%</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><TrendingDown size={14} color="#FF453A" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_METRICS.maxDrawdown}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>أقصى تراجع</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><BarChart3 size={14} color="#00D4FF" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_METRICS.sharpeRatio}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>شارب</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><Activity size={14} color="#B388FF" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>1.42</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>معامل الربح</div></div></IOSCard>
      </div>

      {/* Recommendations */}
      <div style={{ padding: '0 16px', marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>توصيات</span></div>
      {MOCK_RECOMMENDATIONS.map((rec, i) => {
        const Icon = rec.icon
        return (
          <IOSCard key={i}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${rec.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={14} color={rec.color} /></div>
              <span style={{ fontSize: 11, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>{rec.text}</span>
            </div>
          </IOSCard>
        )
      })}
      <div style={{ height: 16 }} />
    </div>
  )
}
