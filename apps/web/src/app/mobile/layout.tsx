import type { Metadata, Viewport } from 'next'
import MobileNavBar from '@/components/mobile/MobileNavBar'
import MobileToastOverlay from '@/components/mobile/MobileToastOverlay'
import MobileNotificationAdapter from '@/components/mobile/MobileNotificationAdapter'
import NotificationPermissionBanner from '@/components/shared/NotificationPermissionBanner'
import PushNotificationManager from '@/components/shared/PushNotificationManager'
import ServiceWorkerRegistrar from '@/components/dashboard/ServiceWorkerRegistrar'
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { MarketProvider } from '@/components/dashboard/MarketProvider'
import ViewportHeightSetter from '@/components/mobile/ViewportHeightSetter'

export const metadata: Metadata = {
  title: 'رؤى للتداول — تطبيق الجوال',
  description: 'منصة رؤى لربط الحسابات',
  manifest: '/manifest.json',
  applicationName: 'رؤى للتداول',
  icons: {
    icon: [
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icon-192.png', sizes: '192x192' },
      { url: '/icon-512.png', sizes: '512x512' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'رؤى للتداول',
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <AuthGuard>
        <ViewportHeightSetter />
        <ServiceWorkerRegistrar />
        <MobileNotificationAdapter />
        <MobileToastOverlay />
        <NotificationPermissionBanner />
        <PushNotificationManager />
        {/*
          ═══════════════════════════════════════════════════════════
          RADICAL REDESIGN v3: Flexbox column layout

          Previous attempts:
          - v1: position:absolute + z-index → chart stole touch events
          - v2: CSS Grid → never reached production (Docker cache)

          v3 approach: Simple Flexbox column.
          - Container: 100dvh flex column
          - <main>: flex:1 (takes remaining space)
          - <nav>: flex-shrink:0 (fixed at bottom)

          The flex boundary between main and nav is a HARD WALL.
          Chart canvas inside <main> CANNOT capture touch events
          in the <nav> area because they're in separate flex items.
          No z-index, no position:absolute, no hacks.
          ═══════════════════════════════════════════════════════════
        */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#0B0E14',
            color: '#F0F2F5',
            maxWidth: 480,
            width: '100%',
            margin: '0 auto',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          } as React.CSSProperties}
        >
          {/*
            <main>: flex:1 takes all remaining space above the navbar.
            minHeight:0 prevents flex from expanding beyond the container.
            Chart pages fill this with position:absolute;inset:0.
            Scrollable pages use overflow-y:auto.
            NO paddingBottom needed — flex boundary is a hard wall.
          */}
          <main
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'contain',
            }}
          >
            {children}
          </main>
          {/*
            <MobileNavBar>: flex-shrink:0 means it NEVER shrinks.
            It's always at the bottom, exactly its natural height.
            The flex boundary is a HARD WALL — chart canvas in <main>
            CANNOT capture touch events here. Every tap → navbar.
          */}
          <MobileNavBar />
        </div>
      </AuthGuard>
    </MarketProvider>
  )
}
