'use client'

import { useState, useMemo } from 'react'
import { Brain, Sparkles } from 'lucide-react'
import { useScannerContext } from '../ScannerProvider'
import { DirectionTag } from '../shared/DirectionTag'
import { IndicatorBadge } from '../shared/IndicatorBadge'

const T = {
  bg: '#04050C', bg2: '#0D1117', card: '#08090F', cardHover: '#0B0F19',
  surface: '#1A1D29', cyan: '#00D4FF', green: '#00FFA3', greenDim: '#00CC82',
  red: '#FF4757', redDim: '#FF3344', amber: '#FFB800', purple: '#B388FF',
  blue: '#0A84FF',
  text: '#F0F2F5', text2: '#94a3b8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

type PatternFilter = 'all' | 'bullish' | 'bearish' | 'neutral'

const FILTERS: { key: PatternFilter; label: string }[] = [
  { key: 'all', label: 'الكل' }, { key: 'bullish', label: 'صعودي' },
  { key: 'bearish', label: 'هبوطي' }, { key: 'neutral', label: 'محايد' },
]

function getPatternDirection(pType: string): 'bullish' | 'bearish' | 'neutral' {
  if (pType.includes('BULL') || pType.includes('bull')) return 'bullish'
  if (pType.includes('BEAR') || pType.includes('bear')) return 'bearish'
  return 'neutral'
}

const PATTERN_NAMES: Record<string, string> = {
  HAMMER: 'مطرقة', INVERTED_HAMMER: 'مطرقة مقلوبة', ENGULFING_BULL: 'ابتلاع صعودي',
  ENGULFING_BEAR: 'ابتلاع هبوطي', DOJI: 'دوجي', MORNING_STAR: 'نجمة صباحية',
  EVENING_STAR: 'نجمة مسائية', THREE_WHITE_SOLDIERS: 'ثلاثة جنود بيض',
  THREE_BLACK_CROWS: 'ثلاثة غربان سوداء', HEAD_SHOULDERS: 'رأس وكتفين',
  DOUBLE_TOP: 'قمة مزدوجة', DOUBLE_BOTTOM: 'قاع مزدوج', TRIANGLE: 'مثلث',
  ASCENDING_WEDGE: 'وتد صاعد', DESCENDING_WEDGE: 'وتد هابط', CHANNEL: 'قناة',
  BULL_DIV: 'تباعد صعودي', BEAR_DIV: 'تباعد هبوطي', CUP_HANDLE: 'كوب وعروة',
  FLAG_BULL: 'علم صعودي', FLAG_BEAR: 'علم هبوطي',
}

function PatternPill({ name, pType }: { name: string; pType: string }) {
  const dir = getPatternDirection(pType)
  const color = dir === 'bullish' ? T.green : dir === 'bearish' ? T.red : T.amber
  const arName = PATTERN_NAMES[name] || name
  return (
    <span style={{
      display: 'inline-flex', padding: '2px 8px', borderRadius: 4, fontSize: 8, fontWeight: 700,
      background: `${color}12`, color, border: `0.5px solid ${color}30`,
      fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap',
    }}>
      {arName}
    </span>
  )
}

function MiniScoreBar({ item }: { item: { technicalScore: number; rsi: number | null; adx: number | null; stochK: number | null } }) {
  const bars = [
    { v: item.technicalScore, c: item.technicalScore >= 40 ? T.green : T.amber },
    { v: item.rsi ?? 0, c: T.cyan },
    { v: item.adx ?? 0, c: T.purple },
    { v: item.stochK ?? 0, c: T.blue },
  ]
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {bars.map((b, i) => {
        const pct = Math.min(Math.max(b.v / 100 * 100, 3), 100)
        return (
          <div key={i} style={{ width: 14, height: 4, borderRadius: 2, background: T.surface, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: b.c, transition: 'width 0.3s' }} />
          </div>
        )
      })}
    </div>
  )
}

