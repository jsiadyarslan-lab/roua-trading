'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Target, TrendingUp, TrendingDown, Clock, Brain, BarChart3 } from 'lucide-react'

const MOCK_PREDICTIONS = [
  { id: 1, pair: 'BTC/USD', aiPred: 'صعود', aiConf: 78, marketPred: 'صعود', marketConf: 62, currentPrice: 105420, targetPrice: 110000, timeLeft: '4 ساعات', trend: 'up' as const },
  { id: 2, pair: 'XAU/USD', aiPred: 'هبوط', aiConf: 71, marketPred: 'صعود', marketConf: 55, currentPrice: 2418, targetPrice: 2380, timeLeft: '12 ساعة', trend: 'down' as const },
  { id: 3, pair: 'ETH/USD', aiPred: 'صعود', aiConf: 65, marketPred: 'صعود', marketConf: 58, currentPrice: 3845, targetPrice: 4000, timeLeft: 'يوم واحد', trend: 'up' as const },
  { id: 4, pair: 'EUR/USD', aiPred: 'محايد', aiConf: 42, marketPred: 'هبوط', marketConf: 51, currentPrice: 1.0845, targetPrice: 1.0820, timeLeft: '8 ساعات', trend: 'down' as const },
]

export default function MobilePredictionMarketPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="التنبؤات" subtitle="AI مقابل السوق" />

      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Brain size={16} color="#B388FF" /><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>كيف تعمل؟</span></div>
        <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>نماذج الذكاء الاصطناعي تحلل البيانات وتتنبأ بالاتجاه. قارن توقعات AI مع إجماع السوق واكتشف الفرص.</div>
      </IOSCard>

      {MOCK_PREDICTIONS.map(pred => {
        const agree = pred.aiPred === pred.marketPred
        return (
          <IOSCard key={pred.id}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: pred.trend === 'up' ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {pred.trend === 'up' ? <TrendingUp size={16} color="#00FFA3" /> : <TrendingDown size={16} color="#FF453A" />}
                </div>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{pred.pair}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} color="#8B92A8" /><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{pred.timeLeft}</span></div>
            </div>

            {/* AI vs Market */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(179,136,255,0.06)', border: '0.5px solid rgba(179,136,255,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}><Brain size={10} color="#B388FF" /><span style={{ fontSize: 9, fontWeight: 700, color: '#B388FF', fontFamily: "'Cairo', sans-serif" }}>توقع AI</span></div>
                <div style={{ fontSize: 14, fontWeight: 900, color: pred.aiPred === 'صعود' ? '#00FFA3' : pred.aiPred === 'هبوط' ? '#FF453A' : '#FFB800', fontFamily: "'Cairo', sans-serif" }}>{pred.aiPred}</div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 4, direction: 'ltr' }}><div style={{ height: 4, borderRadius: 2, background: '#B388FF', width: `${pred.aiConf}%` }} /></div>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#B388FF', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{pred.aiConf}%</div>
              </div>
              <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(0,212,255,0.06)', border: '0.5px solid rgba(0,212,255,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}><BarChart3 size={10} color="#00D4FF" /><span style={{ fontSize: 9, fontWeight: 700, color: '#00D4FF', fontFamily: "'Cairo', sans-serif" }}>إجماع السوق</span></div>
                <div style={{ fontSize: 14, fontWeight: 900, color: pred.marketPred === 'صعود' ? '#00FFA3' : pred.marketPred === 'هبوط' ? '#FF453A' : '#FFB800', fontFamily: "'Cairo', sans-serif" }}>{pred.marketPred}</div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 4, direction: 'ltr' }}><div style={{ height: 4, borderRadius: 2, background: '#00D4FF', width: `${pred.marketConf}%` }} /></div>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{pred.marketConf}%</div>
              </div>
            </div>

            {/* Agreement Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: agree ? 'rgba(0,255,163,0.08)' : 'rgba(255,184,0,0.08)', color: agree ? '#00FFA3' : '#FFB800', fontFamily: "'Cairo', sans-serif" }}>{agree ? 'توافق ✓' : 'اختلاف ⚡'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الحالي: <span style={{ color: '#FFF', fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>${pred.currentPrice.toLocaleString()}</span></span>
                <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الهدف: <span style={{ color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>${pred.targetPrice.toLocaleString()}</span></span>
              </div>
            </div>
          </IOSCard>
        )
      })}
      <div style={{ height: 16 }} />
    </div>
  )
}
