'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Brain, TrendingUp, TrendingDown, Minus, Loader2, RefreshCw, Sparkles, BarChart3 } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

interface PredictionEvent {
  id: string
  title: string
  titleAr?: string
  marketOdds: number
  aiForecast: number
  aiDirection?: 'bullish' | 'bearish' | 'neutral'
  gap?: number
  category?: string
  endDate?: string
  volume?: number
  affectedSymbols?: string[]
}

const DEMO_EVENTS: PredictionEvent[] = [
  { id: '1', title: 'BTC above $100K by end of Q2', titleAr: 'بيتكوين فوق 100 ألف بنهاية الربع الثاني', marketOdds: 62, aiForecast: 74, aiDirection: 'bullish', gap: 12, category: 'كريبتو', endDate: '2026-06-30', affectedSymbols: ['BTC/USD'] },
  { id: '2', title: 'Fed rate cut in June meeting', titleAr: 'خفض الفائدة في اجتماع يونيو', marketOdds: 35, aiForecast: 22, aiDirection: 'bearish', gap: -13, category: 'ماكرو', endDate: '2026-06-18', affectedSymbols: ['EUR/USD', 'XAU/USD'] },
  { id: '3', title: 'ETH ETF approval by SEC', titleAr: 'موافقة SEC على صندوق ETH', marketOdds: 78, aiForecast: 85, aiDirection: 'bullish', gap: 7, category: 'تنظيم', endDate: '2026-07-15', affectedSymbols: ['ETH/USD'] },
  { id: '4', title: 'US CPI below 3% in May', titleAr: 'مؤشر CPI أقل من 3% في مايو', marketOdds: 41, aiForecast: 48, aiDirection: 'neutral', gap: 7, category: 'اقتصاد', endDate: '2026-05-15', affectedSymbols: ['EUR/USD', 'XAU/USD'] },
  { id: '5', title: 'SOL breaks $200 resistance', titleAr: 'سولانا يكسر مقاومة 200 دولار', marketOdds: 28, aiForecast: 42, aiDirection: 'bullish', gap: 14, category: 'كريبتو', endDate: '2026-05-30', affectedSymbols: ['SOL/USD'] },
  { id: '6', title: 'GBP/USD above 1.30', titleAr: 'الجنية فوق 1.30', marketOdds: 55, aiForecast: 47, aiDirection: 'bearish', gap: -8, category: 'فوركس', endDate: '2026-06-01', affectedSymbols: ['GBP/USD'] },
]

