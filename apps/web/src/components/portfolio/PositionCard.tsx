'use client'

import { useState } from 'react'
import { X as XIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { T } from '@/lib/theme-tokens'
import { getPnlColor, isPnlPositive } from '@/lib/unified-tokens'
import { fmtPrice, fmtPriceLocale } from '@/lib/price-format'

interface PositionCardProps {
  symbol: string
  side: string
  qty: number
  avgEntryPrice: number
  currentPrice: number
  unrealizedPnl: number
  unrealizedPnlPct?: number
  marketValue?: number
  sl?: number
  tp?: number
  stopLoss?: number
  takeProfit?: number
  onClose?: (symbol: string) => void
  onSetSl?: (symbol: string, value: number) => void
  onSetTp?: (symbol: string, value: number) => void
}

function MiniDirectionArrow({ isUp, color }: { isUp: boolean; color: string }) {
  // Simple SVG arrow showing direction
  return (
    <svg width="20" height="12" viewBox="0 0 20 12" style={{ flexShrink: 0 }}>
      <path
        d={isUp ? 'M 2,10 L 10,2 L 18,10' : 'M 2,2 L 10,10 L 18,2'}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PositionCard({
  symbol,
  side,
  qty,
  avgEntryPrice,
  currentPrice,
  unrealizedPnl,
  unrealizedPnlPct,
  sl,
  tp,
  stopLoss,
  takeProfit,
  onClose,
  onSetSl,
  onSetTp,
}: PositionCardProps) {
  const [confirmClose, setConfirmClose] = useState(false)
  const [editingSl, setEditingSl] = useState(false)
  const [editingTp, setEditingTp] = useState(false)
  const [slValue, setSlValue] = useState('')
  const [tpValue, setTpValue] = useState('')

  const isLong = side === 'long' || side === 'LONG'
  const pnlPct =
    unrealizedPnlPct ??
    (avgEntryPrice > 0
      ? ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100 * (isLong ? 1 : -1)
      : 0)
  const isProfitable = isPnlPositive(unrealizedPnl)
  const pnlColor = getPnlColor(unrealizedPnl)
  const sideColor = isLong ? T.green : T.red
  const sideLabel = isLong ? 'شراء' : 'بيع'

  const effectiveSl = sl ?? stopLoss
  const effectiveTp = tp ?? takeProfit

  const formatPriceDisplay = (price: number) => {
    if (price === 0) return '—'
    return fmtPriceLocale(price, symbol)
  }

  return (
    <div
      style={{
        width: '100%',
        minHeight: 40,
        height: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 8,
        border: `1px solid ${unrealizedPnl > 0 ? 'rgba(0,255,163,0.12)' : unrealizedPnl < 0 ? 'rgba(255,71,87,0.12)' : 'rgba(255,255,255,0.06)'}`,
        background: unrealizedPnl > 0
          ? 'rgba(0,255,163,0.03)'
          : unrealizedPnl < 0 ? 'rgba(255,71,87,0.03)' : 'transparent',
        direction: 'rtl',
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = unrealizedPnl > 0
          ? 'rgba(0,255,163,0.25)'
          : unrealizedPnl < 0 ? 'rgba(255,71,87,0.25)' : 'rgba(255,255,255,0.12)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = unrealizedPnl > 0
          ? 'rgba(0,255,163,0.12)'
          : unrealizedPnl < 0 ? 'rgba(255,71,87,0.12)' : 'rgba(255,255,255,0.06)'
      }}
    >
      {/* Side indicator */}
      <div
        style={{
          width: 3,
          height: 24,
          borderRadius: 2,
          background: sideColor,
          boxShadow: `0 0 6px ${sideColor}44`,
          flexShrink: 0,
        }}
      />

      {/* Symbol + Side */}
      <div style={{ minWidth: 0, flexShrink: 0, width: 72 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: T.text,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {symbol}
        </div>
        <div
          style={{
            fontSize: 7,
            fontWeight: 700,
            color: sideColor,
            fontFamily: "'Cairo', sans-serif",
          }}
        >
          {sideLabel} × {qty}
        </div>
      </div>

      {/* Price info */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 7.5,
              color: T.textMuted,
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            الدخول
          </div>
          <div
            style={{
              fontSize: 9,
              color: T.text2,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {formatPriceDisplay(avgEntryPrice)}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 7.5,
              color: T.textMuted,
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            الحالي
          </div>
          <div
            style={{
              fontSize: 9,
              color: T.text,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {formatPriceDisplay(currentPrice)}
          </div>
        </div>
      </div>

      {/* P&L + Direction arrow */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <MiniDirectionArrow isUp={unrealizedPnl > 0} color={pnlColor} />
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              color: pnlColor,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {unrealizedPnl > 0 ? '+' : ''}{Number(unrealizedPnl).toFixed(2)}
          </div>
          <div
            style={{
              fontSize: 7,
              fontWeight: 700,
              color: pnlColor,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {pnlPct > 0 ? '+' : ''}{pnlPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* SL/TP inline buttons */}
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {/* SL */}
        {editingSl ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const val = parseFloat(slValue)
              if (!isNaN(val) && val > 0 && onSetSl) {
                onSetSl(symbol, val)
              }
              setEditingSl(false)
            }}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <input
              type="number"
              step="any"
              value={slValue}
              onChange={(e) => setSlValue(e.target.value)}
              placeholder={effectiveSl ? String(effectiveSl) : 'SL'}
              autoFocus
              style={{
                width: 48,
                height: 18,
                fontSize: 7,
                padding: '0 3px',
                borderRadius: 3,
                border: '1px solid rgba(255,71,87,0.3)',
                background: 'rgba(255,71,87,0.08)',
                color: T.red,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
              }}
              onBlur={() => setEditingSl(false)}
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setSlValue(effectiveSl ? String(effectiveSl) : '')
              setEditingSl(true)
            }}
            title={effectiveSl ? `SL: ${effectiveSl}` : 'تعيين وقف خسارة'}
            style={{
              height: 18,
              padding: '0 4px',
              borderRadius: 3,
              border: effectiveSl
                ? '1px solid rgba(255,71,87,0.3)'
                : '1px dashed rgba(255,71,87,0.2)',
              background: effectiveSl ? 'rgba(255,71,87,0.08)' : 'transparent',
              color: effectiveSl ? T.red : 'rgba(255,71,87,0.5)',
              fontSize: 7,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            SL
          </button>
        )}

        {/* TP */}
        {editingTp ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const val = parseFloat(tpValue)
              if (!isNaN(val) && val > 0 && onSetTp) {
                onSetTp(symbol, val)
              }
              setEditingTp(false)
            }}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <input
              type="number"
              step="any"
              value={tpValue}
              onChange={(e) => setTpValue(e.target.value)}
              placeholder={effectiveTp ? String(effectiveTp) : 'TP'}
              autoFocus
              style={{
                width: 48,
                height: 18,
                fontSize: 7,
                padding: '0 3px',
                borderRadius: 3,
                border: '1px solid rgba(0,255,163,0.3)',
                background: 'rgba(0,255,163,0.08)',
                color: T.green,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
              }}
              onBlur={() => setEditingTp(false)}
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTpValue(effectiveTp ? String(effectiveTp) : '')
              setEditingTp(true)
            }}
            title={effectiveTp ? `TP: ${effectiveTp}` : 'تعيين جني أرباح'}
            style={{
              height: 18,
              padding: '0 4px',
              borderRadius: 3,
              border: effectiveTp
                ? '1px solid rgba(0,255,163,0.3)'
                : '1px dashed rgba(0,255,163,0.2)',
              background: effectiveTp ? 'rgba(0,255,163,0.08)' : 'transparent',
              color: effectiveTp ? T.green : 'rgba(0,255,163,0.5)',
              fontSize: 7,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            TP
          </button>
        )}
      </div>

      {/* Close button */}
      {onClose && (
        <div style={{ flexShrink: 0 }}>
          {confirmClose ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <button
                type="button"
                onClick={() => {
                  onClose(symbol)
                  setConfirmClose(false)
                }}
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: '1px solid rgba(255,71,87,0.4)',
                  background: 'rgba(255,71,87,0.15)',
                  color: T.red,
                  fontSize: 7,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: "'Cairo', sans-serif",
                }}
              >
                تأكيد
              </button>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                style={{
                  padding: '2px 4px',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'transparent',
                  color: T.textMuted,
                  fontSize: 7,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              title="إغلاق المركز"
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.03)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.borderColor = 'rgba(255,71,87,0.3)'
                el.style.background = 'rgba(255,71,87,0.1)'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.borderColor = 'rgba(255,255,255,0.06)'
                el.style.background = 'rgba(255,255,255,0.03)'
              }}
            >
              <XIcon size={10} color="#6F849C" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
