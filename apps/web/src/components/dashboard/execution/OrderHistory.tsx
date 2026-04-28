'use client'

import { useState } from 'react'
import { X, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import type { OpenOrder } from './hooks/useExecutionEngine'

interface OrderHistoryProps {
  orders: OpenOrder[]
  onCancel: (orderId: string) => void
  onLoad: () => void
}

export function OrderHistory({ orders, onCancel, onLoad }: OrderHistoryProps) {
  const [cancelling, setCancelling] = useState<string | null>(null)

  const handleCancel = async (orderId: string) => {
    setCancelling(orderId)
    await onCancel(orderId)
    setCancelling(null)
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Header — ultra compact */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-bold text-[var(--muted)]">
            {orders.length > 0 ? `${orders.length} نشط` : 'لا أوامر'}
          </span>
        </div>
        <button
          onClick={onLoad}
          className="flex items-center border-none bg-transparent text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)] transition-colors p-0"
        >
          <RefreshCw size={8} />
        </button>
      </div>

      {orders.length > 0 && (
        <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
          {orders.map(order => {
            const isBuy = order.side === 'buy'
            return (
              <div
                key={order.id}
                className="flex items-center justify-between gap-1 rounded border border-[var(--card-border)] bg-[rgba(255,255,255,0.02)] px-1.5 py-1"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`shrink-0 ${isBuy ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {isBuy ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                  </span>
                  <span className="font-mono text-[8px] font-bold text-[var(--foreground)] truncate">
                    {order.symbol}
                  </span>
                  <span className={`text-[6px] font-bold ${isBuy ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {isBuy ? 'ش' : 'ب'}
                  </span>
                  <span className="font-mono text-[7px] text-[var(--muted)]">
                    ×{order.qty}
                  </span>
                  {order.limitPrice && (
                    <span className="font-mono text-[7px] text-[var(--accent)]">
                      ${parseFloat(order.limitPrice).toFixed(2)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleCancel(order.id)}
                  disabled={cancelling === order.id}
                  className="shrink-0 border border-[rgba(255,71,87,0.2)] bg-[rgba(255,71,87,0.06)] rounded p-0.5 text-[var(--danger)] cursor-pointer hover:bg-[rgba(255,71,87,0.12)] transition-colors disabled:opacity-50"
                >
                  {cancelling === order.id ? (
                    <RefreshCw size={7} className="animate-spin" />
                  ) : (
                    <X size={7} />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
