'use client'

import { useState, useEffect } from 'react'
import { Zap, ShieldCheck, Calculator, ChevronDown, ChevronUp, AlertTriangle, Clock } from 'lucide-react'
import { useExecutionEngine } from './hooks/useExecutionEngine'
import { SymbolSearch } from './SymbolSearch'
import { ExecutionOverlay } from './ExecutionOverlay'
import { OrderHistory } from './OrderHistory'
import type { DataStatus } from '@/lib/dashboard-live'

function formatCashValue(value: unknown) {
  const cash = Number(value)
  return Number.isFinite(cash) ? cash.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'
}

export function ExecutionPanel({
  mobile = false,
  dataStatus = 'disconnected',
  lastUpdatedAt = null,
  sourceLabel = 'في انتظار ربط API',
}: {
  mobile?: boolean
  dataStatus?: DataStatus
  lastUpdatedAt?: string | number | null
  sourceLabel?: string
}) {
  const engine = useExecutionEngine()
  const [showRiskCalc, setShowRiskCalc] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<'order' | 'history'>('order')

  useEffect(() => { engine.loadAccount() }, [])

  const isCrypto = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC', 'LINK', 'UNI'].some(
    c => engine.localSymbol.toUpperCase().startsWith(c)
  )

  const isLive = dataStatus === 'live'
  const spreadPct = engine.currentPrice > 0 ? '0.05' : '—'

  return (
    <div className="relative flex h-full w-full flex-col bg-[var(--bg)] overflow-y-auto" style={{ direction: 'rtl' }}>
      {/* ── Compact Top Bar: Live dot + Price + Balance ── */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-[#00C853]' : 'bg-[var(--amber)]'}`}
            style={{ boxShadow: isLive ? '0 0 6px #00C853' : '0 0 6px #FFB800' }} />
          <span className="font-mono text-[11px] font-bold text-[var(--foreground)]">
            {engine.currentPrice > 0 ? `$${engine.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
          </span>
          <span className="text-[8px] text-[var(--muted)]">PAPER</span>
        </div>
        {engine.account && (
          <span className="font-mono text-[9px] text-[var(--muted)]">
            <span className="text-[var(--success)]">${formatCashValue(engine.account.cash)}</span>
          </span>
        )}
      </div>

      {/* ── Sub-tab pills ── */}
      <div className="flex px-2 pt-1.5 gap-1">
        <button
          onClick={() => setActiveSubTab('order')}
          className={`flex-1 flex items-center justify-center gap-1 rounded-md py-1 text-[9px] font-bold border-none cursor-pointer transition-all ${
            activeSubTab === 'order'
              ? 'bg-[rgba(0,212,255,0.1)] text-[var(--accent)]'
              : 'bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          <Zap size={9} />
          أمر
        </button>
        <button
          onClick={() => { setActiveSubTab('history'); engine.loadOpenOrders() }}
          className={`flex-1 flex items-center justify-center gap-1 rounded-md py-1 text-[9px] font-bold border-none cursor-pointer transition-all ${
            activeSubTab === 'history'
              ? 'bg-[rgba(0,212,255,0.1)] text-[var(--accent)]'
              : 'bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          <Clock size={9} />
          أوامر
          {engine.recentOrders.length > 0 && (
            <span className="text-[7px] bg-[rgba(0,212,255,0.15)] text-[var(--accent)] rounded-full px-1">{engine.recentOrders.length}</span>
          )}
        </button>
      </div>

      {/* ── History Tab ── */}
      {activeSubTab === 'history' && (
        <div className="px-2 pt-2">
          <OrderHistory orders={engine.recentOrders} onCancel={engine.cancelOrder} onLoad={engine.loadOpenOrders} />
        </div>
      )}

      {/* ── Order Tab ── */}
      {activeSubTab === 'order' && (
        <div className="flex flex-col gap-1.5 px-2 pt-2 pb-2">
          {/* Symbol Search — compact */}
          <SymbolSearch
            value={engine.localSymbol}
            onChange={v => engine.setLocalSymbol(v)}
            onSelect={v => { engine.setLocalSymbol(v); engine.setSelectedSymbol(v) }}
            currentPrice={engine.currentPrice}
          />

          {/* Order Type — inline pill switch */}
          <div className="flex gap-1">
            {(['market', 'limit'] as const).map(t => (
              <button
                key={t}
                onClick={() => {
                  engine.setOrderType(t)
                  if (t === 'market') engine.setTimeInForce('ioc')
                  else engine.setTimeInForce('gtc')
                }}
                className={`flex-1 rounded-md py-1 text-[9px] font-bold border cursor-pointer transition-all ${
                  engine.orderType === t
                    ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.08)] text-[var(--accent)]'
                    : 'border-[var(--card-border)] bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {t === 'market' ? 'سوقي' : 'معلق'}
              </button>
            ))}
          </div>

          {/* Quantity + Limit Price — compact row */}
          <div className="flex gap-1.5">
            <div className="flex-1">
              <input
                value={engine.quantity}
                onChange={e => engine.setQuantity(e.target.value)}
                type="number" step="0.01" min="0.01"
                placeholder="الكمية"
                className="w-full rounded-md border border-[var(--card-border)] bg-[var(--surface)] px-2 py-1.5 text-[var(--foreground)] font-mono text-[11px] font-bold outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
            {engine.orderType === 'limit' && (
              <div className="flex-1">
                <input
                  value={engine.limitPrice}
                  onChange={e => engine.setLimitPrice(e.target.value)}
                  type="number" step="0.1"
                  placeholder="سعر Limit"
                  className="w-full rounded-md border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.05)] px-2 py-1.5 text-[var(--accent)] font-mono text-[11px] font-bold outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            )}
          </div>

          {/* TP / SL — always visible, compact inline */}
          <div className="flex gap-1.5">
            <input
              value={engine.takeProfit}
              onChange={e => engine.setTakeProfit(e.target.value)}
              type="number" step="0.1"
              placeholder="TP جني أرباح"
              className="flex-1 rounded-md border border-[rgba(0,200,83,0.15)] bg-[rgba(0,200,83,0.05)] px-2 py-1.5 text-[var(--success)] font-mono text-[11px] font-bold outline-none focus:border-[var(--success)] transition-colors placeholder:text-[rgba(0,200,83,0.3)]"
            />
            <input
              value={engine.stopLoss}
              onChange={e => engine.setStopLoss(e.target.value)}
              type="number" step="0.1"
              placeholder="SL وقف خسارة"
              className="flex-1 rounded-md border border-[rgba(255,59,48,0.15)] bg-[rgba(255,59,48,0.05)] px-2 py-1.5 text-[var(--danger)] font-mono text-[11px] font-bold outline-none focus:border-[var(--danger)] transition-colors placeholder:text-[rgba(255,59,48,0.3)]"
            />
          </div>

          {/* Crypto SL/TP Warning — one line */}
          {isCrypto && (engine.stopLoss || engine.takeProfit) && (
            <div className="flex items-center gap-1 px-1">
              <AlertTriangle size={8} className="text-[var(--warning)] shrink-0" />
              <span className="text-[7px] text-[var(--warning)]">SL/TP للكريبتو يُدار محلياً</span>
            </div>
          )}

          {/* Quick actions row: Auto-calc + Risk toggle */}
          <div className="flex gap-1">
            <button
              onClick={engine.autoCalculate}
              className="flex-1 flex items-center justify-center gap-1 rounded-md border border-[rgba(0,229,255,0.15)] bg-[rgba(0,229,255,0.06)] py-1 text-[8px] font-bold text-[var(--accent)] cursor-pointer hover:bg-[rgba(0,229,255,0.1)] transition-colors"
            >
              <Calculator size={8} />
              حساب تلقائي
            </button>
            <button
              onClick={() => setShowRiskCalc(v => !v)}
              className="flex-1 flex items-center justify-center gap-1 rounded-md border border-[var(--card-border)] bg-transparent py-1 text-[8px] font-bold text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)] transition-colors"
            >
              <Calculator size={8} />
              مخاطرة
              {showRiskCalc ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
            </button>
          </div>

          {/* Risk Calculator — collapsed by default */}
          {showRiskCalc && (
            <div className="flex flex-col gap-1.5 rounded-md border border-[var(--card-border)] bg-[rgba(255,255,255,0.02)] p-2">
              {/* Risk % slider */}
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-[var(--muted)] shrink-0">نسبة المخاطرة</span>
                <input
                  type="range" min="0.1" max="10" step="0.1"
                  value={engine.riskPct}
                  onChange={e => engine.setRiskPct(e.target.value)}
                  className="flex-1 accent-[var(--accent)] cursor-pointer h-1"
                />
                <span className="font-mono text-[9px] font-bold text-[var(--accent)] min-w-[28px] text-left">{engine.riskPct}%</span>
              </div>
              {/* Risk stats — inline */}
              <div className="flex gap-1.5">
                <div className="flex-1 text-center">
                  <div className="font-mono text-[9px] font-bold text-[var(--danger)]">{engine.account ? `$${engine.riskAmount.toFixed(0)}` : '—'}</div>
                  <div className="text-[7px] text-[var(--muted)]">مخاطرة</div>
                </div>
                <div className="flex-1 text-center">
                  <div className="font-mono text-[9px] font-bold text-[var(--accent)]">{engine.autoQty ?? '—'}</div>
                  <div className="text-[7px] text-[var(--muted)]">كمية مثلى</div>
                </div>
                <div className="flex-1 text-center">
                  <div className={`font-mono text-[9px] font-bold ${parseFloat(engine.rrRatio ?? '0') >= 2 ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                    {engine.rrRatio ? `${engine.rrRatio}:1` : '—'}
                  </div>
                  <div className="text-[7px] text-[var(--muted)]">R:R</div>
                </div>
              </div>
              {/* P&L preview */}
              {(engine.potentialGain !== null || engine.potentialLoss !== null) && (
                <div className="flex gap-1.5">
                  {engine.potentialGain !== null && (
                    <div className="flex-1 text-center">
                      <span className="font-mono text-[9px] font-bold text-[var(--success)]">+${engine.potentialGain.toFixed(2)}</span>
                    </div>
                  )}
                  {engine.potentialLoss !== null && (
                    <div className="flex-1 text-center">
                      <span className="font-mono text-[9px] font-bold text-[var(--danger)]">-${engine.potentialLoss.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
              {engine.autoQty && (
                <button
                  onClick={engine.applyOptimalQty}
                  className="text-[8px] font-bold text-[var(--accent)] border border-dashed border-[var(--accent)] rounded py-0.5 bg-transparent cursor-pointer hover:bg-[rgba(0,229,255,0.06)]"
                >
                  تطبيق ({engine.autoQty})
                </button>
              )}
            </div>
          )}

          {/* Estimated cost — one compact line */}
          {engine.currentPrice > 0 && parseFloat(engine.quantity) > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-[8px] text-[var(--muted)]">التكلفة التقديرية</span>
              <span className="font-mono text-[9px] font-bold text-[var(--foreground)]">${engine.estimatedCost.toFixed(2)}</span>
            </div>
          )}

          {/* ── BUY / SELL Buttons — prominent, Binance-style ── */}
          <div className="flex gap-2 mt-auto pt-1">
            <button
              onClick={() => engine.validateAndConfirm('buy')}
              disabled={engine.loading}
              className="btn-neon-buy flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12px] font-extrabold cursor-pointer transition-transform active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Zap size={12} fill="white" />
              {engine.loading && engine.pendingAction === 'buy' ? '...' : 'شراء'}
            </button>
            <button
              onClick={() => engine.validateAndConfirm('sell')}
              disabled={engine.loading}
              className="btn-neon-sell flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12px] font-extrabold cursor-pointer transition-transform active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Zap size={12} fill="white" />
              {engine.loading && engine.pendingAction === 'sell' ? '...' : 'بيع'}
            </button>
          </div>

          {/* Safety — one tiny line */}
          <div className="flex items-center justify-center gap-1 opacity-30 pb-0.5">
            <ShieldCheck size={8} className="text-[var(--success)]" />
            <span className="text-[7px] text-[var(--muted)]">256-bit</span>
          </div>
        </div>
      )}

      {/* ── Status Overlay ── */}
      <ExecutionOverlay
        status={engine.status}
        onConfirm={engine.executeOrder}
        onCancel={() => engine.setStatus({ msg: '', type: '' })}
      />
    </div>
  )
}
