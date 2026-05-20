'use client'

import { useState, useMemo } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useRouter } from 'next/navigation'
import { RefreshCw, TrendingUp, TrendingDown, Minus, Zap, Shield, Brain } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   ROUA MOBILE — AI Trading Signals Dashboard
   Full signal cards with confidence bars, R:R ratios, and filters
   ═══════════════════════════════════════════════════════════════ */

// ── Types ──
type SignalType = 'strong_buy' | 'buy' | 'sell' | 'strong_sell' | 'hold'
type SignalStatus = 'active' | 'completed' | 'cancelled'
type FilterTab = 'all' | 'buy' | 'sell' | 'hold'

interface TradingSignal {
  id: string
  symbol: string
  type: SignalType
  entry: number
  tp: number
  sl: number
  rrRatio: string
  confidence: number
  model: string
  timeAgo: string
  status: SignalStatus
}

// ── Constants ──
const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'buy', label: 'شراء' },
  { key: 'sell', label: 'بيع' },
  { key: 'hold', label: 'انتظار' },
]

const SYMBOL_COLORS: Record<string, string> = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF', XRP: '#23292F',
  BNB: '#F3BA2F', ADA: '#0033AD', DOGE: '#C2A633', AVAX: '#E84142',
  DOT: '#E6007A', LINK: '#2A5ADA', EUR: '#003399', GBP: '#C8102E',
  JPY: '#BC002D', AUD: '#00008B', XAU: '#d4af37',
}

const SIGNAL_LABELS: Record<SignalType, string> = {
  strong_buy: 'شراء قوي',
  buy: 'شراء',
  sell: 'بيع',
  strong_sell: 'بيع قوي',
  hold: 'انتظار',
}

const STATUS_LABELS: Record<SignalStatus, string> = {
  active: 'نشط',
  completed: 'مكتمل',
  cancelled: 'ملغي',
}

const AI_MODELS = [
  'Roua Momentum v3',
  'Roua TrendPro',
  'Roua Neural X',
  'Roua Sentiment AI',
  'Roua Pattern Scout',
]

// ── Helper: get signal type color ──
function getSignalColor(type: SignalType): string {
  switch (type) {
    case 'strong_buy': return '#00FFA3'
    case 'buy': return '#10B981'
    case 'sell': return '#FF4757'
    case 'strong_sell': return '#EF4444'
    case 'hold': return '#FFB800'
  }
}

// ── Helper: get confidence bar color ──
function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return '#00FFA3'
  if (confidence >= 60) return '#00D4FF'
  if (confidence >= 40) return '#FFB800'
  return '#FF4757'
}

// ── Helper: format price ──
function formatPrice(price: number): string {
  if (price > 1000) return price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price > 100) return price.toFixed(2)
  return price.toFixed(price < 10 ? 4 : 2)
}

// ── Helper: get status style ──
function getStatusStyle(status: SignalStatus) {
  switch (status) {
    case 'active': return { bg: 'rgba(0,212,255,0.12)', color: '#00D4FF', border: 'rgba(0,212,255,0.25)' }
    case 'completed': return { bg: 'rgba(0,255,163,0.12)', color: '#00FFA3', border: 'rgba(0,255,163,0.25)' }
    case 'cancelled': return { bg: 'rgba(255,71,87,0.12)', color: '#FF4757', border: 'rgba(255,71,87,0.25)' }
  }
}

// ── Helper: check if signal type matches filter ──
function matchesFilter(type: SignalType, filter: FilterTab): boolean {
  if (filter === 'all') return true
  if (filter === 'buy') return type === 'strong_buy' || type === 'buy'
  if (filter === 'sell') return type === 'sell' || type === 'strong_sell'
  if (filter === 'hold') return type === 'hold'
  return true
}

// ── Helper: get signal icon ──
function SignalIcon({ type, size = 14 }: { type: SignalType; size?: number }) {
  const color = getSignalColor(type)
  switch (type) {
    case 'strong_buy': return <TrendingUp size={size} color={color} />
    case 'buy': return <TrendingUp size={size} color={color} />
    case 'sell': return <TrendingDown size={size} color={color} />
    case 'strong_sell': return <TrendingDown size={size} color={color} />
    case 'hold': return <Minus size={size} color={color} />
  }
}

