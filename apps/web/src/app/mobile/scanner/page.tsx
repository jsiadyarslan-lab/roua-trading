'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal, RotateCcw, Radar, TrendingUp, TrendingDown, Zap, Loader2 } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   ROUA MOBILE — Market Scanner
   Full-featured scanner with filters, AI signals & quick scan
   ═══════════════════════════════════════════════════════════════ */

// ── Types ──
interface ScannerSignal {
  id: string
  symbol: string
  base: string
  signalType: 'buy' | 'sell'
  confidence: number
  price: number
  changePercent: number
  aiModel: string
  timeframe: string
  assetClass: string
  timestamp: Date
}

// ── Constants ──
const AI_MODELS = ['GPT-4o', 'Claude-3.5', 'Gemini Pro', 'Llama 3', 'Mistral Large', 'Command R+']
const TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D']
const ASSET_CLASSES = [
  { key: 'crypto', label: 'كريبتو' },
  { key: 'forex', label: 'فوركس' },
  { key: 'commodities', label: 'سلع' },
]
const SIGNAL_TYPES = [
  { key: 'all', label: 'الكل' },
  { key: 'buy', label: 'شراء' },
  { key: 'sell', label: 'بيع' },
]
const CONFIDENCE_LEVELS = [
  { key: 0, label: 'الكل' },
  { key: 70, label: '>70%' },
  { key: 80, label: '>80%' },
  { key: 90, label: '>90%' },
]
const SORT_OPTIONS = [
  { key: 'date', label: 'التاريخ' },
  { key: 'confidence', label: 'الثقة' },
  { key: 'change', label: 'التغير%' },
  { key: 'volume', label: 'الحجم' },
]

const SYMBOL_COLORS: Record<string, string> = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF', XRP: '#23292F',
  BNB: '#F3BA2F', ADA: '#0033AD', DOGE: '#C2A633', AVAX: '#E84142',
  DOT: '#E6007A', LINK: '#375BD2', MATIC: '#8247E5',
  EUR: '#003399', GBP: '#C8102E', JPY: '#BC002D',
  AUD: '#00008B', CHF: '#D52B1E', CAD: '#FF0000',
  XAU: '#d4af37', XAG: '#C0C0C0', OIL: '#2E8B57',
}

const SYMBOL_BY_CLASS: Record<string, string[]> = {
  crypto: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'ADA/USD', 'DOGE/USD', 'AVAX/USD', 'DOT/USD', 'LINK/USD'],
  forex: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD'],
  commodities: ['XAU/USD', 'XAG/USD', 'OIL/USD'],
}

// ── Mock Data Generator ──
function generateScannerSignals(): ScannerSignal[] {
  const allSymbols = Object.entries(SYMBOL_BY_CLASS).flatMap(([cls, syms]) =>
    syms.map(sym => ({ symbol: sym, assetClass: cls }))
  )
  const count = 15 + Math.floor(Math.random() * 11) // 15-25
  const now = Date.now()
  const signals: ScannerSignal[] = []

  // Use a set to avoid duplicate symbols
  const usedIndices = new Set<number>()
  for (let i = 0; i < Math.min(count, allSymbols.length); i++) {
    let idx: number
    do {
      idx = Math.floor(Math.random() * allSymbols.length)
    } while (usedIndices.has(idx))
    usedIndices.add(idx)

    const { symbol, assetClass } = allSymbols[idx]
    const base = symbol.split('/')[0]
    const signalType = Math.random() > 0.45 ? 'buy' : 'sell' as const
    const confidence = 65 + Math.floor(Math.random() * 34) // 65-98
    const changePercent = (Math.random() - 0.4) * 8 // slight buy bias
    const timeframe = TIMEFRAMES[Math.floor(Math.random() * TIMEFRAMES.length)]
    const aiModel = AI_MODELS[Math.floor(Math.random() * AI_MODELS.length)]
    const timestamp = new Date(now - Math.floor(Math.random() * 4 * 60 * 60 * 1000)) // last 4 hours

    // Default prices based on symbol
    const defaultPrices: Record<string, number> = {
      'BTC/USD': 67450, 'ETH/USD': 3520, 'SOL/USD': 178, 'XRP/USD': 0.62,
      'BNB/USD': 610, 'ADA/USD': 0.48, 'DOGE/USD': 0.165, 'AVAX/USD': 38.5,
      'DOT/USD': 7.85, 'LINK/USD': 18.4, 'EUR/USD': 1.0856, 'GBP/USD': 1.2720,
      'USD/JPY': 149.35, 'AUD/USD': 0.6545, 'USD/CHF': 0.8820, 'USD/CAD': 1.3575,
      'XAU/USD': 2345, 'XAG/USD': 29.85, 'OIL/USD': 78.50,
    }

    signals.push({
      id: `sig-${i}-${Date.now()}`,
      symbol,
      base,
      signalType,
      confidence,
      price: defaultPrices[symbol] ?? 100,
      changePercent: Math.round(changePercent * 100) / 100,
      aiModel,
      timeframe,
      assetClass,
      timestamp,
    })
  }

  return signals
}

