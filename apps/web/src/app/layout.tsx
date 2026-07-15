import type { Metadata, Viewport } from "next"
import "./globals.css";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Root Layout — Minimal pass-through
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// With next-intl and the [locale] route segment, the root layout
// must NOT render <html>/<body> — that's handled by [locale]/layout.tsx
// so that lang and dir attributes can be set per-locale.
// Next.js 14.1+ supports this pass-through pattern.
//
// PWA NOTE: manifest, icons, appleWebApp are ALL defined in
// [locale]/layout.tsx generateMetadata(). DO NOT duplicate them here
// — duplicate manifest links and apple-touch-icons break PWA
// installability in Chrome.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://roua-trading-production.up.railway.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // V469-a11y: removed maximumScale=1 + userScalable=false (was violating
  // WCAG 2.1 SC 1.4.4). Users must be able to zoom the page on iOS/Android.
  viewportFit: "cover",
  themeColor: '#0B0E14',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
