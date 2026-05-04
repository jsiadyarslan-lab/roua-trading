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
    icon: '/logo.svg',
    apple: '/logo-192.png',
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
                 Pages with their own fixed bottom bar (chart, trading) add extra
                 padding via their own styles. */
              paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'contain',
              width: '100%',
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
