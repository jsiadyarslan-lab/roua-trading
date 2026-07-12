'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Clock, Filter } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useScannerContext } from './ScannerProvider'
import type { CategoryFilter, DirectionFilter, SignalFilter } from './hooks/useScannerFilters'

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 700,
        fontFamily: "var(--font-ar)", cursor: 'pointer',
        background: active ? `${'#00D4FF'}20` : '#151A22', color: active ? '#00D4FF' : '#6B7280',
        border: `0.5px solid ${active ? '#3A4150' : '#2A313C'}`,
        transition: 'all 0.2s', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export function ScannerToolbar() {
  const t = useTranslations('scannerAdvanced')
  const ctx = useScannerContext()
  const count = ctx.filteredData.length

  const CATEGORIES: { key: CategoryFilter; label: string }[] = [
    { key: 'ALL', label: t('all') }, { key: 'CRYPTO', label: t('categories.crypto') },
    { key: 'FOREX', label: t('categories.forex') }, { key: 'STOCK', label: t('categories.stocks') },
    { key: 'COMMODITY', label: t('categories.commodity') },
  ]

  const DIRECTIONS: { key: DirectionFilter; label: string }[] = [
    { key: 'ALL', label: t('all') }, { key: 'BUY', label: t('buy') },
    { key: 'SELL', label: t('sell') }, { key: 'NEUTRAL', label: t('neutral') },
  ]

  const SIGNALS: { key: SignalFilter; label: string }[] = [
    { key: 'ALL', label: t('all') }, { key: 'STRONG_TREND', label: t('filters.strongTrend') },
    { key: 'REVERSAL', label: t('filters.reversal') }, { key: 'BREAKOUT', label: t('filters.breakout') },
    { key: 'CONSOLIDATION', label: t('filters.consolidation') }, { key: 'DIVERGENCE', label: t('filters.divergence') },
  ]

  const TIMEFRAMES: { key: string; label: string }[] = [
    { key: '15m', label: t('timeframes.15m') }, { key: '1h', label: t('timeframes.1h') },
    { key: '4h', label: t('timeframes.4h') }, { key: '1d', label: t('timeframes.1d') },
  ]

  const tfLabel = TIMEFRAMES.find(tf => tf.key === ctx.timeframe)?.label || ctx.timeframe

  // Debounced search
  const [localSearch, setLocalSearch] = useState(ctx.search)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      ctx.setSearch(value)
    }, 300)
  }, [ctx.setSearch])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', background: '#151A22',
      borderBottom: `1px solid ${'#2A313C'}`, direction: 'inherit', flexWrap: 'wrap', gap: 8,
    }}>
      {/* Left — title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Filter size={16} color={'#00D4FF'} />
        <span style={{
          fontSize: 'var(--text-base)', fontWeight: 800, color: '#F0F2F5',
          fontFamily: "var(--font-ar)",
        }}>
          {t('toolbar.liveScanTable')}
        </span>
        <span style={{
          fontSize: 'var(--text-xs)', fontWeight: 700, color: '#6B7280',
          fontFamily: "var(--font-mono)",
          padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: '#151A22',
        }}>
          {count} {count === 1 ? t('asset') : t('assets')}
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 'var(--text-xs)', fontWeight: 700, color: '#00D4FF',
          fontFamily: "var(--font-ar)",
          padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: `${'#00D4FF'}10`,
        }}>
          <Clock size={10} /> {tfLabel}
        </span>
      </div>

      {/* Right — filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Category pills */}
        {CATEGORIES.map(c => (
          <Pill key={c.key} active={ctx.category === c.key} onClick={() => ctx.setCategory(c.key)}>
            {c.label}
          </Pill>
        ))}

        <div style={{ width: 1, height: 20, background: '#2A313C', margin: '0 4px' }} />

        {/* Direction pills */}
        {DIRECTIONS.map(d => (
          <Pill key={d.key} active={ctx.directionFilter === d.key} onClick={() => ctx.setDirectionFilter(d.key)}>
            {d.label}
          </Pill>
        ))}

        <div style={{ width: 1, height: 20, background: '#2A313C', margin: '0 4px' }} />

        {/* Timeframe select */}
        <select
          value={ctx.timeframe}
          onChange={e => ctx.setTimeframe(e.target.value)}
          aria-label={t('toolbar.selectTimeframe')}
          style={{
            padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 700,
            fontFamily: "var(--font-ar)", background: '#151A22', color: '#9CA3B5',
            border: `0.5px solid ${'#2A313C'}`, cursor: 'pointer', direction: 'inherit',
          }}
        >
          {TIMEFRAMES.map(tf => (
            <option key={tf.key} value={tf.key}>{tf.label}</option>
          ))}
        </select>

        {/* Signal select */}
        <select
          value={ctx.signalFilter}
          onChange={e => ctx.setSignalFilter(e.target.value as SignalFilter)}
          aria-label={t('toolbar.filterBySignal')}
          style={{
            padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 700,
            fontFamily: "var(--font-ar)", background: '#151A22', color: '#9CA3B5',
            border: `0.5px solid ${'#2A313C'}`, cursor: 'pointer', direction: 'inherit',
          }}
        >
          {SIGNALS.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>

        {/* Search */}
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center',
        }}>
          <Search size={13} color={'#6B7280'} style={{ position: 'absolute', insetInlineEnd: 8 }} />
          <input
            type="text" placeholder={t('toolbar.search')} value={localSearch}
            onChange={e => handleSearchChange(e.target.value)}
            aria-label={t('toolbar.searchScanner')}
            style={{
              padding: '4px 28px 4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)',
              fontFamily: "var(--font-ar)", background: '#151A22', color: '#F0F2F5',
              border: `0.5px solid ${'#2A313C'}`, direction: 'inherit', width: 120,
              outline: 'none',
            }}
          />
        </div>
      </div>
    </div>
  )
}
