import { AppHeader } from '@/components/dashboard/AppHeader'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import { AuthInitializer } from '@/components/dashboard/AuthInitializer'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { GuestBanner } from '@/components/dashboard/GuestGuard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { GlobalLogicEngine } from '@/components/dashboard/GlobalLogicEngine'
import { NotificationToasts } from '@/components/dashboard/NotificationCenter'
import DesktopNotificationAdapter from '@/components/dashboard/DesktopNotificationAdapter'
import NotificationPermissionBanner from '@/components/shared/NotificationPermissionBanner'
import PushNotificationManager from '@/components/shared/PushNotificationManager'
import { Metadata, Viewport } from 'next'
import { DashboardLayoutStyles } from '@/components/dashboard/DashboardLayoutStyles'
import { setRequestLocale } from 'next-intl/server'
import { getDirection } from '@/lib/i18n-utils'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params
  const isAr = locale === 'ar'
  const isFr = locale === 'fr'
  const isTr = locale === 'tr'
  return {
    title: isAr ? 'رؤى | منصة ربط الحسابات الاحترافية' : isFr ? 'Roua | Plateforme professionnelle de liaison de comptes' : isTr ? 'Roua | Profesyonel Hesap Bağlama Platformu' : 'Roua | Professional Account Linking Platform',
    description: isAr
      ? 'منصة رؤى لربط ومتابعة الحسابات الذكية - Roua Account Linking Platform'
      : isFr
        ? 'Plateforme Roua pour la liaison et le suivi intelligents de comptes - analyses IA et signaux de trading'
        : isTr
          ? 'Roua akıllı hesap bağlama ve izleme platformu - AI analitikleri ve işlem sinyalleri'
          : 'Roua platform for linking and monitoring smart accounts - AI analytics and trading signals',
    manifest: '/manifest.json',
    applicationName: 'Roua Link',
    icons: {
      icon: [
        { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
        { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '192x192' },
        { url: '/icon-512.png', sizes: '512x512' },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'Roua Link',
    },
  }
}

export const viewport: Viewport = {
  themeColor: '#0B0E14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default async function DashboardLayout({
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
        <div style={{ minHeight: '100dvh', background: '#0B0E14', direction: dir, display: 'flex', flexDirection: 'column', overflowX: 'hidden' }}
          className="dashboard-root">
          <GuestBanner />
          {/* AppHeader مخفي على الجوال — m2-shell عنده header خاص */}
          <div className="hide-on-mobile">
            <AppHeader />
          </div>
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
            className="dashboard-main">
            <DashboardLayoutStyles />
            <ErrorBoundary>
              <AuthInitializer />
              <GlobalLogicEngine />
              <DesktopNotificationAdapter />
              <NotificationToasts />
              <NotificationPermissionBanner />
              <PushNotificationManager />
              {children}
            </ErrorBoundary>
          </main>
          {/* FIX: Dedicated portal container for dropdowns. Using document.body as portal
              target causes "Node cannot be found in the current page" errors when Next.js
              client-side navigation replaces the body. This dedicated div stays stable
              across navigations, so React can safely unmount portals. */}
          <div id="portal-root" />
        </div>
      </AuthGuard>
    </MarketProvider>
  )
}
