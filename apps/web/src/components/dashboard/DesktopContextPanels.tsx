'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Activity, CalendarDays, GitMerge, Newspaper, RefreshCw } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { formatFreshness } from '@/lib/dashboard-live'
import { T as _T, getPnlColor } from '@/lib/unified-tokens'
import { safeStr } from '@/lib/utils'

const T = {
  ..._T,
}

function PanelShell({
  title,
  accent,
  icon: Icon,
  subtitle,
  actions,
  children,
}: {
  title: string
  accent: string
  icon: any
  subtitle: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ direction: 'rtl', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: T.card }}>
      <div
        style={{
          padding: '10px 12px 8px',
          borderBottom: `1px solid ${T.border}`,
          background: `linear-gradient(90deg, ${accent}12, transparent)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon size={14} color={accent} />
            <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>{title}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 9, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{subtitle}</div>
        </div>
        {actions}
      </div>
      <div className="custom-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
        {children}
      </div>
    </div>
  )
}

export function DesktopNewsPanel() {
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch('/api/news/feed', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (!mounted) return
        setItems(Array.isArray(data) ? data.slice(0, 6) : [])
      })
      .catch(() => {
        if (mounted) setItems([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <PanelShell title="الأخبار" accent={T.cyan} icon={Newspaper} subtitle={`موجز السوق المرتبط بالسياق الحالي — ${selectedSymbol}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div style={{ fontSize: 11, color: T.text3 }}>جاري تحميل تدفق الأخبار...</div>}
        {!loading && items.length === 0 && <div style={{ fontSize: 11, color: T.text3 }}>لا توجد أخبار متاحة حاليًا.</div>}
        {items.map((item, index) => (
          <div key={`${safeStr(item.text)}-${index}`} className="card" style={{ padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, color: item.impact === 'high' ? T.danger : T.amber, fontWeight: 800 }}>{safeStr(item.categoryAr || item.category)}</span>
              <span style={{ fontSize: 9, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                {item.publishedAt ? formatFreshness(item.publishedAt) : safeStr(item.source)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.text, lineHeight: 1.8 }}>{safeStr(item.text)}</div>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

export function DesktopCalendarPanel() {
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch('/api/calendar?impact=high', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (!mounted) return
        setEvents((data?.events || []).slice(0, 6))
      })
      .catch(() => {
        if (mounted) setEvents([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <PanelShell title="الأجندة الاقتصادية" accent={T.amber} icon={CalendarDays} subtitle={`الأحداث عالية التأثير التي قد تضرب ${selectedSymbol}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div style={{ fontSize: 11, color: T.text3 }}>جاري تحميل الأجندة...</div>}
        {!loading && events.length === 0 && <div style={{ fontSize: 11, color: T.text3 }}>لا توجد أحداث مؤثرة حالياً.</div>}
        {events.map((event, index) => (
          <div key={`${event.event}-${index}`} className="card" style={{ padding: '10px 11px', display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: T.text, fontWeight: 800 }}>{event.currency}</span>
              <span style={{ fontSize: 9, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{event.dateLabel} • {event.time}</span>
            </div>
            <div style={{ fontSize: 11, color: T.text, lineHeight: 1.7 }}>{event.event}</div>
            <div style={{ fontSize: 9, color: event.ai?.bias === 'bullish' ? T.success : event.ai?.bias === 'bearish' ? T.danger : T.amber }}>
              {event.ai?.summary || 'راقب تأثير الحدث على الأصل الحالي.'}
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

const BACKTEST_STRATEGIES = [
  { id: 'EMA_CROSSOVER', label: 'EMA Cross', color: T.cyan },
  { id: 'RSI', label: 'RSI Reversal', color: T.amber },
  { id: 'SMA_CROSSOVER', label: 'SMA Cross', color: T.purple },
]

export function DesktopBacktestPanel() {
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)
  const [strategy, setStrategy] = useState('EMA_CROSSOVER')
  const [interval, setInterval] = useState('1h')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const runBacktest = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          strategy,
          interval,
          params: { fastPeriod: 9, slowPeriod: 21, initialCapital: 10000, riskPct: 2 },
        }),
      })
      const data = await res.json()
      setResult(data?.success ? data : null)
    } catch {
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runBacktest()
  }, [selectedSymbol, strategy, interval])

  const summary = result?.summary

  return (
    <PanelShell
      title="اختبار الاستراتيجيات"
      accent={T.purple}
      icon={Activity}
      subtitle={`اختبار سريع على ${selectedSymbol} بدون مغادرة الداشبورد`}
      actions={
        <button
          type="button"
          onClick={runBacktest}
          disabled={loading}
          style={{
            borderRadius: 999,
            border: `1px solid ${T.purple}33`,
            background: `${T.purple}12`,
            color: T.purple,
            padding: '6px 8px',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={12} />
        </button>
      }
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {BACKTEST_STRATEGIES.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStrategy(item.id)}
            style={{
              borderRadius: 10,
              border: `1px solid ${strategy === item.id ? `${item.color}44` : T.border}`,
              background: strategy === item.id ? `${item.color}12` : 'rgba(255,255,255,0.02)',
              color: strategy === item.id ? item.color : T.text3,
              padding: '7px 9px',
              fontSize: 9,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        ))}
        {['15m', '1h', '4h'].map(item => (
          <button
            key={item}
            type="button"
            onClick={() => setInterval(item)}
            style={{
              borderRadius: 10,
              border: `1px solid ${interval === item ? `${T.cyan}44` : T.border}`,
              background: interval === item ? `${T.cyan}12` : 'rgba(255,255,255,0.02)',
              color: interval === item ? T.cyan : T.text3,
              padding: '7px 9px',
              fontSize: 9,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 11, color: T.text3 }}>جاري تشغيل المحاكاة...</div>}

      {!loading && !summary && <div style={{ fontSize: 11, color: T.text3 }}>لا توجد نتيجة حالياً. حاول التحديث.</div>}

      {!loading && summary && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {[
              { label: 'العائد', value: `${Number(summary.return || 0).toFixed(2)}%`, color: getPnlColor(Number(summary.return || 0)) },
              { label: 'نسبة الفوز', value: `${Number(summary.winRate || 0).toFixed(1)}%`, color: T.cyan },
              { label: 'الصفقات', value: `${summary.totalTrades || 0}`, color: T.text },
              { label: 'أقصى تراجع', value: `${Number(summary.maxDrawdown || 0).toFixed(2)}%`, color: T.amber },
            ].map(item => (
              <div key={item.label} className="card" style={{ padding: '10px 11px' }}>
                <div style={{ fontSize: 9, color: T.text3 }}>{item.label}</div>
                <div style={{ marginTop: 4, fontSize: 13, color: item.color, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: '10px 11px' }}>
            <div style={{ fontSize: 9, color: T.text3 }}>قراءة سريعة</div>
            <div style={{ marginTop: 6, fontSize: 11, color: T.text, lineHeight: 1.8 }}>
              {Number(summary.return || 0) >= 0 ? 'الاستراتيجية أظهرت عائدًا إيجابيًا على الرمز الحالي.' : 'النتيجة الحالية ضعيفة وتحتاج ضبطًا قبل الاعتماد عليها.'}
              {' '}Profit Factor: <span style={{ color: T.cyan }}>{Number(summary.profitFactor || 0).toFixed(2)}</span>
              {' '}| Sharpe: <span style={{ color: T.purple }}>{Number(summary.sharpe || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </PanelShell>
  )
}

export function DesktopCorrelationPanel() {
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch('/api/correlation', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (mounted) setPayload(data?.success ? data : null)
      })
      .catch(() => {
        if (mounted) setPayload(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const relationships = useMemo(() => {
    if (!payload?.matrix?.[selectedSymbol]) return []
    return Object.entries(payload.matrix[selectedSymbol])
      .filter(([symbol]) => symbol !== selectedSymbol)
      .sort((a: any, b: any) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5)
  }, [payload, selectedSymbol])

  return (
    <PanelShell title="مصفوفة الارتباط" accent={T.success} icon={GitMerge} subtitle={`كيف يتحرك ${selectedSymbol} مقابل بقية الأصول`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div style={{ fontSize: 11, color: T.text3 }}>جاري بناء المصفوفة...</div>}
        {!loading && relationships.length === 0 && <div style={{ fontSize: 11, color: T.text3 }}>لا توجد بيانات كافية للارتباط.</div>}
        {relationships.map(([symbol, value]: any) => {
          const positive = Number(value) >= 0
          const accent = positive ? T.success : T.danger
          return (
            <div key={symbol} className="card" style={{ padding: '10px 11px', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, color: T.text, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{symbol}</span>
                <span style={{ fontSize: 10, color: accent, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{Number(value).toFixed(3)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(Math.abs(Number(value)) * 100, 100)}%`,
                    height: '100%',
                    background: accent,
                    boxShadow: `0 0 16px ${accent}55`,
                  }}
                />
              </div>
              <div style={{ fontSize: 9, color: T.text3 }}>
                {positive ? 'ارتباط موجب: قد يتحركان في الاتجاه نفسه.' : 'ارتباط عكسي: أحدهما قد يوازن الآخر.'}
              </div>
            </div>
          )
        })}
      </div>
    </PanelShell>
  )
}
