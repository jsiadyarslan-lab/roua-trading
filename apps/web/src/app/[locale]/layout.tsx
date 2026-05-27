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

// REMOVED: generateStaticParams() — was causing OOM on Railway during build.
// With 32 locales and 60+ pages, static generation required rendering
// 1,920+ pages at build time, exceeding Railway's memory limits.
// Pages are now dynamically rendered (first request → cached by CDN).
// This has zero impact on user experience — Next.js streams the page
// on first visit and subsequent visits are served from the route cache.
//
// If static generation is needed for SEO on specific pages, add
// generateStaticParams() to individual page.tsx files with a limited
// set of locales (e.g., ['ar', 'en', 'fr']).
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Title & description per locale
  const titles: Record<string, string> = {
    ar: "رؤى | منصة ربط الحسابات الذكية",
    en: "Roua | Smart Account Linking Platform",
    fr: "Roua | Plateforme intelligente de liaison de comptes",
    tr: "Roua | Akıllı Hesap Bağlama Platformu",
    es: "Roua | Plataforma inteligente de vinculación de cuentas",
    zh: "Roua | 智能账户关联平台",
    ru: "Roua | Платформа интеллектуального связывания счетов",
    hi: "Roua | स्मार्ट खाता लिंकिंग प्लेटफ़ॉर्म",
    pt: "Roua | Plataforma inteligente de vinculação de contas",
    de: "Roua | Intelligente Kontoverknüpfungsplattform",
    ja: "Roua | スマートアカウント連携プラットフォーム",
  };
  const descriptions: Record<string, string> = {
    ar: "منصة رؤى لربط ومتابعة الحسابات الذكية — تحليلات AI، إشارات تداول، ربط بورصات، ومحفظة استثمارية ذكية. Roua Trading Platform",
    en: "Roua platform for linking and monitoring smart accounts — AI analytics, trading signals, exchange linking, and smart investment portfolio",
    fr: "Plateforme Roua pour la liaison et le suivi intelligents de comptes — analyses IA, signaux de trading, liaison bourses, et portefeuille intelligent",
    tr: "Roua akıllı hesap bağlama ve izleme platformu — AI analitikleri, işlem sinyalleri, borsa bağlantısı ve akıllı yatırım portföyü",
    es: "Plataforma Roua para vinculación y seguimiento inteligente de cuentas — análisis IA, señales de trading, vinculación de exchanges y cartera de inversión inteligente",
    zh: "Roua智能账户关联与监控平台 — AI分析、交易信号、交易所关联及智能投资组合",
    ru: "Платформа Roua для интеллектуального связывания и мониторинга счетов — ИИ-аналитика, торговые сигналы, подключение бирж и умный инвестиционный портфель",
    hi: "Roua स्मार्ट खाता लिंकिंग और मॉनिटरिंग प्लेटफ़ॉर्म — AI एनालिटिक्स, ट्रेडिंग सिग्नल, एक्सचेंज लिंकिंग और स्मार्ट निवेश पोर्टफोलियो",
    pt: "Plataforma Roua para vinculação e monitoramento inteligente de contas — análises de IA, sinais de trading, vinculação de exchanges e carteira de investimento inteligente",
    de: "Roua-Plattform für intelligente Kontoverknüpfung und Überwachung — KI-Analysen, Handelssignale, Börsenverknüpfung und intelligentes Anlageportfolio",
    ja: "Rouaスマートアカウント連携・監視プラットフォーム — AI分析、トレードシグナル、取引所連携、スマート投資ポートフォリオ",
  };
  const ogLocales: Record<string, string> = {
    ar: "ar_SA", en: "en_US", fr: "fr_FR", tr: "tr_TR", es: "es_ES",
    zh: "zh_CN", ru: "ru_RU", hi: "hi_IN", pt: "pt_BR", de: "de_DE", ja: "ja_JP",
  };
  const title = titles[locale] || titles.en;
  const description = descriptions[locale] || descriptions.en;
  const siteName = locale === 'ar' ? "رؤى — Roua Trading" : "Roua Trading";
  const ogLocale = ogLocales[locale] || "en_US";

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
        'zh': '/zh',
        'ru': '/ru',
        'hi': '/hi',
        'pt': '/pt',
        'de': '/de',
        'ja': '/ja',
      },
    },
    openGraph: {
      title,
      description: description,
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
      description: description,
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
