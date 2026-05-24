import { NextRequest, NextResponse } from 'next/server'
import { buildScannerResult, fetchMarketContext, PRIMARY_SYMBOLS } from '@/lib/trading-intelligence'
import { verifyUserSession } from '@/lib/session-auth'

/**
 * POST /api/ai/chat
 *
 * Smart AI chat endpoint that:
 * 1. Tries NestJS AI orchestrator (real AI models: Groq, GLM-4, Gemini + RAG)
 * 2. Falls back to local algorithmic analysis if NestJS is unavailable
 *
 * Body: { message, symbol?, history?, type?, style?, language? }
 *
 * SECURITY: Requires authentication to prevent abuse of AI API credits.
 */
export async function POST(req: NextRequest) {
  // ── Auth check: Prevent unauthorized AI credit abuse ──
  const session = await verifyUserSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Login required to use the smart assistant' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      message,
      symbol = 'BTC/USD',
      history = [],
      type = 'market_analysis',
      style = 'professional',
      language = 'ar',
    } = body

    const isEn = language === 'en'

    if (!message || !message.trim()) {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 })
    }

    const origin = req.nextUrl.origin
    const startedAt = Date.now()

    // Use internal API URL to avoid circular self-fetch through Next.js router
    // FIX: If no internal URL is configured, we MUST skip the NestJS call entirely
    // because falling back to ${origin} creates a circular request loop:
    // /api/ai/chat → ${origin}/api/ai/analyze → Next.js route → infinite loop
    const apiInternalUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL
    const hasInternalUrl = !!(apiInternalUrl && apiInternalUrl !== origin)

    // ── Step 1: Try NestJS AI orchestrator (real AI models) ──
    // Only attempt if we have a non-circular internal URL
    if (hasInternalUrl) {
      try {
        const contextPrompt = buildContextPrompt(message, symbol, style, language)

        const nestjsRes = await fetch(`${apiInternalUrl}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: contextPrompt,
          type: mapToAIType(message, type),
          symbol,
          language,
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      })

      if (nestjsRes.ok) {
        const nestjsData = await nestjsRes.json()
        if (nestjsData.success && nestjsData.data && nestjsData.data.confidence > 0) {
          return NextResponse.json({
            success: true,
            data: {
              content: nestjsData.data.content,
              model: nestjsData.data.model,
              confidence: nestjsData.data.confidence,
              processingTimeMs: Date.now() - startedAt,
              source: 'ai-orchestrator',
              language: nestjsData.data.language || language,
            },
          })
        }
      }
    } catch (e: any) {
      console.log('[ai/chat] NestJS unavailable, falling back to local analysis:', e?.message || e)
    }
    } // end if (hasInternalUrl)

    // ── Step 2: Fallback to local algorithmic analysis ──
    return await localAnalysisFallback(message, symbol, origin, startedAt, style, language)
  } catch (error: any) {
    console.error('[ai/chat] Error:', error?.message || error)
    const isEn = (error as any)?.language === 'en'
    return NextResponse.json({
      success: false,
      error: isEn ? 'An error occurred processing your request. Please try again.' : 'حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.',
      data: {
        content: isEn ? 'Sorry, an error occurred processing your request. Please try again.' : 'عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.',
        model: 'fallback',
        confidence: 0,
        processingTimeMs: 0,
        source: 'error-fallback',
        language: isEn ? 'en' : 'ar',
      },
    }, { status: 500 })
  }
}

// ── Helper: Build context-rich prompt (bilingual) ──
function buildContextPrompt(message: string, symbol: string, style: string, language: string): string {
  const isEn = language === 'en'

  const styleInstructionsEn: Record<string, string> = {
    professional: 'Answer in a professional and precise style, citing indicators and numbers.',
    abbreviated: 'Answer briefly and directly in 3-4 sentences only.',
    detailed: 'Answer in great detail, explaining each step and the reasoning behind each conclusion.',
  }

  const styleInstructionsAr: Record<string, string> = {
    professional: 'أجب بأسلوب احترافي ودقيق مع ذكر المؤشرات والأرقام.',
    abbreviated: 'أجب بشكل مختصر ومباشر في 3-4 جمل فقط.',
    detailed: 'أجب بشكل مفصل جداً مع شرح كل خطوة والسبب وراء كل استنتاج.',
  }

  if (isEn) {
    return `You are an expert financial analyst on the "Roua" trading platform. You speak English.

The user is asking about: ${symbol}
${styleInstructionsEn[style] || styleInstructionsEn.professional}

User's question: ${message}

Answer in English in a professional and helpful manner. If the question is about market analysis, mention technical indicators and key levels.`
  }

  return `أنت محلل مالي خبير في منصة "رؤى لربط الحسابات". أنت تتحدث باللغة العربية.

المستخدم يسأل عن: ${symbol}
${styleInstructionsAr[style] || styleInstructionsAr.professional}

سؤال المستخدم: ${message}

أجب بالعربية بشكل مهني ومفيد. إذا كان السؤال عن تحليل سوقي، اذكر المؤشرات الفنية والمستويات المهمة.`
}

// ── Helper: Map user message to AI task type ──
function mapToAIType(message: string, defaultType: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('مشاعر') || lower.includes('sentiment') || lower.includes('رأي السوق')) return 'sentiment'
  if (lower.includes('تنبؤ') || lower.includes('توقع') || lower.includes('prediction') || lower.includes('هامش')) return 'prediction'
  if (lower.includes('إشارة') || lower.includes('توصية') || lower.includes('شراء') || lower.includes('بيع') || lower.includes('signal')) return 'signal_generation'
  if (lower.includes('مخاطر') || lower.includes('وقف خسارة') || lower.includes('risk') || lower.includes('حذر')) return 'risk_analysis'
  return defaultType || 'market_analysis'
}

// ── Helper: Local algorithmic fallback (bilingual) ──
async function localAnalysisFallback(
  message: string,
  symbol: string,
  origin: string,
  startedAt: number,
  style: string,
  language: string,
): Promise<NextResponse> {
  const isEn = language === 'en'

  try {
    // Fetch market context for enriched local analysis
    const context = await fetchMarketContext(origin, symbol, '1h')
    const scanner = buildScannerResult(context)

    let content = ''

    if (!scanner) {
      content = isEn
        ? `Unable to get live data for ${symbol} at the moment. There may be an issue with the data source. You can try again later or choose a different asset.`
        : `لم أتمكن من الحصول على بيانات حية لـ ${symbol} حالياً. قد تكون هناك مشكلة في مصدر البيانات. يمكنك المحاولة لاحقاً أو اختيار أصل آخر.`
    } else {
      if (isEn) {
        const dirEn = scanner.dir === 'buy' ? 'Bullish' : scanner.dir === 'sell' ? 'Bearish' : 'Neutral'
        const rsiInterpretation = scanner.features.rsi < 30 ? 'Oversold (potential buy opportunity)' :
          scanner.features.rsi > 70 ? 'Overbought (potential sell opportunity)' :
          'Neutral range'
        const emaCross = scanner.features.ema20 > scanner.features.ema50 ? 'Bullish Cross (EMA20 above EMA50)' :
          'Bearish Cross (EMA20 below EMA50)'

        content = `${symbol} Analysis:

Direction: ${dirEn} (${scanner.strength}% confidence)
Current Price: ${scanner.price.toFixed(scanner.price > 100 ? 2 : 5)}
Change: ${scanner.change >= 0 ? '+' : ''}${scanner.change.toFixed(2)}%

Technical Indicators:
- RSI(14): ${Math.round(scanner.features.rsi)} — ${rsiInterpretation}
- EMA: ${emaCross}
- Signal Classification: ${scanner.signalClass}
- Entry Bias: ${scanner.entryBias}

Reasons: ${scanner.reasons.join(', ')}

Note: This analysis is based on a local algorithm. For deeper AI-powered analysis, make sure API keys are activated in settings.`
      } else {
        const dirAr = scanner.dir === 'buy' ? 'صاعد' : scanner.dir === 'sell' ? 'هابط' : 'محايد'
        const rsiInterpretation = scanner.features.rsi < 30 ? 'تشبع بيعي (فرصة شراء محتملة)' :
          scanner.features.rsi > 70 ? 'تشبع شرائي (فرصة بيع محتملة)' :
          'نطاق محايد'
        const emaCross = scanner.features.ema20 > scanner.features.ema50 ? 'تقاطع صاعد (EMA20 فوق EMA50)' :
          'تقاطع هابط (EMA20 تحت EMA50)'

        content = `تحليل ${symbol}:

التوجه: ${dirAr} (${scanner.strength}% ثقة)
السعر الحالي: ${scanner.price.toFixed(scanner.price > 100 ? 2 : 5)}
التغير: ${scanner.change >= 0 ? '+' : ''}${scanner.change.toFixed(2)}%

المؤشرات الفنية:
- RSI(14): ${Math.round(scanner.features.rsi)} — ${rsiInterpretation}
- EMA: ${emaCross}
- تصنيف الإشارة: ${scanner.signalClass}
- انحياز الدخول: ${scanner.entryBias}

الأسباب: ${scanner.reasons.join('، ')}

ملاحظة: هذا التحليل مبنى على خوارزمية محلية. لتحليل أعمق مدعوم بالذكاء الاصطناعي، تأكد من تفعيل مفاتيح API في الإعدادات.`
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        content,
        model: 'local-scanner',
        confidence: scanner ? Math.round(scanner.strength * 0.6) : 20,
        processingTimeMs: Date.now() - startedAt,
        source: 'local-fallback',
        language,
        scanner: scanner ? {
          dir: scanner.dir,
          strength: scanner.strength,
          price: scanner.price,
          change: scanner.change,
          rsi: Math.round(scanner.features.rsi),
          ema20: scanner.features.ema20,
          ema50: scanner.features.ema50,
          signalClass: scanner.signalClass,
          entryBias: scanner.entryBias,
          reasons: scanner.reasons,
          freshness: scanner.freshness,
        } : null,
      },
    })
  } catch (error: any) {
    console.error('[ai/chat] Local analysis fallback failed:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: isEn ? 'Local analysis failed' : 'فشل التحليل المحلي',
      data: {
        content: isEn
          ? `Unable to analyze ${symbol} at the moment. Please try again later.`
          : `لم أتمكن من تحليل ${symbol} حالياً. يرجى المحاولة لاحقاً.`,
        model: 'fallback',
        confidence: 0,
        processingTimeMs: Date.now() - startedAt,
        source: 'error-fallback',
        language,
      },
    }, { status: 500 })
  }
}
