'use client'

import { useEffect } from 'react'

/**
 * PWA Registrar — Registers Service Worker + adds iOS-specific meta tags.
 * MUST be in the root [locale]/layout.tsx (not just dashboard) so the
 * SW is registered on the landing page, login, and everywhere else.
 *
 * iOS Safari requires:
 *  - <meta name="apple-mobile-web-app-capable" content="yes">
 *  - <link rel="apple-touch-icon" href="/icon-192.png">
 *  - HTTPS (Railway provides this)
 */
export default function PWARegistrar() {
  useEffect(() => {
    // ── 1. Register Service Worker ──
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('[PWA] Service Worker registered:', registration.scope)

          // Check for SW updates every 30 minutes
          setInterval(() => {
            registration.update().catch(() => {})
          }, 30 * 60 * 1000)
        })
        .catch((error) => {
          console.error('[PWA] Service Worker registration failed:', error)
        })
    }

    // ── 2. Add apple-mobile-web-app-capable meta tag (iOS PWA requirement) ──
    // Next.js sometimes doesn't generate this tag even with appleWebApp.capable: true
    // We add it manually to ensure iOS Safari recognizes this as a PWA.
    if (typeof document !== 'undefined') {
      const existingCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]')
      if (!existingCapable) {
        const meta = document.createElement('meta')
        meta.name = 'apple-mobile-web-app-capable'
        meta.content = 'yes'
        document.head.appendChild(meta)
      }

      // Also ensure apple-touch-icon exists for iOS home screen
      const existingTouchIcon = document.querySelector('link[rel="apple-touch-icon"]')
      if (!existingTouchIcon) {
        const link = document.createElement('link')
        link.rel = 'apple-touch-icon'
        link.href = '/pwa-icon-192.png'
        link.sizes = '192x192'
        document.head.appendChild(link)
      }
    }
  }, [])

  return null
}
