'use client'

import { useEffect } from 'react'

/**
 * PWA Registrar — Registers Service Worker for PWA support.
 *
 * iOS Safari meta tags are now added SERVER-SIDE in [locale]/layout.tsx <head>
 * to ensure they're present in the initial HTML response (not injected by JS).
 *
 * This component only handles:
 * 1. Service Worker registration
 * 2. Periodic SW update checks
 */
export default function PWARegistrar() {
  useEffect(() => {
    // ── Register Service Worker ──
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
