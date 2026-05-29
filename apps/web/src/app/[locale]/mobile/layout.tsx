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
  const isAr = locale === 'ar'

  return (
    <MarketProvider>
      <AuthGuard>
        <ErrorBoundary>
          <AuthInitializer />
          <GlobalLogicEngine />
          <NotificationToasts />
          {/* m-shell: flex column، الناف بار في الأسفل بدون fixed */}
          <div
            className="m-shell"
            dir={dir}
            style={{
              fontFamily: isAr ? "'Cairo', sans-serif" : "'Inter', sans-serif",
              fontSize: isAr ? '15px' : '14px',
              letterSpacing: isAr ? '0.2px' : 'normal',
            }}
          >
            <main className="m-main">{children}</main>
            <BottomNav />
          </div>
        </ErrorBoundary>
      </AuthGuard>
    </MarketProvider>
  )
}
