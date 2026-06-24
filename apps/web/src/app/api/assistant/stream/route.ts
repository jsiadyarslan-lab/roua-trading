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

export const dynamic = 'force-dynamic';

// ─── Request Schema (same as non-streaming) ─────────────────────

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
  const locale: Locale = parsed.data.locale || 'ar';
  const sanitizedMessage = sanitizePromptInput(message);

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
        send('status', { message: STATUS_MESSAGES[locale][0] });

        // Build context
        let context;
        try {
          context = await buildAssistantContext({
            message: sanitizedMessage,
            locale,
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
        send('status', { message: STATUS_MESSAGES[locale][1] });

        // Build system prompt
        const promptContext: PromptContext = {
          locale,
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
        const hints = COMMODITY_HINTS[locale] || COMMODITY_HINTS.en;
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
        const posSizingParams = detectPositionSizingQuestion(sanitizedMessage, locale);
        if (posSizingParams?.isPositionSizingQuestion) {
          let detectedAsset = detectAsset(sanitizedMessage, locale);
          if (!detectedAsset && history && history.length > 0) {
            for (let i = history.length - 1; i >= 0; i--) {
              const histAsset = detectAsset(history[i].content, locale);
              if (histAsset) { detectedAsset = histAsset; break; }
            }
          }
          if (detectedAsset) {
            try {
              const assetData = await fetchAssetData(sanitizedMessage, locale) as any;
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
                  finalResponse = buildPositionSizeHTML(posResult, locale, assetData);
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
            finalResponse = NO_ASSET_MSGS[locale]; positionSizingHandled = true;
          }
        }

        // ── Step 3: Send status — Preparing answer ──
        send('status', { message: STATUS_MESSAGES[locale][2] });

        // V9: Primary path — data fetching + HTML cards
        let earlyHtmlSent = false;
        if (!positionSizingHandled) {
          // V10: First try multi-asset detection (comparison queries like "AAPL vs MSFT")
          try {
            const multiResult = await fetchMultipleAssetData(sanitizedMessage, locale) as any;
            if (multiResult && multiResult.bundles.size >= 2) {
              // Build HTML cards and context for EACH asset, then combine
              let combinedHtml = '';
              let combinedContext = '';
              for (const [symbol, bundle] of multiResult.bundles) {
                const htmlCards = buildHTMLCards(bundle, locale);
                const contextData = buildDataContext(bundle, locale);
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
                send('status', { message: STATUS_MESSAGES[locale][2] }); // "جاري تحضير الإجابة..."
                aiAnalysis = await buildAgenticAnalysis(
                  sanitizedMessage,
                  combinedContext,
                  locale,
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
              preFetchedDataBundle = await fetchAssetData(sanitizedMessage, locale);
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

          const htmlCards = buildHTMLCards(preBundle, locale);
          preFetchedToolData = buildDataContext(preBundle, locale);

          // Send HTML cards immediately as the first chunk
          isHtmlResponse = true;
          send('token', { content: htmlCards, index: 0 });
          earlyHtmlSent = true;

          let aiAnalysis = '';
          try {
            send('status', { message: STATUS_MESSAGES[locale][2] }); // "جاري تحضير الإجابة..."
            aiAnalysis = await buildAgenticAnalysis(sanitizedMessage, preFetchedToolData, locale, preBundle, history);
          } catch { /* Cards only */ }

          finalResponse = aiAnalysis ? htmlCards + '\n' + aiAnalysis : htmlCards;
        } else if (!finalResponse) {
          // No asset detected — use AI with tool calling
          const maxToolRounds = 3;
          for (let round = 0; round <= maxToolRounds; round++) {
            const result = await chatCompletion(
              currentMessages.map(m => ({ role: m.role, content: m.content })),
              { temperature: 0.5, maxTokens: 2000, locale, allowFallback: true }
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
                  const directResult = await executeTool(preParsed.tool, preParsed.params, locale, userId);
                  const formattedResults = formatToolResults([directResult]);
                  toolResult = { results: [directResult], formattedResults };
                } else {
                  toolResult = await processToolCalls(aiContent, locale, userId);
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
                  locale, pageUrl: context.pageUrl, pageType: context.pageType,
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
            finalResponse = buildHTMLCards(preBundle, locale);
            isHtmlResponse = true;
          } else if (aiFailed) {
            finalResponse = FALLBACK_RESPONSES[locale](sanitizedMessage);
          } else {
            finalResponse = locale === 'ar' ? 'عذراً، لم أتمكن من معالجة طلبك. يرجى المحاولة مرة أخرى.' : 'Sorry, I could not process your request. Please try again.';
          }
        }

        // Post-processing
        finalResponse = stripExternalUrls(finalResponse);
        if (locale === 'ar') {
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
        }

        // ── Stream the response in chunks ──
        // If HTML cards were already sent early, only stream the AI analysis part.
        // The "finalResponse" contains both HTML + AI analysis combined.
        // We need to extract just the AI analysis part for streaming.

        if (earlyHtmlSent && finalResponse) {
          // Find where AI analysis starts (after the HTML cards)
          // The HTML cards were already sent, so find the AI text after them
          const htmlCardsContent = isHtmlResponse
            ? (preFetchedDataBundle
              ? buildHTMLCards(preBundle, locale)
              : '')
            : '';

          let aiTextPart = finalResponse;
          if (htmlCardsContent && finalResponse.startsWith(htmlCardsContent)) {
            aiTextPart = finalResponse.slice(htmlCardsContent.length).trim();
          }

          if (aiTextPart) {
            // Stream AI analysis text word-by-word for typewriter effect
            const CHUNK_SIZE = 6;
            const words = aiTextPart.split(/(\s+)/);
            let buffer = '';
            let chunkIndex = 1; // Start from 1 since 0 was the HTML cards

            for (let i = 0; i < words.length; i++) {
              buffer += words[i];
              const wordCount = buffer.split(/\S+/).length - 1;
              if (wordCount >= CHUNK_SIZE || i === words.length - 1) {
                send('token', { content: buffer, index: chunkIndex });
                chunkIndex++;
                buffer = '';
                if (i < words.length - 1) {
                  await new Promise(r => setTimeout(r, 25));
                }
              }
            }
          }
        } else if (finalResponse) {
          // No early HTML sent — stream the full response
          const isLargeHtml = isHtmlResponse && finalResponse.length > 2000;

          if (isLargeHtml) {
            // For large HTML: split at logical boundaries for faster streaming
            const segments = finalResponse.split(/(<\/div>|---|\n\n)/);
            let streamBuffer = '';
            let streamChunkIndex = 0;

            for (let i = 0; i < segments.length; i++) {
              streamBuffer += segments[i];
              if (i % 2 === 1 || i === segments.length - 1) {
                send('token', { content: streamBuffer, index: streamChunkIndex });
                streamChunkIndex++;
                streamBuffer = '';
                if (i < segments.length - 1) {
                  await new Promise(r => setTimeout(r, 30));
                }
              }
            }
          } else {
            // For text responses: word-by-word typewriter effect
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
          locale,
          timestamp: new Date().toISOString(),
        });

      } catch (error: any) {
        console.error('[Stream API] Error:', error);
        send('error', {
          message: locale === 'ar'
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
