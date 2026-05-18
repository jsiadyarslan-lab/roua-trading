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
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            background: '#000000',
            color: '#F0F2F5',
            maxWidth: 480,
            width: '100%',
            margin: '0 auto',
            /* Use --app-height (set via JS window.innerHeight) as primary,
               fall back to 100dvh for SSR/before hydration */
            height: 'var(--app-height, 100dvh)',
            overflow: 'hidden',
          }}
        >
          {/* Scrollable content area — fills remaining space above the navbar spacer */}
          <main
            style={{
              position: 'relative',
              flex: '1 1 0%',
              /* CRITICAL: minHeight: 0 allows flexbox child to shrink below content
                 height, enabling proper overflow scrolling. Without this, the main
                 area expands to fit all content and never scrolls. */
              minHeight: 0,
              /* Padding at the bottom so the fixed MobileNavBar doesn't cover content.
                 Must match MobileNavBar height (56px + safe-area-inset-bottom) to
                 prevent the chart canvas from overlapping the NavBar touch zone. */
              paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'contain',
              width: '100%',
              zIndex: 1,
              isolation: 'isolate',
            }}
          >
            {children}
          </main>
          <MobileNavBar />
        </div>
      </AuthGuard>
    </MarketProvider>
  )
}
