import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { getDirection } from '@/lib/i18n-utils';
import { Toaster } from "@/components/ui/toaster";
import { GlobalStyleRegistry } from "@/components/GlobalStyleRegistry";
import PWARegistrar from "@/components/PWARegistrar";
// V469: مساعد التداول الذكي — منقول بالكامل من مساعد رؤى المالي
import AssistantChatWidgetClient from "@/components/assistant/AssistantChatWidgetClient";

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

export const dynamic = 'force-dynamic';


export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B0E14',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
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
    // V267: Locale-aware manifest — each user gets a PWA manifest with their
    // own language's app name + dir attribute. Previously the hardcoded
    // /manifest.json showed Arabic app name for ALL users.
    manifest: `/manifest/${locale}/manifest.json`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: locale === 'ar' ? "رؤى" : "Roua",
    },
    applicationName: locale === 'ar' ? "رؤى" : "Roua",
    icons: {
      icon: [
        { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
        { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '192x192' },
        { url: '/icon-512.png', sizes: '512x512' },
      ],
    },
    alternates: {
      canonical: "/",
      // V267: Expanded from 11 to all 32 supported locales so every localized
      // URL gets proper hreflang signals for search engines. This was the
      // single biggest SEO gap — non-ar/en/fr/tr/es/zh/ru/hi/pt/de/ja pages
      // were missing from Google's index.
      //
      // Cast to `any` because Next.js's `Languages` type doesn't include all
      // ISO 639-1 codes (notably 'fil' for Filipino). This is a known limitation
      // of the type — the runtime accepts any valid BCP 47 language tag.
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
        'ko': '/ko',
        'id': '/id',
        'vi': '/vi',
        'th': '/th',
        'it': '/it',
        'pl': '/pl',
        'nl': '/nl',
        'ms': '/ms',
        'he': '/he',
        'sv': '/sv',
        'uk': '/uk',
        'fa': '/fa',
        'ur': '/ur',
        'fil': '/fil',
        'da': '/da',
        'no': '/no',
        'fi': '/fi',
        'cs': '/cs',
        'hu': '/hu',
        'ro': '/ro',
        'bn': '/bn',
      } as any,
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

  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = getDirection(locale);

  return (
    <html lang={locale} dir={dir} className="dark" suppressHydrationWarning>
      <head>
        {/* iOS PWA: Next.js 16 generates mobile-web-app-capable instead of
            apple-mobile-web-app-capable. We must add the correct one manually. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${fontVars} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <GlobalStyleRegistry />
          <PWARegistrar />
          {children}
          <Toaster />
          {/* V469: مساعد التداول الذكي العائم — متاح في كل الصفحات */}
          <AssistantChatWidgetClient />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
