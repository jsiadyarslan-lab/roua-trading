'use client'

import { useState, useEffect } from 'react'
import { Zap, ChevronDown, AlertTriangle, Calculator } from 'lucide-react'
import { useExecutionEngine } from './hooks/useExecutionEngine'
import { ExecutionOverlay } from './ExecutionOverlay'
import { OrderHistory } from './OrderHistory'
import type { DataStatus } from '@/lib/dashboard-live'

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
  const [activeSubTab, setActiveSubTab] = useState<'order' | 'history'>('order')

  useEffect(() => { engine.loadAccount() }, [])

  const isCrypto = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC', 'LINK', 'UNI'].some(
    c => engine.localSymbol.toUpperCase().startsWith(c)
  )

  const isLive = dataStatus === 'live'
  const qtyNum = parseFloat(engine.quantity) || 0

  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto" style={{ direction: 'rtl', background: 'linear-gradient(180deg, #0E1118, #0A0D14)' }}>

      {/* ── Row 1: Symbol + Price + Balance ── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[rgba(255,255,255,0.04)]">
        {/* Symbol input — inline, no label */}
        <input
          value={engine.localSymbol}
          onChange={e => { engine.setLocalSymbol(e.target.value.toUpperCase()); engine.setSelectedSymbol(e.target.value.toUpperCase()) }}
          placeholder="رمز الأصل"
          className="w-[72px] rounded border border-[var(--card-border)] bg-[var(--surface)] px-1.5 py-0.5 text-[var(--foreground)] font-mono text-[10px] font-bold outline-none focus:border-[var(--accent)] transition-colors text-center"
        />
        {/* Live dot + price */}
        <div className="flex items-center gap-1 flex-1 justify-center">
          <span className={`w-1 h-1 rounded-full ${isLive ? 'bg-[#00C853]' : 'bg-[var(--amber)]'}`}
            style={{ boxShadow: isLive ? '0 0 4px #00C853' : '0 0 4px #FFB800' }} />
          <span className="font-mono text-[11px] font-bold text-[var(--foreground)]">
            {engine.currentPrice > 0 ? `$${engine.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
          </span>
        </div>
        {/* Balance */}
        {engine.account && (
          <span className="font-mono text-[8px] text-[var(--muted)]">
            <span className="text-[var(--success)]">${(engine.account.cash ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </span>
        )}
      </div>

      {/* ── Row 2: Sub-tab micro pills ── */}
      <div className="flex px-2 pt-1 gap-0.5">
        <button
          onClick={() => setActiveSubTab('order')}
          className={`flex-1 rounded py-0.5 text-[8px] font-bold border-none cursor-pointer transition-all ${
            activeSubTab === 'order' ? 'bg-[rgba(0,212,255,0.12)] text-[var(--accent)]' : 'bg-transparent text-[var(--muted)]'
          }`}
        >أمر</button>
        <button
          onClick={() => { setActiveSubTab('history'); engine.loadOpenOrders() }}
          className={`flex-1 flex items-center justify-center gap-0.5 rounded py-0.5 text-[8px] font-bold border-none cursor-pointer transition-all ${
            activeSubTab === 'history' ? 'bg-[rgba(0,212,255,0.12)] text-[var(--accent)]' : 'bg-transparent text-[var(--muted)]'
          }`}
        >
          أوامر
          {engine.recentOrders.length > 0 && (
            <span className="text-[6px] bg-[rgba(0,212,255,0.15)] text-[var(--accent)] rounded-full px-0.5">{engine.recentOrders.length}</span>
          )}
        </button>
      </div>

      {/* ── History Tab ── */}
      {activeSubTab === 'history' && (
        <div className="px-2 pt-1.5">
          <OrderHistory orders={engine.recentOrders} onCancel={engine.cancelOrder} onLoad={engine.loadOpenOrders} />
        </div>
      )}

      {/* ── Order Tab — Binance-style compact ── */}
      {activeSubTab === 'order' && (
        <div className="flex flex-col gap-1 px-2 pt-1.5 pb-1.5">

          {/* Order Type pills — Market | Limit */}
          <div className="flex gap-0.5">
            {(['market', 'limit'] as const).map(t => (
              <button
                key={t}
                onClick={() => {
                  engine.setOrderType(t)
                  if (t === 'market') engine.setTimeInForce('ioc')
                  else engine.setTimeInForce('gtc')
                }}
                className={`flex-1 rounded py-0.5 text-[8px] font-bold border cursor-pointer transition-all ${
                  engine.orderType === t
                    ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.08)] text-[var(--accent)]'
                    : 'border-[var(--card-border)] bg-transparent text-[var(--muted)]'
                }`}
              >
                {t === 'market' ? 'سوقي' : 'معلق'}
              </button>
            ))}
            {/* TIF micro selector */}
            <select
              value={engine.timeInForce}
              onChange={e => engine.setTimeInForce(e.target.value as any)}
              className="bg-[var(--surface)] border border-[var(--card-border)] rounded text-[7px] font-bold text-[var(--muted)] px-0.5 py-0 outline-none cursor-pointer"
            >
              <option value="ioc">IOC</option>
              <option value="gtc">GTC</option>
              <option value="day">DAY</option>
            </select>
          </div>

          {/* Quantity — full width */}
          <input
            value={engine.quantity}
            onChange={e => engine.setQuantity(e.target.value)}
            type="number" step="0.01" min="0.01"
            placeholder="الكمية"
            className="w-full rounded border border-[var(--card-border)] bg-[var(--surface)] px-2 py-1 text-[var(--foreground)] font-mono text-[10px] font-bold outline-none focus:border-[var(--accent)] transition-colors"
          />

          {/* Limit Price — only when limit */}
          {engine.orderType === 'limit' && (
            <input
              value={engine.limitPrice}
              onChange={e => engine.setLimitPrice(e.target.value)}
              type="number" step="0.1"
              placeholder="سعر الأمر المعلق"
              className="w-full rounded border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.04)] px-2 py-1 text-[var(--accent)] font-mono text-[10px] font-bold outline-none focus:border-[var(--accent)] transition-colors"
            />
          )}

          {/* TP / SL — inline row */}
          <div className="flex gap-1">
            <input
              value={engine.takeProfit}
              onChange={e => engine.setTakeProfit(e.target.value)}
              type="number" step="0.1"
              placeholder="TP"
              className="flex-1 rounded border border-[rgba(0,200,83,0.12)] bg-[rgba(0,200,83,0.04)] px-1.5 py-1 text-[var(--success)] font-mono text-[10px] font-bold outline-none focus:border-[var(--success)] transition-colors placeholder:text-[rgba(0,200,83,0.25)]"
            />
            <input
              value={engine.stopLoss}
              onChange={e => engine.setStopLoss(e.target.value)}
              type="number" step="0.1"
              placeholder="SL"
              className="flex-1 rounded border border-[rgba(255,59,48,0.12)] bg-[rgba(255,59,48,0.04)] px-1.5 py-1 text-[var(--danger)] font-mono text-[10px] font-bold outline-none focus:border-[var(--danger)] transition-colors placeholder:text-[rgba(255,59,48,0.25)]"
            />
          </div>

          {/* Crypto SL/TP warning — micro */}
          {isCrypto && (engine.stopLoss || engine.takeProfit) && (
            <div className="flex items-center gap-0.5">
              <AlertTriangle size={6} className="text-[var(--warning)] shrink-0" />
              <span className="text-[6px] text-[var(--warning)]">SL/TP محلي للكريبتو</span>
            </div>
          )}

          {/* Quick actions row: Auto-calc + Risk toggle */}
          <div className="flex gap-0.5">
            <button
              onClick={engine.autoCalculate}
              className="flex-1 flex items-center justify-center gap-0.5 rounded border border-[rgba(0,229,255,0.12)] bg-[rgba(0,229,255,0.04)] py-0.5 text-[7px] font-bold text-[var(--accent)] cursor-pointer hover:bg-[rgba(0,229,255,0.08)] transition-colors"
            >
              <Calculator size={7} />
              تلقائي
            </button>
            <button
              onClick={() => {
                // Apply optimal qty if available
                if (engine.autoQty && parseFloat(engine.autoQty) > 0) {
                  engine.applyOptimalQty()
                }
              }}
              className="flex-1 flex items-center justify-center gap-0.5 rounded border border-[var(--card-border)] bg-transparent py-0.5 text-[7px] font-bold text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)] transition-colors"
            >
              {engine.autoQty ? `${engine.autoQty}` : '—'}
              <span className="text-[6px]">كمية</span>
            </button>
          </div>

          {/* Risk bar — ultra compact, always visible if SL set */}
          {engine.stopLoss && parseFloat(engine.stopLoss) > 0 && engine.account && (
            <div className="flex items-center gap-1">
              <input
                type="range" min="0.1" max="10" step="0.1"
                value={engine.riskPct}
                onChange={e => engine.setRiskPct(e.target.value)}
                className="flex-1 accent-[var(--accent)] cursor-pointer h-0.5"
              />
              <span className="font-mono text-[7px] font-bold text-[var(--accent)] min-w-[20px]">{engine.riskPct}%</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[7px] font-bold text-[var(--danger)]">${engine.riskAmount.toFixed(0)}</span>
                {engine.rrRatio && (
                  <span className={`font-mono text-[7px] font-bold ${parseFloat(engine.rrRatio) >= 2 ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                    {engine.rrRatio}:1
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Estimated cost + insufficient warning — one line */}
          {engine.currentPrice > 0 && qtyNum > 0 && (
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[7px] text-[var(--muted)]">≈${engine.estimatedCost.toFixed(2)}</span>
              {engine.account && engine.account.buyingPower > 0 && engine.estimatedCost > engine.account.buyingPower && (
                <span className="text-[7px] font-bold text-[var(--danger)]">رصيد غير كافٍ</span>
              )}
            </div>
          )}

          {/* BUY / SELL — prominent, takes remaining space */}
          <div className="flex gap-1.5 mt-auto pt-0.5">
            <button
              onClick={() => engine.validateAndConfirm('buy')}
              disabled={engine.loading}
              className="btn-neon-buy flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-extrabold cursor-pointer transition-transform active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Zap size={10} fill="white" />
              {engine.loading && engine.pendingAction === 'buy' ? '...' : 'شراء'}
            </button>
            <button
              onClick={() => engine.validateAndConfirm('sell')}
              disabled={engine.loading}
              className="btn-neon-sell flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-extrabold cursor-pointer transition-transform active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Zap size={10} fill="white" />
              {engine.loading && engine.pendingAction === 'sell' ? '...' : 'بيع'}
            </button>
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
