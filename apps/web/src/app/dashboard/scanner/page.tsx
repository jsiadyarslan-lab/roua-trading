'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ScanSearch, Activity, TrendingUp, TrendingDown, Brain,
  Search, LayoutGrid, Map, Clock, Filter, RefreshCw,
  ChevronUp, ChevronDown, Minus, Zap, Eye, BarChart3,
  Shield, ArrowUpRight, ArrowDownRight, MinusCircle,
  Layers, Target, AlertTriangle, Sparkles, X
} from 'lucide-react'

// ── Design Tokens ──
const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  cardHover:'#0B0F19',
  card2:   '#0B0E14',
  surface: '#1A1D29',
  blue:    '#0A84FF',
  cyan:    '#00D4FF',
  green:   '#00FFA3',
  greenDim:'#00CC82',
  red:     '#FF4757',
  redDim:  '#FF3344',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#F0F2F5',
  text2:   '#94a3b8',
  text3:   '#8B92A8',
  border:  'rgba(255,255,255,0.06)',
  border2: 'rgba(0,212,255,0.16)',
}

// ── Types ──
interface ScannerItem {
  symbol: string; name: string; category: string
  price: number; change: number; changePercent: number
  volume: number; high: number; low: number
  rsi: number | null; macdSignal: string | null; macdHistogram: number | null
  bollingerPosition: string | null; stochK: number | null; stochD: number | null
  adx: number | null; atr: number | null; atrVolatility: string | null
  direction: string; signalClass: string; technicalScore: number; confidence: number
  sparkline: number[]; reasons: string[]; reasonsAr: string[]
  marketOpen: boolean; source: string; timestamp: string
}

interface HeatmapItem {
  symbol: string; name: string; category: string
  price: number; changePercent: number; volume: number
  direction: string; technicalScore: number; marketCap: number | null
}

interface DeepAnalysis {
  symbol: string; name: string; category: string
  quote: { price: number; change: number; changePercent: number; open: number; high: number; low: number; volume: number; marketCap: number | null; fiftyTwoWeekHigh: number | null; fiftyTwoWeekLow: number | null }
  technical: { rsi: number | null; rsiInterpretation: string | null; macdSignal: string | null; macdHistogram: number | null; bollingerPosition: string | null; bollingerBandwidth: number | null; stochK: number | null; stochD: number | null; adx: number | null; adxTrend: string | null; atr: number | null; atrVolatility: string | null; vwapPosition: string | null; technicalScore: number; summary: string }
  supportResistance: { price: number; type: string; strength: string; touches: number }[]
  patterns: { name: string; nameAr: string; type: string; confidence: number; description: string; descriptionAr: string }[]
  signal: { direction: string; signalClass: string; confidence: number; entryPrice: number | null; takeProfit: number | null; stopLoss: number | null; riskRewardRatio: number | null; reasons: string[]; reasonsAr: string[] }
  aiAnalysis: string | null; aiModel: string | null; aiSentiment: string | null; riskLevel: string | null
  marketOpen: boolean; source: string; timestamp: string
}

interface MultiTfResult {
  symbol: string; timeframes: { timeframe: string; direction: string; technicalScore: number; rsi: number | null; macdSignal: string | null; adx: number | null; bollingerPosition: string | null; confidence: number; summary: string }[]
  alignment: string; alignmentScore: number; executionHint: string; executionHintAr: string; confidence: number; timestamp: string
}

type TabType = 'scanner' | 'heatmap' | 'patterns' | 'timeframes' | 'overview'
type SortKey = 'technicalScore' | 'changePercent' | 'rsi' | 'volume' | 'confidence'
type SortDir = 'asc' | 'desc'

const SYMBOLS = ['BTC/USD','ETH/USD','SOL/USD','BNB/USD','XRP/USD','ADA/USD','EUR/USD','GBP/USD','USD/JPY','XAU/USD','AAPL','TSLA','NVDA']

const DIR_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  STRONG_BUY:  { label: 'شراء قوي', color: T.green, bg: `${T.green}15`, icon: ArrowUpRight },
  BUY:         { label: 'شراء', color: T.greenDim, bg: `${T.greenDim}12`, icon: TrendingUp },
  NEUTRAL:     { label: 'محايد', color: T.text2, bg: `${T.text2}10`, icon: MinusCircle },
  SELL:        { label: 'بيع', color: T.redDim, bg: `${T.redDim}12`, icon: TrendingDown },
  STRONG_SELL: { label: 'بيع قوي', color: T.red, bg: `${T.red}15`, icon: ArrowDownRight },
}

const CLASS_LABELS: Record<string, { label: string; color: string }> = {
  TREND:         { label: 'اتجاهي', color: T.blue },
  REVERSION:     { label: 'انعكاسي', color: T.purple },
  BREAKOUT:      { label: 'اختراق', color: T.amber },
  CONSOLIDATION: { label: 'تماسك', color: T.text3 },
  WATCH:         { label: 'مراقبة', color: T.text3 },
}

