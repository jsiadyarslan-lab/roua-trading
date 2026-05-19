'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Newspaper, Clock, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react'

const MOCK_NEWS = [
  { id: 1, title: 'بيتكوين يتجاوز 105,000 دولار بمكاسب قوية', source: 'CoinDesk', time: 'منذ 15 دقيقة', impact: 'high' as const, pair: 'BTC/USD', direction: 'up' as const },
  { id: 2, title: 'الفيدرالي يشير إلى إبقاء أسعار الفائدة مرتفعة', source: 'Reuters', time: 'منذ ساعة', impact: 'high' as const, pair: 'EUR/USD', direction: 'down' as const },
  { id: 3, title: 'الذهب يصل لمستوى قياسي جديد فوق 2,400 دولار', source: 'Bloomberg', time: 'منذ ساعتين', impact: 'medium' as const, pair: 'XAU/USD', direction: 'up' as const },
  { id: 4, title: 'إيثريوم تكمل ترقية شبكية مهمة', source: 'The Block', time: 'منذ 3 ساعات', impact: 'medium' as const, pair: 'ETH/USD', direction: 'up' as const },
  { id: 5, title: 'سولانا تستقطب مستثمرين جدد بمشاريع DeFi', source: 'Decrypt', time: 'منذ 5 ساعات', impact: 'low' as const, pair: 'SOL/USD', direction: 'up' as const },
  { id: 6, title: 'تقارير أرباح البنوك الأمريكية تفوق التوقعات', source: 'CNBC', time: 'منذ 6 ساعات', impact: 'medium' as const, pair: 'SPX', direction: 'up' as const },
]

const impactColors = { high: '#FF4757', medium: '#FFB800', low: '#8B92A8' }
const impactLabels = { high: 'مرتفع', medium: 'متوسط', low: 'منخفض' }

export default function MobileNewsPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="الأخبار" subtitle="أخبار السوق المالي لحظة بلحظة" />

      {/* Impact Legend */}
      <div style={{ display: 'flex', gap: 12, padding: '0 16px', marginBottom: 10 }}>
        {(['high', 'medium', 'low'] as const).map(imp => (
          <div key={imp} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: impactColors[imp] }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: impactColors[imp], fontFamily: "'Cairo', sans-serif" }}>{impactLabels[imp]}</span>
          </div>
        ))}
      </div>

      {MOCK_NEWS.map(news => (
        <IOSCard key={news.id}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${impactColors[news.impact]}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `0.5px solid ${impactColors[news.impact]}25` }}>
              {news.direction === 'up' ? <TrendingUp size={16} color="#00FFA3" /> : <TrendingDown size={16} color="#FF453A" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", lineHeight: 1.4, marginBottom: 4 }}>{news.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: impactColors[news.impact], fontFamily: "'Cairo', sans-serif", padding: '1px 6px', borderRadius: 4, background: `${impactColors[news.impact]}10` }}>{impactLabels[news.impact]}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace" }}>{news.pair}</span>
                <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{news.source}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={9} color="#8B92A8" />
                  <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{news.time}</span>
                </div>
              </div>
            </div>
          </div>
        </IOSCard>
      ))}

      <IOSCard>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Newspaper size={24} color="#8B92A8" style={{ margin: '0 auto 6px' }} />
          <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>يتم تحديث الأخبار تلقائياً كل دقيقة</div>
        </div>
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
