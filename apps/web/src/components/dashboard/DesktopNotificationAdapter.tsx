'use client'

import { useMemo } from 'react'
import { NotificationEngine } from '@/components/dashboard/NotificationEngine'
import { useMarketStore } from '@/hooks/useMarketStore'

/**
 * DesktopNotificationAdapter — يحول quotes Record إلى Map ويغذي NotificationEngine
 * يُستخدم في dashboard layout بدلاً من page.tsx ليعمل في كل الصفحات
 */
export default function DesktopNotificationAdapter() {
  const quotes = useMarketStore(s => s.quotes)
  const quotesMap = useMemo(() => {
    const map = new Map<string, any>()
    if (quotes) Object.entries(quotes).forEach(([key, value]) => { map.set(key, value) })
    return map
  }, [quotes])
  return <NotificationEngine quotes={quotesMap} />
}
