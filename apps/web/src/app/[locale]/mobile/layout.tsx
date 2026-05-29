import type { Metadata, Viewport } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { getDirection } from '@/lib/i18n-utils'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import { AuthInitializer } from '@/components/dashboard/AuthInitializer'
import { GlobalLogicEngine } from '@/components/dashboard/GlobalLogicEngine'
import { NotificationToasts } from '@/components/dashboard/NotificationCenter'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import BottomNav from './BottomNav'
import '@/styles/mobile.css'

export const metadata: Metadata = {
  title: 'رؤى',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'رؤى' },
}

export const viewport: Viewport = {
  themeColor: '#060A14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default async function MobileLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const dir = getDirection(locale)

  return (
    <MarketProvider>
      <AuthGuard>
        <ErrorBoundary>
          <AuthInitializer />
          <GlobalLogicEngine />
          <NotificationToasts />
          <div className="m-shell" style={{ direction: dir }}>
            <main className="m-main">{children}</main>
            <BottomNav />
          </div>
        </ErrorBoundary>
      </AuthGuard>
    </MarketProvider>
  )
}
