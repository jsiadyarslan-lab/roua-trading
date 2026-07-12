'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Activity, CalendarDays, GitMerge, Newspaper, RefreshCw } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { formatFreshness } from '@/lib/dashboard-live'
import { getPnlColor } from '@/lib/pnl-utils'
import { safeStr } from '@/lib/utils'

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
    <div style={{  display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#151A22' }}>
      <div
        style={{
          padding: '10px 12px 8px',
          borderBottom: `1px solid ${'#2A313C'}`,
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
            <span style={{ fontSize: 13, fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>{title}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#6B7280', fontFamily: "var(--font-ar)" }}>{subtitle}</div>
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
  const t = useTranslations('dashboard.news')
  const tc = useTranslations('common')
  const locale = useLocale()
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch(`/api/news/feed?lang=${locale}`, { cache: 'no-store' })
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
  }, [locale])

  return (
    <PanelShell title={t('title')} accent={'#00D4FF'} icon={Newspaper} subtitle={t('newsSummary', { symbol: selectedSymbol })}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div style={{ fontSize: 11, color: '#6B7280' }}>{t('loadingFeed')}</div>}
        {!loading && items.length === 0 && <div style={{ fontSize: 11, color: '#6B7280' }}>{t('unavailableBrief')}</div>}
        {items.map((item, index) => (
          <div key={`${safeStr(item.text)}-${index}`} className="card" style={{ padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: item.impact === 'high' ? '#FF4757' : '#FFB800', fontWeight: 800 }}>{safeStr(locale === 'ar' ? (item.categoryAr || item.category) : locale === 'fr' ? (item.categoryFr || item.category) : locale === 'tr' ? (item.categoryTr || item.category) : locale === 'es' ? (item.categoryEs || item.category) : item.category)}</span>
              <span style={{ fontSize: 11, color: '#6B7280', fontFamily: "var(--font-mono)" }}>
                {item.publishedAt ? formatFreshness(item.publishedAt, tc) : safeStr(item.source)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#F0F2F5', lineHeight: 1.8 }}>{safeStr(locale === 'ar' ? (item.textAr || item.text) : locale === 'fr' ? (item.textFr || item.text) : locale === 'tr' ? (item.textTr || item.text) : locale === 'es' ? (item.textEs || item.text) : item.text)}</div>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

export function DesktopCalendarPanel() {
  const t = useTranslations('dashboard.calendar')
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
    <PanelShell title={t('title')} accent={'#FFB800'} icon={CalendarDays} subtitle={t('subtitle', { symbol: selectedSymbol })}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div style={{ fontSize: 11, color: '#6B7280' }}>{t('loading')}</div>}
        {!loading && events.length === 0 && <div style={{ fontSize: 11, color: '#6B7280' }}>{t('noEvents')}</div>}
        {events.map((event, index) => (
          <div key={`${event.event}-${index}`} className="card" style={{ padding: '10px 11px', display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#F0F2F5', fontWeight: 800 }}>{event.currency}</span>
              <span style={{ fontSize: 11, color: '#6B7280', fontFamily: "var(--font-mono)" }}>{event.dateLabel} • {event.time}</span>
            </div>
            <div style={{ fontSize: 11, color: '#F0F2F5', lineHeight: 1.7 }}>{event.event}</div>
            <div style={{ fontSize: 11, color: event.ai?.bias === 'bullish' ? '#00FFA3' : event.ai?.bias === 'bearish' ? '#FF4757' : '#FFB800' }}>
              {event.ai?.summary || t('watchImpact')}
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

const BACKTEST_STRATEGIES = [
  { id: 'EMA_CROSSOVER', labelKey: 'strategyEmaCross', color: '#00D4FF' },
  { id: 'RSI', labelKey: 'strategyRsiReversal', color: '#FFB800' },
  { id: 'SMA_CROSSOVER', labelKey: 'strategySmaCross', color: '#B388FF' },
]

export function DesktopBacktestPanel() {
  const t = useTranslations('dashboard.backtest')
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
      title={t('title')}
      accent={'#B388FF'}
      icon={Activity}
      subtitle={t('subtitle', { symbol: selectedSymbol })}
      actions={
        <button
          type="button"
          onClick={runBacktest}
          disabled={loading}
          style={{
            borderRadius: 'var(--radius-2xl)',
            border: `1px solid ${'#B388FF'}33`,
            background: `${'#B388FF'}12`,
            color: '#B388FF',
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
              borderRadius: 'var(--radius-lg)',
              border: `1px solid ${strategy === item.id ? `${item.color}44` : '#2A313C'}`,
              background: strategy === item.id ? `${item.color}12` : 'rgba(255,255,255,0.02)',
              color: strategy === item.id ? item.color : '#6B7280',
              padding: '7px 9px',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {t(item.labelKey)}
          </button>
        ))}
        {['15m', '1h', '4h'].map(item => (
          <button
            key={item}
            type="button"
            onClick={() => setInterval(item)}
            style={{
              borderRadius: 'var(--radius-lg)',
              border: `1px solid ${interval === item ? `${'#00D4FF'}44` : '#2A313C'}`,
              background: interval === item ? `${'#00D4FF'}12` : 'rgba(255,255,255,0.02)',
              color: interval === item ? '#00D4FF' : '#6B7280',
              padding: '7px 9px',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 11, color: '#6B7280' }}>{t('loading')}</div>}

      {!loading && !summary && <div style={{ fontSize: 11, color: '#6B7280' }}>{t('noResult')}</div>}

      {!loading && summary && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {[
              { label: t('returnLabel'), value: `${Number(summary.return || 0).toFixed(2)}%`, color: getPnlColor(Number(summary.return || 0)) },
              { label: t('winRateLabel'), value: `${Number(summary.winRate || 0).toFixed(1)}%`, color: '#00D4FF' },
              { label: t('tradesLabel'), value: `${summary.totalTrades || 0}`, color: '#F0F2F5' },
              { label: t('maxDrawdown'), value: `${Number(summary.maxDrawdown || 0).toFixed(2)}%`, color: '#FFB800' },
            ].map(item => (
              <div key={item.label} className="card" style={{ padding: '10px 11px' }}>
                <div style={{ fontSize: 11, color: '#6B7280' }}>{item.label}</div>
                <div style={{ marginTop: 4, fontSize: 13, color: item.color, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: '10px 11px' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>{t('quickRead')}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#F0F2F5', lineHeight: 1.8 }}>
              {Number(summary.return || 0) >= 0 ? t('positiveResult') : t('negativeResult')}
              {' '}{t('profitFactor')}: <span style={{ color: '#00D4FF' }}>{Number(summary.profitFactor || 0).toFixed(2)}</span>
              {' '}| {t('sharpe')}: <span style={{ color: '#B388FF' }}>{Number(summary.sharpe || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </PanelShell>
  )
}

export function DesktopCorrelationPanel() {
  const t = useTranslations('dashboard.correlation')
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
    <PanelShell title={t('title')} accent={'#00FFA3'} icon={GitMerge} subtitle={t('subtitle', { symbol: selectedSymbol })}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div style={{ fontSize: 11, color: '#6B7280' }}>{t('loading')}</div>}
        {!loading && relationships.length === 0 && <div style={{ fontSize: 11, color: '#6B7280' }}>{t('noData')}</div>}
        {relationships.map(([symbol, value]: any) => {
          const positive = Number(value) >= 0
          const accent = positive ? '#00FFA3' : '#FF4757'
          return (
            <div key={symbol} className="card" style={{ padding: '10px 11px', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#F0F2F5', fontWeight: 800, fontFamily: "var(--font-mono)" }}>{symbol}</span>
                <span style={{ fontSize: 11, color: accent, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{Number(value).toFixed(3)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 'var(--radius-2xl)', background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(Math.abs(Number(value)) * 100, 100)}%`,
                    height: '100%',
                    background: accent,
                    boxShadow: `0 0 16px ${accent}55`,
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>
                {positive ? t('positiveCorrelation') : t('negativeCorrelation')}
              </div>
            </div>
          )
        })}
      </div>
    </PanelShell>
  )
}
