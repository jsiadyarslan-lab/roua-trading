'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useNotificationStore } from '@/hooks/useNotificationStore'

/**
 * PushNotificationManager — مكون خفي يدير إشعارات الجهاز
 * - يطلب إذن الإشعارات عند الحاجة
 * - يراقب حالة الإذن ويعيد طلبها إذا لزم الأمر
 * - يعمل على الجوال والدسكتوب
 * - يُضاف في الـ layout لكل من النسختين
 */
export default function PushNotificationManager() {
  const tn = useTranslations('notifications.push')
  const settings = useNotificationStore(s => s.settings)
  const updateSettings = useNotificationStore(s => s.updateSettings)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Monitor notification permission changes
  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || !('Notification' in window)) return

    const checkPermission = () => {
      const currentPermission = Notification.permission

      // If user revoked permission, update settings
      if (currentPermission === 'denied' && settings.browserNotifications) {
        updateSettings({ browserNotifications: false })
      }
    }

    // Check immediately
    checkPermission()

    // Check periodically (user might change permission in browser settings)
    const interval = setInterval(checkPermission, 30_000)

    return () => clearInterval(interval)
  }, [mounted, settings.browserNotifications, updateSettings])

  // Auto-request permission on first visit if settings say so
  // (deferred — only after user interaction to avoid browser blocking)
  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || !('Notification' in window)) return
    if (!settings.browserNotifications) return

    const permission = Notification.permission
    if (permission === 'granted' || permission === 'denied') return

    // Request permission on first user interaction (click/touch)
    // This is needed because browsers block auto-permission requests
    const requestOnInteraction = async () => {
      try {
        const result = await Notification.requestPermission()
        if (result === 'granted') {
          // Show welcome notification
          try {
            new Notification(tn('appName'), {
              body: tn('notificationsEnabled'),
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              dir: 'rtl',
              lang: 'ar',
              tag: 'roua-welcome',
              vibrate: [100],
            } as NotificationOptions)
          } catch {}
        } else if (result === 'denied') {
          updateSettings({ browserNotifications: false })
        }
      } catch {}

      // Remove listeners after first interaction
      window.removeEventListener('click', requestOnInteraction)
      window.removeEventListener('touchstart', requestOnInteraction)
    }

    window.addEventListener('click', requestOnInteraction, { once: true })
    window.addEventListener('touchstart', requestOnInteraction, { once: true })

    return () => {
      window.removeEventListener('click', requestOnInteraction)
      window.removeEventListener('touchstart', requestOnInteraction)
    }
  }, [mounted, settings.browserNotifications, updateSettings])

  // This component is invisible — it manages browser notifications in the background
  return null
}
