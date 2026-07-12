'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Brain, Sparkles, Filter, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useScannerContext } from '../ScannerProvider'
import { DirectionTag } from '../shared/DirectionTag'
import { IndicatorBadge } from '../shared/IndicatorBadge'
import { ScopedStyle } from '@/components/ScopedStyle'
import T from '@/lib/unified-tokens'

function safeMax(arr: number[]): number {
  if (arr.length === 0) return -Infinity;
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] > max) max = arr[i]; }
  return max;
}
function safeMin(arr: number[]): number {
  if (arr.length === 0) return Infinity;
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] < min) min = arr[i]; }
  return min;
}

type PatternFilter = 'all' | 'bullish' | 'bearish' | 'neutral'
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low'

// All known patterns — keys used for i18n lookup
const PATTERN_KEYS: Record<string, string> = {
  // Candlestick patterns
  HAMMER: 'hammer', INVERTED_HAMMER: 'invertedHammer',
  BULLISH_ENGULFING: 'bullishEngulfing', BEARISH_ENGULFING: 'bearishEngulfing',
  DOJI: 'doji', DRAGONFLY_DOJI: 'dragonflyDoji', GRAVESTONE_DOJI: 'gravestoneDoji',
  MORNING_STAR: 'morningStar', EVENING_STAR: 'eveningStar',
  THREE_WHITE_SOLDIERS: 'threeWhiteSoldiers', THREE_BLACK_CROWS: 'threeBlackCrows',
  SHOOTING_STAR: 'shootingStar', HANGING_MAN: 'hangingMan',
  BULLISH_HARAMI: 'bullishHarami', BEARISH_HARAMI: 'bearishHarami',
  PIERCING_LINE: 'piercingLine', DARK_CLOUD_COVER: 'darkCloudCover',
  TWEEZER_TOP: 'tweezerTop', TWEEZER_BOTTOM: 'tweezerBottom',
  SPINNING_TOP: 'spinningTop',
  RISING_THREE_METHODS: 'risingThreeMethods', FALLING_THREE_METHODS: 'fallingThreeMethods',
  BULLISH_MARUBOZU: 'bullishMarubozu', BEARISH_MARUBOZU: 'bearishMarubozu',
  // Chart patterns
  BULL_FLAG: 'bullFlag', BEAR_FLAG: 'bearFlag',
  DOUBLE_TOP: 'doubleTop', DOUBLE_BOTTOM: 'doubleBottom',
  BREAKOUT_BULLISH: 'breakoutBullish', BREAKOUT_BEARISH: 'breakoutBearish',
  CONSOLIDATION: 'consolidation',
  HEAD_AND_SHOULDERS: 'headAndShoulders', INVERSE_HEAD_SHOULDERS: 'inverseHeadShoulders',
  ASCENDING_TRIANGLE: 'ascendingTriangle', DESCENDING_TRIANGLE: 'descendingTriangle',
  CUP_HANDLE: 'cupHandle', ASCENDING_WEDGE: 'ascendingWedge', DESCENDING_WEDGE: 'descendingWedge',
  CHANNEL: 'channel',
  // Divergence patterns
  BULL_DIV: 'bullDivergence', BEAR_DIV: 'bearDivergence',
  BULLISH_DIVERGENCE: 'bullDivergence', BEARISH_DIVERGENCE: 'bearDivergence',
  HIDDEN_BULLISH: 'hiddenBullish', HIDDEN_BEARISH: 'hiddenBearish',
}

interface DetectedPattern {
  name: string
  nameKey: string
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence: number
  descriptionKey: string
  descriptionParams?: Record<string, string | number>
}

function getPatternDirection(pType: string): 'bullish' | 'bearish' | 'neutral' {
  if (pType === 'BULLISH') return 'bullish'
  if (pType === 'BEARISH') return 'bearish'
  return 'neutral'
}

