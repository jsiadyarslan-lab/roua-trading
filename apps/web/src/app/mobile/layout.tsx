import type { Metadata, Viewport } from 'next'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import ServiceWorkerRegistrar from '@/components/dashboard/ServiceWorkerRegistrar'
import NotificationPermissionBanner from '@/components/shared/NotificationPermissionBanner'
import PushNotificationManager from '@/components/shared/PushNotificationManager'
import MobileNavBar from '@/components/mobile/MobileNavBar'
import MobileShell from '@/components/mobile/MobileShell'
import './mobile.css'

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
        <ServiceWorkerRegistrar />
        <NotificationPermissionBanner />
        <PushNotificationManager />
        <MobileShell>
          {children}
        </MobileShell>
      </AuthGuard>
    </MarketProvider>
  )
}
