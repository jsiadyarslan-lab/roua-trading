import { AppHeader } from '@/components/dashboard/AppHeader'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import { AuthInitializer } from '@/components/dashboard/AuthInitializer'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import ServiceWorkerRegistrar from '@/components/dashboard/ServiceWorkerRegistrar'
import { Metadata, Viewport } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'رؤى | منصة التداول الاحترافية',
  description: 'منصة رؤى للتداول الذكي - Roua Trading Platform',
  manifest: '/manifest.json',
  applicationName: 'Roua Trading',
  icons: {
    icon: '/logo.svg',
    apple: '/logo-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Roua Trading',
  },
}

export const viewport: Viewport = {
  themeColor: '#0B0E14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MarketProvider>
      <div style={{ minHeight: '100vh', background: '#0B0E14', direction: 'rtl', display: 'flex', flexDirection: 'column' }}>
        <AppHeader />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ErrorBoundary>
            <AuthInitializer />
            <ServiceWorkerRegistrar />
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </MarketProvider>
  )
}
