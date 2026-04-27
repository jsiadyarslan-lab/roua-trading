'use client'

import { useState, useEffect } from 'react'
import { Clock, X, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock size={11} className="text-[var(--accent)]" />
          <span className="text-[10px] font-extrabold text-[var(--accent)]">الأوامر النشطة</span>
          {orders.length > 0 && (
            <span className="rounded-full bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.2)] px-1.5 py-0.5 text-[7px] font-bold text-[var(--accent)]">
              {orders.length}
            </span>
          )}
        </div>
        <button
          onClick={onLoad}
          className="flex items-center gap-1 rounded border-none bg-transparent text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)] transition-colors"
        >
          <RefreshCw size={10} />
          <span className="text-[8px]">تحديث</span>
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-[var(--card-border)] bg-[rgba(255,255,255,0.02)] py-4 text-center">
          <Clock size={16} className="mx-auto mb-1 text-[var(--muted)] opacity-40" />
          <span className="text-[9px] text-[var(--muted)]">لا توجد أوامر نشطة</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
          {orders.map(order => {
            const isBuy = order.side === 'buy'
            return (
              <div
                key={order.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--card-border)] bg-[rgba(255,255,255,0.02)] px-2.5 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`shrink-0 ${isBuy ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {isBuy ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold text-[var(--foreground)] truncate">
                        {order.symbol}
                      </span>
                      <span className={`rounded px-1 py-0.5 text-[7px] font-bold ${
                        isBuy ? 'bg-[rgba(0,255,163,0.1)] text-[var(--success)]' : 'bg-[rgba(255,71,87,0.1)] text-[var(--danger)]'
                      }`}>
                        {isBuy ? 'شراء' : 'بيع'}
                      </span>
                      <span className="rounded bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.15)] px-1 py-0.5 text-[7px] font-bold text-[var(--accent)]">
                        {order.type === 'limit' ? 'معلق' : 'سوقي'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[8px] text-[var(--muted)]">
                        الكمية: {order.qty}
                      </span>
                      {order.limitPrice && (
                        <span className="font-mono text-[8px] text-[var(--accent)]">
                          السعر: ${parseFloat(order.limitPrice).toFixed(2)}
                        </span>
                      )}
                      {order.filledAvgPrice && (
                        <span className="font-mono text-[8px] text-[var(--success)]">
                          تنفيذ: ${parseFloat(order.filledAvgPrice).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleCancel(order.id)}
                  disabled={cancelling === order.id}
                  className="shrink-0 rounded-md border border-[rgba(255,71,87,0.2)] bg-[rgba(255,71,87,0.06)] p-1.5 text-[var(--danger)] cursor-pointer hover:bg-[rgba(255,71,87,0.12)] transition-colors disabled:opacity-50"
                  title="إلغاء الأمر"
                >
                  {cancelling === order.id ? (
                    <RefreshCw size={10} className="animate-spin" />
                  ) : (
                    <X size={10} />
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
