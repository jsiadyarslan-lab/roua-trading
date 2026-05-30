'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from '@/i18n/navigation'
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

          /* ── Mobile V2 shell ── */
          .m2-shell {
            display: flex !important;
            flex-direction: column;
            width: 100%;
            height: calc(100dvh - 52px);
            background: #0A0D13;
            overflow: hidden;
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
            background: rgba(255,255,255,0.012);
            border-bottom: 1px solid rgba(255,255,255,0.04);
          }
          .m2-ticker::-webkit-scrollbar { display: none; }
          .m2-chart-toolbar {
            display: flex !important;
            height: 44px;
            align-items: center;
            padding: 0 10px;
            gap: 4px;
            flex-shrink: 0;
            background: rgba(14,18,26,0.95);
            border-bottom: 1px solid rgba(255,255,255,0.06);
            overflow-x: auto;
            scrollbar-width: none;
          }
          .m2-chart-toolbar::-webkit-scrollbar { display: none; }
          .m2-chart-area {
            flex: 1;
            position: relative;
            min-height: 0;
            overflow: hidden;
          }
          .m2-bottom-nav {
            display: flex !important;
            height: 70px;
            background: rgba(8,11,16,0.98);
            border-top: 1px solid rgba(255,255,255,0.05);
            align-items: flex-start;
            padding: 6px 4px 0;
            flex-shrink: 0;
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
        }

        @keyframes marginPulse {
          0%, 100% { background: rgba(239,68,68,0.12); }
          50% { background: rgba(239,68,68,0.25); }
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
  const [m2ActiveInds, setM2ActiveInds] = useState<string[]>(['RSI', 'EMA 20'])
  const m2TFs = ['1m','5m','15m','30m','1H','4H','1D','1W']
  const m2DrawTools = [
    { id:'cursor', icon:'↖' }, { id:'line', icon:'╱' }, { id:'hline', icon:'─' },
    { id:'fib', icon:'φ' }, { id:'rect', icon:'▭' }, { id:'text', icon:'T' },
  ]
  const m2Indicators = ['RSI','MACD','EMA 20','EMA 50','Bollinger','Volume','ATR','Stoch']
  const m2NavItems = [
    { id:'chart',     label: 'الشارت'  },
    { id:'portfolio', label: 'محفظتي'  },
    { id:'scanner',   label: 'السكانر' },
    { id:'ai',        label: 'AI'       },
    { id:'menu',      label: 'المزيد'  },
  ]

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
  const sourceLabel = getSourceLabel(activeQuote?.source, tc)

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

      {/* Desktop — hidden by CSS on mobile */}
      <div className={`dash-grid dashboard-shell${chartFullscreen ? ' chart-fullscreen' : ''}`} style={{ display: isMobileViewport ? 'none' : undefined }}>
          {/* Left Sidebar — hidden on compact desktop when drawer is used */}
          {!(isCompactDesktopViewport && !sidebarPinned) && (
            <div className="dash-col dash-col-left animate-in-1" style={{ height: '100%' }}>
              <PrimarySidebarLayout />
            </div>
          )}

          {/* Center Column: Mode Banner + Chart + Balance + Positions */}
          <div className="dash-col dash-col-center animate-in-2" style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, minHeight: 0, height: '100%', overflow: 'hidden' }}>
            {/* Mode Banner — removed to save space */}
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
                {/* نسبة الهامش — تحذير صارخ عند المستوى المنخفض */}
                {(() => {
                  const mlPct = equityValue > 0 ? (initialMargin / equityValue) * 100 : 0;
                  const isCritical = mlPct > 0 && mlPct <= 30;
                  const isWarning = mlPct > 30 && mlPct <= 50;
                  const mlColor = isCritical ? T.danger : isWarning ? '#f59e0b' : T.cyan;
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.danger} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/>
                          <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                      )}
                      <span style={{ fontSize: 9, color: isCritical ? T.danger : isWarning ? '#f59e0b' : T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{tc('marginLevel')}</span>
                      <span dir="ltr" style={{
                        fontSize: isCritical ? 13 : 12, fontWeight: isCritical ? 900 : 700,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: mlColor,
                        textShadow: isCritical ? '0 0 8px rgba(239,68,68,0.6)' : 'none',
                      }}>
                        {equityValue > 0 ? mlPct.toFixed(1) : '0.0'}%
                      </span>
                      {isCritical && (
                        <span style={{ fontSize: 7, color: T.danger, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>⚠</span>
                      )}
                    </div>
                  );
                })()}
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

      {/* ═══════════════════════════════════════════
           MOBILE V2 — التصميم الجديد
          ═══════════════════════════════════════════ */}
      {/* Mobile V2 — hidden by CSS on desktop */}
      <div className="m2-shell" style={{ display: isMobileViewport ? undefined : 'none' }}>

          {/* ── TICKER STRIP ── */}
          <div className="m2-ticker">
            {['BTC/USD','ETH/USD','EUR/USD','GBP/USD','USD/JPY','XAU/USD','SOL/USD'].map(sym => {
              const q = globalQuotes[sym]
              const chgPct = q?.changePercent ?? 0
              const isUp = chgPct >= 0
              const active = sym === selectedSymbol
              return (
                <button key={sym} type="button"
                  onClick={() => setSelectedSymbol(sym)}
                  style={{
                    display:'flex', alignItems:'center', gap:5,
                    padding:'3px 9px', borderRadius:7, flexShrink:0, cursor:'pointer',
                    border: active ? '1px solid rgba(0,212,255,0.35)' : '1px solid transparent',
                    background: active ? 'rgba(0,212,255,0.07)' : 'transparent',
                  }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:0, alignItems:'flex-start' }}>
                    <span style={{ fontSize:8, color:'rgba(130,150,175,0.65)', fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>
                      {sym.split('/')[0]}
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, color: isUp?'#00FFA3':'#FF4757', fontFamily:"'JetBrains Mono',monospace", lineHeight:1.3 }}>
                      {chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* ── CHART TOOLBAR ── */}
          <div className="m2-chart-toolbar">
            {/* Timeframe */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <button type="button"
                onClick={() => { setM2ShowTf(!m2ShowTf); setM2ShowInd(false); setM2ShowAI(false); }}
                style={{
                  height:30, padding:'0 9px', display:'flex', alignItems:'center', gap:3,
                  background:'rgba(0,212,255,0.1)', border:'1px solid rgba(0,212,255,0.28)',
                  borderRadius:7, color:'#00D4FF', fontSize:12, fontWeight:800,
                  fontFamily:"'JetBrains Mono',monospace", cursor:'pointer',
                }}>
                {timeframe} <span style={{ fontSize:7 }}>▾</span>
              </button>
              {m2ShowTf && (
                <div style={{
                  position:'absolute', top:'calc(100% + 5px)', left:0,
                  background:'#141920', border:'1px solid rgba(255,255,255,0.09)',
                  borderRadius:10, padding:6, display:'flex', flexWrap:'wrap',
                  gap:3, width:165, zIndex:200,
                  boxShadow:'0 10px 30px rgba(0,0,0,0.6)',
                }}>
                  {m2TFs.map(tf => (
                    <button key={tf} type="button"
                      onClick={() => { setTimeframe(tf); setM2ShowTf(false); }}
                      style={{
                        padding:'5px 9px', borderRadius:6, cursor:'pointer', fontSize:11,
                        fontFamily:"'JetBrains Mono',monospace", fontWeight:600,
                        background: tf===timeframe?'rgba(0,212,255,0.12)':'transparent',
                        border: tf===timeframe?'1px solid rgba(0,212,255,0.3)':'1px solid transparent',
                        color: tf===timeframe?'#00D4FF':'#6A7A90',
                      }}>
                      {tf}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Separator */}
            <div style={{ width:1, height:22, background:'rgba(255,255,255,0.07)', flexShrink:0 }}/>

            {/* Drawing tools — MT5 style compact */}
            {m2DrawTools.map(dt => (
              <button key={dt.id} type="button"
                onClick={() => setM2ActiveTool(dt.id)}
                title={dt.id}
                style={{
                  width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center',
                  borderRadius:6, cursor:'pointer', fontSize:14, fontFamily:'monospace',
                  flexShrink:0,
                  background: m2ActiveTool===dt.id?'rgba(0,212,255,0.15)':'rgba(255,255,255,0.03)',
                  border: m2ActiveTool===dt.id?'1px solid rgba(0,212,255,0.4)':'1px solid rgba(255,255,255,0.06)',
                  color: m2ActiveTool===dt.id?'#00D4FF':'#6A7A90',
                }}>
                {dt.icon}
              </button>
            ))}

            {/* Separator */}
            <div style={{ width:1, height:22, background:'rgba(255,255,255,0.07)', flexShrink:0 }}/>

            {/* Indicators */}
            <button type="button"
              onClick={() => { setM2ShowInd(!m2ShowInd); setM2ShowTf(false); setM2ShowAI(false); }}
              style={{
                height:30, padding:'0 8px', display:'flex', alignItems:'center', gap:4,
                borderRadius:7, cursor:'pointer', fontSize:11, fontWeight:600,
                fontFamily:"'JetBrains Mono',monospace", flexShrink:0,
                background: m2ShowInd?'rgba(167,139,250,0.12)':'transparent',
                border: m2ShowInd?'1px solid rgba(167,139,250,0.3)':'1px solid transparent',
                color: m2ShowInd?'#A78BFA':'#5A6A82',
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h4l3-9 6 18 3-9h4"/></svg>
              IND
            </button>

            {/* AI */}
            <button type="button"
              onClick={() => { setM2ShowAI(!m2ShowAI); setM2ShowTf(false); setM2ShowInd(false); }}
              style={{
                height:30, padding:'0 8px', display:'flex', alignItems:'center', gap:4,
                borderRadius:7, cursor:'pointer', fontSize:11, fontWeight:600,
                fontFamily:"'JetBrains Mono',monospace", flexShrink:0,
                background: m2ShowAI?'rgba(139,92,246,0.15)':'transparent',
                border: m2ShowAI?'1px solid rgba(139,92,246,0.4)':'1px solid transparent',
                color: m2ShowAI?'#C4B5FD':'#5A6A82',
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              AI
            </button>

            <div style={{ flex:1 }}/>

            {/* More */}
            <button type="button" style={{ width:28, height:30, display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'none', color:'#5A6A82', cursor:'pointer', fontSize:16, flexShrink:0 }}>⋮</button>
          </div>

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
                <div style={{ width:32, height:3, background:'rgba(255,255,255,0.12)', borderRadius:2, margin:'0 auto 14px' }}/>
                <div style={{ fontSize:12, fontWeight:700, color:'#A78BFA', marginBottom:12 }}>المؤشرات الفنية</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {m2Indicators.map(ind => (
                    <button key={ind} type="button"
                      onClick={() => setM2ActiveInds(a => a.includes(ind)?a.filter(x=>x!==ind):[...a,ind])}
                      style={{
                        padding:'8px 14px', borderRadius:8, cursor:'pointer', fontSize:12,
                        border: m2ActiveInds.includes(ind)?'1px solid rgba(167,139,250,0.5)':'1px solid rgba(255,255,255,0.1)',
                        background: m2ActiveInds.includes(ind)?'rgba(167,139,250,0.15)':'rgba(255,255,255,0.04)',
                        color: m2ActiveInds.includes(ind)?'#C4B5FD':'#8090A8',
                        fontFamily:"'Cairo',sans-serif",
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
                <div style={{ width:32, height:3, background:'rgba(255,255,255,0.12)', borderRadius:2, margin:'0 auto 14px' }}/>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#C4B5FD' }}>تحليل ذكي AI</span>
                  <span style={{ fontSize:12, color:'#6A7A90', fontFamily:"'JetBrains Mono',monospace" }}>{selectedSymbol}</span>
                </div>
                <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                  {[{l:'شراء',v:'79%',c:'#00FFA3'},{l:'حيادي',v:'11%',c:'#F59E0B'},{l:'بيع',v:'10%',c:'#FF4757'}].map(b => (
                    <div key={b.l} style={{
                      flex:1, padding:'12px 0', textAlign:'center', borderRadius:10,
                      background:`${b.c}18`, border:`1px solid ${b.c}44`,
                      fontSize:16, fontWeight:800, color:b.c,
                    }}>
                      {b.v}<div style={{ fontSize:10, opacity:0.7, marginTop:4 }}>{b.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:'#5A6A80', lineHeight:1.8, background:'rgba(255,255,255,0.03)', padding:'10px', borderRadius:8 }}>
                  📍 دعم قوي: {currentPrice ? (currentPrice*0.995).toFixed(currentPrice > 100 ? 2 : 5) : '—'}<br/>
                  🎯 مقاومة: {currentPrice ? (currentPrice*1.008).toFixed(currentPrice > 100 ? 2 : 5) : '—'}<br/>
                  ⚡ التوصية: استمرار الاتجاه الصاعد على المدى القصير
                </div>
              </div>
            </div>
          )}

          {/* ── CHART AREA ── */}
          <div className="m2-chart-area">

            {/* OHLC Info Bar — MT5 style بالضبط */}
            <div style={{
              position:'absolute', top:0, left:0, right:0, zIndex:10,
              padding:'4px 8px 3px',
              background:'rgba(0,0,0,0.75)',
              backdropFilter:'blur(4px)',
              borderBottom:'1px solid rgba(255,255,255,0.06)',
              pointerEvents:'none',
            }}>
              {/* السطر الأول: الزوج + OHLC مثل MT5 */}
              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, fontWeight:800, color:'#00D4FF', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.3px' }}>
                  {selectedSymbol}
                </span>
                <span style={{ fontSize:10, color:'rgba(140,160,185,0.6)', fontFamily:"'JetBrains Mono',monospace" }}>
                  {timeframe}
                </span>
                {activeQuote && (
                  <>
                    <span style={{ fontSize:10, color:'rgba(140,160,185,0.7)', fontFamily:"'JetBrains Mono',monospace" }}>
                      {activeQuote.open ? formatQuotePrice(activeQuote.open) : '—'}
                    </span>
                    <span style={{ fontSize:10, color:'#00FFA3', fontFamily:"'JetBrains Mono',monospace" }}>
                      {activeQuote.high ? formatQuotePrice(activeQuote.high) : '—'}
                    </span>
                    <span style={{ fontSize:10, color:'#FF4757', fontFamily:"'JetBrains Mono',monospace" }}>
                      {activeQuote.low ? formatQuotePrice(activeQuote.low) : '—'}
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, color:'#E8ECF4', fontFamily:"'JetBrains Mono',monospace" }}>
                      {currentPrice ? formatQuotePrice(currentPrice) : '—'}
                    </span>
                    {(activeQuote.changePercent ?? 0) !== 0 && (
                      <span style={{
                        fontSize:10, fontWeight:700,
                        color: (activeQuote.changePercent ?? 0) >= 0 ? '#00FFA3' : '#FF4757',
                      }}>
                        {(activeQuote.changePercent ?? 0) >= 0 ? '+' : ''}{(activeQuote.changePercent ?? 0).toFixed(2)}%
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── QUICK TRADE — cTrader Style ──
                 زران ثابتان يساراً أسفل الشارت، كل زر يعرض السعر الحالي
                 الفرق: هذا للتنفيذ الفوري بضغطة واحدة
                 نافذة الأمر الكاملة تُفتح من زر ⚙ أو tab التداول ── */}
            <div style={{
              position:'absolute', bottom:54, left:10, zIndex:20,
              display:'flex', flexDirection:'column', gap:4,
            }}>
              {/* Volume row */}
              <div style={{
                display:'flex', alignItems:'center', gap:0,
                background:'rgba(0,0,0,0.72)', border:'1px solid rgba(255,255,255,0.1)',
                borderRadius:7, overflow:'hidden', backdropFilter:'blur(10px)',
              }}>
                <button type="button"
                  onClick={() => setM2Qty(q => String(Math.max(0.01, parseFloat(q)-0.01).toFixed(2)))}
                  style={{ background:'none', border:'none', borderRight:'1px solid rgba(255,255,255,0.07)', color:'#8090A8', fontSize:16, cursor:'pointer', padding:'4px 8px', lineHeight:1 }}>−</button>
                <span style={{ fontSize:11, fontWeight:700, color:'#C8D4E4', fontFamily:"'JetBrains Mono',monospace", padding:'0 8px' }}>
                  {m2Qty}
                </span>
                <button type="button"
                  onClick={() => setM2Qty(q => String((parseFloat(q)+0.01).toFixed(2)))}
                  style={{ background:'none', border:'none', borderLeft:'1px solid rgba(255,255,255,0.07)', borderRight:'1px solid rgba(255,255,255,0.07)', color:'#8090A8', fontSize:16, cursor:'pointer', padding:'4px 8px', lineHeight:1 }}>+</button>
                <button type="button"
                  onClick={() => setTradeDialogOpen(true)}
                  title="نافذة الأمر الكاملة"
                  style={{ background:'none', border:'none', color:'#6A7A90', cursor:'pointer', padding:'4px 8px', fontSize:11 }}>⚙</button>
              </div>

              {/* BUY button — ASK price */}
              <button type="button"
                onClick={() => { setM2OrderSide('buy'); setM2ConfirmSheet(true); }}
                style={{
                  padding:'7px 14px', borderRadius:7, border:'1px solid rgba(74,222,128,0.3)',
                  background:'rgba(22,101,52,0.9)',
                  cursor:'pointer', backdropFilter:'blur(8px)',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:1,
                }}>
                <span style={{ fontSize:8, color:'rgba(74,222,128,0.6)', letterSpacing:'1px', textTransform:'uppercase' }}>شراء</span>
                <span style={{ fontSize:13, fontWeight:900, color:'#4ADE80', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'-0.3px' }}>
                  {currentPrice ? (currentPrice * 1.00005).toFixed(currentPrice > 100 ? 2 : 5) : '—'}
                </span>
              </button>

              {/* SELL button — BID price */}
              <button type="button"
                onClick={() => { setM2OrderSide('sell'); setM2ConfirmSheet(true); }}
                style={{
                  padding:'7px 14px', borderRadius:7, border:'1px solid rgba(248,113,113,0.3)',
                  background:'rgba(127,29,29,0.9)',
                  cursor:'pointer', backdropFilter:'blur(8px)',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:1,
                }}>
                <span style={{ fontSize:8, color:'rgba(248,113,113,0.6)', letterSpacing:'1px', textTransform:'uppercase' }}>بيع</span>
                <span style={{ fontSize:13, fontWeight:900, color:'#F87171', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'-0.3px' }}>
                  {currentPrice ? (currentPrice * 0.99995).toFixed(currentPrice > 100 ? 2 : 5) : '—'}
                </span>
              </button>
            </div>

            {/* الشارت — hideToolbar لأن toolbar الجديد يحل محله */}
            <RouaChart
              currentPrice={currentPrice}
              mobile
              hideToolbar
              isChartFullscreen={chartFullscreen}
              onToggleChartFullscreen={toggleChartFullscreen}
            />

            {/* Bottom info strip */}
            <div style={{
              position:'absolute', bottom:0, left:0, right:0, height:48,
              background:'linear-gradient(180deg, transparent 0%, rgba(10,13,19,0.97) 50%, #0A0D13 100%)',
              display:'flex', alignItems:'flex-end', padding:'0 12px 8px', gap:0,
              pointerEvents:'none',
            }}>
              {mobileSummaryCards.map((card, i, arr) => (
                <div key={card.label} style={{
                  flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:1,
                  borderRight: i < arr.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <span style={{ fontSize:8, color:'#4A5568' }}>{card.label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:card.tone, fontFamily:"'JetBrains Mono',monospace" }}>{card.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── BOTTOM NAVBAR ── */}
          <div className="m2-bottom-nav">
            {m2NavItems.map(item => {
              const active = m2ActiveTab === item.id
              return (
                <button key={item.id} type="button"
                  onClick={() => {
                    setM2ActiveTab(item.id)
                    if (item.id === 'menu') setSidebarDrawerOpen(true)
                    else if (item.id === 'portfolio') router.push('/dashboard/portfolio')
                    else if (item.id === 'scanner')   router.push('/dashboard/scanner')
                    else if (item.id === 'ai')        router.push('/dashboard/ai')
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
                  {item.id === 'chart' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#00D4FF':'#3A4558'} strokeWidth="2"><rect x="2" y="5" width="4" height="14" rx="1"/><line x1="4" y1="2" x2="4" y2="5"/><line x1="4" y1="19" x2="4" y2="22"/><rect x="10" y="8" width="4" height="9" rx="1"/><line x1="12" y1="4" x2="12" y2="8"/><line x1="12" y1="17" x2="12" y2="21"/><rect x="18" y="6" width="4" height="11" rx="1"/><line x1="20" y1="3" x2="20" y2="6"/><line x1="20" y1="17" x2="20" y2="20"/></svg>}
                  {item.id === 'portfolio' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#00D4FF':'#3A4558'} strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>}
                  {item.id === 'scanner' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#00D4FF':'#3A4558'} strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                  {item.id === 'ai' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#A78BFA':'#3A4558'} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>}
                  {item.id === 'menu' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#00D4FF':'#3A4558'} strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
                  <span style={{ fontSize:9, fontWeight:active?700:400, color:active?'#00D4FF':'#3A4558', fontFamily:"'Cairo',sans-serif" }}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── ORDER CONFIRM SHEET ── */}
          {m2ConfirmSheet && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'flex-end' }}
              onClick={() => setM2ConfirmSheet(false)}>
              <div style={{ width:'100%', background:'#0F1520', borderRadius:'18px 18px 0 0', border:'1px solid rgba(255,255,255,0.07)', borderBottom:'none', padding:'16px 18px 40px' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ width:32, height:3, background:'rgba(255,255,255,0.1)', borderRadius:2, margin:'0 auto 16px' }}/>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
                  <span style={{ fontSize:15, fontWeight:800, color:'#E8ECF4', fontFamily:"'Cairo',sans-serif" }}>
                    تأكيد {m2OrderSide==='buy'?'الشراء':'البيع'} · {selectedSymbol}
                  </span>
                  <span style={{ fontSize:13, fontWeight:700, color:'#6A7A90', fontFamily:"'JetBrains Mono',monospace" }}>
                    {currentPrice ? formatQuotePrice(currentPrice) : '—'}
                  </span>
                </div>
                {[
                  {l:'نوع الأمر', v:'سوق فوري'},
                  {l:'حجم العقد', v:m2Qty},
                  {l:'القيمة الكلية', v:currentPrice?`$${(parseFloat(m2Qty)*currentPrice).toFixed(2)}`:'—'},
                ].map(row => (
                  <div key={row.l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize:12, color:'#5A6A80' }}>{row.l}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#C8D0DC', fontFamily:"'JetBrains Mono',monospace" }}>{row.v}</span>
                  </div>
                ))}
                <button type="button"
                  onClick={() => { setTradeDialogOpen(true); setM2ConfirmSheet(false); }}
                  style={{
                    width:'100%', marginTop:16, padding:'14px', borderRadius:12, border:'none',
                    background: m2OrderSide==='buy'?'linear-gradient(135deg,#00FFA3,#00C48C)':'linear-gradient(135deg,#FF4757,#E0283A)',
                    color: m2OrderSide==='buy'?'#000':'#fff',
                    fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:"'Cairo',sans-serif",
                    boxShadow: m2OrderSide==='buy'?'0 6px 24px rgba(0,255,163,0.28)':'0 6px 24px rgba(255,71,87,0.28)',
                  }}>
                  تأكيد {m2OrderSide==='buy'?'الشراء':'البيع'}
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
