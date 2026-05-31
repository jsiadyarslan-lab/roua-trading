'use client'

import { useState, useMemo } from 'react'
import { Filter, Zap, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useScannerContext } from '../ScannerProvider'
import { DirectionTag } from '../shared/DirectionTag'
import { ScoreGauge } from '../shared/ScoreGauge'
import type { SmartScore } from '../hooks/useScannerData'
import { ScopedStyle } from '@/components/ScopedStyle'

const T = {
  bg: '#0B0E14', bg2: '#1A1D29', card: '#1A1D29', surface: '#1A1D29',
  green: '#00FFA3', greenDim: '#00CC82', red: '#FF4757', redDim: '#FF3344',
  amber: '#FFB800', purple: '#B388FF', cyan: '#00D4FF', blue: '#0A84FF',
  text: '#F0F2F5', text2: '#8B92A8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

export function ScreenerTab() {
  const t = useTranslations('scannerAdvanced')
  const { scanData, setSelectedSymbol } = useScannerContext()

  const FILTERS = [
    { id: 'action', labelAr: t('screener.recommendation'), type: 'select' as const, options: [
      { value: 'ALL', label: t('all') }, { value: 'STRONG_BUY', label: t('strongBuy') },
      { value: 'BUY', label: t('buy') }, { value: 'HOLD', label: t('hold') },
      { value: 'SELL', label: t('sell') }, { value: 'STRONG_SELL', label: t('strongSell') },
    ]},
    { id: 'signalType', labelAr: t('screener.signalType'), type: 'select' as const, options: [
      { value: 'ALL', label: t('all') }, { value: 'STRONG_TREND', label: t('filters.strongTrend') },
      { value: 'REVERSAL', label: t('filters.reversal') }, { value: 'BREAKOUT', label: t('filters.breakout') },
      { value: 'CONSOLIDATION', label: t('filters.consolidation') }, { value: 'DIVERGENCE', label: t('filters.divergence') },
    ]},
    { id: 'trendScore', labelAr: t('screener.trend'), type: 'range' as const, min: 0, max: 100 },
    { id: 'momentumScore', labelAr: t('screener.momentum'), type: 'range' as const, min: 0, max: 100 },
    { id: 'volumeScore', labelAr: t('screener.volume'), type: 'range' as const, min: 0, max: 100 },
    { id: 'volatilityScore', labelAr: t('screener.volatility'), type: 'range' as const, min: 0, max: 100 },
    { id: 'direction', labelAr: t('screener.direction'), type: 'select' as const, options: [
      { value: 'ALL', label: t('all') }, { value: 'BULLISH', label: t('bullish') },
      { value: 'BEARISH', label: t('bearish') }, { value: 'NEUTRAL', label: t('neutral') },
    ]},
    { id: 'timeframe', labelAr: t('screener.timeframe'), type: 'select' as const, options: [
      { value: 'ALL', label: t('all') }, { value: 'SCALP', label: t('screener.scalp') },
      { value: 'DAY', label: t('screener.daily') }, { value: 'SWING', label: t('screener.swing') },
      { value: 'POSITION', label: t('screener.position') },
    ]},
  ]

  const PRESETS = [
    { id: 'momentum', label: t('screener.momentumBreakout'), icon: TrendingUp,
      filters: { action: 'BUY', signalType: 'BREAKOUT', trendScore: 60, momentumScore: 60, volumeScore: 50 } },
    { id: 'reversal', label: t('screener.goldenReversal'), icon: RotateCcw,
      filters: { action: 'BUY', signalType: 'REVERSAL', momentumScore: 50, volumeScore: 40 } },
    { id: 'trend', label: t('screener.strongTrendPreset'), icon: Zap,
      filters: { action: 'STRONG_BUY', signalType: 'STRONG_TREND', trendScore: 70 } },
    { id: 'bearish', label: t('screener.bearishSignal'), icon: TrendingDown,
      filters: { action: 'SELL', direction: 'BEARISH', trendScore: 50 } },
  ]

  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({
    action: 'ALL', signalType: 'ALL', direction: 'ALL', timeframe: 'ALL',
    trendScore: 0, momentumScore: 0, volumeScore: 0, volatilityScore: 0,
  })
  const [expandedFilters, setExpandedFilters] = useState<Set<string>>(new Set(['action', 'signalType']))

  const toggleExpand = (id: string) => {
    setExpandedFilters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const setFilter = (id: string, value: any) => {
    setActiveFilters(prev => ({ ...prev, [id]: value }))
  }

  const resetFilters = () => {
    setActiveFilters({
      action: 'ALL', signalType: 'ALL', direction: 'ALL', timeframe: 'ALL',
      trendScore: 0, momentumScore: 0, volumeScore: 0, volatilityScore: 0,
    })
  }

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setActiveFilters(prev => ({ ...prev, ...preset.filters }))
  }

  const filtered = useMemo(() => {
    return scanData.filter(item => {
      const ss = item.smartScore
      if (!ss) return false // Must have SmartScore

      // Select filters
      if (activeFilters.action !== 'ALL' && ss.action !== activeFilters.action) return false
      if (activeFilters.signalType !== 'ALL' && ss.signalType !== activeFilters.signalType) return false
      if (activeFilters.direction !== 'ALL') {
        if (activeFilters.direction === 'BULLISH' && !item.direction.includes('BUY')) return false
        if (activeFilters.direction === 'BEARISH' && !item.direction.includes('SELL')) return false
        if (activeFilters.direction === 'NEUTRAL' && item.direction !== 'NEUTRAL') return false
      }
      if (activeFilters.timeframe !== 'ALL' && ss.tradeTimeframe !== activeFilters.timeframe) return false

      // Range filters (minimum threshold)
      if (ss.trendScore < (activeFilters.trendScore ?? 0)) return false
      if (ss.momentumScore < (activeFilters.momentumScore ?? 0)) return false
      if (ss.volumeScore < (activeFilters.volumeScore ?? 0)) return false
      if (ss.volatilityScore < (activeFilters.volatilityScore ?? 0)) return false

      return true
    }).sort((a, b) => {
      const aScore = a.smartScore?.compositeScore ?? 0
      const bScore = b.smartScore?.compositeScore ?? 0
      return Math.abs(bScore) - Math.abs(aScore)
    })
  }, [scanData, activeFilters])

  const activeCount = Object.entries(activeFilters).filter(([k, v]) => {
    if (typeof v === 'number') return v > 0
    return v !== 'ALL'
  }).length

  return (
    <div style={{ flex: 1, overflow: 'auto', direction: 'inherit', background: T.card, display: 'flex', flexDirection: 'column' }}>
      <ScopedStyle>{`
        @keyframes fadeInRow { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</ScopedStyle>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={16} color={T.cyan} />
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
            {t('screener.customScreener')}
          </span>
          {activeCount > 0 && (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: `${T.cyan}15`, color: T.cyan, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
              {activeCount} {activeCount === 1 ? t('screener.activeFilter') : t('screener.activeFilters')}
            </span>
          )}
        </div>
        <button
          onClick={resetFilters}
          style={{ fontSize: 9, padding: '4px 10px', borderRadius: 4, border: `0.5px solid ${T.border}`, background: T.surface, color: T.text3, cursor: 'pointer', fontFamily: "'Cairo', sans-serif", fontWeight: 700, transition: 'all 0.2s' }}
        >
          {t('screener.reset')}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Filters Panel */}
        <div style={{ width: 240, minWidth: 240, borderInlineStart: `1px solid ${T.border}`, overflowY: 'auto', padding: '8px 0' }}>
          {/* Presets */}
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: T.text3, fontFamily: "'Cairo', sans-serif", marginBottom: 6 }}>{t('screener.presetStrategies')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PRESETS.map(p => {
                const Icon = p.icon
                return (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      borderRadius: 6, border: `0.5px solid ${T.border}`, background: T.bg,
                      color: T.text2, cursor: 'pointer', transition: 'all 0.2s',
                      fontFamily: "'Cairo', sans-serif", fontSize: 10, fontWeight: 700, width: '100%', textAlign: 'right',
                    }}
                  >
                    <Icon size={12} color={T.cyan} />
                    <span>{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ height: 1, background: T.border, margin: '8px 12px' }} />

          {/* Filters */}
          {FILTERS.map(f => {
            const isExpanded = expandedFilters.has(f.id)
            const isActive = f.type === 'select' ? activeFilters[f.id] !== 'ALL' : (activeFilters[f.id] ?? 0) > 0
            return (
              <div key={f.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                <button
                  onClick={() => toggleExpand(f.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', padding: '8px 12px', background: 'transparent',
                    border: 'none', cursor: 'pointer', color: isActive ? T.cyan : T.text2,
                    fontFamily: "'Cairo', sans-serif", fontSize: 10, fontWeight: 700, transition: 'color 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isActive && <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.cyan }} />}
                    <span>{(f as any).type || (f as any).labelAr}</span>
                  </div>
                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {isExpanded && (
                  <div style={{ padding: '4px 12px 10px' }}>
                    {f.type === 'select' && f.options ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {f.options.map(opt => {
                          const selected = activeFilters[f.id] === opt.value
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setFilter(f.id, opt.value)}
                              style={{
                                padding: '3px 8px', borderRadius: 3, fontSize: 8, fontWeight: 700,
                                background: selected ? `${T.cyan}15` : T.surface,
                                color: selected ? T.cyan : T.text3,
                                border: selected ? `0.5px solid ${T.cyan}30` : `0.5px solid ${T.border}`,
                                cursor: 'pointer', fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
                              }}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    ) : f.type === 'range' ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                            {activeFilters[f.id] ?? f.min}
                          </span>
                          <span style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{f.max}</span>
                        </div>
                        <input
                          type="range"
                          min={f.min}
                          max={f.max}
                          value={activeFilters[f.id] ?? f.min}
                          onChange={e => setFilter(f.id, parseInt(e.target.value))}
                          style={{ width: '100%', accentColor: T.cyan, height: 4 }}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Right: Results */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {/* Stats bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ padding: '6px 12px', borderRadius: 6, background: T.bg, border: `0.5px solid ${T.border}` }}>
              <span style={{ fontSize: 9, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{t('screener.results')} </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.cyan, fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</span>
            </div>
            <div style={{ padding: '6px 12px', borderRadius: 6, background: T.bg, border: `0.5px solid ${T.border}` }}>
              <span style={{ fontSize: 9, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{t('screener.outOf')} </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.text2, fontFamily: "'JetBrains Mono', monospace" }}>{scanData.length}</span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8 }}>
              <Filter size={28} color={T.text3} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{t('screener.noMatchingResults')}</span>
              <button onClick={resetFilters} style={{ fontSize: 9, padding: '4px 12px', borderRadius: 4, background: `${T.cyan}10`, color: T.cyan, border: `0.5px solid ${T.cyan}30`, cursor: 'pointer', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
                {t('screener.resetFilters')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map((item, i) => {
                const ss = item.smartScore!
                const isBullish = ss.compositeScore > 0
                const borderColor = isBullish ? `${T.green}30` : `${T.red}30`
                return (
                  <div
                    key={item.symbol}
                    onClick={() => setSelectedSymbol(item.symbol)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                      borderRadius: 8, background: T.bg, border: `0.5px solid ${borderColor}`,
                      cursor: 'pointer', transition: 'all 0.2s',
                      animation: `fadeInRow 0.3s ease ${i * 40}ms both`,
                    }}
                  >
                    {/* Symbol + Direction */}
                    <div style={{ minWidth: 130 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{item.symbol}</span>
                        <DirectionTag direction={item.direction} signalClass={item.signalClass} size="sm" />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: T.text2, fontFamily: "'JetBrains Mono', monospace" }}>${item.price.toLocaleString()}</span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: item.changePercent >= 0 ? T.green : T.red, fontFamily: "'JetBrains Mono', monospace" }}>
                          {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    {/* Smart Score Gauge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ScoreGauge score={ss.compositeScore} size={36} showValue label="" />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: T.cyan, fontFamily: "'Cairo', sans-serif" }}>
                          {ss.signalType === 'STRONG_TREND' ? t('filters.strongTrend') : ss.signalType === 'REVERSAL' ? t('filters.reversal') : ss.signalType === 'BREAKOUT' ? t('filters.breakout') : ss.signalType === 'DIVERGENCE' ? t('filters.divergence') : t('filters.consolidation')}
                        </span>
                        <span style={{ fontSize: 7, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
                          {ss.tradeTimeframe === 'SCALP' ? t('screener.scalp') : ss.tradeTimeframe === 'DAY' ? t('screener.daily') : ss.tradeTimeframe === 'SWING' ? t('screener.swing') : t('screener.position')}
                        </span>
                      </div>
                    </div>

                    {/* Mini Score Bars */}
                    <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                      {[
                        { label: t('smartScore.trend'), value: ss.trendScore, color: T.green },
                        { label: t('smartScore.momentum'), value: ss.momentumScore, color: T.cyan },
                        { label: t('smartScore.volume'), value: ss.volumeScore, color: T.blue },
                        { label: t('smartScore.volatility'), value: ss.volatilityScore, color: T.purple },
                      ].map(s => (
                        <div key={s.label} style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 7, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{s.label}</span>
                            <span style={{ fontSize: 7, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</span>
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: T.surface, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(s.value, 100)}%`, height: '100%', borderRadius: 2, background: s.color, transition: 'width 0.4s' }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action Badge */}
                    <div style={{ minWidth: 60, textAlign: 'center' }}>
                      {(() => {
                        const actionMap: Record<string, { bg: string; color: string; key: string }> = {
                          'STRONG_BUY': { bg: `${T.green}15`, color: T.green, key: 'strongBuy' },
                          'BUY': { bg: `${T.green}10`, color: T.greenDim, key: 'buy' },
                          'HOLD': { bg: `${T.amber}10`, color: T.amber, key: 'hold' },
                          'SELL': { bg: `${T.red}10`, color: T.redDim, key: 'sell' },
                          'STRONG_SELL': { bg: `${T.red}15`, color: T.red, key: 'strongSell' },
                        }
                        const cfg = actionMap[ss.action] ?? actionMap['HOLD']
                        return (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 4, background: cfg.bg, color: cfg.color, fontFamily: "'Cairo', sans-serif", display: 'inline-block' }}>
                            {t(cfg.key)}
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