function PatternPill({ pattern }: { pattern: DetectedPattern }) {
  const t = useTranslations('scannerAdvanced')
  const dir = getPatternDirection(pattern.type)
  const color = dir === 'bullish' ? T.green : dir === 'bearish' ? T.red : T.amber
  const arName = pattern.nameKey ? t(`patterns.${pattern.nameKey}`) : pattern.name
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 8px', borderRadius: 4, fontSize: 8, fontWeight: 700,
      background: `${color}12`, color, border: `0.5px solid ${color}30`,
      fontFamily: "var(--font-ar)", whiteSpace: 'nowrap',
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
      name: 'BULL_DIV', nameKey: 'rsiBullishDivergence', type: 'BULLISH',
      confidence: Math.round(60 + (30 - item.rsi) * 1.5),
      descriptionKey: 'rsiOversoldDesc',
    })
  }
  if (item.rsi !== null && item.rsi >= 70) {
    patterns.push({
      name: 'BEAR_DIV', nameKey: 'rsiBearishDivergence', type: 'BEARISH',
      confidence: Math.round(60 + (item.rsi - 70) * 1.5),
      descriptionKey: 'rsiOverboughtDesc',
    })
  }

  // MACD patterns
  if (item.macdSignal === 'BULLISH_CROSSOVER') {
    patterns.push({
      name: 'BULLISH_ENGULFING', nameKey: 'macdBullishCrossover', type: 'BULLISH',
      confidence: 75,
      descriptionKey: 'macdBullishCrossoverDesc',
    })
  }
  if (item.macdSignal === 'BEARISH_CROSSOVER') {
    patterns.push({
      name: 'BEARISH_ENGULFING', nameKey: 'macdBearishCrossover', type: 'BEARISH',
      confidence: 75,
      descriptionKey: 'macdBearishCrossoverDesc',
    })
  }

  // Direction + ADX patterns
  if (item.direction?.includes('BUY') && (item.adx ?? 0) > 25) {
    patterns.push({
      name: 'BULL_FLAG', nameKey: 'bullFlag', type: 'BULLISH',
      confidence: Math.round(55 + (item.adx ?? 0)),
      descriptionKey: 'strongBullishTrend',
    })
  }
  if (item.direction?.includes('SELL') && (item.adx ?? 0) > 25) {
    patterns.push({
      name: 'BEAR_FLAG', nameKey: 'bearFlag', type: 'BEARISH',
      confidence: Math.round(55 + (item.adx ?? 0)),
      descriptionKey: 'strongBearishTrend',
    })
  }

  // Stochastic patterns
  if (item.stochK !== null && item.stochK < 20) {
    patterns.push({
      name: 'HAMMER', nameKey: 'hammer', type: 'BULLISH',
      confidence: 65,
      descriptionKey: 'stochOversoldDesc',
    })
  }
  if (item.stochK !== null && item.stochK > 80) {
    patterns.push({
      name: 'SHOOTING_STAR', nameKey: 'shootingStar', type: 'BEARISH',
      confidence: 65,
      descriptionKey: 'stochOverboughtDesc',
    })
  }

  // Bollinger patterns
  if (item.bollingerPosition === 'BELOW_LOWER') {
    patterns.push({
      name: 'DOUBLE_BOTTOM', nameKey: 'bollingerDoubleBottom', type: 'BULLISH',
      confidence: 70,
      descriptionKey: 'bollingerDoubleBottomDesc',
    })
  }
  if (item.bollingerPosition === 'ABOVE_UPPER') {
    patterns.push({
      name: 'DOUBLE_TOP', nameKey: 'bollingerDoubleTop', type: 'BEARISH',
      confidence: 70,
      descriptionKey: 'bollingerDoubleTopDesc',
    })
  }

  // Smart Score based patterns
  if (item.smartScore) {
    if (item.smartScore.signalType === 'REVERSAL') {
      patterns.push({
        name: item.smartScore.action.includes('BUY') ? 'DOUBLE_BOTTOM' : 'DOUBLE_TOP',
        nameKey: item.smartScore.action.includes('BUY') ? 'smartBullishReversal' : 'smartBearishReversal',
        type: item.smartScore.action.includes('BUY') ? 'BULLISH' : 'BEARISH',
        confidence: Math.round((item.smartScore.confidence ?? 50) * 0.8),
        descriptionKey: 'smartReversalDesc',
      })
    }
    if (item.smartScore.signalType === 'BREAKOUT') {
      patterns.push({
        name: item.smartScore.action.includes('BUY') ? 'BREAKOUT_BULLISH' : 'BREAKOUT_BEARISH',
        nameKey: item.smartScore.action.includes('BUY') ? 'smartBullishBreakout' : 'smartBearishBreakout',
        type: item.smartScore.action.includes('BUY') ? 'BULLISH' : 'BEARISH',
        confidence: Math.round((item.smartScore.confidence ?? 50) * 0.85),
        descriptionKey: 'smartBreakoutDesc',
      })
    }
    if (item.smartScore.signalType === 'CONSOLIDATION') {
      patterns.push({
        name: 'CONSOLIDATION', nameKey: 'consolidation',
        type: 'NEUTRAL', confidence: 50,
        descriptionKey: 'consolidationDesc',
      })
    }
  }

  // Large move patterns
  if (item.changePercent > 3) {
    patterns.push({
      name: 'BREAKOUT_BULLISH', nameKey: 'strongBullishBreakout', type: 'BULLISH',
      confidence: 80,
      descriptionKey: 'strongBullishBreakoutDesc',
      descriptionParams: { pct: item.changePercent.toFixed(1) },
    })
  }
  if (item.changePercent < -3) {
    patterns.push({
      name: 'BREAKOUT_BEARISH', nameKey: 'strongBearishBreakout', type: 'BEARISH',
      confidence: 80,
      descriptionKey: 'strongBearishBreakoutDesc',
      descriptionParams: { pct: Math.abs(item.changePercent).toFixed(1) },
    })
  }

  // Default if no patterns
  if (patterns.length === 0) {
    patterns.push({
      name: 'DOJI', nameKey: 'dojiIndecision', type: 'NEUTRAL',
      confidence: 40,
      descriptionKey: 'dojiIndecisionDesc',
    })
  }

  return patterns
}

