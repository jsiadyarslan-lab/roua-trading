'use client'

import { useEffect, useRef } from 'react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePriceAlertStore } from '@/hooks/usePriceAlertStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'

/**
 * PriceAlertEngine — Invisible background component mounted in MarketProvider.
 * Checks all active alerts every time market prices update.
 */
export function PriceAlertEngine() {
  const globalQuotes = useMarketStore(state => state.quotes)
  const { alerts, triggerAlert } = usePriceAlertStore()
  const { addNotification } = useNotificationStore()
  const lastChecked = useRef<Record<string, number>>({})

  useEffect(() => {
    const activeAlerts = alerts.filter(a => !a.triggered)
    if (activeAlerts.length === 0) return

    for (const alert of activeAlerts) {
      const q = globalQuotes[alert.symbol]
      if (!q || q.price === 0) continue

      // Throttle: only check each alert once per 3 seconds to avoid spam
      const now = Date.now()
      if (lastChecked.current[alert.id] && now - lastChecked.current[alert.id] < 3000) continue
      lastChecked.current[alert.id] = now

      let shouldTrigger = false

      switch (alert.condition) {
        case 'above':
          shouldTrigger = q.price >= alert.targetPrice
          break
        case 'below':
          shouldTrigger = q.price <= alert.targetPrice
          break
        case 'change_up':
          shouldTrigger = (q.changePercent ?? 0) >= alert.targetPrice
          break
        case 'change_down':
          shouldTrigger = (q.changePercent ?? 0) <= -Math.abs(alert.targetPrice)
          break
      }

      if (shouldTrigger) {
        triggerAlert(alert.id)
        addNotification({
          source: 'system',
          priority: 'urgent',
          action: alert.condition.startsWith('change_down') || alert.condition === 'below' ? 'SELL' : 'BUY',
          title: `🔔 تنبيه سعري: ${alert.symbol}`,
          body: alert.condition === 'above'
            ? `وصل ${alert.symbol} إلى $${q.price.toLocaleString()} — فوق الحد المحدد ($${alert.targetPrice})`
            : alert.condition === 'below'
            ? `وصل ${alert.symbol} إلى $${q.price.toLocaleString()} — تحت الحد المحدد ($${alert.targetPrice})`
            : alert.condition === 'change_up'
            ? `${alert.symbol} ارتفع ${q.changePercent?.toFixed(2)}% — تجاوز +${alert.targetPrice}%`
            : `${alert.symbol} انخفض ${q.changePercent?.toFixed(2)}% — تجاوز -${Math.abs(alert.targetPrice)}%`,
          pair: alert.symbol,
          price: q.price,
          confidence: 100,
        })

        // Auto-remove triggered alert from sidebar after 10 seconds to keep it clean
        setTimeout(() => {
          usePriceAlertStore.getState().removeAlert(alert.id)
        }, 10000)
      }
    }
  }, [globalQuotes, alerts, triggerAlert, addNotification])

  return null
}
