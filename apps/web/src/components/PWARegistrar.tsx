'use client'

import { useEffect } from 'react'

/**
 * PWA Registrar — Registers the Serwist-generated Service Worker.
 *
 * With @serwist/next, the SW is built automatically during `next build`.
 * We just need to register it on the client side.
 *
 * iOS Safari meta tags are in [locale]/layout.tsx <head> (server-rendered).
 */
export default function PWARegistrar() {
  useEffect(() => {
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
  }, [])

  return null
}
