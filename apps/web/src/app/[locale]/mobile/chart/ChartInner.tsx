'use client'

import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { ensureAuth } from '@/lib/api-fetch'
import { TIMEFRAMES } from '@/lib/charts/types'
import type { ChartType, DrawingTool } from '@/lib/charts/types'
import { ChevronDown, X, Minus, Plus, CandlestickChart, LineChart, BarChart3, AreaChart, Maximize2, Minimize2, Gauge, Pencil, Clock } from 'lucide-react'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { ssr: false })

const PAIRS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD']
const TF_GRID = TIMEFRAMES.filter(t => ['1min', '5min', '15min', '30min', '1h', '4h', '1day'].includes(t.value))

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (p >= 1) return p.toFixed(4)
  return p.toFixed(5)
}

export default function ChartInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const symbolParam = searchParams.get('symbol')
  const t = useTranslations('mobile.chart')
  const tc = useTranslations('common')

  const CHART_TYPES: { key: ChartType; label: string; icon: any }[] = [
    { key: 'candle', label: t('candles'), icon: CandlestickChart },
    { key: 'line', label: t('line'), icon: LineChart },
    { key: 'area', label: t('area'), icon: AreaChart },
    { key: 'bar', label: t('bars'), icon: BarChart3 },
  ]

  const quotes = useMarketStore(s => s.quotes)
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useSymbolStore()
  const { account, fetchAccount, refreshAfterTrade } = usePositionsStore()
  const addTrade = usePaperTradesStore(s => s.addTrade)
  const addNotification = useNotificationStore(s => s.addNotification)

  useEffect(() => { if (symbolParam && symbolParam !== selectedSymbol) setSelectedSymbol(symbolParam) }, [symbolParam, setSelectedSymbol, selectedSymbol])
  useEffect(() => { fetchAccount() }, [fetchAccount])

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showPairs, setShowPairs] = useState(false)
  const [showTf, setShowTf] = useState(false)
  const [showTypes, setShowTypes] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('candle')
  const [showOrder, setShowOrder] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market')
  const [orderQty, setOrderQty] = useState(0.01)
  const [orderPrice, setOrderPrice] = useState(0)
  const [showTp, setShowTp] = useState(false)
  const [showSl, setShowSl] = useState(false)
  const [tpValue, setTpValue] = useState(0)
  const [slValue, setSlValue] = useState(0)
  const [executing, setExecuting] = useState(false)

  const chartActionsRef = useRef<any>(null)

  const quote = quotes[selectedSymbol]
  const currentPrice = quote?.price ?? 0
  const changePercent = quote?.changePercent ?? 0
  const isPositive = changePercent >= 0

  useEffect(() => { chartActionsRef.current?.setChartType(chartType) }, [chartType])
  useEffect(() => { if (orderType !== 'market' && orderPrice === 0 && currentPrice > 0) setOrderPrice(currentPrice) }, [currentPrice, orderType, orderPrice])

  const executeOrder = useCallback(async () => {
    if (executing) return
    setExecuting(true)
    try {
      await ensureAuth()
      const entryPrice = orderType === 'market' ? currentPrice : orderPrice
      if (entryPrice <= 0) { addNotification({ source: 'trade', priority: 'urgent', action: 'WARN', title: t('invalidPrice'), body: t('zeroPriceError') }); return }
      addTrade({
        symbol: selectedSymbol, side: orderSide === 'buy' ? 'long' : 'short',
        qty: orderQty, entryPrice, currentPrice: entryPrice,
        tp: showTp && tpValue > 0 ? tpValue : undefined,
        sl: showSl && slValue > 0 ? slValue : undefined,
        entryTime: Date.now(), strategy: 'manual', source: 'manual',
      })
      addNotification({
        source: 'trade', priority: 'high',
        action: orderSide === 'buy' ? 'BUY' : 'SELL',
        title: `${t('positionOpened')} ${orderSide === 'buy' ? tc('buy') : tc('sell')}`,
        body: `${orderQty} ${selectedSymbol} @ $${fmtPrice(entryPrice)}`,
        pair: selectedSymbol, price: entryPrice,
      })
      refreshAfterTrade()
      setShowOrder(false)
    } catch (err: any) {
      addNotification({ source: 'trade', priority: 'urgent', action: 'WARN', title: t('executionFailed'), body: err.message || t('unknownError') })
    } finally { setExecuting(false) }
  }, [executing, orderSide, orderType, orderQty, orderPrice, currentPrice, selectedSymbol, showTp, tpValue, showSl, slValue, addTrade, addNotification, refreshAfterTrade, t, tc])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: isFullscreen ? '100dvh' : 'auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(11,14,20,0.92)', borderBottom: '0.5px solid var(--border)', zIndex: 10, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setShowPairs(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--mono)' }}>{selectedSymbol}</span>
            <ChevronDown size={12} color="rgba(255,255,255,0.4)" />
          </button>
          {currentPrice > 0 && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: isPositive ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--mono)' }}>${fmtPrice(currentPrice)}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: isPositive ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--mono)' }}>{isPositive ? '+' : ''}{changePercent.toFixed(2)}%</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ToolBtn icon={Gauge} onClick={() => chartActionsRef.current?.toggleIndicators()} />
          <ToolBtn icon={Pencil} onClick={() => chartActionsRef.current?.toggleDrawings()} />
          <ToolBtn icon={CandlestickChart} onClick={() => setShowTypes(true)} />
          <ToolBtn icon={Clock} onClick={() => setShowTf(true)} />
          <ToolBtn icon={isFullscreen ? Minimize2 : Maximize2} onClick={() => setIsFullscreen(f => !f)} />
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, position: 'relative', height: isFullscreen ? 'calc(100dvh - 110px)' : 340, minHeight: 200 }}>
        <RouaChart currentPrice={currentPrice} mobile hideToolbar isChartFullscreen={isFullscreen} onToggleChartFullscreen={() => setIsFullscreen(f => !f)} chartActions={chartActionsRef} />
      </div>

      {/* Quick trade buttons */}
      {!isFullscreen && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', background: 'rgba(11,14,20,0.95)', borderTop: '0.5px solid var(--border)', position: 'fixed', bottom: 'calc(var(--nav-h) + var(--safe-b) + 4px)', left: 0, right: 0, zIndex: 9 }}>
          <button onClick={() => { setOrderSide('buy'); setShowOrder(true) }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #00FFA3, #00D4FF)', color: '#000', fontSize: 13, fontWeight: 900, fontFamily: 'var(--cairo)' }}>{tc('buy')}</button>
          <button onClick={() => { setOrderSide('sell'); setShowOrder(true) }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #FF4757, #FF6B6B)', color: '#FFF', fontSize: 13, fontWeight: 900, fontFamily: 'var(--cairo)' }}>{tc('sell')}</button>
          <button onClick={() => { setOrderType('limit'); setOrderSide('buy'); setShowOrder(true) }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', color: 'var(--text2)', fontSize: 13, fontWeight: 900, fontFamily: 'var(--cairo)' }}>{t('pendingOrder')}</button>
        </div>
      )}

      {/* Timeframe bar */}
      {!isFullscreen && (
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', padding: '4px 8px', background: 'rgba(11,14,20,0.6)', direction: 'ltr' }}>
          {TF_GRID.map(tf => (
            <button key={tf.value} onClick={() => setTimeframe(tf.value)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: timeframe === tf.value ? 'rgba(0,212,255,0.1)' : 'transparent', color: timeframe === tf.value ? 'var(--accent)' : 'var(--text3)', fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)', minWidth: 32, textAlign: 'center' }}>{tf.label}</button>
          ))}
        </div>
      )}

      {/* Select pair */}
      {showPairs && <Overlay title={t('selectPair')} onClose={() => setShowPairs(false)}>
        {PAIRS.map(sym => { const q = quotes[sym]; const price = q?.price ?? 0; const chg = q?.changePercent ?? 0; const sel = sym === selectedSymbol; return (
          <button key={sym} onClick={() => { setSelectedSymbol(sym); setShowPairs(false); router.replace(`/mobile/chart?symbol=${sym}`) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, border: sel ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid transparent', background: sel ? 'rgba(0,212,255,0.06)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--mono)' }}>{sym}</span>
            {price > 0 ? <span style={{ fontSize: 11, fontWeight: 800, color: chg >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--mono)' }}>${fmtPrice(price)} {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</span> : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>—</span>}
          </button>
        ) })}
      </Overlay>}

      {/* Select timeframe */}
      {showTf && <Overlay title={t('timeframe')} onClose={() => setShowTf(false)}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {TIMEFRAMES.map(tf => <button key={tf.value} onClick={() => { setTimeframe(tf.value); setShowTf(false) }} style={{ padding: '8px 4px', borderRadius: 8, border: timeframe === tf.value ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid var(--border)', background: timeframe === tf.value ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)', color: timeframe === tf.value ? 'var(--accent)' : 'var(--text2)', fontSize: 11, fontWeight: 800, fontFamily: 'var(--mono)', cursor: 'pointer', textAlign: 'center' }}>{tf.label}</button>)}
        </div>
      </Overlay>}

      {/* Chart type */}
      {showTypes && <Overlay title={t('chartType')} onClose={() => setShowTypes(false)}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {CHART_TYPES.map(ct => { const Icon = ct.icon; const sel = chartType === ct.key; return (
            <button key={ct.key} onClick={() => { setChartType(ct.key); setShowTypes(false) }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 14, borderRadius: 12, cursor: 'pointer', background: sel ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)', border: sel ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid var(--border)' }}>
              <Icon size={22} color={sel ? '#00D4FF' : '#8B92A8'} />
              <span style={{ fontSize: 11, fontWeight: 800, color: sel ? '#00D4FF' : '#8B92A8', fontFamily: 'var(--cairo)' }}>{ct.label}</span>
            </button>
          ) })}
        </div>
      </Overlay>}

      {/* Order modal */}
      {showOrder && <>
        <div onClick={() => setShowOrder(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20 }} />
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 21, background: 'var(--card)', borderRadius: '20px 20px 0 0', padding: 16, maxHeight: '80dvh', overflowY: 'auto', borderTop: '0.5px solid rgba(0,212,255,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)' }}>{t('newOrder')}</span>
            <button onClick={() => setShowOrder(false)} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: 'none', cursor: 'pointer', padding: 6 }}><X size={16} color="rgba(255,255,255,0.5)" /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '0.5px solid var(--border)' }}>
            <div><div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--mono)' }}>{selectedSymbol}</div><div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--cairo)' }}>{t('currentPrice')}</div></div>
            <div style={{ fontSize: 16, fontWeight: 900, color: isPositive ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--mono)' }}>{currentPrice > 0 ? `$${fmtPrice(currentPrice)}` : '—'}</div>
          </div>
          <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2, marginBottom: 12 }}>
            <button onClick={() => setOrderSide('buy')} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: orderSide === 'buy' ? 'rgba(0,255,163,0.1)' : 'transparent', color: orderSide === 'buy' ? '#00FFA3' : 'var(--text3)', fontSize: 12, fontWeight: 800, fontFamily: 'var(--cairo)' }}>{tc('buy')}</button>
            <button onClick={() => setOrderSide('sell')} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: orderSide === 'sell' ? 'rgba(255,71,87,0.1)' : 'transparent', color: orderSide === 'sell' ? '#FF4757' : 'var(--text3)', fontSize: 12, fontWeight: 800, fontFamily: 'var(--cairo)' }}>{tc('sell')}</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['market', 'limit', 'stop'] as const).map(ot => { const labels: Record<string, string> = { market: tc('market'), limit: tc('limit'), stop: tc('stop') }; const sel = orderType === ot; return (
              <button key={ot} onClick={() => setOrderType(ot)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: sel ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid var(--border)', background: sel ? 'rgba(0,212,255,0.06)' : 'transparent', color: sel ? 'var(--accent)' : 'var(--text3)', fontSize: 11, fontWeight: 800, fontFamily: 'var(--cairo)', cursor: 'pointer' }}>{labels[ot]}</button>
            ) })}
          </div>
          {orderType !== 'market' && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '0.5px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--cairo)', marginBottom: 4 }}>{t('orderPrice')}</div>
              <input type="number" value={orderPrice || ''} onChange={e => setOrderPrice(Number(e.target.value))} placeholder="0.00" style={{ width: '100%', fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: 'var(--mono)', background: 'none', padding: 0, border: 'none', outline: 'none', appearance: 'none' }} />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--cairo)', marginBottom: 6 }}>{tc('quantity')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setOrderQty(p => Math.max(0.01, +(p - 0.01).toFixed(2)))} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Minus size={16} color="var(--text2)" /></button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--mono)' }}>{orderQty.toFixed(2)}</div>
              <button onClick={() => setOrderQty(p => +(p + 0.01).toFixed(2))} style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Plus size={16} color="var(--text2)" /></button>
            </div>
            {currentPrice > 0 && <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--cairo)', marginTop: 4 }}>{t('orderValue')}: ${fmtPrice(orderQty * currentPrice)}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--cairo)' }}>{tc('takeProfit')}</span>
                <button onClick={() => setShowTp(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: showTp ? 'rgba(0,255,163,0.2)' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: 8, background: '#FFF', transition: 'left 150ms', left: showTp ? 18 : 2 }} />
                </button>
              </div>
              {showTp && <input type="number" value={tpValue || ''} onChange={e => setTpValue(Number(e.target.value))} placeholder={t('targetPrice')} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, background: 'rgba(0,255,163,0.05)', border: '0.5px solid rgba(0,255,163,0.15)', fontSize: 12, fontWeight: 800, color: '#00FFA3', fontFamily: 'var(--mono)', outline: 'none', appearance: 'none' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--cairo)' }}>{tc('stopLoss')}</span>
                <button onClick={() => setShowSl(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: showSl ? 'rgba(255,71,87,0.2)' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: 8, background: '#FFF', transition: 'left 150ms', left: showSl ? 18 : 2 }} />
                </button>
              </div>
              {showSl && <input type="number" value={slValue || ''} onChange={e => setSlValue(Number(e.target.value))} placeholder={t('stopPrice')} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,71,87,0.05)', border: '0.5px solid rgba(255,71,87,0.15)', fontSize: 12, fontWeight: 800, color: '#FF4757', fontFamily: 'var(--mono)', outline: 'none', appearance: 'none' }} />}
            </div>
          </div>
          <button onClick={executeOrder} disabled={executing || currentPrice <= 0} style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', cursor: executing ? 'not-allowed' : 'pointer', background: orderSide === 'buy' ? 'linear-gradient(135deg, #00FFA3, #00D4FF)' : 'linear-gradient(135deg, #FF4757, #FF6B6B)', color: orderSide === 'buy' ? '#000' : '#FFF', fontSize: 15, fontWeight: 900, fontFamily: 'var(--cairo)', opacity: executing ? 0.6 : 1 }}>
            {executing ? t('executing') : `${orderSide === 'buy' ? tc('buy') : tc('sell')} ${orderQty} ${selectedSymbol}`}
          </button>
        </div>
      </>}

      {!isFullscreen && <div style={{ height: 100 }} />}
    </div>
  )
}

function ToolBtn({ icon: Icon, onClick }: { icon: any; onClick: () => void }) {
  return <button onClick={onClick} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={14} color="rgba(255,255,255,0.5)" /></button>
}

function Overlay({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 25 }}>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 24 }} />
      <div style={{ position: 'relative', zIndex: 25, margin: 'auto', marginTop: '15dvh', width: '92%', maxWidth: 400, background: 'var(--card)', borderRadius: 16, padding: 16, maxHeight: '70dvh', overflowY: 'auto', border: '0.5px solid rgba(0,212,255,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: 'none', cursor: 'pointer', padding: 6 }}><X size={14} color="rgba(255,255,255,0.5)" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
