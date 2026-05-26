import type { Metadata, Viewport } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import BottomNav from './BottomNav'
import '@/styles/mobile.css'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'mobile' })
  return { title: t('title') }
}

export const viewport: Viewport = {
  themeColor: '#000000', width: 'device-width', initialScale: 1,
  maximumScale: 1, userScalable: false, viewportFit: 'cover',
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
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <MarketProvider>
      <AuthGuard>
        <div className="m-shell" style={{ direction: dir }}>
          <main className="m-main">{children}</main>
        </div>
        <BottomNav />
      </AuthGuard>
    </MarketProvider>
  )
}
