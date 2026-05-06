'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarDays, Clock, TrendingUp, TrendingDown, Minus, Filter, RefreshCw, Brain } from 'lucide-react'
import { T } from '@/lib/theme-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

const IMPACT_STYLE = {
  high:   { color: T.red,   label: 'عالي',    bullets: 3 },
  medium: { color: T.amber, label: 'متوسط',   bullets: 2 },
  low:    { color: T.text2, label: 'منخفض',   bullets: 1 },
}

const CURRENCIES = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD']

function ImpactBullets({ level }: { level: 'high' | 'medium' | 'low' }) {
  const { color, bullets } = IMPACT_STYLE[level]
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: i <= bullets ? color : `${color}20`,
          boxShadow: i <= bullets ? `0 0 4px ${color}` : 'none',
        }} />
      ))}
    </div>
  )
}

function BiasIcon({ bias }: { bias: 'bullish' | 'bearish' | 'neutral' }) {
  if (bias === 'bullish') return <TrendingUp size={13} color={T.green} />
  if (bias === 'bearish') return <TrendingDown size={13} color={T.red} />
  return <Minus size={13} color={T.amber} />
}

export default function CalendarPage() {
  useScopedStyle(`@keyframes spin { to { transform: rotate(360deg); } }`)

  const [events, setEvents] = useState<any[]>([])
  const [grouped, setGrouped] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('All')
  const [impact, setImpact] = useState('All')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchCalendar = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currency !== 'All') params.set('currency', currency)
      if (impact !== 'All') params.set('impact', impact)
      const res = await fetch(`/api/calendar?${params}`)
      const data = await res.json()
      if (data.success) {
        setEvents(data.events)
        setGrouped(data.grouped)
        setLastFetch(new Date())
      }
    } catch { }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchCalendar()
    // Auto-refresh every 60 seconds for live events
    refreshIntervalRef.current = setInterval(fetchCalendar, 60000)
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    }
  }, [currency, impact])

  const highImpact = events.filter(e => e.impact === 'high').length
  const todayEvents = grouped['اليوم']?.length ?? 0

  return (
    <div style={{ padding: '24px 28px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", minHeight: '100vh', background: T.bg }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <CalendarDays size={22} color={T.amber} />
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: T.text }}>الأجندة الاقتصادية</h1>
              <span style={{
                fontSize: 10, padding: '2px 10px', borderRadius: 20,
                background: `${T.amber}18`, color: T.amber, fontFamily: 'monospace', fontWeight: 700,
              }}>ECONOMIC CALENDAR</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
              الأحداث الاقتصادية القادمة مع تحليل AI للتأثير المتوقع على الأسواق
            </p>
          </div>

          <button onClick={fetchCalendar} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: `${T.blue}18`, border: `1px solid ${T.blue}40`,
            borderRadius: 10, color: T.blue, fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            تحديث
          </button>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'أحداث هذا الأسبوع', value: events.length, color: T.cyan },
            { label: 'أحداث اليوم', value: todayEvents, color: T.amber },
            { label: 'عالي التأثير', value: highImpact, color: T.red },
          ].map(s => (
            <div key={s.label} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
            }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: 'monospace' }}>{s.value}</span>
              <span style={{ fontSize: 11, color: T.text2, fontWeight: 700 }}>{s.label}</span>
            </div>
          ))}
          {lastFetch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
              <span style={{ fontSize: 10, color: T.text2 }}>آخر تحديث: {lastFetch.toLocaleTimeString('ar-SA')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} color={T.text2} />
          <span style={{ fontSize: 11, color: T.text2, fontWeight: 700 }}>العملة:</span>
          {CURRENCIES.map(c => (
            <button key={c} onClick={() => setCurrency(c)} style={{
              padding: '4px 10px', borderRadius: 20, border: `1px solid ${currency === c ? T.blue : T.border}`,
              background: currency === c ? `${T.blue}20` : 'transparent',
              color: currency === c ? T.blue : T.text2,
              fontSize: 10, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
              fontFamily: 'monospace',
            }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: T.text2, fontWeight: 700 }}>التأثير:</span>
          {['All', 'high', 'medium', 'low'].map(i => (
            <button key={i} onClick={() => setImpact(i)} style={{
              padding: '4px 10px', borderRadius: 20,
              border: `1px solid ${impact === i ? (IMPACT_STYLE[i as keyof typeof IMPACT_STYLE]?.color ?? T.blue) : T.border}`,
              background: impact === i ? `${(IMPACT_STYLE[i as keyof typeof IMPACT_STYLE]?.color ?? T.blue)}18` : 'transparent',
              color: impact === i ? (IMPACT_STYLE[i as keyof typeof IMPACT_STYLE]?.color ?? T.blue) : T.text2,
              fontSize: 10, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {i === 'All' ? 'الكل' : IMPACT_STYLE[i as keyof typeof IMPACT_STYLE]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scoped styles via useScopedStyle */}{/* Events */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ height: 72, background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, opacity: 0.5, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : Object.entries(grouped).map(([dateLabel, dayEvents]) => (
        <div key={dateLabel} style={{ marginBottom: 24 }}>
          {/* Date header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            paddingBottom: 8, borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: dateLabel === 'اليوم' ? T.green : T.amber }} />
            <span style={{ fontSize: 15, fontWeight: 900, color: T.text }}>{dateLabel}</span>
            <span style={{
              fontSize: 9, padding: '1px 8px', borderRadius: 20,
              background: dateLabel === 'اليوم' ? `${T.green}15` : `${T.amber}15`,
              color: dateLabel === 'اليوم' ? T.green : T.amber, fontWeight: 800,
            }}>
              {dayEvents.length} حدث
            </span>
          </div>

          {/* Event cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayEvents.map((event, idx) => {
              const key = `${dateLabel}-${idx}`
              const isOpen = expanded === key
              const style = IMPACT_STYLE[event.impact as keyof typeof IMPACT_STYLE]

              return (
                <div key={key}
                  onClick={() => setExpanded(isOpen ? null : key)}
                  style={{
                    background: T.card, border: `1px solid ${isOpen ? style.color + '40' : T.border}`,
                    borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: isOpen ? `0 0 20px ${style.color}10` : 'none',
                  }}
                >
                  {/* Main row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                    {/* Time */}
                    <div style={{ minWidth: 48, textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: T.text, fontFamily: 'monospace' }}>{event.time}</div>
                    </div>

                    {/* Impact bullets */}
                    <ImpactBullets level={event.impact} />

                    {/* Currency badge */}
                    <span style={{
                      fontSize: 10, padding: '3px 10px', borderRadius: 20, fontFamily: 'monospace', fontWeight: 900,
                      background: `${style.color}15`, color: style.color,
                      border: `1px solid ${style.color}30`, minWidth: 38, textAlign: 'center',
                    }}>{event.currency}</span>

                    {/* Event name */}
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.text }}>{event.event}</span>

                    {/* Forecast vs Previous */}
                    <div style={{ display: 'flex', gap: 12, textAlign: 'center', fontSize: 10, color: T.text2 }}>
                      {event.forecast !== '—' && (
                        <div>
                          <div style={{ fontWeight: 900, color: T.cyan, fontFamily: 'monospace' }}>{event.forecast}</div>
                          <div style={{ fontSize: 8 }}>توقع</div>
                        </div>
                      )}
                      {event.previous !== '—' && (
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{event.previous}</div>
                          <div style={{ fontSize: 8 }}>سابق</div>
                        </div>
                      )}
                    </div>

                    {/* AI Bias */}
                    <BiasIcon bias={event.ai.bias} />
                  </div>

                  {/* Expanded AI analysis */}
                  {isOpen && (
                    <div style={{
                      borderTop: `1px solid ${T.border}`,
                      padding: '14px 18px',
                      background: 'rgba(10,132,255,0.03)',
                    }}>
                      {/* AI Summary */}
                      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                        <Brain size={14} color={T.purple} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 800, color: T.purple, marginBottom: 4 }}>تحليل AI</div>
                          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.7 }}>{event.ai.summary}</div>
                        </div>
                        {/* Strength bar */}
                        <div style={{ marginRight: 'auto', textAlign: 'center', minWidth: 60 }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: style.color, fontFamily: 'monospace' }}>{event.ai.strength}%</div>
                          <div style={{ fontSize: 8, color: T.text2 }}>قوة التأثير</div>
                          <div style={{ marginTop: 4, height: 4, background: `${style.color}20`, borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${event.ai.strength}%`, background: style.color, borderRadius: 2 }} />
                          </div>
                        </div>
                      </div>

                      {/* Affected pairs */}
                      {event.affectedPairs?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: T.text2, fontWeight: 700 }}>الأزواج المتأثرة:</span>
                          {event.affectedPairs.map((pair: string) => (
                            <span key={pair} style={{
                              fontSize: 10, padding: '2px 8px', borderRadius: 20,
                              background: `${T.cyan}10`, color: T.cyan, fontFamily: 'monospace', fontWeight: 800,
                              border: `1px solid ${T.cyan}25`,
                            }}>{pair}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {!loading && events.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: T.text2 }}>
          <CalendarDays size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>لا توجد أحداث مطابقة لهذا الفلتر</div>
        </div>
      )}
    </div>
  )
}
