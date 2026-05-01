import { AppHeader } from '@/components/dashboard/AppHeader'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import { AuthInitializer } from '@/components/dashboard/AuthInitializer'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { GuestBanner } from '@/components/dashboard/GuestGuard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import ServiceWorkerRegistrar from '@/components/dashboard/ServiceWorkerRegistrar'
import { Metadata, Viewport } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'رؤى | منصة ربط الحسابات الاحترافية',
  description: 'منصة رؤى لربط ومتابعة الحسابات الذكية - Roua Account Linking Platform',
  manifest: '/manifest.json',
  applicationName: 'Roua Link',
  icons: {
    icon: '/logo.svg',
    apple: '/logo-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Roua Link',
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
      <AuthGuard>
        <div style={{ minHeight: '100vh', background: '#0B0E14', direction: 'rtl', display: 'flex', flexDirection: 'column' }}>
          <GuestBanner />
          <AppHeader />
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ErrorBoundary>
              <AuthInitializer />
              <ServiceWorkerRegistrar />
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </AuthGuard>
    </MarketProvider>
  )
}
