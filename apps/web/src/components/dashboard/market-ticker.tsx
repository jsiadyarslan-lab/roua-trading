'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity, RefreshCw, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
}

interface MarketTickerProps {
  symbols?: string[]
  refreshInterval?: number // in milliseconds
}

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN', 'EUR/USD', 'BTC/USD']

export function MarketTicker({
  symbols = DEFAULT_SYMBOLS,
  refreshInterval = 5000,
}: MarketTickerProps) {
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(new Map())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [isPaused, setIsPaused] = useState(false)

  const fetchQuote = useCallback(async (symbol: string) => {
    setLoading(prev => new Set(prev).add(symbol))

    try {
      const response = await fetch(`/api/exchange/quote/${encodeURIComponent(symbol)}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `فشل في جلب بيانات ${symbol}`)
      }

      const result = await response.json()

      if (result.success && result.data) {
        setQuotes(prev => {
          const next = new Map(prev)
          next.set(symbol, result.data)
          return next
        })
        setErrors(prev => {
          const next = new Map(prev)
          next.delete(symbol)
          return next
        })
      }
    } catch (err: any) {
      setErrors(prev => {
        const next = new Map(prev)
        next.set(symbol, err.message)
        return next
      })
    } finally {
      setLoading(prev => {
        const next = new Set(prev)
        next.delete(symbol)
        return next
      })
    }
  }, [])

  // Fetch all quotes
  const fetchAllQuotes = useCallback(async () => {
    await Promise.allSettled(symbols.map(s => fetchQuote(s)))
    setLastUpdate(new Date())
  }, [symbols, fetchQuote])

  // Auto-refresh every interval
  useEffect(() => {
    if (isPaused) return

    fetchAllQuotes()
    const interval = setInterval(fetchAllQuotes, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchAllQuotes, refreshInterval, isPaused])

  const formatPrice = (price: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('ar-SA', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price)
  }

  const formatVolume = (volume: number) => {
    if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(1)}B`
    if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`
    if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`
    return volume.toString()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">سوق مباشر</h2>
            <p className="text-xs text-muted-foreground">
              تحديث كل {(refreshInterval / 1000).toFixed(0)} ثانية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Activity className="w-3 h-3 ml-1 text-green-400" />
            مباشر
          </Badge>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            title={isPaused ? 'استئناف' : 'إيقاف مؤقت'}
          >
            <RefreshCw className={`w-4 h-4 ${isPaused ? 'text-yellow-400' : 'text-muted-foreground'} ${!isPaused ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
          </button>

          {lastUpdate && (
            <span className="text-xs text-muted-foreground" dir="ltr">
              {lastUpdate.toLocaleTimeString('ar-SA')}
            </span>
          )}
        </div>
      </div>

      {/* Ticker Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <AnimatePresence>
          {symbols.map((symbol) => {
            const quote = quotes.get(symbol)
            const isLoading = loading.has(symbol)
            const error = errors.get(symbol)
            const isPositive = quote ? quote.change >= 0 : true

            return (
              <motion.div
                key={symbol}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <Card className={`bg-card border-border hover:border-teal-500/30 transition-all duration-300 ${isLoading ? 'animate-pulse' : ''}`}>
                  <CardContent className="p-4">
                    {error ? (
                      <div className="text-center py-4">
                        <p className="text-xs text-red-400">{error}</p>
                        <button
                          onClick={() => fetchQuote(symbol)}
                          className="text-xs text-teal-400 hover:underline mt-1"
                        >
                          إعادة المحاولة
                        </button>
                      </div>
                    ) : quote ? (
                      <div className="space-y-2">
                        {/* Symbol & Name */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-sm" dir="ltr">{symbol}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">{quote.name}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              isPositive
                                ? 'border-green-500/30 text-green-400'
                                : 'border-red-500/30 text-red-400'
                            }`}
                          >
                            {isPositive ? (
                              <TrendingUp className="w-3 h-3 ml-1" />
                            ) : (
                              <TrendingDown className="w-3 h-3 ml-1" />
                            )}
                            {isPositive ? '+' : ''}
                            {quote.changePercent.toFixed(2)}%
                          </Badge>
                        </div>

                        {/* Price */}
                        <div className="flex items-end gap-2">
                          <span className="text-xl font-bold" dir="ltr">
                            {formatPrice(quote.price, quote.currency)}
                          </span>
                          <span
                            className={`text-xs font-medium ${
                              isPositive ? 'text-green-400' : 'text-red-400'
                            }`}
                            dir="ltr"
                          >
                            {isPositive ? '+' : ''}
                            {quote.change.toFixed(2)}
                          </span>
                        </div>

                        {/* Details */}
                        <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                          <div>
                            <span className="block">أعلى</span>
                            <span dir="ltr">{quote.high.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="block">أدنى</span>
                            <span dir="ltr">{quote.low.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="block">الحجم</span>
                            <span dir="ltr">{formatVolume(quote.volume)}</span>
                          </div>
                        </div>

                        {/* Source */}
                        <div className="flex items-center justify-between pt-1 border-t border-border/50">
                          <span className="text-[10px] text-muted-foreground">
                            {quote.exchange}
                          </span>
                          <span className="text-[10px] text-muted-foreground" dir="ltr">
                            via {quote.source}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <RefreshCw className="w-5 h-5 text-muted-foreground mx-auto animate-spin" style={{ animationDuration: '2s' }} />
                        <p className="text-xs text-muted-foreground mt-2">جارٍ التحميل...</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* No API Key Warning */}
      {errors.size > 0 && errors.size === symbols.length && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center"
        >
          <p className="text-sm text-yellow-400 font-medium">
            ⚠️ لم يتم تعيين مفتاح Twelve Data API
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            أضف TWELVE_DATA_API_KEY إلى ملف .env لتفعيل البيانات المباشرة
          </p>
        </motion.div>
      )}
    </div>
  )
}
