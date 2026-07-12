'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarDays, Clock, TrendingUp, TrendingDown, Minus, Filter, RefreshCw, Brain } from 'lucide-react'
import T from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations } from 'next-intl'

const CURRENCIES = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD']

function ImpactBullets({ level }: { level: 'high' | 'medium' | 'low' }) {
  const IMPACT_BULLETS: Record<string, { color: string; bullets: number }> = {
    high:   { color: T.red,   bullets: 3 },
    medium: { color: T.amber, bullets: 2 },
    low:    { color: T.text2, bullets: 1 },
  }
  const { color, bullets } = IMPACT_BULLETS[level]
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

  const t = useTranslations('dashboard.calendar')
  const [events, setEvents] = useState<any[]>([])
  const [grouped, setGrouped] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('All')
  const [impact, setImpact] = useState('All')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const IMPACT_STYLE: Record<string, { color: string; label: string; bullets: number }> = {
    high:   { color: T.red,   label: t('impactHigh'),    bullets: 3 },
    medium: { color: T.amber, label: t('impactMedium'),   bullets: 2 },
    low:    { color: T.text2, label: t('impactLow'),      bullets: 1 },
  }

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
  const todayEvents = grouped[t('today')]?.length ?? 0

  return (
    <div style={{ padding: '24px 28px', direction: 'inherit', fontFamily: "var(--font-ar)", minHeight: '100vh', background: T.bg }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <CalendarDays size={22} color={T.amber} />
              <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 900, color: T.text }}>{t('title')}</h1>
              <span style={{
                fontSize: 'var(--text-xs)', padding: '2px 10px', borderRadius: 'var(--radius-2xl)',
                background: `${T.amber}18`, color: T.amber, fontFamily: "var(--font-mono)", fontWeight: 700,
              }}>ECONOMIC CALENDAR</span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: T.text2 }}>
              {t('subtitle')}
            </p>
          </div>

          <button onClick={fetchCalendar} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: `${T.blue}18`, border: `1px solid ${T.blue}40`,
            borderRadius: 'var(--radius-lg)', color: T.blue, fontSize: 'var(--text-sm)', fontWeight: 800, cursor: 'pointer',
          }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {t('refresh')}
          </button>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { label: t('weekEvents'), value: events.length, color: T.cyan },
            { label: t('todayEvents'), value: todayEvents, color: T.amber },
            { label: t('highImpact'), value: highImpact, color: T.red },
          ].map(s => (
            <div key={s.label} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 'var(--radius-lg)',
            }}>
              <span style={{ fontSize: 'var(--text-lg)', fontWeight: 900, color: s.color, fontFamily: "var(--font-mono)" }}>{s.value}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: T.text2, fontWeight: 700 }}>{s.label}</span>
            </div>
          ))}
          {lastFetch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 'var(--radius-lg)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
              <span style={{ fontSize: 'var(--text-xs)', color: T.text2 }}>{t('lastUpdate')} {lastFetch.toLocaleTimeString('ar-SA')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} color={T.text2} />
          <span style={{ fontSize: 'var(--text-xs)', color: T.text2, fontWeight: 700 }}>{t('currency')}</span>
          {CURRENCIES.map(c => (
            <button key={c} onClick={() => setCurrency(c)} style={{
              padding: '4px 10px', borderRadius: 'var(--radius-2xl)', border: `1px solid ${currency === c ? T.blue : T.border}`,
              background: currency === c ? `${T.blue}20` : 'transparent',
              color: currency === c ? T.blue : T.text2,
              fontSize: 'var(--text-xs)', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
              fontFamily: "var(--font-mono)",
            }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: T.text2, fontWeight: 700 }}>{t('impact')}</span>
          {['All', 'high', 'medium', 'low'].map(i => (
            <button key={i} onClick={() => setImpact(i)} style={{
              padding: '4px 10px', borderRadius: 'var(--radius-2xl)',
              border: `1px solid ${impact === i ? (IMPACT_STYLE[i]?.color ?? T.blue) : T.border}`,
              background: impact === i ? `${(IMPACT_STYLE[i]?.color ?? T.blue)}18` : 'transparent',
              color: impact === i ? (IMPACT_STYLE[i]?.color ?? T.blue) : T.text2,
              fontSize: 'var(--text-xs)', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {i === 'All' ? t('all') : IMPACT_STYLE[i]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scoped styles via useScopedStyle */}{/* Events */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ height: 72, background: T.card, borderRadius: 'var(--radius-lg)', border: `1px solid ${T.border}`, opacity: 0.5, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : Object.entries(grouped).map(([dateLabelKey, dayEvents]) => (
        <div key={dateLabelKey} style={{ marginBottom: 24 }}>
          {/* Date header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            paddingBottom: 8, borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: dateLabelKey === 'today' ? T.green : T.amber }} />
            <span style={{ fontSize: 'var(--text-base)', fontWeight: 900, color: T.text }}>{t(dateLabelKey)} — {dayEvents[0]?.dateLabel || ''}</span>
            <span style={{
              fontSize: 'var(--text-xs)', padding: '1px 8px', borderRadius: 'var(--radius-2xl)',
              background: dateLabelKey === 'today' ? `${T.green}15` : `${T.amber}15`,
              color: dateLabelKey === 'today' ? T.green : T.amber, fontWeight: 800,
            }}>
              {dayEvents.length} {dayEvents.length === 1 ? t('event') : t('events')}
            </span>
          </div>

          {/* Event cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayEvents.map((event, idx) => {
              const key = `${dateLabelKey}-${idx}`
              const isOpen = expanded === key
              const style = IMPACT_STYLE[event.impact as keyof typeof IMPACT_STYLE]

              return (
                <div key={key}
                  onClick={() => setExpanded(isOpen ? null : key)}
                  style={{
                    background: T.card, border: `1px solid ${isOpen ? style.color + '40' : T.border}`,
                    borderRadius: 'var(--radius-lg)', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: isOpen ? `0 0 20px ${style.color}10` : 'none',
                  }}
                >
                  {/* Main row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                    {/* Time */}
                    <div style={{ minWidth: 48, textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 900, color: T.text, fontFamily: "var(--font-mono)" }}>{event.time}</div>
                    </div>

                    {/* Impact bullets */}
                    <ImpactBullets level={event.impact} />

                    {/* Currency badge */}
                    <span style={{
                      fontSize: 'var(--text-xs)', padding: '3px 10px', borderRadius: 'var(--radius-2xl)', fontFamily: "var(--font-mono)", fontWeight: 900,
                      background: `${style.color}15`, color: style.color,
                      border: `1px solid ${style.color}30`, minWidth: 38, textAlign: 'center',
                    }}>{event.currency}</span>

                    {/* Event name */}
                    <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 700, color: T.text }}>{event.event}</span>

                    {/* Forecast vs Previous */}
                    <div style={{ display: 'flex', gap: 12, textAlign: 'center', fontSize: 'var(--text-xs)', color: T.text2 }}>
                      {event.forecast !== '—' && (
                        <div>
                          <div style={{ fontWeight: 900, color: T.cyan, fontFamily: "var(--font-mono)" }}>{event.forecast}</div>
                          <div style={{ fontSize: 'var(--text-xs)' }}>{t('forecast')}</div>
                        </div>
                      )}
                      {event.previous !== '—' && (
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: "var(--font-mono)" }}>{event.previous}</div>
                          <div style={{ fontSize: 'var(--text-xs)' }}>{t('previous')}</div>
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
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: T.purple, marginBottom: 4 }}>{t('aiAnalysis')}</div>
                          <div style={{ fontSize: 'var(--text-sm)', color: T.text, lineHeight: 1.7 }}>{event.ai.summary}</div>
                        </div>
                        {/* Strength bar */}
                        <div style={{ marginRight: 'auto', textAlign: 'center', minWidth: 60 }}>
                          <div style={{ fontSize: 'var(--text-md)', fontWeight: 900, color: style.color, fontFamily: "var(--font-mono)" }}>{event.ai.strength}%</div>
                          <div style={{ fontSize: 'var(--text-xs)', color: T.text2 }}>{t('impactStrength')}</div>
                          <div style={{ marginTop: 4, height: 4, background: `${style.color}20`, borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${event.ai.strength}%`, background: style.color, borderRadius: 'var(--radius-xs)' }} />
                          </div>
                        </div>
                      </div>

                      {/* Affected pairs */}
                      {event.affectedPairs?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: T.text2, fontWeight: 700 }}>{t('affectedPairs')}</span>
                          {event.affectedPairs.map((pair: string) => (
                            <span key={pair} style={{
                              fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: 'var(--radius-2xl)',
                              background: `${T.cyan}10`, color: T.cyan, fontFamily: "var(--font-mono)", fontWeight: 800,
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
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>{t('noEvents')}</div>
        </div>
      )}
    </div>
  )
}
