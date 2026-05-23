'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePriceAlertStore } from '@/hooks/usePriceAlertStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'

/**
 * PriceAlertEngine — Invisible background component mounted in MarketProvider.
 * Checks all active alerts every time market prices update.
 */
export function PriceAlertEngine() {
  const t = useTranslations('dashboard.priceAlert')
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

        // Mark alert as triggered but keep it in the list so user can review
        // User can manually dismiss it from the alerts panel
      }
    }
  }, [globalQuotes, alerts, triggerAlert, addNotification])

  return null
}
