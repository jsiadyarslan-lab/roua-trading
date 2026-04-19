'use client'

import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowRight,
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

// ── Types ──
interface Position {
  id: string
  symbol: string
  side: 'LONG' | 'SHORT'
  quantity: number
  entryPrice: number
  currentPrice: number
  unrealizedPnl: number
  exchange: string
  stopLoss?: number
  takeProfit?: number
  createdAt: string
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
  { symbol: 'BTC/USDT', name: 'بيتكوين', icon: '₿' },
  { symbol: 'ETH/USDT', name: 'إيثريوم', icon: 'Ξ' },
  { symbol: 'SOL/USDT', name: 'سولانا', icon: '◎' },
  { symbol: 'BNB/USDT', name: 'بينانس', icon: '◆' },
  { symbol: 'XRP/USDT', name: 'ريببل', icon: '✕' },
  { symbol: 'ADA/USDT', name: 'كاردانو', icon: '♦' },
]

const ORDER_TYPES = [
  { value: 'MARKET', label: 'سوقي' },
  { value: 'LIMIT', label: 'محدد' },
  { value: 'STOP_LIMIT', label: 'وقف محدد' },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  PENDING: { label: 'معلق', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  OPEN: { label: 'مفتوح', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  FILLED: { label: 'منفذ', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  CANCELLED: { label: 'ملغي', color: 'text-gray-400', bgColor: 'bg-gray-500/10' },
  REJECTED: { label: 'مرفوض', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  PARTIALLY_FILLED: { label: 'منفذ جزئياً', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
}

export default function TradingPage() {
  const router = useRouter()

  // Auth
  const [authChecked, setAuthChecked] = useState(false)

  // Trading panel state
  const [symbol, setSymbol] = useState('BTC/USDT')
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY')
  const [orderType, setOrderType] = useState('MARKET')
  const [quantity, setQuantity] = useState(0.01)
  const [price, setPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
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

  // ── Auth check ──
  useEffect(() => {
    async function checkAuth() {
      try {
        const meRes = await fetch('/api/auth/me')
        const meData = await meRes.json()
        if (meData.authenticated) {
          setAuthChecked(true)
          return
        }
        const syncRes = await fetch('/api/auth/sync')
        const syncData = await syncRes.json()
        if (syncData.authenticated) {
          setAuthChecked(true)
          return
        }
        router.push('/')
      } catch {
        router.push('/')
      }
    }
    checkAuth()
  }, [router])

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
    } catch (err) {
      console.error('Failed to fetch quote:', err)
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
        if (data.success && data.data) {
          setHistoryData(data.data)
        }
      }
    } catch (err) {
      console.error('Failed to fetch history:', err)
    }
  }, [symbol])

  // ── Fetch credentials ──
  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/credentials')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setCredentials(data.data)
          if (data.data.length > 0 && !credentialId) {
            setCredentialId(data.data[0].id)
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch credentials:', err)
    }
  }, [credentialId])

  // ── Fetch positions ──
  const fetchPositions = useCallback(async () => {
    setLoadingPositions(true)
    try {
      const res = await fetch('/api/trading/positions')
      if (res.ok) {
        const data = await res.json()
        setPositions(data.data || data.positions || [])
      } else if (res.status === 401) {
        // Auth handled above
      } else {
        setApiUnavailable(true)
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
        setOrders(data.data || data.orders || [])
      }
    } catch {
      // Gracefully handle
    } finally {
      setLoadingOrders(false)
    }
  }, [])

  // ── Initial data fetch ──
  useEffect(() => {
    if (authChecked) {
      startTransition(() => {
        fetchCredentials()
        fetchPositions()
        fetchOrders()
        fetchQuote()
        fetchHistory()
      })
    }
  }, [authChecked])

  // ── Refetch quote and history when symbol changes ──
  useEffect(() => {
    if (authChecked) {
      startTransition(() => {
        setQuote(null)
        setHistoryData([])
        fetchQuote()
        fetchHistory()
      })
    }
  }, [symbol])

  // ── Auto-refresh every 10 seconds ──
  useEffect(() => {
    if (!authChecked) return

    refreshIntervalRef.current = setInterval(() => {
      fetchQuote()
    }, 10000)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [authChecked, fetchQuote])

  // ── Execute order ──
  const handleExecuteOrder = async () => {
    setSubmitting(true)
    setOrderError('')
    setOrderSuccess('')

    try {
      const body: Record<string, unknown> = {
        symbol,
        side,
        type: orderType,
        quantity,
        credentialId,
      }

      if (orderType === 'LIMIT' || orderType === 'STOP_LIMIT') {
        body.price = parseFloat(price)
      }
      if (orderType === 'STOP_LIMIT') {
        body.stopPrice = parseFloat(stopPrice)
      }

      const res = await fetch('/api/trading/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || data.message || 'فشل في تنفيذ الطلب')
      }

      setOrderSuccess('تم تنفيذ الطلب بنجاح ✓')
      setQuantity(0.01)
      setPrice('')
      setStopPrice('')

      // Refresh positions and orders
      fetchPositions()
      fetchOrders()
    } catch (err: any) {
      setOrderError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Close position ──
  const handleClosePosition = async () => {
    if (!closePositionDialog) return
    setClosingPosition(true)

    try {
      const res = await fetch('/api/trading/positions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: closePositionDialog.id }),
      })

      if (res.ok) {
        setPositions((prev) => prev.filter((p) => p.id !== closePositionDialog.id))
      }
    } catch (err) {
      console.error('Failed to close position:', err)
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
    } catch (err) {
      console.error('Failed to cancel order:', err)
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
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)

  const formatPrice = (value: number) => {
    if (value >= 1000) return formatCurrency(value)
    if (value >= 1) return value.toFixed(2)
    return value.toFixed(6)
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
    // Fallback: generate mock data if no history
    if (!quote) return []
    const data: { time: string; price: number; open: number; high: number; low: number }[] = []
    let p = quote.price
    for (let i = 24; i >= 0; i--) {
      const change = (Math.random() - 0.48) * p * 0.02
      p = Math.max(p + change, p * 0.8)
      const open = p - change
      data.push({
        time: i === 0 ? 'الآن' : `-${i}س`,
        price: parseFloat(p.toFixed(2)),
        open: parseFloat(open.toFixed(2)),
        high: parseFloat((p + Math.abs(change) * 0.5).toFixed(2)),
        low: parseFloat((p - Math.abs(change) * 0.5).toFixed(2)),
      })
    }
    return data
  }, [historyData, quote])

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">محرك التداول</h1>
              <p className="text-sm text-muted-foreground">
                تنفيذ أوامر التداول وإدارة المراكز
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {apiUnavailable && (
              <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">
                <AlertTriangle className="w-3 h-3 ml-1" />
                API غير متاح
              </Badge>
            )}
            <Button
              onClick={() => { fetchPositions(); fetchOrders(); fetchQuote(); fetchHistory() }}
              variant="outline"
              size="sm"
              className="border-border"
            >
              <RefreshCw className="w-4 h-4 ml-1" />
              تحديث
            </Button>
          </div>
        </div>

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
                  لوحة التداول
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Symbol Selector */}
                <div className="space-y-2">
                  <Label className="text-xs">الزوج</Label>
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
                            <span className="text-muted-foreground text-xs">({pair.name})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Side Toggle */}
                <div className="space-y-2">
                  <Label className="text-xs">الاتجاه</Label>
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
                      شراء
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
                      بيع
                    </button>
                  </div>
                </div>

                {/* Order Type */}
                <div className="space-y-2">
                  <Label className="text-xs">نوع الطلب</Label>
                  <Select value={orderType} onValueChange={setOrderType}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quantity */}
                <div className="space-y-2">
                  <Label className="text-xs">الكمية</Label>
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
                    <Label className="text-xs">سعر التنفيذ</Label>
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
                    <Label className="text-xs">سعر الوقف</Label>
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
                  <Label className="text-xs">حساب البورصة</Label>
                  {credentials.length > 0 ? (
                    <Select value={credentialId} onValueChange={setCredentialId}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="اختر الحساب" />
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
                      لا توجد مفاتيح API —{' '}
                      <button
                        onClick={() => router.push('/dashboard/settings/exchange')}
                        className="text-teal-400 hover:underline"
                      >
                        أضف مفتاح
                      </button>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Position Value & Risk Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-background border border-border">
                    <p className="text-[10px] text-muted-foreground">القيمة المقدرة</p>
                    <p className="text-sm font-medium" dir="ltr">{formatCurrency(estimatedPositionValue)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background border border-border">
                    <p className="text-[10px] text-muted-foreground">درجة المخاطر</p>
                    <p className="text-sm font-medium">
                      {estimatedPositionValue > 10000 ? (
                        <span className="text-red-400">مرتفع</span>
                      ) : estimatedPositionValue > 1000 ? (
                        <span className="text-yellow-400">متوسط</span>
                      ) : (
                        <span className="text-emerald-400">منخفض</span>
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
                  disabled={submitting || quantity <= 0 || credentials.length === 0}
                  className={`w-full text-base font-medium ${
                    side === 'BUY'
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                      جارٍ التنفيذ...
                    </>
                  ) : (
                    <>
                      {side === 'BUY' ? (
                        <TrendingUp className="w-5 h-5 ml-2" />
                      ) : (
                        <TrendingDown className="w-5 h-5 ml-2" />
                      )}
                      تنفيذ الطلب
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
                  تنفيذ من الإشارة
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
                      {isPositive ? '▲' : '▼'} 24س
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Stats Row */}
                {quote && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <p className="text-[10px] text-muted-foreground">أعلى سعر 24س</p>
                      <p className="text-xs font-medium text-emerald-400" dir="ltr">
                        {quote.high > 0 ? formatPrice(quote.high) : '—'}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <p className="text-[10px] text-muted-foreground">أدنى سعر 24س</p>
                      <p className="text-xs font-medium text-red-400" dir="ltr">
                        {quote.low > 0 ? formatPrice(quote.low) : '—'}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <p className="text-[10px] text-muted-foreground">الحجم 24س</p>
                      <p className="text-xs font-medium" dir="ltr">
                        {quote.volume > 0 ? formatVolume(quote.volume) : '—'}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <p className="text-[10px] text-muted-foreground">الافتتاح</p>
                      <p className="text-xs font-medium" dir="ltr">
                        {quote.open > 0 ? formatPrice(quote.open) : '—'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Price Chart */}
                <div className="h-[300px] md:h-[350px]" dir="ltr">
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
                          formatter={(value: number) => [formatPrice(value), 'السعر']}
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
                        <p className="text-sm text-muted-foreground">لا تتوفر بيانات الرسم البياني</p>
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
                    المراكز المفتوحة
                    <Badge variant="outline" className="text-xs mr-1">
                      {positions.length} مركز
                    </Badge>
                  </CardTitle>
                  {positions.length > 0 && (
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">إجمالي الربح/الخسارة</p>
                      <p className={`text-sm font-bold ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`} dir="ltr">
                        {totalUnrealizedPnl >= 0 ? '+' : ''}{formatCurrency(totalUnrealizedPnl)}
                      </p>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingPositions ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-6 h-6 text-muted-foreground mx-auto animate-spin" />
                    <p className="text-xs text-muted-foreground mt-2">جارٍ التحميل...</p>
                  </div>
                ) : apiUnavailable ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground mb-2">محرك التداول غير متاح حالياً</p>
                    <p className="text-xs text-muted-foreground">تأكد من تشغيل خادم NestJS على المنفذ 3001</p>
                  </div>
                ) : positions.length === 0 ? (
                  <div className="text-center py-8">
                    <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-20" />
                    <p className="text-sm text-muted-foreground">لا توجد مراكز مفتوحة</p>
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
                              pos.side === 'LONG'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                              {pos.side === 'LONG' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="font-medium text-sm" dir="ltr">{pos.symbol}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge className={`text-[10px] border-0 ${
                                  pos.side === 'LONG'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-red-500/10 text-red-400'
                                }`}>
                                  {pos.side === 'LONG' ? 'شراء' : 'بيع'}
                                </Badge>
                                <span>{pos.quantity}</span>
                                <span>@</span>
                                <span dir="ltr">{formatPrice(pos.entryPrice)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-left">
                              <p className="text-xs text-muted-foreground">السعر الحالي</p>
                              <p className="text-sm font-medium" dir="ltr">{formatPrice(pos.currentPrice)}</p>
                            </div>
                            <div className="text-left">
                              <p className="text-xs text-muted-foreground">ر/خ</p>
                              <p className={`text-sm font-bold ${
                                (pos.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`} dir="ltr">
                                {(pos.unrealizedPnl || 0) >= 0 ? '+' : ''}{formatCurrency(pos.unrealizedPnl || 0)}
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
                  الطلبات الأخيرة
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingOrders ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-6 h-6 text-muted-foreground mx-auto animate-spin" />
                    <p className="text-xs text-muted-foreground mt-2">جارٍ التحميل...</p>
                  </div>
                ) : apiUnavailable ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">لا يمكن تحميل الطلبات</p>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-20" />
                    <p className="text-sm text-muted-foreground">لا توجد طلبات سابقة</p>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto space-y-2 custom-scrollbar">
                    {orders.map((order) => {
                      const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING
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
                                  {statusCfg.label}
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
              محرك التداول لأغراض تعليمية فقط. تداول بمسؤولية ولا تستثمر أكثر مما يمكنك تحمل خسارته. رؤى لا تلمس أموالك أبداً.
            </p>
          </div>
        </div>

        {/* Back */}
        <Button
          variant="ghost"
          onClick={() => router.push('/dashboard')}
          className="text-muted-foreground"
        >
          <ArrowRight className="w-4 h-4 ml-2" />
          العودة للوحة القيادة
        </Button>
      </div>

      {/* Close Position Confirmation Dialog */}
      <Dialog open={!!closePositionDialog} onOpenChange={(open) => !open && setClosePositionDialog(null)}>
        <DialogContent className="bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد إغلاق المركز</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من إغلاق مركز {closePositionDialog?.symbol}؟ هذا الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          {closePositionDialog && (
            <div className="grid grid-cols-2 gap-3 my-4">
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">الاتجاه</p>
                <p className={`text-sm font-medium ${closePositionDialog.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {closePositionDialog.side === 'LONG' ? 'شراء' : 'بيع'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">الكمية</p>
                <p className="text-sm font-medium">{closePositionDialog.quantity}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">سعر الدخول</p>
                <p className="text-sm font-medium" dir="ltr">{formatPrice(closePositionDialog.entryPrice)}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">ر/خ غير محقق</p>
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
              className="flex-1"
            >
              إلغاء
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
              إغلاق المركز
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Confirmation Dialog */}
      <Dialog open={!!cancelOrderDialog} onOpenChange={(open) => !open && setCancelOrderDialog(null)}>
        <DialogContent className="bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد إلغاء الطلب</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من إلغاء طلب {cancelOrderDialog?.symbol}؟
            </DialogDescription>
          </DialogHeader>
          {cancelOrderDialog && (
            <div className="grid grid-cols-2 gap-3 my-4">
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">الاتجاه</p>
                <p className={`text-sm font-medium ${cancelOrderDialog.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {cancelOrderDialog.side === 'BUY' ? 'شراء' : 'بيع'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">النوع</p>
                <p className="text-sm font-medium">{cancelOrderDialog.type}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">الكمية</p>
                <p className="text-sm font-medium">{cancelOrderDialog.quantity}</p>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">السعر</p>
                <p className="text-sm font-medium" dir="ltr">{formatPrice(cancelOrderDialog.price)}</p>
              </div>
            </div>
          )}
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setCancelOrderDialog(null)}
              className="flex-1"
            >
              تراجع
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
              إلغاء الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
