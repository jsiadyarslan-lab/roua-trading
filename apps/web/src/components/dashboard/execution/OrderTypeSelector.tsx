'use client'

import T from '@/lib/unified-tokens'
import type { OrderType, TimeInForce } from './hooks/useExecutionEngine'
import { useTranslations } from 'next-intl'

interface OrderTypeSelectorProps {
  orderType: OrderType
  setOrderType: (t: OrderType) => void
  timeInForce: TimeInForce
  setTimeInForce: (t: TimeInForce) => void
  currentPrice: number
}

export function OrderTypeSelector({ orderType, setOrderType, timeInForce, setTimeInForce, currentPrice }: OrderTypeSelectorProps) {
  const te = useTranslations('dashboard.execution')

  const types: { key: OrderType; label: string; desc: string }[] = [
    { key: 'market', label: te('marketOrder'), desc: te('marketOrderDesc') },
    { key: 'limit', label: te('limitOrder'), desc: te('limitOrderDesc') },
  ]

  const tifOptions: { key: TimeInForce; label: string; desc: string }[] = [
    { key: 'ioc', label: 'IOC', desc: te('iocDesc') },
    { key: 'gtc', label: 'GTC', desc: te('gtcDesc') },
    { key: 'day', label: 'DAY', desc: te('dayDesc') },
  ]

  return (
    <div className="flex flex-col gap-2">
      {/* Order Type */}
      <div className="flex gap-1">
        {types.map(t => (
          <button
            key={t.key}
            onClick={() => {
              setOrderType(t.key)
              // Auto-set TIF
              if (t.key === 'market') setTimeInForce('ioc')
              else if (t.key === 'limit') setTimeInForce('gtc')
            }}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg border px-2 py-2 transition-all ${
              orderType === t.key
                ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.08)] shadow-[0_0_12px_rgba(0,212,255,0.1)]'
                : 'border-[var(--card-border)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            <span className={`text-[10px] font-extrabold ${orderType === t.key ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}>
              {t.label}
            </span>
            <span className="text-[7px] text-[var(--muted)]">{t.desc}</span>
          </button>
        ))}
      </div>

      {/* Time-in-Force */}
      <div className="flex gap-1">
        {tifOptions.map(t => (
          <button
            key={t.key}
            onClick={() => setTimeInForce(t.key)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-1.5 py-1 transition-all ${
              timeInForce === t.key
                ? 'border-[rgba(0,212,255,0.3)] bg-[rgba(0,212,255,0.06)]'
                : 'border-[var(--card-border)] bg-transparent hover:bg-[rgba(255,255,255,0.02)]'
            }`}
          >
            <span className={`font-mono text-[8px] font-bold ${timeInForce === t.key ? 'text-[var(--accent)]' : 'text-[var(--text3)]'}`}>
              {t.key}
            </span>
            <span className="text-[6px] text-[var(--muted)] hidden sm:inline">{t.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
