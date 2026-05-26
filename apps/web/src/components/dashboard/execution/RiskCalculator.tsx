'use client'

import { ChevronDown, ChevronUp, Calculator } from 'lucide-react'
import type { ExecutionState } from '@/lib/dashboard-live'
import { useTranslations } from 'next-intl'

interface RiskCalculatorProps {
  riskPct: string
  setRiskPct: (v: string) => void
  riskAmount: number
  autoQty: string | null
  potentialGain: number | null
  potentialLoss: number | null
  rrRatio: string | null
  account: { cash: number; buyingPower: number } | null
  currentPrice: number
  onApplyQty: () => void
  show: boolean
  onToggle: () => void
}

export function RiskCalculator({
  riskPct, setRiskPct,
  riskAmount, autoQty,
  potentialGain, potentialLoss, rrRatio,
  account, currentPrice,
  onApplyQty,
  show, onToggle,
}: RiskCalculatorProps) {
  const te = useTranslations('dashboard.execution')

  return (
    <div className="border-t border-[var(--card-border)] pt-2">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between border-none bg-transparent py-2 px-0 cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <Calculator size={12} className="text-[var(--accent)]" />
          <span className="text-[10px] font-extrabold text-[var(--accent)]">{te('riskCalculator')}</span>
        </div>
        {show ? <ChevronUp size={12} className="text-[var(--muted)]" /> : <ChevronDown size={12} className="text-[var(--muted)]" />}
      </button>

      {show && (
        <div className="mt-2 flex flex-col gap-2">
          {/* Risk % slider */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-[var(--muted)] whitespace-nowrap">{te('riskPercent')}:</span>
            <input
              type="range" min="0.1" max="10" step="0.1"
              value={riskPct}
              onChange={e => setRiskPct(e.target.value)}
              className="flex-1 accent-[var(--accent)] cursor-pointer"
            />
            <span className="font-mono text-[11px] font-black text-[var(--accent)] min-w-[36px] text-left">
              {riskPct}%
            </span>
          </div>

          {/* Visual risk bar */}
          <div className="relative h-1.5 rounded-full bg-[var(--card-border)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(parseFloat(riskPct) * 10, 100)}%`,
                background: parseFloat(riskPct) <= 2
                  ? 'var(--success)'
                  : parseFloat(riskPct) <= 5
                    ? 'var(--warning)'
                    : 'var(--danger)',
              }}
            />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: te('riskAmount'), value: account ? `$${riskAmount.toFixed(0)}` : '—', color: 'var(--danger)' },
              { label: te('optimalQuantity'), value: autoQty ?? (currentPrice > 0 ? `~${(riskAmount / currentPrice).toFixed(4)}` : '—'), color: 'var(--accent)' },
              { label: te('winLossRatio'), value: rrRatio ? `${rrRatio}:1` : '—', color: parseFloat(rrRatio ?? '0') >= 2 ? 'var(--success)' : 'var(--warning)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg border border-[var(--card-border)] bg-[var(--surface)] p-1.5 text-center">
                <div className="font-mono text-[11px] font-black" style={{ color }}>{value}</div>
                <div className="mt-0.5 text-[7px] font-bold text-[var(--muted)]">{label}</div>
              </div>
            ))}
          </div>

          {/* P&L preview */}
          {(potentialGain !== null || potentialLoss !== null) && (
            <div className="flex gap-1.5">
              {potentialGain !== null && (
                <div className="flex-1 rounded-lg border border-[rgba(0,200,83,0.2)] bg-[rgba(0,200,83,0.07)] p-1.5 text-center">
                  <div className="font-mono text-[11px] font-black text-[var(--success)]">+${potentialGain.toFixed(2)}</div>
                  <div className="text-[7px] font-bold text-[var(--muted)]">{te('estimatedTakeProfit')}</div>
                </div>
              )}
              {potentialLoss !== null && (
                <div className="flex-1 rounded-lg border border-[rgba(255,59,48,0.2)] bg-[rgba(255,59,48,0.07)] p-1.5 text-center">
                  <div className="font-mono text-[11px] font-black text-[var(--danger)]">-${potentialLoss.toFixed(2)}</div>
                  <div className="text-[7px] font-bold text-[var(--muted)]">{te('estimatedStopLoss')}</div>
                </div>
              )}
            </div>
          )}

          {/* R:R visual gauge */}
          {rrRatio && (
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold text-[var(--muted)]">{te('dealQuality')}:</span>
              <div className="flex-1 h-1 rounded-full bg-[var(--card-border)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(parseFloat(rrRatio) / 5 * 100, 100)}%`,
                    background: parseFloat(rrRatio) >= 2 ? 'var(--success)' : parseFloat(rrRatio) >= 1 ? 'var(--warning)' : 'var(--danger)',
                  }}
                />
              </div>
              <span className={`text-[8px] font-bold ${parseFloat(rrRatio) >= 2 ? 'text-[var(--success)]' : parseFloat(rrRatio) >= 1 ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}`}>
                {parseFloat(rrRatio) >= 2 ? te('excellent') : parseFloat(rrRatio) >= 1 ? te('acceptable') : te('weak')}
              </span>
            </div>
          )}

          {autoQty && (
            <button
              onClick={onApplyQty}
              className="rounded-md border border-dashed border-[var(--accent)] bg-[rgba(0,229,255,0.06)] px-2 py-1 text-[10px] font-bold text-[var(--accent)] cursor-pointer hover:bg-[rgba(0,229,255,0.1)] transition-colors"
            >
              {te('applyOptimalQty', { qty: autoQty })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
