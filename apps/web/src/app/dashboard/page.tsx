'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import type { QuoteData } from '@/hooks/useMarketStore'
import { ChevronDown, PanelRight, Zap, X, Target } from 'lucide-react'
import { fmtPriceLocale } from '@/lib/price-format'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { PrimarySidebarLayout } from '@/components/dashboard/layouts/PrimarySidebarLayout'
import { SidebarDrawer } from '@/components/dashboard/layouts/SidebarDrawer'
import { RightPanelLayout } from '@/components/dashboard/layouts/RightPanelLayout'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { getDataStatus, getSourceLabel, getStatusLabel, getStatusTone, type DataStatus } from '@/lib/dashboard-live'
import { T as SharedT } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { getSymbolLeverage } from '@/lib/margin-calculator'
import { useSidebarState } from '@/hooks/useSidebarState'

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

const T = {
  bg: SharedT.bg,
  bg2: SharedT.bg2,
  card: SharedT.card,
  border: SharedT.border,
  cyan: SharedT.cyan,
  success: SharedT.success,
  danger: SharedT.danger,
  warning: SharedT.warning,
  info: SharedT.info,
  text: SharedT.text,
  text2: SharedT.text2,
  text3: SharedT.text3,
  gradientProfit: SharedT.gradientProfit,
  gradientLoss: SharedT.gradientLoss,
  gradientInfo: SharedT.gradientInfo,
}

const HEADER_H = 108
const PANEL_H = 30


