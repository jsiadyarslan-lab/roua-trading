import type { Metadata, Viewport } from 'next'
import MobileNavBar from '@/components/mobile/MobileNavBar'

export const metadata: Metadata = {
  title: 'رؤى للتداول — تطبيق الجوال',
  description: 'منصة رؤى لربط الحسابات',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex flex-col min-h-screen md:hidden"
      style={{
        background: '#000000', color: '#F0F2F5', maxWidth: 480, margin: '0 auto',
        paddingTop: 0,
        paddingBottom: 'env(safe-area-inset-bottom)',
        minHeight: '100dvh',
      }}
    >
      <main className="flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {children}
      </main>
      <MobileNavBar />
    </div>
  )
}
