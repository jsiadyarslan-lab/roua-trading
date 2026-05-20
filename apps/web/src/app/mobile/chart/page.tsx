'use client'

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useDashboardStore } from '@/lib/dashboard-store'
import { ensureAuth } from '@/lib/api-fetch'
import { TIMEFRAMES } from '@/lib/charts/types'
import type { ChartType, DrawingTool } from '@/lib/charts/types'
import { Card, Switch } from '@/components/mobile/FluxComponents'
import {
  ChevronDown, X, Minus, Plus, Check,
  CandlestickChart, LineChart, BarChart3, AreaChart,
  Maximize2, Minimize2, Gauge, Pencil,
  Clock,
} from 'lucide-react'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { ssr: false })

/* ═══ الأزواج المتاحة ═══ */
const PAIRS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD']

/* ═══ أنواع الشارت ═══ */
const CHART_TYPES: { key: ChartType; label: string; icon: any }[] = [
  { key: 'candle', label: 'شموع', icon: CandlestickChart },
  { key: 'line', label: 'خطي', icon: LineChart },
  { key: 'area', label: 'منطقة', icon: AreaChart },
  { key: 'bar', label: 'أعمدة', icon: BarChart3 },
]

/* ═══ إطارات زمنية مختارة ═══ */
const TF_GRID = TIMEFRAMES.filter(t => ['1min', '5min', '15min', '30min', '1h', '4h', '1day'].includes(t.value))

/* ═══ تنسيق السعر ═══ */
function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (p >= 1) return p.toFixed(4)
  return p.toFixed(5)
}

