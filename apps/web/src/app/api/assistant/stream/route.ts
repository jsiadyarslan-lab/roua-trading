// ─── Streaming Assistant API ─────────────────────────────────────
// POST /api/assistant/stream
// SSE (Server-Sent Events) streaming variant of the Unified Assistant API.
// Sends status updates during processing, then streams the response in chunks.
// This provides a much better UX compared to waiting for the full JSON response.

import { z } from 'zod';
import { sanitizePromptInput } from '@/lib/sanitize';
import { chatCompletion } from '@/lib/ai-provider';
import { hasToolCall, stripToolCallMarkup, parseToolCall, type Locale } from '@/lib/assistant/tools';
import { processToolCalls, executeTool, formatToolResults } from '@/lib/assistant/tool-executor';
import { buildSystemPrompt, type PromptContext } from '@/lib/assistant/prompt-builder';
import { buildAssistantContext } from '@/lib/assistant/context-builder';
import { fetchAssetData, detectAsset, fetchMultipleAssetData } from '@/lib/assistant/data-fetcher';
import { buildDataContext, buildHTMLCards, buildAgenticAnalysis } from '@/lib/assistant/response-builder';
import { detectPositionSizingQuestion, calculatePositionSize, buildPositionSizeHTML } from '@/lib/assistant/position-calculator';
// V575: markdown-it لتحويل Markdown → HTML في stream route
// V577: html:true لتمرير HTML tags الموجودة بدون تعديل (لـ HTML cards)
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt({ html: true, breaks: true, linkify: true });