// Generate mock patterns from item data
function detectPatterns(item: { rsi: number | null; direction: string; adx: number | null; stochK: number | null; changePercent: number }): { name: string; pType: string }[] {
  const patterns: { name: string; pType: string }[] = []
  if (item.rsi !== null && item.rsi <= 30) patterns.push({ name: 'BULL_DIV', pType: 'bull' })
  if (item.rsi !== null && item.rsi >= 70) patterns.push({ name: 'BEAR_DIV', pType: 'bear' })
  if (item.direction?.includes('BUY')) patterns.push({ name: 'ENGULFING_BULL', pType: 'bull' })
  if (item.direction?.includes('SELL')) patterns.push({ name: 'ENGULFING_BEAR', pType: 'bear' })
  if (item.adx !== null && item.adx > 25) patterns.push({ name: 'CHANNEL', pType: 'neutral' })
  if (item.stochK !== null && item.stochK < 20) patterns.push({ name: 'HAMMER', pType: 'bull' })
  if (item.stochK !== null && item.stochK > 80) patterns.push({ name: 'EVENING_STAR', pType: 'bear' })
  if (item.changePercent > 2) patterns.push({ name: 'FLAG_BULL', pType: 'bull' })
  if (item.changePercent < -2) patterns.push({ name: 'FLAG_BEAR', pType: 'bear' })
  if (patterns.length === 0) patterns.push({ name: 'DOJI', pType: 'neutral' })
  return patterns
}

export function PatternsView() {
  const ctx = useScannerContext()
  const [filter, setFilter] = useState<PatternFilter>('all')

  const openItems = useMemo(() => ctx.filteredData.filter(d => d.marketOpen), [ctx.filteredData])

  const filteredItems = useMemo(() => {
    if (filter === 'all') return openItems
    return openItems.filter(item => {
      const pDir = getPatternDirection(item.direction.includes('BUY') ? 'bull' : item.direction.includes('SELL') ? 'bear' : 'neutral')
      return pDir === filter
    })
  }, [openItems, filter])

  return (
    <div style={{ flex: 1, overflow: 'auto', direction: 'rtl', background: T.card, padding: 16 }}>
      <style>{`
        @keyframes fadeInPV { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .pv-scroll::-webkit-scrollbar { width: 5px; }
        .pv-scroll::-webkit-scrollbar-track { background: ${T.bg2}; }
        .pv-scroll::-webkit-scrollbar-thumb { background: ${T.surface}; border-radius: 3px; }
      `}</style>
      <div style={{ animation: 'fadeInPV 0.4s ease' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Brain size={18} color={T.cyan} />
          <span style={{ fontSize: 15, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>الأنماط الفنية المكتشفة</span>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{
                padding: '4px 14px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                background: filter === f.key ? `${T.cyan}20` : T.surface,
                color: filter === f.key ? T.cyan : T.text3,
                border: `0.5px solid ${filter === f.key ? T.border2 : T.border}`,
                transition: 'all 0.2s',
              }}
            >{f.label}</button>
          ))}
        </div>

        {/* Pattern Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: T.text3, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>
              لا توجد أنماط مطابقة
            </div>
          ) : filteredItems.map((item, i) => {
            const patterns = detectPatterns(item)
            const chgColor = item.changePercent >= 0 ? T.green : T.red
            return (
              <div key={item.symbol} onClick={() => ctx.setSelectedSymbol(item.symbol)}
                style={{
                  padding: 12, borderRadius: 8, background: T.bg2,
                  border: `0.5px solid ${T.border}`, cursor: 'pointer',
                  transition: 'border-color 0.2s', animation: `fadeInPV 0.35s ease ${i * 40}ms both`,
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = T.border2)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}
              >
                {/* Symbol row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{item.symbol}</span>
                    <DirectionTag direction={item.direction} signalClass={item.signalClass} size="sm" />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: chgColor, fontFamily: "'JetBrains Mono', monospace" }}>
                    {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                  </span>
                </div>

                {/* Pattern tags */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {patterns.map((p, pi) => <PatternPill key={pi} name={p.name} pType={p.pType} />)}
                </div>

                {/* Indicators row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                  <IndicatorBadge label="RSI" value={item.rsi !== null ? item.rsi.toFixed(0) : '—'} status={item.rsi !== null ? (item.rsi <= 30 ? 'oversold' : item.rsi >= 70 ? 'overbought' : 'neutral') : 'neutral'} />
                  <IndicatorBadge label="ADX" value={item.adx !== null ? item.adx.toFixed(0) : '—'} status={(item.adx ?? 0) > 25 ? 'bullish' : 'neutral'} />
                  <IndicatorBadge label="Stoch" value={item.stochK !== null ? `${item.stochK.toFixed(0)}` : '—'} status="neutral" />
                </div>

                {/* Bottom row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MiniScoreBar item={item} />
                    <span style={{ fontSize: 8, fontWeight: 700, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
                      ثقة: {item.confidence.toFixed(0)}%
                    </span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); ctx.setSelectedSymbol(item.symbol); ctx.setActiveTab('deep') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 4, border: `0.5px solid ${T.purple}30`,
                      background: `${T.purple}10`, color: T.purple, fontSize: 8,
                      fontWeight: 700, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    <Sparkles size={10} /> تحليل AI عميق
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
