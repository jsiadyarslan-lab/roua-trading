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
        {/* FIXED container — position:fixed;inset:0 guarantees the container
            fills the ENTIRE viewport regardless of body margins, parent styles,
            or --app-height calculation errors. This eliminates the navbar gap. */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            background: '#000000',
            color: '#F0F2F5',
            maxWidth: 480,
            width: '100%',
            margin: '0 auto',
            overflow: 'hidden',
          }}
        >
          {/* Content area — fills space above the navbar.
              minHeight:0 allows flex child to shrink so overflow scrolling works. */}
          <main
            style={{
              position: 'relative',
              flex: '1 1 0%',
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'contain',
              width: '100%',
              zIndex: 1,
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
