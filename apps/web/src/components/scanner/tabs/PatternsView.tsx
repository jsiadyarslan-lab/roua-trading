'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Brain, Sparkles, Filter, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { useScannerContext } from '../ScannerProvider'
import { DirectionTag } from '../shared/DirectionTag'
import { IndicatorBadge } from '../shared/IndicatorBadge'
import { ScopedStyle } from '@/components/ScopedStyle'

const T = {
  bg: '#0B0E14', bg2: '#1A1D29', card: '#1A1D29', cardHover: '#1F2335',
  surface: '#1A1D29', cyan: '#00D4FF', green: '#00FFA3', greenDim: '#00CC82',
  red: '#FF4757', redDim: '#FF3344', amber: '#FFB800', purple: '#B388FF',
  blue: '#0A84FF',
  text: '#F0F2F5', text2: '#8B92A8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

type PatternFilter = 'all' | 'bullish' | 'bearish' | 'neutral'
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low'

const FILTERS: { key: PatternFilter; label: string }[] = [
  { key: 'all', label: 'الكل' }, { key: 'bullish', label: 'صعودي' },
  { key: 'bearish', label: 'هبوطي' }, { key: 'neutral', label: 'محايد' },
]

const CONFIDENCE_FILTERS: { key: ConfidenceFilter; label: string }[] = [
  { key: 'all', label: 'كل الثقات' }, { key: 'high', label: 'ثقة عالية' },
  { key: 'medium', label: 'ثقة متوسطة' }, { key: 'low', label: 'ثقة منخفضة' },
]

// All known patterns with Arabic translations
const PATTERN_NAMES: Record<string, string> = {
  // Candlestick patterns
  HAMMER: 'مطرقة', INVERTED_HAMMER: 'مطرقة مقلوبة',
  BULLISH_ENGULFING: 'ابتلاع صعودي', BEARISH_ENGULFING: 'ابتلاع هبوطي',
  DOJI: 'دوجي', DRAGONFLY_DOJI: 'دوجي يعسوب', GRAVESTONE_DOJI: 'دوجي شاهد القبر',
  MORNING_STAR: 'نجمة الصباح', EVENING_STAR: 'نجمة المساء',
  THREE_WHITE_SOLDIERS: 'ثلاثة جنود بيض', THREE_BLACK_CROWS: 'ثلاثة غربان سوداء',
  SHOOTING_STAR: 'نجمة ساقطة', HANGING_MAN: 'رجل معلق',
  BULLISH_HARAMI: 'هارامي صعودي', BEARISH_HARAMI: 'هارامي هبوطي',
  PIERCING_LINE: 'خط اختراق', DARK_CLOUD_COVER: 'سحابة مظلمة',
  TWEEZER_TOP: 'قمة ملقاط', TWEEZER_BOTTOM: 'قاع ملقاط',
  SPINNING_TOP: 'قمة دوارة',
  RISING_THREE_METHODS: 'ثلاث صاعد', FALLING_THREE_METHODS: 'ثلاث هابط',
  BULLISH_MARUBOZU: 'ماروبوزو صعودي', BEARISH_MARUBOZU: 'ماروبوزو هبوطي',
  // Chart patterns
  BULL_FLAG: 'علم صعودي', BEAR_FLAG: 'علم هبوطي',
  DOUBLE_TOP: 'قمة مزدوجة', DOUBLE_BOTTOM: 'قاع مزدوج',
  BREAKOUT_BULLISH: 'اختراق صعودي', BREAKOUT_BEARISH: 'اختراق هبوطي',
  CONSOLIDATION: 'تماسك',
  HEAD_AND_SHOULDERS: 'رأس وكتفين', INVERSE_HEAD_SHOULDERS: 'رأس وكتفين معكوس',
  ASCENDING_TRIANGLE: 'مثلث صاعد', DESCENDING_TRIANGLE: 'مثلث هابط',
  CUP_HANDLE: 'كوب وعروة', ASCENDING_WEDGE: 'وتد صاعد', DESCENDING_WEDGE: 'وتد هابط',
  CHANNEL: 'قناة',
  // Divergence patterns
  BULL_DIV: 'تباعد صعودي', BEAR_DIV: 'تباعد هبوطي',
  BULLISH_DIVERGENCE: 'تباعد صعودي', BEARISH_DIVERGENCE: 'تباعد هبوطي',
  HIDDEN_BULLISH: 'تباعد صعودي مخفي', HIDDEN_BEARISH: 'تباعد هبوطي مخفي',
}

interface DetectedPattern {
  name: string
  nameAr: string
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence: number
  descriptionAr: string
}

function getPatternDirection(pType: string): 'bullish' | 'bearish' | 'neutral' {
  if (pType === 'BULLISH') return 'bullish'
  if (pType === 'BEARISH') return 'bearish'
  return 'neutral'
}

function PatternPill({ pattern }: { pattern: DetectedPattern }) {
  const dir = getPatternDirection(pattern.type)
  const color = dir === 'bullish' ? T.green : dir === 'bearish' ? T.red : T.amber
  const arName = pattern.nameAr || PATTERN_NAMES[pattern.name] || pattern.name
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 8px', borderRadius: 4, fontSize: 8, fontWeight: 700,
      background: `${color}12`, color, border: `0.5px solid ${color}30`,
      fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap',
    }}>
      {arName}
      <span style={{ fontSize: 7, opacity: 0.7 }}>{pattern.confidence}%</span>
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

