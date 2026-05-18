'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Calendar, Loader2, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

interface CalendarEvent {
  date: string
  dateLabel: string
  time: string
  event: string
  currency: string
  impact: 'high' | 'medium' | 'low'
  forecast: string
  previous: string
  affectedPairs: string[]
  ai: { summary: string; bias: 'bullish' | 'bearish' | 'neutral'; strength: number }
}

export default function MobileCalendarPage() {
  const router = useRouter()
  const [grouped, setGrouped] = useState<Record<string, CalendarEvent[]>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'All' | 'high' | 'medium' | 'low'>('All')

  const fetchCalendar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/calendar?impact=${filter}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setGrouped(data.grouped || {})
        }
      }
    } catch { /* */ } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { fetchCalendar() }, [fetchCalendar])

  const impactColor = (impact: string) => impact === 'high' ? C.danger : impact === 'medium' ? C.amber : C.text2
  const impactLabel = (impact: string) => impact === 'high' ? 'عالي' : impact === 'medium' ? 'متوسط' : 'منخفض'
  const biasColor = (bias: string) => bias === 'bullish' ? C.success : bias === 'bearish' ? C.danger : C.amber
  const biasLabel = (bias: string) => bias === 'bullish' ? 'صعودي' : bias === 'bearish' ? 'هبوطي' : 'محايد'
  const biasIcon = (bias: string) => bias === 'bullish' ? <TrendingUp size={10} /> : bias === 'bearish' ? <TrendingDown size={10} /> : <Minus size={10} />

  return (
    <div className="m-page">
      <MobilePageHeader
        title="التقويم الاقتصادي"
        subtitle="أحداث مؤثرة مع تحليل AI"
        onBack={() => router.back()}
        right={
          <button onClick={fetchCalendar} disabled={loading} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} color={C.text2} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* Impact Filter */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
          {([['All', 'الكل'], ['high', 'عالي'], ['medium', 'متوسط'], ['low', 'منخفض']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{ flex: 1, padding: '5px 0', borderRadius: 8, background: filter === key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: filter === key ? C.accent : C.text2, fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={24} className="animate-spin" color={C.accent} />
          <span style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>جارٍ تحميل التقويم...</span>
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <Calendar size={32} color={C.text2} style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: 13, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>لا توجد أحداث اقتصادية</div>
        </div>
      ) : (
        Object.entries(grouped).map(([dateLabel, events]) => (
          <div key={dateLabel}>
            {/* Date Header */}
            <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={12} color={C.accent} />
              <span style={{ fontSize: 12, fontWeight: 800, color: C.accent, fontFamily: "'Cairo', sans-serif" }}>{dateLabel}</span>
              <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>({events.length} حدث)</span>
            </div>

            {events.map((event, i) => {
              const ic = impactColor(event.impact)
              const bc = biasColor(event.ai?.bias ?? 'neutral')
              return (
                <IOSCard key={i}>
                  {/* Impact + Currency + Time */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 1 }}>
                        {[1, 2, 3].map(dot => (
                          <div key={dot} style={{ width: 4, height: 4, borderRadius: 2, background: dot <= (event.impact === 'high' ? 3 : event.impact === 'medium' ? 2 : 1) ? ic : 'rgba(255,255,255,0.08)' }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: ic, fontFamily: "'Cairo', sans-serif" }}>{impactLabel(event.impact)}</span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: C.text, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3, fontFamily: "'JetBrains Mono', monospace" }}>{event.currency}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={9} color={C.text2} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{event.time}</span>
                    </div>
                  </div>

                  {/* Event Name */}
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif", lineHeight: 1.5, marginBottom: 8 }}>
                    {event.event}
                  </div>

                  {/* Forecast / Previous */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                    <div style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                      <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>التوقعات</span>
                      <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{event.forecast || '—'}</div>
                    </div>
                    <div style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                      <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>السابق</span>
                      <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{event.previous || '—'}</div>
                    </div>
                  </div>

                  {/* AI Impact Analysis */}
                  {event.ai && (
                    <div style={{ padding: '8px 10px', borderRadius: 10, background: `${bc}06`, border: `0.5px solid ${bc}15` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ color: bc }}>{biasIcon(event.ai.bias)}</div>
                          <span style={{ fontSize: 9, fontWeight: 800, color: bc, fontFamily: "'Cairo', sans-serif" }}>تحليل AI: {biasLabel(event.ai.bias)}</span>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, color: bc, fontFamily: "'JetBrains Mono', monospace" }}>{event.ai.strength}%</span>
                      </div>
                      <p style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.5, margin: 0 }}>{event.ai.summary}</p>
                    </div>
                  )}

                  {/* Affected Pairs */}
                  {event.affectedPairs && event.affectedPairs.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {event.affectedPairs.map((pair, pi) => (
                        <span key={pi} style={{ fontSize: 8, fontWeight: 700, color: C.accent, background: `${C.accent}08`, padding: '1px 5px', borderRadius: 3, fontFamily: "'JetBrains Mono', monospace" }}>{pair}</span>
                      ))}
                    </div>
                  )}
                </IOSCard>
              )
            })}
          </div>
        ))
      )}

      <div style={{ height: 20 }} />
    </div>
  )
}
