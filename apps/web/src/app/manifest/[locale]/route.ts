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
  ar: { name: 'رؤى للتداول — مجلس الذكاء الاصطناعي', short_name: 'رؤى', description: 'أول منصة تداول في العالم بمجلس ذكاء اصطناعي استراتيجي — ثمانية وكلاء AI يتناقشون ويصلون إلى إجماع قبل أي صفقة', dir: 'rtl' },
  en: { name: 'Roua Trading — AI Strategic Council', short_name: 'Roua', description: 'The world\'s first AI Strategic Council Trading Platform — 8 AI agents debate, vote, and reach consensus before any trade', dir: 'ltr' },
  fr: { name: 'Roua Trading — Conseil IA stratégique', short_name: 'Roua', description: 'La première plateforme de trading au monde dotée d\'un Conseil IA stratégique — 8 agents IA débattent et atteignent un consensus avant chaque trade', dir: 'ltr' },
  tr: { name: 'Roua Trading — Stratejik AI Konseyi', short_name: 'Roua', description: 'Dünyanın ilk Stratejik AI Konseyi Ticaret Platformu — 8 AI ajanı her işlemden önce tartışır ve fikir birliğine varır', dir: 'ltr' },
  es: { name: 'Roua Trading — Consejo IA estratégico', short_name: 'Roua', description: 'La primera plataforma de trading con un Consejo IA estratégico — 8 agentes IA debaten y alcanzan consenso antes de cada operación', dir: 'ltr' },
  zh: { name: 'Roua Trading — AI战略委员会', short_name: 'Roua', description: '全球首个AI战略委员会交易平台 —— 8个AI代理在每笔交易前辩论并达成共识', dir: 'ltr' },
  ru: { name: 'Roua Trading — Стратегический ИИ-Совет', short_name: 'Roua', description: 'Первая торговая платформа со Стратегическим ИИ-Советом — 8 ИИ-агентов обсуждают и достигают консенсуса перед каждой сделкой', dir: 'ltr' },
  hi: { name: 'Roua Trading — एआई सामरिक परिषद', short_name: 'Roua', description: 'दुनिया का पहला एआई सामरिक परिषद ट्रेडिंग प्लेटफ़ॉर्म — 8 एआई एजेंट हर ट्रेड से पहले बहस कर आम सहमति पर पहुँचते हैं', dir: 'ltr' },
  pt: { name: 'Roua Trading — Conselho IA estratégico', short_name: 'Roua', description: 'A primeira plataforma de trading com Conselho IA estratégico — 8 agentes IA debatem e alcançam consenso antes de cada operação', dir: 'ltr' },
  de: { name: 'Roua Trading — Strategischer AI-Rat', short_name: 'Roua', description: 'Die weltweit erste Handelsplattform mit strategischem AI-Rat — 8 KI-Agenten debattieren und erreichen Konsens vor jedem Trade', dir: 'ltr' },
  ja: { name: 'Roua Trading — AI戦略評議会', short_name: 'Roua', description: '世界初のAI戦略評議会トレードプラットフォーム — 8人のAIエージェントが各取引前に議論し、コンセンサスに達します', dir: 'ltr' },
  ko: { name: 'Roua Trading — AI 전략 평의회', short_name: 'Roua', description: '세계 최초의 AI 전략 평의회 트레이딩 플랫폼 — 8개의 AI 에이전트가 각 거래 전에 토론하고 합의에 도달합니다', dir: 'ltr' },
  id: { name: 'Roua Trading — Dewan AI Strategis', short_name: 'Roua', description: 'Platform trading pertama di dunia dengan Dewan AI Strategis — 8 agen AI berdebat dan mencapai konsensus sebelum setiap transaksi', dir: 'ltr' },
  vi: { name: 'Roua Trading — Hội đồng AI chiến lược', short_name: 'Roua', description: 'Nền tảng giao dịch đầu tiên trên thế giới với Hội đồng AI chiến lược — 8 tác nhân AI tranh luận và đạt đồng thuận trước mỗi giao dịch', dir: 'ltr' },
  th: { name: 'Roua Trading — สภา AI เชิงกลยุทธ์', short_name: 'Roua', description: 'แพลตฟอร์มการเทรดแห่งแรกของโลกที่มีสภา AI เชิงกลยุทธ์ — 8 เอเจนต์ AI อภิปรายและบรรลุฉันทามติก่อนทุกการเทรด', dir: 'ltr' },
  it: { name: 'Roua Trading — Consiglio IA strategico', short_name: 'Roua', description: 'La prima piattaforma di trading con Consiglio IA strategico — 8 agenti IA discutono e raggiungono il consenso prima di ogni operazione', dir: 'ltr' },
  pl: { name: 'Roua Trading — Strategiczna Rada AI', short_name: 'Roua', description: 'Pierwsza platforma handlowa ze Strategiczną Radą AI — 8 agentów AI dyskutuje i osiąga konsensus przed każdą transakcją', dir: 'ltr' },
  nl: { name: 'Roua Trading — Strategische AI-Raad', short_name: 'Roua', description: 'Het eerste handelsplatform ter wereld met een Strategische AI-Raad — 8 AI-agenten debatteren en bereiken consensus vóór elke handel', dir: 'ltr' },
  ms: { name: 'Roua Trading — Majlis AI Strategik', short_name: 'Roua', description: 'Platform dagang pertama di dunia dengan Majlis AI Strategik — 8 ejen AI berdebat dan mencapai konsensus sebelum setiap transaksi', dir: 'ltr' },
  he: { name: 'Roua Trading — מועצת AI אסטרטגית', short_name: 'Roua', description: 'פלטפורמת המסחר הראשונה בעולם עם מועצת AI אסטרטגית — 8 סוכני AI דנים ומגיעים לקונצנזוס לפני כל עסקה', dir: 'rtl' },
  sv: { name: 'Roua Trading — Strategiskt AI-råd', short_name: 'Roua', description: 'Världens första handelsplattform med strategiskt AI-råd — 8 AI-agenter debatterar och når konsensus före varje affär', dir: 'ltr' },
  uk: { name: 'Roua Trading — Стратегічна Рада ШІ', short_name: 'Roua', description: 'Перша торгова платформа зі Стратегічною Радою ШІ — 8 ШІ-агентів обговорюють і досягають консенсусу перед кожною угодою', dir: 'ltr' },
  fa: { name: 'Roua Trading — شورای استراتژیک AI', short_name: 'Roua', description: 'اولین پلتفرم معاملاتی جهان با شورای استراتژیک AI — 8 عامل AI بحث کرده و قبل از هر معامله به اجماع می‌رسند', dir: 'rtl' },
  ur: { name: 'Roua Trading — اسٹریٹجک AI کونسل', short_name: 'Roua', description: 'دنیا کا پہلا اسٹریٹجک AI کونسل ٹریڈنگ پلیٹ فارم — 8 AI ایجنٹس ہر لین دین سے پہلے بحث کرتے ہیں اور اتفاق رائے تک پہنچتے ہیں', dir: 'rtl' },
  fil: { name: 'Roua Trading — Strategic AI Council', short_name: 'Roua', description: 'Unang trading platform sa mundo na may Strategic AI Council — 8 AI agent ang nagdedebate at nagkakasundo bago bawat trade', dir: 'ltr' },
  da: { name: 'Roua Trading — Strategisk AI-råd', short_name: 'Roua', description: 'Verdens første handelsplatform med strategisk AI-råd — 8 AI-agenter debatterer og når konsensus før hver handel', dir: 'ltr' },
  no: { name: 'Roua Trading — Strategisk AI-råd', short_name: 'Roua', description: 'Verdens første handelsplattform med strategisk AI-råd — 8 AI-agenter debatterer og når konsensus før hver handel', dir: 'ltr' },
  fi: { name: 'Roua Trading — Strateginen AI-neuvosto', short_name: 'Roua', description: 'Maailman ensimmäinen kaupankäyntialusta strategisella AI-neuvostolla — 8 AI-agentia väittelee ja saavuttaa yksimielisyyden ennen jokaista kauppaa', dir: 'ltr' },
  cs: { name: 'Roua Trading — Strategická rada AI', short_name: 'Roua', description: 'První obchodní platforma se Strategickou radou AI — 8 AI agentů diskutuje a dosahuje konsenzu před každým obchodem', dir: 'ltr' },
  hu: { name: 'Roua Trading — Stratégiai AI-tanács', short_name: 'Roua', description: 'A világ első kereskedési platformja stratégiai AI-tanáccsal — 8 AI-ügynök vitat és konsenzusra jut minden kereskedelem előtt', dir: 'ltr' },
  ro: { name: 'Roua Trading — Consiliu AI strategic', short_name: 'Roua', description: 'Prima platformă de tranzacționare cu Consiliu AI strategic — 8 agenți AI dezbat și ajung la consens înainte de fiecare tranzacție', dir: 'ltr' },
  bn: { name: 'Roua Trading — কৌশলগত AI কাউন্সিল', short_name: 'Roua', description: 'বিশ্বের প্রথম কৌশলগত AI কাউন্সিল ট্রেডিং প্ল্যাটফর্ম — 8টি AI এজেন্ট প্রতিটি ট্রেডের আগে বিতর্ক করে এবং ঐকমত্যে পৌঁছায়', dir: 'ltr' },
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
