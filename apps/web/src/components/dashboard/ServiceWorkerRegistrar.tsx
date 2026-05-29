'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('✅ Service Worker registered:', registration.scope)

          // Check for updates every 30 minutes
          setInterval(() => {
            registration.update().catch(() => {})
          }, 30 * 60 * 1000)
        })
        .catch((error) => {
          console.error('❌ Service Worker registration failed:', error)
        })
    }
  }, [])

  return null
}