/* ═══ مكون البحث ═══ */
function ChartPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const symbolParam = searchParams.get('symbol')

  // ── Stores ──
  const quotes = useMarketStore(s => s.quotes)
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useSymbolStore()
  const { account, fetchAccount, refreshAfterTrade } = usePositionsStore()
  const addTrade = usePaperTradesStore(s => s.addTrade)
  const addNotification = useNotificationStore(s => s.addNotification)

  // ── تطبيق رمز من URL ──
  useEffect(() => {
    if (symbolParam && symbolParam !== selectedSymbol) {
      setSelectedSymbol(symbolParam)
    }
  }, [symbolParam, setSelectedSymbol, selectedSymbol])

  // ── State ──
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showPairSelector, setShowPairSelector] = useState(false)
  const [showTfGrid, setShowTfGrid] = useState(false)
  const [showChartTypes, setShowChartTypes] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('candle')
  const [showOrderSheet, setShowOrderSheet] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market')
  const [orderQty, setOrderQty] = useState(0.01)
  const [orderPrice, setOrderPrice] = useState(0)
  const [showTp, setShowTp] = useState(false)
  const [showSl, setShowSl] = useState(false)
  const [tpValue, setTpValue] = useState(0)
  const [slValue, setSlValue] = useState(0)
  const [executing, setExecuting] = useState(false)
  const [showConfirmClose, setShowConfirmClose] = useState(false)

  const chartActionsRef = useRef<{
    toggleIndicators: () => void
    toggleDrawings: () => void
    setTool: (tool: DrawingTool) => void
    zoomIn: () => void
    zoomOut: () => void
    togglePause: () => void
    setChartType: (type: ChartType) => void
    isPaused: boolean
    activeTool: DrawingTool
    addPriceLine: (id: string, price: number, color: string, label: string, lineWidth?: number, lineStyle?: number, axisLabelVisible?: boolean) => void
    removePriceLine: (id: string) => void
    setCrosshairMode: (enabled: boolean) => void
  } | null>(null)

  // ── بيانات السعر الحالي ──
  const quote = quotes[selectedSymbol]
  const currentPrice = quote?.price ?? 0
  const changePercent = quote?.changePercent ?? 0
  const isPositive = changePercent >= 0

  // ── جلب بيانات الحساب ──
  useEffect(() => { fetchAccount() }, [fetchAccount])

  // ── تطبيق نوع الشارت ──
  useEffect(() => {
    chartActionsRef.current?.setChartType(chartType)
  }, [chartType])

  // ── تحديث سعر الأمر عند تغيير السعر ──
  useEffect(() => {
    if (orderType !== 'market' && orderPrice === 0 && currentPrice > 0) {
      setOrderPrice(currentPrice)
    }
  }, [currentPrice, orderType, orderPrice])

  // ── تنفيذ الأمر ═══ ──
  const executeOrder = useCallback(async () => {
    if (executing) return
    setExecuting(true)
    try {
      await ensureAuth()

      const entryPrice = orderType === 'market' ? currentPrice : orderPrice
      if (entryPrice <= 0) {
        addNotification({ source: 'trade', priority: 'urgent', action: 'WARN', title: 'سعر غير صالح', body: 'لا يمكن تنفيذ الأمر بسعر صفر' })
        return
      }

      const side = orderSide === 'buy' ? 'long' : 'short'

      addTrade({
        symbol: selectedSymbol,
        side,
        qty: orderQty,
        entryPrice,
        currentPrice: entryPrice,
        tp: showTp && tpValue > 0 ? tpValue : undefined,
        sl: showSl && slValue > 0 ? slValue : undefined,
        entryTime: Date.now(),
        strategy: 'manual',
        source: 'manual',
      })

      addNotification({
        source: 'trade',
        priority: 'high',
        action: orderSide === 'buy' ? 'BUY' : 'SELL',
        title: `تم فتح مركز ${orderSide === 'buy' ? 'شراء' : 'بيع'}`,
        body: `${orderQty} ${selectedSymbol} @ $${fmtPrice(entryPrice)}`,
        pair: selectedSymbol,
        price: entryPrice,
      })

      refreshAfterTrade()
      setShowOrderSheet(false)
    } catch (err: any) {
      addNotification({ source: 'trade', priority: 'urgent', action: 'WARN', title: 'فشل التنفيذ', body: err.message || 'خطأ غير معروف' })
    } finally {
      setExecuting(false)
    }
  }, [executing, orderSide, orderType, orderQty, orderPrice, currentPrice, selectedSymbol, showTp, tpValue, showSl, slValue, addTrade, addNotification, refreshAfterTrade])

  // ── تغيير الكمية ──
  const adjustQty = useCallback((delta: number) => {
    setOrderQty(prev => Math.max(0.01, +(prev + delta).toFixed(2)))
  }, [])

  // ═══ UI RENDER ═══
  return (
    <div className={isFullscreen ? 'f-page--chart' : 'f-page'} style={isFullscreen ? { direction: 'rtl' } : { direction: 'rtl' }}>
      {/* ═══ شريط الأدوات العلوي ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isFullscreen ? '6px 10px' : '6px 4px',
        background: 'rgba(11,14,20,0.92)', backdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid var(--c-border)', direction: 'rtl',
        zIndex: 10, position: 'relative',
      }}>
        {/* يمين: رمز الزوج + السعر */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setShowPairSelector(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--c-border)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{selectedSymbol}</span>
            <ChevronDown size={12} color="rgba(255,255,255,0.4)" />
          </button>
          {currentPrice > 0 && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: isPositive ? 'var(--c-success)' : 'var(--c-danger)', fontFamily: 'var(--f-mono)' }}>
                ${fmtPrice(currentPrice)}
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, color: isPositive ? 'var(--c-success)' : 'var(--c-danger)', fontFamily: 'var(--f-mono)' }}>
                {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* يسار: أزرار الأدوات */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ToolBtn icon={Gauge} label="مؤشرات" onClick={() => chartActionsRef.current?.toggleIndicators()} />
          <ToolBtn icon={Pencil} label="رسم" onClick={() => chartActionsRef.current?.toggleDrawings()} />
          <ToolBtn icon={CandlestickChart} label="نوع" onClick={() => setShowChartTypes(true)} />
          <ToolBtn icon={Clock} label="إطار" onClick={() => setShowTfGrid(true)} />
          <ToolBtn
            icon={isFullscreen ? Minimize2 : Maximize2}
            label={isFullscreen ? 'تصغير' : 'تكبير'}
            onClick={() => setIsFullscreen(f => !f)}
          />
        </div>
      </div>

      {/* ═══ الشارت ═══ */}
      <div style={{ flex: 1, position: 'relative', height: isFullscreen ? 'calc(100dvh - 110px)' : 350, minHeight: 200 }}>
        <RouaChart
          currentPrice={currentPrice}
          mobile
          hideToolbar
          isChartFullscreen={isFullscreen}
          onToggleChartFullscreen={() => setIsFullscreen(f => !f)}
          chartActions={chartActionsRef}
        />
      </div>

      {/* ═══ شريط التداول السريع ═══ */}
      {!isFullscreen && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 12px',
          background: 'rgba(11,14,20,0.95)', borderTop: '0.5px solid var(--c-border)',
          position: 'fixed', bottom: 'var(--nav-total)', left: 0, right: 0,
          zIndex: 15, direction: 'rtl',
        }}>
          <button
            onClick={() => { setOrderSide('buy'); setShowOrderSheet(true) }}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #00FFA3, #00D4FF)', color: '#000',
              fontSize: 13, fontWeight: 900, fontFamily: 'var(--f-cairo)',
            }}
          >
            شراء
          </button>
          <button
            onClick={() => { setOrderSide('sell'); setShowOrderSheet(true) }}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #FF4757, #FF6B6B)', color: '#FFF',
              fontSize: 13, fontWeight: 900, fontFamily: 'var(--f-cairo)',
            }}
          >
            بيع
          </button>
          <button
            onClick={() => { setOrderType('limit'); setOrderSide('buy'); setShowOrderSheet(true) }}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--c-border)',
              color: 'var(--c-text2)', fontSize: 13, fontWeight: 900, fontFamily: 'var(--f-cairo)',
            }}
          >
            أمر معلق
          </button>
        </div>
      )}

      {/* ═══ شريط الإطار الزمني السريع (أسفل الشارت) ═══ */}
      {!isFullscreen && (
        <div style={{
          display: 'flex', gap: 0, overflowX: 'auto', padding: '4px 8px',
          background: 'rgba(11,14,20,0.6)', direction: 'ltr',
        }}>
          {TF_GRID.map(tf => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              style={{
                padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: timeframe === tf.value ? 'rgba(0,212,255,0.1)' : 'transparent',
                color: timeframe === tf.value ? 'var(--c-accent)' : 'var(--c-text3)',
                fontSize: 10, fontWeight: 800, fontFamily: 'var(--f-mono)',
                minWidth: 32, textAlign: 'center',
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>
      )}

      {/* ═══ نافذة اختيار الزوج ═══ */}
      {showPairSelector && (
        <Overlay onClose={() => setShowPairSelector(false)} title="اختر الزوج">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PAIRS.map(sym => {
              const q = quotes[sym]
              const price = q?.price ?? 0
              const chg = q?.changePercent ?? 0
              const sel = sym === selectedSymbol
              return (
                <button
                  key={sym}
                  onClick={() => { setSelectedSymbol(sym); setShowPairSelector(false); router.replace(`/mobile/chart?symbol=${sym}`) }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 10, border: sel ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid transparent',
                    background: sel ? 'rgba(0,212,255,0.06)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer', direction: 'rtl',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: sel ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 900, color: sel ? '#00D4FF' : 'rgba(255,255,255,0.4)',
                      fontFamily: 'var(--f-mono)',
                    }}>
                      {sym.split('/')[0].slice(0, 2)}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{sym}</span>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    {price > 0 ? (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>${fmtPrice(price)}</div>
                        <div style={{ fontSize: 9, fontWeight: 800, color: chg >= 0 ? 'var(--c-success)' : 'var(--c-danger)', fontFamily: 'var(--f-mono)' }}>
                          {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>—</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </Overlay>
      )}

      {/* ═══ نافذة اختيار الإطار الزمني ═══ */}
      {showTfGrid && (
        <Overlay onClose={() => setShowTfGrid(false)} title="الإطار الزمني">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.value}
                onClick={() => { setTimeframe(tf.value); setShowTfGrid(false) }}
                style={{
                  padding: '8px 4px', borderRadius: 8, border: timeframe === tf.value ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid var(--c-border)',
                  background: timeframe === tf.value ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)',
                  color: timeframe === tf.value ? 'var(--c-accent)' : 'var(--c-text2)',
                  fontSize: 11, fontWeight: 800, fontFamily: 'var(--f-mono)', cursor: 'pointer', textAlign: 'center',
                }}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </Overlay>
      )}

      {/* ═══ نافذة نوع الشارت ═══ */}
      {showChartTypes && (
        <Overlay onClose={() => setShowChartTypes(false)} title="نوع الشارت">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {CHART_TYPES.map(ct => {
              const Icon = ct.icon
              const sel = chartType === ct.key
              return (
                <button
                  key={ct.key}
                  onClick={() => { setChartType(ct.key); setShowChartTypes(false) }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: 14, borderRadius: 12, cursor: 'pointer',
                    background: sel ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)',
                    border: sel ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid var(--c-border)',
                  }}
                >
                  <Icon size={22} color={sel ? '#00D4FF' : '#8B92A8'} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: sel ? '#00D4FF' : '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{ct.label}</span>
                  {sel && <Check size={12} color="#00D4FF" />}
                </button>
              )
            })}
          </div>
        </Overlay>
      )}

      {/* ═══ نافذة الأمر ═══ */}
      {showOrderSheet && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          zIndex: 25, direction: 'rtl',
        }}>
          {/* خلفية معتمة */}
          <div onClick={() => setShowOrderSheet(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 24 }} />

          <div style={{
            position: 'relative', zIndex: 25,
            background: 'var(--c-card)', borderRadius: '20px 20px 0 0',
            padding: '16px', maxHeight: '80dvh', overflowY: 'auto',
            borderTop: '0.5px solid var(--c-border-act)',
          }}>
            {/* رأس النافذة */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>أمر جديد</span>
              <button onClick={() => setShowOrderSheet(false)} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: 'none', cursor: 'pointer', padding: 6 }}>
                <X size={16} color="rgba(255,255,255,0.5)" />
              </button>
            </div>

            {/* رمز الزوج + السعر */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '0.5px solid var(--c-border)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{selectedSymbol}</div>
                <div style={{ fontSize: 10, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)' }}>السعر الحالي</div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: isPositive ? 'var(--c-success)' : 'var(--c-danger)', fontFamily: 'var(--f-mono)' }}>
                  {currentPrice > 0 ? `$${fmtPrice(currentPrice)}` : '—'}
                </div>
              </div>
            </div>

            {/* تبديل شراء/بيع */}
            <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2, marginBottom: 12 }}>
              <button
                onClick={() => setOrderSide('buy')}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: orderSide === 'buy' ? 'rgba(0,255,163,0.1)' : 'transparent',
                  color: orderSide === 'buy' ? '#00FFA3' : 'var(--c-text3)',
                  fontSize: 12, fontWeight: 800, fontFamily: 'var(--f-cairo)',
                }}
              >
                شراء
              </button>
              <button
                onClick={() => setOrderSide('sell')}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: orderSide === 'sell' ? 'rgba(255,71,87,0.1)' : 'transparent',
                  color: orderSide === 'sell' ? '#FF4757' : 'var(--c-text3)',
                  fontSize: 12, fontWeight: 800, fontFamily: 'var(--f-cairo)',
                }}
              >
                بيع
              </button>
            </div>

            {/* نوع الأمر */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(['market', 'limit', 'stop'] as const).map(t => {
                const labels: Record<string, string> = { market: 'سوقي', limit: 'محدد', stop: 'وقف' }
                const sel = orderType === t
                return (
                  <button
                    key={t}
                    onClick={() => setOrderType(t)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 8, border: sel ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid var(--c-border)',
                      background: sel ? 'rgba(0,212,255,0.06)' : 'transparent',
                      color: sel ? 'var(--c-accent)' : 'var(--c-text3)',
                      fontSize: 11, fontWeight: 800, fontFamily: 'var(--f-cairo)', cursor: 'pointer',
                    }}
                  >
                    {labels[t]}
                  </button>
                )
              })}
            </div>

            {/* سعر الأمر (للمحدد والوقف) */}
            {orderType !== 'market' && (
              <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '0.5px solid var(--c-border)' }}>
                <div style={{ fontSize: 10, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)', marginBottom: 4 }}>سعر الأمر</div>
                <input
                  type="number"
                  value={orderPrice || ''}
                  onChange={e => setOrderPrice(Number(e.target.value))}
                  style={{
                    width: '100%', fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)',
                    background: 'none', padding: 0,
                  }}
                  placeholder="0.00"
                />
              </div>
            )}

            {/* الكمية */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)', marginBottom: 6 }}>الكمية</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => adjustQty(-0.01)} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Minus size={16} color="var(--c-text2)" />
                </button>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>
                  {orderQty.toFixed(2)}
                </div>
                <button onClick={() => adjustQty(0.01)} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Plus size={16} color="var(--c-text2)" />
                </button>
              </div>
              {currentPrice > 0 && (
                <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)', marginTop: 4 }}>
                  القيمة: ${fmtPrice(orderQty * currentPrice)}
                </div>
              )}
            </div>

            {/* جني الأرباح / وقف الخسارة */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)' }}>جني الأرباح</span>
                  <Switch value={showTp} onChange={setShowTp} color="#00FFA3" />
                </div>
                {showTp && (
                  <input
                    type="number"
                    value={tpValue || ''}
                    onChange={e => setTpValue(Number(e.target.value))}
                    placeholder="سعر الهدف"
                    style={{
                      width: '100%', padding: '6px 10px', borderRadius: 8,
                      background: 'rgba(0,255,163,0.05)', border: '0.5px solid rgba(0,255,163,0.15)',
                      fontSize: 12, fontWeight: 800, color: '#00FFA3', fontFamily: 'var(--f-mono)',
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)' }}>وقف الخسارة</span>
                  <Switch value={showSl} onChange={setShowSl} color="#FF4757" />
                </div>
                {showSl && (
                  <input
                    type="number"
                    value={slValue || ''}
                    onChange={e => setSlValue(Number(e.target.value))}
                    placeholder="سعر الوقف"
                    style={{
                      width: '100%', padding: '6px 10px', borderRadius: 8,
                      background: 'rgba(255,71,87,0.05)', border: '0.5px solid rgba(255,71,87,0.15)',
                      fontSize: 12, fontWeight: 800, color: '#FF4757', fontFamily: 'var(--f-mono)',
                    }}
                  />
                )}
              </div>
            </div>

            {/* زر التنفيذ */}
            <button
              onClick={executeOrder}
              disabled={executing || currentPrice <= 0}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', cursor: executing ? 'not-allowed' : 'pointer',
                background: orderSide === 'buy'
                  ? 'linear-gradient(135deg, #00FFA3, #00D4FF)'
                  : 'linear-gradient(135deg, #FF4757, #FF6B6B)',
                color: orderSide === 'buy' ? '#000' : '#FFF',
                fontSize: 15, fontWeight: 900, fontFamily: 'var(--f-cairo)',
                opacity: executing ? 0.6 : 1,
              }}
            >
              {executing ? 'جارٍ التنفيذ...' : `${orderSide === 'buy' ? 'شراء' : 'بيع'} ${orderQty} ${selectedSymbol}`}
            </button>
          </div>
        </div>
      )}

      {/* مسافة أسفل شريط التنقل */}
      {!isFullscreen && <div style={{ height: 56 }} />}
    </div>
  )
}

/* ═══ زر أداة ═══ */
function ToolBtn({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer',
        background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Icon size={14} color="rgba(255,255,255,0.5)" />
    </button>
  )
}

/* ═══ نافذة منبثقة ═══ */
function Overlay({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 25, direction: 'rtl' }}>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 24 }} />
      <div style={{
        position: 'relative', zIndex: 25, margin: 'auto', marginTop: '15dvh',
        width: '92%', maxWidth: 400, background: 'var(--c-card)', borderRadius: 16,
        padding: 16, maxHeight: '70dvh', overflowY: 'auto',
        border: '0.5px solid var(--c-border-act)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: 'none', cursor: 'pointer', padding: 6 }}>
            <X size={14} color="rgba(255,255,255,0.5)" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ═══ الصفحة الرئيسية ═══ */
export default function ChartPage() {
  return (
    <Suspense fallback={
      <div className="f-page" style={{ direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="f-skel" style={{ width: '80%', height: 300 }} />
      </div>
    }>
      <ChartPageInner />
    </Suspense>
  )
}
