'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePriceAlertStore } from '@/hooks/usePriceAlertStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'

/**
 * PriceAlertEngine — Invisible background component mounted in MarketProvider.
 * Checks all active alerts every 5 seconds using useVisibleInterval.
 *
 * PERF: Previously used useEffect dependent on globalQuotes, which fired on every
 * WebSocket price update (sub-second). This caused the engine to iterate all active
 * alerts hundreds of times per minute even with per-alert throttling. Now uses
 * useVisibleInterval(5s) which:
 * 1. Only fires every 5 seconds regardless of how fast prices update
 * 2. Pauses when the tab is hidden (no wasted CPU)
 * 3. Reads store state imperatively (no reactive re-renders)
 */
export function PriceAlertEngine() {
  const t = useTranslations('dashboard.priceAlert')
  const lastChecked = useRef<Record<string, number>>({})

  useVisibleInterval(() => {
    const { alerts, triggerAlert } = usePriceAlertStore.getState()
    const globalQuotes = useMarketStore.getState().quotes
    const { addNotification } = useNotificationStore.getState()

    const activeAlerts = alerts.filter(a => !a.triggered)
    if (activeAlerts.length === 0) return

    const now = Date.now()

    for (const alert of activeAlerts) {
      const q = globalQuotes[alert.symbol]
      if (!q || q.price === 0) continue

      // Throttle: only check each alert once per 5 seconds
      if (lastChecked.current[alert.id] && now - lastChecked.current[alert.id] < 5000) continue
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
          title: t('priceAlert', { symbol: alert.symbol }),
          body: alert.condition === 'above'
            ? t('reachedAbove', { symbol: alert.symbol, price: q.price.toLocaleString(), target: alert.targetPrice })
            : alert.condition === 'below'
            ? t('reachedBelow', { symbol: alert.symbol, price: q.price.toLocaleString(), target: alert.targetPrice })
            : alert.condition === 'change_up'
            ? t('changeUpAlert', { symbol: alert.symbol, change: q.changePercent?.toFixed(2), target: alert.targetPrice })
            : t('changeDownAlert', { symbol: alert.symbol, change: q.changePercent?.toFixed(2), target: Math.abs(alert.targetPrice) }),
          pair: alert.symbol,
          price: q.price,
          confidence: 100,
        })
      }
    }
  }, 5000)

  return null
}
