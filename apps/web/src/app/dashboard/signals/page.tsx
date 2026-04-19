'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  ArrowRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Signal {
  id: string
  pair: string
  action: 'BUY' | 'SELL' | 'WAIT'
  confidence: number
  reason: string
  entryPrice: number | null
  stopLoss: number | null
  takeProfit: number | null
  status: string
  expiresAt: string
  createdAt: string
}

const QUICK_PAIRS = [
  { symbol: 'BTC/USDT', name: 'بيتكوين', icon: '₿' },
  { symbol: 'ETH/USDT', name: 'إيثريوم', icon: 'Ξ' },
  { symbol: 'SOL/USDT', name: 'سولانا', icon: '◎' },
  { symbol: 'AAPL', name: 'آبل', icon: '' },
  { symbol: 'TSLA', name: 'تسلا', icon: '' },
  { symbol: 'GOLD', name: 'الذهب', icon: '🥇' },
]

export default function SignalsPage() {
  const router = useRouter()
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Check auth — try roua_session first, then sync from NextAuth
  useEffect(() => {
    async function checkAuth() {
      try {
        // First try our custom session (works for passkey users)
        const meRes = await fetch('/api/auth/me')
        const meData = await meRes.json()

        if (meData.authenticated) {
          return
        }

        // No roua_session — try syncing from NextAuth (for Google OAuth users)
        const syncRes = await fetch('/api/auth/sync')
        const syncData = await syncRes.json()

        if (syncData.authenticated) {
          return
        }

        // No session at all — go to login
        router.push('/')
      } catch {
        router.push('/')
      }
    }
    checkAuth()
  }, [router])

  // Fetch active signals
  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/signals/active')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setSignals(data.data)
        }
      }
    } catch (err) {
      console.error('Failed to fetch signals:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSignals()
  }, [fetchSignals])

  // Generate signal
  const handleGenerate = async (pair: string) => {
    setGenerating(pair)
    setError('')

    try {
      const res = await fetch(`/api/signals/generate/${encodeURIComponent(pair)}`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'فشل في توليد الإشارة')
      }

      // Refresh signals list
      await fetchSignals()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(null)
    }
  }

  // Cancel signal
  const handleCancel = async (id: string) => {
    try {
      await fetch(`/api/signals/${id}`, { method: 'DELETE' })
      setSignals((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      console.error('Failed to cancel signal:', err)
    }
  }

  const getActionConfig = (action: string) => {
    switch (action) {
      case 'BUY':
        return {
          label: 'شراء',
          icon: TrendingUp,
          color: 'text-green-400',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/30',
        }
      case 'SELL':
        return {
          label: 'بيع',
          icon: TrendingDown,
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
        }
      default:
        return {
          label: 'انتظار',
          icon: Minus,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/30',
        }
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'text-green-400'
    if (confidence >= 40) return 'text-yellow-400'
    return 'text-red-400'
  }

  const formatPrice = (price: number | null) => {
    if (!price) return '—'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price)
  }

  const timeUntilExpiry = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'منتهية'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}س ${minutes}د`
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">إشارات رؤى</h1>
              <p className="text-sm text-muted-foreground">
                توصيات تداول ذكية مدعومة بالذكاء الاصطناعي
              </p>
            </div>
          </div>
          <Button
            onClick={() => fetchSignals()}
            variant="outline"
            className="border-border"
          >
            <RefreshCw className="w-4 h-4 ml-2" />
            تحديث
          </Button>
        </div>

        {/* Quick Generate */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4" />
              توليد إشارة سريعة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {QUICK_PAIRS.map((pair) => (
                <button
                  key={pair.symbol}
                  onClick={() => handleGenerate(pair.symbol)}
                  disabled={generating !== null}
                  className={`p-4 rounded-xl text-center transition-all border ${
                    generating === pair.symbol
                      ? 'bg-purple-500/10 border-purple-500/30'
                      : 'bg-background border-border hover:border-purple-500/30 hover:bg-purple-500/5'
                  } disabled:opacity-50`}
                >
                  {generating === pair.symbol ? (
                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-purple-400" />
                  ) : (
                    <>
                      {pair.icon && <span className="block text-xl mb-1">{pair.icon}</span>}
                      <p className="text-sm font-medium" dir="ltr">{pair.symbol}</p>
                      <p className="text-[10px] text-muted-foreground">{pair.name}</p>
                    </>
                  )}
                </button>
              ))}
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 mt-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Signals */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-muted-foreground mx-auto animate-spin" />
            <p className="text-sm text-muted-foreground mt-3">جارٍ التحميل...</p>
          </div>
        ) : signals.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="font-medium mb-1">لا توجد إشارات نشطة</p>
              <p className="text-sm text-muted-foreground mb-4">
                اضغط على أي زوج أعلاه لتوليد إشارة تداول ذكية
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">الإشارات النشطة</h2>
              <Badge variant="outline" className="text-xs">
                {signals.length} إشارة
              </Badge>
            </div>

            <AnimatePresence>
              {signals.map((signal) => {
                const config = getActionConfig(signal.action)
                const ActionIcon = config.icon

                return (
                  <motion.div
                    key={signal.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <Card className={`bg-card ${config.borderColor} border-l-4`}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                          {/* Signal Info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center`}>
                                <ActionIcon className={`w-5 h-5 ${config.color}`} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-bold text-lg" dir="ltr">{signal.pair}</h3>
                                  <Badge className={`${config.bgColor} ${config.color} border-0 text-xs`}>
                                    {config.label}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>الثقة: <span className={getConfidenceColor(signal.confidence)}>{signal.confidence}%</span></span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {timeUntilExpiry(signal.expiresAt)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Price Levels */}
                            <div className="grid grid-cols-3 gap-3 mb-3">
                              <div className="p-2 rounded-lg bg-background border border-border">
                                <p className="text-[10px] text-muted-foreground">سعر الدخول</p>
                                <p className="text-sm font-medium" dir="ltr">{formatPrice(signal.entryPrice)}</p>
                              </div>
                              <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                                <p className="text-[10px] text-red-400">وقف الخسارة</p>
                                <p className="text-sm font-medium text-red-400" dir="ltr">{formatPrice(signal.stopLoss)}</p>
                              </div>
                              <div className="p-2 rounded-lg bg-green-500/5 border border-green-500/10">
                                <p className="text-[10px] text-green-400">جني الأرباح</p>
                                <p className="text-sm font-medium text-green-400" dir="ltr">{formatPrice(signal.takeProfit)}</p>
                              </div>
                            </div>

                            {/* AI Reason */}
                            <div className="p-3 rounded-lg bg-background border border-border text-sm text-muted-foreground leading-relaxed">
                              {signal.reason}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col gap-2 mr-4">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-border text-xs"
                              onClick={() => handleGenerate(signal.pair)}
                            >
                              <RefreshCw className="w-3 h-3 ml-1" />
                              تجديد
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-purple-500/30 text-purple-400 text-xs"
                              disabled
                              title="قريباً"
                            >
                              <BarChart3 className="w-3 h-3 ml-1" />
                              تنفيذ
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-red-400 text-xs"
                              onClick={() => handleCancel(signal.id)}
                            >
                              <XCircle className="w-3 h-3 ml-1" />
                              إلغاء
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Disclaimer */}
        <div className="p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              إشارات رؤى لأغراض تعليمية فقط وليست نصيحة استثمارية. تداول بمسؤولية ولا تستثمر أكثر مما يمكنك تحمل خسارته.
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
    </div>
  )
}