// Mode configuration — determines UI accent and available features per mode
const MODE_CONFIG: Record<TradingMode, { accent: string; glowBg: string; label: string }> = {
  trader: {
    accent: '#00d4ff',
    glowBg: 'rgba(0,212,255,0.04)',
    label: 'Trader',
  },
  investor: {
    accent: '#10b981',
    glowBg: 'rgba(16,185,129,0.04)',
    label: 'Investor',
  },
  ai: {
    accent: '#a78bfa',
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
    borderRadius: 10,
    color: color || T.text,
    fontSize: isMobile ? 14 : 13,
    padding: isMobile ? '12px 14px' : '10px 12px',
    fontFamily: "'JetBrains Mono', monospace",
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
        borderRadius: 14,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button
          onClick={() => setOrderSide('buy')}
          style={{
            padding: isMobile ? '14px 0' : '12px 0',
            borderRadius: 10,
            border: 'none',
            background: orderSide === 'buy'
              ? 'linear-gradient(135deg, #00FFA3, #10B981)'
              : 'rgba(0,255,163,0.06)',
            color: orderSide === 'buy' ? '#fff' : '#6B7280',
            fontSize: 14,
            fontWeight: 800,
            fontFamily: "'Cairo', sans-serif",
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: orderSide === 'buy' ? '0 0 20px rgba(0,255,163,0.25)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {tc('buy')} <span style={{ fontSize: 10 }}>▲</span>
        </button>
        <button
          onClick={() => setOrderSide('sell')}
          style={{
            padding: isMobile ? '14px 0' : '12px 0',
            borderRadius: 10,
            border: 'none',
            background: orderSide === 'sell'
              ? 'linear-gradient(135deg, #FF4757, #EF4444)'
              : 'rgba(255,71,87,0.06)',
            color: orderSide === 'sell' ? '#fff' : '#6B7280',
            fontSize: 14,
            fontWeight: 800,
            fontFamily: "'Cairo', sans-serif",
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: orderSide === 'sell' ? '0 0 20px rgba(255,71,87,0.25)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {tc('sell')} <span style={{ fontSize: 10 }}>▼</span>
        </button>
      </div>

      {/* Order Type Selector */}
      <div style={{
        display: 'flex',
        gap: 6,
        padding: 3,
        borderRadius: 10,
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
              borderRadius: 8,
              border: 'none',
              background: orderType === key
                ? 'rgba(0,212,255,0.12)'
                : 'transparent',
              color: orderType === key ? T.cyan : T.text2,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "'Cairo', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              borderInlineStart: orderType === key ? `2px solid ${T.cyan}` : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Limit Price (when limit/stop_limit) */}
      {(orderType === 'limit' || orderType === 'stop_limit') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, color: T.text2, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{t('limitPrice')}</label>
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
        <label style={{ fontSize: 10, color: T.text2, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{tc('quantity')}</label>
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
          <label style={{ fontSize: 10, color: T.danger, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{tc('stopLoss')}</label>
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
          <label style={{ fontSize: 10, color: T.success, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{tc('takeProfit')}</label>
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
            borderRadius: 10,
            color: T.cyan,
            fontSize: 10,
            fontWeight: 700,
            padding: '10px 14px',
            cursor: 'pointer',
            fontFamily: "'Cairo', sans-serif",
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
          borderRadius: 10,
          background: 'rgba(255,184,0,0.1)',
          border: '1px solid rgba(255,184,0,0.25)',
          color: '#FFB800',
          fontSize: 10,
          fontWeight: 700,
          fontFamily: "'Cairo', sans-serif",
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
          borderRadius: 10,
          background: status.type === 'success' ? 'rgba(0,255,163,0.1)' : 'rgba(255,71,87,0.1)',
          border: `1px solid ${status.type === 'success' ? 'rgba(0,255,163,0.25)' : 'rgba(255,71,87,0.25)'}`,
          color: status.type === 'success' ? T.success : T.danger,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "'Cairo', sans-serif",
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
          borderRadius: 14,
          border: 'none',
          background: orderSide === 'buy'
            ? 'linear-gradient(135deg, #00FFA3, #10B981)'
            : 'linear-gradient(135deg, #FF4757, #EF4444)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 800,
          fontFamily: "'Cairo', sans-serif",
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
  const t = useTranslations('dashboard.home')
  const tc = useTranslations('common')
  const tcRef = (key: string, params?: Record<string, any>) => tc(key, params)
  const { collapsed: sidebarCollapsed } = useSidebarState()
  useScopedStyle(`.dashboard-shell {
          min-height: calc(100dvh - ${HEADER_H}px);
          background: ${T.bg};
          background-image:
            radial-gradient(ellipse at 20% 0%, rgba(0,212,255,0.04) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 100%, rgba(0,255,163,0.02) 0%, transparent 50%);
          color: ${T.text};
          overflow: hidden;
        }

        .dash-grid {
          display: grid;
          grid-template-columns: ${sidebarCollapsed ? '40px' : 'minmax(240px, 280px)'} minmax(0, 1fr) minmax(300px, 350px);
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
          color: ${T.text3};
        }

        .summary-value {
          color: ${T.text};
          font-family: 'JetBrains Mono', monospace;
        }

        .summary-value--success {
          color: ${T.success};
        }

        .summary-value--accent {
          color: ${T.cyan};
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
          background: ${T.success};
          box-shadow: 0 0 6px ${T.success}, 0 0 12px rgba(0,255,163,0.3);
          animation: ledPulse 2s ease-in-out infinite;
        }

        @keyframes ledPulse {
          0%, 100% { opacity: 0.7; box-shadow: 0 0 4px ${T.success}; }
          50% { opacity: 1; box-shadow: 0 0 8px ${T.success}, 0 0 16px rgba(0,255,163,0.4); }
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

        @media (max-width: 1500px) {
          .dash-grid {
            grid-template-columns: minmax(230px, 260px) minmax(0, 1fr) minmax(280px, 320px);
          }
        }

        @media (max-width: 1280px) {
          .dash-grid {
            grid-template-columns: minmax(220px, 250px) minmax(0, 1fr);
          }

          .dash-col-right {
            display: none;
          }

          .dash-col-right-mobile {
            display: block;
          }
        }

        @media (max-width: 767px) {
          .dash-grid {
            display: none;
          }

          .mobile-dashboard-shell {
            display: flex;
            flex-direction: column;
            gap: 0;
            padding: 6px 6px 0;
            background: ${T.bg};
            box-sizing: border-box;
            width: 100%;
            overflow: hidden;
            height: calc(100dvh - 52px);
          }

          .mobile-hero-trading-area {
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-width: 0;
            flex: 1;
            min-height: 0;
            overflow: hidden;
          }

          .mobile-market-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
            flex-shrink: 0;
          }

          .mobile-market-pill {
            min-width: 0;
            padding: 4px 4px;
            border-radius: 10px;
            border: 1px solid rgba(0, 212, 255, 0.12);
            background: rgba(26, 29, 41, 0.6);
            backdrop-filter: blur(8px);
            text-align: center;
            transition: all 0.2s;
          }

          .mobile-market-pill--active {
            border-color: rgba(0, 212, 255, 0.35);
            background: rgba(0, 212, 255, 0.08);
            box-shadow: 0 0 0 1px rgba(0, 212, 255, 0.08) inset, 0 0 16px rgba(0, 212, 255, 0.06);
          }

          .mobile-hero-card {
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
            background: ${T.card};
            border: 1px solid ${T.border};
            box-sizing: border-box;
          }

          .mobile-section__header {
            min-height: 48px;
            padding: 0 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            border-bottom: 1px solid ${T.border};
            background: linear-gradient(90deg, rgba(0, 212, 255, 0.06), transparent);
            box-sizing: border-box;
          }

          .mobile-section__title {
            font-family: 'Cairo', sans-serif;
            font-size: 12px;
            font-weight: 800;
            color: ${T.text};
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
        }`)

  const globalQuotes = useMarketStore(state => state.quotes) as Record<string, QuoteData | undefined>
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)
  const setSelectedSymbol = useSymbolStore(state => state.setSelectedSymbol)
  const currentPrice = globalQuotes[selectedSymbol]?.price ?? null
  const activeQuote = globalQuotes[selectedSymbol] ?? null
  const account = usePositionsStore(state => state.account)
  const positions = usePositionsStore(state => state.positions)
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



  const [chartExpanded, setChartExpanded] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [isCompactDesktopViewport, setIsCompactDesktopViewport] = useState(false)
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false)

  // ── Chart Height: Pure CSS flex + explicit resize trigger ──
  // Chart uses flex:1 so it fills remaining space after banner + balance panel.
  // When positions open/close, we dispatch a window resize event so that
  // the ResizeObserver in useChart.ts detects the container size change
  // and resizes the TradingView canvas.
  const chartPanelRef = useRef<HTMLDivElement | null>(null)

  // Force chart canvas resize after positions toggle
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    const timer2 = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 300)
    return () => { clearTimeout(timer); clearTimeout(timer2) }
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
    { label: tc('balance'), value: formatMoney(account?.equity), tone: T.text },
    { label: tc('buyingPower'), value: formatMoney(account?.buyingPower), tone: T.success },
    { label: tc('positions'), value: `${positions.length}`, tone: T.cyan },
  ]

  const quoteStatus = getDataStatus(activeQuote)
  const sourceLabel = getSourceLabel(activeQuote?.source, tcRef)

  // Derive account data status
  const dataSource = usePositionsStore(state => state.dataSource)
  const accountDataStatus: DataStatus = (() => {
    if (positionsError) return 'disconnected'
    if (!account) return 'disconnected'
    // إذا كان الحساب موجود لكن بدون بيانات حقيقية (equity=0 ولا مراكز)، اعتبره "تجريبي"
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
  // V152: Client-side margin takes PRIORITY (always correct)
  const initialMargin = clientSideMargin > 0
    ? clientSideMargin
    : accountMargin
  const freeMargin = Math.max(0, equityValue - initialMargin) // الهامش الحر = الرصيد - الهامش المستخدم
  // P&L لحظي من المراكز (محسوب من الأسعار المباشرة) بدلاً من account.unrealizedPnl المتجمد
  const livePositionsPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)
  const unrealizedPnl = positions.length > 0 ? livePositionsPnl : (Number(account?.unrealizedPnl) || 0)
  const isProfitable = unrealizedPnl > 0

  return (
    <>
      {/* Scoped styles via useScopedStyle */}<BotEngine />

      {!isMobileViewport && (
        <div className={`dash-grid dashboard-shell${chartFullscreen ? ' chart-fullscreen' : ''}`}>
          {/* Left Sidebar — hidden on compact desktop when drawer is used */}
          {!(isCompactDesktopViewport && !sidebarPinned) && (
            <div className="dash-col dash-col-left animate-in-1" style={{ height: '100%' }}>
              <PrimarySidebarLayout />
            </div>
          )}

          {/* Center Column: Mode Banner + Chart + Balance + Positions */}
          <div className="dash-col dash-col-center animate-in-2" style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, minHeight: 0, height: '100%', overflow: 'hidden' }}>
            {/* Mode Banner */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 10,
              background: modeConfig.glowBg,
              border: `1px solid ${modeConfig.accent}20`,
              flexShrink: 0,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: modeConfig.accent,
                boxShadow: `0 0 8px ${modeConfig.accent}60`,
                animation: 'ledPulse 2s ease-in-out infinite',
              }} />
              <span style={{
                fontFamily: "'Cairo', sans-serif", fontSize: 11, fontWeight: 800,
                color: modeConfig.accent, letterSpacing: '0.02em',
              }}>{({ trader: t('modeTraderLabel'), investor: t('modeInvestorLabel'), ai: t('modeAiLabel') })[mode]}</span>
              <span style={{
                fontFamily: "'Cairo', sans-serif", fontSize: 10,
                color: T.text3, marginInlineEnd: 8,
              }}>— {({ trader: t('modeTraderDesc'), investor: t('modeInvestorDesc'), ai: t('modeAiDesc') })[mode]}</span>
              <div style={{ flex: 1 }} />
              {mode === 'trader' && (
                <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: T.text3, fontWeight: 600 }}>
                  READY
                </span>
              )}
              {mode === 'investor' && (
                <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#10b981', fontWeight: 600 }}>
                  LONG-TERM
                </span>
              )}
              {mode === 'ai' && (
                <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#a78bfa', fontWeight: 600 }}>
                  AI-ACTIVE
                </span>
              )}
            </div>
            {/* Chart Panel — flex:1 fills remaining space after banner + balance panel */}
            <div ref={chartPanelRef} className="panel" style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', border: 'none', background: 'transparent', boxShadow: 'none' }}>
              <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(26, 29, 41, 0.65)' }}>
                <RouaChart
                  currentPrice={currentPrice}
                  isChartFullscreen={chartFullscreen}
                  onToggleChartFullscreen={toggleChartFullscreen}
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
                {/* LED + الرصيد */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderInlineEnd: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                  <div className="led-indicator" style={{ background: getStatusTone(accountDataStatus), boxShadow: `0 0 6px ${getStatusTone(accountDataStatus)}, 0 0 12px ${getStatusTone(accountDataStatus)}33` }} />
                  <span style={{ fontSize: 9, color: T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{tc('balance')}</span>
                  <span dir="ltr" style={{ fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: T.text }}>{formatMoney(cashValue)}</span>
                </div>
                {/* الرصيد الحالي */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderInlineEnd: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{tc('equity')}</span>
                  <span dir="ltr" style={{ fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: T.cyan }}>{formatMoney(equityValue)}</span>
                </div>
                {/* الهامش المتاح */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderInlineEnd: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{t('freeMargin')}</span>
                  <span dir="ltr" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: T.success }}>{formatMoney(freeMargin)}</span>
                </div>
                {/* الهامش المستخدم */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderInlineEnd: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{tc('margin')}</span>
                  <span dir="ltr" style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: T.text }}>{formatMoney(initialMargin)}</span>
                </div>
                {/* نسبة الهامش */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderInlineEnd: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{tc('marginLevel')}</span>
                  <span dir="ltr" style={{
                    fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    color: equityValue > 0 && (initialMargin / equityValue) > 0.8 ? T.danger
                      : equityValue > 0 && (initialMargin / equityValue) > 0.5 ? '#f59e0b'
                      : T.cyan,
                  }}>
                    {equityValue > 0 ? ((initialMargin / equityValue) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                {/* P&L */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>P/L</span>
                  <span dir="ltr" style={{
                    fontSize: 12, fontWeight: unrealizedPnl !== 0 ? 800 : 600, fontFamily: "'JetBrains Mono', monospace",
                    color: isProfitable ? T.success : unrealizedPnl < 0 ? T.danger : T.text3,
                  }}>
                    {isProfitable ? '+' : unrealizedPnl < 0 ? '-' : ''}{formatMoney(Math.abs(unrealizedPnl))}
                  </span>
                </div>

                <button
                  onClick={() => setPosOpen(prev => !prev)}
                  title={posOpen ? t('hidePositions') : t('showPositions')}
                  aria-label={posOpen ? t('hidePositions') : t('showPositions')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.text3, padding: 4, borderRadius: 6, transition: 'all 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = T.cyan)}
                  onMouseLeave={e => (e.currentTarget.style.color = T.text3)}
                >
                  <ChevronDown size={14} style={{ transform: posOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
                </button>
              </div>

              {/* Positions List — conditional render */}
              {posOpen && <AlpacaPositions />}
            </div>
          </div>

          {/* Right Panel — mode-aware content */}
          {!isCompactDesktopViewport && (
            <div className="dash-col dash-col-right animate-in-3" style={{ height: '100%' }}>
              {mode === 'trader' && <RightPanelLayout quotes={quotes} />}
              {mode === 'investor' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                  <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <PortfolioMini dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} selectedSymbol={selectedSymbol} />
                  </div>
                  <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <WatchlistMini selectedSymbol={selectedSymbol} />
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
          )}

          {isCompactDesktopViewport && (
            <div className="dash-col dash-col-right-mobile panel" style={{ padding: '0 4px 20px' }}>
              {mode === 'trader' && <RightPanelLayout quotes={quotes} />}
              {mode === 'investor' && (
                <>
                  <PortfolioMini dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} selectedSymbol={selectedSymbol} />
                  <div style={{ height: 10 }} />
                  <WatchlistMini selectedSymbol={selectedSymbol} />
                </>
              )}
              {mode === 'ai' && (
                <>
                  <AlNarratorMini selectedSymbol={selectedSymbol} dataStatus={quoteStatus} />
                  <div style={{ height: 10 }} />
                  <ScannerMini selectedSymbol={selectedSymbol} />
                </>
              )}
              {mode === 'trader' && (
                <>
                  <div style={{ height: 10 }} />
                  <WatchlistMini />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {isMobileViewport && (
        <div className="mobile-dashboard-shell">
          <div className="mobile-hero-trading-area">
            {/* Market Strip */}
            <div className="mobile-market-strip">
              {mobileSymbols.map(({ symbol, quote }) => {
                const active = symbol === selectedSymbol

                return (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => setSelectedSymbol(symbol)}
                    className={`mobile-market-pill${active ? ' mobile-market-pill--active' : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{symbol}</div>
                    <div style={{ fontSize: 10, color: T.text, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
                      {formatQuotePrice(quote?.price)}
                    </div>
                    <div style={{ fontSize: 7, color: getStatusTone(getDataStatus(quote)), marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                      {getStatusLabel(getDataStatus(quote), tcRef)}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Chart Card — full remaining height */}
            <div className="mobile-hero-card">
              <div className="mobile-hero-card__header">
                {/* Symbol name only - price shown by CrosshairOverlay */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 800, color: T.cyan }}>{selectedSymbol}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Execution Zap Button — prominent */}
                  <button
                    type="button"
                    onClick={() => setTradeDialogOpen(true)}
                    title={t('executeOrders')}
                    aria-label={t('openExecutionWindow')}
                    style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: 'linear-gradient(135deg, #00FFC6, #0A84FF)',
                      border: 'none', color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 0 12px rgba(0,255,198,0.3), 0 0 4px rgba(10,132,255,0.2)',
                      transition: 'transform 0.12s ease, box-shadow 0.2s ease',
                    }}
                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.88)'}
                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <Zap size={16} fill="white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartExpanded(value => !value)}
                    title={chartExpanded ? t('collapseChart') : t('expandChart')}
                    aria-label={chartExpanded ? t('collapseChart') : t('expandChart')}
                    style={{ background: 'transparent', border: 'none', color: T.text3, cursor: 'pointer', padding: 2 }}
                  >
                    <ChevronDown size={14} style={{ transform: chartExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
                  </button>
                </div>
              </div>

              {/* Chart — takes all remaining space */}
              <div className={`mobile-hero-chart${chartExpanded ? ' mobile-hero-chart--expanded' : ''}`}>
                <RouaChart
                  currentPrice={currentPrice}
                  mobile
                  compact={!chartExpanded}
                  onExpand={() => setChartExpanded(value => !value)}
                  isChartFullscreen={chartFullscreen}
                  onToggleChartFullscreen={toggleChartFullscreen}
                />
              </div>

              {/* Summary Strip — always visible below chart */}
              <div className="mobile-summary-strip" style={{ flexShrink: 0 }}>
                {mobileSummaryCards.map(card => (
                  <div key={card.label} className="mobile-summary-card">
                    <div style={{ fontSize: 9, color: T.text3, marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.label}</div>
                    <div style={{ fontSize: 11, color: card.tone, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
              <div style={{ width: 36, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.15)' }} />
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
                  width: 32, height: 32, borderRadius: 10,
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,255,163,0.1))',
                  border: '1px solid rgba(0,212,255,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 12px rgba(0,212,255,0.15)',
                }}>
                  <Zap size={14} color="#00D4FF" />
                </div>
                <div>
                  <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 15, fontWeight: 800, color: '#F0F2F5' }}>{t('executeOrders')}</div>
                  <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol} · {formatQuotePrice(currentPrice)}</div>
                </div>
              </div>
              <button
                onClick={() => setTradeDialogOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#8B92A8', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#F0F2F5' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#8B92A8' }}
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

      {/* Sidebar Drawer for compact desktop */}
      {isCompactDesktopViewport && !sidebarPinned && (
        <SidebarDrawer
          open={sidebarDrawerOpen}
          onClose={() => setSidebarDrawerOpen(false)}
          onPin={() => setSidebarPinned(true)}
          pinned={sidebarPinned}
        >
          <PrimarySidebarLayout />
        </SidebarDrawer>
      )}

      {/* FAB button to open sidebar on compact desktop */}
      {isCompactDesktopViewport && !sidebarDrawerOpen && !sidebarPinned && (
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

      {/* FAB button for mobile — opens sidebar drawer */}
      {isMobileViewport && (
        <button
          type="button"
          className="sidebar-fab"
          onClick={() => setSidebarDrawerOpen(true)}
          title={tc('menu')}
          aria-label={tc('menu')}
        >
          <PanelRight size={22} />
        </button>
      )}

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
