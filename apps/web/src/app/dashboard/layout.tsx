import { AppHeader } from '@/components/dashboard/AppHeader'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import { Metadata, Viewport } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Roua Trading | المؤسسة الاحترافية',
  description: 'منصة التداول المؤسسية المتطورة',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Roua Trading',
  },
}

export const viewport: Viewport = {
  themeColor: '#04050C',
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
      <div style={{ minHeight: '100vh', background: '#04050C', direction: 'rtl', display: 'flex', flexDirection: 'column' }}>
        <AppHeader />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {children}
        </main>
      </div>
    </MarketProvider>
  )
}

