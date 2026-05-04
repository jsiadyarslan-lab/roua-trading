'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarDays, Clock, TrendingUp, TrendingDown, Minus, Filter, RefreshCw, Brain } from 'lucide-react'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#32D74B', danger: '#FF453A', amber: '#FFB800',
  purple: '#A78BFA', text: '#F0F2F5', text2: 'rgba(235,235,245,0.5)',
  text3: 'rgba(235,235,245,0.25)', border: 'rgba(255,255,255,0.08)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

const IMPACT_STYLE: Record<string, { color: string; label: string; bullets: number }> = {
  high: { color: C.danger, label: 'عالي', bullets: 3 },
  medium: { color: C.amber, label: 'متوسط', bullets: 2 },
  low: { color: C.text2, label: 'منخفض', bullets: 1 },
}

const CURRENCIES = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD']

function ImpactBullets({ level }: { level: string }) {
  const style = IMPACT_STYLE[level] ?? IMPACT_STYLE.low
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i <= style.bullets ? style.color : `${style.color}20`, boxShadow: i <= style.bullets ? `0 0 3px ${style.color}` : 'none' }} />
      ))}
    </div>
  )
}

function BiasIcon({ bias }: { bias: string }) {
  if (bias === 'bullish') return <TrendingUp size={13} color={C.success} />
  if (bias === 'bearish') return <TrendingDown size={13} color={C.danger} />
  return <Minus size={13} color={C.amber} />
}

