'use client'

import { useMemo } from 'react'
import { NotificationEngine } from '@/components/dashboard/NotificationEngine'
import { useMarketStore } from '@/hooks/useMarketStore'

/**
 * MobileNotificationAdapter — يربط NotificationEngine بمتجر السوق
 * يحول quotes من Record (المتجر) إلى Map (ما يحتاجه NotificationEngine)
 */
export default function MobileNotificationAdapter() {
  const quotes = useMarketStore(s => s.quotes)

  const quotesMap = useMemo(() => {
    const map = new Map<string, any>()
    if (quotes) {
      Object.entries(quotes).forEach(([key, value]) => {
        map.set(key, value)
      })
    }
    return map
  }, [quotes])

  return <NotificationEngine quotes={quotesMap} />
}
