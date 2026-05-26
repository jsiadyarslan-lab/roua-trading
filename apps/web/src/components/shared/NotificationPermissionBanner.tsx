'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BellRing, X, Shield } from 'lucide-react'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useTranslations, useLocale } from 'next-intl'

/**
 * NotificationPermissionBanner — شعار يطلب إذن الإشعارات من المستخدم
 * يظهر مرة واحدة فقط عندما يكون الإذن "default" (لم يُحدد بعد)
 * يعمل على الجوال والدسكتوب
 */
export default function NotificationPermissionBanner() {
  const tn = useTranslations('notifications.push')
  const locale = useLocale()
  const [permission, setPermission] = useState<string>('default')
  const [dismissed, setDismissed] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const settings = useNotificationStore(s => s.settings)
  const updateSettings = useNotificationStore(s => s.updateSettings)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true)
      setPermission(Notification.permission)
    }
  }, [])

  // Don't show if not supported, already granted, denied, dismissed, or browser notifications disabled
  if (!isSupported || permission !== 'default' || dismissed || !settings.browserNotifications) {
    return null
  }

  const requestPermission = async () => {
    try {
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result === 'granted') {
        // Show a test notification
        try {
          new Notification(tn('appName'), {
            body: tn('notificationsEnabled'),
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            dir: locale === 'ar' ? 'rtl' : 'ltr',
            lang: locale,
            tag: 'roua-permission-test',
            vibrate: [100],
          } as NotificationOptions)
        } catch {}
      } else if (result === 'denied') {
        updateSettings({ browserNotifications: false })
      }
    } catch {
      // Permission request failed
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          left: 12,
          right: 12,
          zIndex: 10000,
          background: 'rgba(28,28,30,0.95)',
          backdropFilter: 'blur(40px) saturate(190%)',
          WebkitBackdropFilter: 'blur(40px) saturate(190%)',
          borderRadius: 18,
          padding: '14px 16px',
          border: '0.5px solid rgba(0,212,255,0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 0 0 0.5px rgba(0,212,255,0.1)',
          direction: 'inherit',
          fontFamily: "'Cairo', sans-serif",
        }}
      >
        {/* Accent line */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          borderRadius: '18px 18px 0 0',
          background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Icon */}
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: 'rgba(0,212,255,0.1)',
            border: '0.5px solid rgba(0,212,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BellRing size={20} color="#00D4FF" />
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 13, fontWeight: 800, color: '#F0F2F5',
              margin: 0, lineHeight: 1.4,
            }}>
              {tn('enableDeviceNotifications')}
            </p>
            <p style={{
              fontSize: 11, color: 'rgba(235,235,245,0.5)',
              margin: '2px 0 0 0', lineHeight: 1.4,
            }}>
              {tn('receiveAlertsInstantly')}
            </p>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            <button
              onClick={requestPermission}
              style={{
                background: 'rgba(0,212,255,0.15)',
                border: '0.5px solid rgba(0,212,255,0.35)',
                borderRadius: 10,
                color: '#00D4FF',
                padding: '6px 14px',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: "'Cairo', sans-serif",
                transition: 'all 0.2s',
              }}
            >
              {tn('enable')}
            </button>
            <button
              onClick={() => setDismissed(true)}
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={12} color="rgba(235,235,245,0.4)" />
            </button>
          </div>
        </div>

        {/* Security note */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          marginTop: 8, marginRight: 52,
        }}>
          <Shield size={10} color="rgba(235,235,245,0.3)" />
          <span style={{
            fontSize: 9, color: 'rgba(235,235,245,0.3)',
          }}>
            {tn('secureNote')}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
