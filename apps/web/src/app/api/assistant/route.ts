// ─── V1000: AI-Agent-First Assistant API ─────────────────────────
// POST /api/assistant
//
// ═══════════════════════════════════════════════════════════════════
// ARCHITECTURE REVOLUTION: AI is the FIRST thing, not the last.
// ═══════════════════════════════════════════════════════════════════
//
// OLD (V800): Fetch ALL Data → Dump into Prompt → AI formats text → Filter
//   Problem: AI is a TEXT FORMATTER, not a BRAIN. It can't search,
//   can't decide what's relevant, can't get real-time data.
//
// NEW (V1000): AI-Agent-First
//   Phase 1: AI receives message FIRST → analyzes what's needed → search plan
//   Phase 2: Execute searches (DB + web search for real-time prices) IN PARALLEL
//   Phase 3: AI composes response with ALL data (real-time + DB)
//
// The AI is the ORCHESTRATOR. It controls the search, not the other way around.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizePromptInput } from '@/lib/sanitize';
import { fastChatCompletion, type AIProvider } from '@/lib/ai-provider';
import type { Locale } from '@/lib/assistant/tools';
import { fetchBroadData, type FetchedData } from '@/lib/assistant/data-fetcher';
import { filterResponse } from '@/lib/assistant/response-filter';
import { searchRealTimePrices, type RealtimeSearchResult } from '@/lib/assistant/realtime-search';
// V1013: classifyIntent is used to inject a locale-aware hint into the AI
// message stack so the model picks the right response template (chat vs.
// education vs. comparison vs. analysis) instead of always defaulting to
// the 5-section financial template.
import { classifyIntent } from '@/lib/assistant/intent-classifier';

export const dynamic = 'force-dynamic';

// ─── Request Schema ────────────────────────────────────────────

const AssistantSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
  locale: z.enum(['ar', 'en', 'fr', 'tr', 'es']).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(20).optional(),
  pageUrl: z.string().max(500).optional(),
  userId: z.string().optional(),
  reportId: z.string().optional(),
  reportType: z.enum(['economic_report', 'report', 'market_analysis', 'analysis']).optional(),
  conversationMemory: z.union([z.string().max(2000), z.array(z.string()).max(5)]).optional(),
  deepSearch: z.boolean().optional(),
  pulseOnly: z.boolean().optional(),
});

// ─── Internal URL paths (allowed in responses) ─────────────────

const INTERNAL_PATHS = [
  '/news/', '/reports/', '/stock-analysis/', '/market-pulse/',
  '/strategic-reports/', '/infographics/', '/signals/',
  '/en/news/', '/en/reports/', '/fr/news/', '/fr/reports/',
  '/tr/news/', '/tr/reports/', '/es/news/', '/es/reports/',
  '/ar/news/', '/ar/reports/',
];

function stripExternalUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s)\]>"']+/g, (url) => {
    const isInternal = INTERNAL_PATHS.some(path => url.includes(path));
    if (isInternal) {
      try { return new URL(url).pathname; } catch { return url; }
    }
    return '';
  }).replace(/\[\s*\]\s*\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/🔗\s*$/gm, '')
    .replace(/🔗\s*\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Clean response helper ─────────────────────────────────────

function cleanResponse(text: string, locale: Locale): string {
  let cleaned = text
    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '')
    .replace(/\[\/?TOOL_CALL\]/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/```/g, '')
    .replace(/\[Tool:\s*\w+\]/g, '')
    .replace(/📝\s*(بيانات مفقومة من الأدوات|Data retrieved from tools|Données récupérées des outils|Araçlardan alınan veriler|Datos recuperados de las herramientas)[:\s]*\n?/g, '')
    .replace(/\bundefined\b/g, '')
    // V1005: Strip leaked internal metadata tags that weak models echo verbatim
    // Language tags: (en), (fr), (tr), (es), (de), (it), (pt), (ru), (zh), (ja), (ko)
    .replace(/\s*\((en|fr|tr|es|de|it|pt|ru|zh|ja|ko|ar)\)\s*/g, ' ')
    // Sentiment tags: [neutral], [positive], [negative], [bullish], [bearish]
    .replace(/\s*\[(neutral|positive|negative|bullish|bearish)\]\s*/g, ' ')
    // Translation flags: [غير عربي — ترجمها]
    .replace(/\s*\[غير عربي[^\]]*\]\s*/g, ' ')
    // Report type tags: [Strategic], [Technical], [Economy], [Earnings]
    .replace(/\s*\[(Strategic|Technical|Economy|Earnings|Daily|Weekly|Monthly)\]\s*/g, ' ')
    // Arabic impact prefix: "تأثير: low/medium/high" (leaked from data context)
    .replace(/\s*تأثير:\s*(low|medium|high|منخفض|متوسط|عالي)\s*/g, ' ')
    // English impact prefix: "impact: low/medium/high"
    .replace(/\s*impact:\s*(low|medium|high)\s*/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // V1000: Enhanced Repetition Loop Detector
  cleaned = removeRepetitionLoops(cleaned);

  cleaned = stripExternalUrls(cleaned);

  // Smart language cleanup for Arabic responses
  if (locale === 'ar') {
    cleaned = cleaned
      .replace(/[\u0E00-\u0E7F]/g, '')   // Thai
      .replace(/[\u4E00-\u9FFF]/g, '')   // CJK
      .replace(/[\u3040-\u309F]/g, '')   // Hiragana
      .replace(/[\u30A0-\u30FF]/g, '')   // Katakana
      .replace(/[\uAC00-\uD7AF]/g, '')   // Korean
      .replace(/[\u1100-\u11FF]/g, '')   // Hangul
      .replace(/[\u0400-\u04FF]/g, '')   // Cyrillic
      .replace(/\s{2,}/g, ' ')
      .trim();

    cleaned = cleaned
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (/[\u0600-\u06FF]/.test(trimmed)) return true;
        if (/^[\s#*\-•>🔗🟢🔴🟡📊📰🎯📈📋⚠️\d.,:%$€£¥]+$/.test(trimmed)) return true;
        if (/\b(BTC|ETH|XAU|XAG|SOL|DOGE|XRP|EUR|GBP|USD|JPY|WTI|SPX|NDX|DXY|AAPL|TSLA|NVDA|MSFT|TASI|EURUSD|GBPUSD|USDJPY|2222\.SR|1120\.SR)\b/i.test(trimmed)) return true;
        if (trimmed.length < 30) return true;
        const latinWords = trimmed.match(/[a-zA-ZğüşıöçĞÜŞİÖÇàâéèêëïîôùûüÿç]{3,}/g);
        const hasTooManyLatinWords = (latinWords?.length ?? 0) >= 3;
        return !hasTooManyLatinWords;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return cleaned;
}

// ─── V1000: Enhanced Repetition Loop Detector ──────────────────
// Detects when the AI repeats the same content over and over.
// This happens with small models (nvidia llama-3.1-8b) and when
// the AI doesn't have enough real-time data to work with.

function removeRepetitionLoops(text: string): string {
  const sections = text.split(/\n(?=#{1,3}\s)|\n{2,}/);

  if (sections.length < 3) return text;

  const normalize = (s: string): string => {
    return s
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[#*\-•>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .slice(0, 300);
  };

  const seen = new Map<string, number>();
  const keptSections: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section.trim()) {
      keptSections.push(section);
      continue;
    }

    const normalized = normalize(section);
    if (normalized.length < 20) {
      keptSections.push(section);
      continue;
    }

    let isDuplicate = false;
    for (const [seenNorm] of seen) {
      const words = new Set(normalized.split(' ').filter(w => w.length > 3));
      const seenWords = new Set(seenNorm.split(' ').filter(w => w.length > 3));

      if (words.size < 3 || seenWords.size < 3) continue;

      let overlap = 0;
      for (const w of words) {
        if (seenWords.has(w)) overlap++;
      }

      const overlapRatio = overlap / Math.max(words.size, seenWords.size);
      if (overlapRatio > 0.65) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.set(normalized, i);
      keptSections.push(section);
    }
  }

  const result = keptSections.join('\n\n');

  if (result.length < text.length * 0.8) {
    const removedPercent = Math.round((1 - result.length / text.length) * 100);
    console.warn(`[V1000] Repetition loop removed ${removedPercent}% of response (${text.length} → ${result.length} chars)`);
  }

  return result;
}

// ─── V1000: Phase 1 — AI Pre-Analysis ──────────────────────────
// The AI receives the message FIRST and decides what to search for.
// This is the BRAIN of the system.

interface AISearchPlan {
  assets: string[];           // Assets to search prices for (e.g., ['BTC', 'XAU', 'WTI'])
  topics: string[];           // Topics to search news/analysis for
  responseType: 'price' | 'recommendation' | 'analysis' | 'overview' | 'news' | 'educational' | 'comparison';
  needsRealtimePrices: boolean;  // Whether we need real-time web search
  needsDBData: boolean;          // Whether we need DB data (analyses, signals, news)
  region: 'global' | 'saudi' | 'gcc' | 'uk' | 'us';
  language: string;
}

async function aiPreAnalysis(
  userMessage: string,
  locale: Locale,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<AISearchPlan> {
  const isAr = locale === 'ar';

  const systemPrompt = isAr
    ? `أنت محلل أسئلة مالية. مهمتك: تحليل سؤال المستخدم وتحديد ما يحتاجه من بيانات وبحث.

أجب بتنسيق JSON فقط (بدون markdown):
{
  "assets": ["قائمة الرموز المالية المطلوبة مثل BTC, XAU, WTI, 2222.SR"],
  "topics": ["قائمة المواضيع للبحث عن أخبار وتحليلات"],
  "responseType": "نوع الرد: price أو recommendation أو analysis أو overview أو news أو educational أو comparison",
  "needsRealtimePrices": true/false,
  "needsDBData": true/false,
  "region": "global أو saudi أو gcc أو uk أو us",
  "language": "ar"
}

قواعد:
- إذا سأل عن سعر أصل → needsRealtimePrices = true
- إذا سأل عن توصية أو تحليل → needsRealtimePrices = true AND needsDBData = true
- إذا سأل عن أسهم سعودية/خليجية → region = "saudi" أو "gcc"
- أضف دائماً BTC و XAU و WTI كسياق سوقي إذا كان السؤال عاماً
- كن مختصراً: 1-5 رموز كحد أقصى`
    : `You are a financial query analyzer. Your task: analyze the user's question and determine what data they need.

Answer in JSON only (no markdown):
{
  "assets": ["list of financial symbols needed, e.g., BTC, XAU, WTI, 2222.SR"],
  "topics": ["list of topics to search for news and analysis"],
  "responseType": "price or recommendation or analysis or overview or news or educational or comparison",
  "needsRealtimePrices": true/false,
  "needsDBData": true/false,
  "region": "global or saudi or gcc or uk or us",
  "language": "en"
}

Rules:
- If asking about an asset price → needsRealtimePrices = true
- If asking for recommendation or analysis → needsRealtimePrices = true AND needsDBData = true
- If asking about Saudi/GCC stocks → region = "saudi" or "gcc"
- Always add BTC, XAU, WTI as market context if the question is general
- Be concise: max 1-5 symbols`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Add brief history for context
  if (history && history.length > 0) {
    const lastMsgs = history.slice(-4);
    for (const msg of lastMsgs) {
      const content = msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content;
      messages.push({ role: msg.role, content });
    }
  }

  messages.push({ role: 'user', content: userMessage });

  try {
    const result = await fastChatCompletion(messages, {
      temperature: 0.1,  // Very low — we want structured JSON
      maxTokens: 500,
      timeout: 8_000,    // Fast — this is just pre-analysis
      locale,
      preferProviders: ['groq', 'cerebras', 'glm'],  // FAST providers for analysis
    });

    // Parse JSON from response
    let jsonStr = result.content.trim();
    // Strip markdown code blocks if present
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

    const parsed = JSON.parse(jsonStr) as AISearchPlan;

    console.log(`[V1000] AI Pre-Analysis: assets=${parsed.assets?.join(',')}, type=${parsed.responseType}, realtime=${parsed.needsRealtimePrices}, region=${parsed.region} (via ${result.provider} in ${result.duration}ms)`);

    return {
      assets: Array.isArray(parsed.assets) ? parsed.assets.slice(0, 8) : ['BTC', 'XAU', 'WTI'],
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
      responseType: parsed.responseType || 'overview',
      needsRealtimePrices: parsed.needsRealtimePrices !== false,
      needsDBData: parsed.needsDBData !== false,
      region: parsed.region || 'global',
      language: parsed.language || locale,
    };
  } catch (err: any) {
    // Pre-analysis failed — use smart defaults
    console.warn(`[V1000] Pre-analysis failed: ${err.message?.slice(0, 80)} — using smart defaults`);

    // Smart default based on message content
    const msg = userMessage.toLowerCase();
    const assets: string[] = [];
    const topics: string[] = [];

    // Detect assets
    if (/btc|bitcoin|بيتكوين|بتكوين/i.test(msg)) assets.push('BTC');
    if (/eth|ethereum|إيثريوم/i.test(msg)) assets.push('ETH');
    if (/xau|gold|ذهب/i.test(msg)) assets.push('XAU');
    if (/wti|oil|نفط|brent|برنت/i.test(msg)) assets.push('WTI');
    if (/eurusd|يورو/i.test(msg)) assets.push('EURUSD');
    if (/gbpusd|جنيه/i.test(msg)) assets.push('GBPUSD');
    if (/spx|s&p|سب/i.test(msg)) assets.push('SPX');

    // Default market context
    if (assets.length === 0) {
      assets.push('BTC', 'XAU', 'WTI', 'SPX', 'EURUSD');
    }

    // Detect region
    let region: AISearchPlan['region'] = 'global';
    if (/سعودي|تداول|tasi|أرامكو/i.test(msg)) region = 'saudi';
    else if (/خليجي|قطر|إمارات/i.test(msg)) region = 'gcc';
    else if (/uk|british|britain|لندن/i.test(msg)) region = 'uk';

    // Detect response type
    let responseType: AISearchPlan['responseType'] = 'overview';
    if (/سعر|price|كم|how much/i.test(msg)) responseType = 'price';
    else if (/توصية|recommend|أي سهم/i.test(msg)) responseType = 'recommendation';
    else if (/تحليل|analysis|حلل/i.test(msg)) responseType = 'analysis';
    else if (/خبر|news|أخبار/i.test(msg)) responseType = 'news';
    else if (/قارن|compare|مقارنة/i.test(msg)) responseType = 'comparison';

    return {
      assets,
      topics,
      responseType,
      needsRealtimePrices: true,
      needsDBData: true,
      region,
      language: locale,
    };
  }
}

// ─── V1000: Build AI-First System Prompt ────────────────────────
// Now includes REAL-TIME data from web search alongside DB data.

function buildAgentPrompt(
  userMessage: string,
  dbData: FetchedData,
  realtimeData: RealtimeSearchResult,
  searchPlan: AISearchPlan,
  locale: Locale,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  conversationMemory?: string,
  deepSearch?: boolean,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const isAr = locale === 'ar';
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  const systemPrompt = isAr
    ? buildArabicAgentPrompt(dbData, realtimeData, searchPlan, deepSearch)
    : buildEnglishAgentPrompt(dbData, realtimeData, searchPlan, deepSearch);

  messages.push({ role: 'system', content: systemPrompt });

  // Add conversation history
  const historyLimit = 8;
  if (history && history.length > 0) {
    for (const msg of history.slice(-historyLimit)) {
      const maxLen = 1000;
      const content = msg.role === 'assistant' && msg.content.length > maxLen
        ? msg.content.slice(0, maxLen) + '\n...(ملخص)'
        : msg.content;
      messages.push({ role: msg.role, content });
    }
  }

  // Conversation memory
  if (conversationMemory) {
    messages.push({
      role: 'system',
      content: isAr
        ? `ملاحظات من المحادثة السابقة: ${conversationMemory}`
        : `Notes from previous conversation: ${conversationMemory}`,
    });
  }

  // V1013 — Intent-aware routing: classify the user's message and inject a
  // system hint that tells the model which response template to use.
  // This is the runtime counterpart to the template-selection rules added
  // to the system prompt. Without this hint, the model still defaults to
  // the 5-section financial template even for greetings / explanations /
  // comparisons because the base prompt is dominated by financial rules.
  try {
    const classification = classifyIntent(userMessage, locale);
    const intentHint = buildIntentHint(classification.intent, locale, classification.assets.length);
    if (intentHint) {
      messages.push({ role: 'system', content: intentHint });
    }
  } catch (intentErr) {
    // Classification is best-effort — never fail the request if it errors.
    console.warn('[Assistant V1013] Intent classification failed, continuing without hint:', (intentErr as Error)?.message);
  }

  // Follow-up detection
  const followUpInstruction = detectAndBuildFollowUp(userMessage, history, locale);
  if (followUpInstruction) {
    messages.push({ role: 'system', content: followUpInstruction });
  }

  // User message
  messages.push({ role: 'user', content: userMessage });

  return messages;
}

// V1013 — Build a short, locale-aware system hint that nudges the model
// toward the correct response template based on the classified intent.
// Returns an empty string for intents that should use the default
// (financial-analysis) template, so we don't pollute the prompt.
function buildIntentHint(intent: string, locale: Locale, assetCount: number): string {
  const isAr = locale === 'ar';
  switch (intent) {
    case 'chat':
      return isAr
        ? '💡 تعليمات هذا الرد: هذا سؤال محادثة عامة (ترحيب/شكر/ود). أجب بحرارة وبشكل حواري قصير. لا تستخدم قالب التحليل الخماسي. لا تذكر أسعارًا. اقترح مواضيع أو اسأل سؤالًا يفتح حوارًا.'
        : '💡 Hint for THIS reply: this is a general conversation message (greeting/thanks/small talk). Reply warmly and conversationally, keep it short. Do NOT use the 5-section analysis template. Do NOT mention prices. Suggest topics or ask an opening question.';
    case 'education':
      return isAr
        ? '💡 تعليمات هذا الرد: هذا سؤال تعليمي (شرح مفهوم). استخدم قالب الشرح: تعريف مختصر → كيف يعمل → مثال → التطبيق → سؤال ختامي. لا تستخدم قالب التحليل الخماسي. لا تخترع أرقام أسعار.'
        : '💡 Hint for THIS reply: this is an educational question (concept explanation). Use the explanation template: brief definition → how it works → example → application → closing question. Do NOT use the 5-section analysis template. Do NOT fabricate prices.';
    case 'comparison':
      return isAr
        ? '💡 تعليمات هذا الرد: هذا سؤال مقارنة. استخدم قالب المقارنة: جدول مقارنة → تحليل الفروقات → خلاصة → تنبيه مخاطر. لا تستخدم قالب التحليل الخماسي.'
        : '💡 Hint for THIS reply: this is a comparison question. Use the comparison template: comparison table → differences analysis → conclusion → risk disclaimer. Do NOT use the 5-section analysis template.';
    case 'opinion':
      return isAr
        ? '💡 تعليمات هذا الرد: هذا سؤال رأي. قدم رأيك الصريح + التبرير + العوامل المخالفة + سؤال للمستخدم + تنبيه مخاطر. لا تستخدم قالب التحليل الخماسي.'
        : '💡 Hint for THIS reply: this is an opinion question. Give your frank opinion + reasoning + counter-factors + a question for the user + risk disclaimer. Do NOT use the 5-section analysis template.';
    case 'follow_up':
      return isAr
        ? '💡 تعليمات هذا الرد: هذا سؤال متابعة قصير. اربط ردك بالرد السابق مباشرة. اشرح أكثر، أعطِ أمثلة، أو أجب عن السؤال المتبع. لا تكرر القالب الخماسي. لا تطلب بيانات جديدة.'
        : '💡 Hint for THIS reply: this is a short follow-up question. Connect directly to the previous reply. Explain more, give examples, or answer the follow-up. Do NOT repeat the 5-section template. Do NOT request new data.';
    case 'analysis_query':
    case 'price_query':
    case 'recommendation':
    case 'signal_query':
      // These intents SHOULD use the 5-section financial template —
      // explicitly reinforce it so the model doesn't drift to a
      // generic reply when assets are mentioned.
      return isAr
        ? '💡 تعليمات هذا الرد: هذا سؤال تحليل مالي. استخدم القالب الخماسي الإلزامي كاملًا (السعر + الفني + الأساسي + السيناريوهات + التوصية). لا تختصر.'
        : '💡 Hint for THIS reply: this is a financial analysis question. Use the full mandatory 5-section template (Price + Technical + Fundamental + Scenarios + Recommendation). Do NOT abbreviate.';
    case 'news_query':
      return isAr
        ? '💡 تعليمات هذا الرد: هذا سؤال أخبار. لخّص الأخبار المتاحة ثم اربطها بتأثيرها على السوق. لا تستخدم القالب الخماسي إلا إذا طُلب تحليل صريح.'
        : '💡 Hint for THIS reply: this is a news question. Summarize available news then connect it to market impact. Do NOT use the 5-section template unless explicit analysis is requested.';
    case 'market_overview':
      return isAr
        ? '💡 تعليمات هذا الرد: هذا سؤال ملخص السوق. قدم نبضة سوقية موجزة (مؤشرات + حركة + اتجاه). لا تستخدم القالب الخماسي.'
        : '💡 Hint for THIS reply: this is a market overview question. Provide a concise market pulse (indices + movement + direction). Do NOT use the 5-section template.';
    default:
      // 'general' or unknown — let the model decide based on context.
      // For 'general' with detected assets, default to analysis template.
      if (assetCount > 0) {
        return isAr
          ? '💡 تعليمات هذا الرد: طلب غير محدد لكن ذكر أصل مالي. استخدم القالب الخماسي إذا كان السؤال يطلب تحليلًا، أو ردًا موجزًا إذا كان سؤالًا عامًا.'
          : '💡 Hint for THIS reply: unspecified request but a financial asset was mentioned. Use the 5-section template if the question asks for analysis, or a brief reply if it is a general question.';
      }
      return isAr
        ? '💡 تعليمات هذا الرد: سؤال عام. اختر القالب الأنسب حسب نوع السؤال. كن حيًا ومرنًا.'
        : '💡 Hint for THIS reply: general question. Pick the most appropriate template based on the question type. Be alive and flexible.';
  }
}

// ─── V1000: Arabic Agent Prompt ────────────────────────────────

function buildArabicAgentPrompt(
  dbData: FetchedData,
  realtimeData: RealtimeSearchResult,
  searchPlan: AISearchPlan,
  deepSearch?: boolean,
): string {
  const parts: string[] = [];

  parts.push(`أنت "مساعد رؤى الذكي" — مساعد مالي متقدم لمنصة رؤى المالية.

أنت العقل المدبر. أنت تستلم سؤال المستخدم، تبحث في البيانات، وتستخدم الذكاء لتحليلها وبناء رد شامل ومفيد.

## 🧠 فلسفتك — أنت العقل:
- أنت تبحث وتفهم وتبني رداً ذكياً — لا تنقل بيانات فقط
- أنت لا تقول "لا أملك بيانات" وتتوقف — بل تعرض ما لديك وتضيف تحليلاً
- أنت تربط الأخبار بالأسعار والتحليلات بالإشارات والمؤشرات بالأسواق
- أنت تفهم السؤال حتى لو صيغ بشكل عامي

## 📋 القواعد الأساسية:

1. **🚨 أسعار السوق**: استخدم **حصرياً** الأسعار من قسم "🔴🟢 الأسعار المباشرة" أدناه. هذه أسعار حقيقية محدثة الآن من Yahoo Finance.
2. **🚫 لا تستخدم أسعار القاعدة**: إذا كان هناك سعر في "بيانات القاعدة" يختلف عن "الأسعار المباشرة"، تجاهل سعر القاعدة تماماً. الأسعار المباشرة هي الحقيقة.
3. **التحليل والرأي**: من خبرتك كمساعد مالي ذكي. لا تخترع أرقاماً أساسية (أرباح، ديون) — إذا لم تكن في البيانات، قل "غير متوفر".
4. **اكتب بالعربية الفصحى**. الاستثناء: رموز الأصول (BTC, XAU, 2222.SR).
5. **لا تذكر أسماء أدوات داخلية** أو جداول قاعدة بيانات.
6. **أضف تنبيه المخاطر** في نهاية أي رد فيه توصية.
7. **صيغ الرد بشكل منظم** بعناوين ونقاط ورموز تعبيرية.
8. **جداول Markdown فقط**: | العمود 1 | العمود 2 | |---|---| | القيمة 1 | القيمة 2 |
9. **🚫 منع التكرار**: لا تكرر نفس الفقرة أو القسم أكثر من مرة. كل فقرة تضيف قيمة جديدة.

## 🎯 نوع الرد المطلوب: ${searchPlan.responseType === 'price' ? 'عرض سعر + اتجاه + عوامل مؤثرة'
    : searchPlan.responseType === 'recommendation' ? 'توصية مبنية على الإشارات والتحليلات + مستوى ثقة + مخاطر'
    : searchPlan.responseType === 'analysis' ? 'تحليل فني + أساسي + اتجاه + عوامل مؤثرة + سيناريوهات'
    : searchPlan.responseType === 'news' ? 'ملخص أخبار + تأثير محتمل على الأسواق'
    : searchPlan.responseType === 'comparison' ? 'مقارنة مفصلة مع جدول مقارنة واضح'
    : 'نظرة شاملة على الأسواق + الأخبار + الإشارات + التوقعات'}

## 📐 قالب الرد الإلزامي (لجميع أنواع التحليل والأسعار والتوصيات):

عندما يسأل المستخدم عن أصل مالي (ذهب، نفط، سهم، عملة)، يجب أن يتضمن ردك **دائماً** هذه الأقسام بالترتيب:

### 1️⃣ السعر الحالي والاتجاه:
- السعر الحالي + التغير اليومي (من الأسعار المباشرة 🔴🟢 فقط)
- الاتجاه العام (صاعد/هابط/محايد) مع سبب مختصر

### 2️⃣ التحليل الفني (إلزامي):
- مستوى الدعم القريب + مستوى المقاومة القريب
- RSI (14): القيمة + التفسير (تشبع شراء فوق 70 / تشبع بيع تحت 30 / محايد)
- MACD: هل هناك تقاطع صاعد أم هابط أم محايد؟
- المتوسط المتحرك: هل السعر فوق أم تحت MA50؟

### 3️⃣ العوامل الأساسية المؤثرة:
- العامل الأول (مثلاً: أسعار الفائدة، الدولار، التوترات الجيوسياسية) + رقم محدد إن وجد
- العامل الثاني + رقم محدد إن وجد
- العامل الثالث + رقم محدد إن وجد

### 4️⃣ السيناريوهات (إلزامي — حتى في التحليل العادي):
- 🟢 السيناريو الصعودي: الشروط + الهدف السعري + الاحتمال التقريبي
- 🟡 السيناريو المحايد: الشروط + النطاق السعري + الاحتمال التقريبي
- 🔴 السيناريو الهابط: الشروط + الهدف السعري + الاحتمال التقريبي

### 5️⃣ التوصية:
- للمستثمرين الحاليين: ماذا يفعلون (انتظار/حماية/خروج جزئي)
- للمستثمرين الجدد: نقطة الدخول المحتملة + وقف الخسارة (1.5-3% من الدخول) + الهدف

⚠️ تنبيه المخاطر: المعلومات لأغراض تعليمية ومعلوماتية فقط ولا تعتبر نصيحة استثمارية.

## 📋 قوالب خاصة لأنواع أخرى:
- **أخبار**: ملخص الخبر + التأثير المحتمل على الأصل + توصية (انتظار/مراقبة)
- **أسهم قطاع**: اذكر الأسهم **الحقيقية المعروفة فقط** برموزها الصحيحة (مثل DE, CNHI, MOS, NTR للزراعة). لا تخترع أسماء أسهم أو رموز. إذا لم تكن متأكداً من سهم، لا تذكره.
- **مقارنة**: جدول مقارنة واضح + نقاط القوة والضعف لكل خيار + توصية

## 🚫 قاعدة صارمة ضد التكرار:
- لا تكرر رداً سابقاً. كل رد يضيف قيمة جديدة.
- لا تكرر نفس الجدول أو نفس الأرقام أكثر من مرة.
- إذا غطيت نقطة، انتقل للنقطة التالية.

## 🚫 قاعدة صارمة ضد الاختراع:
- لا تخترع أسماء أسهم أو رموز تداول — استخدم فقط الأسهم الحقيقية المعروفة
- إذا سُئلت عن أفضل أسهم قطاع ولم تكن متأكداً، اذكر الأسهم الكبرى المعروفة فقط مع تحذير
- لا تخترع مؤشرات فنية (RSI, MACD) — إذا لم تكن متوفرة في البيانات، قل "غير متوفر حالياً"`);

  // ═══ DEEP SEARCH MODE ═══
  if (deepSearch) {
    parts.push(`\n## 🔬🔬🔬 وضع التحليل العميق — DEEP ANALYSIS MODE 🔬🔬🔬

🚨 هذا ليس تحليلاً عادياً — المستخدم طلب "تحليلاً عميقاً". يجب أن يكون ردك مختلفاً جذرياً عن التحليل العادي في الكم والكيف.

### 🔑 الفرق الجوهري بين التحليل العادي والعميق:
| العنصر | التحليل العادي | التحليل العميق (أنت الآن) |
|--------|---------------|--------------------------|
| مستويات الدعم/المقاومة | 1+1 | 3+ لكل جهة مع أسباب فنية |
| المؤشرات الفنية | RSI + MACD مختصر | RSI + MACD + MA20/50/200 + فيبوناتشي + حجم |
| السيناريوهات | 3 سيناريوهات أساسية | 4 سيناريوهات مع احتمالات + أهداف زمنية |
| مقارنة البدائل | ❌ غير مطلوبة | ✅ إلزامي (ذهب vs سندات vs أسهم vs بيتكوين) |
| إشارة التداول | توصية عامة | إشارة دقيقة: دخول + SL + هدفين + R:R + فريم |
| التقويم الاقتصادي | ❌ غير مطلوب | ✅ إلزامي (أحداث قادمة مؤثرة) |
| الارتباطات | ❌ غير مطلوبة | ✅ جدول ارتباطات مع أصول أخرى |

### ✅ يجب أن يتضمن ردك الإلزامي (7 أقسام):

1. **📊 تحليل فني معمّق بأرقام**:
   - 3 مستويات دعم + 3 مستويات مقاومة مع سبب كل مستوى (فني/نفسي/حجمي)
   - RSI (14): القيمة الدقيقة + التفسير + هل هناك تباعد سعري؟
   - MACD: الإشارة الحالية + هل هناك تقاطع وشيك؟ + الزخم
   - المتوسطات المتحركة: MA20, MA50, MA200 — السعر فوق/تحت كل واحد + المعنى
   - فيبوناتشي: مستويات التصحيح 23.6%, 38.2%, 50%, 61.8% من آخر حركة رئيسية
   - حجم التداول: أعلى/أقل من المتوسط + ماذا يعني

2. **📈 سيناريوهات متعددة (4 سيناريوهات مع احتمالات)**:
   - 🟢 السيناريو الصعودي: المحفزات المحددة + السعر المستهدف + الاحتمال + الإطار الزمني
   - 🟡 السيناريو المحايد: الشروط + النطاق السعري الدقيق + الاحتمال + المدة المتوقعة
   - 🔴 السيناريو الهابط: المحفزات المحددة + السعر المستهدف + الاحتمال + الإطار الزمني
   - ⚡ السيناريو غير المتوقع: حدث مفاجئ محتمل + تأثيره الكمي على السعر

3. **🔄 مقارنة مع بدائل الاستثمار (إلزامي)**:
   - هذا الأصل مقابل السندات (عائد 10 سنوات) — أيهما أفضل الآن؟
   - هذا الأصل مقابل الأسهم (S&P 500) — أيهما أفضل الآن؟
   - هذا الأصل مقابل البيتكوين — أيهما أفضل الآن؟
   - الخلاصة: أين يجب أن يكون المال الآن؟ ولماذا؟

4. **🎯 إشارة تداول محسّنة ودقيقة**:
   - نقطة الدخول المثالية + السبب الفني الدقيق
   - وقف الخسارة: نطاق واقعي (1.5-2.5% من نقطة الدخول، وليس أضيق) + السبب
   - هدف الربح الأول (TP1) + السبب الفني
   - هدف الربح الثاني (TP2) + السبب الفني
   - نسبة المخاطرة/العائد (R:R)
   - الإطار الزمني المناسب (فريم التداول)

5. **🔗 الارتباطات مع أصول أخرى**:
   - جدول يوضح: الأصل | الاتجاه | التأثير على الأصل المحلل
   - يشمل: الدولار، الفائدة، الأسهم، النفط، التوترات الجيوسياسية

6. **📅 التقويم الاقتصادي المؤثر**:
   - الأحداث القادمة التي قد تؤثر على الأصل (تواريخ محددة إن أمكن)
   - تواريخ قرارات الفائدة / بيانات التوظيف / التقارير المهمة

7. **💼 التقييم الشامل النهائي**:
   - جدول: المعيار | التقييم | الملاحظة
   - يشمل: الاتجاه الفني، الزخم، الدعم الأساسي، الفرصة

### ❌ محظورات في التحليل العميق:
- ❌ لا تكرر ما قلته في تحليل سابق — هذا تحليل جديد بالكامل
- ❌ لا تستخدم وقف خسارة ضيق جداً (أقل من 1% من السعر)
- ❌ لا تكتُب عبارات عامة بدون أرقام — كل فقرة يجب أن تحتوي رقماً محدداً
- ❌ لا تذكر نفس العوامل العامة بدون أرقام جديدة
- ❌ لا تختصر — المستخدم طلب عميقاً فعلاً
`);
  }

  // ═══ DEEP SEARCH MODE ═══
  if (deepSearch) {
    parts.push(`\n## 🔬🔬🔬 وضع التحليل العميق — DEEP ANALYSIS MODE 🔬🔬🔬

🚨 هذا ليس تحليلاً عادياً — المستخدم طلب "تحليلاً عميقاً". يجب أن يكون ردك مختلفاً جذرياً عن التحليل العادي.

### ✅ يجب أن يتضمن ردك (إلزامي):

1. **📊 تحليل فني معمّق بأرقام**:
   - مستويات الدعم والمقاومة (3 مستويات على الأقل لكل جهة)
   - RSI: القيمة الحالية + التفسير (تشبع شراء/بيع)
   - MACD: الإشارة الحالية (تقاطع صاعد/هابط)
   - المتوسطات المتحركة: MA20, MA50, MA200 وموقع السعر منها
   - فيبوناتشي: مستويات التصحيح الرئيسية
   - حجم التداول والاتجاه

2. **📈 سيناريوهات متعددة (3-4 سيناريوهات)**:
   - 🟢 السيناريو المتفائل: الشروط + السعر المستهدف + الاحتمال
   - 🟡 السيناريو المحايد: الشروط + النطاق السعري + الاحتمال
   - 🔴 السيناريو المتشائم: الشروط + السعر المستهدف + الاحتمال
   - 📊 السيناريو غير المتوقع: حدث مفاجئ محتمل + تأثيره

3. **🔄 مقارنة مع بدائل الاستثمار**:
   - الذهب مقابل السندات (عائد 10 سنوات)
   - الذهب مقابل الأسهم (S&P 500)
   - الذهب مقابل البيتكوين
   - أي بديل أفضل الآن؟ ولماذا؟

4. **🎯 إشارة تداول محسّنة**:
   - نقطة الدخول + سببها الفني
   - وقف الخسارة: نطاق واقعي (1.5-2.5% من نقطة الدخول، وليس أضيق)
   - هدف الربح الأول والثاني
   - نسبة المخاطرة/العائد
   - الإطار الزمني المناسب (فريم)

5. **📅 التقويم الاقتصادي المؤثر**:
   - الأحداث القادمة التي قد تؤثر على الأصل
   - تواريخ قرارات الفائدة / بيانات التوظيف / التقارير المهمة

### ❌ محظورات في التحليل العميق:
- ❌ لا تكرر ما قلته في تحليل سابق — هذا تحليل جديد بالكامل
- ❌ لا تستخدم وقف خسارة ضيق جداً (أقل من 1% من السعر)
- ❌ لا تكتُب "الذهب يواجه رياحاً معاكسة" بدون أرقام محددة
- ❌ لا تذكر نفس العوامل العامة (عوائد السندات، الدولار) بدون أرقام جديدة
`);
  }

  // ═══ REAL-TIME DATA (from Yahoo Finance) ═══
  const hasRealtimePrices = realtimeData.prices.length > 0 && realtimeData.prices.some(p => p.price !== null);

  if (hasRealtimePrices) {
    parts.push(`\n## 🔴🟢 الأسعار المباشرة (من Yahoo Finance — الآن):

🚨 هذه الأسعار الحقيقية المحدّثة الآن. استخدمها حصرياً. لا تستخدم أي سعر آخر.

${realtimeData.marketContext}`);

    // Add individual prices in a clear format
    const priceLines: string[] = [];
    for (const p of realtimeData.prices) {
      if (p.price !== null) {
        const changeStr = p.changePercent !== null ? `${p.changePercent >= 0 ? '+' : ''}${p.changePercent.toFixed(2)}%` : '';
        const emoji = p.changePercent !== null ? (p.changePercent >= 0 ? '🟢' : '🔴') : '📊';
        priceLines.push(`${emoji} **${p.nameAr}** (${p.symbol}): **$${p.price.toLocaleString()}** ${changeStr}`);
      }
    }
    if (priceLines.length > 0) {
      parts.push(`\nملخص الأسعار المباشرة:\n${priceLines.join('\n')}`);
    }
  } else {
    parts.push(`\n## ⚠️ الأسعار المباشرة: غير متوفرة حالياً. استخدم أسعار القاعدة أدناه مع التنبيه أنها قد تكون قديمة.`);
  }

  // ═══ DB DATA ═══
  // V1000-CRITICAL: When real-time prices are available, strip stale prices
  // from DB context to prevent the AI from mixing old and new prices.
  // Only include news, analyses, signals, reports from DB — NOT prices.
  let dbContextForAI = dbData.contextForAI;
  if (hasRealtimePrices) {
    // Remove the price section from DB context to avoid confusion
    // The DB context typically has a "## 📊 أسعار السوق" section with old prices
    dbContextForAI = dbContextForAI
      .replace(/##\s*📊\s*أسعار السوق[\s\S]*?(?=\n##\s|$)/i, '')
      .replace(/##\s*📊\s*Market Prices[\s\S]*?(?=\n##\s|$)/i, '')
      .replace(/##\s*📊\s*الأسعار[\s\S]*?(?=\n##\s|$)/i, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if (dbContextForAI) {
    parts.push(`\n## 📊 بيانات إضافية من قاعدة رؤى (أخبار، تحليلات، إشارات فقط — الأسعار مأخوذة من الأعلى):
${dbContextForAI}`);
  }

  // Response guidelines
  parts.push(`\n## ⚠️ إرشادات الاستجابة:
1. 🚨 الأسعار: استخدم **حصرياً** الأسعار المباشرة (🔴🟢) من الأعلى. لا تذكر أي سعر من القاعدة إذا يختلف عن المباشر.
2. التحليل والربط: هذا دورك كعقل مالي ذكي — استخدم خبرتك.
3. إذا لم تجد بيانات عن سهم معين: اعرض المؤشرات المتاحة + تحليل اقتصادي + اقترح أسهم محددة.
4. أضف تنبيه المخاطر: "تنبيه المخاطر: المعلومات لأغراض تعليمية ومعلوماتية فقط ولا تعتبر نصيحة استثمارية."
5. لا تكرر نفس المحتوى. كل فقرة تضيف قيمة جديدة.

## 📋 قائمة أسهم قطاعية حقيقية (استخدم هذه فقط — لا تخترع أسماء):
- **الزراعة**: DE (Deere & Company), CNHI (CNH Industrial), MOS (Mosaic), NTR (Nutrien), AGCO (AGCO Corp), FMC (FMC Corp), CTVA (Corteva), BG (Bunge)
- **التكنولوجيا**: AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, AMD, INTC, CRM
- **الطاقة**: XOM (Exxon), CVX (Chevron), COP (ConocoPhillips), SLB (Schlumberger), EOG (EOG Resources)
- **الرعاية الصحية**: JNJ (Johnson & Johnson), UNH (UnitedHealth), PFE (Pfizer), ABBV (AbbVie), LLY (Eli Lilly)
- **المالية**: JPM (JPMorgan), BAC (Bank of America), GS (Goldman Sachs), MS (Morgan Stanley), V (Visa)
- **السعودية**: 2222.SR (أرامكو), 1120.SR (الراجحي), 2330.SR (stc), 1211.SR (سابك), 4005.SR (الاتصالات)
- **الذهب/التعدين**: NEM (Newmont), GOLD (Barrick), AEM (Agnico Eagle), WPM (Wheaton Precious)
⚠️ إذا سُئلت عن قطاع غير موجود هنا، اذكر فقط الأسهم التي أنت متأكد 100% من وجودها. لا تخترع.`);

  return parts.join('\n\n');
}

// ─── V1000: English Agent Prompt ────────────────────────────────

function buildEnglishAgentPrompt(
  dbData: FetchedData,
  realtimeData: RealtimeSearchResult,
  searchPlan: AISearchPlan,
  deepSearch?: boolean,
): string {
  const parts: string[] = [];
  const hasRealtimePrices = realtimeData.prices.length > 0 && realtimeData.prices.some(p => p.price !== null);

  parts.push(`You are "Rouaa Smart Assistant" — an advanced financial assistant for the Rouaa platform.

You are the BRAIN. You receive the user's question, search the data, and use intelligence to analyze and build a comprehensive response.

## 🧠 Your Philosophy — You Are The Brain:
- You search, understand, and build smart responses — not just relay data
- You NEVER just say "I don't have data" — you always show what you have + add smart analysis
- You connect news to prices, analyses to recommendations, indicators to markets
- You understand questions even when phrased colloquially

## 📋 Core Rules:

1. **🚨 Market prices**: Use **ONLY** prices from the "🔴🟢 Real-time Prices" section below. These are real prices fetched NOW from Yahoo Finance.
2. **🚫 Do NOT use DB prices**: If a price in "DB Data" differs from "Real-time Prices", IGNORE the DB price completely. Real-time prices are the TRUTH.
3. **Analysis & Opinion**: From your expertise. Don't fabricate fundamental data (earnings, debt) — if not in data, say "not available".
4. **Write in the user's language**. Exception: financial asset symbols (BTC, XAU, 2222.SR).
5. **Never mention internal tool names** or database table names.
6. **Add risk disclaimer** at the end of any response with recommendations.
7. **Format nicely** with headings, bullet points, and emojis.
8. **Markdown tables only**: | Column 1 | Column 2 | |---|---| | Value 1 | Value 2 |
9. **🚫 Prevent infinite repetition**: Do NOT repeat the same paragraph or section more than once. Every paragraph adds NEW value.

## 🎯 Response type needed: ${searchPlan.responseType === 'price' ? 'Show price + direction + impacting factors'
    : searchPlan.responseType === 'recommendation' ? 'Recommendation based on signals & analyses + confidence + risks'
    : searchPlan.responseType === 'analysis' ? 'Technical + fundamental analysis + direction + factors + scenarios'
    : searchPlan.responseType === 'news' ? 'News summary + potential market impact'
    : searchPlan.responseType === 'comparison' ? 'Detailed comparison with clear comparison table'
    : 'Broad market overview + news + signals + outlook'}

## 📐 Mandatory Response Template (for ALL analysis/price/recommendation queries):

When the user asks about a financial asset (gold, oil, stock, currency), your response MUST ALWAYS include these sections in order:

### 1️⃣ Current Price & Direction:
- Current price + daily change (from real-time prices 🔴🟢 ONLY)
- Overall direction (bullish/bearish/neutral) with brief reason

### 2️⃣ Technical Analysis (mandatory):
- Nearest support level + nearest resistance level
- RSI (14): Value + interpretation (overbought above 70 / oversold below 30 / neutral)
- MACD: Bullish/bearish crossover or neutral?
- Moving Average: Is price above or below MA50?

### 3️⃣ Key Fundamental Factors:
- Factor 1 (e.g., interest rates, USD, geopolitical tensions) + specific number if available
- Factor 2 + specific number if available
- Factor 3 + specific number if available

### 4️⃣ Scenarios (mandatory — even in regular analysis):
- 🟢 Bullish Scenario: Conditions + price target + approximate probability
- 🟡 Neutral Scenario: Conditions + price range + approximate probability
- 🔴 Bearish Scenario: Conditions + price target + approximate probability

### 5️⃣ Recommendation:
- For current investors: What to do (wait/protect/partial exit)
- For new investors: Potential entry point + stop-loss (1.5-3% from entry) + target

⚠️ Risk Disclaimer: Information is for educational purposes only and does not constitute investment advice.

## 📋 Special Templates:
- **News**: Summary + potential impact on asset + recommendation (wait/monitor)
- **Sector stocks**: List ONLY **real known stocks** with correct symbols (e.g., DE, CNHI, MOS, NTR for agriculture). Do NOT fabricate stock names or symbols. If unsure about a stock, don't mention it.
- **Comparison**: Clear comparison table + pros/cons for each option + recommendation

## 🚫 STRICT Rule Against Repetition:
- NEVER repeat a previous response. Every response adds NEW value.
- Do NOT repeat the same table or numbers more than once.
- If you've covered a point, move to the next.

## 🚫 STRICT Rule Against Fabrication:
- Do NOT fabricate stock names or trading symbols — use only real, well-known stocks
- If asked about best sector stocks and unsure, list only major known stocks with a disclaimer
- Do NOT fabricate technical indicators (RSI, MACD) — if not available in data, say "currently unavailable"`);

  // ═══ DEEP SEARCH MODE ═══
  if (deepSearch) {
    parts.push(`\n## 🔬🔬🔬 DEEP ANALYSIS MODE 🔬🔬🔬

🚨 This is NOT a regular analysis — the user requested "deep analysis". Your response MUST be fundamentally different from regular analysis in BOTH depth AND breadth.

### 🔑 Key Difference Between Regular and Deep Analysis:
| Element | Regular Analysis | Deep Analysis (YOU NOW) |
|---------|-----------------|------------------------|
| Support/Resistance | 1+1 | 3+ for each side with technical reasons |
| Technical Indicators | RSI + MACD brief | RSI + MACD + MA20/50/200 + Fibonacci + Volume |
| Scenarios | 3 basic scenarios | 4 scenarios with probabilities + time targets |
| Alternative Comparison | ❌ Not required | ✅ Mandatory (vs bonds vs stocks vs BTC) |
| Trading Signal | General recommendation | Precise: entry + SL + 2 targets + R:R + timeframe |
| Economic Calendar | ❌ Not required | ✅ Mandatory (upcoming impactful events) |
| Correlations | ❌ Not required | ✅ Correlation table with other assets |

### ✅ Your response MUST include (7 mandatory sections):

1. **📊 Deep Technical Analysis with numbers**:
   - 3 support levels + 3 resistance levels with reason for each (technical/psychological/volume)
   - RSI (14): Exact value + interpretation + any divergence?
   - MACD: Current signal + imminent crossover? + momentum
   - Moving Averages: MA20, MA50, MA200 — price above/below each + implications
   - Fibonacci: 23.6%, 38.2%, 50%, 61.8% retracement from last major move
   - Volume: Above/below average + what it means

2. **📈 Multiple Scenarios (4 scenarios with probabilities)**:
   - 🟢 Bullish: Specific catalysts + price target + probability + timeframe
   - 🟡 Neutral: Conditions + precise price range + probability + expected duration
   - 🔴 Bearish: Specific catalysts + price target + probability + timeframe
   - ⚡ Black Swan: Potential surprise event + quantitative impact on price

3. **🔄 Alternative Investment Comparison (mandatory)**:
   - This asset vs Bonds (10Y yield) — which is better NOW?
   - This asset vs Equities (S&P 500) — which is better NOW?
   - This asset vs Bitcoin — which is better NOW?
   - Bottom line: Where should money be NOW? Why?

4. **🎯 Enhanced Trading Signal**:
   - Ideal entry point + precise technical reason
   - Stop-loss: Realistic range (1.5-2.5% from entry, NOT tighter) + reason
   - Take-profit 1 (TP1) + technical reason
   - Take-profit 2 (TP2) + technical reason
   - Risk/Reward ratio (R:R)
   - Recommended timeframe

5. **🔗 Correlations with Other Assets**:
   - Table: Asset | Direction | Impact on analyzed asset
   - Include: USD, Interest rates, Equities, Oil, Geopolitical tensions

6. **📅 Upcoming Economic Calendar**:
   - Events that may impact the asset (specific dates if possible)
   - Fed decision dates / Employment data / Key reports

7. **💼 Final Comprehensive Assessment**:
   - Table: Criterion | Rating | Note
   - Include: Technical trend, Momentum, Fundamental support, Opportunity

### ❌ Forbidden in Deep Analysis:
- ❌ Do NOT repeat previous analysis — this is entirely new
- ❌ Do NOT use stop-loss tighter than 1% of price
- ❌ Do NOT write vague phrases without specific numbers — every paragraph must contain a number
- ❌ Do NOT repeat the same general factors without new numbers
- ❌ Do NOT be brief — the user explicitly asked for depth
`);
  }

  // ═══ DEEP SEARCH MODE ═══
  if (deepSearch) {
    parts.push(`\n## 🔬🔬🔬 DEEP ANALYSIS MODE 🔬🔬🔬

🚨 This is NOT a regular analysis — the user requested "deep analysis". Your response MUST be fundamentally different from a regular analysis.

### ✅ Your response MUST include (mandatory):

1. **📊 Deep Technical Analysis with numbers**:
   - Support and Resistance levels (at least 3 for each side)
   - RSI: Current value + interpretation (overbought/oversold)
   - MACD: Current signal (bullish/bearish crossover)
   - Moving Averages: MA20, MA50, MA200 and price position relative to them
   - Fibonacci: Key retracement levels
   - Volume trend and direction

2. **📈 Multiple Scenarios (3-4 scenarios)**:
   - 🟢 Bullish Scenario: Conditions + Price Target + Probability
   - 🟡 Neutral Scenario: Conditions + Price Range + Probability
   - 🔴 Bearish Scenario: Conditions + Price Target + Probability
   - 📊 Black Swan Scenario: Potential surprise event + impact

3. **🔄 Alternative Investment Comparison**:
   - Gold vs Bonds (10Y yield)
   - Gold vs Equities (S&P 500)
   - Gold vs Bitcoin
   - Which alternative is better NOW? Why?

4. **🎯 Enhanced Trading Signal**:
   - Entry point + technical reason
   - Stop-loss: Realistic range (1.5-2.5% from entry, NOT tighter)
   - Take-profit: First and second targets
   - Risk/Reward ratio
   - Recommended timeframe

5. **📅 Upcoming Economic Calendar**:
   - Events that may impact the asset
   - Fed decision dates / Employment data / Key reports

### ❌ Forbidden in Deep Analysis:
- ❌ Do NOT repeat previous analysis — this is entirely new
- ❌ Do NOT use stop-loss tighter than 1% of price
- ❌ Do NOT write vague phrases like "facing headwinds" without specific numbers
- ❌ Do NOT repeat the same general factors (yields, USD) without new numbers
`);
  }

  // ═══ REAL-TIME DATA (from Yahoo Finance) ═══
  if (hasRealtimePrices) {
    parts.push(`\n## 🔴🟢 Real-time Prices (from Yahoo Finance — NOW):

🚨 These are REAL prices updated NOW. Use them EXCLUSIVELY. Do NOT use any other price source.

${realtimeData.marketContext}`);

    const priceLines: string[] = [];
    for (const p of realtimeData.prices) {
      if (p.price !== null) {
        const changeStr = p.changePercent !== null ? `${p.changePercent >= 0 ? '+' : ''}${p.changePercent.toFixed(2)}%` : '';
        const emoji = p.changePercent !== null ? (p.changePercent >= 0 ? '🟢' : '🔴') : '📊';
        priceLines.push(`${emoji} **${p.name}** (${p.symbol}): **$${p.price.toLocaleString()}** ${changeStr}`);
      }
    }
    if (priceLines.length > 0) {
      parts.push(`\nReal-time price summary:\n${priceLines.join('\n')}`);
    }
  } else {
    parts.push(`\n## ⚠️ Real-time prices: Not available right now. Use DB prices below but warn they may be stale.`);
  }

  // ═══ DB DATA ═══
  // V1000-CRITICAL: When real-time prices are available, strip stale prices
  // from DB context to prevent the AI from mixing old and new prices.
  let enDbContextForAI = dbData.contextForAI;
  if (hasRealtimePrices) {
    enDbContextForAI = enDbContextForAI
      .replace(/##\s*📊\s*أسعار السوق[\s\S]*?(?=\n##\s|$)/i, '')
      .replace(/##\s*📊\s*Market Prices[\s\S]*?(?=\n##\s|$)/i, '')
      .replace(/##\s*📊\s*الأسعار[\s\S]*?(?=\n##\s|$)/i, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if (enDbContextForAI) {
    parts.push(`\n## 📊 Additional Data from Rouaa DB (news, analyses, signals only — prices from above):

${enDbContextForAI}`);
  }

  // Response guidelines
  parts.push(`\n## ⚠️ Response Guidelines:
1. 🚨 Prices: Use **ONLY** real-time prices (🔴🟢) from above. Do NOT mention any DB price that differs from the real-time price.
2. Analysis & connections: This is YOUR role as a smart financial brain — use your expertise.
3. If no specific stock data found: Show available indicators + economic analysis + suggest specific stocks.
4. Add risk disclaimer: "Risk Disclaimer: Information is for educational purposes only and does not constitute investment advice."
5. Do NOT repeat content. Every paragraph adds NEW value.

## 📋 Real Sector Stock List (use ONLY these — do NOT fabricate names):
- **Agriculture**: DE (Deere & Company), CNHI (CNH Industrial), MOS (Mosaic), NTR (Nutrien), AGCO (AGCO Corp), FMC (FMC Corp), CTVA (Corteva), BG (Bunge)
- **Technology**: AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, AMD, INTC, CRM
- **Energy**: XOM (Exxon), CVX (Chevron), COP (ConocoPhillips), SLB (Schlumberger), EOG (EOG Resources)
- **Healthcare**: JNJ (Johnson & Johnson), UNH (UnitedHealth), PFE (Pfizer), ABBV (AbbVie), LLY (Eli Lilly)
- **Financials**: JPM (JPMorgan), BAC (Bank of America), GS (Goldman Sachs), MS (Morgan Stanley), V (Visa)
- **Saudi**: 2222.SR (Aramco), 1120.SR (Al Rajhi), 2330.SR (stc), 1211.SR (SABIC), 4005.SR (STC)
- **Gold/Mining**: NEM (Newmont), GOLD (Barrick), AEM (Agnico Eagle), WPM (Wheaton Precious)
⚠️ If asked about a sector not listed here, only mention stocks you are 100% certain exist. Do NOT fabricate.`);

  return parts.join('\n\n');
}

// ─── Follow-up Detection ────────────────────────────────────────

function detectAndBuildFollowUp(
  userMessage: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  locale?: Locale,
): string | null {
  const isAr = locale === 'ar';
  const msg = userMessage.trim().toLowerCase();

  // Detect follow-up keywords
  const DEEPER_AR = ['أعمق', 'بشكل أعمق', 'حلل بشكل أعمق', 'تفصيل أكثر', 'تعمق أكثر', 'أكثر تفصيلاً', 'تحليل أعمق', 'اشرح أكثر', 'مزيد من التفاصيل', 'توسع أكثر', 'بالتفصيل', 'عمق التحليل'];
  const DEEPER_EN = ['deeper', 'more detail', 'analyze deeper', 'in depth', 'in-depth', 'more deeply', 'detailed analysis', 'go deeper', 'elaborate', 'more thorough', 'deeper dive', 'dig deeper', 'expand on'];

  const isDeeper = DEEPER_AR.some(k => msg.includes(k)) || DEEPER_EN.some(k => msg.includes(k));

  if (!isDeeper || !history || history.length === 0) return null;

  // Extract previous response topics
  const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');
  if (!lastAssistantMsg) return null;

  const previousResponse = lastAssistantMsg.content.slice(0, 2000);
  const headingMatches = previousResponse.match(/#{1,3}\s+(.+)/g) || [];
  const previousTopics = headingMatches.slice(0, 8).map(h => h.replace(/^#{1,3}\s+/, '').trim());
  const topicsStr = previousTopics.length > 0 ? previousTopics.map(t => `"${t}"`).join('، ') : '(مواضيع متعددة)';

  return isAr
    ? `🚨 تنبيه — المستخدم يطلب تحليلاً أعمق — لا تكرر الرد السابق! 🚨

الرد السابق غطى: ${topicsStr}

المستخدم قرأ الرد السابق ويريد المزيد. يجب أن تقدم محتوى جديداً بالكامل:

1. ❌ لا تكرر نفس الأرقام والأسعار من الرد السابق
2. ❌ لا تعيد نفس التحليل والعبارات
3. ✅ أضف تحليلاً فنياً أعمق (مستويات دعم/مقاومة، RSI، MACD)
4. ✅ أضف تحليلاً أساسياً (العرض والطلب، مؤشرات اقتصادية)
5. ✅ أضف تحليل سيناريوهات (أفضل/أسوأ حالة)
6. ✅ أضف تأثيرات على أصول أخرى
7. ✅ استخدم الأسعار المباشرة المحدّثة

هذا تعميق وليس تكرار. كل فقرة تضيف قيمة جديدة.`
    : `🚨 CRITICAL — User wants DEEPER analysis — DO NOT repeat the previous response! 🚨

Previous response covered: ${topicsStr}

The user READ your previous response and wants MORE. You MUST provide NEW content:

1. ❌ Do NOT repeat the same numbers and prices
2. ❌ Do NOT repeat the same analysis and phrases
3. ✅ Add deeper technical analysis (support/resistance, RSI, MACD)
4. ✅ Add fundamental analysis (supply/demand, economic indicators)
5. ✅ Add scenario analysis (best/worst case)
6. ✅ Add cross-asset impact
7. ✅ Use the real-time prices provided

This is deepening, NOT repeating. Every paragraph adds NEW value.`;
}

// ─── Simple Data-Only Fallback ─────────────────────────────────

function buildDataOnlyFallback(data: FetchedData, realtimeData: RealtimeSearchResult, locale: Locale, userMessage?: string): string {
  const isAr = locale === 'ar';
  const parts: string[] = [];

  // Start with real-time prices if available
  if (realtimeData.prices.length > 0 && realtimeData.prices.some(p => p.price !== null)) {
    parts.push(isAr ? '### 🔴🟢 الأسعار المباشرة (الآن):' : '### 🔴🟢 Real-time Prices (NOW):');
    for (const p of realtimeData.prices) {
      if (p.price !== null) {
        const changeStr = p.changePercent !== null ? `${p.changePercent >= 0 ? '+' : ''}${p.changePercent.toFixed(2)}%` : '';
        const emoji = p.changePercent !== null ? (p.changePercent >= 0 ? '🟢' : '🔴') : '📊';
        const name = isAr ? p.nameAr : p.name;
        parts.push(`- ${emoji} **${name}** (${p.symbol}): **$${p.price.toLocaleString()}** ${changeStr}`);
      }
    }
  }

  // DB prices
  if (data.prices.length > 0) {
    parts.push(isAr ? '\n### 📊 أسعار القاعدة (قد تكون قديمة):' : '\n### 📊 DB Prices (may be stale):');
    for (const p of data.prices.slice(0, 15)) {
      const name = isAr && p.nameAr ? p.nameAr : p.name;
      const change = p.changePercent >= 0 ? `+${p.changePercent.toFixed(2)}%` : `${p.changePercent.toFixed(2)}%`;
      const emoji = p.changePercent >= 0 ? '🟢' : '🔴';
      const stale = p.isStale ? ' ⚠️' : '';
      parts.push(`- ${emoji} **${name}** (${p.symbol}): **${p.value.toLocaleString()}** ${change}${stale}`);
    }
  }

  // Signals
  if (data.signals.length > 0) {
    parts.push(isAr ? '\n### 🎯 إشارات التداول:' : '\n### 🎯 Trading Signals:');
    for (const s of data.signals.slice(0, 5)) {
      const actionEmoji = s.action === 'BUY' || s.action === 'LONG' ? '🟢'
        : s.action === 'SELL' || s.action === 'SHORT' ? '🔴' : '🟡';
      parts.push(`- ${actionEmoji} **${s.pair}** → **${s.action}** (${s.confidence}% ثقة)`);
    }
  }

  // Analyses
  if (data.analyses.length > 0) {
    parts.push(isAr ? '\n### 📈 التحليلات:' : '\n### 📈 Analyses:');
    for (const a of data.analyses.slice(0, 5)) {
      const signalEmoji = a.overallSignal === 'bullish' ? '🟢'
        : a.overallSignal === 'bearish' ? '🔴' : '🟡';
      parts.push(`- ${signalEmoji} **${a.title}** (${a.symbol || '-'}) — ${a.overallSignal || '-'}`);
    }
  }

  // News
  if (data.news.length > 0) {
    parts.push(isAr ? '\n### 📰 الأخبار:' : '\n### 📰 News:');
    for (const n of data.news.slice(0, 5)) {
      const title = isAr && n.titleAr ? n.titleAr : n.title;
      const sentEmoji = n.sentiment === 'positive' || n.sentiment === 'bullish' ? '🟢'
        : n.sentiment === 'negative' || n.sentiment === 'bearish' ? '🔴' : '🟡';
      parts.push(`- ${sentEmoji} **${title}**`);
    }
  }

  parts.push(isAr
    ? '\n\n💡 اسألني عن سهم محدد وسأحلله لك!\n\n🔗 تصفح [التحليلات](/stock-analysis) أو [الإشارات](/signals)'
    : '\n\n💡 Ask me about a specific stock and I\'ll analyze it!\n\n🔗 Browse [Analyses](/stock-analysis) or [Signals](/signals)');

  parts.push(isAr
    ? '*⚠️ تنبيه المخاطر: المعلومات لأغراض تعليمية ومعلوماتية فقط ولا تعتبر نصيحة استثمارية.*'
    : '*⚠️ Risk Disclaimer: Information is for educational purposes only and does not constitute investment advice.*');

  return parts.join('\n');
}

// ─── POST Handler ──────────────────────────────────────────────

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const parsed = AssistantSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Invalid input';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { message, history, pageUrl, userId, reportId, reportType } = parsed.data;
    const locale: Locale = parsed.data.locale || 'ar';
    const sanitizedMessage = sanitizePromptInput(message);

    if (!sanitizedMessage || sanitizedMessage.trim().length === 0) {
      return NextResponse.json({ error: 'Message is empty after sanitization' }, { status: 400 });
    }

    // ── Pulse-only mode ──
    if (parsed.data.pulseOnly) {
      try {
        const { fetchMarketPulse } = await import('@/lib/assistant/db-knowledge');
        const pulse = await fetchMarketPulse(locale);
        return NextResponse.json({ pulse: pulse.marketSentiment || 'neutral' });
      } catch {
        return NextResponse.json({ pulse: 'neutral' });
      }
    }

    // ── Normalize conversationMemory ──
    let conversationMemoryStr: string | undefined;
    const rawMem = parsed.data.conversationMemory;
    if (Array.isArray(rawMem)) {
      conversationMemoryStr = rawMem.join(' | ');
    } else if (typeof rawMem === 'string') {
      conversationMemoryStr = rawMem;
    }

    // ═══════════════════════════════════════════════════════════════
    // V1000: AI-AGENT-FIRST FLOW
    //
    // The AI is the BRAIN. It receives the message FIRST.
    // Then it decides what to search for. Then we search.
    // Then the AI composes the response with the data.
    //
    // This is the OPPOSITE of V800 where data was fetched first.
    // ═══════════════════════════════════════════════════════════════

    // ── PHASE 1: AI Pre-Analysis — AI receives message FIRST ──
    const searchPlan = await aiPreAnalysis(sanitizedMessage, locale, history);
    console.log(`[V1000] Phase 1 complete: AI analyzed message — assets=[${searchPlan.assets.join(',')}], type=${searchPlan.responseType}, realtime=${searchPlan.needsRealtimePrices}`);

    // ── PHASE 2: Execute searches IN PARALLEL — based on AI's guidance ──
    const [dbData, realtimeData] = await Promise.all([
      // DB data (analyses, signals, news, etc.)
      fetchBroadData(sanitizedMessage, locale, userId),
      // Real-time web search for current prices
      searchPlan.needsRealtimePrices
        ? searchRealTimePrices(sanitizedMessage, locale)
        : Promise.resolve({ prices: [], marketContext: '', searchTimeMs: 0, queriesUsed: 0, sources: [] } as RealtimeSearchResult),
    ]);

    console.log(`[V1000] Phase 2 complete: DB=${dbData.dataPoints} points (${dbData.fetchTimeMs}ms), Realtime=${realtimeData.prices.filter(p => p.price !== null).length} prices (${realtimeData.searchTimeMs}ms)`);

    // ── PHASE 3: AI composes response with ALL data ──
    let finalResponse: string;
    let responsePath: string;
    let toolsUsed: string[] = [...dbData.sources];
    if (realtimeData.sources.length > 0) {
      toolsUsed.push(isAr(locale) ? 'بحث لحظي' : 'Realtime Search');
    }

    // Detect if this is a follow-up for token allocation
    const msg = sanitizedMessage.toLowerCase();
    const DEEPER_AR = ['أعمق', 'بشكل أعمق', 'حلل بشكل أعمق', 'تفصيل أكثر', 'تعمق'];
    const DEEPER_EN = ['deeper', 'more detail', 'analyze deeper', 'in depth', 'elaborate'];
    const isDeepFollowUp = DEEPER_AR.some(k => msg.includes(k)) || DEEPER_EN.some(k => msg.includes(k));
    const isDeepSearch = parsed.data.deepSearch || false;
    // V1001: Increased token limits — new mandatory template requires more space
    // Normal: 3000→4000 (template has 5 mandatory sections)
    // Deep follow-up: 4000→5000 (more scenarios + indicators)
    // Deep search: 5000→6000 (7 mandatory sections including correlations + alternatives)
    const maxResponseTokens = isDeepSearch ? 6000 : (isDeepFollowUp ? 5000 : 4000);

    try {
      const aiMessages = buildAgentPrompt(
        sanitizedMessage,
        dbData,
        realtimeData,
        searchPlan,
        locale,
        history,
        conversationMemoryStr,
        isDeepSearch,
      );

      // V1004: Expanded provider lists + retry logic + simplified weak prompt.
      //
      // V1003 issues discovered in production:
      // 1. English queries fell to data-only because only 4 providers were tried
      //    (groq, cerebras, bedrock, gemini) — all failed simultaneously
      // 2. Deep analysis with nvidia fallback produced GARBAGE (mixed Spanish/Arabic/English)
      //    because llama-3.1-8b can't handle the 7-section deep template
      //
      // V1004 fixes:
      // - Expand English provider list to 9 providers (was 4)
      // - Add ONE retry for premium tier before falling to weak
      // - Use simplified prompt for weak fallback (strip deep template, keep essentials)
      const premiumProviders: AIProvider[] = ['bedrock', 'gemini', 'groq', 'cerebras', 'glm', 'sambanova', 'mistral', 'deepseek', 'cohere', 'cloudflare'];
      const englishProviders: AIProvider[] = ['groq', 'cerebras', 'glm', 'bedrock', 'gemini', 'sambanova', 'mistral', 'deepseek', 'cohere', 'cloudflare'];
      const deepProviders: AIProvider[] = ['bedrock', 'gemini', 'groq', 'cerebras', 'glm', 'sambanova', 'mistral', 'deepseek', 'cohere'];
      // Weak providers — only used as last resort when all premium fail
      const weakFallbackProviders: AIProvider[] = ['nvidia', 'ollama'];

      let selectedProviders: AIProvider[];
      if (isDeepSearch) {
        selectedProviders = deepProviders;
      } else if (locale !== 'en') {
        selectedProviders = premiumProviders;
      } else {
        selectedProviders = englishProviders;
      }

      // V1004: Helper to try premium providers with one retry
      const tryPremiumProviders = async (attempt: number): Promise<any> => {
        return fastChatCompletion(aiMessages, {
          temperature: isDeepSearch ? 0.7 : (isDeepFollowUp ? 0.6 : 0.5),
          maxTokens: maxResponseTokens,
          timeout: isDeepSearch ? 60_000 : 35_000,
          locale,
          preferProviders: selectedProviders,
          excludeProviders: weakFallbackProviders,
        });
      };

      // V1004: Try premium providers first (Tier 1) — with one retry
      let aiResult;
      let usedWeakFallback = false;
      try {
        aiResult = await tryPremiumProviders(1);
      } catch (premiumErr1: any) {
        // First attempt failed — wait briefly and retry once (rate limits often clear)
        console.warn(`[V1004] Premium attempt 1 failed: ${premiumErr1.message?.slice(0, 100)} — retrying in 1s...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          aiResult = await tryPremiumProviders(2);
          console.log(`[V1004] Premium attempt 2 succeeded via ${aiResult.provider}`);
        } catch (premiumErr2: any) {
          // Both premium attempts failed — try weak providers with SIMPLIFIED prompt (Tier 2)
          console.warn(`[V1004] All premium attempts failed: ${premiumErr2.message?.slice(0, 100)} — trying weak fallback with simplified prompt`);

          // V1004: Build simplified prompt for weak models — strip the complex deep template
          // Weak models (llama-3.1-8b, gemma3:12b) can't handle 7-section templates
          const simplifiedMessages = isDeepSearch
            ? aiMessages.map((m: any, i: number) => {
                // Keep system message but simplify, keep user message as-is
                if (m.role === 'system' && i === 0) {
                  return {
                    ...m,
                    content: m.content.split('## 🔬🔬🔬 وضع التحليل العميق')[0] + // Strip deep template
                      '\n\n## 📐 قالب مبسط (نموذج ضعيف):\n' +
                      '1. السعر الحالي + التغير\n' +
                      '2. الدعم والمقاومة (2 مستويات لكل جهة)\n' +
                      '3. RSI + MACD\n' +
                      '4. 3 سيناريوهات (صعودي/محايد/هابط) مع احتمالات\n' +
                      '5. التوصية: دخول + وقف خسارة + هدف\n' +
                      '6. تنبيه المخاطر'
                  };
                }
                return m;
              })
            : aiMessages;

          try {
            aiResult = await fastChatCompletion(simplifiedMessages, {
              temperature: 0.4, // Lower temperature for weak models
              maxTokens: Math.min(maxResponseTokens, 3000), // Cap tokens for weak models
              timeout: 30_000,
              locale,
              preferProviders: weakFallbackProviders,
              excludeProviders: [],
            });
            usedWeakFallback = true;
            console.log(`[V1004] Weak fallback succeeded via ${aiResult.provider} (simplified prompt)`);

            // V1004: Quality check on weak model output
            // V1005: Broadened garbage detection — catch more patterns that indicate weak model failure
            const weakOutput = aiResult.content || '';
            const hasGarbagePattern =
              // Internal metadata tags that shouldn't appear in final output
              /\(en\)|\(fr\)|\(tr\)|\(es\)|\(de\)/.test(weakOutput) || // Language tag leakage
              /\[(neutral|positive|negative|bullish|bearish)\]/.test(weakOutput) || // Sentiment tag leakage
              /تأثير:\s*(low|medium|high)/.test(weakOutput) || // Arabic impact tag leakage
              /\[غير عربي/.test(weakOutput) || // Translation flag leakage
              // Mixed language artifacts (Spanish news in English response, etc.)
              /Asertaciones|Análisis técnico|precio del oro|inversores/i.test(weakOutput) || // Spanish in non-Spanish response
              // Too short = truncated/failure
              weakOutput.length < 200 ||
              // Excessive repetition of the same line (nvidia pattern)
              (weakOutput.match(/^(.+)$/gm) || []).some((line, _i, arr) =>
                arr.filter(l => l.trim() === line.trim()).length > 3
              );
            if (hasGarbagePattern) {
              console.warn(`[V1005] Weak model output failed quality check (${weakOutput.length} chars) — falling to data-only`);
              throw new Error(`Weak model output failed quality check (length=${weakOutput.length})`);
            }
          } catch (weakErr: any) {
            // Both tiers failed — rethrow to trigger data-only fallback
            throw new Error(`All providers failed (premium: ${premiumErr2.message?.slice(0, 60)}; weak: ${weakErr.message?.slice(0, 60)})`);
          }
        }
      }

      finalResponse = aiResult.content;
      responsePath = `ai-${aiResult.provider}${usedWeakFallback ? '-fallback' : ''}`;
      toolsUsed = [...toolsUsed, `ai:${aiResult.provider}`];
      console.log(`[V1000] Phase 3 complete: AI responded via ${aiResult.provider}${usedWeakFallback ? ' (weak fallback)' : ''} in ${aiResult.duration}ms — total: ${Date.now() - startTime}ms`);

      // Filter response for hallucinations
      const filterResult = filterResponse(finalResponse, dbData, locale);
      finalResponse = filterResult.response;

      if (filterResult.warnings.length > 0) {
        console.warn(`[V1000] Filter warnings (${filterResult.warnings.length}): ${filterResult.warnings.slice(0, 3).join('; ')}`);
      }
    } catch (aiErr: any) {
      // AI failed — fall back to data-only response
      console.warn(`[V1000] ALL AI providers failed: ${aiErr.message?.slice(0, 100)} — falling back to data-only`);
      finalResponse = buildDataOnlyFallback(dbData, realtimeData, locale, sanitizedMessage);
      responsePath = 'data-only-fallback';
    }

    // ── Post-processing ──
    finalResponse = cleanResponse(finalResponse, locale);

    // ── Streaming Response ──
    const metadata = {
      sources: toolsUsed.length > 0 ? toolsUsed : undefined,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
      path: responsePath,
      dataPoints: dbData.dataPoints,
      fetchTimeMs: dbData.fetchTimeMs,
      realtimePricesFound: realtimeData.prices.filter(p => p.price !== null).length,
      locale,
      timestamp: new Date().toISOString(),
      version: 'V1000',
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // V1006: Progressive streaming — word-by-word with natural pacing
          // Instead of 8-char chunks (which flush instantly), send word by word
          // with small delays for a natural "typing" effect.
          // Split on word boundaries while preserving whitespace and markdown.
          const tokens = finalResponse.match(/\S+\s*|\s+/g) || [finalResponse];

          for (let i = 0; i < tokens.length; i++) {
            controller.enqueue(encoder.encode(tokens[i]));
            // Adaptive delay: faster for short responses, slower for long ones
            // Also pause longer at sentence endings for readability
            const token = tokens[i];
            const isSentenceEnd = /[.!?؟]\s*$/.test(token);
            const isParagraphBreak = /\n\s*\n/.test(token);

            if (isParagraphBreak) {
              await new Promise(r => setTimeout(r, 80)); // Brief pause at paragraphs
            } else if (isSentenceEnd) {
              await new Promise(r => setTimeout(r, 40)); // Small pause at sentences
            } else if (i % 3 === 0) {
              await new Promise(r => setTimeout(r, 12)); // Tiny pause every 3 words
            }
          }
          controller.enqueue(encoder.encode('\n\n__ROUAA_METADATA__\n'));
          controller.enqueue(encoder.encode(JSON.stringify(metadata)));
          controller.close();
        } catch (streamErr: any) {
          controller.error(streamErr);
        }
      },
    });

    const totalTime = Date.now() - startTime;
    console.log(`[V1000] Complete: ${responsePath} | ${totalTime}ms total | ${dbData.dataPoints} DB points | ${realtimeData.prices.filter(p => p.price !== null).length} realtime prices | ${finalResponse.length} chars`);

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Response-Locale': locale,
        'X-Stream-Mode': 'true',
        'X-Response-Path': responsePath,
        'X-Response-Time': `${totalTime}ms`,
        'X-Response-Version': 'V1000',
      },
    });

  } catch (error: any) {
    console.error('[V1000] Unhandled error:', error);
    return NextResponse.json({
      response: 'عذراً، حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
      error: 'Internal error',
      locale: 'ar',
      timestamp: new Date().toISOString(),
    });
  }
}

// Helper
function isAr(locale: Locale): boolean {
  return locale === 'ar';
}