function preprocessMarkdown(text: string): string {
  let out = text;

  // V580: دمج خلايا الجدول المبعثرة + إضافة separator تلقائياً
  out = out.replace(/(?:^[ \t]*\|[^\n]+\n?)+/gm, (block) => {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
    if (lines.length < 2) return block;
    // ادمج الأسطر في سطر واحد (صف جدول واحد)
    const merged = lines.join(' ').replace(/\|\s*\|/g, '|');
    return merged + '\n';
  });

  // V580.2: إزالة الأسطر الفارغة بين صفوف الجدول (سطور تحوي |)
  // كرر العملية عدة مرات للحالات المتعددة
  for (let i = 0; i < 5; i++) {
    const before = out;
    out = out.replace(/([^\n]*\|[^\n]*)\n\s*\n\s*([^\n]*\|)/g, '$1\n$2');
    if (out === before) break;
  }

  // V580.1: لو صفين متتاليين يحويان | وليس بينهما separator، أضف separator تلقائياً
  // ملاحظة: السطر قد لا ينتهي بـ | (الـ LLM أحياناً ينسى | الأخيرة)
  out = out.replace(/^(\|[^\n]+)\n(\|[^\n]+)/gm, (match: string, header: string, firstRow: string) => {
    if (header.includes('---')) return match;
    // أضف | في نهاية header لو ناقصة
    const cleanHeader = header.trim().endsWith('|') ? header : header + ' |';
    const colCount = (cleanHeader.match(/\|/g) || []).length - 1;
    if (colCount < 2) return match;
    const separator = '|' + Array(colCount).fill('---').join('|') + '|';
    return cleanHeader + '\n' + separator + '\n' + firstRow;
  });

  // V575.2: فصل --- ### قبل أي شيء آخر
  out = out.replace(/\|\s+---\s+###\s/g, '|\n---\n### ');
  out = out.replace(/\|\s+---\s+##\s/g, '|\n---\n## ');
  out = out.replace(/\|\s+---\s+#\s/g, '|\n---\n# ');
  out = out.replace(/\|\s+---\s+/g, '|\n---\n');

  // حماية table separators و rows
  const tableSeparators: string[] = [];
  out = out.replace(/\|[-:\s|]+\|/g, (m) => { tableSeparators.push(m); return `__TS_${tableSeparators.length - 1}__`; });
  const tableRows: string[] = [];
  out = out.replace(/\|[^\n]+\|/g, (m) => { if ((m.match(/\|/g) || []).length >= 3) { tableRows.push(m); return `__TR_${tableRows.length - 1}__`; } return m; });

  // فصل --- و ###
  out = out.replace(/(\S)\s+---\s+/g, '$1\n---\n');
  out = out.replace(/\s+---\s+(\S)/g, '\n---\n$1');
  out = out.replace(/([^\n\s])\s+---/g, '$1\n---');
  out = out.replace(/([^\n])\s+###\s+/g, '$1\n### ');
  out = out.replace(/([^\n])\s+##\s+/g, '$1\n## ');
  out = out.replace(/([^\n])\s+#\s+/g, '$1\n# ');
  out = out.replace(/(#{1,4}\s+[^\n]+?)\s+(__TR_\d+__)/g, '$1\n$2');

  // استعادة
  out = out.replace(/__TR_(\d+)__/g, (_m, i) => tableRows[parseInt(i, 10)]);
  out = out.replace(/__TS_(\d+)__/g, (_m, i) => tableSeparators[parseInt(i, 10)]);
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

function markdownToHtml(markdown: string): string {
  try {
    return md.render(preprocessMarkdown(markdown));
  } catch {
    return markdown;
  }
}

export const dynamic = 'force-dynamic';

// ─── Request Schema (same as non-streaming) ─────────────────────

const AssistantSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
  locale: z.enum(['ar', 'en', 'fr', 'tr', 'es']).optional(),
  language: z.string().optional(), // V591: الـ frontend يرسل "language" وليس "locale"
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(20).optional(),
  pageUrl: z.string().max(500).optional(),
  userId: z.string().optional(),
  reportId: z.string().optional(),
  reportType: z.enum(['economic_report', 'report', 'market_analysis', 'analysis']).optional(),
  conversationMemory: z.string().max(2000).optional(),
  deepSearch: z.boolean().optional(),
});

// ─── Fallback responses ────────────────────────────────────────

const FALLBACK_RESPONSES: Record<Locale, (query: string) => string> = {
  ar: (query) => `شكراً لسؤالك عن "${query.slice(0, 60)}". أواجه صعوبة مؤقتة في الوصول لبياناتي. يرجى المحاولة مرة أخرى بعد لحظات.`,
  en: (query) => `Thank you for your question about "${query.slice(0, 60)}". I'm temporarily having difficulty accessing my data. Please try again in a moment.`,
  fr: (query) => `Merci pour votre question sur "${query.slice(0, 60)}". J'ai temporairement des difficultés à accéder à mes données. Veuillez réessayer dans un instant.`,
  tr: (query) => `"${query.slice(0, 60)}" hakkındaki sorunuz için teşekkürler. Verilerime erişmekte geçici olarak zorlanıyorum. Lütfen biraz sonra tekrar deneyin.`,
  es: (query) => `Gracias por tu pregunta sobre "${query.slice(0, 60)}". Estoy teniendo dificultades temporales para acceder a mis datos. Por favor, inténtalo de nuevo.`,
};

// ─── Strip External URLs ───────────────────────────────────────

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

// ─── Status messages ───────────────────────────────────────────

const STATUS_MESSAGES: Record<Locale, string[]> = {
  ar: ['جاري تحليل سؤالك...', 'جاري جمع البيانات...', 'جاري تحضير الإجابة...'],
  en: ['Analyzing your question...', 'Gathering data...', 'Preparing your answer...'],
  fr: ['Analyse de votre question...', 'Collecte des données...', 'Préparation de la réponse...'],
  tr: ['Sorunuz analiz ediliyor...', 'Veriler toplanıyor...', 'Yanıtınız hazırlanıyor...'],
  es: ['Analizando tu pregunta...', 'Recopilando datos...', 'Preparando tu respuesta...'],
};

// ─── SSE Helper ────────────────────────────────────────────────

function sseEvent(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Main Handler ──────────────────────────────────────────────

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  // Validate input
  const body = await request.json();
  const parsed = AssistantSchema.safeParse(body);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    return new Response(JSON.stringify({ error: firstError }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { message, history, pageUrl, userId, reportId, reportType } = parsed.data;
  // V591: الـ frontend يرسل "language" وليس "locale" — اقبل كليهما
  const rawLocale = (parsed.data.locale || parsed.data.language || 'ar') as Locale;
  const locale: Locale = rawLocale;

  // V590: اكتشاف اللغة الفعلية من السؤال — يدعم كل اللغات المدعومة
  // لو السؤال لا يحوي أحرف عربية و locale=ar (default)، حدد اللغة من المحتوى
  const isArabicText = /[\u0600-\u06FF]/.test(parsed.data.message);
  let effectiveLocale: Locale = locale;
  if (!isArabicText && locale === 'ar') {
    const langPatterns: Array<{ lang: Locale; pattern: RegExp }> = [
      { lang: 'fr', pattern: /[àâéèêëïîôùûüÿçÀÂÉÈÊËÏÎÔÙÛÜŸÇ]|\b(le|la|les|de|du|et|que|qui|dans|pour|sur|avec|sans)\b/i },
      { lang: 'tr', pattern: /[güşıöçGÜŞİÖÇ]|\b(ve|bir|bu|şu|için|ile|ama|çünkü|nasıl|ne)\b/i },
      { lang: 'es', pattern: /[ñ¿¡]|\b(el|la|los|las|de|y|que|en|para|con|sin|cómo|qué)\b/i },
      { lang: 'en', pattern: /\b(the|is|are|what|how|why|when|where|analyze|analysis|market|price|trade|buy|sell|position|stock|gold|bitcoin)\b/i },
    ];
    for (const { lang, pattern } of langPatterns) {
      if (pattern.test(parsed.data.message)) {
        effectiveLocale = lang;
        break;
      }
    }
    if (effectiveLocale === 'ar') effectiveLocale = 'en';
  }

  const sanitizedMessage = sanitizePromptInput(message);

  // V477: استخراج session cookie لتمريره لـ NestJS
  const sessionCookie = request.headers.get('cookie') || '';
  const rouaSession = sessionCookie.match(/roua_session=([^;]+)/)?.[1] || undefined;

  if (!sanitizedMessage || sanitizedMessage.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Message is empty after sanitization' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch { /* stream closed */ }
      };

      try {
        // ── Step 1: Send status — Analyzing ──
        send('status', { message: STATUS_MESSAGES[effectiveLocale][0] });

        // Build context
        let context;
        try {
          context = await buildAssistantContext({
            message: sanitizedMessage,
            locale: effectiveLocale,
            pageUrl,
            userId,
            reportId,
            reportType,
          });
        } catch (ctxErr: any) {
          console.warn('[Stream API] Context build failed:', ctxErr.message);
          context = {
            pageUrl, pageType: undefined, pageContent: undefined,
            userContext: undefined, marketContext: undefined,
            relatedArticles: undefined, marketPulse: undefined,
            userProfileContext: undefined, sources: [],
          };
        }

        // ── Step 2: Send status — Gathering data ──
        send('status', { message: STATUS_MESSAGES[effectiveLocale][1] });

        // Build system prompt
        const promptContext: PromptContext = {
          locale: effectiveLocale,
          pageUrl: context.pageUrl,
          pageType: context.pageType,
          pageContent: context.pageContent,
          userContext: context.userContext,
          marketContext: context.marketContext,
          relatedArticles: context.relatedArticles,
          marketPulse: context.marketPulse,
          userProfileContext: context.userProfileContext,
          crossReferenceContext: (context as any).crossReferenceContext,
          conversationMemory: body.conversationMemory,
        };
        const systemPrompt = buildSystemPrompt(promptContext);

        // Build messages array
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
        ];
        if (history && history.length > 0) {
          for (const msg of history.slice(-10)) {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
        messages.push({ role: 'user', content: sanitizedMessage });

        // Commodity/forex hints
        const COMMODITY_HINTS: Record<Locale, Record<string, string>> = {
          ar: { 'ذهب': 'استخدم search_by_asset برمز XAUUSD', 'الذهب': 'استخدم search_by_asset برمز XAUUSD', 'فضة': 'استخدم search_by_asset برمز XAGUSD', 'نفط': 'استخدم search_by_asset برمز CL' },
          en: { 'gold': 'Use search_by_asset with XAUUSD', 'silver': 'Use search_by_asset with XAGUSD', 'oil': 'Use search_by_asset with CL' },
          fr: { 'or': 'Utilisez search_by_asset avec XAUUSD', 'argent': 'Utilisez search_by_asset avec XAGUSD' },
          tr: { 'altın': 'search_by_asset kullanın XAUUSD', 'gümüş': 'search_by_asset kullanın XAGUSD' },
          es: { 'oro': 'Usa search_by_asset con XAUUSD', 'plata': 'Usa search_by_asset con XAGUSD' },
        };
        const msgLower = sanitizedMessage.toLowerCase();
        const hints = COMMODITY_HINTS[effectiveLocale] || COMMODITY_HINTS.en;
        for (const [keyword, hint] of Object.entries(hints)) {
          if (msgLower.includes(keyword)) {
            messages.push({ role: 'system', content: `💡 ${hint}` });
            break;
          }
        }

        // ── Process: Position sizing, data fetching, AI ──
        let finalResponse = '';
        let toolCallsUsed: string[] = [];
        let isHtmlResponse = false;
        let positionSizingHandled = false;
        let preFetchedDataBundle: Awaited<ReturnType<typeof fetchAssetData>> | null = null;
        let preBundle: any = null;
        let preFetchedToolData: string | null = null;
        let currentMessages = [...messages];
        let aiFailed = false;
        let lastToolFormattedResults: string | null = null;

        // Position sizing check
        const posSizingParams = detectPositionSizingQuestion(sanitizedMessage, effectiveLocale);
        if (posSizingParams?.isPositionSizingQuestion) {
          let detectedAsset = detectAsset(sanitizedMessage, effectiveLocale);
          if (!detectedAsset && history && history.length > 0) {
            for (let i = history.length - 1; i >= 0; i--) {
              const histAsset = detectAsset(history[i].content, effectiveLocale);
              if (histAsset) { detectedAsset = histAsset; break; }
            }
          }
          if (detectedAsset) {
            try {
              const assetData = await fetchAssetData(sanitizedMessage, effectiveLocale, userId, rouaSession) as any;
              if (assetData?.price) {
                const currentPrice = assetData.price.current;
                const tradeSetup = assetData.technical?.tradeSetup;
                let entryPrice = currentPrice, stopLossPrice: number, targetPrice: number | undefined, direction: 'long' | 'short' | 'wait' = 'long';
                if (tradeSetup && tradeSetup.entry > 0 && tradeSetup.stopLoss > 0) {
                  entryPrice = tradeSetup.entry || currentPrice;
                  stopLossPrice = tradeSetup.stopLoss;
                  targetPrice = tradeSetup.target > 0 ? tradeSetup.target : undefined;
                  direction = tradeSetup.direction;
                } else {
                  const atr = assetData.technical?.atr;
                  if (atr && atr > 0) {
                    const slDistance = atr * 1.5;
                    if (assetData.technical?.trend.direction === 'bearish') {
                      direction = 'short'; stopLossPrice = currentPrice + slDistance; targetPrice = currentPrice - slDistance * 2;
                    } else {
                      direction = 'long'; stopLossPrice = currentPrice - slDistance; targetPrice = currentPrice + slDistance * 2;
                    }
                  } else {
                    stopLossPrice = currentPrice * 0.99; targetPrice = currentPrice * 1.02; direction = 'long';
                  }
                }
                const posResult = calculatePositionSize(detectedAsset.symbol, posSizingParams.accountSize || 1000, posSizingParams.riskPercent || 2, entryPrice, stopLossPrice, direction === 'wait' ? 'long' : direction, targetPrice);
                if (posResult) {
                  finalResponse = buildPositionSizeHTML(posResult, effectiveLocale, assetData);
                  isHtmlResponse = true; positionSizingHandled = true;
                  toolCallsUsed.push(`position_calculator (${detectedAsset.symbol})`);
                  preFetchedDataBundle = assetData;
                }
              }
            } catch { /* Fall through */ }
          } else {
            const NO_ASSET_MSGS: Record<Locale, string> = {
              ar: 'لحساب حجم العقد، أحتاج معرفة الأصل الذي تريد تداوله. ما هو الأصل؟',
              en: 'To calculate position size, I need to know which asset you\'re trading. Which asset?',
              fr: 'Pour calculer la taille de position, je dois savoir quel actif vous tradez.',
              tr: 'Pozisyon boyutunu hesaplamak için hangi varlığı işlemdiğinizi bilmem gerekiyor.',
              es: 'Para calcular el tamaño de posición, necesito saber qué activo estás operando.',
            };
            finalResponse = NO_ASSET_MSGS[effectiveLocale]; positionSizingHandled = true;
          }
        }

        // ── Step 3: Send status — Preparing answer ──
        send('status', { message: STATUS_MESSAGES[effectiveLocale][2] });

        // V9: Primary path — data fetching + HTML cards
        let earlyHtmlSent = false;
        if (!positionSizingHandled) {
          // V10: First try multi-asset detection (comparison queries like "AAPL vs MSFT")
          try {
            const multiResult = await fetchMultipleAssetData(sanitizedMessage, effectiveLocale) as any;
            if (multiResult && multiResult.bundles.size >= 2) {
              // Build HTML cards and context for EACH asset, then combine
              let combinedHtml = '';
              let combinedContext = '';
              for (const [symbol, bundle] of multiResult.bundles) {
                const htmlCards = buildHTMLCards(bundle, effectiveLocale);
                const contextData = buildDataContext(bundle, effectiveLocale);
                combinedHtml += htmlCards + '\n';
                combinedContext += `\n\n═══ ${symbol} ═══\n${contextData}`;

                const dataSources: string[] = [];
                if (bundle.price) dataSources.push('price');
                if (bundle.technical) dataSources.push('technical');
                if (bundle.signal) dataSources.push('signal');
                if (bundle.news.length > 0) dataSources.push('news');
                if (bundle.events.length > 0) dataSources.push('events');
                if (bundle.reports.length > 0) dataSources.push('reports');
                if (bundle.marketAnalysis) dataSources.push('analysis');
                if (bundle.fundamentals) dataSources.push('fundamentals');
                toolCallsUsed.push(`site data (${dataSources.join('+')})`);
              }

              // Send HTML cards immediately as the first chunk
              isHtmlResponse = true;
              send('token', { content: combinedHtml, index: 0 });
              earlyHtmlSent = true;

              let aiAnalysis = '';
              try {
                send('status', { message: STATUS_MESSAGES[effectiveLocale][2] }); // "جاري تحضير الإجابة..."
                aiAnalysis = await buildAgenticAnalysis(
                  sanitizedMessage,
                  combinedContext,
                  effectiveLocale,
                  multiResult.primary!,
                  history,
                );
              } catch { /* Cards only */ }

              finalResponse = aiAnalysis ? combinedHtml + '\n' + aiAnalysis : combinedHtml;
              preFetchedDataBundle = multiResult.primary;
            }
          } catch { /* Fall through to single-asset path */ }

          // Single-asset path (original)
          if (!finalResponse) {
            try {
              preFetchedDataBundle = await fetchAssetData(sanitizedMessage, effectiveLocale, userId, rouaSession);
            } catch { /* Continue without data */ }
          }
        }

        if (preFetchedDataBundle && !finalResponse) {
          preBundle = preFetchedDataBundle as any;
          const dataSources: string[] = [];
          if (preBundle.price) dataSources.push('price');
          if (preBundle.technical) dataSources.push('technical');
          if (preBundle.signal) dataSources.push('signal');
          if (preBundle.news.length > 0) dataSources.push('news');
          if (preBundle.events.length > 0) dataSources.push('events');
          if (preBundle.reports.length > 0) dataSources.push('reports');
          if (preBundle.marketAnalysis) dataSources.push('analysis');
          if (preBundle.fundamentals) dataSources.push('fundamentals');
          toolCallsUsed.push(`site data (${dataSources.join('+')})`);

          const htmlCards = buildHTMLCards(preBundle, effectiveLocale);
          preFetchedToolData = buildDataContext(preBundle, effectiveLocale);

          // Send HTML cards immediately as the first chunk
          isHtmlResponse = true;
          send('token', { content: htmlCards, index: 0 });
          earlyHtmlSent = true;

          let aiAnalysis = '';
          try {
            send('status', { message: STATUS_MESSAGES[effectiveLocale][2] }); // "جاري تحضير الإجابة..."
            aiAnalysis = await buildAgenticAnalysis(sanitizedMessage, preFetchedToolData, effectiveLocale, preBundle, history);
          } catch { /* Cards only */ }

          finalResponse = aiAnalysis ? htmlCards + '\n' + aiAnalysis : htmlCards;
        } else if (!finalResponse) {
          // V597: For general questions (no specific asset detected), auto-fetch
          // major market prices so the AI uses REAL data instead of hallucinating.
          const MAJOR_SYMBOLS = [
            'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT',
            'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD',
            'SPX500', 'US30', 'NAS100'
          ];
          try {
            const { fetchPrices } = await import('@/lib/assistant/data-fetcher');
            const majorPrices = await fetchPrices(MAJOR_SYMBOLS);
            if (majorPrices.length > 0) {
              const isAr = effectiveLocale === 'ar';
              let priceContext = isAr
                ? '\n\n═══ أسعار السوق الحالية (من قاعدة بيانات رؤى) ═══\n'
                : '\n\n═══ Current Market Prices (from Rouaa Database) ═══\n';
              for (const p of majorPrices) {
                const name = isAr && p.nameAr ? p.nameAr : p.name;
                const change = p.changePercent >= 0
                  ? `+${p.changePercent.toFixed(2)}%`
                  : `${p.changePercent.toFixed(2)}%`;
                const stale = p.isStale ? (isAr ? ' ⚠️ قد لا يكون محدثاً' : ' ⚠️ may be stale') : '';
                priceContext += `- ${name} (${p.symbol}): ${p.value.toLocaleString()} ${change}${stale}\n`;
              }
              priceContext += isAr
                ? '\n⚠️ استخدم هذه الأسعار الحقيقية فقط — لا تخترع أرقاماً.'
                : '\n⚠️ Use ONLY these real prices — do NOT invent numbers.';
              // Inject into the conversation
              currentMessages.push({ role: 'system', content: priceContext });
            }
          } catch {
            // Non-critical — continue without market prices
          }

          // No asset detected — use AI with tool calling
          const maxToolRounds = 3;
          for (let round = 0; round <= maxToolRounds; round++) {
            const result = await chatCompletion(
              currentMessages.map(m => ({ role: m.role, content: m.content })),
              { temperature: 0.5, maxTokens: 4000, locale: effectiveLocale, allowFallback: true }
            );
            const aiContent = result.content || '';

            if (hasToolCall(aiContent) && round < maxToolRounds) {
              let toolResult;
              try {
                const preParsed = parseToolCall(aiContent);
                if (preParsed && preParsed.tool === 'summarize_page'
                    && (!preParsed.params.pageUrl || preParsed.params.pageUrl.trim() === '')
                    && context.pageUrl) {
                  preParsed.params.pageUrl = context.pageUrl;
                  const directResult = await executeTool(preParsed.tool, preParsed.params, effectiveLocale, userId);
                  const formattedResults = formatToolResults([directResult]);
                  toolResult = { results: [directResult], formattedResults };
                } else {
                  toolResult = await processToolCalls(aiContent, effectiveLocale, userId);
                }
              } catch {
                finalResponse = stripToolCallMarkup(aiContent);
                break;
              }

              if (toolResult) {
                toolResult.results.forEach(r => { if (r.success) toolCallsUsed.push(r.toolName); });
                lastToolFormattedResults = toolResult.formattedResults;
                const strippedResponse = stripToolCallMarkup(aiContent);
                if (strippedResponse) currentMessages.push({ role: 'assistant', content: strippedResponse });
                const secondPassContext: PromptContext = {
                  locale: effectiveLocale, pageUrl: context.pageUrl, pageType: context.pageType,
                  pageContent: context.pageContent, userContext: context.userContext,
                  marketContext: context.marketContext, relatedArticles: context.relatedArticles,
                  toolResults: toolResult.formattedResults,
                  lastToolUsed: toolResult.results[0]?.toolName || '',
                };
                currentMessages.push({ role: 'system', content: buildSystemPrompt(secondPassContext) });
                continue;
              }
            }
            finalResponse = stripToolCallMarkup(aiContent);
            break;
          }
        }

        // Fallback if AI failed
        if (aiFailed || !finalResponse || finalResponse.trim().length === 0) {
          if (preFetchedDataBundle) {
            finalResponse = buildHTMLCards(preBundle, effectiveLocale);
            isHtmlResponse = true;
          } else if (aiFailed) {
            finalResponse = FALLBACK_RESPONSES[effectiveLocale](sanitizedMessage);
          } else {
            finalResponse = effectiveLocale === 'ar' ? 'عذراً، لم أتمكن من معالجة طلبك. يرجى المحاولة مرة أخرى.' : 'Sorry, I could not process your request. Please try again.';
          }
        }

        // Post-processing
        finalResponse = stripExternalUrls(finalResponse);

        // V588: تنظيف عام (كل اللغات)
        // استبدل [data unavailable] و [بيانات غير متاحة] بـ -
        finalResponse = finalResponse
          .replace(/\[data unavailable\]/gi, '-')
          .replace(/\[بيانات غير متاحة\]/gi, '-')
          .replace(/\[بيانات غير متوفرة\]/gi, '-')
          .replace(/\[not available\]/gi, '-')
          .replace(/\[N\/A\]/gi, '-')
          .replace(/\bnull\b/gi, '-')
          .replace(/\bundefined\b/gi, '-');

        // V588: إزالة أقسام Fibonacci المخترعة (LLM يهلوسها رغم المنع)
        finalResponse = finalResponse
          .replace(/Fibonacci Retracement.*?(?=\n(?:###|##|---|\d️⃣|🚦|Risk|$))/gs, '')
          .replace(/Fibonacci.*?Levels?.*?(?=\n(?:###|##|---|\d️⃣|🚦|Risk|$))/gs, '')
          .replace(/\| *23\.6%.*?\n/g, '')
          .replace(/\| *38\.2%.*?\n/g, '')
          .replace(/\| *50%.*?\n/g, '')
          .replace(/\| *61\.8%.*?\n/g, '')
          .replace(/\| *78\.6%.*?\n/g, '');

        // V588: إزالة الاحتمالات المخترعة ("72% of the time", "68% probable")
        finalResponse = finalResponse
          .replace(/\d+% of the time/gi, '')
          .replace(/\d+% probable/gi, '')
          .replace(/historically precedes/gi, 'may precede')
          .replace(/historically.*?reversed/gi, 'may reverse');

        if (effectiveLocale === 'ar') {
          finalResponse = finalResponse
            .replace(/[\u0E00-\u0E7F]/g, '')
            .replace(/[\u4E00-\u9FFF]/g, '')
            .replace(/[\u3040-\u309F]/g, '')
            .replace(/[\u30A0-\u30FF]/g, '')
            .replace(/[\uAC00-\uD7AF]/g, '')
            .replace(/[\u1100-\u11FF]/g, '')
            .replace(/[\u0400-\u04FF]/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        } else {
          // V590: تنظيف الردود غير العربية من الكلمات العربية المتسربة
          // يدعم كل اللغات (ليس فقط الإنجليزية) — يستبدل الكلمات العربية بالترجمة الإنجليزية
          // لأن الـ LLM يخلط العربية مع أي لغة أخرى
          const AR_TO_EN_TABLE_HEADERS: Record<string, string> = {
            'الأصل': 'Asset',
            'النوع': 'Type',
            'الدخول': 'Entry',
            'الحالي': 'Current',
            'السعر': 'Price',
            'الاتجاه': 'Trend',
            'التغير': 'Change',
            '(24س)': '(24h)',
            'الأولوية': 'Priority',
            'الحالة': 'Status',
            'السيناريو': 'Scenario',
            'الشروط': 'Conditions',
            'نطاق السعر': 'Price Range',
            'نطاق السعر أو الهدف': 'Price Target',
            'الاحتمال': 'Probability',
            'الاحتمالية': 'Probability',
            'الإجراء': 'Action',
            'التوصية': 'Recommendation',
            'المستوى': 'Level',
            'الهدف': 'Target',
            'المقترح': 'Proposed',
          };
          for (const [ar, en] of Object.entries(AR_TO_EN_TABLE_HEADERS)) {
            // استبدل في كل النص (Markdown + HTML + نص عادي)
            finalResponse = finalResponse.replace(new RegExp(ar, 'g'), en);
          }
          // إزالة أي نص عربي متبقي داخل HTML tags (<th>عربي</th> → <th>-</th>)
          finalResponse = finalResponse.replace(/<([a-z]+)>([\s\u0600-\u06FF]+)<\/\1>/gi, (match, tag, content) => {
            const cleaned = content.replace(/[\u0600-\u06FF]+/g, '').trim();
            return `<${tag}>${cleaned || '-'}</${tag}>`;
          });
          // إزالة أي نص عربي متبقي في خلايا الجداول Markdown (| عربي | → | - |)
          finalResponse = finalResponse.replace(/\|[\s\u0600-\u06FF]+\|/g, (match) => {
            const cleaned = match.replace(/[\u0600-\u06FF]+/g, '').trim();
            return cleaned || '| - |';
          });
        }

        // V577: دائماً حوّل Markdown → HTML (حتى لو isHtmlResponse=true)
        // السبب: HTML cards تكون بالفعل HTML، لكن نص الـ AI يكون Markdown
        // markdown-it مع html:true يمرر HTML الموجود بدون تعديل
        if (finalResponse) {
          finalResponse = markdownToHtml(finalResponse);
          isHtmlResponse = true;
        }

        // ── Stream the response in chunks ──
        // If HTML cards were already sent early, only stream the AI analysis part.
        // The "finalResponse" contains both HTML + AI analysis combined.
        // We need to extract just the AI analysis part for streaming.

        if (earlyHtmlSent && finalResponse) {
          // V578: بعد markdownToHtml، الـ finalResponse كله HTML
          // أرسله كـ chunk واحد بدون تقسيم (التقسيم يكسر HTML tags)
          let aiTextPart = finalResponse;

          // لو HTML cards أُرسلت مبكراً، افصلها (لو تطابقت)
          const htmlCardsContent = preFetchedDataBundle
            ? buildHTMLCards(preBundle, effectiveLocale)
            : '';
          if (htmlCardsContent && finalResponse.startsWith(htmlCardsContent)) {
            aiTextPart = finalResponse.slice(htmlCardsContent.length).trim();
          }

          if (aiTextPart) {
            // V578: أرسل HTML كـ chunk واحد — لا تقسمه
            send('token', { content: aiTextPart, index: 1 });
          }
        } else if (finalResponse) {
          // V578: لا تقسم HTML — أرسله كـ chunk واحد كامل
          // التقسيم يكسر HTML tags (مثل <table> → < + table + >)
          // الواجهة تعرضها كنص خام بدلاً من HTML مرئي
          if (isHtmlResponse) {
            // HTML response: أرسل كـ chunk واحد
            send('token', { content: finalResponse, index: 0 });
          } else {
            // Text response: word-by-word typewriter effect
            const CHUNK_SIZE = 8;
            const words = finalResponse.split(/(\s+)/);
            let buffer = '';
            let chunkIndex = 0;

            for (let i = 0; i < words.length; i++) {
              buffer += words[i];
              const wordCount = buffer.split(/\S+/).length - 1;
              if (wordCount >= CHUNK_SIZE || i === words.length - 1) {
                send('token', { content: buffer, index: chunkIndex });
                chunkIndex++;
                buffer = '';
                if (i < words.length - 1) {
                  await new Promise(r => setTimeout(r, 20));
                }
              }
            }
          }
        }

        // ── Send done event with metadata ──
        // NOTE: toolsUsed and sources are NOT sent to the client to keep UX clean
        send('done', {
          isHtml: isHtmlResponse || undefined,
          locale: effectiveLocale,
          timestamp: new Date().toISOString(),
        });

      } catch (error: any) {
        console.error('[Stream API] Error:', error);
        send('error', {
          message: effectiveLocale === "ar"
            ? 'عذراً، حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.'
            : 'Sorry, an unexpected error occurred. Please try again.',
        });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
