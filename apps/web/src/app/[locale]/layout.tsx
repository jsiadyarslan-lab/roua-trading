import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { getDirection } from '@/lib/i18n-utils';
import { Toaster } from "@/components/ui/toaster";
import { GlobalStyleRegistry } from "@/components/GlobalStyleRegistry";
import PWARegistrar from "@/components/PWARegistrar";

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
    ar: "رؤى | AI Strategic Council Trading Platform — منصة التداول بمجلس الذكاء الاصطناعي",
    en: "Roua | AI Strategic Council Trading Platform",
    fr: "Roua | AI Strategic Council Trading Platform — Plateforme de trading au Conseil IA",
    tr: "Roua | AI Strategic Council Trading Platform — Stratejik AI Konseyi",
    es: "Roua | AI Strategic Council Trading Platform — Consejo IA",
    zh: "Roua | AI Strategic Council Trading Platform — AI战略委员会",
    ru: "Roua | AI Strategic Council Trading Platform — Стратегический ИИ-Совет",
    hi: "Roua | AI Strategic Council Trading Platform — एआई सामरिक परिषद",
    pt: "Roua | AI Strategic Council Trading Platform — Conselho IA",
    de: "Roua | AI Strategic Council Trading Platform — Strategischer AI-Rat",
    ja: "Roua | AI Strategic Council Trading Platform — AI戦略評議会",
  };
  const descriptions: Record<string, string> = {
    ar: "رؤى للتداول — أول منصة تداول في العالم بمجلس ذكاء اصطناعي استراتيجي. ثمانية وكلاء AI يتناقشون ويصوتون ويصلون إلى إجماع قبل أي صفقة. AI Strategic Council Trading Platform",
    en: "Roua Trading — the world's first AI Strategic Council Trading Platform. Eight AI agents debate, vote, and reach consensus before any trade is taken.",
    fr: "Roua Trading — la première plateforme de trading au monde dotée d'un Conseil IA stratégique. Huit agents IA débattent, votent et atteignent un consensus avant toute transaction.",
    tr: "Roua Trading — dünyanın ilk Stratejik AI Konseyi Ticaret Platformu. Sekiz AI ajanı, herhangi bir işlem yapılmadan önce tartışır, oy verir ve fikir birliğine varır.",
    es: "Roua Trading — la primera plataforma de trading del mundo con un Consejo IA estratégico. Ocho agentes IA debaten, votan y alcanzan consenso antes de cualquier operación.",
    zh: "Roua Trading —— 全球首个AI战略委员会交易平台。八位AI代理在任何交易前辩论、投票并达成共识。",
    ru: "Roua Trading — первая в мире торговая платформа со Стратегическим ИИ-Советом. Восемь ИИ-агентов обсуждают, голосуют и достигают консенсуса перед каждой сделкой.",
    hi: "Roua Trading — दुनिया का पहला एआई सामरिक परिषद ट्रेडिंग प्लेटफ़ॉर्म। आठ एआई एजेंट किसी भी ट्रेड से पहले बहस करते हैं, मतदान करते हैं और आम सहमति पर पहुँचते हैं।",
    pt: "Roua Trading — a primeira plataforma de trading do mundo com um Conselho IA estratégico. Oito agentes IA debatem, votam e alcançam consenso antes de qualquer operação.",
    de: "Roua Trading — die weltweit erste Handelsplattform mit strategischem AI-Rat. Acht KI-Agenten debattieren, stimmen ab und erreichen Konsens, bevor ein Trade getätigt wird.",
    ja: "Roua Trading —— 世界初のAI戦略評議会トレードプラットフォーム。8人のAIエージェントが取引前に議論し、投票し、コンセンサスに達します。",
  };
  const ogLocales: Record<string, string> = {
    ar: "ar_SA", en: "en_US", fr: "fr_FR", tr: "tr_TR", es: "es_ES",
    zh: "zh_CN", ru: "ru_RU", hi: "hi_IN", pt: "pt_BR", de: "de_DE", ja: "ja_JP",
  };
  const title = titles[locale] || titles.en;
  const description = descriptions[locale] || descriptions.en;
  const siteName = locale === 'ar' ? "رؤى للتداول — AI Strategic Council" : "Roua Trading — AI Strategic Council";
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
      title: "Roua — AI Council",
    },
    applicationName: "Roua — AI Strategic Council",
    icons: {
      icon: [
        { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
        { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180' },
        { url: '/icon-192.png', sizes: '192x192' },
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