export default function MobilePredictionMarketPage() {
  const router = useRouter()
  const [events, setEvents] = useState<PredictionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'gaps'>('all')

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/prediction-market/events')
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setEvents(data.data)
          return
        }
      }
    } catch { /* */ }
    // Fallback to demo data
    setEvents(DEMO_EVENTS)
    setLoading(false)
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const displayEvents = tab === 'gaps'
    ? [...events].sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
    : events

  return (
    <div className="m-page">
      <MobilePageHeader
        title="سوق التوقعات"
        subtitle="تنبؤات AI مقابل السوق"
        onBack={() => router.back()}
        right={
          <button onClick={fetchEvents} disabled={loading} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} color={C.text2} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* Tabs */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
          {([['all', 'جميع الأحداث'], ['gaps', 'أكبر الفجوات']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: tab === key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: tab === key ? C.accent : C.text2, fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Info Banner */}
      <div style={{ margin: '0 16px 12px', padding: '8px 12px', borderRadius: 12, background: `${C.accent}06`, border: `0.5px solid ${C.accent}15` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={12} color={C.accent} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: "'Cairo', sans-serif" }}>فرصة عندما يختلف AI عن السوق</span>
        </div>
        <p style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0', lineHeight: 1.5 }}>كلما كانت الفجوة أكبر بين توقعات الذكاء الاصطناعي واحتمالات السوق، زادت الفرصة المحتملة.</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={24} className="animate-spin" color={C.accent} />
        </div>
      ) : (
        displayEvents.map((event) => {
          const gap = event.gap ?? (event.aiForecast - event.marketOdds)
          const gapColor = Math.abs(gap) >= 10 ? C.success : Math.abs(gap) >= 5 ? C.amber : C.text2
          const aiDir = event.aiDirection ?? (gap > 0 ? 'bullish' : gap < 0 ? 'bearish' : 'neutral')
          const dirColor = aiDir === 'bullish' ? C.success : aiDir === 'bearish' ? C.danger : C.amber
          const dirLabel = aiDir === 'bullish' ? 'صعودي' : aiDir === 'bearish' ? 'هبوطي' : 'محايد'

          return (
            <IOSCard key={event.id}>
              {/* Category + Direction */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.text2, background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 4, fontFamily: "'Cairo', sans-serif" }}>{event.category || 'عام'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: `${dirColor}10`, border: `0.5px solid ${dirColor}25` }}>
                  {aiDir === 'bullish' ? <TrendingUp size={10} color={dirColor} /> : aiDir === 'bearish' ? <TrendingDown size={10} color={dirColor} /> : <Minus size={10} color={dirColor} />}
                  <span style={{ fontSize: 9, fontWeight: 800, color: dirColor, fontFamily: "'Cairo', sans-serif" }}>AI: {dirLabel}</span>
                </div>
              </div>

              {/* Title */}
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif", lineHeight: 1.5, marginBottom: 10 }}>
                {event.titleAr || event.title}
              </div>

              {/* AI vs Market Odds */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                {/* Market */}
                <div style={{ textAlign: 'center', padding: '8px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                    <BarChart3 size={10} color={C.text2} />
                    <span style={{ fontSize: 8, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>السوق</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{event.marketOdds}%</div>
                </div>

                {/* Gap */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>الفجوة</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: gapColor, fontFamily: "'JetBrains Mono', monospace" }}>
                    {gap > 0 ? '+' : ''}{gap.toFixed(0)}%
                  </div>
                </div>

                {/* AI */}
                <div style={{ textAlign: 'center', padding: '8px 6px', borderRadius: 10, background: `${C.accent}06`, border: `0.5px solid ${C.accent}18` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                    <Brain size={10} color={C.accent} />
                    <span style={{ fontSize: 8, fontWeight: 700, color: C.accent, fontFamily: "'Cairo', sans-serif" }}>AI</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>{event.aiForecast}%</div>
                </div>
              </div>

              {/* Progress comparison */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>السوق</span>
                  <span style={{ fontSize: 8, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{event.marketOdds}%</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${event.marketOdds}%`, background: C.text2, borderRadius: 2 }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 8, color: C.accent, fontFamily: "'Cairo', sans-serif" }}>AI</span>
                  <span style={{ fontSize: 8, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>{event.aiForecast}%</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${event.aiForecast}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.accent}60)`, borderRadius: 2 }} />
                </div>
              </div>

              {/* Affected symbols */}
              {event.affectedSymbols && event.affectedSymbols.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                  {event.affectedSymbols.map((sym, si) => (
                    <span key={si} style={{ fontSize: 8, fontWeight: 700, color: C.accent, background: `${C.accent}08`, padding: '2px 6px', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>{sym}</span>
                  ))}
                </div>
              )}
            </IOSCard>
          )
        })
      )}

      {/* Disclaimer */}
      <div style={{ padding: '8px 16px', margin: '0 16px', borderRadius: 12, background: `${C.amber}06`, border: `0.5px solid ${C.amber}12` }}>
        <span style={{ fontSize: 8, color: C.amber, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>تنبيه: </span>
        <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>سوق التوقعات لأغراض تعليمية وتحليلية فقط ولا يُعتبر نصيحة استثمارية.</span>
      </div>

      <div style={{ height: 20 }} />
    </div>
  )
}
