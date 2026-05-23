'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Clock, Filter } from 'lucide-react'
import { useScannerContext } from './ScannerProvider'
import type { CategoryFilter, DirectionFilter, SignalFilter } from './hooks/useScannerFilters'

const T = {
  bg2: '#1A1D29', card: '#1A1D29', surface: '#1A1D29', blue: '#0A84FF',
  cyan: '#00D4FF', text: '#F0F2F5', text2: '#8B92A8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'ALL', label: 'الكل' }, { key: 'CRYPTO', label: 'CRYPTO' },
  { key: 'FOREX', label: 'FOREX' }, { key: 'STOCK', label: 'STOCK' },
  { key: 'COMMODITY', label: 'COMMODITY' },
]

const DIRECTIONS: { key: DirectionFilter; label: string }[] = [
  { key: 'ALL', label: 'الكل' }, { key: 'BUY', label: 'شراء' },
  { key: 'SELL', label: 'بيع' }, { key: 'NEUTRAL', label: 'محايد' },
]

const SIGNALS: { key: SignalFilter; label: string }[] = [
  { key: 'ALL', label: 'الكل' }, { key: 'STRONG_TREND', label: 'اتجاه قوي' },
  { key: 'REVERSAL', label: 'انعكاس' }, { key: 'BREAKOUT', label: 'اختراق' },
  { key: 'CONSOLIDATION', label: 'تماسك' }, { key: 'DIVERGENCE', label: 'تباعد' },
]

const TIMEFRAMES: { key: string; label: string }[] = [
  { key: '15m', label: '15 دقيقة' }, { key: '1h', label: '1 ساعة' },
  { key: '4h', label: '4 ساعات' }, { key: '1d', label: 'يومي' },
]

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700,
        fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
        background: active ? `${T.cyan}20` : T.surface, color: active ? T.cyan : T.text3,
        border: `0.5px solid ${active ? T.border2 : T.border}`,
        transition: 'all 0.2s', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export function ScannerToolbar() {
  const ctx = useScannerContext()
  const count = ctx.filteredData.length
  const tfLabel = TIMEFRAMES.find(t => t.key === ctx.timeframe)?.label || ctx.timeframe

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
      padding: '10px 16px', background: T.card,
      borderBottom: `1px solid ${T.border}`, direction: 'inherit', flexWrap: 'wrap', gap: 8,
    }}>
      {/* Left — title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Filter size={16} color={T.cyan} />
        <span style={{
          fontSize: 14, fontWeight: 800, color: T.text,
          fontFamily: "'Cairo', sans-serif",
        }}>
          جدول المسح الحي
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: T.text3,
          fontFamily: "'JetBrains Mono', monospace",
          padding: '2px 8px', borderRadius: 4, background: T.surface,
        }}>
          {count} أصل
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 9, fontWeight: 700, color: T.cyan,
          fontFamily: "'Cairo', sans-serif",
          padding: '2px 8px', borderRadius: 4, background: `${T.cyan}10`,
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

        <div style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />

        {/* Direction pills */}
        {DIRECTIONS.map(d => (
          <Pill key={d.key} active={ctx.directionFilter === d.key} onClick={() => ctx.setDirectionFilter(d.key)}>
            {d.label}
          </Pill>
        ))}

        <div style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />

        {/* Timeframe select */}
        <select
          value={ctx.timeframe}
          onChange={e => ctx.setTimeframe(e.target.value)}
          aria-label="اختيار الإطار الزمني"
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
            fontFamily: "'Cairo', sans-serif", background: T.surface, color: T.text2,
            border: `0.5px solid ${T.border}`, cursor: 'pointer', direction: 'inherit',
          }}
        >
          {TIMEFRAMES.map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>

        {/* Signal select */}
        <select
          value={ctx.signalFilter}
          onChange={e => ctx.setSignalFilter(e.target.value as SignalFilter)}
          aria-label="تصفية حسب الإشارة"
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
            fontFamily: "'Cairo', sans-serif", background: T.surface, color: T.text2,
            border: `0.5px solid ${T.border}`, cursor: 'pointer', direction: 'inherit',
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
          <Search size={13} color={T.text3} style={{ position: 'absolute', insetInlineEnd: 8 }} />
          <input
            type="text" placeholder="بحث..." value={localSearch}
            onChange={e => handleSearchChange(e.target.value)}
            aria-label="بحث في الماسح"
            style={{
              padding: '4px 28px 4px 10px', borderRadius: 6, fontSize: 10,
              fontFamily: "'Cairo', sans-serif", background: T.surface, color: T.text,
              border: `0.5px solid ${T.border}`, direction: 'inherit', width: 120,
              outline: 'none',
            }}
          />
        </div>
      </div>
    </div>
  )
}