export default function MobileCalendarPage() {
  const router = useRouter()
  const [events, setEvents] = useState<any[]>([])
  const [grouped, setGrouped] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('All')
  const [impact, setImpact] = useState('All')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const refreshRef = useRef<NodeJS.Timeout | null>(null)

  const fetchCalendar = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currency !== 'All') params.set('currency', currency)
      if (impact !== 'All') params.set('impact', impact)
      const res = await fetch(`/api/calendar?${params}`)
      const data = await res.json()
      if (data.success) { setEvents(data.events); setGrouped(data.grouped); setLastFetch(new Date()) }
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => {
    fetchCalendar()
    refreshRef.current = setInterval(fetchCalendar, 60000)
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [currency, impact])

  const highImpact = events.filter(e => e.impact === 'high').length
  const todayEvents = grouped['اليوم']?.length ?? 0

  return (
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20 }}>
      {/* ─── Sticky Header ─── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 12px',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => router.back()} style={{
            width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.07)',
            border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowRight size={18} color="#FFFFFF" />
          </motion.button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ color: C.amber, display: 'flex' }}><CalendarDays size={20} /></div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>الأجندة الاقتصادية</h1>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={fetchCalendar} disabled={loading} style={{
            width: 40, height: 40, borderRadius: 12, background: `${C.accent}15`, border: `0.5px solid ${C.accent}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <RefreshCw size={16} color={C.accent} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </motion.button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {[
            { label: 'هذا الأسبوع', value: events.length, color: C.accent },
            { label: 'اليوم', value: todayEvents, color: C.amber },
            { label: 'عالي التأثير', value: highImpact, color: C.danger },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, padding: '8px 10px', borderRadius: 10, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: s.color, fontFamily: FONT_MONO }}>{s.value}</span>
              <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Currency Filter - scrollable */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', paddingBottom: 4 }}>
          {CURRENCIES.map(c => (
            <button key={c} onClick={() => setCurrency(c)} style={{
              padding: '4px 8px', borderRadius: 14, border: `0.5px solid ${currency === c ? C.accent : C.border}`,
              background: currency === c ? `${C.accent}18` : 'transparent', color: currency === c ? C.accent : C.text2,
              fontSize: 9, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_MONO, whiteSpace: 'nowrap',
            }}>{c}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 20px' }}>
        {/* Impact Filter */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {['All', 'high', 'medium', 'low'].map(i => {
            const style = IMPACT_STYLE[i]
            const isActive = impact === i
            return (
              <button key={i} onClick={() => setImpact(i)} style={{
                padding: '5px 12px', borderRadius: 14,
                border: `0.5px solid ${isActive ? (style?.color ?? C.accent) : C.border}`,
                background: isActive ? `${style?.color ?? C.accent}18` : 'transparent',
                color: isActive ? (style?.color ?? C.accent) : C.text2,
                fontSize: 9, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_AR,
              }}>
                {i === 'All' ? 'الكل' : style?.label}
              </button>
            )
          })}
        </div>

        {lastFetch && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.success, boxShadow: `0 0 4px ${C.success}` }} />
            <span style={{ fontSize: 9, color: C.text3, fontFamily: FONT_AR }}>آخر تحديث: {lastFetch.toLocaleTimeString('ar-SA')}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: 64, background: 'rgba(28,28,30,0.4)', borderRadius: 12, border: `0.5px solid ${C.border}`, opacity: 0.5 }} />
            ))}
          </div>
        )}

        {/* Events */}
        {!loading && Object.entries(grouped).map(([dateLabel, dayEvents]) => (
          <div key={dateLabel} style={{ marginBottom: 16 }}>
            {/* Date header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: `0.5px solid ${C.border}` }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: dateLabel === 'اليوم' ? C.success : C.amber }} />
              <span style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>{dateLabel}</span>
              <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 14, background: dateLabel === 'اليوم' ? `${C.success}15` : `${C.amber}15`, color: dateLabel === 'اليوم' ? C.success : C.amber, fontWeight: 800, fontFamily: FONT_AR }}>
                {dayEvents.length} حدث
              </span>
            </div>

            {/* Event cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dayEvents.map((event: any, idx: number) => {
                const key = `${dateLabel}-${idx}`
                const isOpen = expanded === key
                const style = IMPACT_STYLE[event.impact] ?? IMPACT_STYLE.low
                return (
                  <motion.div key={key} whileTap={{ scale: 0.99 }} onClick={() => setExpanded(isOpen ? null : key)}
                    style={{
                      background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${isOpen ? style.color + '40' : C.border}`,
                      borderRadius: 14, overflow: 'hidden', cursor: 'pointer', boxShadow: isOpen ? `0 0 14px ${style.color}08` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                      <div style={{ minWidth: 40, textAlign: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: C.text, fontFamily: FONT_MONO }}>{event.time}</div>
                      </div>
                      <ImpactBullets level={event.impact} />
                      <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 14, fontFamily: FONT_MONO, fontWeight: 900, background: `${style.color}15`, color: style.color, border: `0.5px solid ${style.color}25`, minWidth: 32, textAlign: 'center' }}>{event.currency}</span>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT_AR, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.event}</span>
                      <BiasIcon bias={event.ai?.bias ?? 'neutral'} />
                    </div>
                    {/* Expanded AI analysis */}
                    {isOpen && (
                      <div style={{ borderTop: `0.5px solid ${C.border}`, padding: '12px 14px', background: 'rgba(10,132,255,0.03)' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <Brain size={12} color={C.purple} style={{ flexShrink: 0, marginTop: 1 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: C.purple, marginBottom: 3, fontFamily: FONT_AR }}>تحليل AI</div>
                            <div style={{ fontSize: 11, color: C.text, fontFamily: FONT_AR, lineHeight: 1.6 }}>{event.ai?.summary}</div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: 50, flexShrink: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 900, color: style.color, fontFamily: FONT_MONO }}>{event.ai?.strength}%</div>
                            <div style={{ fontSize: 7, color: C.text3, fontFamily: FONT_AR }}>قوة التأثير</div>
                            <div style={{ marginTop: 3, height: 3, background: `${style.color}20`, borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${event.ai?.strength ?? 0}%`, background: style.color, borderRadius: 2 }} />
                            </div>
                          </div>
                        </div>
                        {event.affectedPairs?.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 8, color: C.text2, fontWeight: 700, fontFamily: FONT_AR }}>الأزواج المتأثرة:</span>
                            {event.affectedPairs.map((pair: string) => (
                              <span key={pair} style={{ fontSize: 8, padding: '1px 6px', borderRadius: 14, background: `${C.accent}10`, color: C.accent, fontFamily: FONT_MONO, fontWeight: 800, border: `0.5px solid ${C.accent}20` }}>{pair}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </div>
        ))}

        {!loading && events.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: C.text2 }}>
            <CalendarDays size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT_AR }}>لا توجد أحداث مطابقة</div>
          </div>
        )}
      </div>
    </div>
  )
}
