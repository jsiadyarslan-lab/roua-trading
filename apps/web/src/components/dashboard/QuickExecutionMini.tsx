'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Zap, ShieldCheck, ChevronDown, ChevronUp, Calculator } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { formatExecutionLabel, formatFreshness, getStatusLabel, getStatusTone, type DataStatus, type ExecutionState } from '@/lib/dashboard-live'
import { T } from '@/lib/unified-tokens'

function formatCashValue(value: unknown) {
  const cash = Number(value)
  return Number.isFinite(cash) ? cash.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'
}

export function QuickExecutionMini({
  mobile = false,
  dataStatus = 'disconnected',
  lastUpdatedAt = null,
  sourceLabel,
}: {
  mobile?: boolean
  dataStatus?: DataStatus
  lastUpdatedAt?: string | number | null
  sourceLabel?: string
}) {
  const t = useTranslations('dashboard.execution')
  const tc = useTranslations('common')
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const [localSymbol, setLocalSymbol] = useState(selectedSymbol)
  const [account, setAccount] = useState<{ cash: number; buyingPower: number } | null>(null)
  const { addTrade: addPaperTrade } = usePaperTradesStore()
  const addNotification = useNotificationStore(state => state.addNotification)
  const fetchAccount = usePositionsStore(state => state.fetchAccount)
  const fetchPositions = usePositionsStore(state => state.fetchPositions)
  const refreshAfterTrade = usePositionsStore(state => state.refreshAfterTrade)

  // Sync when global symbol changes
  useEffect(() => { setLocalSymbol(selectedSymbol) }, [selectedSymbol])

  // Load Alpaca account balance on mount
  useEffect(() => {
    fetch('/api/alpaca/account')
      .then(r => r.json())
      .then(j => {
        // FIX: Gracefully handle 503 (Alpaca credentials not configured)
        if (j.success && j.data) {
          setAccount({ cash: j.data.cash ?? 0, buyingPower: j.data.buyingPower ?? 0 })
        } else if (j.offline || j.error === 'ALPACA_CREDENTIALS_NOT_CONFIGURED') {
          setAccount({ cash: 0, buyingPower: 0 })
        }
      })
      .catch(() => {})
  }, [])

  const [quantity, setQuantity] = useState('0.1')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [riskPct, setRiskPct] = useState('1') // % of account balance to risk
  const [showRiskCalc, setShowRiskCalc] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [status, setStatus] = useState<{ msg: string; type: 'success' | 'error' | 'loading' | 'confirm' | '' }>({ msg: '', type: '' })
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<'buy' | 'sell' | null>(null)
  const [executionState, setExecutionState] = useState<ExecutionState>('idle')

  // Only subscribe to the current symbol's quote — prevents re-renders from other symbol updates
  const currentQuote = useMarketStore(state => state.quotes[localSymbol])
  const currentPrice = currentQuote?.price ?? 0

  // Risk Calculator: auto-compute position size
  const riskAmount = account?.cash ? (account.cash * (parseFloat(riskPct) / 100)) : 0
  const slPips = stopLoss && currentPrice > 0 ? Math.abs(currentPrice - parseFloat(stopLoss)) : null
  const autoQty = slPips && slPips > 0 ? (riskAmount / slPips).toFixed(4) : null
  const potentialLoss = slPips && parseFloat(quantity) > 0 ? (slPips * parseFloat(quantity)) : null
  const potentialGain = takeProfit && currentPrice > 0 && parseFloat(quantity) > 0
    ? Math.abs(parseFloat(takeProfit) - currentPrice) * parseFloat(quantity) : null
  const rrRatio = potentialGain && potentialLoss && potentialLoss > 0
    ? (potentialGain / potentialLoss).toFixed(2) : null
  const cardPadding = mobile ? '10px 12px' : '12px 16px'
  const inputPadding = mobile ? '10px' : '12px'
  const actionHeight = mobile ? 52 : 42
  const statusTone = getStatusTone(dataStatus)
  const environmentLabel = t('demoLabel')
  const inferredOrderType = pendingAction === 'sell' ? tc('sell') : tc('buy')


  const validateAndConfirm = (side: 'buy' | 'sell') => {
    setExecutionState('validating')
    if (!localSymbol) {
      setExecutionState('rejected')
      setStatus({ msg: t('invalidSymbol'), type: 'error' });
      setTimeout(() => setStatus({ msg: '', type: '' }), 3000);
      return;
    }
    const qtyNum = parseFloat(quantity)
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setExecutionState('rejected')
      setStatus({ msg: t('invalidQuantity'), type: 'error' });
      setTimeout(() => setStatus({ msg: '', type: '' }), 3000);
      return;
    }

    // Validate SL/TP logic
    const tpNum = parseFloat(takeProfit)
    const slNum = parseFloat(stopLoss)
    const price = currentPrice > 0 ? currentPrice : 0

    if (price > 0) {
      if (side === 'buy') {
        if (slNum > 0 && slNum >= price) {
          setExecutionState('rejected')
          setStatus({ msg: t('stopLossRuleBuy'), type: 'error' });
          setTimeout(() => setStatus({ msg: '', type: '' }), 3000);
          return;
        }
        if (tpNum > 0 && tpNum <= price) {
          setExecutionState('rejected')
          setStatus({ msg: t('takeProfitRuleBuy'), type: 'error' });
          setTimeout(() => setStatus({ msg: '', type: '' }), 3000);
          return;
        }
      } else {
        if (slNum > 0 && slNum <= price) {
          setExecutionState('rejected')
          setStatus({ msg: t('stopLossRuleSell'), type: 'error' });
          setTimeout(() => setStatus({ msg: '', type: '' }), 3000);
          return;
        }
        if (tpNum > 0 && tpNum >= price) {
          setExecutionState('rejected')
          setStatus({ msg: t('takeProfitRuleSell'), type: 'error' });
          setTimeout(() => setStatus({ msg: '', type: '' }), 3000);
          return;
        }
      }
    }

    setPendingAction(side);
    setExecutionState('ready')
    setStatus({ 
      msg: side === 'buy' ? t('confirmBuy', { qty: quantity, symbol: localSymbol }) : t('confirmSell', { qty: quantity, symbol: localSymbol }), 
      type: 'confirm' 
    });
  }

  const executeOrder = async () => {
    if (!pendingAction || !localSymbol || !quantity) return
    const side = pendingAction
    setLoading(true)
    setExecutionState('submitting')
    setStatus({ msg: side === 'buy' ? t('sendingBuyOrder') : t('sendingSellOrder'), type: 'loading' })

    // V230 UNIFIED EXECUTION: Route through NestJS /api/trading/orders (NOT /api/alpaca/orders).
    //
    // ROOT CAUSE of inconsistent behavior:
    //   - Chart buttons (V229) → /api/trading/orders → NestJS → DB → PositionMonitor
    //   - This widget (before V230) → /api/alpaca/orders → Alpaca API directly
    //   These are TWO COMPLETELY DIFFERENT pipelines. Trades from the widget were
    //   NOT recorded in the DB Position table, NOT monitored by PositionMonitor
    //   (so V228 TP/SL peak fix didn't apply), and NOT subject to risk checks.
    //
    // FIX: Send to the SAME endpoint as the chart. The NestJS backend handles:
    //   - Risk validation (UnifiedRiskService)
    //   - Paper/real execution (TradingService.placeOrder)
    //   - DB persistence (Position + Trade tables)
    //   - PositionMonitor visibility (V228 applies)
    //
    // REQUIRED FIELDS for /api/trading/orders:
    //   - credentialId (from activeCredentialId in usePositionsStore)
    //   - symbol, side (BUY/SELL), type (MARKET), quantity
    //   - stopLoss (MANDATORY — UnifiedRiskService check #1)
    //   - takeProfit (optional)

    // V230: Get activeCredentialId — same source as chart buttons
    const activeCredentialId = usePositionsStore.getState().activeCredentialId
    if (!activeCredentialId) {
      setExecutionState('rejected')
      setStatus({ msg: '⚠️ يرجى اختيار حساب تداول نشط في الإعدادات أولاً', type: 'error' })
      setTimeout(() => setStatus({ msg: '', type: '' }), 5000)
      setLoading(false)
      setPendingAction(null)
      return
    }

    // V230: stopLoss is MANDATORY in NestJS — block early with clear message
    if (!stopLoss || parseFloat(stopLoss) <= 0) {
      setExecutionState('rejected')
      setStatus({ msg: '⚠️ وقف الخسارة إجباري — يرجى تحديده قبل التنفيذ', type: 'error' })
      setTimeout(() => setStatus({ msg: '', type: '' }), 5000)
      setLoading(false)
      setPendingAction(null)
      return
    }

    try {
      // V230: Body matches NestJS PlaceOrderDto (camelCase, not snake_case)
      const body: Record<string, any> = {
        credentialId: activeCredentialId,
        symbol:       localSymbol,
        side:         side === 'buy' ? 'BUY' : 'SELL',
        type:         'MARKET',
        quantity:     parseFloat(quantity),
        stopLoss:     parseFloat(stopLoss),
      }
      if (takeProfit) body.takeProfit = parseFloat(takeProfit)
      if (currentPrice && currentPrice > 0) body.price = currentPrice

      const res = await fetch('/api/trading/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({} as any))

      // V230: NestJS returns { success: true, data: { orderId, status, ... } }
      // OR throws an HTTP exception (caught by AllExceptionsFilter → { statusCode, message })
      if (j.success === true || (res.ok && !j.statusCode)) {
        setExecutionState('accepted')
        const orderId = j.data?.orderId || j.orderId || j.id || ''
        const filled = currentPrice ? ` @ $${currentPrice.toFixed(2)}` : ''

        // Optimistic UI update — same as chart path
        addPaperTrade({
          symbol: localSymbol,
          side: side === 'buy' ? 'long' : 'short',
          qty: parseFloat(quantity),
          entryPrice: currentPrice,
          currentPrice: currentPrice,
          tp: takeProfit ? parseFloat(takeProfit) : undefined,
          sl: parseFloat(stopLoss),
          source: 'manual',
          entryTime: Date.now(),
        })

        setStatus({
          msg:  side === 'buy'
            ? t('buyExecuted', { qty: quantity, symbol: localSymbol, filled })
            : t('sellExecuted', { qty: quantity, symbol: localSymbol, filled }) + `\n${t('orderId', { id: orderId?.slice(0,8) ?? '' })}`,
          type: 'success',
        })
        setExecutionState('filled')
        addNotification({
          source: 'trade',
          priority: 'high',
          action: side === 'buy' ? 'BUY' : 'SELL',
          title: side === 'buy' ? tc('buy') + ' ' + localSymbol : tc('sell') + ' ' + localSymbol,
          body: side === 'buy'
            ? t('buyExecuted', { qty: quantity, symbol: localSymbol, filled: filled || '' })
            : t('sellExecuted', { qty: quantity, symbol: localSymbol, filled: filled || '' }),
          pair: localSymbol,
          price: currentPrice,
        })
        // refreshAfterTrade now fetches from /api/trading/positions (DB) — picks up the new DB position
        // V230.1: Force-refresh by clearing the debounce timestamp so refreshAfterTrade
        // doesn't skip the immediate fetch (3s debounce was eating the first refresh).
        ;(usePositionsStore as any).setState({ _lastRefreshAfterTrade: 0 } as any)
        refreshAfterTrade()

        // V230.1: Update the widget's local account state so margin/balance display
        // refreshes immediately (the local account was previously updated by
        // fetch('/api/alpaca/account') which we removed in V230 — restore it by
        // reading from usePositionsStore.account which is populated by fetchAccount()).
        // Wait 500ms for the backend transaction to commit, then refresh.
        setTimeout(() => {
          const storeAccount = usePositionsStore.getState().account
          if (storeAccount) {
            setAccount({
              cash: Number(storeAccount.cash) || 0,
              buyingPower: Number(storeAccount.buyingPower) || 0,
            })
          }
        }, 500)
      } else {
        // NestJS rejected the order — show the actual reason from the backend
        const reason = j.message || j.error || j.reason || t('executionFailed')
        setExecutionState('rejected')
        setStatus({ msg: `❌ ${reason}`, type: 'error' })
        setTimeout(() => setStatus({ msg: '', type: '' }), 6000)
      }
    } catch (err: any) {
      setExecutionState('rejected')
      setStatus({ msg: t('networkError') + ': ' + (err?.message || err), type: 'error' })
      setTimeout(() => setStatus({ msg: '', type: '' }), 6000)
    } finally {
      setLoading(false)
      setPendingAction(null)
      setTimeout(() => setStatus({ msg: '', type: '' }), 800)
    }
  }

  return (
    <div style={{
      
      width: '100%', height: '100%',
      padding: cardPadding,
      display: 'flex', flexDirection: 'column', gap: 10,
      boxSizing: 'border-box', position: 'relative',
      background: 'var(--bg)'
    }}>
      <div style={{
        borderRadius: 12,
        border: `1px solid ${statusTone}30`,
        background: 'rgba(255,255,255,0.02)',
        padding: mobile ? '8px 10px' : '10px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 700 }}>{t('executionStatus')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--foreground)', fontWeight: 800 }}>{formatExecutionLabel(executionState, pendingAction, tc)}</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              borderRadius: 999,
              padding: '3px 8px',
              border: `1px solid ${statusTone}44`,
              background: `${statusTone}18`,
              color: statusTone,
              fontSize: 9,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusTone, boxShadow: `0 0 8px ${statusTone}` }} />
              {getStatusLabel(dataStatus, tc)}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>{sourceLabel}</div>
          <div style={{ fontSize: 10, color: 'var(--foreground)', fontWeight: 700 }}>{formatFreshness(lastUpdatedAt, tc)}</div>
        </div>
      </div>

      {/* Alpaca Paper Trading Badge + Balance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.2)',
          borderRadius: 6, padding: '3px 8px',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00C853', boxShadow: '0 0 6px #00C853' }} />
          <span style={{ fontSize: 9, fontWeight: 800, color: '#FFB800', fontFamily: "'JetBrains Mono', monospace" }}>{t('demoAccount')}</span>
        </div>
        {account && (
          <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
            {t('buyingPowerLabel')}: <span style={{ color: 'var(--success)', fontWeight: 700 }}>${formatCashValue(account.cash)}</span>
          </div>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))',
        gap: 8,
      }}>
        {[
          { label: t('asset'), value: localSymbol || '—', tone: 'var(--foreground)' },
          { label: t('quantityLabel'), value: quantity || '—', tone: 'var(--accent)' },
          { label: t('typeLabel'), value: inferredOrderType, tone: pendingAction === 'sell' ? 'var(--danger)' : 'var(--success)' },
          { label: t('riskLabel'), value: potentialLoss !== null ? `$${potentialLoss.toFixed(2)}` : '—', tone: 'var(--warning)' },
          { label: t('envLabel'), value: environmentLabel, tone: 'var(--warning)' },
        ].map(item => (
          <div key={item.label} style={{
            minWidth: 0,
            borderRadius: 10,
            padding: '8px 10px',
            border: '1px solid var(--card-border)',
            background: 'rgba(255,255,255,0.025)',
          }}>
            <div style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 4, fontWeight: 700 }}>{item.label}</div>
            <div style={{ fontSize: 11, color: item.tone, fontWeight: 800, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Symbol & Quantity Wrapper */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 800 }}>{t('asset')}</label>
          <input 
            value={localSymbol}
            onChange={e => setLocalSymbol(e.target.value.toUpperCase())}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--card-border)'
              setSelectedSymbol(localSymbol)
            }}
            aria-label="Symbol"
            className="number-data"
            style={{
              width: '100%', background: 'var(--surface)', border: '1px solid var(--card-border)',
              borderRadius: 10, color: 'var(--foreground)', fontSize: mobile ? 12 : 13, padding: inputPadding,
              fontFamily: 'var(--mono)', outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box', fontWeight: 700
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 800 }}>{t('quantityLabel')}</label>
          <input 
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            type="number" step="0.01" min="0.01"
            aria-label="Quantity"
            className="number-data"
            style={{
              width: '100%', background: 'var(--surface)', border: '1px solid var(--card-border)',
              borderRadius: 10, color: 'var(--foreground)', fontSize: mobile ? 12 : 13, padding: inputPadding,
              fontFamily: 'var(--mono)', outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box', fontWeight: 700
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--card-border)'}
          />
        </div>
      </div>

      {mobile && (
        <button
          onClick={() => setShowAdvanced(v => !v)}
          style={{
            width: '100%',
            minHeight: 42,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--card-border)',
            borderRadius: 10,
            cursor: 'pointer',
            color: 'var(--foreground)',
            padding: '0 12px',
            fontFamily: "'Cairo', sans-serif",
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          <span>{t('advancedSettings')}</span>
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}

      {(!mobile || showAdvanced) && <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'var(--success)', fontWeight: 800 }}>{tc('takeProfit')}</label>
          <input 
            value={takeProfit}
            onChange={e => setTakeProfit(e.target.value)}
            placeholder="0.00"
            type="number" step="0.1"
            aria-label="Take Profit"
            className="number-data"
            style={{
              width: '100%', background: 'rgba(0,200,83,0.05)', border: '1px solid rgba(0,200,83,0.15)',
              borderRadius: 10, color: 'var(--success)', fontSize: mobile ? 12 : 13, padding: inputPadding,
              fontFamily: 'var(--mono)', outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box', fontWeight: 700
            }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: 'var(--danger)', fontWeight: 800 }}>{tc('stopLoss')}</label>
          <input 
            value={stopLoss}
            onChange={e => setStopLoss(e.target.value)}
            placeholder="0.00"
            type="number" step="0.1"
            aria-label="Stop Loss"
            className="number-data"
            style={{
              width: '100%', background: 'rgba(255,59,48,0.05)', border: '1px solid rgba(255,59,48,0.15)',
              borderRadius: 10, color: 'var(--danger)', fontSize: mobile ? 12 : 13, padding: inputPadding,
              fontFamily: 'var(--mono)', outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box', fontWeight: 700
            }}
          />
        </div>
      </div>}
      
      {/* Auto-Calculate Button */}
      {(!mobile || showAdvanced) && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -2 }}>
        <button
          onClick={() => {
            if (currentPrice > 0) {
              // FIX: SL/TP direction must respect the pending order side:
              // - BUY: SL below price (0.99x), TP above price (1.02x)
              // - SELL: SL above price (1.01x), TP below price (0.98x)
              // Previously, SL was always set below price which is wrong for SELL orders.
              const isSell = pendingAction === 'sell'
              const tp = isSell ? currentPrice * 0.98 : currentPrice * 1.02;
              const sl = isSell ? currentPrice * 1.01 : currentPrice * 0.99;
              setTakeProfit(tp.toFixed(2));
              setStopLoss(sl.toFixed(2));
              
              if (account && account.cash) {
                const risk = account.cash * (parseFloat(riskPct) / 100);
                const pips = Math.abs(currentPrice - sl);
                // Alpaca bracket orders are safer with integer quantities
                const calcQty = Math.max(1, Math.floor(risk / pips)).toString();
                if (parseFloat(calcQty) > 0) {
                  setQuantity(calcQty);
                }
              }
            }
          }}
          style={{
            background: 'rgba(0, 229, 255, 0.1)', border: '1px solid rgba(0, 229, 255, 0.2)',
            color: 'var(--accent)', fontSize: 9, fontWeight: 700, padding: '12px 14px', minHeight: 48,
            borderRadius: 10, cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
            display: 'flex', alignItems: 'center', gap: 4
          }}
        >
          <Calculator size={10} /> {t('autoCalculate')}
        </button>
      </div>}

      {/* ── Risk Calculator ── */}
      {(!mobile || showAdvanced) && <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 8 }}>
        <button
          onClick={() => setShowRiskCalc(v => !v)}
          style={{
            width: '100%', minHeight: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 0', color: 'var(--muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calculator size={12} color="var(--accent)" />
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Cairo', sans-serif" }}>{t('riskCalculator')}</span>
          </div>
          {showRiskCalc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showRiskCalc && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Risk % slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>{t('riskPercent')}:</span>
              <input
                type="range" min="0.1" max="10" step="0.1"
                value={riskPct}
                onChange={e => setRiskPct(e.target.value)}
                style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)', fontFamily: 'monospace', minWidth: 36, textAlign: 'left' }}>
                {riskPct}%
              </span>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[
                { label: t('riskAmount'), value: account ? `$${riskAmount.toFixed(0)}` : '—', color: 'var(--danger)' },
                { label: t('optimalQuantity'), value: autoQty ?? (currentPrice > 0 ? `~${(riskAmount / currentPrice).toFixed(4)}` : '—'), color: 'var(--accent)' },
                { label: t('winLossRatio'), value: rrRatio ? `${rrRatio}:1` : '—', color: parseFloat(rrRatio ?? '0') >= 2 ? 'var(--success)' : 'var(--warning)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: 'var(--surface)', borderRadius: 8, padding: '6px 8px',
                  border: '1px solid var(--card-border)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color, fontFamily: 'monospace' }}>{value}</div>
                  <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* P&L preview */}
            {(potentialGain !== null || potentialLoss !== null) && (
              <div style={{ display: 'flex', gap: 6 }}>
                {potentialGain !== null && (
                  <div style={{ flex: 1, background: 'rgba(0,200,83,0.07)', borderRadius: 8, padding: '6px 8px', border: '1px solid rgba(0,200,83,0.2)', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--success)', fontFamily: 'monospace' }}>+${potentialGain.toFixed(2)}</div>
                    <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>{t('estimatedTakeProfit')}</div>
                  </div>
                )}
                {potentialLoss !== null && (
                  <div style={{ flex: 1, background: 'rgba(255,59,48,0.07)', borderRadius: 8, padding: '6px 8px', border: '1px solid rgba(255,59,48,0.2)', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--danger)', fontFamily: 'monospace' }}>-${potentialLoss.toFixed(2)}</div>
                    <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>{t('estimatedStopLoss')}</div>
                  </div>
                )}
              </div>
            )}

            {autoQty && (
              <button
                onClick={() => setQuantity(autoQty)}
                style={{
                  fontSize: 10, padding: '5px', borderRadius: 6, border: '1px dashed var(--accent)',
                  background: 'rgba(0,229,255,0.06)', color: 'var(--accent)', cursor: 'pointer',
                  fontWeight: 700, fontFamily: "'Cairo', sans-serif",
                }}
              >
                {t('applyOptimalQty', { qty: autoQty })}
              </button>
            )}
          </div>
        )}
      </div>}

      {/* Action Buttons */}
      {mobile ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <button 
            onClick={() => validateAndConfirm('buy')}
            disabled={loading}
            style={{
              flex: 1, minHeight: 44, borderRadius: 10,
              background: 'linear-gradient(135deg, #00FFC6, #10B981)',
              border: 'none', color: '#fff', fontSize: 12, fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'Cairo', sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: loading ? 0.7 : 1,
            }}
          >
            <Zap size={12} fill="white" />
            {tc('buy')}
          </button>
          <button 
            onClick={() => validateAndConfirm('sell')}
            disabled={loading}
            style={{
              flex: 1, minHeight: 44, borderRadius: 10,
              background: 'linear-gradient(135deg, #FF4757, #EF4444)',
              border: 'none', color: '#fff', fontSize: 12, fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'Cairo', sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: loading ? 0.7 : 1,
            }}
          >
            <Zap size={12} fill="white" />
            {tc('sell')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
          <button 
            onClick={() => validateAndConfirm('buy')}
            disabled={loading}
            className="btn-neon-buy"
            style={{
              flex: 1, minHeight: actionHeight, height: actionHeight, borderRadius: 'var(--radius)', 
              fontSize: 13, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'Cairo', sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'transform 0.1s', opacity: loading ? 0.7 : 1,
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Zap size={14} fill="white" />
            {loading && pendingAction === 'buy' ? tc('processing') : tc('buy')}
          </button>
          <button 
            onClick={() => validateAndConfirm('sell')}
            disabled={loading}
            className="btn-neon-sell"
            style={{
              flex: 1, minHeight: actionHeight, height: actionHeight, borderRadius: 'var(--radius)', 
              fontSize: 13, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'Cairo', sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'transform 0.1s', opacity: loading ? 0.7 : 1,
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Zap size={14} fill="white" />
            {loading && pendingAction === 'sell' ? tc('processing') : tc('sell')}
          </button>
        </div>
      )}

      {/* Status Overlay */}
      {status.msg && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `${T.bg}f0`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
          color: status.type === 'success' ? 'var(--success)' : status.type === 'error' ? 'var(--danger)' : 'var(--foreground)',
          backdropFilter: 'blur(8px)', zIndex: 20, borderRadius: 12,
          padding: 24, textAlign: 'center', lineHeight: 1.5
        }}>
          <div>{status.msg}</div>
          
          {status.type === 'confirm' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button 
                onClick={executeOrder}
                style={{
                  background: 'var(--success)', border: 'none', borderRadius: 4,
                  padding: '6px 16px', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo', sans-serif"
                }}
              >
                {tc('confirm')}
              </button>
              <button 
                onClick={() => setStatus({ msg: '', type: '' })}
                style={{
                  background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '6px 16px', color: 'var(--foreground)', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo', sans-serif"
                }}
              >
                {tc('cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Safety Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0.6, marginTop: 4 }}>
        <ShieldCheck size={12} color="var(--success)" />
        <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)' }}>{t('encryptedTrading')}</span>
      </div>
    </div>
  )
}
