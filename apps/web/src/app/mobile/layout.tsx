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

/**
 * MOBILE LAYOUT — REBUILT FROM SCRATCH (v4)
 *
 * Architecture:
 * ┌─────────────────────────┐
 * │    <main> flex:1        │  ← All page content lives here
 * │    overflow: hidden     │     Chart fills with position:absolute;inset:0
 * │    position: relative   │     Scrollable pages use overflow-y:auto
 * │                         │
 * │                         │
 * ├─────────────────────────┤
 * │  <nav> height: 48px    │  ← Fixed 48px. NOTHING else.
 * │  flex-shrink: 0        │     No padding, no margin, no safe-area.
 * ├─────────────────────────┤
 * │  safe-area spacer       │  ← env(safe-area-inset-bottom) only
 * │  background: #0B0E14   │     Separated so it can't affect nav height
 * └─────────────────────────┘
 *
 * KEY PRINCIPLES:
 * 1. Navbar is EXACTLY 48px — no content-box surprise, no padding overflow
 * 2. Chart canvas in <main> CANNOT overlap navbar — flex boundary is hard
 * 3. Safe-area is a SEPARATE element — cannot inflate navbar height
 * 4. No z-index between main and nav — flex order handles stacking
 * 5. Navbar has touch-action:manipulation for instant touch response
 */
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

        {/* ═══ ROOT CONTAINER ═══ */}
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
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* ═══ CONTENT AREA ═══
              flex:1 takes ALL remaining space.
              minHeight:0 prevents flex from pushing navbar off screen.
              overflow:hidden prevents chart from bleeding into navbar area.
              position:relative for absolute children (chart pages).
          */}
          <main
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {children}
          </main>

          {/* ═══ NAVBAR ═══
              Fixed 48px height. flex-shrink:0 ensures it never shrinks.
              The flex boundary between <main> and <nav> is a HARD WALL.
              Chart canvas inside <main> CANNOT capture events in this area.
          */}
          <MobileNavBar />

          {/* ═══ SAFE AREA SPACER ═══
              SEPARATE element so it can NEVER inflate the navbar height.
              On iPhones with home indicator, this adds ~34px at the bottom.
              On devices without, env() returns 0 and this collapses.
          */}
          <div
            style={{
              flexShrink: 0,
              height: 'env(safe-area-inset-bottom, 0px)',
              background: '#0B0E14',
            }}
          />
        </div>
      </AuthGuard>
    </MarketProvider>
  )
}
