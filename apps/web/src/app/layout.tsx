import type { Metadata, Viewport } from "next";
import { Cairo, Noto_Naskh_Arabic, IBM_Plex_Sans_Arabic, Inter, JetBrains_Mono, Orbitron } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

/* ── Font Loading via next/font/google ──
 * Loads only the glyphs needed (Arabic subset) with zero layout shift.
 * CSS variables are set so existing font-family references resolve correctly.
 */
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const notoNaskhArabic = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  variable: "--font-noto-naskh",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  variable: "--font-ibm-plex-ar",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

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
  maximumScale: 5,
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
