import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
        url: "/logo-512.png",
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
    images: ["/logo-512.png"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/logo-192.png" />
      </head>
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
