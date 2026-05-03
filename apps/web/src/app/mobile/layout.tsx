import type { Metadata, Viewport } from 'next'
import MobileNavBar from '@/components/mobile/MobileNavBar'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { MarketProvider } from '@/components/dashboard/MarketProvider'

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
    <MarketProvider>
      <AuthGuard>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            background: '#000000',
            color: '#F0F2F5',
            maxWidth: 480,
            width: '100%',
            margin: '0 auto',
            /* FIXED height instead of minHeight — prevents pages from
               expanding beyond the viewport and getting cut off */
            height: '100dvh',
            overflow: 'hidden',
          }}
        >
          {/* Scrollable content area — fills remaining space above the navbar spacer */}
          <main
            style={{
              position: 'relative',
              flex: '1 1 0%',
              /* CRITICAL: minHeight: 0 allows flexbox child to shrink below content
                 height, enabling proper overflow scrolling. Without this, the main
                 area expands to fit all content and never scrolls. */
              minHeight: 0,
              /* Padding at the bottom so the fixed MobileNavBar doesn't cover content.
                 Pages with their own fixed bottom bar (chart, trading) add extra
                 padding via their own styles. */
              paddingBottom: 'calc(68px + env(safe-area-inset-bottom))',
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'contain',
              width: '100%',
            }}
          >
            {children}
          </main>
          <MobileNavBar />
        </div>
      </AuthGuard>
    </MarketProvider>
  )
}