// ── Generate Mock Signals ──
function generateSignals(quotes: Record<string, any>): TradingSignal[] {
  const signalDefs: { symbol: string; type: SignalType; entry: number; status: SignalStatus }[] = [
    { symbol: 'BTC/USD', type: 'strong_buy', entry: 68250, status: 'active' },
    { symbol: 'ETH/USD', type: 'buy', entry: 3520, status: 'active' },
    { symbol: 'SOL/USD', type: 'strong_buy', entry: 178.5, status: 'active' },
    { symbol: 'XRP/USD', type: 'sell', entry: 0.6280, status: 'active' },
    { symbol: 'BNB/USD', type: 'buy', entry: 598, status: 'active' },
    { symbol: 'ADA/USD', type: 'hold', entry: 0.4520, status: 'active' },
    { symbol: 'DOGE/USD', type: 'strong_sell', entry: 0.1580, status: 'active' },
    { symbol: 'XAU/USD', type: 'buy', entry: 2340, status: 'active' },
    { symbol: 'EUR/USD', type: 'hold', entry: 1.0845, status: 'active' },
    { symbol: 'GBP/USD', type: 'buy', entry: 1.2720, status: 'completed' },
    { symbol: 'BTC/USD', type: 'sell', entry: 67500, status: 'completed' },
    { symbol: 'ETH/USD', type: 'strong_buy', entry: 3450, status: 'completed' },
    { symbol: 'SOL/USD', type: 'buy', entry: 172, status: 'completed' },
    { symbol: 'AVAX/USD', type: 'sell', entry: 38.5, status: 'cancelled' },
    { symbol: 'DOT/USD', type: 'hold', entry: 7.25, status: 'cancelled' },
  ]

  // Use live prices from market store if available
  const timeAgos = [
    'منذ 5 د', 'منذ 12 د', 'منذ 25 د', 'منذ 38 د', 'منذ 1 س',
    'منذ 1.5 س', 'منذ 2 س', 'منذ 3 س', 'منذ 4 س', 'منذ 5 س',
    'منذ 6 س', 'منذ 8 س', 'منذ 10 س', 'منذ 14 س', 'منذ 18 س',
  ]

  return signalDefs.map((def, i) => {
    // Use live price if available, otherwise use mock entry
    const quote = quotes[def.symbol]
    const livePrice = quote?.price ?? def.entry
    const entry = livePrice

    // Calculate TP/SL based on signal type
    let tp: number, sl: number
    const isBuy = def.type === 'strong_buy' || def.type === 'buy'
    const isSell = def.type === 'strong_sell' || def.type === 'sell'

    if (isBuy) {
      const tpPercent = 2 + Math.random() * 3 // 2-5%
      const slPercent = 1 + Math.random() * 2 // 1-3%
      tp = entry * (1 + tpPercent / 100)
      sl = entry * (1 - slPercent / 100)
    } else if (isSell) {
      const tpPercent = 2 + Math.random() * 3
      const slPercent = 1 + Math.random() * 2
      tp = entry * (1 - tpPercent / 100)
      sl = entry * (1 + slPercent / 100)
    } else {
      // Hold — still provide hypothetical levels
      tp = entry * (1 + (1.5 + Math.random() * 1.5) / 100)
      sl = entry * (1 - (1 + Math.random()) / 100)
    }

    const rrRaw = Math.abs(tp - entry) / Math.abs(sl - entry)
    const rrDisplay = `1:${rrRaw.toFixed(1)}`

    const confidence = isBuy || isSell
      ? Math.round(55 + Math.random() * 40) // 55-95%
      : Math.round(40 + Math.random() * 25) // 40-65%

    return {
      id: `sig-${i + 1}`,
      symbol: def.symbol,
      type: def.type,
      entry,
      tp,
      sl,
      rrRatio: rrDisplay,
      confidence,
      model: AI_MODELS[i % AI_MODELS.length],
      timeAgo: timeAgos[i],
      status: def.status,
    }
  })
}

