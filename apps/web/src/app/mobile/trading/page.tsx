'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, Card } from '@/components/mobile/Card'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { ensureAuth } from '@/lib/api-fetch'
import {
  TrendingUp, TrendingDown, ChevronDown, Minus, Plus,
  Target, ShieldAlert, Loader2, CheckCircle, AlertCircle,
  ArrowUpRight, ArrowDownRight, Clock, Zap, Wallet,
  Eye, ChevronLeft, Activity
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   ROUA MOBILE — Full Trading Dashboard
   Account overview, positions, quick trade, activity, movers
   ═══════════════════════════════════════════════════════════════ */

const C = {
  accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757',
  amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8',
  bg: '#1A1D29', border: 'rgba(255,255,255,0.06)',
}

const PAIRS = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'SOL/USD']

type ExecStatus = 'idle' | 'validating' | 'submitting' | 'filled' | 'rejected' | 'error'

export default function MobileTradingPage() {
  const router = useRouter()

  /* ── Stores ── */
  const account = usePositionsStore(s => s.account)
  const positions = usePositionsStore(s => s.positions)
  const refreshAfterTrade = usePositionsStore(s => s.refreshAfterTrade)
  const quotes = useMarketStore(s => s.quotes)
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const addPaperTrade = usePaperTradesStore(s => s.addTrade)
  const trades = usePaperTradesStore(s => s.trades)
  const addNotification = useNotificationStore(s => s.addNotification)

  /* ── Order State ── */
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market')
  const [quantity, setQuantity] = useState('0.01')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [tpEnabled, setTpEnabled] = useState(false)
  const [slEnabled, setSlEnabled] = useState(false)
  const [tpValue, setTpValue] = useState('')
  const [slValue, setSlValue] = useState('')
  const [execStatus, setExecStatus] = useState<ExecStatus>('idle')
  const [execMessage, setExecMessage] = useState('')
  const [showPairDropdown, setShowPairDropdown] = useState(false)

  /* ── Live price for selected symbol ── */
  const quoteKey = quotes && selectedSymbol
    ? Object.keys(quotes).find(k => k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', ''))
    : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : null

  /* ── Account values ── */
  const equity = Number(account?.equity ?? 0) || 0
  const buyingPower = Number(account?.buyingPower ?? account?.buying_power ?? 0) || 0
  const unrealizedPnl = Number(account?.unrealizedPnl ?? 0) || 0
  const dailyPnlPct = equity > 0 ? (unrealizedPnl / equity) * 100 : 0
  const isPnlUp = unrealizedPnl >= 0
  const openCount = positions.length

  /* ── Recent activity ── */
  const recentTrades = useMemo(() => trades.slice(0, 5), [trades])

  /* ── Market movers ── */
  const { gainers, losers } = useMemo(() => {
    const allQuotes = Object.values(quotes)
    const sorted = [...allQuotes].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
    return {
      gainers: sorted.slice(0, 3).filter(q => (q.changePercent ?? 0) > 0),
      losers: sorted.slice(-3).reverse().filter(q => (q.changePercent ?? 0) < 0),
    }
  }, [quotes])

  /* ── Dropdown close on outside click ── */
  const dropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowPairDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  /* ── Quantity adjust ── */
  const adjustQty = (delta: number) => {
    const current = parseFloat(quantity) || 0
    const step = (livePrice && livePrice > 1000) ? 0.01 : (livePrice && livePrice > 10) ? 0.1 : 1
    const newVal = Math.max(0, current + delta * step)
    setQuantity(newVal.toFixed(newVal < 1 ? 4 : newVal < 100 ? 2 : 0))
  }

  /* ── Validate order ── */
  const validateOrder = (): string | null => {
    const qty = parseFloat(quantity)
    if (!qty || qty <= 0) return 'يرجى إدخال كمية صالحة'
    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) return 'يرجى إدخال سعر الحد'
    if (orderType === 'stop' && (!stopPrice || parseFloat(stopPrice) <= 0)) return 'يرجى إدخال سعر الوقف'
    if (!livePrice || livePrice <= 0) return 'سعر السوق غير متوفر'
    return null
  }

  /* ── Execute order (reused from chart page) ── */
  const executeOrder = async (side: 'buy' | 'sell') => {
    const err = validateOrder()
    if (err) {
      setExecStatus('error')
      setExecMessage(err)
      setTimeout(() => setExecStatus('idle'), 3000)
      return
    }

    setExecStatus('submitting')
    setExecMessage('جارٍ إرسال الأمر...')

    const body: Record<string, any> = {
      symbol: selectedSymbol,
      side,
      qty: parseFloat(quantity),
      type: orderType === 'stop' ? 'stop' : orderType,
      time_in_force: 'ioc',
    }
    if (orderType === 'limit' && limitPrice) body.limit_price = parseFloat(limitPrice)
    if (orderType === 'stop' && stopPrice) body.stop_price = parseFloat(stopPrice)
    if (slEnabled && slValue) body.stop_loss = parseFloat(slValue)
    if (tpEnabled && tpValue) body.take_profit = parseFloat(tpValue)

    let success = false
    let filledPrice = 0

    try {
      await ensureAuth()
      const credRes = await fetch('/api/portfolio/credentials')
      const credData = await credRes.json()
      const credentials = credData.data || credData.credentials || []
      const credentialId = credentials[0]?.id || credentials[0]?.credentialId

      if (credentialId) {
        const nestBody = {
          exchangeCredentialId: credentialId,
          symbol: selectedSymbol,
          side: side.toUpperCase(),
          type: orderType.toUpperCase(),
          quantity: parseFloat(quantity),
          price: orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : undefined,
          stopLoss: slEnabled && slValue ? parseFloat(slValue) : (stopPrice ? parseFloat(stopPrice) : undefined),
          takeProfit: tpEnabled && tpValue ? parseFloat(tpValue) : undefined,
          idempotencyKey: `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }
        const res = await fetch('/api/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nestBody),
        })
        const j = await res.json()
        if (res.ok && j.id) {
          success = true
          filledPrice = j.filledAvgPrice || j.avgFillPrice || livePrice || 0
        } else if (res.status === 403) {
          setExecStatus('rejected')
          setExecMessage(j.message || 'تم رفض الأمر')
          setTimeout(() => setExecStatus('idle'), 5000)
          return
        } else throw new Error(j.message || 'Error')
      } else {
        throw new Error('No credentials')
      }
    } catch {
      try {
        const res = await fetch('/api/alpaca/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const j = await res.json()
        if (j.success) {
          success = true
          filledPrice = j.filledAvgPrice ? parseFloat(j.filledAvgPrice) : (livePrice || 0)
        } else {
          setExecStatus('error')
          setExecMessage(j.error || 'فشل التنفيذ')
          setTimeout(() => setExecStatus('idle'), 4000)
          return
        }
      } catch {
        setExecStatus('error')
        setExecMessage('خطأ في الشبكة')
        setTimeout(() => setExecStatus('idle'), 4000)
        return
      }
    }

    if (success) {
      addPaperTrade({
        symbol: selectedSymbol,
        side: side === 'buy' ? 'long' : 'short',
        qty: parseFloat(quantity),
        entryPrice: filledPrice,
        currentPrice: livePrice || filledPrice,
        tp: tpEnabled && tpValue ? parseFloat(tpValue) : undefined,
        sl: slEnabled && slValue ? parseFloat(slValue) : undefined,
        source: 'manual',
        entryTime: Date.now(),
      })
      setExecStatus('filled')
      setExecMessage(`تم ${side === 'buy' ? 'شراء' : 'بيع'} ${quantity} ${selectedSymbol} بسعر $${filledPrice.toFixed(2)}`)
      addNotification({
        source: 'trade',
        priority: 'high',
        action: side === 'buy' ? 'BUY' : 'SELL',
        title: `تم ${side === 'buy' ? 'شراء' : 'بيع'} ${selectedSymbol}`,
        body: `${quantity} ${selectedSymbol} @ $${filledPrice.toFixed(2)}`,
        pair: selectedSymbol,
        price: filledPrice,
      })
      refreshAfterTrade()
      setTimeout(() => {
        setExecStatus('idle')
        setTpEnabled(false)
        setSlEnabled(false)
        setTpValue('')
        setSlValue('')
        setLimitPrice('')
        setStopPrice('')
      }, 2500)
    }
  }

  /* ── Format helpers ── */
  const fmtPrice = (p: number | null | undefined) => {
    if (!p) return '—'
    if (p > 100) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return p.toFixed(4)
  }

  const fmtTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="r-page">
      <PageHeader title="التداول الحي" subtitle="لوحة التحكم" />

      {/* ── 1. Account Overview Card ── */}
      <Card highlight>
        <div style={{ direction: 'rtl' }}>
          {/* Equity Row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 2 }}>
                إجمالي رأس المال
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: C.text, fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
                ${equity.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {/* P&L indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                {isPnlUp ? <ArrowUpRight size={12} color={C.success} /> : <ArrowDownRight size={12} color={C.danger} />}
                <span style={{ fontSize: 12, fontWeight: 800, color: isPnlUp ? C.success : C.danger, fontFamily: 'var(--font-mono)' }}>
                  {isPnlUp ? '+' : ''}{unrealizedPnl.toFixed(2)}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
                  background: isPnlUp ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)',
                  color: isPnlUp ? C.success : C.danger,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {isPnlUp ? '+' : ''}{dailyPnlPct.toFixed(2)}%
                </span>
              </div>
            </div>
            <div style={{
              padding: '8px 14px', borderRadius: 12, textAlign: 'center',
              background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.12)',
            }}>
              <Wallet size={16} color={C.accent} style={{ display: 'block', margin: '0 auto 3px' }} />
              <div style={{ fontSize: 9, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>قوة الشراء</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: C.accent, fontFamily: 'var(--font-mono)' }}>
                ${buyingPower.toLocaleString('en', { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
            padding: '8px 10px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 2 }}>P&L اليومي</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: isPnlUp ? C.success : C.danger, fontFamily: 'var(--font-mono)' }}>
                {isPnlUp ? '+' : ''}${unrealizedPnl.toFixed(2)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 2 }}>المراكز المفتوحة</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.text, fontFamily: 'var(--font-mono)' }}>{openCount}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 2 }}>النسبة</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: isPnlUp ? C.success : C.danger, fontFamily: 'var(--font-mono)' }}>
                {isPnlUp ? '+' : ''}{dailyPnlPct.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 2. Active Positions Summary ── */}
      {positions.length > 0 && (
        <Card>
          <div style={{ direction: 'rtl' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: 'var(--font-cairo)' }}>المراكز النشطة</span>
              <button
                onClick={() => router.push('/mobile/positions')}
                style={{
                  fontSize: 10, fontWeight: 800, color: C.accent, fontFamily: 'var(--font-cairo)',
                  background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.12)',
                  borderRadius: 6, padding: '3px 10px', cursor: 'pointer', touchAction: 'manipulation',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                عرض الكل
                <ChevronLeft size={10} color={C.accent} />
              </button>
            </div>

            {positions.slice(0, 3).map(pos => {
              const isLong = pos.side === 'long' || pos.side === 'LONG' || pos.side === 'BUY'
              const pnl = Number(pos.unrealizedPnl ?? 0)
              const posUp = pnl >= 0
              return (
                <div
                  key={pos.id || `${pos.symbol}-${pos.side}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 8px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '0.5px solid rgba(255,255,255,0.04)',
                    marginBottom: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Symbol */}
                    <span style={{ fontSize: 12, fontWeight: 900, color: C.text, fontFamily: 'var(--font-mono)' }}>
                      {pos.symbol}
                    </span>
                    {/* Side badge */}
                    <span style={{
                      fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                      background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)',
                      color: isLong ? C.success : C.danger,
                      border: `0.5px solid ${isLong ? 'rgba(0,255,163,0.2)' : 'rgba(255,69,58,0.2)'}`,
                      fontFamily: 'var(--font-mono)', letterSpacing: '0.5px',
                    }}>
                      {isLong ? 'LONG' : 'SHORT'}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 900, fontFamily: 'var(--font-mono)',
                    color: posUp ? C.success : C.danger,
                  }}>
                    {posUp ? '+' : ''}{pnl.toFixed(2)}
                  </span>
                </div>
              )
            })}

            {positions.length > 3 && (
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 9, color: C.text2, fontFamily: 'var(--font-cairo)' }}>
                  +{positions.length - 3} مركز آخر
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── 3. Quick Trade Card ── */}
      <Card>
        <div style={{ direction: 'rtl' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: 'var(--font-cairo)' }}>تنفيذ سريع</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Zap size={12} color={C.accent} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: 'var(--font-mono)' }}>
                {livePrice ? `$${fmtPrice(livePrice)}` : '—'}
              </span>
            </div>
          </div>

          {/* Symbol Selector */}
          <div ref={dropdownRef} style={{ position: 'relative', marginBottom: 10 }}>
            <button
              onClick={() => setShowPairDropdown(!showPairDropdown)}
              style={{
                width: '100%', height: 38, borderRadius: 8,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`,
                padding: '0 10px', cursor: 'pointer', touchAction: 'manipulation',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: C.accent, fontFamily: 'var(--font-mono)' }}>
                  {selectedSymbol.replace('/', '')}
                </span>
                {livePrice && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: 'var(--font-mono)' }}>
                    ${fmtPrice(livePrice)}
                  </span>
                )}
              </div>
              <ChevronDown size={14} color={C.text2} />
            </button>

            {showPairDropdown && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 'var(--z-dropdown)',
                maxHeight: 180, overflowY: 'auto',
                background: 'rgba(15,17,23,0.98)', backdropFilter: 'blur(20px)',
                border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: 4,
                boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
              }}>
                {PAIRS.map(pair => {
                  const pairQuoteKey = Object.keys(quotes).find(k =>
                    k.toUpperCase().replace('/', '') === pair.toUpperCase().replace('/', '')
                  )
                  const pairQuote = pairQuoteKey ? quotes[pairQuoteKey] : null
                  const pairPrice = pairQuote ? Number(pairQuote.price) : null
                  const pairChange = pairQuote?.changePercent ?? 0
                  const pairUp = pairChange >= 0

                  return (
                    <button
                      key={pair}
                      onClick={() => { setSelectedSymbol(pair); setShowPairDropdown(false) }}
                      style={{
                        width: '100%', padding: '7px 8px', borderRadius: 4,
                        background: selectedSymbol === pair ? 'rgba(0,212,255,0.12)' : 'transparent',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: selectedSymbol === pair ? '#00D4FF' : '#F0F2F5', fontFamily: 'var(--font-mono)' }}>
                        {pair}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {pairPrice && (
                          <span style={{ fontSize: 9, color: C.text2, fontFamily: 'var(--font-mono)' }}>
                            ${fmtPrice(pairPrice)}
                          </span>
                        )}
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                          background: pairUp ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)',
                          color: pairUp ? C.success : C.danger, fontFamily: 'var(--font-mono)',
                        }}>
                          {pairUp ? '+' : ''}{pairChange.toFixed(2)}%
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Buy/Sell Toggle */}
          <div style={{
            background: 'rgba(0,0,0,0.4)', borderRadius: 14, padding: 3,
            display: 'flex', marginBottom: 10, position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 3, left: 3, width: 'calc(50% - 3px)', bottom: 3,
              background: orderSide === 'buy' ? C.success : C.danger,
              borderRadius: 10, zIndex: 0, transition: 'transform 0.2s',
              transform: orderSide === 'buy' ? 'translateX(0)' : 'translateX(100%)',
            }} />
            <button
              onClick={() => setOrderSide('buy')}
              style={{
                flex: 1, height: 36, borderRadius: 10, border: 'none',
                background: 'transparent', fontSize: 14, fontWeight: 800,
                color: orderSide === 'buy' ? '#000' : '#FFF',
                fontFamily: 'var(--font-cairo)', zIndex: 1, position: 'relative',
                cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              شراء
            </button>
            <button
              onClick={() => setOrderSide('sell')}
              style={{
                flex: 1, height: 36, borderRadius: 10, border: 'none',
                background: 'transparent', fontSize: 14, fontWeight: 800,
                color: orderSide === 'sell' ? '#000' : '#FFF',
                fontFamily: 'var(--font-cairo)', zIndex: 1, position: 'relative',
                cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              بيع
            </button>
          </div>

          {/* Order Type + Quantity */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>
                نوع الأمر
              </label>
              <div style={{ display: 'flex', gap: 2, padding: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                {([
                  { key: 'market' as const, label: 'سوقي' },
                  { key: 'limit' as const, label: 'محدد' },
                  { key: 'stop' as const, label: 'وقف' },
                ]).map(ot => (
                  <button
                    key={ot.key}
                    onClick={() => setOrderType(ot.key)}
                    style={{
                      flex: 1, padding: '4px 0', borderRadius: 6,
                      background: orderType === ot.key ? C.accent : 'transparent',
                      color: orderType === ot.key ? '#000' : C.text2,
                      fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {ot.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1.3 }}>
              <label style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>
                الكمية
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <button
                  onClick={() => adjustQty(-1)}
                  style={{
                    width: 30, height: 30, borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  <Minus size={12} color={C.text} />
                </button>
                <input
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  type="number"
                  style={{
                    flex: 1, height: 30, borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`,
                    padding: '0 6px', color: C.text, fontSize: 12, fontWeight: 800,
                    fontFamily: 'var(--font-mono)', outline: 'none', direction: 'ltr', textAlign: 'center',
                  }}
                />
                <button
                  onClick={() => adjustQty(1)}
                  style={{
                    width: 30, height: 30, borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  <Plus size={12} color={C.text} />
                </button>
              </div>
            </div>
          </div>

          {/* Limit/Stop price inputs */}
          {orderType === 'limit' && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>
                سعر الحد
              </label>
              <input
                value={limitPrice}
                onChange={e => setLimitPrice(e.target.value)}
                type="number"
                placeholder={livePrice?.toString() || '0.00'}
                style={{
                  width: '100%', height: 34, borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`,
                  padding: '0 10px', color: C.text, fontSize: 12, fontFamily: 'var(--font-mono)',
                  outline: 'none', direction: 'ltr',
                }}
              />
            </div>
          )}
          {orderType === 'stop' && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>
                سعر الوقف
              </label>
              <input
                value={stopPrice}
                onChange={e => setStopPrice(e.target.value)}
                type="number"
                placeholder={livePrice?.toString() || '0.00'}
                style={{
                  width: '100%', height: 34, borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`,
                  padding: '0 10px', color: C.text, fontSize: 12, fontFamily: 'var(--font-mono)',
                  outline: 'none', direction: 'ltr',
                }}
              />
            </div>
          )}

          {/* TP/SL Toggles */}
          <div style={{ marginBottom: 10 }}>
            {/* TP */}
            <div style={{
              background: 'rgba(255,255,255,0.02)', borderRadius: 12,
              padding: '8px 10px', border: '0.5px solid rgba(255,255,255,0.04)', marginBottom: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Target size={14} color={C.success} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>جني الأرباح (TP)</span>
                </div>
                <button
                  onClick={() => setTpEnabled(!tpEnabled)}
                  style={{
                    width: 38, height: 22, borderRadius: 11,
                    background: tpEnabled ? C.success : 'rgba(255,255,255,0.1)',
                    position: 'relative', border: 'none', cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, insetInlineStart: tpEnabled ? 16 : 2,
                    width: 18, height: 18, borderRadius: '50%', background: '#FFF',
                    transition: 'inset-inline-start 0.2s',
                  }} />
                </button>
              </div>
              {tpEnabled && (
                <input
                  type="number"
                  placeholder="سعر الهدف..."
                  value={tpValue}
                  onChange={e => setTpValue(e.target.value)}
                  style={{
                    width: '100%', height: 34, borderRadius: 8,
                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                    padding: '0 10px', color: '#FFF', fontSize: 12, fontFamily: 'var(--font-mono)',
                    outline: 'none', marginTop: 6, direction: 'ltr',
                  }}
                />
              )}
            </div>
            {/* SL */}
            <div style={{
              background: 'rgba(255,255,255,0.02)', borderRadius: 12,
              padding: '8px 10px', border: '0.5px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldAlert size={14} color={C.danger} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>وقف الخسارة (SL)</span>
                </div>
                <button
                  onClick={() => setSlEnabled(!slEnabled)}
                  style={{
                    width: 38, height: 22, borderRadius: 11,
                    background: slEnabled ? C.danger : 'rgba(255,255,255,0.1)',
                    position: 'relative', border: 'none', cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, insetInlineStart: slEnabled ? 16 : 2,
                    width: 18, height: 18, borderRadius: '50%', background: '#FFF',
                    transition: 'inset-inline-start 0.2s',
                  }} />
                </button>
              </div>
              {slEnabled && (
                <input
                  type="number"
                  placeholder="سعر التوقف..."
                  value={slValue}
                  onChange={e => setSlValue(e.target.value)}
                  style={{
                    width: '100%', height: 34, borderRadius: 8,
                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                    padding: '0 10px', color: '#FFF', fontSize: 12, fontFamily: 'var(--font-mono)',
                    outline: 'none', marginTop: 6, direction: 'ltr',
                  }}
                />
              )}
            </div>
          </div>

          {/* Execute Button */}
          <div style={{ flexShrink: 0 }}>
            {(execStatus === 'idle' || execStatus === 'error' || execStatus === 'rejected') && (
              <button
                onClick={() => executeOrder(orderSide)}
                className={`r-trade-btn ${orderSide === 'buy' ? 'r-trade-btn--buy' : 'r-trade-btn--sell'}`}
                style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-cairo)' }}
              >
                {orderSide === 'buy' ? 'شراء' : 'بيع'} {selectedSymbol.replace('/', '')}
              </button>
            )}
            {execStatus === 'submitting' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0' }}>
                <Loader2 size={18} className="r-anim-spin" color={C.accent} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: 'var(--font-cairo)' }}>جارٍ التنفيذ...</span>
              </div>
            )}
            {execStatus === 'filled' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', background: 'rgba(50,215,75,0.1)', borderRadius: 10 }}>
                <CheckCircle size={18} color="#32D74B" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#32D74B', fontFamily: 'var(--font-cairo)' }}>{execMessage}</span>
              </div>
            )}
            {execStatus === 'rejected' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', background: 'rgba(255,184,0,0.1)', borderRadius: 10 }}>
                <AlertCircle size={18} color={C.amber} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.amber, fontFamily: 'var(--font-cairo)' }}>{execMessage}</span>
              </div>
            )}
            {execStatus === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', background: 'rgba(255,69,58,0.1)', borderRadius: 10 }}>
                <AlertCircle size={18} color={C.danger} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.danger, fontFamily: 'var(--font-cairo)' }}>{execMessage}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── 4. Recent Activity Feed ── */}
      {recentTrades.length > 0 && (
        <Card>
          <div style={{ direction: 'rtl' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Activity size={14} color={C.accent} />
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: 'var(--font-cairo)' }}>النشاط الأخير</span>
            </div>

            {recentTrades.map(trade => {
              const isLong = trade.side === 'long'
              const pnl = trade.unrealizedPnl ?? 0
              const tradeUp = pnl >= 0

              return (
                <div
                  key={trade.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 8px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '0.5px solid rgba(255,255,255,0.04)',
                    marginBottom: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Side icon */}
                    <div style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isLong ? <TrendingUp size={12} color={C.success} /> : <TrendingDown size={12} color={C.danger} />}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: C.text, fontFamily: 'var(--font-mono)' }}>
                          {trade.symbol}
                        </span>
                        <span style={{
                          fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 3,
                          background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)',
                          color: isLong ? C.success : C.danger, fontFamily: 'var(--font-mono)',
                        }}>
                          {isLong ? 'LONG' : 'SHORT'}
                        </span>
                      </div>
                      <div style={{ fontSize: 8, color: C.text2, fontFamily: 'var(--font-mono)', direction: 'ltr' }}>
                        {trade.qty} × ${fmtPrice(trade.entryPrice)}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)',
                      color: tradeUp ? C.success : C.danger,
                    }}>
                      {tradeUp ? '+' : ''}{pnl.toFixed(2)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                      <Clock size={7} color={C.text2} />
                      <span style={{ fontSize: 7, color: C.text2, fontFamily: 'var(--font-mono)' }}>
                        {fmtTime(trade.entryTime)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── 5. Market Movers Card ── */}
      {(gainers.length > 0 || losers.length > 0) && (
        <Card>
          <div style={{ direction: 'rtl' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Eye size={14} color={C.accent} />
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: 'var(--font-cairo)' }}>حركة السوق</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {/* Gainers */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, color: C.success, fontFamily: 'var(--font-cairo)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <ArrowUpRight size={10} color={C.success} />
                  الأعلى صعوداً
                </div>
                {gainers.map(q => (
                  <button
                    key={q.symbol}
                    onClick={() => setSelectedSymbol(q.symbol.includes('/') ? q.symbol : q.symbol.replace('USDT', '/USD'))}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '5px 6px', borderRadius: 6,
                      background: 'rgba(0,255,163,0.03)', border: '0.5px solid rgba(0,255,163,0.08)',
                      marginBottom: 3, cursor: 'pointer', touchAction: 'manipulation',
                    }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 800, color: C.text, fontFamily: 'var(--font-mono)' }}>
                      {q.symbol.replace('USDT', '').replace('/', '')}
                    </span>
                    <span style={{ fontSize: 8, fontWeight: 800, color: C.success, fontFamily: 'var(--font-mono)' }}>
                      +{(q.changePercent ?? 0).toFixed(2)}%
                    </span>
                  </button>
                ))}
              </div>

              {/* Losers */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, color: C.danger, fontFamily: 'var(--font-cairo)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <ArrowDownRight size={10} color={C.danger} />
                  الأعلى هبوطاً
                </div>
                {losers.map(q => (
                  <button
                    key={q.symbol}
                    onClick={() => setSelectedSymbol(q.symbol.includes('/') ? q.symbol : q.symbol.replace('USDT', '/USD'))}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '5px 6px', borderRadius: 6,
                      background: 'rgba(255,69,58,0.03)', border: '0.5px solid rgba(255,69,58,0.08)',
                      marginBottom: 3, cursor: 'pointer', touchAction: 'manipulation',
                    }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 800, color: C.text, fontFamily: 'var(--font-mono)' }}>
                      {q.symbol.replace('USDT', '').replace('/', '')}
                    </span>
                    <span style={{ fontSize: 8, fontWeight: 800, color: C.danger, fontFamily: 'var(--font-mono)' }}>
                      {(q.changePercent ?? 0).toFixed(2)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Bottom spacer for scrollability */}
      <div style={{ height: 80 }} />
    </div>
  )
}