export default function AdvancedScannerPage() {
  // ── State ──
  const [activeTab, setActiveTab] = useState<TabType>('scanner')
  const [scanData, setScanData] = useState<ScannerItem[]>([])
  const [heatmapData, setHeatmapData] = useState<HeatmapItem[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(60)
  const [filterCategory, setFilterCategory] = useState('ALL')
  const [filterTimeframe, setFilterTimeframe] = useState('1h')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('technicalScore')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Deep analysis modal
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [deepAnalysis, setDeepAnalysis] = useState<DeepAnalysis | null>(null)
  const [deepLoading, setDeepLoading] = useState(false)

  // Multi-timeframe for selected symbol
  const [multiTfData, setMultiTfData] = useState<MultiTfResult | null>(null)
  const [multiTfSymbol, setMultiTfSymbol] = useState('BTC/USD')

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // ── Data Fetching ──
  const fetchScanData = useCallback(async () => {
    try {
      const res = await fetch(`/api/scanner/scan?timeframe=${filterTimeframe}&category=${filterCategory}`)
      const j = await res.json()
      if (j.success && j.items) {
        setScanData(j.items)
        setLastUpdate(new Date())
      }
    } catch (e) {
      console.error('[Scanner] Scan fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [filterTimeframe, filterCategory])

  const fetchHeatmapData = useCallback(async () => {
    try {
      const res = await fetch(`/api/scanner/heatmap?category=${filterCategory}`)
      const j = await res.json()
      if (j.success && j.data) setHeatmapData(j.data)
    } catch (e) {
      console.error('[Scanner] Heatmap fetch error:', e)
    }
  }, [filterCategory])

  const fetchDeepAnalysis = useCallback(async (symbol: string) => {
    setDeepLoading(true)
    try {
      const res = await fetch(`/api/scanner/analysis/${encodeURIComponent(symbol)}`)
      const j = await res.json()
      if (j.success && j.data) setDeepAnalysis(j.data)
    } catch (e) {
      console.error('[Scanner] Deep analysis error:', e)
    } finally {
      setDeepLoading(false)
    }
  }, [])

  const fetchMultiTf = useCallback(async (symbol: string) => {
    try {
      const res = await fetch(`/api/scanner/multi-tf/${encodeURIComponent(symbol)}`)
      const j = await res.json()
      if (j.success && j.data) setMultiTfData(j.data)
    } catch (e) {
      console.error('[Scanner] Multi-TF error:', e)
    }
  }, [])

  // ── Effects ──
  useEffect(() => {
    fetchScanData()
    fetchHeatmapData()
  }, [fetchScanData, fetchHeatmapData])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchScanData()
          fetchHeatmapData()
          return 60
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchScanData, fetchHeatmapData])

  useEffect(() => {
    if (activeTab === 'timeframes' && multiTfSymbol) {
      fetchMultiTf(multiTfSymbol)
    }
  }, [activeTab, multiTfSymbol, fetchMultiTf])

  useEffect(() => {
    if (selectedSymbol) fetchDeepAnalysis(selectedSymbol)
  }, [selectedSymbol, fetchDeepAnalysis])

  // ── Sorting & Filtering ──
  const filteredData = scanData
    .filter(d => !search || d.symbol.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aVal = a[sortKey] ?? 0
      const bVal = b[sortKey] ?? 0
      return sortDir === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number)
    })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // ── Helpers ──
  const formatPrice = (p: number) => p < 10 ? p.toFixed(4) : p < 1000 ? p.toFixed(2) : p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const formatVol = (v: number) => v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(1)}K` : v.toFixed(0)

  const getDirectionConfig = (dir: string) => DIR_CONFIG[dir] || DIR_CONFIG.NEUTRAL
  const getClassConfig = (cls: string) => CLASS_LABELS[cls] || CLASS_LABELS.WATCH

  const getScoreColor = (score: number) => {
    if (score >= 40) return T.green
    if (score >= 15) return T.greenDim
    if (score > -15) return T.text3
    if (score > -40) return T.redDim
    return T.red
  }

  // ── Mini Sparkline ──
  const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
    if (!data || data.length < 2) return null
    const min = Math.min(...data); const max = Math.max(...data)
    const range = max - min || 1
    const w = 60; const h = 20
    const points = data.map((v, i) => `${(i/(data.length-1))*w},${h-((v-min)/range)*h}`).join(' ')
    return (
      <svg width={w} height={h} style={{ flexShrink: 0 }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    )
  }

  // ── Tab Definitions ──
  const tabs: { id: TabType; icon: any; label: string }[] = [
    { id: 'scanner', icon: LayoutGrid, label: 'جدول المسح' },
    { id: 'heatmap', icon: Map, label: 'الخريطة الحرارية' },
    { id: 'patterns', icon: Brain, label: 'الأنماط (AI)' },
    { id: 'timeframes', icon: Clock, label: 'متعدد الأطر' },
    { id: 'overview', icon: BarChart3, label: 'نظرة عامة' },
  ]

  // ══════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════
  return (
    <div style={{
      width: '100%', height: 'calc(100vh - 60px)',
      background: T.bg, padding: '8px 16px', boxSizing: 'border-box',
      direction: 'rtl', fontFamily: "'Cairo', sans-serif",
      display: 'flex', gap: 12, overflow: 'hidden'
    }}>
      <style>{`
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #0A84FF22; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #0A84FF44; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{ opacity:1; } 50%{ opacity:0.5; } }
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header */}
        <div style={{ padding: '8px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <ScanSearch size={16} color={T.amber} />
            <h1 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.text }}>السكانر المتقدم</h1>
          </div>
          <p style={{ margin: 0, fontSize: 9, color: T.text3, lineHeight: 1.5 }}>
            مسح شامل بالذكاء الاصطناعي مع 10+ مؤشرات تقنية
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: isActive ? `${T.cyan}10` : 'transparent',
                color: isActive ? T.cyan : T.text2,
                borderRight: isActive ? `3px solid ${T.cyan}` : '3px solid transparent',
                transition: 'all 0.2s', fontFamily: "'Cairo', sans-serif"
              }}>
                <tab.icon size={13} color={isActive ? T.cyan : T.text3} />
                <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 600 }}>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Status */}
        <div style={{ marginTop: 'auto', background: `${T.blue}08`, padding: '10px', borderRadius: 8, border: `0.5px solid ${T.blue}20` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: T.blue, fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
            <Activity size={10} /> تحديث تلقائي
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 8, color: T.text3 }}>التالي: {countdown}ث</span>
            <button onClick={() => { fetchScanData(); fetchHeatmapData(); setCountdown(60); }} style={{
              background: 'transparent', border: `0.5px solid ${T.blue}30`, borderRadius: 4,
              color: T.blue, cursor: 'pointer', padding: '2px 6px', fontSize: 8, fontWeight: 700
            }}>
              <RefreshCw size={9} />
            </button>
          </div>
          {lastUpdate && <div style={{ fontSize: 7, color: T.text3, marginTop: 3 }}>آخر تحديث: {lastUpdate.toLocaleTimeString('ar')}</div>}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{
        flex: 1, background: T.card, border: `0.5px solid ${T.border}`,
        borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column'
      }}>

        {/* ═══ TAB 1: SCANNER TABLE ═══ */}
        {activeTab === 'scanner' && (
          <>
            {/* Toolbar */}
            <div style={{
              padding: '8px 14px', borderBottom: `0.5px solid ${T.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: T.card2, flexShrink: 0, gap: 8, flexWrap: 'wrap'
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>
                جدول المسح الحي
                <span style={{ fontSize: 9, color: T.text3, fontWeight: 500, marginRight: 8 }}>
                  {scanData.length} أصل • {filterTimeframe}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Category Filter */}
                <div style={{ display: 'flex', background: T.bg2, borderRadius: 5, padding: '1px' }}>
                  {['ALL','CRYPTO','FOREX','STOCK'].map(cat => (
                    <button key={cat} onClick={() => setFilterCategory(cat)} style={{
                      background: filterCategory === cat ? `${T.cyan}15` : 'transparent',
                      border: 'none', color: filterCategory === cat ? T.cyan : T.text2,
                      padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                      fontSize: 9, fontWeight: filterCategory === cat ? 700 : 500,
                      fontFamily: "'JetBrains Mono', monospace"
                    }}>{cat === 'ALL' ? 'الكل' : cat}</button>
                  ))}
                </div>
                {/* Timeframe */}
                <select value={filterTimeframe} onChange={e => setFilterTimeframe(e.target.value)} style={{
                  background: T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 4,
                  color: T.text, fontSize: 9, padding: '3px 6px', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace"
                }}>
                  <option value="15min">15 دقيقة</option>
                  <option value="1h">1 ساعة</option>
                  <option value="4h">4 ساعات</option>
                  <option value="1day">يومي</option>
                </select>
                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 4, padding: '0 6px', height: 24 }}>
                  <Search size={10} color={T.text3} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." style={{ background: 'transparent', border: 'none', color: T.text, fontSize: 9, outline: 'none', padding: '0 4px', width: 70, fontFamily: "'Cairo', sans-serif" }} />
                </div>
              </div>
            </div>

            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 0.7fr 0.7fr 0.7fr 0.8fr 1.2fr 0.8fr',
              padding: '8px 14px', borderBottom: `0.5px solid ${T.border}`,
              background: `linear-gradient(90deg, ${T.cyan}04, transparent)`,
              fontSize: 9, color: T.text3, fontWeight: 700, gap: 6, flexShrink: 0
            }}>
              <div>الرمز</div>
              <div style={{ cursor: 'pointer' }} onClick={() => toggleSort('technicalScore')}>الدرجة {sortKey === 'technicalScore' && (sortDir === 'desc' ? '↓' : '↑')}</div>
              <div style={{ cursor: 'pointer' }} onClick={() => toggleSort('changePercent')}>التغير% {sortKey === 'changePercent' && (sortDir === 'desc' ? '↓' : '↑')}</div>
              <div>RSI</div>
              <div>MACD</div>
              <div>Stoch</div>
              <div>ADX</div>
              <div>الخط البياني</div>
              <div>إجراء</div>
            </div>

            {/* Table Body */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 10, gap: 8 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${T.cyan}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
                  جارٍ فحص وتحليل الأسواق...
                </div>
              ) : filteredData.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 10 }}>
                  لا توجد بيانات متاحة حالياً
                </div>
              ) : filteredData.map((row, idx) => {
                const dirConf = getDirectionConfig(row.direction)
                const classConf = getClassConfig(row.signalClass)
                return (
                  <div key={row.symbol} style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 0.7fr 0.7fr 0.7fr 0.8fr 1.2fr 0.8fr',
                    padding: '7px 14px', borderBottom: `0.5px solid ${T.bg2}`,
                    gap: 6, alignItems: 'center', transition: 'all 0.15s', cursor: 'pointer',
                    animation: `fadeIn 0.3s ease ${idx * 0.03}s both`,
                    background: !row.marketOpen ? `${T.bg2}80` : 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = T.cardHover}
                  onMouseLeave={e => e.currentTarget.style.background = !row.marketOpen ? `${T.bg2}80` : 'transparent'}
                  >
                    {/* Symbol */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: dirConf.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `0.5px solid ${dirConf.color}30`
                      }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: dirConf.color, fontFamily: "'JetBrains Mono', monospace" }}>
                          {row.symbol.split('/')[0].substring(0, 2)}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
                          {row.symbol}
                          {!row.marketOpen && <span style={{ fontSize: 7, color: T.text3, marginRight: 4, fontWeight: 500 }}>مغلق</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                          <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 2, background: dirConf.bg, color: dirConf.color, fontWeight: 700 }}>
                            {dirConf.label}
                          </span>
                          <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 2, background: `${classConf.color}10`, color: classConf.color, fontWeight: 600 }}>
                            {classConf.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Technical Score */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `2px solid ${getScoreColor(row.technicalScore)}`,
                        background: `${getScoreColor(row.technicalScore)}08`
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: getScoreColor(row.technicalScore), fontFamily: "'JetBrains Mono', monospace" }}>
                          {row.technicalScore > 0 ? '+' : ''}{row.technicalScore}
                        </span>
                      </div>
                    </div>

                    {/* Change */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: row.changePercent >= 0 ? T.green : T.red }}>
                        {row.changePercent >= 0 ? '+' : ''}{row.changePercent.toFixed(2)}%
                      </div>
                      <div style={{ fontSize: 9, color: T.text2, fontFamily: "'JetBrains Mono', monospace" }}>${formatPrice(row.price)}</div>
                    </div>

                    {/* RSI */}
                    <div style={{ textAlign: 'center' }}>
                      {row.rsi !== null ? (
                        <span style={{
                          padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                          background: row.rsi > 70 ? `${T.red}12` : row.rsi < 30 ? `${T.green}12` : T.bg2,
                          color: row.rsi > 70 ? T.red : row.rsi < 30 ? T.green : T.text2,
                          border: `0.5px solid ${row.rsi > 70 ? T.red : row.rsi < 30 ? T.green : T.border}`
                        }}>{row.rsi.toFixed(1)}</span>
                      ) : <span style={{ fontSize: 8, color: T.text3 }}>-</span>}
                    </div>

                    {/* MACD */}
                    <div style={{ textAlign: 'center' }}>
                      {row.macdSignal ? (
                        <span style={{
                          padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700,
                          background: row.macdSignal === 'BULLISH_CROSSOVER' ? `${T.green}12` : row.macdSignal === 'BEARISH_CROSSOVER' ? `${T.red}12` : T.bg2,
                          color: row.macdSignal === 'BULLISH_CROSSOVER' ? T.green : row.macdSignal === 'BEARISH_CROSSOVER' ? T.red : T.text3,
                        }}>{row.macdSignal === 'BULLISH_CROSSOVER' ? '▲ صعودي' : row.macdSignal === 'BEARISH_CROSSOVER' ? '▼ هبوطي' : '—'}</span>
                      ) : <span style={{ fontSize: 8, color: T.text3 }}>-</span>}
                    </div>

                    {/* Stochastic */}
                    <div style={{ textAlign: 'center' }}>
                      {row.stochK !== null ? (
                        <span style={{
                          fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                          color: row.stochK > 80 ? T.red : row.stochK < 20 ? T.green : T.text2
                        }}>{row.stochK.toFixed(0)}/{row.stochD?.toFixed(0)}</span>
                      ) : <span style={{ fontSize: 8, color: T.text3 }}>-</span>}
                    </div>

                    {/* ADX */}
                    <div style={{ textAlign: 'center' }}>
                      {row.adx !== null ? (
                        <span style={{
                          fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                          color: row.adx >= 25 ? T.amber : T.text3
                        }}>{row.adx.toFixed(0)}{row.adx >= 25 ? '⚡' : ''}</span>
                      ) : <span style={{ fontSize: 8, color: T.text3 }}>-</span>}
                    </div>

                    {/* Sparkline */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <Sparkline data={row.sparkline} color={row.changePercent >= 0 ? T.green : T.red} />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                      <button title="تحليل عميق" onClick={() => setSelectedSymbol(row.symbol)} style={{
                        width: 24, height: 24, borderRadius: 4, border: `0.5px solid ${T.border}`,
                        background: T.bg2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}><Eye size={10} color={T.cyan} /></button>
                      <button title="تحليل متعدد الأطر" onClick={() => { setMultiTfSymbol(row.symbol); setActiveTab('timeframes'); }} style={{
                        width: 24, height: 24, borderRadius: 4, border: `0.5px solid ${T.border}`,
                        background: T.bg2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}><Layers size={10} color={T.amber} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ═══ TAB 2: HEATMAP ═══ */}
        {activeTab === 'heatmap' && (
          <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Map color={T.purple} size={14} /> الخريطة الحرارية
                </h2>
                <p style={{ margin: 0, fontSize: 10, color: T.text3 }}>تصور بصري لحركة الأسعار — الأخضر = صعود، الأحمر = هبوط</p>
              </div>
              <div style={{ display: 'flex', background: T.bg2, borderRadius: 5, padding: '1px' }}>
                {['ALL','CRYPTO','FOREX','STOCK'].map(cat => (
                  <button key={cat} onClick={() => setFilterCategory(cat)} style={{
                    background: filterCategory === cat ? `${T.cyan}15` : 'transparent',
                    border: 'none', color: filterCategory === cat ? T.cyan : T.text2,
                    padding: '3px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9,
                    fontFamily: "'JetBrains Mono', monospace"
                  }}>{cat === 'ALL' ? 'الكل' : cat}</button>
                ))}
              </div>
            </div>

            {heatmapData.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 10 }}>جارٍ تحميل البيانات...</div>
            ) : (
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, alignContent: 'start' }}>
                {heatmapData.map((item, idx) => {
                  const intensity = Math.min(Math.abs(item.changePercent) * 15, 50)
                  const isPositive = item.changePercent >= 0
                  const bgColor = isPositive
                    ? `rgba(0,255,163,${intensity/100})`
                    : `rgba(255,71,87,${intensity/100})`
                  const borderColor = isPositive ? `${T.green}40` : `${T.red}40`

                  return (
                    <div key={item.symbol} style={{
                      background: `linear-gradient(135deg, ${bgColor}, ${T.bg2})`,
                      border: `0.5px solid ${borderColor}`,
                      borderRadius: 8, padding: '12px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.2s',
                      minHeight: 80,
                      animation: `fadeIn 0.3s ease ${idx * 0.04}s both`,
                    }}
                    onClick={() => setSelectedSymbol(item.symbol)}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', fontFamily: "'JetBrains Mono', monospace", textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                        {item.symbol}
                      </div>
                      <div style={{ fontSize: 10, color: T.text3, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, fontFamily: "'JetBrains Mono', monospace",
                        color: isPositive ? T.green : T.red
                      }}>
                        {isPositive ? '+' : ''}{item.changePercent.toFixed(2)}%
                      </div>
                      <div style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                        ${formatPrice(item.price)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 3: AI PATTERNS ═══ */}
        {activeTab === 'patterns' && (
          <div style={{ padding: '20px', height: '100%', overflow: 'auto' }}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Brain color={T.cyan} size={14} /> الأنماط الفنية المكتشفة
              </h2>
              <p style={{ margin: 0, fontSize: 10, color: T.text3 }}>
                كشف تلقائي لأنماط الشموع والتكوينات الفنية بالذكاء الاصطناعي
              </p>
            </div>

            {scanData.length === 0 ? (
              <div style={{ textAlign: 'center', color: T.text3, fontSize: 10, padding: 40 }}>جارٍ تحميل البيانات...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scanData.filter(d => d.marketOpen).map((item) => {
                  const dirConf = getDirectionConfig(item.direction)
                  return (
                    <div key={item.symbol} style={{
                      background: T.bg2, borderRadius: 8, border: `0.5px solid ${T.border}`,
                      padding: '14px', cursor: 'pointer', transition: 'all 0.15s'
                    }}
                    onClick={() => setSelectedSymbol(item.symbol)}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.border2}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 6, background: dirConf.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {item.changePercent >= 0 ? <TrendingUp size={14} color={dirConf.color} /> : <TrendingDown size={14} color={dirConf.color} />}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{item.symbol}</div>
                            <div style={{ fontSize: 8, color: T.text3 }}>{item.name}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                            background: dirConf.bg, color: dirConf.color, border: `0.5px solid ${dirConf.color}30`
                          }}>{dirConf.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: item.changePercent >= 0 ? T.green : T.red, fontFamily: "'JetBrains Mono', monospace" }}>
                            {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      {/* Reasons / Pattern Tags */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {item.reasonsAr.map((reason, i) => (
                          <span key={i} style={{
                            padding: '2px 6px', borderRadius: 3, fontSize: 8,
                            background: `${T.blue}08`, color: T.text3, border: `0.5px solid ${T.border}`,
                            fontWeight: 600
                          }}>{reason}</span>
                        ))}
                      </div>

                      {/* Indicator Row */}
                      <div style={{ display: 'flex', gap: 12, fontSize: 9, color: T.text3 }}>
                        {item.rsi !== null && <span>RSI: <b style={{ color: item.rsi > 70 ? T.red : item.rsi < 30 ? T.green : T.text2 }}>{item.rsi.toFixed(1)}</b></span>}
                        {item.adx !== null && <span>ADX: <b style={{ color: item.adx >= 25 ? T.amber : T.text3 }}>{item.adx.toFixed(0)}</b></span>}
                        {item.stochK !== null && <span>Stoch: <b style={{ color: item.stochK > 80 ? T.red : item.stochK < 20 ? T.green : T.text2 }}>{item.stochK.toFixed(0)}</b></span>}
                        <span>ثقة: <b style={{ color: T.cyan }}>{item.confidence}%</b></span>
                      </div>

                      <button onClick={(e) => { e.stopPropagation(); setSelectedSymbol(item.symbol); }} style={{
                        marginTop: 8, padding: '4px 10px', background: `${T.cyan}08`, border: `0.5px solid ${T.cyan}20`,
                        borderRadius: 4, color: T.cyan, fontSize: 9, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4
                      }}><Sparkles size={10} /> تحليل AI عميق</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 4: MULTI-TIMEFRAME ═══ */}
        {activeTab === 'timeframes' && (
          <div style={{ padding: '20px', height: '100%', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock color={T.amber} size={14} /> تحليل متعدد الأطر الزمنية
                </h2>
                <p style={{ margin: 0, fontSize: 10, color: T.text3 }}>تحليل التوافق (Confluence) بين الأطر لاتخاذ قرار متوافق</p>
              </div>
              <select value={multiTfSymbol} onChange={e => setMultiTfSymbol(e.target.value)} style={{
                background: T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 4,
                color: T.text, fontSize: 10, padding: '4px 8px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {multiTfData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {multiTfData.timeframes.map((tf, idx) => {
                  const dirConf = getDirectionConfig(tf.direction)
                  const scoreColor = getScoreColor(tf.technicalScore)
                  return (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', background: T.bg2,
                      padding: '10px 14px', borderRadius: 8, border: `0.5px solid ${T.border}`,
                      animation: `fadeIn 0.3s ease ${idx * 0.08}s both`
                    }}>
                      <div style={{ width: 70, flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: dirConf.color, fontFamily: "'JetBrains Mono', monospace" }}>
                          {tf.timeframe === '15min' ? '15 دقيقة' : tf.timeframe === '1h' ? '1 ساعة' : tf.timeframe === '4h' ? '4 ساعات' : 'يومي'}
                        </div>
                      </div>

                      <div style={{ flex: 1, margin: '0 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: T.text, fontWeight: 700 }}>{dirConf.label}</span>
                          <span style={{ fontSize: 10, color: scoreColor, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                            {tf.technicalScore > 0 ? '+' : ''}{tf.technicalScore}
                          </span>
                        </div>
                        <div style={{ height: 5, background: T.bg, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.min(Math.abs(tf.technicalScore), 100)}%`,
                            background: `linear-gradient(90deg, ${scoreColor}80, ${scoreColor})`,
                            borderRadius: 3,
                            boxShadow: `0 0 8px ${scoreColor}30`
                          }} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 8, color: T.text3 }}>
                          {tf.rsi !== null && <span>RSI: {tf.rsi.toFixed(0)}</span>}
                          {tf.macdSignal && <span>MACD: {tf.macdSignal === 'BULLISH_CROSSOVER' ? '▲' : '▼'}</span>}
                          {tf.adx !== null && <span>ADX: {tf.adx.toFixed(0)}</span>}
                          <span>ثقة: {tf.confidence}%</span>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Alignment Verdict */}
                <div style={{
                  marginTop: 12, background: `linear-gradient(135deg, ${T.cyan}08, ${T.card})`,
                  border: `0.5px solid ${T.cyan}25`, borderRadius: 8, padding: '14px', textAlign: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                    <Brain size={16} color={T.cyan} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: T.cyan }}>القرار الاستراتيجي</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 10 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>التوافق</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: getScoreColor(multiTfData.alignmentScore), fontFamily: "'JetBrains Mono', monospace" }}>
                        {multiTfData.alignmentScore > 0 ? '+' : ''}{multiTfData.alignmentScore}
                      </div>
                    </div>
                    <div style={{ width: 1, background: T.border }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>الاتجاه</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: getDirectionConfig(multiTfData.alignment === 'STRONG_BULLISH' || multiTfData.alignment === 'BULLISH' ? 'BUY' : multiTfData.alignment === 'STRONG_BEARISH' || multiTfData.alignment === 'BEARISH' ? 'SELL' : 'NEUTRAL').color }}>
                        {multiTfData.alignment === 'STRONG_BULLISH' ? 'صعودي قوي' : multiTfData.alignment === 'BULLISH' ? 'صعودي' : multiTfData.alignment === 'BEARISH' ? 'هبوطي' : multiTfData.alignment === 'STRONG_BEARISH' ? 'هبوطي قوي' : 'مختلط'}
                      </div>
                    </div>
                    <div style={{ width: 1, background: T.border }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>الثقة</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: T.cyan, fontFamily: "'JetBrains Mono', monospace" }}>{multiTfData.confidence}%</div>
                    </div>
                  </div>
                  <p style={{ margin: 0, color: T.text2, fontSize: 11, lineHeight: 1.7, maxWidth: 550, marginInline: 'auto' }}>
                    {multiTfData.executionHintAr}
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: T.text3, fontSize: 10, padding: 40 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${T.cyan}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                جارٍ تحليل الأطر الزمنية...
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 5: OVERVIEW ═══ */}
        {activeTab === 'overview' && (
          <div style={{ padding: '20px', height: '100%', overflow: 'auto' }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <BarChart3 color={T.blue} size={14} /> نظرة عامة على السوق
            </h2>

            {scanData.length > 0 ? (
              <>
                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'إجمالي الممسوح', value: scanData.length.toString(), color: T.blue, icon: ScanSearch },
                    { label: 'صعودي', value: scanData.filter(d => d.direction === 'BUY' || d.direction === 'STRONG_BUY').length.toString(), color: T.green, icon: TrendingUp },
                    { label: 'هبوطي', value: scanData.filter(d => d.direction === 'SELL' || d.direction === 'STRONG_SELL').length.toString(), color: T.red, icon: TrendingDown },
                    { label: 'محايد', value: scanData.filter(d => d.direction === 'NEUTRAL').length.toString(), color: T.text3, icon: MinusCircle },
                  ].map((card, i) => (
                    <div key={i} style={{
                      background: T.bg2, borderRadius: 8, border: `0.5px solid ${T.border}`,
                      padding: '14px', animation: `fadeIn 0.3s ease ${i * 0.06}s both`
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <card.icon size={12} color={card.color} />
                        <span style={{ fontSize: 9, color: T.text3, fontWeight: 600 }}>{card.label}</span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: card.color, fontFamily: "'JetBrains Mono', monospace" }}>{card.value}</div>
                    </div>
                  ))}
                </div>

                {/* Market Sentiment */}
                <div style={{
                  background: T.bg2, borderRadius: 8, border: `0.5px solid ${T.border}`,
                  padding: '14px', marginBottom: 20
                }}>
                  <div style={{ fontSize: 10, color: T.text3, fontWeight: 700, marginBottom: 8 }}>مزاج السوق</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, height: 10, background: T.bg, borderRadius: 5, overflow: 'hidden', display: 'flex' }}>
                      {(() => {
                        const bullish = scanData.filter(d => d.direction === 'BUY' || d.direction === 'STRONG_BUY').length
                        const bearish = scanData.filter(d => d.direction === 'SELL' || d.direction === 'STRONG_SELL').length
                        const total = Math.max(scanData.length, 1)
                        return (
                          <>
                            <div style={{ width: `${(bullish/total)*100}%`, background: `linear-gradient(90deg, ${T.green}60, ${T.green})`, transition: 'width 0.5s' }} />
                            <div style={{ flex: 1 }} />
                            <div style={{ width: `${(bearish/total)*100}%`, background: `linear-gradient(90deg, ${T.red}, ${T.red}60)`, transition: 'width 0.5s' }} />
                          </>
                        )
                      })()}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                      {(() => {
                        const avg = scanData.reduce((s, d) => s + d.technicalScore, 0) / Math.max(scanData.length, 1)
                        return avg > 15 ? 'صعودي' : avg < -15 ? 'هبوطي' : 'محايد'
                      })()}
                    </span>
                  </div>
                </div>

                {/* Strongest Signals */}
                <div style={{ fontSize: 10, color: T.text3, fontWeight: 700, marginBottom: 8 }}>أقوى الإشارات</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {scanData
                    .filter(d => d.direction !== 'NEUTRAL' && d.confidence >= 50)
                    .slice(0, 6)
                    .map((item, i) => {
                      const dirConf = getDirectionConfig(item.direction)
                      return (
                        <div key={i} style={{
                          background: T.bg2, borderRadius: 6, border: `0.5px solid ${T.border}`,
                          padding: '10px', display: 'flex', alignItems: 'center', gap: 8,
                          cursor: 'pointer', transition: 'all 0.15s'
                        }}
                        onClick={() => setSelectedSymbol(item.symbol)}
                        onMouseEnter={e => e.currentTarget.style.borderColor = T.border2}
                        onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: 6, background: dirConf.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <dirConf.icon size={14} color={dirConf.color} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{item.symbol}</div>
                            <div style={{ display: 'flex', gap: 6, fontSize: 8, color: T.text3 }}>
                              <span>{dirConf.label}</span>
                              <span>ثقة: {item.confidence}%</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: dirConf.color, fontFamily: "'JetBrains Mono', monospace" }}>
                            {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                          </div>
                        </div>
                      )
                    })}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: T.text3, fontSize: 10, padding: 40 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${T.cyan}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                جارٍ تحميل البيانات...
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ DEEP ANALYSIS MODAL ═══ */}
      {selectedSymbol && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(4,5,12,0.85)', backdropFilter: 'blur(8px)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.2s ease'
        }}
        onClick={() => { setSelectedSymbol(null); setDeepAnalysis(null); }}
        >
          <div style={{
            width: '90%', maxWidth: 700, maxHeight: '85vh', background: T.card2,
            border: `0.5px solid ${T.border2}`, borderRadius: 12, overflow: 'hidden',
            display: 'flex', flexDirection: 'column', direction: 'rtl', fontFamily: "'Cairo', sans-serif"
          }}
          onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '14px 18px', borderBottom: `0.5px solid ${T.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: `linear-gradient(90deg, ${T.cyan}06, transparent)`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScanSearch size={14} color={T.cyan} />
                <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>تحليل عميق — {selectedSymbol}</span>
              </div>
              <button onClick={() => { setSelectedSymbol(null); setDeepAnalysis(null); }} style={{
                background: 'transparent', border: `0.5px solid ${T.border}`, borderRadius: 4,
                color: T.text3, cursor: 'pointer', width: 28, height: 28, display: 'flex',
                alignItems: 'center', justifyContent: 'center'
              }}><X size={14} /></button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
              {deepLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: T.text3, fontSize: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${T.cyan}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                  جارٍ التحليل العميق بالذكاء الاصطناعي...
                </div>
              ) : deepAnalysis ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Price & Signal */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
                        ${formatPrice(deepAnalysis.quote.price)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: deepAnalysis.quote.changePercent >= 0 ? T.green : T.red, fontFamily: "'JetBrains Mono', monospace" }}>
                        {deepAnalysis.quote.changePercent >= 0 ? '+' : ''}{deepAnalysis.quote.changePercent.toFixed(2)}%
                      </div>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      {(() => {
                        const dc = getDirectionConfig(deepAnalysis.signal.direction)
                        const cc = getClassConfig(deepAnalysis.signal.signalClass)
                        return (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: dc.bg, color: dc.color, border: `0.5px solid ${dc.color}30` }}>
                              {dc.label}
                            </span>
                            <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${cc.color}10`, color: cc.color }}>
                              {cc.label}
                            </span>
                          </div>
                        )
                      })()}
                      <div style={{ fontSize: 9, color: T.text3, marginTop: 4, textAlign: 'left' }}>
                        ثقة: <b style={{ color: T.cyan }}>{deepAnalysis.signal.confidence}%</b>
                        {deepAnalysis.signal.riskRewardRatio && <> | مخاطرة/عائد: <b style={{ color: T.amber }}>1:{deepAnalysis.signal.riskRewardRatio}</b></>}
                      </div>
                    </div>
                  </div>

                  {/* TP/SL */}
                  {deepAnalysis.signal.entryPrice && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <div style={{ background: T.bg2, borderRadius: 6, padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: T.text3, marginBottom: 2 }}>الدخول</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>${formatPrice(deepAnalysis.signal.entryPrice)}</div>
                      </div>
                      {deepAnalysis.signal.takeProfit && (
                        <div style={{ background: `${T.green}08`, borderRadius: 6, padding: '10px', textAlign: 'center', border: `0.5px solid ${T.green}20` }}>
                          <div style={{ fontSize: 8, color: T.green, marginBottom: 2 }}>جني الأرباح</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.green, fontFamily: "'JetBrains Mono', monospace" }}>${formatPrice(deepAnalysis.signal.takeProfit)}</div>
                        </div>
                      )}
                      {deepAnalysis.signal.stopLoss && (
                        <div style={{ background: `${T.red}08`, borderRadius: 6, padding: '10px', textAlign: 'center', border: `0.5px solid ${T.red}20` }}>
                          <div style={{ fontSize: 8, color: T.red, marginBottom: 2 }}>وقف الخسارة</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>${formatPrice(deepAnalysis.signal.stopLoss)}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Technical Indicators Grid */}
                  <div style={{ background: T.bg2, borderRadius: 8, padding: '12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Activity size={11} color={T.cyan} /> المؤشرات التقنية
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {[
                        { label: 'RSI', value: deepAnalysis.technical.rsi?.toFixed(1), color: deepAnalysis.technical.rsiInterpretation === 'OVERBOUGHT' ? T.red : deepAnalysis.technical.rsiInterpretation === 'OVERSOLD' ? T.green : T.text2 },
                        { label: 'MACD', value: deepAnalysis.technical.macdSignal === 'BULLISH_CROSSOVER' ? '▲ صعودي' : deepAnalysis.technical.macdSignal === 'BEARISH_CROSSOVER' ? '▼ هبوطي' : '—', color: deepAnalysis.technical.macdSignal === 'BULLISH_CROSSOVER' ? T.green : deepAnalysis.technical.macdSignal === 'BEARISH_CROSSOVER' ? T.red : T.text3 },
                        { label: 'Stoch %K/%D', value: deepAnalysis.technical.stochK !== null ? `${deepAnalysis.technical.stochK.toFixed(0)}/${deepAnalysis.technical.stochD?.toFixed(0)}` : '-', color: (deepAnalysis.technical.stochK ?? 50) > 80 ? T.red : (deepAnalysis.technical.stochK ?? 50) < 20 ? T.green : T.text2 },
                        { label: 'ADX', value: deepAnalysis.technical.adx?.toFixed(0), color: (deepAnalysis.technical.adx ?? 0) >= 25 ? T.amber : T.text3 },
                        { label: 'ATR', value: deepAnalysis.technical.atr?.toFixed(2), color: deepAnalysis.technical.atrVolatility === 'HIGH' ? T.red : deepAnalysis.technical.atrVolatility === 'LOW' ? T.green : T.text3 },
                        { label: 'VWAP', value: deepAnalysis.technical.vwapPosition === 'ABOVE' ? 'فوق' : deepAnalysis.technical.vwapPosition === 'BELOW' ? 'تحت' : 'عند', color: deepAnalysis.technical.vwapPosition === 'ABOVE' ? T.green : deepAnalysis.technical.vwapPosition === 'BELOW' ? T.red : T.text3 },
                        { label: 'بولنجر', value: deepAnalysis.technical.bollingerPosition === 'ABOVE_UPPER' ? 'فوق العلوي' : deepAnalysis.technical.bollingerPosition === 'BELOW_LOWER' ? 'تحت السفلي' : 'ضمن النطاق', color: deepAnalysis.technical.bollingerPosition === 'ABOVE_UPPER' ? T.red : deepAnalysis.technical.bollingerPosition === 'BELOW_LOWER' ? T.green : T.text3 },
                        { label: 'الدرجة الفنية', value: (deepAnalysis.technical.technicalScore > 0 ? '+' : '') + deepAnalysis.technical.technicalScore, color: getScoreColor(deepAnalysis.technical.technicalScore) },
                        { label: 'المخاطرة', value: deepAnalysis.riskLevel === 'HIGH' ? 'عالية' : deepAnalysis.riskLevel === 'MEDIUM' ? 'متوسطة' : 'منخفضة', color: deepAnalysis.riskLevel === 'HIGH' ? T.red : deepAnalysis.riskLevel === 'MEDIUM' ? T.amber : T.green },
                      ].map((ind, i) => (
                        <div key={i} style={{ background: T.bg, borderRadius: 4, padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 8, color: T.text3, fontWeight: 600 }}>{ind.label}</span>
                          <span style={{ fontSize: 9, color: ind.color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{ind.value || '-'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Patterns */}
                  {deepAnalysis.patterns.length > 0 && (
                    <div style={{ background: T.bg2, borderRadius: 8, padding: '12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Brain size={11} color={T.purple} /> الأنماط المكتشفة
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {deepAnalysis.patterns.map((p, i) => (
                          <div key={i} style={{ background: T.bg, borderRadius: 6, padding: '8px 10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: p.type === 'BULLISH' ? T.green : p.type === 'BEARISH' ? T.red : T.text2 }}>{p.nameAr}</span>
                              <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: `${p.type === 'BULLISH' ? T.green : p.type === 'BEARISH' ? T.red : T.text3}10`, color: p.type === 'BULLISH' ? T.green : p.type === 'BEARISH' ? T.red : T.text3, fontWeight: 700 }}>
                                ثقة: {p.confidence}%
                              </span>
                            </div>
                            <div style={{ fontSize: 9, color: T.text3, lineHeight: 1.5 }}>{p.descriptionAr}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Support/Resistance */}
                  {deepAnalysis.supportResistance.length > 0 && (
                    <div style={{ background: T.bg2, borderRadius: 8, padding: '12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Shield size={11} color={T.amber} /> الدعم والمقاومة
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {deepAnalysis.supportResistance.map((level, i) => (
                          <span key={i} style={{
                            padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                            fontFamily: "'JetBrains Mono', monospace",
                            background: level.type === 'SUPPORT' ? `${T.green}08` : `${T.red}08`,
                            color: level.type === 'SUPPORT' ? T.green : T.red,
                            border: `0.5px solid ${level.type === 'SUPPORT' ? T.green : T.red}20`
                          }}>
                            {level.type === 'SUPPORT' ? 'S' : 'R'} ${formatPrice(level.price)}
                            <span style={{ fontSize: 7, marginRight: 2, opacity: 0.7 }}>×{level.touches}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Analysis */}
                  {deepAnalysis.aiAnalysis && (
                    <div style={{ background: `linear-gradient(135deg, ${T.purple}08, ${T.bg2})`, borderRadius: 8, padding: '12px', border: `0.5px solid ${T.purple}20` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.purple, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Sparkles size={11} color={T.purple} /> تحليل الذكاء الاصطناعي
                        {deepAnalysis.aiModel && <span style={{ fontSize: 8, color: T.text3, fontWeight: 500 }}>({deepAnalysis.aiModel})</span>}
                      </div>
                      <div style={{ fontSize: 10, color: T.text2, lineHeight: 1.8 }}>{deepAnalysis.aiAnalysis}</div>
                    </div>
                  )}

                  {/* Reasons */}
                  {deepAnalysis.signal.reasonsAr.length > 0 && (
                    <div style={{ background: T.bg2, borderRadius: 8, padding: '12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.text, marginBottom: 8 }}>الأسباب والمبررات</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {deepAnalysis.signal.reasonsAr.map((reason, i) => (
                          <span key={i} style={{
                            padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                            background: `${T.blue}08`, color: T.text2, border: `0.5px solid ${T.border}`
                          }}>{reason}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: T.text3, fontSize: 10 }}>
                  تعذر تحميل بيانات التحليل
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
