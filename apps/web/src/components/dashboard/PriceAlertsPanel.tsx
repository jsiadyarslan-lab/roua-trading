'use client'

import { useState } from 'react'
import { Bell, BellRing, Plus, Trash2, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePriceAlertStore, AlertCondition } from '@/hooks/usePriceAlertStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import T from '@/lib/unified-tokens'

const CONDITION_COLORS: Record<AlertCondition, string> = {
  above: T.green, below: T.red, change_up: T.green, change_down: T.red,
}

export function PriceAlertsPanel() {
  const tp = useTranslations('dashboard.priceAlerts')
  const tc = useTranslations('common')
  const { alerts, addAlert, removeAlert, clearTriggered } = usePriceAlertStore()
  const globalQuotes = useMarketStore(state => state.quotes)
  const { selectedSymbol } = useSymbolStore()

  const [symbol, setSymbol] = useState(selectedSymbol || 'BTC/USD')
  const [condition, setCondition] = useState<AlertCondition>('above')
  const [targetPrice, setTargetPrice] = useState('')
  const [note, setNote] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const currentPrice = globalQuotes[symbol]?.price ?? null

  const conditionLabels: Record<AlertCondition, string> = {
    above:       tp('abovePrice'),
    below:       tp('belowPrice'),
    change_up:   tp('pctUpToday'),
    change_down: tp('pctDownToday'),
  }

  const handleAdd = () => {
    if (!symbol.trim()) { setError(tp('enterAsset')); return }
    const val = parseFloat(targetPrice)
    if (isNaN(val) || val <= 0) { setError(tp('enterValue')); return }
    setError('')
    addAlert({ symbol: symbol.toUpperCase(), condition, targetPrice: val, note: note || undefined })
    setTargetPrice('')
    setNote('')
    setShowForm(false)
  }

  const triggered = alerts.filter(a => a.triggered)
  const active    = alerts.filter(a => !a.triggered)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.bg, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--surface)', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={14} color={T.amber} />
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "var(--font-ar)" }}>
            {tp('title')}
          </span>
          {active.length > 0 && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 20, background: `${T.amber}20`, color: T.amber, fontWeight: 800 }}>
              {tp('activeCount', { n: active.length })}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {triggered.length > 0 && (
            <button onClick={clearTriggered} style={{ fontSize: 9, color: T.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}>
              {tp('clearActive')} ({triggered.length})
            </button>
          )}
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: `${T.blue}20`, border: `1px solid ${T.blue}40`,
              borderRadius: 6, color: T.blue, fontSize: 10, fontWeight: 800, cursor: 'pointer',
            }}
          >
            <Plus size={12} /> {tp('add')}
          </button>
        </div>
      </div>

      {/* Add Alert Form */}
      {showForm && (
        <div style={{
          padding: '12px 14px', borderBottom: `1px solid ${T.border}`,
          background: 'rgba(10,132,255,0.04)', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Symbol */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 9, color: T.muted, fontWeight: 700 }}>{tp('asset')}</label>
              <input
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                style={{
                  background: 'var(--surface)', border: `1px solid ${T.border}`,
                  borderRadius: 8, color: T.text, fontSize: 12, padding: '8px',
                  fontFamily: "var(--font-mono)", outline: 'none', width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>
            {/* Target */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 9, color: T.muted, fontWeight: 700 }}>
                {tp('value')}
                {currentPrice !== null && (
                  <span style={{ color: T.blue, marginInlineEnd: 4 }}>
                    {tp('currentLabel')} {currentPrice > 100 ? currentPrice.toLocaleString('en', { maximumFractionDigits: 2 }) : currentPrice.toFixed(4)}
                  </span>
                )}
              </label>
              <input
                value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                type="number" step="any" placeholder="0.00"
                style={{
                  background: 'var(--surface)', border: `1px solid ${T.border}`,
                  borderRadius: 8, color: T.text, fontSize: 12, padding: '8px',
                  fontFamily: "var(--font-mono)", outline: 'none', width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Condition Selector */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(conditionLabels) as AlertCondition[]).map(c => (
              <button
                key={c}
                onClick={() => setCondition(c)}
                style={{
                  fontSize: 9, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                  fontWeight: 800, fontFamily: "var(--font-ar)",
                  background: condition === c ? `${CONDITION_COLORS[c]}20` : 'transparent',
                  border: `1px solid ${condition === c ? CONDITION_COLORS[c] : T.border}`,
                  color: condition === c ? CONDITION_COLORS[c] : T.muted,
                  transition: 'all 0.15s',
                }}
              >
                {conditionLabels[c]}
              </button>
            ))}
          </div>

          {error && <span style={{ fontSize: 10, color: T.red }}>{error}</span>}

          <button
            onClick={handleAdd}
            style={{
              padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: T.blue, color: '#fff', fontWeight: 800, fontSize: 12,
              fontFamily: "var(--font-ar)",
            }}
          >
            {tp('addAlert')}
          </button>
        </div>
      )}

      {/* Alert List */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {alerts.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: T.muted }}>
            <Bell size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-ar)" }}>
              {tp('noAlerts')}
            </div>
            <div style={{ fontSize: 10, marginTop: 4 }}>{tp('addAlertToStart')}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Triggered alerts */}
            {triggered.map(alert => (
              <AlertRow key={alert.id} alert={alert} onRemove={() => removeAlert(alert.id)} currentPrice={globalQuotes[alert.symbol]?.price} />
            ))}
            {/* Active alerts */}
            {active.map(alert => (
              <AlertRow key={alert.id} alert={alert} onRemove={() => removeAlert(alert.id)} currentPrice={globalQuotes[alert.symbol]?.price} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AlertRow({ alert, onRemove, currentPrice }: {
  alert: ReturnType<typeof usePriceAlertStore.getState>['alerts'][0]
  onRemove: () => void
  currentPrice?: number
}) {
  const tp = useTranslations('dashboard.priceAlerts')

  const conditionLabels: Record<AlertCondition, string> = {
    above:       tp('abovePrice'),
    below:       tp('belowPrice'),
    change_up:   tp('pctUpToday'),
    change_down: tp('pctDownToday'),
  }

  const color = CONDITION_COLORS[alert.condition]
  const isTriggered = alert.triggered

  // Progress toward target
  const progress = currentPrice && !isTriggered
    ? Math.min(100, Math.max(0,
        alert.condition === 'above'
          ? (currentPrice / alert.targetPrice) * 100
          : alert.condition === 'below'
          ? (alert.targetPrice / currentPrice) * 100
          : 50
      ))
    : 100

  return (
    <div style={{
      background: isTriggered ? `${color}10` : 'var(--surface)',
      border: `1px solid ${isTriggered ? color : 'var(--card-border)'}`,
      borderRadius: 10, padding: '10px 12px',
      opacity: isTriggered ? 0.8 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isTriggered
              ? <BellRing size={12} color={color} />
              : <Bell size={12} color={T.muted} />}
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--foreground)', fontFamily: "var(--font-mono)" }}>
              {alert.symbol}
            </span>
            <span style={{
              fontSize: 8, padding: '1px 6px', borderRadius: 20,
              background: `${color}15`, color, fontWeight: 800,
            }}>
              {isTriggered ? tp('activeOn') : conditionLabels[alert.condition]}
            </span>
          </div>
          <div style={{ fontSize: 11, color, fontFamily: "var(--font-mono)", fontWeight: 800, marginTop: 2 }}>
            {alert.condition.startsWith('change')
              ? `${alert.targetPrice}%`
              : `$${alert.targetPrice.toLocaleString('en', { maximumFractionDigits: 4 })}`}
            {currentPrice && !isTriggered && (
              <span style={{ color: 'var(--muted)', fontSize: 9, fontWeight: 400, marginInlineEnd: 6 }}>
                {tp('currentLabel')} ${currentPrice > 100
                  ? currentPrice.toLocaleString('en', { maximumFractionDigits: 2 })
                  : currentPrice.toFixed(4)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onRemove}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.muted, padding: 2 }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Progress bar */}
      {!isTriggered && (
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${progress}%`, background: color,
            borderRadius: 2, transition: 'width 0.5s ease',
          }} />
        </div>
      )}

      {alert.note && (
        <div style={{ fontSize: 9, color: T.muted, marginTop: 4 }}>{alert.note}</div>
      )}
    </div>
  )
}