// Detect patterns from scanner item data using real indicator values
function detectRealPatterns(item: {
  rsi: number | null
  direction: string
  adx: number | null
  stochK: number | null
  stochD: number | null
  changePercent: number
  macdSignal: string | null
  bollingerPosition: string | null
  smartScore: {
    signalType: string
    action: string
    trendScore: number
    momentumScore: number
    confidence: number
  } | null
}): DetectedPattern[] {
  const patterns: DetectedPattern[] = []

  // RSI-based patterns
  if (item.rsi !== null && item.rsi <= 30) {
    patterns.push({
      name: 'BULL_DIV', nameAr: 'تباعد صعودي RSI', type: 'BULLISH',
      confidence: Math.round(60 + (30 - item.rsi) * 1.5),
      descriptionAr: 'مؤشر القوة النسبية في منطقة التشبع البيعي، إشارة انعكاس صعودي محتمل',
    })
  }
  if (item.rsi !== null && item.rsi >= 70) {
    patterns.push({
      name: 'BEAR_DIV', nameAr: 'تباعد هبوطي RSI', type: 'BEARISH',
      confidence: Math.round(60 + (item.rsi - 70) * 1.5),
      descriptionAr: 'مؤشر القوة النسبية في منطقة التشبع الشرائي، إشارة انعكاس هبوطي محتمل',
    })
  }

  // MACD patterns
  if (item.macdSignal === 'BULLISH_CROSSOVER') {
    patterns.push({
      name: 'BULLISH_ENGULFING', nameAr: 'تقاطع صعودي MACD', type: 'BULLISH',
      confidence: 75,
      descriptionAr: 'تقاطع صعودي لخطوط MACD، إشارة شرائية قوية',
    })
  }
  if (item.macdSignal === 'BEARISH_CROSSOVER') {
    patterns.push({
      name: 'BEARISH_ENGULFING', nameAr: 'تقاطع هبوطي MACD', type: 'BEARISH',
      confidence: 75,
      descriptionAr: 'تقاطع هبوطي لخطوط MACD، إشارة بيعية قوية',
    })
  }

  // Direction + ADX patterns
  if (item.direction?.includes('BUY') && (item.adx ?? 0) > 25) {
    patterns.push({
      name: 'BULL_FLAG', nameAr: 'علم صعودي', type: 'BULLISH',
      confidence: Math.round(55 + (item.adx ?? 0)),
      descriptionAr: 'اتجاه صاعد قوي مع زخم متزايد، احتمال استمرار الصعود',
    })
  }
  if (item.direction?.includes('SELL') && (item.adx ?? 0) > 25) {
    patterns.push({
      name: 'BEAR_FLAG', nameAr: 'علم هبوطي', type: 'BEARISH',
      confidence: Math.round(55 + (item.adx ?? 0)),
      descriptionAr: 'اتجاه هابط قوي مع زخم متزايد، احتمال استمرار الهبوط',
    })
  }

  // Stochastic patterns
  if (item.stochK !== null && item.stochK < 20) {
    patterns.push({
      name: 'HAMMER', nameAr: 'مطرقة', type: 'BULLISH',
      confidence: 65,
      descriptionAr: 'ستوكاستيك في منطقة التشبع البيعي، إشارة ارتداد صعودي',
    })
  }
  if (item.stochK !== null && item.stochK > 80) {
    patterns.push({
      name: 'SHOOTING_STAR', nameAr: 'نجمة ساقطة', type: 'BEARISH',
      confidence: 65,
      descriptionAr: 'ستوكاستيك في منطقة التشبع الشرائي، إشارة ارتداد هبوطي',
    })
  }

  // Bollinger patterns
  if (item.bollingerPosition === 'BELOW_LOWER') {
    patterns.push({
      name: 'DOUBLE_BOTTOM', nameAr: 'قاع مزدوج (بولنجر)', type: 'BULLISH',
      confidence: 70,
      descriptionAr: 'السعر أسفل بولنجر السفلي، احتمال ارتداد قوي',
    })
  }
  if (item.bollingerPosition === 'ABOVE_UPPER') {
    patterns.push({
      name: 'DOUBLE_TOP', nameAr: 'قمة مزدوجة (بولنجر)', type: 'BEARISH',
      confidence: 70,
      descriptionAr: 'السعر فوق بولنجر العلوي، احتمال تراجع',
    })
  }

  // Smart Score based patterns
  if (item.smartScore) {
    if (item.smartScore.signalType === 'REVERSAL') {
      patterns.push({
        name: item.smartScore.action.includes('BUY') ? 'DOUBLE_BOTTOM' : 'DOUBLE_TOP',
        nameAr: item.smartScore.action.includes('BUY') ? 'انعكاس صعودي' : 'انعكاس هبوطي',
        type: item.smartScore.action.includes('BUY') ? 'BULLISH' : 'BEARISH',
        confidence: Math.round((item.smartScore.confidence ?? 50) * 0.8),
        descriptionAr: 'محرك التقييم الذكي يكتشف نمط انعكاس',
      })
    }
    if (item.smartScore.signalType === 'BREAKOUT') {
      patterns.push({
        name: item.smartScore.action.includes('BUY') ? 'BREAKOUT_BULLISH' : 'BREAKOUT_BEARISH',
        nameAr: item.smartScore.action.includes('BUY') ? 'اختراق صعودي' : 'اختراق هبوطي',
        type: item.smartScore.action.includes('BUY') ? 'BULLISH' : 'BEARISH',
        confidence: Math.round((item.smartScore.confidence ?? 50) * 0.85),
        descriptionAr: 'محرك التقييم الذكي يكتشف نمط اختراق',
      })
    }
    if (item.smartScore.signalType === 'CONSOLIDATION') {
      patterns.push({
        name: 'CONSOLIDATION', nameAr: 'تماسك',
        type: 'NEUTRAL', confidence: 50,
        descriptionAr: 'السوق في مرحلة تماسك، بانتظار تحديد الاتجاه',
      })
    }
  }

  // Large move patterns
  if (item.changePercent > 3) {
    patterns.push({
      name: 'BREAKOUT_BULLISH', nameAr: 'اختراق صعودي قوي', type: 'BULLISH',
      confidence: 80,
      descriptionAr: `حركة صعودية قوية ${item.changePercent.toFixed(1)}%، اختراق محتمل`,
    })
  }
  if (item.changePercent < -3) {
    patterns.push({
      name: 'BREAKOUT_BEARISH', nameAr: 'اختراق هبوطي قوي', type: 'BEARISH',
      confidence: 80,
      descriptionAr: `حركة هبوطية قوية ${item.changePercent.toFixed(1)}%، ضغط بيعي`,
    })
  }

  // Default if no patterns
  if (patterns.length === 0) {
    patterns.push({
      name: 'DOJI', nameAr: 'دوجي (تردد)', type: 'NEUTRAL',
      confidence: 40,
      descriptionAr: 'لا توجد أنماط واضحة، السوق في حالة تردد',
    })
  }

  return patterns
}