// ── Signal Card Component ──
function SignalCard({ signal, onClick }: { signal: TradingSignal; onClick: () => void }) {
  const base = signal.symbol.split('/')[0]
  const iconColor = SYMBOL_COLORS[base] || '#627EEA'
  const signalColor = getSignalColor(signal.type)
  const confColor = getConfidenceColor(signal.confidence)
  const statusStyle = getStatusStyle(signal.status)
  const isBuy = signal.type === 'strong_buy' || signal.type === 'buy'
  const isSell = signal.type === 'strong_sell' || signal.type === 'sell'

  return (
    <Card onClick={onClick}>
      {/* Top row: Symbol + Signal Type + Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Symbol icon */}
          <div style={{
            width: 36,
            height: 36,
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
            {base.slice(0, 2)}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)', direction: 'ltr' }}>
              {signal.symbol}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <SignalIcon type={signal.type} size={12} />
              <span style={{
                fontSize: 11,
                fontWeight: 800,
                color: signalColor,
                fontFamily: 'var(--font-cairo)',
              }}>
                {SIGNAL_LABELS[signal.type]}
              </span>
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div style={{
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: 10,
          fontWeight: 800,
          fontFamily: 'var(--font-cairo)',
          color: statusStyle.color,
          background: statusStyle.bg,
          border: `0.5px solid ${statusStyle.border}`,
        }}>
          {STATUS_LABELS[signal.status]}
        </div>
      </div>

      {/* Price levels */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 6,
        marginBottom: 10,
      }}>
        {/* Entry */}
        <div style={{
          padding: '6px 8px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
          border: '0.5px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>الدخول</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)', direction: 'ltr' }}>
            {formatPrice(signal.entry)}
          </div>
        </div>
        {/* TP */}
        <div style={{
          padding: '6px 8px',
          borderRadius: 8,
          background: isBuy ? 'rgba(0,255,163,0.06)' : 'rgba(255,71,87,0.06)',
          border: isBuy ? '0.5px solid rgba(0,255,163,0.12)' : '0.5px solid rgba(255,71,87,0.12)',
        }}>
          <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>الهدف</div>
          <div style={{
            fontSize: 12,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            direction: 'ltr',
            color: isBuy ? '#00FFA3' : '#FF4757',
          }}>
            {formatPrice(signal.tp)}
          </div>
        </div>
        {/* SL */}
        <div style={{
          padding: '6px 8px',
          borderRadius: 8,
          background: isBuy ? 'rgba(255,71,87,0.06)' : 'rgba(0,255,163,0.06)',
          border: isBuy ? '0.5px solid rgba(255,71,87,0.12)' : '0.5px solid rgba(0,255,163,0.12)',
        }}>
          <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>الوقف</div>
          <div style={{
            fontSize: 12,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            direction: 'ltr',
            color: isBuy ? '#FF4757' : '#00FFA3',
          }}>
            {formatPrice(signal.sl)}
          </div>
        </div>
      </div>

      {/* Risk/Reward + Confidence */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {/* R:R ratio */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Shield size={11} color="#B388FF" />
          <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>المخاطرة</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: '#B388FF', fontFamily: 'var(--font-mono)', direction: 'ltr' }}>
            {signal.rrRatio}
          </span>
        </div>

        {/* Confidence bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, maxWidth: 160 }}>
          <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', whiteSpace: 'nowrap' }}>الثقة</span>
          <div style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{
              width: `${signal.confidence}%`,
              height: '100%',
              borderRadius: 3,
              background: confColor,
              transition: 'width 0.4s ease',
              boxShadow: `0 0 8px ${confColor}40`,
            }} />
          </div>
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: confColor,
            direction: 'ltr',
            minWidth: 32,
            textAlign: 'right',
          }}>
            {signal.confidence}%
          </span>
        </div>
      </div>

      {/* Model + Time */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingTop: 8,
        borderTop: '0.5px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Brain size={10} color="#8B92A8" />
          <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>{signal.model}</span>
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-cairo)' }}>{signal.timeAgo}</span>
      </div>
    </Card>
  )
}

// ── Main Page Component ──
export default function MobileSignalsPage() {
  const quotes = useMarketStore(s => s.quotes)
  const router = useRouter()
  const [filter, setFilter] = useState<FilterTab>('all')
  const [refreshKey, setRefreshKey] = useState(0)

  const signals = useMemo(() => generateSignals(quotes), [quotes, refreshKey])

  const filteredSignals = useMemo(() =>
    signals.filter(s => matchesFilter(s.type, filter)),
    [signals, filter]
  )

  // Stats
  const activeCount = signals.filter(s => s.status === 'active').length
  const buyCount = signals.filter(s => s.type === 'strong_buy' || s.type === 'buy').length
  const sellCount = signals.filter(s => s.type === 'strong_sell' || s.type === 'sell').length

  return (
    <div className="r-page">
      <PageHeader
        title="التوصيات"
        subtitle={`${activeCount} نشط`}
        right={
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(0,212,255,0.08)',
              border: '0.5px solid rgba(0,212,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            aria-label="تحديث"
          >
            <RefreshCw size={16} color="#00D4FF" />
          </button>
        }
      />

      {/* Summary stats */}
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '0 var(--space-lg)',
        marginBottom: 10,
      }}>
        <div style={{
          flex: 1,
          padding: '8px 10px',
          borderRadius: 10,
          background: 'rgba(0,255,163,0.06)',
          border: '0.5px solid rgba(0,255,163,0.12)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#00FFA3', fontFamily: 'var(--font-mono)' }}>{buyCount}</div>
          <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>شراء</div>
        </div>
        <div style={{
          flex: 1,
          padding: '8px 10px',
          borderRadius: 10,
          background: 'rgba(255,71,87,0.06)',
          border: '0.5px solid rgba(255,71,87,0.12)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#FF4757', fontFamily: 'var(--font-mono)' }}>{sellCount}</div>
          <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>بيع</div>
        </div>
        <div style={{
          flex: 1,
          padding: '8px 10px',
          borderRadius: 10,
          background: 'rgba(0,212,255,0.06)',
          border: '0.5px solid rgba(0,212,255,0.12)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#00D4FF', fontFamily: 'var(--font-mono)' }}>{signals.length}</div>
          <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>إجمالي</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="r-tabs">
        {FILTER_TABS.map(t => (
          <button
            key={t.key}
            className={`r-tabs__item ${filter === t.key ? 'r-tabs__item--active' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Signal Cards */}
      <div style={{ marginTop: 4 }}>
        {filteredSignals.map(signal => (
          <SignalCard
            key={signal.id}
            signal={signal}
            onClick={() => router.push(`/mobile/chart?symbol=${encodeURIComponent(signal.symbol)}`)}
          />
        ))}
      </div>

      {/* Empty state */}
      {filteredSignals.length === 0 && (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'var(--font-cairo)',
          fontSize: 13,
        }}>
          لا توجد توصيات مطابقة
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