// Pattern-specific search filter keys
const PATTERN_SEARCH_KEYS: { value: string; labelKey: string }[] = [
  { value: 'ALL', labelKey: 'patterns.allPatterns' },
  { value: 'HAMMER', labelKey: 'patterns.hammer' },
  { value: 'ENGULFING', labelKey: 'patterns.engulfing' },
  { value: 'DOJI', labelKey: 'patterns.doji' },
  { value: 'BREAKOUT', labelKey: 'patterns.breakoutBullish' },
  { value: 'REVERSAL', labelKey: 'patterns.reversal' },
  { value: 'FLAG', labelKey: 'patterns.flag' },
  { value: 'DIV', labelKey: 'patterns.div' },
  { value: 'CONSOLIDATION', labelKey: 'patterns.consolidation' },
]

export function PatternsView() {
  const t = useTranslations('scannerAdvanced')
  const ctx = useScannerContext()
  const [filter, setFilter] = useState<PatternFilter>('all')
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all')
  const [patternSearch, setPatternSearch] = useState('ALL')
  const [expandedFilters, setExpandedFilters] = useState(false)

  const FILTERS: { key: PatternFilter; label: string }[] = [
    { key: 'all', label: t('all') }, { key: 'bullish', label: t('bullish') },
    { key: 'bearish', label: t('bearish') }, { key: 'neutral', label: t('neutral') },
  ]

  const CONFIDENCE_FILTERS: { key: ConfidenceFilter; label: string }[] = [
    { key: 'all', label: t('patterns.allConfidences') }, { key: 'high', label: t('patterns.highConfidence') },
    { key: 'medium', label: t('patterns.mediumConfidence') }, { key: 'low', label: t('patterns.lowConfidence') },
  ]

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
        const maxConf = safeMax(patterns.map(p => p.confidence))
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
      const aMax = safeMax(a.patterns.map(p => p.confidence))
      const bMax = safeMax(b.patterns.map(p => p.confidence))
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
    <div style={{ flex: 1, overflow: 'auto', direction: 'inherit', background: T.card, display: 'flex', flexDirection: 'column' }}>
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
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "var(--font-ar)" }}>{t('patterns.detectedPatterns')}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: `${T.green}12`, color: T.green, fontWeight: 700, fontFamily: "var(--font-ar)" }}>
            {stats.bullish} {t('bullish')}
          </span>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: `${T.red}12`, color: T.red, fontWeight: 700, fontFamily: "var(--font-ar)" }}>
            {stats.bearish} {t('bearish')}
          </span>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: `${T.amber}12`, color: T.amber, fontWeight: 700, fontFamily: "var(--font-ar)" }}>
            {stats.neutral} {t('neutral')}
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
              fontFamily: "var(--font-ar)", cursor: 'pointer',
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
              fontFamily: "var(--font-ar)", cursor: 'pointer',
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
            fontFamily: "var(--font-ar)", cursor: 'pointer',
            background: patternSearch !== 'ALL' ? `${T.amber}20` : T.surface,
            color: patternSearch !== 'ALL' ? T.amber : T.text3,
            border: `0.5px solid ${patternSearch !== 'ALL' ? `${T.amber}30` : T.border}`,
            transition: 'all 0.2s',
          }}
        >
          <Filter size={10} />
          {t('patterns.specificPattern')}
          {expandedFilters ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {/* Expanded pattern search */}
      {expandedFilters && (
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PATTERN_SEARCH_KEYS.map(opt => (
            <button key={opt.value} onClick={() => setPatternSearch(opt.value)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 8, fontWeight: 700,
                fontFamily: "var(--font-ar)", cursor: 'pointer',
                background: patternSearch === opt.value ? `${T.amber}15` : T.bg,
                color: patternSearch === opt.value ? T.amber : T.text3,
                border: `0.5px solid ${patternSearch === opt.value ? `${T.amber}30` : T.border}`,
                transition: 'all 0.2s',
              }}
            >{t(opt.labelKey)}</button>
          ))}
        </div>
      )}

      {/* Pattern Cards */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }} className="pv-scroll">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: T.text3, fontSize: 12, fontFamily: "var(--font-ar)" }}>
              {t('patterns.noMatchingPatterns')}
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
                    <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "var(--font-mono)" }}>{item.symbol}</span>
                    <DirectionTag direction={item.direction} signalClass={item.signalClass} size="sm" />
                    {/* Top pattern confidence indicator */}
                    <span style={{
                      fontSize: 7, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                      background: topPattern.confidence >= 70 ? `${T.green}15` : topPattern.confidence >= 50 ? `${T.amber}15` : `${T.text3}10`,
                      color: topPattern.confidence >= 70 ? T.green : topPattern.confidence >= 50 ? T.amber : T.text3,
                      fontFamily: "var(--font-mono)",
                    }}>
                      {topPattern.confidence}%
                    </span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: chgColor, fontFamily: "var(--font-mono)" }}>
                    {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                  </span>
                </div>

                {/* Pattern tags */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {patterns.map((p, pi) => <PatternPill key={pi} pattern={p} />)}
                </div>

                {/* Top pattern description */}
                {topPattern.descriptionKey && (
                  <div style={{
                    fontSize: 8, color: T.text3, fontFamily: "var(--font-ar)",
                    lineHeight: 1.5, marginBottom: 6,
                    display: 'flex', alignItems: 'flex-start', gap: 4,
                  }}>
                    <AlertTriangle size={9} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                    {t(`patterns.${topPattern.descriptionKey}`, topPattern.descriptionParams)}
                  </div>
                )}

                {/* Indicators row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <IndicatorBadge label={t('indicators.rsi')} value={item.rsi !== null ? item.rsi.toFixed(1) : '—'} status={item.rsi !== null ? (item.rsi <= 30 ? 'oversold' : item.rsi >= 70 ? 'overbought' : 'neutral') : 'neutral'} />
                    <IndicatorBadge label={t('indicators.adx')} value={item.adx !== null ? item.adx.toFixed(1) : '—'} status={(item.adx ?? 0) > 25 ? 'bullish' : 'neutral'} />
                    <IndicatorBadge label={t('indicators.stoch')} value={item.stochK !== null ? `${item.stochK.toFixed(1)}` : '—'} status="neutral" />
                    <MiniScoreBar item={item} />
                  </div>
                  <button onClick={e => { e.stopPropagation(); ctx.setSelectedSymbol(item.symbol) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 4, border: `0.5px solid ${T.purple}30`,
                      background: `${T.purple}10`, color: T.purple, fontSize: 8,
                      fontWeight: 700, fontFamily: "var(--font-ar)", cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    <Sparkles size={10} /> {t('patterns.deepAnalysis')}
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
