'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import dynamic from 'next/dynamic'
import type { QuoteData } from '@/hooks/useMarketStore'
import { ChevronDown, PanelRight, Zap, X, Target } from 'lucide-react'
import { fmtPriceLocale } from '@/lib/price-format'
import { haptic } from '@/lib/haptics'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMultiChartStore, getActiveChartControl } from '@/hooks/useMultiChartStore'
import { PrimarySidebarLayout } from '@/components/dashboard/layouts/PrimarySidebarLayout'
import { SidebarDrawer } from '@/components/dashboard/layouts/SidebarDrawer'
import { RightPanelLayout } from '@/components/dashboard/layouts/RightPanelLayout'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { MobileTickerStrip } from '@/components/dashboard/MobileTickerStrip'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { getDataStatus, getSourceLabel, getStatusLabel, getStatusTone, type DataStatus } from '@/lib/dashboard-live'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { getSymbolLeverage } from '@/lib/margin-calculator'
import { useSidebarState } from '@/hooks/useSidebarState'
import { useRightPanelState } from '@/hooks/useRightPanelState'

import { getDirection } from '@/lib/i18n-utils';
const DASHBOARD_SYMBOLS = ['BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD', 'XAU/USD', 'AAPL', 'TSLA']

// Dynamic imports for heavy components (code splitting)
const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { ssr: false })
const AlpacaPositions = dynamic(() => import('@/components/dashboard/AlpacaPositions').then(m => ({ default: m.AlpacaPositions })), { ssr: false })
const BotEngine = dynamic(() => import('@/components/dashboard/BotEngine').then(m => ({ default: m.BotEngine })), { ssr: false })
// REMOVED: GlobalLogicEngine is already rendered in layout.tsx — duplicate here caused double intervals
// const GlobalLogicEngine = dynamic(() => import('@/components/dashboard/GlobalLogicEngine').then(m => ({ default: m.GlobalLogicEngine })), { ssr: false })
const OrderBookPanel = dynamic(() => import('@/components/dashboard/OrderBookPanel'), { ssr: false })
const ScannerMini = dynamic(() => import('@/components/dashboard/ScannerMini').then(m => ({ default: m.ScannerMini })), { ssr: false })
const AlNarratorMini = dynamic(() => import('@/components/ai/AlNarratorMini').then(m => ({ default: m.AlNarratorMini })), { ssr: false })
const PortfolioMini = dynamic(() => import('@/components/portfolio/PortfolioMini').then(m => ({ default: m.PortfolioMini })), { ssr: false })
const QuickExecutionMini = dynamic(() => import('@/components/dashboard/QuickExecutionMini').then(m => ({ default: m.QuickExecutionMini })), { ssr: false })
const AgentControlMini   = dynamic(() => import('@/components/dashboard/AgentControlMini').then(m => ({ default: m.AgentControlMini })), { ssr: false })
const StrategicCouncilPanel = dynamic(() => import('@/components/dashboard/StrategicCouncilPanel').then(m => ({ default: m.StrategicCouncilPanel })), { ssr: false })
const SmartExecutorPanel = dynamic(() => import('@/components/dashboard/SmartExecutorPanel').then(m => ({ default: m.SmartExecutorPanel })), { ssr: false })
const LazicPanel         = dynamic(() => import('@/components/dashboard/LazicPanel').then(m => ({ default: m.LazicPanel })), { ssr: false })

const HEADER_H = 108
const PANEL_H = 30


// Mode configuration — determines UI accent and available features per mode
const MODE_CONFIG: Record<TradingMode, { accent: string; glowBg: string; label: string }> = {
  trader: {
    accent: '#00D4FF',
    glowBg: 'rgba(0,212,255,0.04)',
    label: 'Trader',
  },
  investor: {
    accent: '#10b981',
    glowBg: 'rgba(16,185,129,0.04)',
    label: 'Investor',
  },
  ai: {
    accent: '#B388FF',
    glowBg: 'rgba(167,139,250,0.04)',
    label: 'AI',
  },
}

const formatMoney = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '$—'
  const num = typeof value === 'string' ? parseFloat(value) : Number(value)
  if (!Number.isFinite(num)) return '$—'
  const abs = Math.abs(num)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num < 0 ? `-$${formatted}` : `$${formatted}`
}

const formatQuotePrice = (value: unknown) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return fmtPriceLocale(num)
}

