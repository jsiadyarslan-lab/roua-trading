import type { Metadata } from 'next'
import MobileNavBar from '@/components/mobile/MobileNavBar'

export const metadata: Metadata = {
  title: 'Roua Trading — تطبيق الجوال',
  description: 'منصة رؤى لربط الحسابات',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex flex-col min-h-screen block sm:hidden"
      style={{
        background: '#000000', color: '#F0F2F5', maxWidth: 430, margin: '0 auto',
        paddingTop: 0, // Pages will handle content padding below safe area
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <main className="flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {children}
      </main>
      <MobileNavBar />
    </div>
  )
}
