import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Toaster } from "@/components/ui/toaster";
import { GlobalStyleRegistry } from "@/components/GlobalStyleRegistry";

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

// Generate static params for all supported locales
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';
  const isFr = locale === 'fr';
  const isTr = locale === 'tr';
  const isEs = locale === 'es';

  // Title & description per locale
  const title = isAr
    ? "\u0631\u0624\u0649 | \u0645\u0646\u0635\u0629 \u0631\u0628\u0637 \u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a \u0627\u0644\u0630\u0643\u064a\u0629"
    : isFr
      ? "Roua | Plateforme intelligente de liaison de comptes"
      : isTr
        ? "Roua | Ak\u0131ll\u0131 Hesap Ba\u011flama Platformu"
        : isEs
          ? "Roua | Plataforma inteligente de vinculaci\u00f3n de cuentas"
          : "Roua | Smart Account Linking Platform";
  const description = isAr
    ? "\u0645\u0646\u0635\u0629 \u0631\u0624\u0649 \u0644\u0631\u0628\u0637 \u0648\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a \u0627\u0644\u0630\u0643\u064a\u0629 \u2014 \u062a\u062d\u0644\u064a\u0644\u0627\u062a AI\u060c \u0625\u0634\u0627\u0631\u0627\u062a \u062a\u062f\u0627\u0648\u0644\u060c \u0631\u0628\u0637 \u0628\u0648\u0631\u0635\u0627\u062a\u060c \u0648\u0645\u062d\u0641\u0638\u0629 \u0627\u0633\u062a\u062b\u0645\u0627\u0631\u064a\u0629 \u0630\u0643\u064a\u0629. Roua Trading Platform"
    : isFr
      ? "Plateforme Roua pour la liaison et le suivi intelligents de comptes \u2014 analyses IA, signaux de trading, liaison bourses, et portefeuille intelligent"
      : isTr
        ? "Roua ak\u0131ll\u0131 hesap ba\u011flama ve izleme platformu \u2014 AI analitikleri, i\u015flem sinyalleri, borsa ba\u011flant\u0131s\u0131 ve ak\u0131ll\u0131 yat\u0131r\u0131m portf\u00f6y\u00fc"
        : isEs
          ? "Plataforma Roua para vinculaci\u00f3n y seguimiento inteligente de cuentas \u2014 an\u00e1lisis IA, se\u00f1ales de trading, vinculaci\u00f3n de exchanges y cartera de inversi\u00f3n inteligente"
          : "Roua platform for linking and monitoring smart accounts \u2014 AI analytics, trading signals, exchange linking, and smart investment portfolio";
  const siteName = isAr ? "\u0631\u0624\u0649 \u2014 Roua Trading" : "Roua Trading";
  const ogLocale = isAr ? "ar_SA" : isFr ? "fr_FR" : isTr ? "tr_TR" : isEs ? "es_ES" : "en_US";

  return {
    title,
    description,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Roua",
    },
    applicationName: "Roua Link",
    alternates: {
      canonical: "/",
      languages: {
        'ar': '/',
        'en': '/en',
        'fr': '/fr',
        'tr': '/tr',
        'es': '/es',
      },
    },
    openGraph: {
      title,
      description: isAr
        ? "\u0645\u0646\u0635\u0629 \u0631\u0624\u0649 \u0644\u0631\u0628\u0637 \u0648\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a \u0627\u0644\u0630\u0643\u064a\u0629 \u2014 \u062a\u062d\u0644\u064a\u0644\u0627\u062a AI\u060c \u0625\u0634\u0627\u0631\u0627\u062a \u062a\u062f\u0627\u0648\u0644\u060c \u0631\u0628\u0637 \u0628\u0648\u0631\u0635\u0627\u062a"
        : isFr
          ? "Plateforme Roua \u2014 analyses IA, signaux de trading et liaison bourses"
          : isEs
            ? "Plataforma Roua \u2014 an\u00e1lisis IA, se\u00f1ales de trading y vinculaci\u00f3n de exchanges"
            : "Roua platform for linking and monitoring smart accounts \u2014 AI analytics, trading signals, exchange linking",
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
        ? "\u0645\u0646\u0635\u0629 \u0631\u0624\u0649 \u0644\u0631\u0628\u0637 \u0648\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a \u0627\u0644\u0630\u0643\u064a\u0629 \u2014 \u062a\u062d\u0644\u064a\u0644\u0627\u062a AI\u060c \u0625\u0634\u0627\u0631\u0627\u062a \u062a\u062f\u0627\u0648\u0644\u060c \u0631\u0628\u0637 \u0628\u0648\u0631\u0635\u0627\u062a"
        : isFr
          ? "Plateforme Roua \u2014 analyses IA, signaux de trading et liaison bourses"
          : isEs
            ? "Plataforma Roua \u2014 an\u00e1lisis IA, se\u00f1ales de trading y vinculaci\u00f3n de exchanges"
            : "Roua platform for linking and monitoring smart accounts \u2014 AI analytics, trading signals, exchange linking",
      images: ["/icon-512.png"],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  // Validate that the incoming locale is supported
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  // Enable static rendering for this locale
  setRequestLocale(locale);

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
