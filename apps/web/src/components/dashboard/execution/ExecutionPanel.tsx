'use client'

import { useState, useEffect } from 'react'
import { Zap, ShieldCheck, Calculator, ChevronDown, ChevronUp, AlertTriangle, Clock, Layers } from 'lucide-react'
import { useExecutionEngine } from './hooks/useExecutionEngine'
import { SymbolSearch } from './SymbolSearch'
import { OrderTypeSelector } from './OrderTypeSelector'
import { RiskCalculator } from './RiskCalculator'
import { ExecutionOverlay } from './ExecutionOverlay'
import { OrderHistory } from './OrderHistory'
import { PreTradeSummary } from './PreTradeSummary'
import { formatExecutionLabel, formatFreshness, getStatusLabel, getStatusTone, type DataStatus, type ExecutionState } from '@/lib/dashboard-live'

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

  // UI toggles
  const [showRiskCalc, setShowRiskCalc] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<'order' | 'history'>('order')

  // Load data on mount
  useEffect(() => { engine.loadAccount() }, [])
  useEffect(() => { engine.syncSymbol(engine.localSymbol) }, [])

  // Detect crypto symbol for SL/TP warning
  const isCrypto = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC', 'LINK', 'UNI'].some(
    c => engine.localSymbol.toUpperCase().startsWith(c)
  )

  const statusTone = getStatusTone(dataStatus)

  return (
    <div className="relative flex h-full w-full flex-col gap-2.5 p-2.5 box-border bg-[var(--bg)] overflow-y-auto" style={{ direction: 'rtl' }}>
      {/* ── Execution Status Bar ── */}
      <div className="rounded-xl border p-2 flex items-center justify-between gap-3"
        style={{
          borderColor: `${statusTone}30`,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold text-[var(--muted)] mb-1">حالة التنفيذ</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-[var(--foreground)] font-extrabold">
              {formatExecutionLabel(engine.executionState, engine.pendingAction)}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-extrabold"
              style={{
                borderColor: `${statusTone}44`,
                background: `${statusTone}18`,
                color: statusTone,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusTone, boxShadow: `0 0 8px ${statusTone}` }} />
              {getStatusLabel(dataStatus)}
            </span>
          </div>
        </div>
        <div className="text-left shrink-0">
          <div className="text-[9px] text-[var(--muted)] mb-1">{sourceLabel}</div>
          <div className="text-[10px] text-[var(--foreground)] font-bold">{formatFreshness(lastUpdatedAt)}</div>
        </div>
      </div>

      {/* ── Paper Badge + Balance ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 rounded-md border border-[rgba(0,200,83,0.2)] bg-[rgba(0,200,83,0.08)] px-2 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00C853]" style={{ boxShadow: '0 0 6px #00C853' }} />
          <span className="text-[9px] font-extrabold text-[#00C853]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            حساب تجريبي (PAPER)
          </span>
        </div>
        {engine.account && (
          <div className="text-[9px] text-[var(--muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            القوة الشرائية: <span className="text-[var(--success)] font-bold">${formatCashValue(engine.account.cash)}</span>
          </div>
        )}
      </div>

      {/* ── Sub-tab: New Order / Active Orders ── */}
      <div className="flex gap-1 rounded-lg border border-[var(--card-border)] bg-[rgba(255,255,255,0.02)] p-0.5">
        <button
          onClick={() => setActiveSubTab('order')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] font-extrabold border-none cursor-pointer transition-all ${
            activeSubTab === 'order'
              ? 'bg-[rgba(0,212,255,0.1)] text-[var(--accent)] shadow-[0_0_8px_rgba(0,212,255,0.08)]'
              : 'bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          <Zap size={11} />
          أمر جديد
        </button>
        <button
          onClick={() => { setActiveSubTab('history'); engine.loadOpenOrders() }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] font-extrabold border-none cursor-pointer transition-all ${
            activeSubTab === 'history'
              ? 'bg-[rgba(0,212,255,0.1)] text-[var(--accent)] shadow-[0_0_8px_rgba(0,212,255,0.08)]'
              : 'bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          <Clock size={11} />
          أوامر نشطة
          {engine.recentOrders.length > 0 && (
            <span className="rounded-full bg-[rgba(0,212,255,0.15)] px-1 py-0 text-[7px] font-bold text-[var(--accent)]">
              {engine.recentOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Order History Tab ── */}
      {activeSubTab === 'history' && (
        <OrderHistory
          orders={engine.recentOrders}
          onCancel={engine.cancelOrder}
          onLoad={engine.loadOpenOrders}
        />
      )}

      {/* ── New Order Tab ── */}
      {activeSubTab === 'order' && (
        <>
          {/* Info Grid */}
          <div className={`grid gap-2 ${mobile ? 'grid-cols-2' : 'grid-cols-5'}`}>
            {[
              { label: 'الأصل', value: engine.localSymbol || '—', tone: 'var(--foreground)' },
              { label: 'الكمية', value: engine.quantity || '—', tone: 'var(--accent)' },
              { label: 'النوع', value: engine.pendingAction === 'sell' ? 'بيع' : 'شراء', tone: engine.pendingAction === 'sell' ? 'var(--danger)' : 'var(--success)' },
              { label: 'المخاطرة', value: engine.potentialLoss !== null ? `$${engine.potentialLoss.toFixed(2)}` : '—', tone: 'var(--warning)' },
              { label: 'البيئة', value: 'PAPER', tone: 'var(--success)' },
            ].map(item => (
              <div key={item.label} className="rounded-lg border border-[var(--card-border)] bg-[rgba(255,255,255,0.025)] px-2.5 py-2 min-w-0">
                <div className="text-[8px] font-bold text-[var(--muted)] mb-1">{item.label}</div>
                <div className="font-mono text-[11px] font-extrabold truncate" style={{ color: item.tone }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Symbol Search */}
          <SymbolSearch
            value={engine.localSymbol}
            onChange={v => { engine.setLocalSymbol(v) }}
            onSelect={v => { engine.setLocalSymbol(v); engine.setSelectedSymbol(v) }}
            currentPrice={engine.currentPrice}
          />

          {/* Order Type Selector */}
          <OrderTypeSelector
            orderType={engine.orderType}
            setOrderType={engine.setOrderType}
            timeInForce={engine.timeInForce}
            setTimeInForce={engine.setTimeInForce}
            currentPrice={engine.currentPrice}
          />

          {/* Quantity */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-extrabold text-[var(--muted)]">الكمية</label>
            <input
              value={engine.quantity}
              onChange={e => engine.setQuantity(e.target.value)}
              type="number" step="0.01" min="0.01"
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--foreground)] font-mono text-xs font-bold outline-none transition-colors focus:border-[var(--accent)]"
              aria-label="الكمية"
            />
          </div>

          {/* Limit Price (conditional) */}
          {engine.orderType === 'limit' && (
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-extrabold text-[var(--accent)]">سعر الأمر المعلق</label>
              <div className="flex items-center gap-2">
                <input
                  value={engine.limitPrice}
                  onChange={e => engine.setLimitPrice(e.target.value)}
                  type="number" step="0.1"
                  placeholder="0.00"
                  className="flex-1 rounded-lg border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.05)] px-3 py-2.5 text-[var(--accent)] font-mono text-xs font-bold outline-none transition-colors focus:border-[var(--accent)]"
                  aria-label="سعر الحد"
                />
                {engine.currentPrice > 0 && engine.limitPrice && (
                  <span className={`text-[9px] font-mono font-bold shrink-0 ${
                    Math.abs(parseFloat(engine.limitPrice) - engine.currentPrice) / engine.currentPrice < 0.001
                      ? 'text-[var(--muted)]'
                      : parseFloat(engine.limitPrice) > engine.currentPrice
                        ? 'text-[var(--danger)]'
                        : 'text-[var(--success)]'
                  }`}>
                    {((parseFloat(engine.limitPrice) - engine.currentPrice) / engine.currentPrice * 100).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Mobile Advanced Toggle */}
          {mobile && (
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-[var(--card-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5 text-[10px] font-extrabold text-[var(--foreground)] cursor-pointer"
            >
              <span>الإعدادات المتقدمة: TP / SL / المخاطرة</span>
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}

          {/* TP / SL */}
          {(!mobile || showAdvanced) && (
            <div className="flex gap-2.5">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[9px] font-extrabold text-[var(--success)]">جني أرباح</label>
                <input
                  value={engine.takeProfit}
                  onChange={e => engine.setTakeProfit(e.target.value)}
                  placeholder="0.00"
                  type="number" step="0.1"
                  className="w-full rounded-lg border border-[rgba(0,200,83,0.15)] bg-[rgba(0,200,83,0.05)] px-3 py-2.5 text-[var(--success)] font-mono text-xs font-bold outline-none transition-colors focus:border-[var(--success)]"
                  aria-label="جني الأرباح"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[9px] font-extrabold text-[var(--danger)]">وقف خسارة</label>
                <input
                  value={engine.stopLoss}
                  onChange={e => engine.setStopLoss(e.target.value)}
                  placeholder="0.00"
                  type="number" step="0.1"
                  className="w-full rounded-lg border border-[rgba(255,59,48,0.15)] bg-[rgba(255,59,48,0.05)] px-3 py-2.5 text-[var(--danger)] font-mono text-xs font-bold outline-none transition-colors focus:border-[var(--danger)]"
                  aria-label="وقف الخسارة"
                />
              </div>
            </div>
          )}

          {/* Crypto SL/TP Warning */}
          {isCrypto && (engine.stopLoss || engine.takeProfit) && (!mobile || showAdvanced) && (
            <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,184,0,0.2)] bg-[rgba(255,184,0,0.06)] px-2.5 py-2">
              <AlertTriangle size={12} className="text-[var(--warning)] shrink-0" />
              <span className="text-[8px] font-bold text-[var(--warning)]">
                أوامر وقف الخسارة وجني الأرباح للعملات الرقمية تُدار محلياً (bracket orders غير مدعومة للكريبتو على Alpaca)
              </span>
            </div>
          )}

          {/* Auto-Calculate Button */}
          {(!mobile || showAdvanced) && (
            <div className="flex justify-end">
              <button
                onClick={engine.autoCalculate}
                className="flex items-center gap-1 rounded-lg border border-[rgba(0,229,255,0.2)] bg-[rgba(0,229,255,0.1)] px-3 py-3 text-[9px] font-bold text-[var(--accent)] cursor-pointer hover:bg-[rgba(0,229,255,0.15)] transition-colors"
              >
                <Calculator size={10} />
                حساب تلقائي
              </button>
            </div>
          )}

          {/* Pre-Trade Summary */}
          {(!mobile || showAdvanced) && engine.currentPrice > 0 && parseFloat(engine.quantity) > 0 && (
            <PreTradeSummary
              symbol={engine.localSymbol}
              side={engine.pendingAction}
              orderType={engine.orderType}
              quantity={engine.quantity}
              currentPrice={engine.currentPrice}
              limitPrice={engine.limitPrice}
              stopLoss={engine.stopLoss}
              takeProfit={engine.takeProfit}
              estimatedCost={engine.estimatedCost}
              potentialGain={engine.potentialGain}
              potentialLoss={engine.potentialLoss}
              rrRatio={engine.rrRatio}
              account={engine.account}
            />
          )}

          {/* Risk Calculator */}
          {(!mobile || showAdvanced) && (
            <RiskCalculator
              riskPct={engine.riskPct}
              setRiskPct={engine.setRiskPct}
              riskAmount={engine.riskAmount}
              autoQty={engine.autoQty}
              potentialGain={engine.potentialGain}
              potentialLoss={engine.potentialLoss}
              rrRatio={engine.rrRatio}
              account={engine.account}
              currentPrice={engine.currentPrice}
              onApplyQty={engine.applyOptimalQty}
              show={showRiskCalc}
              onToggle={() => setShowRiskCalc(v => !v)}
            />
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 mt-auto">
            <button
              onClick={() => engine.validateAndConfirm('buy')}
              disabled={engine.loading}
              className="btn-neon-buy flex flex-1 items-center justify-center gap-2 rounded-[var(--radius)] py-3 text-[13px] font-extrabold cursor-pointer transition-transform active:scale-[0.97] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <Zap size={14} fill="white" />
              {engine.loading && engine.pendingAction === 'buy' ? 'جارٍ...' : 'شراء'}
            </button>
            <button
              onClick={() => engine.validateAndConfirm('sell')}
              disabled={engine.loading}
              className="btn-neon-sell flex flex-1 items-center justify-center gap-2 rounded-[var(--radius)] py-3 text-[13px] font-extrabold cursor-pointer transition-transform active:scale-[0.97] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <Zap size={14} fill="white" />
              {engine.loading && engine.pendingAction === 'sell' ? 'جارٍ...' : 'بيع'}
            </button>
          </div>

          {/* Safety Badge */}
          <div className="flex items-center justify-center gap-1.5 opacity-50 mt-1">
            <ShieldCheck size={12} className="text-[var(--success)]" />
            <span className="text-[9px] font-semibold text-[var(--muted)]">تداول مؤسسي مشفر 256-bit</span>
          </div>
        </>
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
