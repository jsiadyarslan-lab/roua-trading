import type { Metadata, Viewport } from "next";
// Google Fonts disabled at build time — loaded via CSS fallback
// Using preload:false + adjustFontFallback:false to avoid build-time fetch failures
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const isFr = locale === 'fr';
  const isTr = locale === 'tr';

  // Title & description per locale
  const title = isAr
    ? "رؤى | منصة ربط الحسابات الذكية"
    : isFr
      ? "Roua | Plateforme intelligente de liaison de comptes"
      : isTr
        ? "Roua | Akıllı Hesap Bağlama Platformu"
        : "Roua | Smart Account Linking Platform";
  const description = isAr
    ? "منصة رؤى لربط ومتابعة الحسابات الذكية — تحليلات AI، إشارات تداول، ربط بورصات، ومحفظة استثمارية ذكية. Roua Trading Platform"
    : isFr
      ? "Plateforme Roua pour la liaison et le suivi intelligents de comptes — analyses IA, signaux de trading, liaison bourses, et portefeuille intelligent"
      : isTr
        ? "Roua akıllı hesap bağlama ve izleme platformu — AI analitikleri, işlem sinyalleri, borsa bağlantısı ve akıllı yatırım portföyü"
        : "Roua platform for linking and monitoring smart accounts — AI analytics, trading signals, exchange linking, and smart investment portfolio";
  const siteName = isAr ? "رؤى — Roua Trading" : "Roua Trading";
  const ogLocale = isAr ? "ar_SA" : isFr ? "fr_FR" : isTr ? "tr_TR" : "en_US";

  return {
    title,
    description,
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
      title,
      description: isAr
        ? "منصة رؤى لربط ومتابعة الحسابات الذكية — تحليلات AI، إشارات تداول، ربط بورصات، ومحفظة استثمارية ذكية"
        : isFr
          ? "Plateforme Roua pour la liaison et le suivi intelligents de comptes — analyses IA, signaux de trading et portefeuille intelligent"
          : "Roua platform for linking and monitoring smart accounts — AI analytics, trading signals, exchange linking, and smart investment portfolio",
      url: SITE_URL,
      siteName,
      locale: ogLocale,
      type: "website",
      images: [
        {
          url: "/icon-512.png",
          width: 512,
          height: 512,
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description: isAr
        ? "منصة رؤى لربط ومتابعة الحسابات الذكية — تحليلات AI، إشارات تداول، ربط بورصات"
        : isFr
          ? "Plateforme Roua — analyses IA, signaux de trading et liaison bourses"
          : "Roua platform for linking and monitoring smart accounts — AI analytics, trading signals, exchange linking",
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
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0B0E14",
};

import { GlobalStyleRegistry } from "@/components/GlobalStyleRegistry";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} className="dark" suppressHydrationWarning>
      <body className={`${fontVars} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <GlobalStyleRegistry />
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
