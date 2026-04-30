import type { Metadata } from 'next'
import MobileNavBar from '@/components/mobile/MobileNavBar'

export const metadata: Metadata = {
  title: 'Roua Trading — تطبيق الجوال',
  description: 'منصة رؤى للتداول الذكي',
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
        background: '#0B0E14', color: '#F0F2F5', maxWidth: 430, margin: '0 auto',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <main className="flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingBottom: 80 }}>
        {children}
      </main>
      <MobileNavBar />
    </div>
  )
}
