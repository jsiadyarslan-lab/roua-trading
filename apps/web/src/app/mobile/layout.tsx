import type { Metadata, Viewport } from 'next'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import BottomNav from './BottomNav'
import '@/styles/mobile.css'

export const metadata: Metadata = { title: 'رؤى — جوال' }
export const viewport: Viewport = {
  themeColor: '#000000', width: 'device-width', initialScale: 1,
  maximumScale: 1, userScalable: false, viewportFit: 'cover',
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <AuthGuard>
        <div className="m-shell">
          <main className="m-main">{children}</main>
        </div>
        <BottomNav />
      </AuthGuard>
    </MarketProvider>
  )
}
