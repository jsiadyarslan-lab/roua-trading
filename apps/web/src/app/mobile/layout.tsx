import type { Metadata, Viewport } from 'next'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import ServiceWorkerRegistrar from '@/components/dashboard/ServiceWorkerRegistrar'
import NotificationPermissionBanner from '@/components/shared/NotificationPermissionBanner'
import PushNotificationManager from '@/components/shared/PushNotificationManager'
import MobileNavBar from '@/components/mobile/MobileNavBar'
import './mobile.css'

export const metadata: Metadata = {
  title: 'رؤى — تطبيق الجوال',
  description: 'منصة رؤى لربط الحسابات',
  manifest: '/manifest.json',
  applicationName: 'رؤى',
  icons: { icon: [{ url: '/icon-192.png', type: 'image/png', sizes: '192x192' }, { url: '/icon-512.png', type: 'image/png', sizes: '512x512' }, { url: '/favicon.svg', type: 'image/svg+xml' }], apple: [{ url: '/icon-192.png', sizes: '192x192' }, { url: '/icon-512.png', sizes: '512x512' }] },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'رؤى' },
}
export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover' }

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <AuthGuard>
        <ServiceWorkerRegistrar />
        <NotificationPermissionBanner />
        <PushNotificationManager />
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
          <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(var(--m-nav-total, 60px) + 8px)' }}>
            {children}
          </main>
        </div>
        <MobileNavBar />
        {/* Portal container — same as dashboard layout. Using document.body as portal
            target causes "Node cannot be found in the current page" errors when Next.js
            client-side navigation replaces the body. This dedicated div stays stable. */}
        <div id="portal-root" />
      </AuthGuard>
    </MarketProvider>
  )
}
