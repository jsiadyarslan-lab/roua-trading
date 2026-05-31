'use client'

import { useEffect } from 'react'

/**
 * PWA Registrar — Registers the Serwist Service Worker.
 * 
 * Serwist's withSerwist() plugin is supposed to auto-inject registration,
 * but it's not working with Next.js 16. So we register manually.
 */
export default function PWARegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[PWA] SW registered:', registration.scope)

        // Handle SW updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                // New SW activated — could show update notification
              }
            })
          }
        })
      })
      .catch((error) => {
        console.error('[PWA] SW registration failed:', error)
      })
  }, [])

  return null
}
