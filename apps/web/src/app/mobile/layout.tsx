import type { Metadata, Viewport } from 'next'
import MobileNavBar from '@/components/mobile/MobileNavBar'
import MobileToastOverlay from '@/components/mobile/MobileToastOverlay'
import MobileNotificationAdapter from '@/components/mobile/MobileNotificationAdapter'
import NotificationPermissionBanner from '@/components/shared/NotificationPermissionBanner'
import PushNotificationManager from '@/components/shared/PushNotificationManager'
import ServiceWorkerRegistrar from '@/components/dashboard/ServiceWorkerRegistrar'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import ViewportHeightSetter from '@/components/mobile/ViewportHeightSetter'

export const metadata: Metadata = {
  title: 'رؤى للتداول — تطبيق الجوال',
  description: 'منصة رؤى لربط الحسابات',
  manifest: '/manifest.json',
  applicationName: 'رؤى للتداول',
  icons: {
    icon: [
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icon-192.png', sizes: '192x192' },
      { url: '/icon-512.png', sizes: '512x512' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'رؤى للتداول',
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <AuthGuard>
        <ViewportHeightSetter />
        <ServiceWorkerRegistrar />
        <MobileNotificationAdapter />
        <MobileToastOverlay />
        <NotificationPermissionBanner />
        <PushNotificationManager />
        {/* ═══════════════════════════════════════════════════════════
            RADICAL REDESIGN: CSS Grid instead of position:absolute

            Previous architecture: everything was position:absolute with
            z-index stacking → chart canvas captured touch events in navbar
            area via lightweight-charts setPointerCapture().

            New architecture: CSS Grid with 2 rows:
              Row 1 (1fr): <main> content — chart, scrollable pages
              Row 2 (auto): <MobileNavBar> — always at bottom

            Grid rows are HARD BOUNDARIES. The chart canvas in Row 1
            CANNOT capture touch events in Row 2. No z-index tricks,
            no protection shields, no pointer-event hacks needed.
            ═══════════════════════════════════════════════════════════ */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#0B0E14',
            color: '#F0F2F5',
            maxWidth: 480,
            width: '100%',
            margin: '0 auto',
            overflow: 'hidden',
            display: 'grid',
            gridTemplateRows: '1fr auto',
          } as React.CSSProperties}
        >
          {/* Row 1: Content area — fills remaining space above navbar.
              Chart pages use position:absolute;inset:0 to fill this cell.
              Scrollable pages use overflow-y:auto for scrolling.
              No paddingBottom needed — grid row is a hard boundary. */}
          <main
            style={{
              position: 'relative',
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'contain',
            }}
          >
            {children}
          </main>
          {/* Row 2: Navbar — in its own grid row.
              The grid boundary is a HARD WALL that no chart canvas
              can cross. Touch events here ALWAYS go to the navbar. */}
          <MobileNavBar />
        </div>
      </AuthGuard>
    </MarketProvider>
  )
}