// ── Circular Progress Indicator (SVG) ──
function ConfidenceRing({ value, size = 40, strokeWidth = 3.5 }: {
  value: number
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const color = value >= 90 ? '#00FFA3' : value >= 80 ? '#00D4FF' : value >= 70 ? '#FFB800' : '#FF4757'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s var(--ease-out)' }}
      />
    </svg>
  )
}

// ── Format helpers ──
function formatPrice(price: number): string {
  if (price > 100) return price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return price.toFixed(price < 10 ? 4 : 2)
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `${minutes}د`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}س`
  return `${Math.floor(hours / 24)}ي`
}

// ── Pill Button ──
function PillButton({ label, active, onClick, activeColor }: {
  label: string
  active: boolean
  onClick: () => void
  activeColor?: string
}) {
  const baseColor = activeColor || 'var(--c-accent)'
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-sm)',
        fontFamily: 'var(--font-cairo)',
        fontWeight: active ? 800 : 500,
        color: active ? baseColor : 'rgba(255,255,255,0.4)',
        background: active ? `${baseColor}18` : 'rgba(255,255,255,0.03)',
        border: active ? `0.5px solid ${baseColor}30` : '0.5px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        transition: 'all var(--duration-fast) var(--ease-out)',
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
    >
      {label}
    </button>
  )
}

// ── Main Page Component ──
export default function MobileScannerPage() {
  const router = useRouter()
  const quotes = useMarketStore(s => s.quotes)
  const [signals, setSignals] = useState<ScannerSignal[]>(() => generateScannerSignals())
  const [showFilters, setShowFilters] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [signalType, setSignalType] = useState('all')
  const [confidenceMin, setConfidenceMin] = useState(0)
  const [timeframe, setTimeframe] = useState<string | null>(null)
  const [assetClass, setAssetClass] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('date')
  const listRef = useRef<HTMLDivElement>(null)

  // Merge live market data into signals
  const enrichedSignals = useMemo(() => {
    return signals.map(sig => {
      const q = quotes[sig.symbol]
      if (q) {
        return {
          ...sig,
          price: q.price,
          changePercent: q.changePercent,
        }
      }
      return sig
    })
  }, [signals, quotes])

  // Apply filters
  const filteredSignals = useMemo(() => {
    let result = enrichedSignals

    // Signal type filter
    if (signalType !== 'all') {
      result = result.filter(s => s.signalType === signalType)
    }

    // Confidence filter
    if (confidenceMin > 0) {
      result = result.filter(s => s.confidence >= confidenceMin)
    }

    // Timeframe filter
    if (timeframe) {
      result = result.filter(s => s.timeframe === timeframe)
    }

    // Asset class filter
    if (assetClass) {
      result = result.filter(s => s.assetClass === assetClass)
    }

    // Sort
    const sorted = [...result]
    switch (sortBy) {
      case 'confidence':
        sorted.sort((a, b) => b.confidence - a.confidence)
        break
      case 'change':
        sorted.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        break
      case 'volume':
        // Approximate by price as volume proxy for mock
        sorted.sort((a, b) => b.price - a.price)
        break
      case 'date':
      default:
        sorted.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        break
    }

    return sorted
  }, [enrichedSignals, signalType, confidenceMin, timeframe, assetClass, sortBy])

  // Reset filters
  const resetFilters = useCallback(() => {
    setSignalType('all')
    setConfidenceMin(0)
    setTimeframe(null)
    setAssetClass(null)
    setSortBy('date')
  }, [])

  // Quick scan
  const handleQuickScan = useCallback(() => {
    setIsScanning(true)
    setTimeout(() => {
      setSignals(generateScannerSignals())
      setIsScanning(false)
    }, 1500)
  }, [])

  // Stagger animation on new signals
  useEffect(() => {
    if (listRef.current) {
      const cards = listRef.current.querySelectorAll('.scanner-card')
      cards.forEach((card, i) => {
        (card as HTMLElement).style.animationDelay = `${i * 40}ms`
      })
    }
  }, [filteredSignals])

  const hasActiveFilters = signalType !== 'all' || confidenceMin > 0 || timeframe !== null || assetClass !== null

  return (
    <div className="r-page">
      {/* ── Header ── */}
      <PageHeader
        title="سكانر السوق"
        subtitle={`${filteredSignals.length} نتيجة`}
        right={
          <button
            onClick={() => setShowFilters(v => !v)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm)',
              background: showFilters ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)',
              border: showFilters ? '0.5px solid rgba(0,212,255,0.2)' : '0.5px solid var(--c-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all var(--duration-fast) var(--ease-out)',
              position: 'relative',
            }}
            aria-label="فلاتر"
          >
            <SlidersHorizontal size={16} color={showFilters ? '#00D4FF' : 'rgba(255,255,255,0.6)'} />
            {hasActiveFilters && (
              <div style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#00D4FF',
                boxShadow: '0 0 6px rgba(0,212,255,0.6)',
              }} />
            )}
          </button>
        }
      />

      {/* ── Filter Panel (Collapsible) ── */}
      {showFilters && (
        <div style={{
          margin: '0 var(--space-lg) var(--space-md)',
          padding: 'var(--space-md)',
          background: 'rgba(26,29,41,0.75)',
          backdropFilter: 'var(--blur-card)',
          WebkitBackdropFilter: 'var(--blur-card)',
          borderRadius: 'var(--radius-lg)',
          border: '0.5px solid var(--c-border)',
          animation: 'r-fade-up var(--duration-normal) var(--ease-out) both',
        }}>
          {/* Signal Type */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--c-text2)', fontFamily: 'var(--font-cairo)', marginBottom: 6, direction: 'rtl' }}>نوع الإشارة</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SIGNAL_TYPES.map(st => (
                <PillButton
                  key={st.key}
                  label={st.label}
                  active={signalType === st.key}
                  onClick={() => setSignalType(st.key)}
                  activeColor={st.key === 'buy' ? '#00FFA3' : st.key === 'sell' ? '#FF4757' : '#00D4FF'}
                />
              ))}
            </div>
          </div>

          {/* Confidence */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--c-text2)', fontFamily: 'var(--font-cairo)', marginBottom: 6, direction: 'rtl' }}>مستوى الثقة</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CONFIDENCE_LEVELS.map(cl => (
                <PillButton
                  key={cl.key}
                  label={cl.label}
                  active={confidenceMin === cl.key}
                  onClick={() => setConfidenceMin(cl.key)}
                  activeColor="#FFB800"
                />
              ))}
            </div>
          </div>

          {/* Timeframe */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--c-text2)', fontFamily: 'var(--font-cairo)', marginBottom: 6, direction: 'rtl' }}>الإطار الزمني</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <PillButton label="الكل" active={timeframe === null} onClick={() => setTimeframe(null)} />
              {TIMEFRAMES.map(tf => (
                <PillButton
                  key={tf}
                  label={tf}
                  active={timeframe === tf}
                  onClick={() => setTimeframe(tf)}
                  activeColor="#B388FF"
                />
              ))}
            </div>
          </div>

          {/* Asset Class */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--c-text2)', fontFamily: 'var(--font-cairo)', marginBottom: 6, direction: 'rtl' }}>فئة الأصول</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <PillButton label="الكل" active={assetClass === null} onClick={() => setAssetClass(null)} />
              {ASSET_CLASSES.map(ac => (
                <PillButton
                  key={ac.key}
                  label={ac.label}
                  active={assetClass === ac.key}
                  onClick={() => setAssetClass(ac.key)}
                  activeColor="#FF9F43"
                />
              ))}
            </div>
          </div>

          {/* Sort By */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--c-text2)', fontFamily: 'var(--font-cairo)', marginBottom: 6, direction: 'rtl' }}>ترتيب حسب</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SORT_OPTIONS.map(so => (
                <PillButton
                  key={so.key}
                  label={so.label}
                  active={sortBy === so.key}
                  onClick={() => setSortBy(so.key)}
                />
              ))}
            </div>
          </div>

          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                padding: '8px 0',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.06)',
                color: 'var(--c-text2)',
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-cairo)',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all var(--duration-fast) var(--ease-out)',
              }}
            >
              <RotateCcw size={12} />
              إعادة تعيين الفلاتر
            </button>
          )}
        </div>
      )}

      {/* ── Signal Cards ── */}
      <div ref={listRef}>
        {filteredSignals.map((sig) => {
          const isBuy = sig.signalType === 'buy'
          const signalColor = isBuy ? '#00FFA3' : '#FF4757'
          const isUp = sig.changePercent >= 0
          const changeColor = isUp ? '#32D74B' : '#FF453A'
          const iconColor = SYMBOL_COLORS[sig.base] || '#627EEA'

          return (
            <Card
              key={sig.id}
              onClick={() => router.push(`/mobile/chart?symbol=${sig.symbol}`)}
            >
              <div
                className="scanner-card r-anim-fade-up"
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                {/* Symbol icon */}
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: `${iconColor}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 900,
                  color: iconColor,
                  fontFamily: 'var(--font-mono)',
                  border: `0.5px solid ${iconColor}30`,
                  flexShrink: 0,
                  direction: 'ltr',
                }}>
                  {sig.base.slice(0, 2)}
                </div>

                {/* Symbol info */}
                <div style={{ flex: '1 1 0', minWidth: 0, direction: 'rtl' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)', direction: 'ltr' }}>{sig.symbol}</span>
                    {/* Signal type badge */}
                    <span style={{
                      padding: '1px 7px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 900,
                      fontFamily: 'var(--font-cairo)',
                      color: signalColor,
                      background: `${signalColor}15`,
                      border: `0.5px solid ${signalColor}25`,
                      lineHeight: 1.6,
                    }}>
                      {isBuy ? 'شراء' : 'بيع'}
                    </span>
                  </div>

                  {/* AI Model & Time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'rtl' }}>
                    <span style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      color: '#B388FF',
                      fontFamily: 'var(--font-mono)',
                      direction: 'ltr',
                      background: 'rgba(179,136,255,0.08)',
                      padding: '1px 5px',
                      borderRadius: 4,
                      border: '0.5px solid rgba(179,136,255,0.15)',
                    }}>
                      {sig.aiModel}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--c-text2)', fontFamily: 'var(--font-cairo)' }}>
                      · {timeAgo(sig.timestamp)}
                    </span>
                  </div>
                </div>

                {/* Confidence Ring */}
                <div style={{ position: 'relative', flexShrink: 0, width: 40, height: 40 }}>
                  <ConfidenceRing value={sig.confidence} />
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 900,
                    fontFamily: 'var(--font-mono)',
                    color: sig.confidence >= 90 ? '#00FFA3' : sig.confidence >= 80 ? '#00D4FF' : sig.confidence >= 70 ? '#FFB800' : '#FF4757',
                    direction: 'ltr',
                  }}>
                    {sig.confidence}%
                  </div>
                </div>

                {/* Price & Change */}
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 72, direction: 'ltr' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
                    {formatPrice(sig.price)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: changeColor, fontFamily: 'var(--font-mono)' }}>
                      {isUp ? '+' : ''}{sig.changePercent.toFixed(2)}%
                    </span>
                    {isUp ? <TrendingUp size={10} color={changeColor} /> : <TrendingDown size={10} color={changeColor} />}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* ── Empty State ── */}
      {filteredSignals.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          direction: 'rtl',
        }}>
          <Radar size={32} color="#8B92A8" style={{ margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text2)', fontFamily: 'var(--font-cairo)' }}>
            لا توجد إشارات مطابقة
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-text3)', fontFamily: 'var(--font-cairo)', marginTop: 4 }}>
            جرّب تعديل الفلاتر أو المسح السريع
          </div>
        </div>
      )}

      {/* Spacer for floating button */}
      <div style={{ height: 80 }} />

      {/* ── Quick Scan Floating Button ── */}
      <div style={{
        position: 'fixed',
        bottom: 'calc(var(--safe-bottom) + 20px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-overlay)',
      }}>
        <button
          onClick={handleQuickScan}
          disabled={isScanning}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '12px 28px',
            borderRadius: 'var(--radius-full)',
            background: isScanning
              ? 'linear-gradient(135deg, rgba(0,212,255,0.3), rgba(0,212,255,0.15))'
              : 'linear-gradient(135deg, #00D4FF, #0099CC)',
            border: isScanning
              ? '0.5px solid rgba(0,212,255,0.2)'
              : '0.5px solid rgba(0,212,255,0.4)',
            color: '#FFF',
            fontSize: 14,
            fontWeight: 900,
            fontFamily: 'var(--font-cairo)',
            cursor: isScanning ? 'not-allowed' : 'pointer',
            boxShadow: isScanning
              ? '0 4px 20px rgba(0,212,255,0.15)'
              : '0 4px 20px rgba(0,212,255,0.35), 0 0 40px rgba(0,212,255,0.1)',
            transition: 'all var(--duration-normal) var(--ease-out)',
            animation: isScanning ? 'r-glow-pulse 1.5s ease-in-out infinite' : 'none',
            minWidth: 160,
          }}
        >
          {isScanning ? (
            <>
              <Loader2 size={16} className="r-anim-spin" />
              <span>جارٍ المسح...</span>
            </>
          ) : (
            <>
              <Zap size={16} />
              <span>مسح سريع</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
