'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().then(
            (success) => console.log('SW unregistered:', success),
            (error) => console.log('SW unregistration failed:', error)
          )
        }
      })
    }
  }, [])

  return null
}