// ── Beautiful Order Panel Component ──
function OrderPanel({ selectedSymbol, currentPrice, isMobile, onClose }: {
  selectedSymbol: string
  currentPrice: number | null
  isMobile: boolean
  onClose: () => void
}) {
  const t = useTranslations('dashboard.trading')
  const tc = useTranslations('common')
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop_limit'>('market')
  const [quantity, setQuantity] = useState('0.01')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ msg: string; type: 'success' | 'error' | '' }>({ msg: '', type: '' })

  const { addTrade: addPaperTrade } = usePaperTradesStore()
  const addNotification = useNotificationStore(state => state.addNotification)
  const fetchAccount = usePositionsStore(state => state.fetchAccount)
  const fetchPositions = usePositionsStore(state => state.fetchPositions)
  const refreshAfterTrade = usePositionsStore(state => state.refreshAfterTrade)

  const price = currentPrice ?? 0

  // ═══════════════════════════════════════════════════
  // FIX: STALE PRICE DETECTION
  // Before executing, verify that the price is fresh.
  // If the price hasn't been updated in > 30 seconds,
  // warn the user and force a refresh from market store.
  // ═══════════════════════════════════════════════════
  const activeQuoteForOrder = useMarketStore(state => state.quotes[selectedSymbol])
  const priceAgeMs = activeQuoteForOrder?.timestamp
    ? Date.now() - new Date(activeQuoteForOrder.timestamp).getTime()
    : Infinity
  const isStalePrice = priceAgeMs > 30000 // 30 seconds

  const executeOrder = async () => {
    // FIX: Force-refresh live price from market store before executing
    const liveQuotes = useMarketStore.getState().quotes
    const liveQuote = liveQuotes[selectedSymbol]
    const livePrice = liveQuote?.price ?? price

    // Warn if price is stale but still allow execution with the latest available price
    if (isStalePrice && livePrice > 0) {
      // Use the live price from market store instead of stale currentPrice prop
    }

    const effectivePrice = livePrice > 0 ? livePrice : price

    const qty = parseFloat(quantity)
    if (isNaN(qty) || qty <= 0) {
      setStatus({ msg: t('invalidQuantity'), type: 'error' })
      setTimeout(() => setStatus({ msg: '', type: '' }), 3000)
      return
    }

    const sl = stopLoss ? parseFloat(stopLoss) : 0
    const tp = takeProfit ? parseFloat(takeProfit) : 0

    // FIX: Validate SL/TP against the LIVE effective price, not stale price
    if (orderSide === 'buy') {
      if (sl > 0 && effectivePrice > 0 && sl >= effectivePrice) {
        setStatus({ msg: t('slMustBeBelowPrice'), type: 'error' })
        setTimeout(() => setStatus({ msg: '', type: '' }), 3000)
        return
      }
      if (tp > 0 && effectivePrice > 0 && tp <= effectivePrice) {
        setStatus({ msg: t('tpMustBeAbovePrice'), type: 'error' })
        setTimeout(() => setStatus({ msg: '', type: '' }), 3000)
        return
      }
    } else {
      if (sl > 0 && effectivePrice > 0 && sl <= effectivePrice) {
        setStatus({ msg: t('slMustBeAbovePrice'), type: 'error' })
        setTimeout(() => setStatus({ msg: '', type: '' }), 3000)
        return
      }
      if (tp > 0 && effectivePrice > 0 && tp >= effectivePrice) {
        setStatus({ msg: t('tpMustBeBelowPrice'), type: 'error' })
        setTimeout(() => setStatus({ msg: '', type: '' }), 3000)
        return
      }
    }

    setLoading(true)
    setStatus({ msg: '', type: '' })

    try {
      const body: Record<string, any> = {
        symbol: selectedSymbol,
        side: orderSide,
        qty,
        type: orderType,
      }
      if (sl > 0) body.stop_loss = sl
      if (tp > 0) body.take_profit = tp
      if (orderType === 'limit' || orderType === 'stop_limit') {
        body.limit_price = parseFloat(limitPrice)
      }

      const res = await fetch('/api/alpaca/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()

      if (j.success) {
        const filled = j.filledAvgPrice ? ` @ $${parseFloat(j.filledAvgPrice).toFixed(2)}` : ''
        addPaperTrade({
          symbol: selectedSymbol,
          side: orderSide === 'buy' ? 'long' : 'short',
          qty,
          entryPrice: j.filledAvgPrice ? parseFloat(j.filledAvgPrice) : effectivePrice,
          currentPrice: effectivePrice,
          tp: tp > 0 ? tp : undefined,
          sl: sl > 0 ? sl : undefined,
          source: 'manual',
          entryTime: Date.now(),
        })
        addNotification({
          source: 'trade',
          priority: 'high',
          action: orderSide === 'buy' ? 'BUY' : 'SELL',
          title: `${orderSide === 'buy' ? tc('buy') : tc('sell')} ${selectedSymbol}`,
          body: t('orderExecuted', { qty, symbol: selectedSymbol, filled }),
          pair: selectedSymbol,
          price: j.filledAvgPrice ? parseFloat(j.filledAvgPrice) : effectivePrice,
        })
        // FIX: Use refreshAfterTrade for staggered refresh (immediate + 2s + 5s)
        refreshAfterTrade()
        setStatus({ msg: `✅ ${t('orderSuccess', { side: orderSide === 'buy' ? tc('buy') : tc('sell') })}`, type: 'success' })
        setTimeout(() => onClose(), 1200)
      } else {
        setStatus({ msg: `❌ ${j.error || t('executionFailed')}`, type: 'error' })
      }
    } catch {
      setStatus({ msg: `❌ ${tc('connectionError')}`, type: 'error' })
    } finally {
      setLoading(false)
      setTimeout(() => setStatus({ msg: '', type: '' }), 4000)
    }
  }

  const inputStyle = (color?: string): React.CSSProperties => ({
    width: '100%',
    background: color ? `${color}08` : 'rgba(255,255,255,0.03)',
    border: `1px solid ${color ? `${color}25` : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 'var(--radius-lg)',
    color: color || '#F0F2F5',
    fontSize: isMobile ? 14 : 13,
    padding: isMobile ? '12px 14px' : '10px 12px',
    fontFamily: "var(--font-mono)",
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
    fontWeight: 700,
  })

  return (
    <div style={{
      overflow: 'auto',
      padding: isMobile ? '8px 16px calc(16px + env(safe-area-inset-bottom))' : '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {/* Buy/Sell Toggle */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        padding: 4,
        borderRadius: 'var(--radius-xl)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button
          onClick={() => setOrderSide('buy')}
          style={{
            padding: isMobile ? '14px 0' : '12px 0',
            borderRadius: 'var(--radius-lg)',
            border: 'none',
            background: orderSide === 'buy'
              ? 'linear-gradient(135deg, #00FFA3, #10B981)'
              : 'rgba(0,255,163,0.06)',
            color: orderSide === 'buy' ? '#fff' : '#6B7280',
            fontSize: 15,
            fontWeight: 800,
            fontFamily: "var(--font-ar)",
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: orderSide === 'buy' ? '0 0 20px rgba(0,255,163,0.25)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {tc('buy')} <span style={{ fontSize: 11 }}>▲</span>
        </button>
        <button
          onClick={() => setOrderSide('sell')}
          style={{
            padding: isMobile ? '14px 0' : '12px 0',
            borderRadius: 'var(--radius-lg)',
            border: 'none',
            background: orderSide === 'sell'
              ? 'linear-gradient(135deg, #FF4757, #EF4444)'
              : 'rgba(255,71,87,0.06)',
            color: orderSide === 'sell' ? '#fff' : '#6B7280',
            fontSize: 15,
            fontWeight: 800,
            fontFamily: "var(--font-ar)",
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: orderSide === 'sell' ? '0 0 20px rgba(255,71,87,0.25)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {tc('sell')} <span style={{ fontSize: 11 }}>▼</span>
        </button>
      </div>

      {/* Order Type Selector */}
      <div style={{
        display: 'flex',
        gap: 6,
        padding: 3,
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        {([
          { key: 'market' as const, label: tc('market') },
          { key: 'limit' as const, label: tc('limit') },
          { key: 'stop_limit' as const, label: t('stopLimit') },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setOrderType(key)}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: orderType === key
                ? 'rgba(0,212,255,0.12)'
                : 'transparent',
              color: orderType === key ? '#00D4FF' : '#9CA3B5',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "var(--font-ar)",
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              borderInlineStart: orderType === key ? `2px solid ${'#00D4FF'}` : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Limit Price (when limit/stop_limit) */}
      {(orderType === 'limit' || orderType === 'stop_limit') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#9CA3B5', fontWeight: 700, fontFamily: "var(--font-ar)" }}>{t('limitPrice')}</label>
          <input
            value={limitPrice}
            onChange={e => setLimitPrice(e.target.value)}
            placeholder={price > 0 ? price.toFixed(price > 100 ? 2 : 4) : '0.00'}
            type="number"
            step="0.01"
            style={inputStyle('#00D4FF')}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(0,212,255,0.15)'}
          />
        </div>
      )}

      {/* Quantity */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, color: '#9CA3B5', fontWeight: 700, fontFamily: "var(--font-ar)" }}>{tc('quantity')}</label>
        <input
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          placeholder="0.01"
          type="number"
          step="0.01"
          min="0.01"
          style={inputStyle()}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)'}
          onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
      </div>

      {/* SL / TP Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#FF4757', fontWeight: 700, fontFamily: "var(--font-ar)" }}>{tc('stopLoss')}</label>
          <input
            value={stopLoss}
            onChange={e => setStopLoss(e.target.value)}
            placeholder="0.00"
            type="number"
            step="0.1"
            style={inputStyle('#FF4757')}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,71,87,0.5)'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,71,87,0.15)'}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#00FFA3', fontWeight: 700, fontFamily: "var(--font-ar)" }}>{tc('takeProfit')}</label>
          <input
            value={takeProfit}
            onChange={e => setTakeProfit(e.target.value)}
            placeholder="0.00"
            type="number"
            step="0.1"
            style={inputStyle('#00FFA3')}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,255,163,0.5)'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(0,255,163,0.15)'}
          />
        </div>
      </div>

      {/* Quick Calc Button */}
      {price > 0 && (
        <button
          onClick={() => {
            const tp = orderSide === 'buy' ? (price * 1.02).toFixed(price > 100 ? 2 : 4) : (price * 0.98).toFixed(price > 100 ? 2 : 4)
            const sl = orderSide === 'buy' ? (price * 0.99).toFixed(price > 100 ? 2 : 4) : (price * 1.01).toFixed(price > 100 ? 2 : 4)
            setTakeProfit(tp)
            setStopLoss(sl)
          }}
          style={{
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.15)',
            borderRadius: 'var(--radius-lg)',
            color: '#00D4FF',
            fontSize: 11,
            fontWeight: 700,
            padding: '10px 14px',
            cursor: 'pointer',
            fontFamily: "var(--font-ar)",
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.14)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.08)' }}
        >
          <Target size={12} />
          {t('autoCalc')}
        </button>
      )}

      {/* FIX: Stale Price Warning */}
      {isStalePrice && price > 0 && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius-lg)',
          background: 'rgba(255,184,0,0.1)',
          border: '1px solid rgba(255,184,0,0.25)',
          color: '#FFB800',
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "var(--font-ar)",
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          {t('stalePriceWarning')}
        </div>
      )}

      {/* Status Message */}
      {status.msg && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius-lg)',
          background: status.type === 'success' ? 'rgba(0,255,163,0.1)' : 'rgba(255,71,87,0.1)',
          border: `1px solid ${status.type === 'success' ? 'rgba(0,255,163,0.25)' : 'rgba(255,71,87,0.25)'}`,
          color: status.type === 'success' ? '#00FFA3' : '#FF4757',
          fontSize: 13,
          fontWeight: 700,
          fontFamily: "var(--font-ar)",
          textAlign: 'center',
        }}>
          {status.msg}
        </div>
      )}

      {/* Execute Button */}
      <button
        onClick={executeOrder}
        disabled={loading}
        style={{
          padding: isMobile ? '16px 0' : '14px 0',
          borderRadius: 'var(--radius-xl)',
          border: 'none',
          background: orderSide === 'buy'
            ? 'linear-gradient(135deg, #00FFA3, #10B981)'
            : 'linear-gradient(135deg, #FF4757, #EF4444)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 800,
          fontFamily: "var(--font-ar)",
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: loading ? 0.7 : 1,
          transition: 'transform 0.12s ease, box-shadow 0.2s ease',
          boxShadow: orderSide === 'buy'
            ? '0 0 24px rgba(0,255,163,0.2), 0 4px 16px rgba(0,0,0,0.3)'
            : '0 0 24px rgba(255,71,87,0.2), 0 4px 16px rgba(0,0,0,0.3)',
        }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <Zap size={16} fill="white" />
        {loading ? tc('processing') : orderSide === 'buy' ? tc('buy') : tc('sell')} {selectedSymbol}
      </button>
    </div>
  )
}

export default function DashboardPage() {
  const locale = useLocale();
  const dir = getDirection(locale);
  const t = useTranslations('dashboard.home')
  const tc = useTranslations('common')
  const { collapsed: sidebarCollapsed } = useSidebarState()
  const { collapsed: rightPanelCollapsed } = useRightPanelState()
  useScopedStyle(`.dashboard-shell {
          min-height: calc(100dvh - ${HEADER_H}px);
          background: ${'#0B0E14'};
          background-image:
            radial-gradient(ellipse at 20% 0%, rgba(0,212,255,0.04) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 100%, rgba(0,255,163,0.02) 0%, transparent 50%);
          color: ${'#F0F2F5'};
          overflow: hidden;
        }

        .dash-grid {
          display: grid;
          grid-template-columns: ${sidebarCollapsed ? '40px' : 'minmax(220px, 260px)'} minmax(0, 1fr) ${rightPanelCollapsed ? '40px' : 'minmax(280px, 320px)'};
          gap: 12px;
          min-height: calc(100dvh - ${HEADER_H}px);
          height: calc(100dvh - ${HEADER_H}px);
          padding: 8px;
          box-sizing: border-box;
          overflow: hidden;
        }

        .dash-grid.chart-fullscreen {
          grid-template-columns: 0px minmax(0, 1fr) 0px !important;
        }

        .dash-grid.chart-fullscreen .dash-col-left,
        .dash-grid.chart-fullscreen .dash-col-right,
        .dash-grid.chart-fullscreen .dash-col-right-mobile {
          visibility: hidden !important;
          overflow: hidden !important;
          pointer-events: none !important;
        }

        .dash-grid.chart-fullscreen .dash-col-center {
          overflow: hidden !important;
        }

        /* Chart panel — flex:1 already set inline, no fullscreen override needed */

        /* Positions section — smooth slide animation */
        .positions-section {
          transition: max-height 0.3s ease-out, opacity 0.25s ease-out;
          overflow: hidden;
        }
        .positions-section--closed {
          max-height: 0 !important;
          opacity: 0;
        }
        .positions-section--open {
          opacity: 1;
        }

        /* Balance+Positions panel — visible and interactive in fullscreen */
        .dash-grid.chart-fullscreen .dash-col-center > .panel:nth-child(3) {
          flex-shrink: 0 !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }

        .dash-col {
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }

        /* BUG-057 FIX: dash-col-left must not shrink below its grid column width.
           On tablet (768-1280px), when sidebar is collapsed, the grid allocates
           40px but dash-col could shrink to 0 due to min-width:0 above, leaving
           a black gap. This override ensures the left column fills its grid track. */
        .dash-col-left {
          min-width: unset;
          width: 100%;
        }

        /* ── Glassmorphism Panel ── */
        .panel {
          background: rgba(26, 29, 41, 0.65);
          backdrop-filter: blur(16px) saturate(1.4);
          -webkit-backdrop-filter: blur(16px) saturate(1.4);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px;
          overflow: hidden;
          min-width: 0;
          min-height: 0;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04);
          position: relative;
        }
        .panel::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at top right, rgba(0, 212, 255, 0.05), transparent 40%),
            radial-gradient(circle at bottom left, rgba(0, 255, 163, 0.03), transparent 35%);
          pointer-events: none;
          z-index: 0;
        }

        .panel > * { position: relative; z-index: 1; }

        .panel-header {
          min-height: ${PANEL_H}px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: linear-gradient(90deg, rgba(0,212,255,0.05), transparent 60%);
          box-sizing: border-box;
        }

        .panel-title {
          font-family: 'Cairo', sans-serif;
          font-size: 12px;
          font-weight: 800;
        }

        .summary-row {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          align-items: center;
          font-size: 11px;
          font-family: 'Cairo', sans-serif;
          font-weight: 700;
        }

        .summary-item {
          display: flex;
          gap: 6px;
          align-items: center;
          white-space: nowrap;
        }

        .summary-label {
          color: ${'#6B7280'};
        }

        .summary-value {
          color: ${'#F0F2F5'};
          font-family: 'JetBrains Mono', monospace;
        }

        .summary-value--success {
          color: ${'#00FFA3'};
        }

        .summary-value--accent {
          color: ${'#00D4FF'};
        }

        /* ── Balance Card ── */
        .balance-card {
          background: linear-gradient(135deg, rgba(0,212,255,0.12), rgba(0,255,163,0.06), rgba(26,29,41,0.8));
          border: 1px solid rgba(0,212,255,0.15);
          border-radius: 14px;
          padding: 14px 18px;
          position: relative;
          overflow: hidden;
        }
        .balance-card::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -30%;
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(0,212,255,0.08), transparent 60%);
          pointer-events: none;
        }
        .balance-card::after {
          content: '';
          position: absolute;
          bottom: -40%;
          left: -20%;
          width: 180px;
          height: 180px;
          background: radial-gradient(circle, rgba(0,255,163,0.06), transparent 60%);
          pointer-events: none;
        }

        /* ── LED Connection Indicator ── */
        .led-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${'#00FFA3'};
          box-shadow: 0 0 6px ${'#00FFA3'}, 0 0 12px rgba(0,255,163,0.3);
          animation: ledPulse 2s ease-in-out infinite;
        }

        @keyframes ledPulse {
          0%, 100% { opacity: 0.7; box-shadow: 0 0 4px ${'#00FFA3'}; }
          50% { opacity: 1; box-shadow: 0 0 8px ${'#00FFA3'}, 0 0 16px rgba(0,255,163,0.4); }
        }

        /* ── Striped Rows ── */
        .striped-rows > :nth-child(even) {
          background: rgba(255,255,255,0.015);
        }

        /* ── Hover Glow Effect ── */
        .hover-glow {
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .hover-glow:hover {
          border-color: rgba(0,212,255,0.20) !important;
          box-shadow: 0 0 20px rgba(0,212,255,0.08), 0 12px 40px rgba(0,0,0,0.4) !important;
        }

        /* ── Count-up Animation ── */
        @keyframes countUp {
          from { opacity: 0.4; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .count-up {
          animation: countUp 0.5s ease-out;
        }

        /* ── Stagger Animation ── */
        @keyframes fadeInSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-in-1 { animation: fadeInSlideUp 0.4s ease-out 0.05s both; }
        .animate-in-2 { animation: fadeInSlideUp 0.4s ease-out 0.1s both; }
        .animate-in-3 { animation: fadeInSlideUp 0.4s ease-out 0.15s both; }

        .mobile-dashboard-shell,
        .mobile-bottom-nav,
        .dash-col-right-mobile {
          display: none;
        }

        /* ── New Mobile V2 ── */
        .m2-shell, .m2-chart-toolbar, .m2-ticker,
        .m2-bottom-nav, .m2-trade-fab { display: none; }

        @media (max-width: 1500px) {
          .dash-grid {
            grid-template-columns: minmax(230px, 260px) minmax(0, 1fr) minmax(280px, 320px);
          }
        }

        @media (max-width: 1280px) {
          .dash-grid {
            grid-template-columns: minmax(180px, 220px) minmax(0, 1fr) minmax(220px, 260px);
          }
          /* BUG-057: Right panel stays visible on tablet — just narrower */
        }

        @media (max-width: 767px) {
          .dash-grid {
            display: none;
          }

          .show-on-mobile-only { display: flex !important; }

          /* ── Mobile V2 shell ── */
          .m2-shell {
            display: flex !important;
            flex-direction: column;
            width: 100%;
            background: '#0A0D13';
            overflow: hidden;
            position: fixed;
            top: 0; left: 0; right: 0;
            /* 100svh ثابت — لا يتغير عند إخفاء/إظهار شريط URL في Safari */
            /* bottom:0 كان يجعله يتمدد مع الـ viewport → الشموع تتمط */
            height: 100svh;
          }
          .m2-ticker {
            display: flex !important;
            height: 40px;
            align-items: center;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;
            padding: 0 10px;
            gap: 2px;
            flex-shrink: 0;
            background: rgba(0,212,255,0.04);
            border-bottom: 1px solid rgba(0,212,255,0.08);
          }
          .m2-ticker::-webkit-scrollbar { display: none; }
          .m2-chart-toolbar {
            display: flex !important;
            height: 36px;
            align-items: center;
            padding: 0 10px;
            gap: 2px;
            flex-shrink: 0;
            background: rgba(10,13,19,0.98);
            border-bottom: 1px solid rgba(255,255,255,0.04);
            overflow: visible;
            touch-action: manipulation;
          }
          .m2-chart-toolbar::-webkit-scrollbar { display: none; }
          .m2-chart-area {
            flex: 1;
            position: relative;
            min-height: 0;
            overflow: hidden;
            touch-action: none;
          }
          .m2-bottom-nav {
            display: flex !important;
            flex-shrink: 0;
            height: 58px;
            padding-top: 6px;
            padding-left: 4px;
            padding-right: 4px;
            padding-bottom: env(safe-area-inset-bottom, 0px);
            background: rgba(8,11,16,0.98);
            border-top: 1px solid rgba(255,255,255,0.06);
            align-items: flex-start;
          }
          /* keep old pill for fallback */
          .mobile-market-pill {
            display: none;
          }
          .mobile-dashboard-shell { display: none !important; }

          .mobile-hero-card-legacy {
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid rgba(0, 212, 255, 0.10);
            background: rgba(26, 29, 41, 0.6);
            backdrop-filter: blur(10px);
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
          }

          .mobile-hero-card__header {
            min-height: 32px;
            padding: 0 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid rgba(0, 212, 255, 0.08);
            flex-shrink: 0;
          }

          .mobile-hero-chart {
            flex: 1;
            min-height: 0;
            overflow: hidden;
          }

          .mobile-hero-chart--expanded {
            flex: 2;
            min-height: 0;
          }

          .mobile-summary-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
            padding: 6px 8px;
            border-radius: 12px;
            background: rgba(26, 29, 41, 0.6);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.06);
            flex-shrink: 0;
          }

          .mobile-summary-card {
            min-width: 0;
            padding-inline: 2px;
            text-align: center;
          }



          .mobile-section {
            min-width: 0;
            border-radius: 14px;
            overflow: hidden;
            background: ${'#151A22'};
            border: 1px solid ${'#2A313C'};
            box-sizing: border-box;
          }

          .mobile-section__header {
            min-height: 48px;
            padding: 0 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            border-bottom: 1px solid ${'#2A313C'};
            background: linear-gradient(90deg, rgba(0, 212, 255, 0.06), transparent);
            box-sizing: border-box;
          }

          .mobile-section__title {
            font-family: 'Cairo', sans-serif;
            font-size: 12px;
            font-weight: 800;
            color: ${'#F0F2F5'};
          }

          .mobile-section__body {
            min-width: 0;
            overflow: hidden;
          }

          .mobile-chart-shell {
            height: 100%;
            min-height: 0;
          }
        }

        @media (min-width: 768px) {
          .mobile-dashboard-shell,
          .mobile-bottom-nav {
            display: none;
          }
        }

        .dash-col::-webkit-scrollbar {
          width: 3px;
        }

        .dash-col::-webkit-scrollbar-track {
          background: transparent;
        }

        .dash-col::-webkit-scrollbar-thumb {
          background: rgba(0,212,255,0.15);
          border-radius: 10px;
        }

        .dash-col::-webkit-scrollbar-thumb:hover {
          background: rgba(0,212,255,0.30);
        }

        .live-status-dot {
          animation: live-dot 1.8s ease-in-out infinite;
        }

        @keyframes live-dot {
          0%, 100% { transform: scale(1); opacity: 0.65; }
          50% { transform: scale(1.35); opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes marginPulse {
          0%, 100% { background: rgba(239,68,68,0.12); }
          50% { background: rgba(239,68,68,0.25); }
        }`)

  const globalQuotes = useMarketStore(state => state.quotes) as Record<string, QuoteData | undefined>
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)
  const setSelectedSymbol = useSymbolStore(state => state.setSelectedSymbol)
  // ── Smart symbol selector: routes to active chart cell in multi-chart mode ──
  // When in multi-chart mode, clicking a symbol in the watchlist or currency bar
  // should update the ACTIVE chart cell's symbol, not just the global store.
  const isMultiChart = useMultiChartStore(state => state.isMultiChart)
  const activeChartId = useMultiChartStore(state => state.activeChartId)
  const handleSelectSymbol = useCallback((sym: string) => {
    if (isMultiChart && activeChartId) {
      // Route to the active chart cell via ChartControlAPI
      const ctrl = getActiveChartControl();
      if (ctrl) {
        ctrl.setSymbol(sym);
        return;
      }
    }
    // Fallback: update global symbol store
    setSelectedSymbol(sym);
  }, [isMultiChart, activeChartId, setSelectedSymbol])
  const currentPrice = globalQuotes[selectedSymbol]?.price ?? null
  const activeQuote = globalQuotes[selectedSymbol] ?? null
  const account = usePositionsStore(state => state.account)
  // V189: Use getActivePositions to filter by active account
  const allPositions = usePositionsStore(state => state.positions)
  const activeCredentialId = usePositionsStore(state => state.activeCredentialId)
  const getActivePositions = usePositionsStore(state => state.getActivePositions)
  const positions = activeCredentialId ? getActivePositions() : allPositions
  const lastUpdate = usePositionsStore(state => state.lastUpdate)
  const positionsError = usePositionsStore(state => state.error)
  const fetchAccount = usePositionsStore(state => state.fetchAccount)
  const fetchPositions = usePositionsStore(state => state.fetchPositions)
  const chartFullscreen = useDashboardStore(state => state.chartFullscreen)
  const toggleChartFullscreen = useDashboardStore(state => state.toggleChartFullscreen)
  const mode = useDashboardStore(state => state.mode)
  const paperTrades = usePaperTradesStore(state => state.trades)
  const [posOpen, setPosOpen] = useState(false)
  const modeConfig = MODE_CONFIG[mode]

  const hasPositions = positions.length > 0 || paperTrades.length > 0

  // Auto-open positions panel when positions are detected (first load or new positions)
  const prevHasPositions = useRef(false)
  useEffect(() => {
    if (hasPositions && !prevHasPositions.current) {
      setPosOpen(true)
    }
    prevHasPositions.current = hasPositions
  }, [hasPositions])

  // Notify user when SmartExecutor opens a new position
  const prevPositionsCount = useRef(positions.length)
  const addNotificationFn = useNotificationStore(state => state.addNotification)
  useEffect(() => {
    const prev = prevPositionsCount.current
    const curr = positions.length
    if (curr > prev) {
      // New position(s) detected — notify
      const newest = positions[0]
      if (newest) {
        const dir = newest.side === 'BUY' ? `🟢 ${tc('buy')}` : `🔴 ${tc('sell')}`
        addNotificationFn({
          source: 'trade',
          priority: 'high',
          action: newest.side === 'BUY' ? 'BUY' : 'SELL',
          title: `${dir} — ${newest.symbol}`,
          body: t('smartExecutorOpenedPosition', { price: Number(newest.entryPrice ?? newest.currentPrice).toFixed(2) }),
          pair: newest.symbol,
        })
        setPosOpen(true)
      }
    }
    prevPositionsCount.current = curr
  }, [positions.length, positions, addNotificationFn])



  const router = useRouter()
  const [chartExpanded, setChartExpanded] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)

  const [isCompactDesktopViewport, setIsCompactDesktopViewport] = useState(false)
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false)
  // Mobile V2 state
  const timeframe = useSymbolStore(state => state.timeframe)
  const setTimeframe = useSymbolStore(state => state.setTimeframe)
  const [m2TradeOpen, setM2TradeOpen] = useState(false)
  const [m2OrderSide, setM2OrderSide] = useState<'buy'|'sell'>('buy')
  const [m2Qty, setM2Qty] = useState('0.05')
  const [m2ConfirmSheet, setM2ConfirmSheet] = useState(false)
  const [m2ActiveTool, setM2ActiveTool] = useState('cursor')
  const [m2ShowTf, setM2ShowTf] = useState(false)
  const [m2ShowInd, setM2ShowInd] = useState(false)
  const [m2ShowAI, setM2ShowAI] = useState(false)
  const [m2ActiveTab, setM2ActiveTab] = useState('chart')
  const [m2TradeCollapsed, setM2TradeCollapsed] = useState(false)
  const [m2PositionsTab, setM2PositionsTab] = useState<'open'|'closed'>('open')
  const [closedPositions, setClosedPositions] = useState<any[]>([])
  const [loadingClosed, setLoadingClosed] = useState(false)
  const [expandedPositionId, setExpandedPositionId] = useState<string|null>(null)
  const [closedDateFilter, setClosedDateFilter] = useState<'day'|'week'|'month'|'year'|'all'>('all')
  const closedPnlTotal = closedPositions.reduce((sum:number, p:any) => sum + (Number(p.realizedPnl||p.pnl)||0), 0)  // طي/Open لوحة التنفيذ
  const [m2ShowMore, setM2ShowMore] = useState(false)               // قائمة More
  const [m2ShowMarkets, setM2ShowMarkets] = useState(false)         // قائمة الMarkets
  const [m2ShowDrawing, setM2ShowDrawing] = useState(false)         // قائمة أدوات الDrawing
  const [m2ActiveInds, setM2ActiveInds] = useState<string[]>(['RSI', 'EMA 20'])
  const m2TFs = ['1m','5m','15m','30m','1H','4H','1D','1W']
  const m2DrawTools = [
    { id:'cursor', icon:'↖' }, { id:'line', icon:'╱' }, { id:'hline', icon:'─' },
    { id:'fib', icon:'φ' }, { id:'rect', icon:'▭' }, { id:'text', icon:'T' },
  ]
  const m2Indicators = ['RSI','MACD','EMA 20','EMA 50','Bollinger','Volume','ATR','Stoch']
  const m2NavItems = [
    { id:'chart',     label: t('chart')  },
    { id:'positions', label: t('positions') },
    { id:'scanner',   label: t('scanner') },
    { id:'ai',        label: t('decision')   },
    { id:'menu',      label: t('more')  },
  ]

  // ── Chart Height: Pure CSS flex + explicit resize trigger ──
  // Chart uses flex:1 so it fills remaining space after banner + balance panel.
  // When positions open/close, we dispatch a window resize event so that
  // the ResizeObserver in useChart.ts detects the container size change
  // and resizes the TradingView canvas.
  const chartPanelRef = useRef<HTMLDivElement | null>(null)

  // Force chart canvas resize after positions toggle (desktop only)
  // الجوال لا يحتاج لهذا — الـ ResizeObserver يتعامل مع التغييرات
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.innerWidth < 768;
    if (isMobile) return; // الجوال: نتجنب dispatch غير ضروري
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 150) // 150ms بدل 50ms — نعطي CSS وقتاً كافياً
    return () => { clearTimeout(timer) }
  }, [posOpen])

  useEffect(() => {
    fetchAccount()
    fetchPositions()

    // FIX: Increased from 10s to 30s to prevent "dancing" trades.
    // The old 10s polling combined with GlobalLogicEngine's 15s polling
    // and AlpacaPositions' 30s polling caused 3 competing intervals that
    // replaced the entire positions array at different times, making
    // positions flicker/dance every few seconds.
    //
    // Now: This interval does a full refresh every 30s. The
    // GlobalLogicEngine handles real-time price updates every 2s
    // (in-place updates, not full array replacements). The mergePositions()
    // function in usePositionsStore prevents the full-array-replace flicker.
    const intervalId = window.setInterval(() => {
      fetchAccount()
      fetchPositions()
    }, 30000)

    // Extra immediate fetch after 3s to catch trades that just fired
    const quickFetch = setTimeout(() => fetchPositions(), 3000)

    return () => { window.clearInterval(intervalId); clearTimeout(quickFetch) }
  }, [fetchAccount, fetchPositions])

  // Refresh البيانات عند Open تاب الصفقات
  useEffect(() => {
    if (m2ActiveTab === 'positions') {
      fetchAccount()
      fetchPositions()
    }
  }, [m2ActiveTab, fetchAccount, fetchPositions])

  // جلب Closed Positions
  const fetchClosedPositions = useCallback(async (filter: 'day'|'week'|'month'|'year'|'all' = closedDateFilter) => {
    setLoadingClosed(true)
    try {
      const now = new Date()
      let from = ''
      if (filter === 'day')   { const d = new Date(now); d.setHours(0,0,0,0);       from = d.toISOString() }
      if (filter === 'week')  { const d = new Date(now); d.setDate(d.getDate()-7);  from = d.toISOString() }
      if (filter === 'month') { const d = new Date(now); d.setMonth(d.getMonth()-1); from = d.toISOString() }
      if (filter === 'year')  { const d = new Date(now); d.setFullYear(d.getFullYear()-1); from = d.toISOString() }
      // V205: Pass credentialId to API for server-side filtering by active account
      const activeCredId = usePositionsStore.getState().activeCredentialId
      const credParam = activeCredId ? `&credentialId=${encodeURIComponent(activeCredId)}` : ''
      const url = '/api/trading/positions/history?limit=200' + (from ? `&from=${encodeURIComponent(from)}` : '') + credParam
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setClosedPositions(Array.isArray(data) ? data : (data.positions || data.data || []))
      }
    } catch { /* ignore */ }
    finally { setLoadingClosed(false) }
  }, [closedDateFilter])

  // Cross-device sync: refresh data when the page becomes visible
  // (user switches back from another tab/device or returns to the app)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAccount()
        fetchPositions()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [fetchAccount, fetchPositions])

  // Refresh البيانات عند Open تاب الصفقات
  useEffect(() => {
    if (m2ActiveTab === 'positions') {
      fetchAccount()
      fetchPositions()
    }
  }, [m2ActiveTab, fetchAccount, fetchPositions])

  // جلب Closed Positions
  // Cross-tab sync: listen for account data changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('roua_') || e.key === null) {
        fetchAccount()
        fetchPositions()
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [fetchAccount, fetchPositions])

  // Refresh البيانات عند Open تاب الصفقات
  useEffect(() => {
    if (m2ActiveTab === 'positions') {
      fetchAccount()
      fetchPositions()
    }
  }, [m2ActiveTab, fetchAccount, fetchPositions])

  // V205/V210: Re-fetch ALL data when activeCredentialId changes (user switches account)
  useEffect(() => {
    // V210: Also re-fetch open positions from the store (which sends credentialId to API)
    fetchPositions()
    fetchClosedPositions(closedDateFilter)
  }, [activeCredentialId, fetchPositions, fetchClosedPositions, closedDateFilter])

  // جلب Closed Positions
  useEffect(() => {
    if (typeof window === 'undefined') return

    const mobileMedia = window.matchMedia('(max-width: 767px)')
    const compactDesktopMedia = window.matchMedia('(max-width: 1280px)')

    const syncViewport = () => {
  

      setIsMobileViewport(mobileMedia.matches)
      setIsCompactDesktopViewport(compactDesktopMedia.matches && !mobileMedia.matches)
    }

    syncViewport()
    mobileMedia.addEventListener('change', syncViewport)
    compactDesktopMedia.addEventListener('change', syncViewport)

    return () => {
      mobileMedia.removeEventListener('change', syncViewport)
      compactDesktopMedia.removeEventListener('change', syncViewport)
    }
  }, [])

  const quotes = useMemo(() => {
    const entries = DASHBOARD_SYMBOLS.flatMap(symbol => {
      const quote = globalQuotes[symbol]
      return quote ? [[symbol, quote] as const] : []
    })
    return new Map<string, QuoteData>(entries)
  }, [globalQuotes])

  const mobileSymbols = useMemo(() => {
    const defaults = ['BTC/USD', 'ETH/USD', 'SOL/USD']
    const ordered = [selectedSymbol, ...defaults.filter(sym => sym !== selectedSymbol)]
    return ordered.slice(0, 3).map(symbol => ({
      symbol,
      quote: globalQuotes[symbol] ?? null,
    }))
  }, [globalQuotes, selectedSymbol])

  const mobileSummaryCards = [
    { label: tc('balance'), value: formatMoney(account?.balance ?? account?.equity), tone: '#F0F2F5' },
    { label: tc('buyingPower'), value: formatMoney(account?.buyingPower), tone: '#00FFA3' },
    { label: tc('positions'), value: `${positions.length}`, tone: '#00D4FF' },
  ]

  const quoteStatus = getDataStatus(activeQuote)
  const sourceLabel = getSourceLabel(activeQuote?.source, tc)

  // Derive account data status
  const dataSource = usePositionsStore(state => state.dataSource)
  const accountDataStatus: DataStatus = (() => {
    if (positionsError) return 'disconnected'
    if (!account) return 'disconnected'
    // إذا كان الAccount موجود لكن بدون بيانات حقيقية (equity=0 ولا مراكز)، اعتبره "تجريبي"
    const hasRealData = Number(account.equity) > 0 || Number(account.longMarketValue) > 0 || Number(account.shortMarketValue) > 0 || positions.length > 0
    if (!lastUpdate && !hasRealData) return 'demo'
    if (!lastUpdate) return 'fallback'
    // إذا كانت البيانات من NestJS، اعتبرها مباشرة/احتياطية حسب حالة الأسعار
    if (dataSource === 'nestjs') {
      return quoteStatus === 'live' ? 'live' : quoteStatus === 'delayed' ? 'delayed' : 'fallback'
    }
    if (dataSource === 'alpaca') {
      return quoteStatus === 'live' ? 'live' : 'fallback'
    }
    return quoteStatus === 'live' ? 'live' : quoteStatus === 'delayed' ? 'delayed' : 'fallback'
  })()

  // Calculate P&L for balance card — use live-calculated P&L from positions
  // (positions now update in real-time via GlobalLogicEngine + useMarketStore)
  // Fallback to account's unrealizedPnl if positions aren't loaded yet
  const equityValue = Number(account?.equity) || 0
  const cashValue = Number(account?.cash) || 0

  // FIX V117: Calculate positionsValue and initialMargin from ACTUAL positions in the store,
  // not from account.longMarketValue/initialMargin which come from the exchange API.
  // Previously, when the exchange (Alpaca) had open positions that weren't in the local DB,
  // the account showed $2,000+ in margin/position value but the positions list was empty.
  // This created the "ghost position" contradiction: margin used with no visible positions.
  // Now: positionsValue is ALWAYS computed from the visible positions list, ensuring consistency.
  const livePositionsValue = positions.reduce((sum, p) => {
    return sum + Math.abs(Number(p.marketValue || (Number(p.qty) * Number(p.currentPrice)) || 0))
  }, 0)
  const longMarketValue = positions.length > 0 ? livePositionsValue : (Number(account?.longMarketValue) || 0)
  const shortMarketValue = 0
  const positionsValue = longMarketValue + shortMarketValue
  // V152 FIX: Client-side margin is PRIMARY, account.initialMargin is SECONDARY.
  //
  // HISTORY: V147-V151 all used account.initialMargin as primary, but this
  // came from the backend which had WRONG leverage for no-slash symbols
  // (EURUSDT → leverage=1 instead of 50). This caused "مستخدم" to show
  // $12,302 instead of the correct ~$246.
  //
  // V152: The client-side inline calculator correctly handles ALL symbol
  // formats (with/without slash, USDT/USD suffix). Use it as PRIMARY.
  const accountMargin = Number(account?.initialMargin) || 0
  const clientSideMargin = positions.length > 0
    ? (() => {
        let margin = 0
        for (const p of positions) {
          const qty = Number(p.qty) || 0
          const entryPx = Number((p as any).entryPrice || p.currentPrice) || 0
          if (qty <= 0 || entryPx <= 0) continue
          const notional = Math.abs(qty * entryPx)
          const leverage = getSymbolLeverage(p.symbol || '') || 1
          margin += notional / leverage
        }
        return margin
      })()
    : 0
  // V175 FIX: For paper trading, use backend usedMargin (calculated from DB positions).
  // clientSideMargin can be inflated by stale localStorage positions not in DB.
  // Backend is the source of truth — it queries live DB open positions.
  const isPaperMode = account?.isPaperTrading === true
  const initialMargin = isPaperMode
    ? accountMargin   // Backend usedMargin — always accurate for paper trading
    : (clientSideMargin > 0 ? clientSideMargin : accountMargin)
  const freeMargin = Math.max(0, equityValue - initialMargin) // Free Margin = Equity - Used Margin
  // P&L لحظي من المراكز (محسوب من الأسعار المباشرة) بدلاً من account.unrealizedPnl المتجمد
  const livePositionsPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)
  const unrealizedPnl = positions.length > 0 ? livePositionsPnl : (Number(account?.unrealizedPnl) || 0)
  const isProfitable = unrealizedPnl > 0

  return (
    <>
      {/* Scoped styles via useScopedStyle */}<BotEngine />

      {!isMobileViewport && (
        <div
          className={`dash-grid dashboard-shell${chartFullscreen ? ' chart-fullscreen' : ''}`}
          style={{
            display: 'grid',
            // BUG-057 PROPER FIX: Always 3 columns — just narrower on tablet.
            // The right panel should be VISIBLE on tablet, not hidden behind a button.
            // On tablet: left=40px (collapsed), center=flexible, right=240px (narrower)
            // On desktop: left=220-260px, center=flexible, right=280-320px
            gridTemplateColumns: chartFullscreen
              ? '0px minmax(0, 1fr) 0px'
              : isCompactDesktopViewport
                ? `${sidebarCollapsed ? '40px' : 'minmax(180px, 220px)'} minmax(0, 1fr) ${rightPanelCollapsed ? '40px' : 'minmax(220px, 260px)'}`
                : `${sidebarCollapsed ? '40px' : 'minmax(220px, 260px)'} minmax(0, 1fr) ${rightPanelCollapsed ? '40px' : 'minmax(280px, 320px)'}`,
            gap: isCompactDesktopViewport ? 8 : 12,
            minHeight: `calc(100dvh - ${HEADER_H}px)`,
            height: `calc(100dvh - ${HEADER_H}px)`,
            padding: 8,
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {/* V554: Left Sidebar — always visible on desktop (above 768px), collapsible */}
          {/* BUG-057 FIX: width must match grid column to prevent black gap on tablet */}
          <div
            className="dash-col dash-col-left animate-in-1"
            style={{
              height: '100%',
              width: sidebarCollapsed ? '40px' : '100%',
              minWidth: sidebarCollapsed ? '40px' : '220px',
              maxWidth: sidebarCollapsed ? '40px' : '260px',
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s, max-width 0.3s',
              overflow: 'hidden',
            }}
          >
            <PrimarySidebarLayout />
          </div>

          {/* Center Column: Mode Banner + Chart + Balance + Positions */}
          <div className="dash-col dash-col-center animate-in-2" style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, minHeight: 0, height: '100%', overflow: 'hidden' }}>
            {/* Mode Banner — removed to save space */}
            {/* Chart Panel — flex:1 fills remaining space after banner + balance panel */}
            <div ref={chartPanelRef} className="panel" style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', border: 'none', background: 'transparent', boxShadow: 'none' }}>
              <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-xl)', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(26, 29, 41, 0.65)' }}>
                <RouaChart
                  currentPrice={currentPrice}
                  isChartFullscreen={chartFullscreen}
                  onToggleChartFullscreen={toggleChartFullscreen}
                  onSLTPDrag={async (key, type, newPrice) => {
                    // Extract position ID from overlay key: "pos-{id}-sl" or "pos-{id}-tp"
                    const match = key.match(/^pos-(.+)-(sl|tp)$/);
                    if (!match) return;
                    const positionId = match[1];
                    try {
                      await fetch(`/api/trading/positions/${positionId}/levels`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(type === 'sl' ? { stopLoss: newPrice } : { takeProfit: newPrice }),
                      });
                      // Refresh positions to reflect the update
                      fetchPositions();
                    } catch (err) {
                      console.error('Failed to update SL/TP:', err);
                    }
                  }}
                />
              </div>
            </div>

            {/* Balance + Open Positions Panel — flexShrink:0, takes only the space it needs */}
            <div className="panel hover-glow" style={{ flexShrink: 0, flexBasis: 'auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Balance Summary — single compact row with vertical dividers */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                minHeight: PANEL_H,
                padding: '0 8px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'linear-gradient(90deg, rgba(0,212,255,0.05), transparent 60%)',
                overflow: 'hidden',
              }}>
                {/* LED + Balance — V183: Balance = true wallet balance (margin NOT deducted) */}
                <div title={isPaperMode
                  ? `${t('balance')}: ${t('balanceTooltipPaper')}`
                  : `${t('balance')}: ${t('balanceTooltipReal')}`
                } style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderInlineEnd: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, cursor: 'help' }}>
                  <div className="led-indicator" style={{ background: getStatusTone(accountDataStatus), boxShadow: `0 0 6px ${getStatusTone(accountDataStatus)}, 0 0 12px ${getStatusTone(accountDataStatus)}33` }} />
                  <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 700, fontFamily: "var(--font-ar)" }}>{tc('balance')}</span>
                  <span dir="ltr" style={{ fontSize: 13, fontWeight: 800, fontFamily: "var(--font-mono)", color: '#F0F2F5' }}>{formatMoney(cashValue)}</span>
                </div>
                {/* Balance Current (Equity) — V183: Balance + unrealized P/L */}
                <div title={`${t('equity')}: ${t('equityTooltip')}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderInlineEnd: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, cursor: 'help' }}>
                  <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 700, fontFamily: "var(--font-ar)" }}>{tc('equity')}</span>
                  <span dir="ltr" style={{ fontSize: 13, fontWeight: 800, fontFamily: "var(--font-mono)", color: '#00D4FF' }}>{formatMoney(equityValue)}</span>
                </div>
                {/* Free Margin — V183: Balance - Used Margin + unrealized P/L */}
                <div title={`${t('freeMargin')}: ${t('freeMarginTooltip')}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderInlineEnd: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, cursor: 'help' }}>
                  <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 700, fontFamily: "var(--font-ar)" }}>{t('freeMargin')}</span>
                  <span dir="ltr" style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: '#00FFA3' }}>{formatMoney(freeMargin)}</span>
                </div>
                {/* Used Margin — V183: Margin locked in open positions */}
                <div title={`${tc('margin')}: ${t('usedMarginTooltip')}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderInlineEnd: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, cursor: 'help' }}>
                  <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 700, fontFamily: "var(--font-ar)" }}>{tc('margin')}</span>
                  <span dir="ltr" style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: initialMargin > 0 ? '#FFB800' : '#F0F2F5' }}>{formatMoney(initialMargin)}</span>
                </div>
                {/* Margin Level — Warning صارخ عند Level المنخفض */}
                {(() => {
                  const mlPct = initialMargin > 0 ? (equityValue / initialMargin) * 100 : 0;
                  // Margin Level = margin/equity × 100
                  // عالي = Danger (استخدام كبير لرأس المال)
                  // منخفض = آمن (استخدام محافظ)
                  const isCritical = mlPct < 120 && mlPct > 0;  // < 120% Danger فعلي (قريب من margin call)
                  const isWarning  = mlPct >= 120 && mlPct < 200;              // 120-200% Warning
                  const mlColor = isCritical ? '#FF4757' : isWarning ? '#FFB800' : '#00D4FF';
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: isCritical ? '4px 10px' : '4px 10px',
                      borderInlineEnd: '1px solid rgba(255,255,255,0.06)',
                      flexShrink: 0,
                      background: isCritical ? 'rgba(239,68,68,0.12)' : isWarning ? 'rgba(245,158,11,0.08)' : 'transparent',
                      borderRadius: isCritical || isWarning ? 4 : 0,
                      border: isCritical ? '1px solid rgba(239,68,68,0.4)' : isWarning ? '1px solid rgba(245,158,11,0.25)' : 'none',
                      animation: isCritical ? 'marginPulse 1.2s ease-in-out infinite' : 'none',
                    }}>
                      {isCritical && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={'#FF4757'} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/>
                          <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                      )}
                      <span style={{ fontSize: 11, color: isCritical ? '#FF4757' : isWarning ? '#FFB800' : '#6B7280', fontWeight: 700, fontFamily: "var(--font-ar)" }}>{tc('marginLevel')}</span>
                      <span dir="ltr" style={{
                        fontSize: isCritical ? 13 : 12, fontWeight: isCritical ? 900 : 700,
                        fontFamily: "var(--font-mono)",
                        color: mlColor,
                        textShadow: isCritical ? '0 0 8px rgba(239,68,68,0.6)' : 'none',
                      }}>
                        {equityValue > 0 ? mlPct.toFixed(1) : '0.0'}%
                      </span>
                      {isCritical && (
                        <span style={{ fontSize: 11, color: '#FF4757', fontWeight: 700, fontFamily: "var(--font-ar)" }}>⚠</span>
                      )}
                    </div>
                  );
                })()}
                {/* P&L */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 700, fontFamily: "var(--font-ar)" }}>P/L</span>
                  <span dir="ltr" style={{
                    fontSize: 13, fontWeight: unrealizedPnl !== 0 ? 800 : 600, fontFamily: "var(--font-mono)",
                    color: isProfitable ? '#00FFA3' : unrealizedPnl < 0 ? '#FF4757' : '#6B7280',
                  }}>
                    {isProfitable ? '+' : unrealizedPnl < 0 ? '-' : ''}{formatMoney(Math.abs(unrealizedPnl))}
                  </span>
                </div>

                <button
                  onClick={() => setPosOpen(prev => !prev)}
                  title={posOpen ? t('hidePositions') : t('showPositions')}
                  aria-label={posOpen ? t('hidePositions') : t('showPositions')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4, borderRadius: 'var(--radius-sm)', transition: 'all 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#00D4FF')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}
                >
                  <ChevronDown size={14} style={{ transform: posOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
                </button>
              </div>

              {/* Positions List — conditional render */}
              {posOpen && <AlpacaPositions />}
            </div>
          </div>

          {/* Right Panel — visible on ALL non-mobile screens (above 768px) */}
          <div className="dash-col dash-col-right animate-in-3" style={{ height: '100%', width: rightPanelCollapsed ? '40px' : '100%', minWidth: 0, overflow: 'hidden' }}>
              {mode === 'trader' && <RightPanelLayout quotes={quotes} />}
              {mode === 'investor' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                  <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <PortfolioMini dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} selectedSymbol={selectedSymbol} />
                  </div>
                  <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <WatchlistMini selectedSymbol={selectedSymbol} onSelectSymbol={handleSelectSymbol} />
                  </div>
                </div>
              )}
              {mode === 'ai' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                  <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <AlNarratorMini selectedSymbol={selectedSymbol} dataStatus={quoteStatus} />
                  </div>
                  <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <ScannerMini selectedSymbol={selectedSymbol} />
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
           MOBILE V2 — New Design
          ═══════════════════════════════════════════ */}
      {isMobileViewport && (
        <div className="m2-shell" dir={dir}>

          {/* ── HEADER: لوغو + Account Info ── */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'calc(env(safe-area-inset-top, 0px) + 8px) 14px 6px',
            borderBottom:'1px solid rgba(255,255,255,0.05)',
            flexShrink:0,
          }}>
            {/* Logo */}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{
                width:30, height:30, borderRadius:'50%',
                background:'linear-gradient(135deg,rgba(0,212,255,0.25),rgba(0,212,255,0.08))',
                border:'1.5px solid rgba(0,212,255,0.5)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize: 15,
              }}>🌙</div>
              <div>
                <div style={{ fontSize: 15, fontWeight:800, color:'#E8ECF4', fontFamily: "var(--font-ar)", lineHeight:1 }}>{t('brand')}</div>
                <div style={{ fontSize: 11, color:'rgba(0,212,255,0.7)', fontFamily: "var(--font-mono)", letterSpacing:'1px' }}>ROUA TRADING</div>
              </div>
            </div>
            {/* Info Balance */}
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize: 13, fontWeight:800, color:'#E8ECF4', fontFamily: "var(--font-mono)" }}>
                ${(Number(account?.balance ?? account?.equity) || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}
              </div>
              <div style={{ fontSize: 13, fontWeight:700, color: (Number(account?.unrealizedPnl)||0)>=0?'#00FFA3':'#FF4757', fontFamily: "var(--font-mono)" }}>
                {(Number(account?.unrealizedPnl)||0)>=0?'+':''}{(Number(account?.unrealizedPnl)||0).toFixed(2)}$
              </div>
            </div>
          </div>

          {/* ── TICKER STRIP — V429: Extracted to MobileTickerStrip for real-time updates ── */}
          {m2ActiveTab === 'chart' && <MobileTickerStrip onSelectSymbol={handleSelectSymbol} />}

          {/* ── CHART TOOLBAR ── */}
          {m2ActiveTab === 'chart' && (
          <div className="m2-chart-toolbar" style={{ gap:2, padding:'0 10px' }}>

            {/* ─ TF ─ */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <button type="button"
                onClick={() => { setM2ShowTf(!m2ShowTf); setM2ShowInd(false); setM2ShowAI(false); setM2ShowMarkets(false); setM2ShowDrawing(false); }}
                style={{
                  height:20, padding:'0 7px',
                  display:'flex', alignItems:'center', gap:3,
                  background: m2ShowTf ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.04)',
                  border: `1px solid ${m2ShowTf ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.18)'}`,
                  borderRadius: 'var(--radius-sm)', cursor:'pointer', flexShrink:0,
                  touchAction:'manipulation', WebkitTapHighlightColor:'transparent',
                }}>
                <span style={{ fontSize: 11, fontWeight:800, color: m2ShowTf?'#00D4FF':'rgba(0,212,255,0.7)', fontFamily: "var(--font-mono)", letterSpacing:'0.3px' }}>
                  {timeframe}
                </span>
                <svg width="6" height="4" viewBox="0 0 6 4" style={{ opacity:0.5 }}>
                  <path d="M0 0L3 4L6 0" fill={m2ShowTf?'#00D4FF':'rgba(0,212,255,0.7)'}/>
                </svg>
              </button>
              {m2ShowTf && (
                <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
                  onClick={() => setM2ShowTf(false)}>
                  <div style={{ background:'#0E1420', borderRadius:'16px 16px 0 0', border:'1px solid rgba(0,212,255,0.1)', borderBottom:'none', padding:'14px 14px calc(20px + env(safe-area-inset-bottom))' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ width:28, height:2, background:'rgba(255,255,255,0.08)', borderRadius: 'var(--radius-xs)', margin:'0 auto 12px' }}/>
                    <div style={{ fontSize: 11, color:'rgba(0,212,255,0.5)', fontWeight:700, marginBottom:10, fontFamily: "var(--font-mono)", letterSpacing:'1px' }}>TIMEFRAME</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {m2TFs.map(tf => (
                        <button key={tf} type="button"
                          onClick={() => { setTimeframe(tf); setM2ShowTf(false); }}
                          style={{ padding:'7px 12px', borderRadius: 'var(--radius-sm)', cursor:'pointer', fontSize: 13, fontFamily: "var(--font-mono)", fontWeight:700, background: tf===timeframe?'rgba(0,212,255,0.12)':'rgba(255,255,255,0.04)', border: tf===timeframe?'1px solid rgba(0,212,255,0.35)':'1px solid rgba(255,255,255,0.07)', color: tf===timeframe?'#00D4FF':'#6B7280' }}>
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* separator */}
            <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }}/>

            {/* ─ Drawing ─ */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <button type="button"
                onClick={() => { setM2ShowDrawing(!m2ShowDrawing); setM2ShowTf(false); setM2ShowInd(false); setM2ShowAI(false); setM2ShowMarkets(false); }}
                style={{
                  height:20, padding:'0 7px',
                  display:'flex', alignItems:'center', gap:3,
                  background: m2ShowDrawing ? 'rgba(139,92,246,0.12)' : 'transparent',
                  border: `1px solid ${m2ShowDrawing ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 'var(--radius-sm)', cursor:'pointer', flexShrink:0,
                  touchAction:'manipulation', WebkitTapHighlightColor:'transparent',
                }}>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path d="M1 9L7 3L8 2M7 3L9 1M2 8L4 6" stroke={m2ShowDrawing?'#B388FF':'#6B7280'} strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 11, fontWeight:600, color: m2ShowDrawing?'#B388FF':'#6B7280', fontFamily: "var(--font-ar)" }}>Drawing</span>
                <svg width="6" height="4" viewBox="0 0 6 4" style={{ opacity:0.4 }}>
                  <path d="M0 0L3 4L6 0" fill={m2ShowDrawing?'#B388FF':'#6B7280'}/>
                </svg>
              </button>
              {m2ShowDrawing && (
                <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
                  onClick={() => setM2ShowDrawing(false)}>
                  <div style={{ background:'#0E1420', borderRadius:'16px 16px 0 0', border:'1px solid rgba(139,92,246,0.1)', borderBottom:'none', padding:'14px 14px calc(20px + env(safe-area-inset-bottom))' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ width:28, height:2, background:'rgba(255,255,255,0.08)', borderRadius: 'var(--radius-xs)', margin:'0 auto 12px' }}/>
                    <div style={{ fontSize: 11, color:'rgba(139,92,246,0.5)', fontWeight:700, marginBottom:10, fontFamily: "var(--font-mono)", letterSpacing:'1px' }}>DRAWING TOOLS</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
                      {m2DrawTools.map(dt => (
                        <button key={dt.id} type="button"
                          onClick={() => { setM2ActiveTool(dt.id); setM2ShowDrawing(false); }}
                          style={{ padding:'10px 0', borderRadius: 'var(--radius-md)', cursor:'pointer', fontSize: 19, display:'flex', flexDirection:'column', alignItems:'center', background: m2ActiveTool===dt.id?'rgba(139,92,246,0.1)':'rgba(255,255,255,0.03)', border: m2ActiveTool===dt.id?'1px solid rgba(139,92,246,0.3)':'1px solid rgba(255,255,255,0.05)', color: m2ActiveTool===dt.id?'#B388FF':'#6B7280' }}>
                          {dt.icon}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* separator */}
            <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }}/>

            {/* ─ IND ─ */}
            <button type="button"
              onClick={() => { setM2ShowInd(!m2ShowInd); setM2ShowTf(false); setM2ShowAI(false); setM2ShowMarkets(false); setM2ShowDrawing(false); }}
              style={{
                height:20, padding:'0 7px',
                display:'flex', alignItems:'center', gap:3,
                background: m2ShowInd ? 'rgba(16,185,129,0.1)' : 'transparent',
                border: `1px solid ${m2ShowInd ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 'var(--radius-sm)', cursor:'pointer', flexShrink:0,
                touchAction:'manipulation', WebkitTapHighlightColor:'transparent',
              }}>
              <svg width="10" height="9" viewBox="0 0 10 9" fill="none">
                <path d="M0 7C2 7 2 2 4 2C6 2 6 7 8 7L10 7" stroke={m2ShowInd?'#10b981':'#6B7280'} strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 11, fontWeight:600, color: m2ShowInd?'#10b981':'#6B7280', fontFamily: "var(--font-mono)", letterSpacing:'0.3px' }}>IND</span>
              <svg width="6" height="4" viewBox="0 0 6 4" style={{ opacity:0.4 }}>
                <path d="M0 0L3 4L6 0" fill={m2ShowInd?'#10b981':'#6B7280'}/>
              </svg>
            </button>

            {/* separator */}
            <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }}/>

            {/* ─ AI ─ */}
            <button type="button"
              onClick={() => { setM2ShowAI(!m2ShowAI); setM2ShowTf(false); setM2ShowInd(false); setM2ShowMarkets(false); setM2ShowDrawing(false); }}
              style={{
                height:20, padding:'0 7px',
                display:'flex', alignItems:'center', gap:3,
                background: m2ShowAI ? 'rgba(168,85,247,0.1)' : 'transparent',
                border: `1px solid ${m2ShowAI ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 'var(--radius-sm)', cursor:'pointer', flexShrink:0,
                touchAction:'manipulation', WebkitTapHighlightColor:'transparent',
              }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <circle cx="4.5" cy="4.5" r="2" stroke={m2ShowAI?'#C084FC':'#6B7280'} strokeWidth="1.2"/>
                <path d="M4.5 1V0M4.5 9V8M1 4.5H0M9 4.5H8" stroke={m2ShowAI?'#C084FC':'#6B7280'} strokeWidth="1" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 11, fontWeight:700, color: m2ShowAI?'#C084FC':'#6B7280', fontFamily: "var(--font-mono)", letterSpacing:'0.5px' }}>AI</span>
              <svg width="6" height="4" viewBox="0 0 6 4" style={{ opacity:0.4 }}>
                <path d="M0 0L3 4L6 0" fill={m2ShowAI?'#C084FC':'#6B7280'}/>
              </svg>
            </button>

            {/* separator */}
            <div style={{ width:1, height:12, background:'rgba(255,255,255,0.06)', flexShrink:0 }}/>

            {/* ─ Markets ─ */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <button type="button"
                onClick={() => { setM2ShowMarkets(!m2ShowMarkets); setM2ShowTf(false); setM2ShowInd(false); setM2ShowAI(false); setM2ShowDrawing(false); }}
                style={{
                  height:20, padding:'0 7px',
                  display:'flex', alignItems:'center', gap:3,
                  background: m2ShowMarkets ? 'rgba(245,158,11,0.1)' : 'transparent',
                  border: `1px solid ${m2ShowMarkets ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 'var(--radius-sm)', cursor:'pointer', flexShrink:0,
                  touchAction:'manipulation', WebkitTapHighlightColor:'transparent',
                }}>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <rect x="0" y="5" width="2" height="4" fill={m2ShowMarkets?'#FFB800':'#6B7280'} rx="0.5"/>
                  <rect x="3.5" y="2.5" width="2" height="6.5" fill={m2ShowMarkets?'#FFB800':'#6B7280'} rx="0.5"/>
                  <rect x="7" y="0" width="2" height="9" fill={m2ShowMarkets?'#FFB800':'#6B7280'} rx="0.5"/>
                </svg>
                <span style={{ fontSize: 11, fontWeight:600, color: m2ShowMarkets?'#FFB800':'#6B7280', fontFamily: "var(--font-ar)" }}>وق</span>
                <svg width="6" height="4" viewBox="0 0 6 4" style={{ opacity:0.4 }}>
                  <path d="M0 0L3 4L6 0" fill={m2ShowMarkets?'#FFB800':'#6B7280'}/>
                </svg>
              </button>
              {m2ShowMarkets && (
                <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
                  onClick={() => setM2ShowMarkets(false)}>
                  <div style={{ background:'#0E1420', borderRadius:'16px 16px 0 0', border:'1px solid rgba(245,158,11,0.1)', borderBottom:'none', padding:'14px 14px calc(20px + env(safe-area-inset-bottom))' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ width:28, height:2, background:'rgba(255,255,255,0.08)', borderRadius: 'var(--radius-xs)', margin:'0 auto 12px' }}/>
                    <div style={{ fontSize: 11, color:'rgba(245,158,11,0.5)', fontWeight:700, marginBottom:10, fontFamily: "var(--font-mono)", letterSpacing:'1px' }}>MARKETS</div>
                    {[
                      { label:'CRYPTO', syms:['BTC/USD','ETH/USD','BNB/USD','SOL/USD','XRP/USD','DOGE/USD','ADA/USD'] },
                      { label:'FOREX',  syms:['EUR/USD','GBP/USD','USD/JPY','AUD/USD'] },
                      { label:'COMMODITIES', syms:['XAU/USD','XAG/USD'] },
                    ].map(g => (
                      <div key={g.label} style={{ marginBottom:10 }}>
                        <div style={{ fontSize: 11, color:'rgba(255,255,255,0.2)', marginBottom:5, fontFamily: "var(--font-mono)", letterSpacing:'0.8px' }}>{g.label}</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                          {g.syms.map(sym => (
                            <button key={sym} type="button"
                              onClick={() => { handleSelectSymbol(sym); setM2ShowMarkets(false); }}
                              style={{ padding:'5px 10px', borderRadius: 'var(--radius-sm)', cursor:'pointer', fontSize: 11, fontFamily: "var(--font-mono)", fontWeight:700, background: sym===selectedSymbol?'rgba(245,158,11,0.1)':'rgba(255,255,255,0.03)', border: sym===selectedSymbol?'1px solid rgba(245,158,11,0.3)':'1px solid rgba(255,255,255,0.06)', color: sym===selectedSymbol?'#FFB800':'#6B7280' }}>
                              {sym.split('/')[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
          )}

                    {/* IND Bottom Sheet */}
          {m2ShowInd && (
            <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
              onClick={() => setM2ShowInd(false)}>
              <div style={{
                background:'#111820', borderRadius:'16px 16px 0 0',
                border:'1px solid rgba(167,139,250,0.15)', borderBottom:'none',
                padding:'16px 16px 32px',
                boxShadow:'0 -20px 60px rgba(0,0,0,0.7)',
              }} onClick={e => e.stopPropagation()}>
                <div style={{ width:32, height:3, background:'rgba(255,255,255,0.12)', borderRadius: 'var(--radius-xs)', margin:'0 auto 14px' }}/>
                <div style={{ fontSize: 13, fontWeight:700, color:'#B388FF', marginBottom:12 }}>Technical Indicators</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {m2Indicators.map(ind => (
                    <button key={ind} type="button"
                      onClick={() => setM2ActiveInds(a => a.includes(ind)?a.filter(x=>x!==ind):[...a,ind])}
                      style={{
                        padding:'8px 14px', borderRadius: 'var(--radius-md)', cursor:'pointer', fontSize: 13,
                        border: m2ActiveInds.includes(ind)?'1px solid rgba(167,139,250,0.5)':'1px solid rgba(255,255,255,0.1)',
                        background: m2ActiveInds.includes(ind)?'rgba(167,139,250,0.15)':'rgba(255,255,255,0.04)',
                        color: m2ActiveInds.includes(ind)?'#C4B5FD':'#8090A8',
                        fontFamily: "var(--font-ar)",
                      }}>
                      {m2ActiveInds.includes(ind) ? '✓ ' : ''}{ind}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* AI Bottom Sheet */}
          {m2ShowAI && (
            <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
              onClick={() => setM2ShowAI(false)}>
              <div style={{
                background:'#0C1019', borderRadius:'16px 16px 0 0',
                border:'1px solid rgba(139,92,246,0.15)', borderBottom:'none',
                padding:'16px 16px 32px',
                boxShadow:'0 -20px 60px rgba(0,0,0,0.7)',
              }} onClick={e => e.stopPropagation()}>
                <div style={{ width:32, height:3, background:'rgba(255,255,255,0.12)', borderRadius: 'var(--radius-xs)', margin:'0 auto 14px' }}/>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
                  <span style={{ fontSize: 13, fontWeight:700, color:'#C4B5FD' }}>AI Smart Analysis</span>
                  <span style={{ fontSize: 13, color:'#6A7A90', fontFamily: "var(--font-mono)" }}>{selectedSymbol}</span>
                </div>
                <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                  {[{l:'Buy',v:'79%',c:'#00FFA3'},{l:'Neutral',v:'11%',c:'#FFB800'},{l:'Sell',v:'10%',c:'#FF4757'}].map(b => (
                    <div key={b.l} style={{
                      flex:1, padding:'12px 0', textAlign:'center', borderRadius: 'var(--radius-lg)',
                      background:`${b.c}18`, border:`1px solid ${b.c}44`,
                      fontSize: 17, fontWeight:800, color:b.c,
                    }}>
                      {b.v}<div style={{ fontSize: 11, opacity:0.7, marginTop:4 }}>{b.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color:'#6B7280', lineHeight:1.8, background:'rgba(255,255,255,0.03)', padding:'10px', borderRadius: 'var(--radius-md)' }}>
                  📍 Strong Support: {currentPrice ? (currentPrice*0.995).toFixed(currentPrice > 100 ? 2 : 5) : '—'}<br/>
                  🎯 Resistance: {currentPrice ? (currentPrice*1.008).toFixed(currentPrice > 100 ? 2 : 5) : '—'}<br/>
                  ⚡ Recommendation: Continue bullish direction short-term
                </div>
              </div>
            </div>
          )}

          {/* ── مركز Decision ── */}
          {m2ActiveTab === 'ai' && (
            <div style={{
              flex:1, overflowY:'auto', overflowX:'hidden',
              background:'#080B10', paddingBottom:70,
            }}>
              {/* Header */}
              <div style={{ padding:'12px 14px 8px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 15, fontWeight:800, color:'#F0F2F5', fontFamily: "var(--font-ar)" }}>
                  Decision Center
                </div>
                <div style={{ fontSize: 11, color:'#6B7280', fontFamily: "var(--font-ar)", marginTop:2 }}>
                  Executor · Agent · Council · Signals
                </div>
              </div>

              {/* Smart Executor */}
              <div style={{ margin:'10px 12px 0', borderRadius: 'var(--radius-lg)', overflow:'hidden', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ padding:'8px 12px', background:'rgba(0,212,255,0.05)', borderBottom:'1px solid rgba(0,212,255,0.08)', display:'flex', alignItems:'center', gap:6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={'#00D4FF'} strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  <span style={{ fontSize: 11, fontWeight:700, color:'#00D4FF', fontFamily: "var(--font-ar)" }}>Smart Executor</span>
                </div>
                <SmartExecutorPanel />
              </div>

              {/* Lazic — وكيل الTrading فائق Speed */}
              <div style={{ margin:'10px 12px 0', borderRadius: 'var(--radius-lg)', overflow:'hidden', border:'1px solid rgba(255,107,53,0.2)' }}>
                <div style={{ padding:'8px 12px', background:'rgba(255,107,53,0.06)', borderBottom:'1px solid rgba(255,107,53,0.12)', display:'flex', alignItems:'center', gap:6 }}>
                  {/* أيقونة دبور/صاعقة */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2.5">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  <span style={{ fontSize: 11, fontWeight:700, color:'#FF6B35', fontFamily: "var(--font-ar)" }}>Lazic</span>
                  <span style={{ fontSize: 11, color:'rgba(255,107,53,0.6)', marginRight:'auto' }}>OBI · Per Second</span>
                </div>
                <LazicPanel />
              </div>

              {/* الوكيل */}
              <div style={{ margin:'10px 12px 0', borderRadius: 'var(--radius-lg)', overflow:'hidden', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ padding:'8px 12px', background:'rgba(167,139,250,0.05)', borderBottom:'1px solid rgba(167,139,250,0.1)', display:'flex', alignItems:'center', gap:6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={'#B388FF'} strokeWidth="2.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  <span style={{ fontSize: 11, fontWeight:700, color:'#B388FF', fontFamily: "var(--font-ar)" }}>Auto Agent</span>
                </div>
                <AgentControlMini />
              </div>

              {/* Strategic Council */}
              <div style={{ margin:'10px 12px 0', borderRadius: 'var(--radius-lg)', overflow:'hidden', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ padding:'8px 12px', background:'rgba(245,158,11,0.05)', borderBottom:'1px solid rgba(245,158,11,0.1)', display:'flex', alignItems:'center', gap:6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={'#FFB800'} strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  <span style={{ fontSize: 11, fontWeight:700, color:'#FFB800', fontFamily: "var(--font-ar)" }}>Strategic Council</span>
                </div>
                <StrategicCouncilPanel />
              </div>

              {/* Signals Scanner */}
              <div style={{ margin:'10px 12px 0', borderRadius: 'var(--radius-lg)', overflow:'hidden', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ padding:'8px 12px', background:'rgba(0,255,163,0.04)', borderBottom:'1px solid rgba(0,255,163,0.08)', display:'flex', alignItems:'center', gap:6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={'#00FFA3'} strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  <span style={{ fontSize: 11, fontWeight:700, color:'#00FFA3', fontFamily: "var(--font-ar)" }}>Signals Scanner</span>
                </div>
                <ScannerMini mobile />
              </div>

            </div>
          )}

          {/* ── CHART AREA ── */}
          {/* ── TAB: Positions ── */}
          {m2ActiveTab === 'positions' && (
            <div style={{ flex:1, overflow:'auto', display:'flex', flexDirection:'column' }}>

              {/* بطاقة الAccount */}
              <div style={{ margin:'6px 12px 4px', background:'rgba(0,212,255,0.03)', border:'1px solid rgba(0,212,255,0.08)', borderRadius: 'var(--radius-lg)', padding:'10px 12px' }}>
                {/* P&L — أعلى المنتصف، الأهم للمTrading */}
                {(() => {
                  const pnl = Number(account?.unrealizedPnl)||0
                  const isPos = pnl >= 0
                  return (
                    <div style={{ textAlign:'center', marginBottom:8, paddingBottom:8, borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 11, color:'#6A7A90', fontFamily: "var(--font-ar)", marginBottom:4 }}>Profit / Loss</div>
                      <div style={{ fontSize: 22, fontWeight:900, color:isPos?'#00FFA3':'#FF4757', fontFamily: "var(--font-mono)", lineHeight:1 }}>
                        {isPos?'+':''}{pnl.toFixed(2)}$
                      </div>
                    </div>
                  )
                })()}
                {/* Balance + Balance Current */}
                <div style={{ marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize: 11, color:'#8090A8', fontFamily: "var(--font-ar)", marginBottom:1 }}>Balance</div>
                    <div style={{ fontSize: 17, fontWeight:800, color:'#E8ECF4', fontFamily: "var(--font-mono)" }}>
                      ${(Number(account?.cash||account?.portfolioValue)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </div>
                  </div>
                  <div style={{ marginTop:6 }}>
                    <div style={{ fontSize: 11, color:'#8090A8', fontFamily: "var(--font-ar)", marginBottom:2 }}>Balance Current</div>
                    <div style={{ fontSize: 13, fontWeight:700, color:'#B0C0D0', fontFamily: "var(--font-mono)" }}>
                      ${(Number(account?.balance ?? account?.equity)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </div>
                  </div>
                </div>
                {/* الMargin + Margin مستخدم + Margin Level */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, paddingTop:8, borderTop:'1px solid rgba(255,255,255,0.05)' }}>
                  {[
                    { label:'الMargin', value:`$${(Number(account?.buyingPower)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`, color:'#34D399' },
                    { label:'Margin مستخدم', value:`$${(Number(account?.initialMargin)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`, color:'#FFB800' },
                    { label:'Margin Level', value: (Number(account?.initialMargin)||0) > 0 ? `${((Number(account?.equity)||0) / (Number(account?.initialMargin)||1) * 100).toFixed(0)}%` : '—', color:'#00D4FF' },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 11, color:'#8090A8', marginBottom:3, fontFamily: "var(--font-ar)" }}>{item.label}</div>
                      <div style={{ fontSize: 13, fontWeight:700, color:item.color, fontFamily: "var(--font-mono)" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* تبويبان */}
              <div style={{ display:'flex', margin:'0 12px 4px', background:'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', padding:2, gap:2 }}>
                {(['open','closed'] as const).map(tab => (
                  <button key={tab} type="button" onClick={() => { setM2PositionsTab(tab); if(tab==='closed') fetchClosedPositions(closedDateFilter); }}
                    style={{ flex:1, padding:'5px 0', borderRadius: 'var(--radius-sm)', border:'none', cursor:'pointer', background: m2PositionsTab===tab?'rgba(0,212,255,0.1)':'transparent', color: m2PositionsTab===tab?'#00D4FF':'#7A8A9A', fontSize: 11, fontWeight:700, fontFamily: "var(--font-ar)", touchAction:'manipulation' }}>
                    {tab==='open' ? `مفتوحة (${positions.length})` : `مغلقة (${closedPositions.length})`}
                  </button>
                ))}
              </div>

              {/* أزرار فلتر المغلقة + إجمالي Profit/Loss */}
              {m2PositionsTab === 'closed' && (
                <div style={{ margin:'0 12px 4px' }}>
                  <div style={{ display:'flex', gap:3, marginBottom:4 }}>
                    {(['day','week','month','year','all'] as const).map(f => {
                      const labels = {day:'يومي',week:'أسبوعي',month:'شهري',year:'سنوي',all:'All'}
                      return (
                        <button key={f} type="button"
                          onClick={() => { setClosedDateFilter(f); fetchClosedPositions(f); }}
                          style={{ flex:1, padding:'3px 0', borderRadius: 'var(--radius-sm)', border:`1px solid ${closedDateFilter===f?'rgba(0,212,255,0.3)':'rgba(255,255,255,0.06)'}`, background: closedDateFilter===f?'rgba(0,212,255,0.08)':'transparent', color: closedDateFilter===f?'#00D4FF':'#7A8A9A', fontSize: 11, fontFamily: "var(--font-ar)", cursor:'pointer', touchAction:'manipulation' }}>
                          {labels[f]}
                        </button>
                      )
                    })}
                  </div>
                  {closedPositions.length > 0 && (
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 6px', background:'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border:'1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 11, color:'#6A7A90', fontFamily: "var(--font-ar)" }}>
                        إجمالي {closedPositions.length} صفقة
                      </span>
                      <span style={{ fontSize: 13, fontWeight:800, fontFamily: "var(--font-mono)", color: closedPnlTotal >= 0 ? '#00FFA3' : '#FF4757' }}>
                        {closedPnlTotal >= 0 ? '+' : ''}{closedPnlTotal.toFixed(2)}$
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* الصفقات */}
              <div style={{ flex:1, overflow:'auto', padding:'0 12px 16px' }}>
                {positions.length === 0
                  ? <div style={{ textAlign:'center', padding:'40px 0', color:'#2A3548', fontSize: 13, fontFamily: "var(--font-ar)" }}>لا توجد صفقات مفتوحة</div>
                  : positions.map((pos:any) => {
                      const pnl = Number(pos.unrealizedPnl)||0
                      const isPos = pnl >= 0
                      const ep = Number(pos.avgEntryPrice||pos.entryPrice)||0
                      const cp = Number(pos.currentPrice)||0
                      const dec = ep > 100 ? 2 : 4
                      const posKey = pos.id || pos.dbId || pos.symbol
                      const isExpanded = expandedPositionId === posKey
                      return (
                        <div key={posKey}
                          onClick={() => setExpandedPositionId(isExpanded ? null : posKey)}
                          style={{ background:isPos?'rgba(0,255,163,0.03)':'rgba(255,71,87,0.03)', border:`1px solid ${isPos?'rgba(0,255,163,0.1)':'rgba(255,71,87,0.1)'}`, borderRadius: 'var(--radius-lg)', padding:'10px 12px', marginBottom:7, cursor:'pointer', userSelect:'none' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ fontSize: 13, fontWeight:800, color:'#F0F2F5', fontFamily: "var(--font-mono)" }}>{pos.symbol}</span>
                              <span style={{ fontSize: 11, padding:'2px 6px', borderRadius: 'var(--radius-sm)', fontWeight:700, background:pos.side==='BUY'?'rgba(0,255,163,0.08)':'rgba(255,71,87,0.08)', color:pos.side==='BUY'?'#00FFA3':'#FF4757', border:`1px solid ${pos.side==='BUY'?'rgba(0,255,163,0.15)':'rgba(255,71,87,0.15)'}` }}>{pos.side==='BUY'?'Buy':'Sell'}</span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <span style={{ fontSize: 11, color:'#A0B0C0', fontFamily: "var(--font-mono)" }}>{Number(pos.qty||pos.quantity||0).toFixed(3)}</span>
                              <span style={{ fontSize: 15, fontWeight:800, color:isPos?'#00FFA3':'#FF4757', fontFamily: "var(--font-mono)" }}>{isPos?'+':''}{pnl.toFixed(2)}$</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color:'#8090A8', fontFamily: "var(--font-mono)", marginTop:3 }}>@ {cp > 0 ? cp.toFixed(dec) : '—'}</div>
                          {isExpanded && (
                            <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
                                {[
                                  ['دخول', ep.toFixed(dec)],
                                  ['SL', (pos.sl||pos.stopLoss) ? Number(pos.sl||pos.stopLoss).toFixed(dec) : '—'],
                                  ['TP', (pos.tp||pos.takeProfit) ? Number(pos.tp||pos.takeProfit).toFixed(dec) : '—'],
                                  ['تاريخ الOpen', pos.openedAt ? new Date(pos.openedAt).toLocaleString('ar',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'],
                                  ['Source', (pos.tradeSource||pos.source)==='smart_executor'?'AI':'وكيل'],
                                  ['Size الكامل', Number(pos.qty||pos.quantity||0).toFixed(5)],
                                ].map(([l,v]) => (
                                  <div key={String(l)}>
                                    <div style={{ fontSize: 11, color:'#7080A0', fontFamily: "var(--font-mono)", marginBottom:2 }}>{l}</div>
                                    <div style={{ fontSize: 11, color:'#B0C4D8', fontFamily: "var(--font-mono)", fontWeight:600 }}>{v}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                }
                {m2PositionsTab === 'closed' && (
                  <>
                    {loadingClosed ? (
                      <div style={{ textAlign:'center', padding:'40px 0', color:'#6B7280', fontSize: 13 }}>جارٍ التحميل...</div>
                    ) : closedPositions.length === 0 ? (
                      <div style={{ textAlign:'center', padding:'40px 0', color:'#2A3548', fontSize: 13, fontFamily: "var(--font-ar)" }}>لا توجد صفقات مغلقة</div>
                    ) : (
                      closedPositions.slice(0,20).map((pos:any) => {
                        const pnl = Number(pos.realizedPnl||pos.pnl||0)
                        const isPos = pnl >= 0
                        const ep = Number(pos.entryPrice||0)
                        const dec = ep > 100 ? 2 : 4
                        return (
                          <div key={pos.id} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--radius-lg)', padding:'10px 12px', marginBottom:7 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ fontSize: 13, fontWeight:800, color:'#D0E0F0', fontFamily: "var(--font-mono)" }}>{pos.symbol}</span>
                                <span style={{ fontSize: 11, padding:'2px 6px', borderRadius: 'var(--radius-sm)', fontWeight:700, background:pos.side==='BUY'?'rgba(0,255,163,0.06)':'rgba(255,71,87,0.06)', color:pos.side==='BUY'?'rgba(0,255,163,0.6)':'rgba(255,71,87,0.6)', border:`1px solid ${pos.side==='BUY'?'rgba(0,255,163,0.1)':'rgba(255,71,87,0.1)'}` }}>{pos.side==='BUY'?'Buy':'Sell'}</span>
                                <span style={{ fontSize: 11, color:'#6B7280', fontFamily: "var(--font-mono)" }}>
                                  {({'STOP_LOSS':'SL وقف','STOP_LOSS_HIT':'SL وقف','TAKE_PROFIT':'TP هدف','TAKE_PROFIT_HIT':'TP هدف','TIME_EXPIRED':'منتهي Time','AUTO_CLOSE':'Close تلقائي','AUTO_STALE':'تلقائي (قديم)','MANUAL':'يدوي','USER_MANUAL':'يدوي','STRATEGY_EXIT':'استراتيجية','EMERGENCY_STOP':'طوارئ','EXCHANGE_SYNC':'مزامنة','FORCE_CLOSE':'Close إجباري','DISPUTED':'متنازع'}[pos.closeReason]||pos.closeReason||'')}</span>
                              </div>
                              <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize: 15, fontWeight:800, color:isPos?'rgba(0,255,163,0.7)':'rgba(255,71,87,0.7)', fontFamily: "var(--font-mono)" }}>{isPos?'+':''}{pnl.toFixed(2)}$</div>
                                <div style={{ fontSize: 11, color:'#6B7280', fontFamily: "var(--font-mono)" }}>{pos.closedAt?new Date(pos.closedAt).toLocaleDateString('ar',{month:'short',day:'numeric'}):''}</div>
                              </div>
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4 }}>
                              {[['دخول',ep.toFixed(dec)],['Close',(Number(pos.exitPrice||pos.closePrice||0)).toFixed(dec)],['حجم',Number(pos.quantity||0).toFixed(3)]].map(([l,v])=>(
                                <div key={l}><div style={{ fontSize: 11, color:'#7A8A9A', fontFamily: "var(--font-mono)" }}>{l}</div><div style={{ fontSize: 11, color:'#A0B4C8', fontFamily: "var(--font-mono)", fontWeight:600 }}>{v}</div></div>
                              ))}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── الشارت + toolbar — يظهر فقط في تاب الشارت ── */}
                    <div className="m2-chart-area" style={{ display: (m2ActiveTab==='positions' || m2ActiveTab==='ai') ? 'none' : undefined }}>

            {/* OHLC Info Bar — يظهر فقط في تاب الشارت */}
            {m2ActiveTab === 'chart' &&
            <div style={{
              position:'absolute', top:0, left:0, right:0,
              height:28, zIndex:10,
              overflow:'hidden',
              padding:'3px 8px 0',
              background:'rgba(10,13,19,0.95)',
              borderBottom:'1px solid rgba(255,255,255,0.06)',
              pointerEvents:'none',
            }}>
              {/* السطر الأول: Pair + OHLC مثل MT5 */}
              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span style={{ fontSize: 11, fontWeight:800, color:'#00D4FF', fontFamily: "var(--font-mono)", letterSpacing:'0.3px' }}>
                  {selectedSymbol}
                </span>
                <span style={{ fontSize: 11, color:'rgba(140,160,185,0.6)', fontFamily: "var(--font-mono)" }}>
                  {timeframe}
                </span>
                {activeQuote && (
                  <>
                    <span style={{ fontSize: 11, color:'rgba(140,160,185,0.7)', fontFamily: "var(--font-mono)" }}>
                      {activeQuote.open ? formatQuotePrice(activeQuote.open) : '—'}
                    </span>
                    <span style={{ fontSize: 11, color:'#00FFA3', fontFamily: "var(--font-mono)" }}>
                      {activeQuote.high ? formatQuotePrice(activeQuote.high) : '—'}
                    </span>
                    <span style={{ fontSize: 11, color:'#FF4757', fontFamily: "var(--font-mono)" }}>
                      {activeQuote.low ? formatQuotePrice(activeQuote.low) : '—'}
                    </span>
                    <span style={{ fontSize: 11, fontWeight:700, color:'#E8ECF4', fontFamily: "var(--font-mono)" }}>
                      {currentPrice ? formatQuotePrice(currentPrice) : '—'}
                    </span>
                    {(activeQuote.changePercent ?? 0) !== 0 && (
                      <span style={{
                        fontSize: 11, fontWeight:700,
                        color: (activeQuote.changePercent ?? 0) >= 0 ? '#00FFA3' : '#FF4757',
                      }}>
                        {(activeQuote.changePercent ?? 0) >= 0 ? '+' : ''}{(activeQuote.changePercent ?? 0).toFixed(2)}%
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>}

            {m2ActiveTab === 'chart' && <div style={{
              position:'absolute', top:28, left:0, right:0, zIndex:15,
              background:'rgba(10,13,19,0.98)',
              borderBottom:'1px solid rgba(255,255,255,0.05)',
              display:'flex', alignItems:'stretch', height:44,
            }}>
              {/* SELL */}
              <button type="button"
                onClick={() => { setM2OrderSide('sell'); setM2ConfirmSheet(true); }}
                style={{
                  flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', gap:1,
                  background:'rgba(127,29,29,0.6)',
                  border:'none', borderRight:'1px solid rgba(255,255,255,0.06)',
                  cursor:'pointer',
                }}>
                <span style={{ fontSize: 11, color:'rgba(248,113,113,0.55)', letterSpacing:'1px', fontFamily: "var(--font-ar)" }}>Sell</span>
                <span style={{ fontSize: 13, fontWeight:800, color:'#FF4757', fontFamily: "var(--font-mono)", letterSpacing:'-0.3px' }}>
                  {currentPrice ? (currentPrice * 0.99995).toFixed(currentPrice > 100 ? 2 : 5) : '—'}
                </span>
              </button>

              {/* حجم العقد في المنتصف */}
              <div style={{
                display:'flex', alignItems:'center',
                background:'rgba(255,255,255,0.03)',
                borderLeft:'none', borderRight:'none',
                padding:'0 2px',
              }}>
                <button type="button"
                  onClick={() => setM2Qty(q => String(Math.max(0.01, parseFloat(q)-0.01).toFixed(2)))}
                  style={{ background:'none', border:'none', color:'#6A7A90', fontSize: 17, cursor:'pointer', padding:'0 8px', lineHeight:1 }}>−</button>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minWidth:42 }}>
                  <span style={{ fontSize: 11, fontWeight:700, color:'#E8ECF4', fontFamily: "var(--font-mono)" }}>{m2Qty}</span>
                  <span style={{ fontSize: 11, color:'#6B7280' }}>lot</span>
                </div>
                <button type="button"
                  onClick={() => setM2Qty(q => String((parseFloat(q)+0.01).toFixed(2)))}
                  style={{ background:'none', border:'none', color:'#6A7A90', fontSize: 17, cursor:'pointer', padding:'0 8px', lineHeight:1 }}>+</button>
                <button type="button"
                  onClick={() => setTradeDialogOpen(true)}
                  style={{ background:'none', border:'none', color:'#6B7280', cursor:'pointer', padding:'0 6px', fontSize: 15, borderLeft:'1px solid rgba(255,255,255,0.06)' }}>⚙</button>
              </div>

              {/* BUY */}
              <button type="button"
                onClick={() => { setM2OrderSide('buy'); setM2ConfirmSheet(true); }}
                style={{
                  flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', gap:1,
                  background:'rgba(22,101,52,0.6)',
                  border:'none', borderLeft:'1px solid rgba(255,255,255,0.06)',
                  cursor:'pointer',
                }}>
                <span style={{ fontSize: 11, color:'rgba(74,222,128,0.55)', letterSpacing:'1px', fontFamily: "var(--font-ar)" }}>Buy</span>
                <span style={{ fontSize: 13, fontWeight:800, color:'#4ADE80', fontFamily: "var(--font-mono)", letterSpacing:'-0.3px' }}>
                  {currentPrice ? (currentPrice * 1.00005).toFixed(currentPrice > 100 ? 2 : 5) : '—'}
                </span>
              </button>
            </div>}

                        {/* الشارت — hideToolbar لأن toolbar الجديد يحل محله */}
            <RouaChart
              currentPrice={currentPrice}
              mobile
              hideToolbar
              isChartFullscreen={chartFullscreen}
              onToggleChartFullscreen={toggleChartFullscreen}
              onSLTPDrag={async (key, type, newPrice) => {
                const match = key.match(/^pos-(.+)-(sl|tp)$/);
                if (!match) return;
                const positionId = match[1];
                try {
                  await fetch(`/api/trading/positions/${positionId}/levels`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(type === 'sl' ? { stopLoss: newPrice } : { takeProfit: newPrice }),
                  });
                  fetchPositions();
                } catch (err) {
                  console.error('Failed to update SL/TP:', err);
                }
              }}
            />


          </div>

          {/* ── BOTTOM NAVBAR ── */}
          <div className="m2-bottom-nav">
            {m2NavItems.map(item => {
              const active = m2ActiveTab === item.id
              return (
                <button key={item.id} type="button"
                  onClick={() => {
                    haptic.selection();
                    setM2ActiveTab(item.id)
                    if (item.id === 'menu') setM2ShowMore(true)
                    else if (item.id === 'portfolio') router.push('/dashboard/portfolio')
                    else if (item.id === 'scanner')   router.push('/dashboard/scanner')
                    // AI tab is now inline decision center
                    else if (item.id === 'chart')     router.push('/dashboard')
                  }}
                  style={{
                    flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                    padding:'6px 4px', background:'none', border:'none', cursor:'pointer',
                    position:'relative',
                  }}>
                  {active && (
                    <div style={{
                      position:'absolute', top:0, left:'50%', transform:'translateX(-50%)',
                      width:28, height:2,
                      background:'linear-gradient(90deg,#00D4FF,#00FFA3)',
                      borderRadius:'0 0 3px 3px',
                    }}/>
                  )}
                  {/* Nav icons */}
                  {item.id === 'chart' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#00D4FF':'#6B7280'} strokeWidth="2"><rect x="2" y="5" width="4" height="14" rx="1"/><line x1="4" y1="2" x2="4" y2="5"/><line x1="4" y1="19" x2="4" y2="22"/><rect x="10" y="8" width="4" height="9" rx="1"/><line x1="12" y1="4" x2="12" y2="8"/><line x1="12" y1="17" x2="12" y2="21"/><rect x="18" y="6" width="4" height="11" rx="1"/><line x1="20" y1="3" x2="20" y2="6"/><line x1="20" y1="17" x2="20" y2="20"/></svg>}
                  {item.id === 'portfolio' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#00D4FF':'#6B7280'} strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>}
                  {item.id === 'scanner' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#00D4FF':'#6B7280'} strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                  {item.id === 'ai' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#B388FF':'#6B7280'} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>}
                  {item.id === 'menu' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#00D4FF':'#6B7280'} strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
                  <span style={{ fontSize: 11, fontWeight:active?700:400, color:active?'#00D4FF':'#6A7A90', fontFamily: "var(--font-ar)" }}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── MORE MENU: كل صفحات المنصة ── */}
          {m2ShowMore && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
              onClick={() => setM2ShowMore(false)}>
              <div style={{
                background:'#0C1019', borderRadius:'18px 18px 0 0',
                border:'1px solid rgba(255,255,255,0.08)', borderBottom:'none',
                padding:'14px 14px 40px', maxHeight:'80vh', overflowY:'auto',
              }} onClick={e => e.stopPropagation()}>
                <div style={{ width:32, height:3, background:'rgba(255,255,255,0.1)', borderRadius: 'var(--radius-xs)', margin:'0 auto 14px' }}/>
                <div style={{ fontSize: 13, fontWeight:800, color:'#E8ECF4', fontFamily: "var(--font-ar)", marginBottom:14 }}>كل الصفحات</div>
                {[
                  { title:'الTrading', items:[
                    { label:'المSaveة', icon:'💼', href:'/dashboard/portfolio' },
                    { label:'المراكز', icon:'📋', href:'/dashboard/positions' },
                    { label:'الSignals', icon:'📡', href:'/dashboard/signals' },
                    { label:'الTrading الاجتماعي', icon:'👥', href:'/dashboard/copy-trading' },
                  ]},
                  { title:'الAnalysis', items:[
                    { label:'الNews', icon:'📰', href:'/dashboard/news' },
                    { label:'Scanner', icon:'🔍', href:'/dashboard/scanner' },
                    { label:'Markets التنبؤ', icon:'🔮', href:'/dashboard/prediction-market' },
                    { label:'الارتباط', icon:'🕸️', href:'/dashboard/correlation' },
                    { label:'الشبكة العصبية', icon:'🧠', href:'/dashboard/neural' },
                  ]},
                  { title:'الذكاء الاصطناعي', items:[
                    { label:'Strategic Council', icon:'🏛️', href:'/dashboard/council' },
                    { label:'مجلس AI', icon:'🧠', href:'/dashboard/ai' },
                    { label:'Auto Agent', icon:'🤖', href:'/dashboard/autonomous-trader' },
                    { label:'الملاذ', icon:'🛡️', href:'/dashboard/sanctuary' },
                    { label:'الاستراتيجيات', icon:'🎯', href:'/dashboard/strategies' },
                  ]},
                  { title:'الAccount', items:[
                    { label:'الSettings', icon:'⚙️', href:'/dashboard/settings' },
                    { label:'الأمان', icon:'🔒', href:'/dashboard/security/2fa' },
                    { label:'الإشعارات', icon:'🔔', href:'/dashboard/notifications' },
                    { label:'المساعدة', icon:'❓', href:'/dashboard/help' },
                  ]},
                ].map(section => (
                  <div key={section.title} style={{ marginBottom:16 }}>
                    <div style={{ fontSize: 11, color:'#6B7280', letterSpacing:'1px', textTransform:'uppercase', marginBottom:8, fontFamily: "var(--font-ar)" }}>{section.title}</div>
                    <div style={{ background:'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-lg)', border:'1px solid rgba(255,255,255,0.06)', overflow:'hidden' }}>
                      {section.items.map((item, ii) => (
                        <button key={item.href} type="button"
                          onClick={() => { router.push(item.href); setM2ShowMore(false); }}
                          style={{
                            width:'100%', display:'flex', alignItems:'center', gap:12,
                            padding:'11px 14px', background:'none', border:'none',
                            borderBottom: ii < section.items.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                            cursor:'pointer',
                          }}>
                          <span style={{ fontSize: 17 }}>{item.icon}</span>
                          <span style={{ flex:1, fontSize: 13, color:'#9CA3B5', fontFamily: "var(--font-ar)", fontWeight:500, textAlign:'right' }}>{item.label}</span>
                          <span style={{ fontSize: 13, color:'#6B7280' }}>›</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ORDER CONFIRM SHEET ── */}
          {m2ConfirmSheet && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'flex-end' }}
              onClick={() => setM2ConfirmSheet(false)}>
              <div style={{ width:'100%', background:'#0F1520', borderRadius:'18px 18px 0 0', border:'1px solid rgba(255,255,255,0.07)', borderBottom:'none', padding:'16px 18px 40px' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ width:32, height:3, background:'rgba(255,255,255,0.1)', borderRadius: 'var(--radius-xs)', margin:'0 auto 16px' }}/>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
                  <span style={{ fontSize: 15, fontWeight:800, color:'#E8ECF4', fontFamily: "var(--font-ar)" }}>
                    Confirm {m2OrderSide==='buy'?'الBuy':'الSell'} · {selectedSymbol}
                  </span>
                  <span style={{ fontSize: 13, fontWeight:700, color:'#6A7A90', fontFamily: "var(--font-mono)" }}>
                    {currentPrice ? formatQuotePrice(currentPrice) : '—'}
                  </span>
                </div>
                {[
                  {l:'نوع الأمر', v:'سوق فوري'},
                  {l:'حجم العقد', v:m2Qty},
                  {l:'Value Allية', v:currentPrice?`$${(parseFloat(m2Qty)*currentPrice).toFixed(2)}`:'—'},
                ].map(row => (
                  <div key={row.l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 13, color:'#6B7280' }}>{row.l}</span>
                    <span style={{ fontSize: 13, fontWeight:700, color:'#C8D0DC', fontFamily: "var(--font-mono)" }}>{row.v}</span>
                  </div>
                ))}
                <button type="button"
                  onClick={() => { setTradeDialogOpen(true); setM2ConfirmSheet(false); }}
                  style={{
                    width:'100%', marginTop:16, padding:'14px', borderRadius: 'var(--radius-lg)', border:'none',
                    background: m2OrderSide==='buy'?'linear-gradient(135deg,#00FFA3,#00C48C)':'linear-gradient(135deg,#FF4757,#E0283A)',
                    color: m2OrderSide==='buy'?'#000':'#fff',
                    fontSize: 15, fontWeight:800, cursor:'pointer', fontFamily: "var(--font-ar)",
                    boxShadow: m2OrderSide==='buy'?'0 6px 24px rgba(0,255,163,0.28)':'0 6px 24px rgba(255,71,87,0.28)',
                  }}>
                  Confirm {m2OrderSide==='buy'?'الBuy':'الSell'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trade Dialog (bottom sheet) — mobile only now, desktop uses inline overlay */}
      {isMobileViewport && tradeDialogOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            animation: 'fadeIn 0.15s ease-out',
          }}
          onClick={() => setTradeDialogOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxHeight: '85dvh',
              background: 'linear-gradient(180deg, rgba(17,21,32,0.97) 0%, rgba(11,14,20,0.99) 100%)',
              backdropFilter: 'blur(24px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              border: '1px solid rgba(0,212,255,0.12)',
              borderBottom: 'none',
              overflow: 'hidden',
              animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
              boxShadow: '0 0 60px rgba(0,212,255,0.08), 0 24px 80px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle — mobile only */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.15)' }} />
            </div>

            {/* Header with glassmorphism */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '4px 16px 12px',
              borderBottom: '1px solid rgba(0,212,255,0.08)',
              background: 'linear-gradient(90deg, rgba(0,212,255,0.06), transparent 60%)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-lg)',
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,255,163,0.1))',
                  border: '1px solid rgba(0,212,255,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 12px rgba(0,212,255,0.15)',
                }}>
                  <Zap size={14} color={'#00D4FF'} />
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-ar)", fontSize: 15, fontWeight: 800, color: '#F0F2F5' }}>{t('executeOrders')}</div>
                  <div style={{ fontSize: 11, color: '#9CA3B5', fontFamily: "var(--font-mono)" }}>{selectedSymbol} · {formatQuotePrice(currentPrice)}</div>
                </div>
              </div>
              <button
                onClick={() => setTradeDialogOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-lg)',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#9CA3B5', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#F0F2F5' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#9CA3B5' }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Mobile QuickExecutionMini */}
            <div style={{ maxHeight: 'calc(85dvh - 80px)', overflowY: 'auto' }}>
              <QuickExecutionMini
                mobile={true}
                dataStatus={quoteStatus}
                lastUpdatedAt={activeQuote?.timestamp ?? null}
                sourceLabel={sourceLabel}
              />
            </div>
          </div>
        </div>
      )}

      {/* V554: Sidebar Drawer — mobile only (compact desktop now has fixed sidebar) */}
      {isMobileViewport && sidebarDrawerOpen && (
        <SidebarDrawer
          open={sidebarDrawerOpen}
          onClose={() => setSidebarDrawerOpen(false)}
          onPin={() => setSidebarPinned(true)}
          pinned={sidebarPinned}
        >
          <PrimarySidebarLayout />
        </SidebarDrawer>
      )}

      {/* V554: FAB button — mobile only */}
      {isMobileViewport && !sidebarDrawerOpen && (
        <button
          type="button"
          className="sidebar-fab sidebar-fab--pulsing"
          onClick={() => setSidebarDrawerOpen(true)}
          title={t('openSidebar')}
          aria-label={t('openSidebar')}
        >
          <PanelRight size={22} />
        </button>
      )}

      {/* FAB hidden — mobile uses bottom nav "More" tab instead */}

      {/* Mobile drawer */}
      {isMobileViewport && sidebarDrawerOpen && (
        <SidebarDrawer
          open={sidebarDrawerOpen}
          onClose={() => setSidebarDrawerOpen(false)}
        >
          <PrimarySidebarLayout />
        </SidebarDrawer>
      )}
    </>
  )
}
