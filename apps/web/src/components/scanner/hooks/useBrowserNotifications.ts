'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface AlertConfig {
  symbol: string
  type: 'RSI_OVERBOUGHT' | 'RSI_OVERSOLD' | 'MACD_CROSSOVER' | 'PRICE_ABOVE' | 'PRICE_BELOW'
  value?: number
  label: string
  labelAr: string
}

interface ActiveAlert {
  id: string
  config: AlertConfig
  createdAt: Date
  triggered: boolean
}

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [alerts, setAlerts] = useState<ActiveAlert[]>([])
  const triggeredRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result
    }
    return 'denied'
  }, [])

  const addAlert = useCallback((config: AlertConfig) => {
    const id = `${config.symbol}-${config.type}-${Date.now()}`
    setAlerts(prev => [...prev, { id, config, createdAt: new Date(), triggered: false }])
    return id
  }, [])

  const removeAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
    triggeredRef.current.delete(id)
  }, [])

  const checkAlerts = useCallback((symbol: string, data: {
    rsi?: number | null
    macdSignal?: string | null
    price?: number
  }) => {
    for (const alert of alerts) {
      if (alert.config.symbol !== symbol || alert.triggered) continue
      if (triggeredRef.current.has(alert.id)) continue

      let shouldTrigger = false

      switch (alert.config.type) {
        case 'RSI_OVERBOUGHT':
          shouldTrigger = (data.rsi ?? 0) >= (alert.config.value ?? 70)
          break
        case 'RSI_OVERSOLD':
          shouldTrigger = (data.rsi ?? 100) <= (alert.config.value ?? 30)
          break
        case 'MACD_CROSSOVER':
          shouldTrigger = data.macdSignal === 'BULLISH_CROSSOVER' || data.macdSignal === 'BEARISH_CROSSOVER'
          break
        case 'PRICE_ABOVE':
          shouldTrigger = (data.price ?? 0) >= (alert.config.value ?? 0)
          break
        case 'PRICE_BELOW':
          shouldTrigger = (data.price ?? Infinity) <= (alert.config.value ?? Infinity)
          break
      }

      if (shouldTrigger) {
        triggeredRef.current.add(alert.id)
        setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, triggered: true } : a))

        // Send browser notification
        if (permission === 'granted') {
          try {
            new Notification(`Roua — ${symbol}`, {
              body: alert.config.label || alert.config.labelAr,
              icon: '/favicon.ico',
              tag: alert.id,
            })
          } catch { /* ignore */ }
        }
      }
    }
  }, [alerts, permission])

  const hasAlertForSymbol = useCallback((symbol: string) => {
    return alerts.some(a => a.config.symbol === symbol)
  }, [alerts])

  return {
    permission,
    requestPermission,
    alerts,
    addAlert,
    removeAlert,
    checkAlerts,
    hasAlertForSymbol,
  }
}
