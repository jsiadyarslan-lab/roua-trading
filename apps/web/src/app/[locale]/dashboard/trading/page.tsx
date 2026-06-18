'use client'

import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react'
import { useRouter } from '@/i18n/navigation'
import { motion } from 'framer-motion'
import {
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  XCircle,
  RefreshCw,
  Activity,
  Zap,
  Shield,
  BarChart3,
  Clock,
  Ban,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'
import { fetchPositionsUnified } from '@/lib/api-fetch'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { fmtPriceLocale } from '@/lib/price-format'

import { getDirection } from '@/lib/i18n-utils';
// ── Types ──
interface Position {
  id: string
  symbol: string
  side: 'BUY' | 'SELL' | 'long' | 'short'
  quantity: number
  entryPrice: number
  currentPrice: number
  unrealizedPnl: number
  exchange?: string
  stopLoss?: number
  takeProfit?: number
  openedAt?: string
}

interface Order {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  type: string
  quantity: number
  price: number
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'PARTIALLY_FILLED'
  createdAt: string
  exchange?: string
}

interface Credential {
  id: string
  exchange: string
  label: string
  isValid: boolean
}

interface QuoteData {
  symbol: string
  name: string
  exchange: string
  currency: string
  price: number
  change: number
  changePercent: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  source: string
  timestamp: string
}

interface HistoryCandle {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ── Constants ──
const TRADING_PAIRS = [
  { symbol: 'BTC/USDT', nameKey: 'pairBTC', icon: '₿' },
  { symbol: 'ETH/USDT', nameKey: 'pairETH', icon: 'Ξ' },
  { symbol: 'SOL/USDT', nameKey: 'pairSOL', icon: '◎' },
  { symbol: 'BNB/USDT', nameKey: 'pairBNB', icon: '◆' },
  { symbol: 'XRP/USDT', nameKey: 'pairXRP', icon: '✕' },
  { symbol: 'ADA/USDT', nameKey: 'pairADA', icon: '♦' },
]

const ORDER_TYPES = [
  { value: 'MARKET', labelKey: 'orderTypeMarket' },
  { value: 'LIMIT', labelKey: 'orderTypeLimit' },
  // FIX: STOP_LIMIT removed — backend only supports MARKET and LIMIT.
  // Was causing 100% rejection for STOP_LIMIT orders.
]

const STATUS_KEYS: Record<string, { labelKey: string; color: string; bgColor: string }> = {
  PENDING: { labelKey: 'statusPending', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  OPEN: { labelKey: 'statusOpen', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  FILLED: { labelKey: 'statusFilled', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  CANCELLED: { labelKey: 'statusCancelled', color: 'text-gray-400', bgColor: 'bg-gray-500/10' },
  REJECTED: { labelKey: 'statusRejected', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  PARTIALLY_FILLED: { labelKey: 'statusPartial', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
}

export default function TradingPage() {
  const locale = useLocale();
  const dir = getDirection(locale);
  const router = useRouter()
  const { loading: authLoading } = useAuth()
  const t = useTranslations('dashboard.trading')
  const tc = useTranslations('common')

  // Trading panel state
  const [symbol, setSymbol] = useState('BTC/USDT')
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY')
  const [orderType, setOrderType] = useState('MARKET')
  const [quantity, setQuantity] = useState(0.01)
  const [price, setPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')  // FIX: Added stopLoss — backend requires it (100% orders rejected without it)
  const [takeProfit, setTakeProfit] = useState('')  // FIX: Added takeProfit for order management
  const [credentialId, setCredentialId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [orderSuccess, setOrderSuccess] = useState('')

  // Data
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingPositions, setLoadingPositions] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [apiUnavailable, setApiUnavailable] = useState(false)

  // Price data
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [historyData, setHistoryData] = useState<HistoryCandle[]>([])
  const [loadingQuote, setLoadingQuote] = useState(false)

  // Dialogs
  const [closePositionDialog, setClosePositionDialog] = useState<Position | null>(null)
  const [closingPosition, setClosingPosition] = useState(false)
  const [cancelOrderDialog, setCancelOrderDialog] = useState<Order | null>(null)
  const [cancellingOrder, setCancellingOrder] = useState(false)

  // Auto-refresh timer
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Ref to avoid credentialId dependency loop in fetchCredentials
  const credentialIdRef = useRef<string | null>(null)
  useEffect(() => { credentialIdRef.current = credentialId }, [credentialId])

  // Minimum quantity for order validation
  const MIN_QUANTITY = 0.001

  // Auth handled by useAuth hook

  // ── Fetch quote data from API ──
  const fetchQuote = useCallback(async () => {
    setLoadingQuote(true)
    try {
      const res = await fetch(`/api/exchange/quote/${encodeURIComponent(symbol)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          setQuote(data.data)
        }
      }
    } catch {
      // Error handled silently
    } finally {
      setLoadingQuote(false)
    }
  }, [symbol])

  // ── Fetch price history from API ──
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/exchange/history/${encodeURIComponent(symbol)}?interval=1day`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setHistoryData(data.data)
        } else {
          setHistoryData([])
        }
      } else {
        setHistoryData([])
      }
    } catch {
      setHistoryData([])
    }
  }, [symbol])

  // ── Fetch credentials ──
  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/credentials')
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          setCredentials(data.data)
          if (data.data.length > 0 && !credentialIdRef.current) {
            setCredentialId(data.data[0].id)
          }
        }
      }
    } catch {
      // Error handled silently
    }
  }, [])

  // ── Fetch positions ──
  const fetchPositions = useCallback(async () => {
    setLoadingPositions(true)
    try {
      const result = await fetchPositionsUnified()
      setPositions(result.positions)
      if (result.error) {
        setApiUnavailable(true)
      } else {
        setApiUnavailable(false)
      }
    } catch {
      setApiUnavailable(true)
    } finally {
      setLoadingPositions(false)
    }
  }, [])

  // ── Fetch orders ──
  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true)
    try {
      const res = await fetch('/api/trading/orders?limit=10')
      if (res.ok) {
        const data = await res.json()
        const ordersList = Array.isArray(data.data) ? data.data : Array.isArray(data.orders) ? data.orders : []
        setOrders(ordersList)
      } else {
        setOrders([])
      }
    } catch {
      setOrders([])
    } finally {
      setLoadingOrders(false)
    }
  }, [])

  // ── Initial data fetch ──
  useEffect(() => {
    startTransition(() => {
      fetchCredentials()
      fetchPositions()
      fetchOrders()
      fetchQuote()
      fetchHistory()
    })
  }, [])

  // ── Refetch quote and history when symbol changes ──
  useEffect(() => {
    startTransition(() => {
      setQuote(null)
      setHistoryData([])
      fetchQuote()
      fetchHistory()
    })
  }, [symbol])

  // ── Auto-refresh every 10 seconds ──
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      fetchQuote()
    }, 10000)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [fetchQuote])

  // ── Execute order via v2 pipeline (BullMQ queue) ──
  const handleExecuteOrder = async () => {
    setOrderError('')
    setOrderSuccess('')

    if (!quantity || quantity < MIN_QUANTITY) {
      setOrderError(t('minQtyError', { min: MIN_QUANTITY }))
      return
    }

    if (!credentialId) {
      setOrderError(t('selectAccountError'))
      return
    }

    setSubmitting(true)

    try {
      // FIX: Generate deterministic idempotency key to prevent duplicate orders
      // Key format: v2-{symbol side type quantity price} — NO timestamp!
      // Previously, Date.now() made every key unique, defeating idempotency.
      // If a user double-clicks, the second click gets a different timestamp
      // and bypasses the idempotency check, creating a DUPLICATE trade.
      // Now: Same params = same key = blocked as duplicate within 24h window.
      // If user wants a new order with same params, they must wait or change params.
      const idempotencyKey = `v2-${symbol}-${side}-${orderType}-${quantity}-${price || 'market'}`

      const body: Record<string, unknown> = {
        symbol,
        side,
        type: orderType,
        quantity,
        exchangeCredentialId: credentialId,
        // FIX: stopLoss is MANDATORY — backend rejects orders without it
        // Default: 3% below entry for BUY, 3% above for SELL if user doesn't specify
        stopLoss: stopLoss ? parseFloat(stopLoss) : (
          quote?.price
            ? (side === 'BUY'
              ? parseFloat((quote.price * 0.97).toFixed(quote.price > 1000 ? 1 : 5))
              : parseFloat((quote.price * 1.03).toFixed(quote.price > 1000 ? 1 : 5)))
            : undefined
        ),
        takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
        idempotencyKey,
      }

      if (orderType === 'LIMIT') {
        body.price = parseFloat(price)
      }

      // FIX: Use v2 pipeline (/api/trading/v2/orders) instead of v1 (/api/trading/orders)
      // v2 uses BullMQ queue with idempotency, risk gatekeeper, and async execution
      // v1 was synchronous direct execution that blocked the HTTP response
      const res = await fetch('/api/trading/v2/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || data.message || t('executionFailed'))
      }

      // v2 returns { orderId, status: 'ACCEPTED', riskScore }
      setOrderSuccess(t('orderAccepted', { id: data.data?.orderId?.slice(0, 8) || '', status: data.data?.status || t('accepted') }))
      setQuantity(0.01)
      setPrice('')
      setStopPrice('')

      // FIX: Use refreshAfterTrade for staggered refresh (immediate + 2s + 5s)
      // This updates BOTH positions AND account balance in usePositionsStore
      // Previously, only fetchPositions() was called after 2s — balance never updated
      usePositionsStore.getState().refreshAfterTrade()

      // Also refresh the local page state
      setTimeout(() => {
        fetchPositions()
        fetchOrders()
      }, 2000)
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Close position ──
  // FIX: Use closePositionUnified instead of direct fetch to NestJS.
  // Previously, this only tried NestJS /api/trading/positions/close.
  // If NestJS was down or the position was Alpaca-only, the close
  // silently failed with no fallback. Now uses the full NestJS → Alpaca
  // fallback flow from closePositionUnified().
  const handleClosePosition = async () => {
    if (!closePositionDialog) return
    setClosingPosition(true)

    try {
      const { closePositionUnified } = await import('@/lib/api-fetch')
      // FIX: Get latest market price before closing to ensure accurate
      // execution price display. Previously, the stale currentPrice from
      // the last API fetch was used, which could be seconds old.
      const latestPositions = usePositionsStore.getState().positions
      const latestPrice = latestPositions.find(
        (p: any) => p.symbol === closePositionDialog.symbol
          || p.id === closePositionDialog.id
      )?.currentPrice || closePositionDialog.currentPrice

      const result = await closePositionUnified(
        closePositionDialog.symbol,
        undefined,
        { dbId: closePositionDialog.id },
      )

      if (result.success) {
        setPositions((prev) => prev.filter((p) => p.id !== closePositionDialog.id))
        // FIX: Use refreshAfterTrade for staggered refresh
        usePositionsStore.getState().refreshAfterTrade()
      } else {
        setOrderError(t('closeFailed', { error: result.error || t('unknownError') }))
      }
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : t('closeError'))
    } finally {
      setClosingPosition(false)
      setClosePositionDialog(null)
    }
  }

  // ── Cancel order ──
  const handleCancelOrder = async () => {
    if (!cancelOrderDialog) return
    setCancellingOrder(true)

    try {
      const res = await fetch(`/api/trading/orders/${cancelOrderDialog.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === cancelOrderDialog.id ? { ...o, status: 'CANCELLED' as const } : o
          )
        )
      }
    } catch {
      // Error handled silently
    } finally {
      setCancellingOrder(false)
      setCancelOrderDialog(null)
    }
  }

  // ── Helpers ──
  const currentPrice = quote?.price || 0
  const priceChange = quote?.change || 0
  const priceChangePercent = quote?.changePercent || 0
  const isPositive = priceChange >= 0

  const estimatedPositionValue = quantity * currentPrice
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)

  const formatPrice = (value: number) => {
    // Use unified price formatting — respects JPY (3dp), BTC (2dp), forex (5dp)
    return fmtPriceLocale(value, symbol)
  }

  const formatVolume = (value: number) => {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
    return value.toFixed(2)
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
  }

  // ── Chart data from history API ──
  const chartData = useMemo(() => {
    if (historyData.length > 0) {
      return historyData.map((candle) => {
        const d = new Date(candle.timestamp)
        const label = `${d.getMonth() + 1}/${d.getDate()}`
        return {
          time: label,
          price: candle.close,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          volume: candle.volume,
        }
      })
    }
    // No mock data — show empty chart if no real history available
    return []
  }, [historyData, quote])

  if (authLoading) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <SubPageLayout
      title={t('title')}
      icon={<Activity size={14} color="#fff" />}
      iconBg="linear-gradient(135deg, #00FFC6, #0A84FF)"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {apiUnavailable && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid var(--border-warning)', padding: '3px 8px', borderRadius: '6px' }}>
              <AlertTriangle size={10} /> {t('apiUnavailable')}
            </span>
          )}
          <button onClick={() => { fetchPositions(); fetchOrders(); fetchQuote(); fetchHistory() }} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-ar)', cursor: 'pointer' }}>
            <RefreshCw size={11} /> {t('refresh')}
          </button>
        </div>
      }
    >

        {/* Main Grid: Trading Panel + Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Section A — Trading Panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-4"
          >
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  {t('tradingPanel')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Symbol Selector */}
                <div className="space-y-2">
                  <Label className="text-xs">{t('pairLabel')}</Label>
                  <Select value={symbol} onValueChange={setSymbol}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRADING_PAIRS.map((pair) => (
                        <SelectItem key={pair.symbol} value={pair.symbol}>
                          <span className="flex items-center gap-2" dir="ltr">
                            <span>{pair.icon}</span>
                            {pair.symbol}
                            <span className="text-muted-foreground text-xs">({t(pair.nameKey)})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Side Toggle */}
                <div className="space-y-2">
                  <Label className="text-xs">{t('directionLabel')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSide('BUY')}
                      className={`py-3 rounded-xl text-sm font-medium transition-all ${
                        side === 'BUY'
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                          : 'bg-background border border-border text-muted-foreground hover:border-emerald-500/20'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4 inline ml-1" />
                      {tc('buy')}
                    </button>
                    <button
                      onClick={() => setSide('SELL')}
                      className={`py-3 rounded-xl text-sm font-medium transition-all ${
                        side === 'SELL'
                          ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                          : 'bg-background border border-border text-muted-foreground hover:border-red-500/20'
                      }`}
                    >
                      <TrendingDown className="w-4 h-4 inline ml-1" />
                      {tc('sell')}
                    </button>
                  </div>
                </div>

                {/* Order Type */}
                <div className="space-y-2">
                  <Label className="text-xs">{t('orderTypeLabel')}</Label>
                  <Select value={orderType} onValueChange={setOrderType}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {t(type.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quantity */}
                <div className="space-y-2">
                  <Label className="text-xs">{tc('quantity')}</Label>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                    min={0}
                    step={0.001}
                    dir="ltr"
                    className="bg-background"
                  />
                  <Slider
                    value={[quantity]}
                    onValueChange={([v]) => setQuantity(v)}
                    min={0.001}
                    max={symbol === 'BTC/USDT' ? 1 : symbol === 'ETH/USDT' ? 10 : 100}
                    step={symbol === 'BTC/USDT' ? 0.001 : symbol === 'ETH/USDT' ? 0.01 : 1}
                    className="mt-1"
                  />
                </div>

                {/* Price (Limit/Stop-Limit) */}
                {(orderType === 'LIMIT' || orderType === 'STOP_LIMIT') && (
                  <div className="space-y-2">
                    <Label className="text-xs">{t('executionPriceLabel')}</Label>
                    <Input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder={currentPrice > 0 ? formatPrice(currentPrice) : '0.00'}
                      dir="ltr"
                      className="bg-background"
                    />
                  </div>
                )}

                {/* Stop Price (Stop-Limit) */}
                {orderType === 'STOP_LIMIT' && (
                  <div className="space-y-2">
                    <Label className="text-xs">{t('stopPriceLabel')}</Label>
                    <Input
                      type="number"
                      value={stopPrice}
                      onChange={(e) => setStopPrice(e.target.value)}
                      placeholder={currentPrice > 0 ? formatPrice(currentPrice * 0.95) : '0.00'}
                      dir="ltr"
                      className="bg-background"
                    />
                  </div>
                )}

                {/* Credential Selector */}
                <div className="space-y-2">
                  <Label className="text-xs">{t('exchangeAccountLabel')}</Label>
                  {credentials.length > 0 ? (
                    <Select value={credentialId} onValueChange={setCredentialId}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder={t('chooseAccount')} />
                      </SelectTrigger>
                      <SelectContent>
                        {credentials.map((cred) => (
                          <SelectItem key={cred.id} value={cred.id}>
                            <span className="flex items-center gap-2">
                              <span>{cred.exchange}</span>
                              <span className="text-muted-foreground text-xs">({cred.label})</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10 text-xs text-muted-foreground">
                      <Shield className="w-3 h-3 inline ml-1 text-yellow-400" />
                      {t('noApiKeys')}{' '}
                      <button
                        onClick={() => router.push('/dashboard/settings/exchange')}
                        className="text-teal-400 hover:underline"
                      >
                        {t('addKey')}
                      </button>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Position Value & Risk Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-background border border-border">
                    <p className="text-[10px] text-muted-foreground">{t('estimatedValue')}</p>
                    <p className="text-sm font-medium" dir="ltr">{formatCurrency(estimatedPositionValue)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background border border-border">
                    <p className="text-[10px] text-muted-foreground">{t('riskScore')}</p>
                    <p className="text-sm font-medium">
                      {estimatedPositionValue > 10000 ? (
                        <span className="text-red-400">{tc('high')}</span>
                      ) : estimatedPositionValue > 1000 ? (
                        <span className="text-yellow-400">{tc('medium')}</span>
                      ) : (
                        <span className="text-emerald-400">{tc('low')}</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Error / Success */}
                {orderError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-400">{orderError}</p>
                  </div>
                )}
                {orderSuccess && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <p className="text-xs text-emerald-400">{orderSuccess}</p>
                  </div>
                )}

                {/* Execute Button */}
                <Button
                  onClick={handleExecuteOrder}
                  disabled={submitting || quantity < MIN_QUANTITY || credentials.length === 0}
                  className={`w-full text-base font-medium ${
                    side === 'BUY'
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                      {t('executing')}
                    </>
                  ) : (
                    <>
                      {side === 'BUY' ? (
                        <TrendingUp className="w-5 h-5 ml-2" />
                      ) : (
                        <TrendingDown className="w-5 h-5 ml-2" />
                      )}
                      {t('executeOrder')}
                    </>
                  )}
                </Button>

                {/* Execute from Signal */}
                <Button
                  variant="outline"
                  className="w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  onClick={() => router.push('/dashboard/signals')}
                >
                  <Zap className="w-4 h-4 ml-2" />
                  {t('executeFromSignal')}
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Section B — Price Display */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-8"
          >
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    <span dir="ltr">{symbol}</span>
                    {quote?.source && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {quote.source}
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      {loadingQuote && !quote ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <p className="text-lg font-bold" dir="ltr">{formatPrice(currentPrice)}</p>
                          <p className={`text-xs ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%
                            <span className="text-muted-foreground mx-1">|</span>
                            {isPositive ? '+' : ''}{formatPrice(Math.abs(priceChange))}
                          </p>
                        </>
                      )}
                    </div>
                    <Badge
                      className={`${
                        isPositive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      } border`}
                    >
                      {isPositive ? '▲' : '▼'} {t('h24')}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Stats Row */}
                {quote && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <p className="text-[10px] text-muted-foreground">{t('high24h')}</p>
                      <p className="text-xs font-medium text-emerald-400" dir="ltr">
                        {quote.high > 0 ? formatPrice(quote.high) : '—'}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <p className="text-[10px] text-muted-foreground">{t('low24h')}</p>
                      <p className="text-xs font-medium text-red-400" dir="ltr">
                        {quote.low > 0 ? formatPrice(quote.low) : '—'}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <p className="text-[10px] text-muted-foreground">{t('volume24h')}</p>
                      <p className="text-xs font-medium" dir="ltr">
                        {quote.volume > 0 ? formatVolume(quote.volume) : '—'}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <p className="text-[10px] text-muted-foreground">{t('openPrice')}</p>
                      <p className="text-xs font-medium" dir="ltr">
                        {quote.open > 0 ? formatPrice(quote.open) : '—'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Price Chart */}
                <div className="h-[250px] md:h-[300px] lg:h-[350px]" dir="ltr">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                            {isPositive ? (
                              <>
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                              </>
                            ) : (
                              <>
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                              </>
                            )}
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                          dataKey="time"
                          stroke="rgba(255,255,255,0.2)"
                          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="rgba(255,255,255,0.2)"
                          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          domain={['auto', 'auto']}
                          tickFormatter={(val: number) => formatPrice(val)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15,23,42,0.9)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          formatter={(value: number) => [formatPrice(value), t('priceLabel')]}
                        />
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke={isPositive ? '#10b981' : '#ef4444'}
                          strokeWidth={2}
                          fill="url(#priceGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      {loadingQuote ? (
                        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('noChartData')}</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Bottom Grid: Positions + Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Section C — Open Positions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-7"
          >
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-amber-400" />
                    {t('openPositions')}
                    <Badge variant="outline" className="text-xs mr-1">
                      {t('positionCount', { count: positions.length })}
                    </Badge>
                  </CardTitle>
                  {positions.length > 0 && (
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">{t('totalPnl')}</p>
                      <p className={`text-sm font-bold ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`} dir="ltr">
                        {totalUnrealizedPnl >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totalUnrealizedPnl))}
                      </p>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingPositions ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-6 h-6 text-muted-foreground mx-auto animate-spin" />
                    <p className="text-xs text-muted-foreground mt-2">{t('loading')}</p>
                  </div>
                ) : apiUnavailable ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground mb-2">{t('tradingEngineUnavailable')}</p>
                    <p className="text-xs text-muted-foreground">{t('checkNestServer')}</p>
                  </div>
                ) : positions.length === 0 ? (
                  <div className="text-center py-8">
                    <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-20" />
                    <p className="text-sm text-muted-foreground">{t('noOpenPositions')}</p>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto space-y-2 custom-scrollbar">
                    {positions.map((pos) => {
                      const pnlPct = pos.entryPrice > 0
                        ? ((pos.unrealizedPnl || 0) / (pos.entryPrice * pos.quantity)) * 100
                        : 0
                      return (
                        <div
                          key={pos.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-background border border-border hover:border-border/80 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                              (pos.side === 'BUY' || pos.side === 'long')
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                              {(pos.side === 'BUY' || pos.side === 'long') ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="font-medium text-sm" dir="ltr">{pos.symbol}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge className={`text-[10px] border-0 ${
                                  (pos.side === 'BUY' || pos.side === 'long')
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-red-500/10 text-red-400'
                                }`}>
                                  {(pos.side === 'BUY' || pos.side === 'long') ? tc('buy') : tc('sell')}
                                </Badge>
                                <span>{pos.quantity}</span>
                                <span>@</span>
                                <span dir="ltr">{formatPrice(pos.entryPrice)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-left">
                              <p className="text-xs text-muted-foreground">{t('currentPrice')}</p>
                              <p className="text-sm font-medium" dir="ltr">{formatPrice(pos.currentPrice)}</p>
                            </div>
                            <div className="text-left">
                              <p className="text-xs text-muted-foreground">{t('pnl')}</p>
                              <p className={`text-sm font-bold ${
                                (pos.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`} dir="ltr">
                                {(pos.unrealizedPnl || 0) >= 0 ? '+' : '-'}{formatCurrency(Math.abs(pos.unrealizedPnl || 0))}
                              </p>
                              <p className={`text-[10px] ${
                                (pos.unrealizedPnl || 0) >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'
                              }`}>
                                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setClosePositionDialog(pos)}
                              aria-label={t('closePositionFull')}
                              className="text-muted-foreground hover:text-red-400 h-8 w-8 p-0"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Section D — Recent Orders */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-5"
          >
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  {t('recentOrders')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingOrders ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-6 h-6 text-muted-foreground mx-auto animate-spin" />
                    <p className="text-xs text-muted-foreground mt-2">{t('loading')}</p>
                  </div>
                ) : apiUnavailable ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">{t('ordersLoadFailed')}</p>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-20" />
                    <p className="text-sm text-muted-foreground">{t('noPreviousOrders')}</p>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto space-y-2 custom-scrollbar">
                    {orders.map((order) => {
                      const statusCfg = STATUS_KEYS[order.status] || STATUS_KEYS.PENDING
                      const canCancel = order.status === 'PENDING' || order.status === 'OPEN'
                      return (
                        <div
                          key={order.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                              order.side === 'BUY'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                              {order.side === 'BUY' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm" dir="ltr">{order.symbol}</p>
                                <Badge variant="outline" className="text-[10px]">
                                  {order.type}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge className={`text-[10px] border-0 ${statusCfg.bgColor} ${statusCfg.color}`}>
                                  {t(statusCfg.labelKey)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {order.quantity} @ {formatPrice(order.price)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-muted-foreground">{formatTime(order.createdAt)}</p>
                            {canCancel && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCancelOrderDialog(order)}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-yellow-400"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Disclaimer */}
        <div className="p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              {t('disclaimer')}
            </p>
          </div>
        </div>


      {/* Close Position Confirmation Dialog */}
      <Dialog open={!!closePositionDialog} onOpenChange={(open) => !open && setClosePositionDialog(null)}>
        <DialogContent className="bg-card border-border" dir={dir}>
          <DialogHeader>
            <DialogTitle>{t('confirmClose')}</DialogTitle>
            <DialogDescription>
              {t('confirmCloseDesc', { symbol: closePositionDialog?.symbol || '' })}
            </DialogDescription>
          </DialogHeader>
          {closePositionDialog && (
            <div className="grid grid-cols-2 gap-3 my-4">
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">{t('directionLabel')}</p>
                <p className={`text-sm font-medium ${closePositionDialog.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {closePositionDialog.side === 'BUY' ? tc('buy') : tc('sell')}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">{tc('quantity')}</p>
                <p className="text-sm font-medium">{closePositionDialog.quantity}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">{t('entryPrice')}</p>
                <p className="text-sm font-medium" dir="ltr">{formatPrice(closePositionDialog.entryPrice)}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">{t('unrealizedPnl')}</p>
                <p className={`text-sm font-bold ${
                  (closePositionDialog.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`} dir="ltr">
                  {formatCurrency(closePositionDialog.unrealizedPnl || 0)}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setClosePositionDialog(null)}
              aria-label={t('cancelCloseAria')}
              className="flex-1"
            >
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleClosePosition}
              disabled={closingPosition}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
            >
              {closingPosition ? (
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 ml-2" />
              )}
              {t('closePositionFull')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Confirmation Dialog */}
      <Dialog open={!!cancelOrderDialog} onOpenChange={(open) => !open && setCancelOrderDialog(null)}>
        <DialogContent className="bg-card border-border" dir={dir}>
          <DialogHeader>
            <DialogTitle>{t('confirmCancel')}</DialogTitle>
            <DialogDescription>
              {t('confirmCancelDesc', { symbol: cancelOrderDialog?.symbol || '' })}
            </DialogDescription>
          </DialogHeader>
          {cancelOrderDialog && (
            <div className="grid grid-cols-2 gap-3 my-4">
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">{t('directionLabel')}</p>
                <p className={`text-sm font-medium ${cancelOrderDialog.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {cancelOrderDialog.side === 'BUY' ? tc('buy') : tc('sell')}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">{tc('type')}</p>
                <p className="text-sm font-medium">{cancelOrderDialog.type}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">{tc('quantity')}</p>
                <p className="text-sm font-medium">{cancelOrderDialog.quantity}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">{tc('price')}</p>
                <p className="text-sm font-medium" dir="ltr">{formatPrice(cancelOrderDialog.price)}</p>
              </div>
            </div>
          )}
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setCancelOrderDialog(null)}
              aria-label={t('cancelCancelAria')}
              className="flex-1"
            >
              {t('goBack')}
            </Button>
            <Button
              onClick={handleCancelOrder}
              disabled={cancellingOrder}
              className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              {cancellingOrder ? (
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              ) : (
                <Ban className="w-4 h-4 ml-2" />
              )}
              {t('cancelOrderFull')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SubPageLayout>
  )
}
