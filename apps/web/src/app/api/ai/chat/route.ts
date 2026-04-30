import { NextRequest, NextResponse } from 'next/server'
import { buildScannerResult, fetchMarketContext, PRIMARY_SYMBOLS } from '@/lib/trading-intelligence'

/**
 * POST /api/ai/chat
 *
 * Smart AI chat endpoint that:
 * 1. Tries NestJS AI orchestrator (real AI models: Groq, GLM-4, Gemini + RAG)
 * 2. Falls back to local algorithmic analysis if NestJS is unavailable
 *
 * Body: { message, symbol?, history?, type?, style? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      message,
      symbol = 'BTC/USD',
      history = [],
      type = 'market_analysis',
      style = 'professional',
    } = body

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
        const contextPrompt = buildContextPrompt(message, symbol, style)

        const nestjsRes = await fetch(`${apiInternalUrl}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: contextPrompt,
          type: mapToAIType(message, type),
          symbol,
          language: 'ar',
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
              language: nestjsData.data.language || 'ar',
            },
          })
        }
      }
    } catch (e: any) {
      console.log('[ai/chat] NestJS unavailable, falling back to local analysis:', e?.message || e)
    }
    } // end if (hasInternalUrl)

    // ── Step 2: Fallback to local algorithmic analysis ──
    return await localAnalysisFallback(message, symbol, origin, startedAt, style)
  } catch (error: any) {
    console.error('[ai/chat] Error:', error?.message || error)
    return NextResponse.json({
      success: true,
      data: {
        content: 'عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.',
        model: 'fallback',
        confidence: 0,
        processingTimeMs: 0,
        source: 'error-fallback',
        language: 'ar',
      },
    })
  }
}

// ── Helper: Build context-rich prompt ──
function buildContextPrompt(message: string, symbol: string, style: string): string {
  const styleInstructions: Record<string, string> = {
    professional: 'أجب بأسلوب احترافي ودقيق مع ذكر المؤشرات والأرقام.',
    abbreviated: 'أجب بشكل مختصر ومباشر في 3-4 جمل فقط.',
    detailed: 'أجب بشكل مفصل جداً مع شرح كل خطوة والسبب وراء كل استنتاج.',
  }

  return `أنت محلل مالي خبير في منصة "رؤى للتداول". أنت تتحدث باللغة العربية.

المستخدم يسأل عن: ${symbol}
${styleInstructions[style] || styleInstructions.professional}

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

// ── Helper: Local algorithmic fallback ──
async function localAnalysisFallback(
  message: string,
  symbol: string,
  origin: string,
  startedAt: number,
  style: string,
): Promise<NextResponse> {
  try {
    // Fetch market context for enriched local analysis
    const context = await fetchMarketContext(origin, symbol, '1h')
    const scanner = buildScannerResult(context)

    let content = ''

    if (!scanner) {
      content = `لم أتمكن من الحصول على بيانات حية لـ ${symbol} حالياً. قد تكون هناك مشكلة في مصدر البيانات. يمكنك المحاولة لاحقاً أو اختيار أصل آخر.`
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

    return NextResponse.json({
      success: true,
      data: {
        content,
        model: 'local-scanner',
        confidence: scanner ? Math.round(scanner.strength * 0.6) : 20,
        processingTimeMs: Date.now() - startedAt,
        source: 'local-fallback',
        language: 'ar',
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
      success: true,
      data: {
        content: `لم أتمكن من تحليل ${symbol} حالياً. يرجى المحاولة لاحقاً.`,
        model: 'fallback',
        confidence: 0,
        processingTimeMs: Date.now() - startedAt,
        source: 'error-fallback',
        language: 'ar',
      },
    })
  }
}
