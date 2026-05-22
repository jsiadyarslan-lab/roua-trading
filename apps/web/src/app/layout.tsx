import type { Metadata, Viewport } from "next";
// Google Fonts disabled at build time — loaded via CSS fallback
// Using preload:false + adjustFontFallback:false to avoid build-time fetch failures
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

/* ── Font Loading via next/font/google ──
 * Loads only the glyphs needed (Arabic subset) with zero layout shift.
 * CSS variables are set so existing font-family references resolve correctly.
 */
const cairo = { variable: "--font-cairo", className: "" };

const notoNaskhArabic = { variable: "--font-noto-naskh", className: "" };

const ibmPlexSansArabic = { variable: "--font-ibm-plex-ar", className: "" };

const inter = { variable: "--font-inter", className: "" };

const jetbrainsMono = { variable: "--font-jetbrains", className: "" };

const orbitron = { variable: "--font-orbitron", className: "" };

const fontVars = [
  cairo.variable,
  notoNaskhArabic.variable,
  ibmPlexSansArabic.variable,
  inter.variable,
  jetbrainsMono.variable,
  orbitron.variable,
].join(" ");

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://roua-trading-production.up.railway.app";

export const metadata: Metadata = {
  title: "رؤى | منصة ربط الحسابات الذكية",
  description:
    "منصة رؤى لربط ومتابعة الحسابات الذكية — تحليلات AI، إشارات تداول، ربط بورصات، ومحفظة استثمارية ذكية. Roua Trading Platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Roua",
  },
  applicationName: "Roua Link",
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: [
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192" },
      { url: "/icon-512.png", sizes: "512x512" },
    ],
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "رؤى | منصة ربط الحسابات الذكية",
    description:
      "منصة رؤى لربط ومتابعة الحسابات الذكية — تحليلات AI، إشارات تداول، ربط بورصات، ومحفظة استثمارية ذكية",
    url: SITE_URL,
    siteName: "رؤى — Roua Trading",
    locale: "ar_SA",
    type: "website",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "رؤى — Roua Trading",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "رؤى | منصة ربط الحسابات الذكية",
    description:
      "منصة رؤى لربط ومتابعة الحسابات الذكية — تحليلات AI، إشارات تداول، ربط بورصات",
    images: ["/icon-512.png"],
  },
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0B0E14",
};

import { GlobalStyleRegistry } from "@/components/GlobalStyleRegistry";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <body className={`${fontVars} antialiased`}>
        <GlobalStyleRegistry />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
