import type { Metadata, Viewport } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import BottomNav from './BottomNav'
import '@/styles/mobile.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mobile')
  return { title: t('title') }
}

export const viewport: Viewport = {
  themeColor: '#000000', width: 'device-width', initialScale: 1,
  maximumScale: 1, userScalable: false, viewportFit: 'cover',
}

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
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
