/**
 * V267: Locale-aware PWA manifest.
 *
 * Route: GET /manifest/[locale]/manifest.json
 *
 * Returns a Web App Manifest with `name`, `short_name`, `description`, `lang`,
 * and `dir` localized to the requested locale. This fixes the previous issue
 * where the hardcoded `/manifest.json` showed Arabic app name + RTL direction
 * for ALL users — a French user installing the PWA would see "رؤى للتداول"
 * in their phone's app launcher.
 *
 * The layout.tsx `manifest` metadata field points to `/manifest/${locale}/manifest.json`
 * so each user gets their own locale's manifest when installing the PWA.
 *
 * Fallback: unknown locales fall back to English (LTR, en-US).
 */
import { NextResponse } from 'next/server';

const MANIFESTS: Record<string, { name: string; short_name: string; description: string; dir: 'rtl' | 'ltr' }> = {
  ar: { name: 'رؤى للتداول', short_name: 'رؤى', description: 'منصة تداول ذكية بالذكاء الاصطناعي', dir: 'rtl' },
  en: { name: 'Roua Trading', short_name: 'Roua', description: 'AI-powered smart trading platform', dir: 'ltr' },
  fr: { name: 'Roua Trading', short_name: 'Roua', description: 'Plateforme de trading intelligente avec IA', dir: 'ltr' },
  tr: { name: 'Roua Trading', short_name: 'Roua', description: 'AI destekli akıllı işlem platformu', dir: 'ltr' },
  es: { name: 'Roua Trading', short_name: 'Roua', description: 'Plataforma de trading inteligente con IA', dir: 'ltr' },
  zh: { name: 'Roua Trading', short_name: 'Roua', description: 'AI驱动的智能交易平台', dir: 'ltr' },
  ru: { name: 'Roua Trading', short_name: 'Roua', description: 'Умная торговая платформа на базе ИИ', dir: 'ltr' },
  hi: { name: 'Roua Trading', short_name: 'Roua', description: 'एआई-संचालित स्मार्ट ट्रेडिंग प्लेटफ़ॉर्म', dir: 'ltr' },
  pt: { name: 'Roua Trading', short_name: 'Roua', description: 'Plataforma de trading inteligente com IA', dir: 'ltr' },
  de: { name: 'Roua Trading', short_name: 'Roua', description: 'KI-gestützte Smart-Trading-Plattform', dir: 'ltr' },
  ja: { name: 'Roua Trading', short_name: 'Roua', description: 'AI搭載スマートトレーディングプラットフォーム', dir: 'ltr' },
  ko: { name: 'Roua Trading', short_name: 'Roua', description: 'AI 기반 스마트 트레이딩 플랫폼', dir: 'ltr' },
  id: { name: 'Roua Trading', short_name: 'Roua', description: 'Platform trading cerdas bertenaga AI', dir: 'ltr' },
  vi: { name: 'Roua Trading', short_name: 'Roua', description: 'Nền tảng giao dịch thông minh bằng AI', dir: 'ltr' },
  th: { name: 'Roua Trading', short_name: 'Roua', description: 'แพลตฟอร์มการเทรดอัจฉริยะด้วย AI', dir: 'ltr' },
  it: { name: 'Roua Trading', short_name: 'Roua', description: 'Piattaforma di trading intelligente con IA', dir: 'ltr' },
  pl: { name: 'Roua Trading', short_name: 'Roua', description: 'Inteligentna platforma handlowa oparta na AI', dir: 'ltr' },
  nl: { name: 'Roua Trading', short_name: 'Roua', description: 'AI-aangedreven slim handelsplatform', dir: 'ltr' },
  ms: { name: 'Roua Trading', short_name: 'Roua', description: 'Platform dagang pintar dikuasakan AI', dir: 'ltr' },
  he: { name: 'Roua Trading', short_name: 'Roua', description: 'פלטפורמת מסחר חכמה מופעלת AI', dir: 'rtl' },
  sv: { name: 'Roua Trading', short_name: 'Roua', description: 'AI-driven smart handelsplattform', dir: 'ltr' },
  uk: { name: 'Roua Trading', short_name: 'Roua', description: 'Розумна торговельна платформа на базі ШІ', dir: 'ltr' },
  fa: { name: 'Roua Trading', short_name: 'Roua', description: 'پلتفرم معاملات هوشمند مبتنی بر هوش مصنوعی', dir: 'rtl' },
  ur: { name: 'Roua Trading', short_name: 'Roua', description: 'AI سے چلنے والا سمارٹ ٹریڈنگ پلیٹ فارم', dir: 'rtl' },
  fil: { name: 'Roua Trading', short_name: 'Roua', description: 'Matalinong platform ng kalakal na AI-powered', dir: 'ltr' },
  da: { name: 'Roua Trading', short_name: 'Roua', description: 'AI-drevet smart handelsplatform', dir: 'ltr' },
  no: { name: 'Roua Trading', short_name: 'Roua', description: 'AI-drevet smart handelsplattform', dir: 'ltr' },
  fi: { name: 'Roua Trading', short_name: 'Roua', description: 'Tekoälyohjattu älykäs kaupankäyntialusta', dir: 'ltr' },
  cs: { name: 'Roua Trading', short_name: 'Roua', description: 'Chytrá obchodní platforma poháněná AI', dir: 'ltr' },
  hu: { name: 'Roua Trading', short_name: 'Roua', description: 'AI-alapú okos kereskedési platform', dir: 'ltr' },
  ro: { name: 'Roua Trading', short_name: 'Roua', description: 'Platformă de tranzacționare inteligentă cu AI', dir: 'ltr' },
  bn: { name: 'Roua Trading', short_name: 'Roua', description: 'এআই-চালিত স্মার্ট ট্রেডিং প্ল্যাটফর্ম', dir: 'ltr' },
};

export async function generateStaticParams() {
  return Object.keys(MANIFESTS).map((locale) => ({ locale }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const manifest = MANIFESTS[locale] || MANIFESTS.en;

  const body = {
    name: manifest.name,
    short_name: manifest.short_name,
    description: manifest.description,
    start_url: '/pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#0B0E14',
    orientation: 'portrait',
    categories: ['finance', 'business'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    lang: locale,
    dir: manifest.dir,
    display_override: ['standalone', 'minimal-ui'],
  };

  return NextResponse.json(body, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