// Pattern-specific search filter
const PATTERN_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'كل الأنماط' },
  { value: 'HAMMER', label: 'مطرقة' },
  { value: 'ENGULFING', label: 'ابتلاع' },
  { value: 'DOJI', label: 'دوجي' },
  { value: 'BREAKOUT', label: 'اختراق' },
  { value: 'REVERSAL', label: 'انعكاس' },
  { value: 'FLAG', label: 'علم' },
  { value: 'DIV', label: 'تباعد' },
  { value: 'CONSOLIDATION', label: 'تماسك' },
]

export function PatternsView() {
  const ctx = useScannerContext()
  const [filter, setFilter] = useState<PatternFilter>('all')
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all')
  const [patternSearch, setPatternSearch] = useState('ALL')
  const [expandedFilters, setExpandedFilters] = useState(false)

  const openItems = useMemo(() => ctx.filteredData.filter(d => d.marketOpen), [ctx.filteredData])

  // Build items with detected patterns
  const itemsWithPatterns = useMemo(() => {
    return openItems.map(item => ({
      item,
      patterns: detectRealPatterns(item),
    }))
  }, [openItems])

  // Apply filters
  const filteredItems = useMemo(() => {
    return itemsWithPatterns.filter(({ item, patterns }) => {
      // Direction filter
      if (filter !== 'all') {
        const hasMatchingPattern = patterns.some(p => getPatternDirection(p.type) === filter)
        if (!hasMatchingPattern) return false
      }

      // Confidence filter
      if (confidenceFilter !== 'all') {
        const maxConf = Math.max(...patterns.map(p => p.confidence))
        if (confidenceFilter === 'high' && maxConf < 70) return false
        if (confidenceFilter === 'medium' && maxConf < 50) return false
        if (confidenceFilter === 'low' && maxConf >= 50) return false
      }

      // Pattern search filter
      if (patternSearch !== 'ALL') {
        const hasPattern = patterns.some(p =>
          p.name.toUpperCase().includes(patternSearch)
        )
        if (!hasPattern) return false
      }

      return true
    }).sort((a, b) => {
      // Sort by highest pattern confidence first
      const aMax = Math.max(...a.patterns.map(p => p.confidence))
      const bMax = Math.max(...b.patterns.map(p => p.confidence))
      return bMax - aMax
    })
  }, [itemsWithPatterns, filter, confidenceFilter, patternSearch])

  // Stats
  const stats = useMemo(() => {
    const bullish = filteredItems.filter(({ patterns }) => patterns.some(p => p.type === 'BULLISH')).length
    const bearish = filteredItems.filter(({ patterns }) => patterns.some(p => p.type === 'BEARISH')).length
    const neutral = filteredItems.filter(({ patterns }) => patterns.some(p => p.type === 'NEUTRAL')).length
    return { bullish, bearish, neutral, total: filteredItems.length }
  }, [filteredItems])

  return (
    <div style={{ flex: 1, overflow: 'auto', direction: 'rtl', background: T.card, display: 'flex', flexDirection: 'column' }}>
      <ScopedStyle>{`
        @keyframes fadeInPV { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .pv-scroll::-webkit-scrollbar { width: 5px; }
        .pv-scroll::-webkit-scrollbar-track { background: ${T.bg2}; }
        .pv-scroll::-webkit-scrollbar-thumb { background: ${T.surface}; border-radius: 3px; }
      `}</ScopedStyle>

      {/* Header + Stats */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={18} color={T.cyan} />
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>الأنماط الفنية المكتشفة</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: `${T.green}12`, color: T.green, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
            {stats.bullish} صعودي
          </span>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: `${T.red}12`, color: T.red, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
            {stats.bearish} هبوطي
          </span>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: `${T.amber}12`, color: T.amber, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
            {stats.neutral} محايد
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Direction filters */}
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 9, fontWeight: 700,
              fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              background: filter === f.key ? `${T.cyan}20` : T.surface,
              color: filter === f.key ? T.cyan : T.text3,
              border: `0.5px solid ${filter === f.key ? T.border2 : T.border}`,
              transition: 'all 0.2s',
            }}
          >{f.label}</button>
        ))}

        <div style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />

        {/* Confidence filters */}
        {CONFIDENCE_FILTERS.map(f => (
          <button key={f.key} onClick={() => setConfidenceFilter(f.key)}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 9, fontWeight: 700,
              fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              background: confidenceFilter === f.key ? `${T.purple}20` : T.surface,
              color: confidenceFilter === f.key ? T.purple : T.text3,
              border: `0.5px solid ${confidenceFilter === f.key ? `${T.purple}30` : T.border}`,
              transition: 'all 0.2s',
            }}
          >{f.label}</button>
        ))}

        {/* Pattern search toggle */}
        <button
          onClick={() => setExpandedFilters(!expandedFilters)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 6, fontSize: 9, fontWeight: 700,
            fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            background: patternSearch !== 'ALL' ? `${T.amber}20` : T.surface,
            color: patternSearch !== 'ALL' ? T.amber : T.text3,
            border: `0.5px solid ${patternSearch !== 'ALL' ? `${T.amber}30` : T.border}`,
            transition: 'all 0.2s',
          }}
        >
          <Filter size={10} />
          نمط محدد
          {expandedFilters ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {/* Expanded pattern search */}
      {expandedFilters && (
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PATTERN_SEARCH_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setPatternSearch(opt.value)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 8, fontWeight: 700,
                fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                background: patternSearch === opt.value ? `${T.amber}15` : T.bg,
                color: patternSearch === opt.value ? T.amber : T.text3,
                border: `0.5px solid ${patternSearch === opt.value ? `${T.amber}30` : T.border}`,
                transition: 'all 0.2s',
              }}
            >{opt.label}</button>
          ))}
        </div>
      )}

      {/* Pattern Cards */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }} className="pv-scroll">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: T.text3, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>
              لا توجد أنماط مطابقة للفلاتر المحددة
            </div>
          ) : filteredItems.map(({ item, patterns }, i) => {
            const chgColor = item.changePercent >= 0 ? T.green : T.red
            const topPattern = patterns.reduce((a, b) => a.confidence > b.confidence ? a : b, patterns[0])
            return (
              <div key={item.symbol} onClick={() => ctx.setSelectedSymbol(item.symbol)}
                style={{
                  padding: '10px 12px', borderRadius: 8, background: T.bg2,
                  border: `0.5px solid ${
                    topPattern.type === 'BULLISH' ? `${T.green}20` :
                    topPattern.type === 'BEARISH' ? `${T.red}20` : T.border
                  }`,
                  cursor: 'pointer', transition: 'all 0.2s',
                  animation: `fadeInPV 0.35s ease ${i * 30}ms both`,
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = T.border2)}
                onMouseLeave={e => (e.currentTarget.style.borderColor =
                  topPattern.type === 'BULLISH' ? `${T.green}20` :
                  topPattern.type === 'BEARISH' ? `${T.red}20` : T.border
                )}
              >
                {/* Symbol row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{item.symbol}</span>
                    <DirectionTag direction={item.direction} signalClass={item.signalClass} size="sm" />
                    {/* Top pattern confidence indicator */}
                    <span style={{
                      fontSize: 7, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                      background: topPattern.confidence >= 70 ? `${T.green}15` : topPattern.confidence >= 50 ? `${T.amber}15` : `${T.text3}10`,
                      color: topPattern.confidence >= 70 ? T.green : topPattern.confidence >= 50 ? T.amber : T.text3,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {topPattern.confidence}%
                    </span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: chgColor, fontFamily: "'JetBrains Mono', monospace" }}>
                    {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                  </span>
                </div>

                {/* Pattern tags */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {patterns.map((p, pi) => <PatternPill key={pi} pattern={p} />)}
                </div>

                {/* Top pattern description */}
                {topPattern.descriptionAr && (
                  <div style={{
                    fontSize: 8, color: T.text3, fontFamily: "'Cairo', sans-serif",
                    lineHeight: 1.5, marginBottom: 6,
                    display: 'flex', alignItems: 'flex-start', gap: 4,
                  }}>
                    <AlertTriangle size={9} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                    {topPattern.descriptionAr}
                  </div>
                )}

                {/* Indicators row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <IndicatorBadge label="RSI" value={item.rsi !== null ? item.rsi.toFixed(1) : '—'} status={item.rsi !== null ? (item.rsi <= 30 ? 'oversold' : item.rsi >= 70 ? 'overbought' : 'neutral') : 'neutral'} />
                    <IndicatorBadge label="ADX" value={item.adx !== null ? item.adx.toFixed(1) : '—'} status={(item.adx ?? 0) > 25 ? 'bullish' : 'neutral'} />
                    <IndicatorBadge label="Stoch" value={item.stochK !== null ? `${item.stochK.toFixed(1)}` : '—'} status="neutral" />
                    <MiniScoreBar item={item} />
                  </div>
                  <button onClick={e => { e.stopPropagation(); ctx.setSelectedSymbol(item.symbol) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 4, border: `0.5px solid ${T.purple}30`,
                      background: `${T.purple}10`, color: T.purple, fontSize: 8,
                      fontWeight: 700, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    <Sparkles size={10} /> تحليل عميق
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
