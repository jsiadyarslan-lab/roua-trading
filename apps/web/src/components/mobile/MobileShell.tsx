'use client'

import { useState, useEffect } from 'react'
import MobileNavBar from './MobileNavBar'

/**
 * MOBILE SHELL (v5 Rebuild)
 *
 * Provides:
 * 1. The fixed .mobile-shell container
 * 2. .mobile-content area with padding-bottom for navbar
 * 3. .mobile-touch-barrier — transparent shield that blocks
 *    lightweight-charts' setPointerCapture() from stealing
 *    touches meant for the navbar
 * 4. Service Worker update banner
 * 5. Toast overlay area
 */
export default function MobileShell({ children }: { children: React.ReactNode }) {
  const [swUpdate, setSwUpdate] = useState(false)
  const [swWaiting, setSwWaiting] = useState<ServiceWorker | null>(null)

  // Listen for Service Worker updates
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return

    const handleUpdate = () => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          setSwWaiting(reg.waiting)
          setSwUpdate(true)
        }
      })
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // New SW took control — reload to get fresh code
      window.location.reload()
    })

    // Check on mount
    handleUpdate()

    // Check periodically (every 30s)
    const interval = setInterval(handleUpdate, 30000)
    return () => clearInterval(interval)
  }, [])

  const applySWUpdate = () => {
    if (swWaiting) {
      swWaiting.postMessage({ type: 'SKIP_WAITING' })
    }
  }

  return (
    <div className="mobile-shell">
      {/* ═══ CONTENT AREA ═══
          padding-bottom: var(--roua-nav-total) reserves space
          so page content doesn't hide behind the fixed navbar.
      */}
      <div className="mobile-content">
        {children}
      </div>

      {/* ═══ TOUCH BARRIER ═══
          Transparent shield that sits between the chart canvas
          and the navbar. Catches ALL touch events in the navbar
          zone, preventing lightweight-charts from stealing them
          via setPointerCapture(). The navbar is ABOVE this
          (z-index:9999 > 9998) so navbar buttons still work.
      */}
      <div className="mobile-touch-barrier" />

      {/* ═══ NAVBAR ═══
          position:fixed, z-index:9999, isolation:isolate
          Touch barrier (9998) is BELOW navbar (9999)
          so navbar buttons receive touches first.
      */}
      <MobileNavBar />

      {/* ═══ SERVICE WORKER UPDATE BANNER ═══
          When a new version is available, show a banner
          that forces the SW to activate and reload.
      */}
      {swUpdate && (
        <div
          className="mobile-sw-update-banner"
          onClick={applySWUpdate}
        >
          تحديث متوفر — اضغط هنا للتحديث
        </div>
      )}
    </div>
  )
}
