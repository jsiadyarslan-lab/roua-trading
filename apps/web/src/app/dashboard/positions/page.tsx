'use client'

import { useState, useEffect, useCallback, startTransition } from 'react'
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
  Briefcase,
  Activity,
  Target,
  Shield,
  Edit3,
  BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

interface PositionSummary {
  totalPositions: number
  totalValue: number
  unrealizedPnl: number
  realizedPnl: number
}

// ── Constants ──
const EXCHANGES = ['الكل', 'binance', 'kucoin', 'bybit', 'okx', 'gate']
const SYMBOLS = ['الكل', 'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT']

export default function PositionsPage() {
  const router = useRouter()

  // Auth
  const [authChecked, setAuthChecked] = useState(false)

  // Data
  const [positions, setPositions] = useState<Position[]>([])
  const [summary, setSummary] = useState<PositionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiUnavailable, setApiUnavailable] = useState(false)

  // Filters
  const [filterExchange, setFilterExchange] = useState('الكل')
  const [filterSymbol, setFilterSymbol] = useState('الكل')

  // Dialogs
  const [closeDialog, setCloseDialog] = useState<Position | null>(null)
  const [editDialog, setEditDialog] = useState<Position | null>(null)
  const [closing, setClosing] = useState(false)
  const [updating, setUpdating] = useState(false)

  // Close form
  const [closeQuantity, setCloseQuantity] = useState('')
  const [closeError, setCloseError] = useState('')

  // Edit form
  const [editStopLoss, setEditStopLoss] = useState('')
  const [editTakeProfit, setEditTakeProfit] = useState('')
  const [editError, setEditError] = useState('')

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

  // ── Fetch positions ──
  const fetchPositions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trading/positions')
      if (res.ok) {
        const data = await res.json()
        setPositions(data.data || data.positions || [])
      } else {
        setApiUnavailable(true)
      }
    } catch {
      setApiUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Fetch summary ──
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/positions/summary')
      if (res.ok) {
        const data = await res.json()
        setSummary(data.data || data.summary || null)
      }
    } catch {
      // Gracefully handle
    }
  }, [])

  useEffect(() => {
    if (authChecked) {
      startTransition(() => {
        fetchPositions()
        fetchSummary()
      })
    }
  }, [authChecked])

  // ── Open close dialog with full quantity default ──
  const openCloseDialog = (pos: Position) => {
    setCloseQuantity(pos.quantity.toString())
    setCloseError('')
    setCloseDialog(pos)
  }

  // ── Close position ──
  const handleClosePosition = async () => {
    if (!closeDialog) return
    setClosing(true)
    setCloseError('')

    const qty = closeQuantity ? parseFloat(closeQuantity) : closeDialog.quantity
    const isPartial = qty < closeDialog.quantity

    try {
      const body: Record<string, unknown> = { positionId: closeDialog.id }
      if (isPartial && qty > 0) {
        body.quantity = qty
      }

      const res = await fetch('/api/trading/positions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        if (isPartial) {
          // Update position with reduced quantity
          setPositions((prev) =>
            prev.map((p) =>
              p.id === closeDialog.id
                ? { ...p, quantity: p.quantity - qty }
                : p
            )
          )
        } else {
          setPositions((prev) => prev.filter((p) => p.id !== closeDialog.id))
        }
        fetchSummary()
      } else {
        const data = await res.json()
        throw new Error(data.error || 'فشل في إغلاق المركز')
      }
    } catch (err: any) {
      setCloseError(err.message)
    } finally {
      setClosing(false)
      if (!closeError) {
        setCloseDialog(null)
      }
    }
  }

  // ── Update SL/TP ──
  const handleUpdateLevels = async () => {
    if (!editDialog) return
    setUpdating(true)
    setEditError('')

    try {
      const body: Record<string, unknown> = {}
      if (editStopLoss) body.stopLoss = parseFloat(editStopLoss)
      if (editTakeProfit) body.takeProfit = parseFloat(editTakeProfit)

      const res = await fetch(`/api/trading/positions/${editDialog.id}/levels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        // Update locally
        setPositions((prev) =>
          prev.map((p) =>
            p.id === editDialog.id
              ? {
                  ...p,
                  stopLoss: editStopLoss ? parseFloat(editStopLoss) : p.stopLoss,
                  takeProfit: editTakeProfit ? parseFloat(editTakeProfit) : p.takeProfit,
                }
              : p
          )
        )
        setEditDialog(null)
      } else {
        const data = await res.json()
        throw new Error(data.error || 'فشل في تحديث المستويات')
      }
    } catch (err: any) {
      setEditError(err.message)
    } finally {
      setUpdating(false)
    }
  }

  // ── Open edit dialog with current values ──
  const openEditDialog = (pos: Position) => {
    setEditStopLoss(pos.stopLoss?.toString() || '')
    setEditTakeProfit(pos.takeProfit?.toString() || '')
    setEditError('')
    setEditDialog(pos)
  }

  // ── Helpers ──
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)

  const formatPrice = (value: number) => {
    if (value >= 1000) return formatCurrency(value)
    if (value >= 1) return value.toFixed(2)
    return value.toFixed(6)
  }

  // ── Filtered positions ──
  const filteredPositions = positions.filter((pos) => {
    if (filterExchange !== 'الكل' && pos.exchange !== filterExchange) return false
    if (filterSymbol !== 'الكل' && pos.symbol !== filterSymbol) return false
    return true
  })

  const totalUnrealizedPnl = filteredPositions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)

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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">المراكز المفتوحة</h1>
              <p className="text-sm text-muted-foreground">
                إدارة وتتبع المراكز النشطة
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
              onClick={() => { fetchPositions(); fetchSummary() }}
              variant="outline"
              size="sm"
              className="border-border"
            >
              <RefreshCw className="w-4 h-4 ml-1" />
              تحديث
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-teal-400" />
                <p className="text-xs text-muted-foreground">إجمالي المراكز</p>
              </div>
              <p className="text-2xl font-bold">{summary?.totalPositions ?? positions.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-4 h-4 text-amber-400" />
                <p className="text-xs text-muted-foreground">القيمة الإجمالية</p>
              </div>
              <p className="text-2xl font-bold" dir="ltr">
                {formatCurrency(summary?.totalValue ?? 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <p className="text-xs text-muted-foreground">الأرباح/الخسائر غير المحققة</p>
              </div>
              <p className={`text-2xl font-bold ${
                (summary?.unrealizedPnl ?? totalUnrealizedPnl) >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`} dir="ltr">
                {(summary?.unrealizedPnl ?? totalUnrealizedPnl) >= 0 ? '+' : ''}
                {formatCurrency(summary?.unrealizedPnl ?? totalUnrealizedPnl)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-purple-400" />
                <p className="text-xs text-muted-foreground">الأرباح المحققة</p>
              </div>
              <p className={`text-2xl font-bold ${
                (summary?.realizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`} dir="ltr">
                {(summary?.realizedPnl ?? 0) >= 0 ? '+' : ''}
                {formatCurrency(summary?.realizedPnl ?? 0)}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">البورصة:</Label>
                  <Select value={filterExchange} onValueChange={setFilterExchange}>
                    <SelectTrigger className="w-[130px] bg-background h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXCHANGES.map((ex) => (
                        <SelectItem key={ex} value={ex}>{ex === 'الكل' ? 'الكل' : ex}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">الزوج:</Label>
                  <Select value={filterSymbol} onValueChange={setFilterSymbol}>
                    <SelectTrigger className="w-[130px] bg-background h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYMBOLS.map((sym) => (
                        <SelectItem key={sym} value={sym}>{sym}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Positions Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-amber-400" />
                  المراكز
                  <Badge variant="outline" className="text-xs mr-1">
                    {filteredPositions.length}
                  </Badge>
                </CardTitle>
                {filteredPositions.length > 0 && (
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground">الإجمالي</p>
                    <p className={`text-sm font-bold ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`} dir="ltr">
                      {totalUnrealizedPnl >= 0 ? '+' : ''}{formatCurrency(totalUnrealizedPnl)}
                    </p>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 text-muted-foreground mx-auto animate-spin" />
                  <p className="text-sm text-muted-foreground mt-3">جارٍ التحميل...</p>
                </div>
              ) : apiUnavailable ? (
                <div className="text-center py-12">
                  <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-4 opacity-50" />
                  <p className="text-sm text-muted-foreground mb-2">محرك التداول غير متاح حالياً</p>
                  <p className="text-xs text-muted-foreground">تأكد من تشغيل خادم NestJS على المنفذ 3001</p>
                </div>
              ) : filteredPositions.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                  <p className="font-medium mb-1">لا توجد مراكز مفتوحة</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {positions.length > 0
                      ? 'لا توجد مراكز تطابق عوامل التصفية'
                      : 'ابدأ بالتداول لرؤية المراكز هنا'}
                  </p>
                  {positions.length === 0 && (
                    <Button
                      onClick={() => router.push('/dashboard/trading')}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      <Activity className="w-4 h-4 ml-2" />
                      الانتقال للتداول
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-right py-3 px-2 text-xs text-muted-foreground font-medium">الزوج</th>
                          <th className="text-right py-3 px-2 text-xs text-muted-foreground font-medium">البورصة</th>
                          <th className="text-right py-3 px-2 text-xs text-muted-foreground font-medium">الاتجاه</th>
                          <th className="text-right py-3 px-2 text-xs text-muted-foreground font-medium">الكمية</th>
                          <th className="text-right py-3 px-2 text-xs text-muted-foreground font-medium">سعر الدخول</th>
                          <th className="text-right py-3 px-2 text-xs text-muted-foreground font-medium">السعر الحالي</th>
                          <th className="text-right py-3 px-2 text-xs text-muted-foreground font-medium">ر/خ</th>
                          <th className="text-right py-3 px-2 text-xs text-muted-foreground font-medium">وقف الخسارة</th>
                          <th className="text-right py-3 px-2 text-xs text-muted-foreground font-medium">جني الأرباح</th>
                          <th className="text-right py-3 px-2 text-xs text-muted-foreground font-medium">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPositions.map((pos) => (
                          <tr key={pos.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                                  pos.side === 'LONG'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-red-500/10 text-red-400'
                                }`}>
                                  {pos.symbol.slice(0, 2)}
                                </div>
                                <span className="font-medium" dir="ltr">{pos.symbol}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <Badge variant="outline" className="text-xs">{pos.exchange}</Badge>
                            </td>
                            <td className="py-3 px-2">
                              <Badge className={`text-xs border-0 ${
                                pos.side === 'LONG'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-red-500/10 text-red-400'
                              }`}>
                                {pos.side === 'LONG' ? 'شراء' : 'بيع'}
                              </Badge>
                            </td>
                            <td className="py-3 px-2" dir="ltr">{pos.quantity}</td>
                            <td className="py-3 px-2" dir="ltr">{formatPrice(pos.entryPrice)}</td>
                            <td className="py-3 px-2" dir="ltr">{formatPrice(pos.currentPrice)}</td>
                            <td className="py-3 px-2">
                              <span className={`font-medium ${
                                (pos.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`} dir="ltr">
                                {(pos.unrealizedPnl || 0) >= 0 ? '+' : ''}{formatCurrency(pos.unrealizedPnl || 0)}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              {pos.stopLoss ? (
                                <span className="text-red-400" dir="ltr">{formatPrice(pos.stopLoss)}</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              {pos.takeProfit ? (
                                <span className="text-emerald-400" dir="ltr">{formatPrice(pos.takeProfit)}</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(pos)}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-teal-400"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openCloseDialog(pos)}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                    {filteredPositions.map((pos) => (
                      <div
                        key={pos.id}
                        className="p-4 rounded-lg bg-background border border-border"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                              pos.side === 'LONG'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                              {pos.side === 'LONG' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="font-medium" dir="ltr">{pos.symbol}</p>
                              <div className="flex items-center gap-2">
                                <Badge className={`text-[10px] border-0 ${
                                  pos.side === 'LONG'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-red-500/10 text-red-400'
                                }`}>
                                  {pos.side === 'LONG' ? 'شراء' : 'بيع'}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">{pos.exchange}</Badge>
                              </div>
                            </div>
                          </div>
                          <p className={`text-lg font-bold ${
                            (pos.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`} dir="ltr">
                            {(pos.unrealizedPnl || 0) >= 0 ? '+' : ''}{formatCurrency(pos.unrealizedPnl || 0)}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="p-2 rounded bg-card border border-border/50">
                            <p className="text-[10px] text-muted-foreground">الكمية</p>
                            <p className="text-xs font-medium" dir="ltr">{pos.quantity}</p>
                          </div>
                          <div className="p-2 rounded bg-card border border-border/50">
                            <p className="text-[10px] text-muted-foreground">سعر الدخول</p>
                            <p className="text-xs font-medium" dir="ltr">{formatPrice(pos.entryPrice)}</p>
                          </div>
                          <div className="p-2 rounded bg-card border border-border/50">
                            <p className="text-[10px] text-muted-foreground">السعر الحالي</p>
                            <p className="text-xs font-medium" dir="ltr">{formatPrice(pos.currentPrice)}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="p-2 rounded bg-red-500/5 border border-red-500/10">
                            <p className="text-[10px] text-red-400">وقف الخسارة</p>
                            <p className="text-xs font-medium text-red-400" dir="ltr">
                              {pos.stopLoss ? formatPrice(pos.stopLoss) : '—'}
                            </p>
                          </div>
                          <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/10">
                            <p className="text-[10px] text-emerald-400">جني الأرباح</p>
                            <p className="text-xs font-medium text-emerald-400" dir="ltr">
                              {pos.takeProfit ? formatPrice(pos.takeProfit) : '—'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(pos)}
                            className="flex-1 text-xs border-teal-500/30 text-teal-400"
                          >
                            <Edit3 className="w-3 h-3 ml-1" />
                            تعديل SL/TP
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCloseDialog(pos)}
                            className="flex-1 text-xs border-red-500/30 text-red-400"
                          >
                            <XCircle className="w-3 h-3 ml-1" />
                            إغلاق
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Disclaimer */}
        <div className="p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              إدارة المراكز تتطلب اتصالاً بخادم التداول. رؤى لا تلمس أموالك أبداً — نحن ننفذ الأوامر فقط من خلال مفاتيح API المشفرة.
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

      {/* Close Position Confirmation Dialog (with partial close) */}
      <Dialog open={!!closeDialog} onOpenChange={(open) => !open && setCloseDialog(null)}>
        <DialogContent className="bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد إغلاق المركز</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من إغلاق مركز {closeDialog?.symbol}؟ يمكنك إغلاق المركز بالكامل أو جزئياً.
            </DialogDescription>
          </DialogHeader>
          {closeDialog && (
            <>
              <div className="grid grid-cols-2 gap-3 my-4">
                <div className="p-3 rounded-lg bg-background border border-border">
                  <p className="text-[10px] text-muted-foreground">الاتجاه</p>
                  <p className={`text-sm font-medium ${closeDialog.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {closeDialog.side === 'LONG' ? 'شراء' : 'بيع'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <p className="text-[10px] text-muted-foreground">الكمية الحالية</p>
                  <p className="text-sm font-medium">{closeDialog.quantity}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <p className="text-[10px] text-muted-foreground">سعر الدخول</p>
                  <p className="text-sm font-medium" dir="ltr">{formatPrice(closeDialog.entryPrice)}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <p className="text-[10px] text-muted-foreground">ر/خ غير محقق</p>
                  <p className={`text-sm font-bold ${
                    (closeDialog.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`} dir="ltr">
                    {formatCurrency(closeDialog.unrealizedPnl || 0)}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">كمية الإغلاق (اتركها للإغلاق الكامل)</Label>
                <Input
                  type="number"
                  value={closeQuantity}
                  onChange={(e) => setCloseQuantity(e.target.value)}
                  placeholder={`الحد الأقصى: ${closeDialog.quantity}`}
                  min={0}
                  max={closeDialog.quantity}
                  step={0.001}
                  dir="ltr"
                  className="bg-background"
                />
                {closeQuantity && parseFloat(closeQuantity) < closeDialog.quantity && parseFloat(closeQuantity) > 0 && (
                  <p className="text-[10px] text-yellow-400">
                    ⚠ إغلاق جزئي — سيبقى {closeDialog.quantity - parseFloat(closeQuantity)} {closeDialog.symbol} مفتوحاً
                  </p>
                )}
                {closeQuantity && parseFloat(closeQuantity) > closeDialog.quantity && (
                  <p className="text-[10px] text-red-400">
                    الكمية تتجاوز المركز المتاح
                  </p>
                )}
              </div>
            </>
          )}
          {closeError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">{closeError}</p>
            </div>
          )}
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setCloseDialog(null)}
              className="flex-1"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleClosePosition}
              disabled={closing || (closeQuantity ? parseFloat(closeQuantity) > (closeDialog?.quantity || 0) || parseFloat(closeQuantity) <= 0 : false)}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
            >
              {closing ? (
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 ml-2" />
              )}
              {closeQuantity && parseFloat(closeQuantity) < (closeDialog?.quantity || 0) ? 'إغلاق جزئي' : 'إغلاق المركز'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit SL/TP Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل مستويات الوقف والأرباح</DialogTitle>
            <DialogDescription>
              تحديث مستويات وقف الخسارة وجني الأرباح لمركز {editDialog?.symbol}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 my-4">
            <div className="space-y-2">
              <Label>وقف الخسارة (Stop Loss)</Label>
              <Input
                type="number"
                value={editStopLoss}
                onChange={(e) => setEditStopLoss(e.target.value)}
                placeholder={editDialog?.stopLoss ? formatPrice(editDialog.stopLoss) : 'أدخل سعر الوقف'}
                dir="ltr"
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label>جني الأرباح (Take Profit)</Label>
              <Input
                type="number"
                value={editTakeProfit}
                onChange={(e) => setEditTakeProfit(e.target.value)}
                placeholder={editDialog?.takeProfit ? formatPrice(editDialog.takeProfit) : 'أدخل سعر الجني'}
                dir="ltr"
                className="bg-background"
              />
            </div>
            {editError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-400">{editError}</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setEditDialog(null)}
              className="flex-1"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleUpdateLevels}
              disabled={updating}
              className="flex-1 bg-teal-500 hover:bg-teal-600 text-white"
            >
              {updating ? (
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              ) : (
                <Shield className="w-4 h-4 ml-2" />
              )}
              تحديث
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
