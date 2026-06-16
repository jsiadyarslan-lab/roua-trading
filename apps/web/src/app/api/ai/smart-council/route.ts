// ═══════════════════════════════════════════════════════════
// ROUA Trading — AI Smart Council API Route
// POST /api/ai/smart-council
// Receives analysis payload from the Smart Analysis Panel and
// queries the AI model for a prediction. Uses z-ai-web-dev-sdk.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

// ── Rate Limiting ──
const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (rateLimitMap.size > 300) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key);
    }
  }

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true, retryAfterSec: 0 };
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit check
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const { allowed, retryAfterSec } = checkRateLimit(clientIp);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: `طلبات كثيرة. حاول بعد ${retryAfterSec} ثانية` },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'طلب غير صالح' }, { status: 400 });
    }

    const { prompt, symbol, currentPrice } = body;
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'البيانات مطلوبة' }, { status: 400 });
    }

    // ── Try z-ai-web-dev-sdk first ──
    try {
      const ZAI = await import('z-ai-web-dev-sdk').then(m => m.default.create());

      const completion = await ZAI.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `أنت محلل فني خبير في أسواق العملات الرقمية. حلل البيانات المقدمة وأعطِ توقعك.
أجب بهذا التنسيق فقط:
اتجاه: [صاعد/هابط/محايد]
ثقة: [رقم من 50 إلى 95]
الأسباب: [شرح مختصر بالعربية]`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
      });

      const responseText = completion.choices?.[0]?.message?.content || '';

      // Parse the AI response
      let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      let confidence = 0.5;
      let reasoningAr = responseText;

      if (responseText.includes('صاعد') || responseText.toLowerCase().includes('bullish')) {
        direction = 'bullish';
      } else if (responseText.includes('هابط') || responseText.toLowerCase().includes('bearish')) {
        direction = 'bearish';
      }

      // Extract confidence number
      const confMatch = responseText.match(/ثقة[:\s]*(\d+)/) || responseText.match(/confidence[:\s]*(\d+)/i);
      if (confMatch) {
        confidence = Math.min(0.95, Math.max(0.3, parseInt(confMatch[1]) / 100));
      } else {
        confidence = direction === 'neutral' ? 0.35 : 0.55;
      }

      // Extract reasoning
      const reasonMatch = responseText.match(/الأسباب[:\s]*([\s\S]+)/);
      if (reasonMatch) {
        reasoningAr = reasonMatch[1].trim().substring(0, 200);
      }

      return NextResponse.json({
        success: true,
        prediction: {
          model: 'zai-llm',
          direction,
          confidence,
          reasoningAr,
          timestamp: Date.now(),
        },
        source: 'z-ai-web-dev-sdk',
      });
    } catch (sdkError: any) {
      console.warn('[ai/smart-council] z-ai-web-dev-sdk failed:', sdkError?.message);
      // Fall through to GROQ fallback
    }

    // ── Fallback: GROQ API ──
    const groqApiKey = process.env.GROQ_API_KEY;
    if (groqApiKey) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              {
                role: 'system',
                content: `أنت محلل فني خبير في أسواق العملات الرقمية. حلل البيانات المقدمة وأعطِ توقعك.
أجب بهذا التنسيق فقط:
اتجاه: [صاعد/هابط/محايد]
ثقة: [رقم من 50 إلى 95]
الأسباب: [شرح مختصر بالعربية]`,
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 300,
          }),
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const responseText = groqData.choices?.[0]?.message?.content || '';

          let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
          let confidence = 0.5;
          let reasoningAr = responseText;

          if (responseText.includes('صاعد') || responseText.toLowerCase().includes('bullish')) {
            direction = 'bullish';
          } else if (responseText.includes('هابط') || responseText.toLowerCase().includes('bearish')) {
            direction = 'bearish';
          }

          const confMatch = responseText.match(/ثقة[:\s]*(\d+)/) || responseText.match(/confidence[:\s]*(\d+)/i);
          if (confMatch) {
            confidence = Math.min(0.95, Math.max(0.3, parseInt(confMatch[1]) / 100));
          }

          const reasonMatch = responseText.match(/الأسباب[:\s]*([\s\S]+)/);
          if (reasonMatch) {
            reasoningAr = reasonMatch[1].trim().substring(0, 200);
          }

          return NextResponse.json({
            success: true,
            prediction: {
              model: 'groq-llama',
              direction,
              confidence,
              reasoningAr,
              timestamp: Date.now(),
            },
            source: 'groq',
          });
        }
      } catch (groqError: any) {
        console.warn('[ai/smart-council] GROQ failed:', groqError?.message);
      }
    }

    // ── Final fallback: Algorithmic-only (no AI available) ──
    return NextResponse.json({
      success: false,
      error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً',
      fallback: true,
    });

  } catch (error: any) {
    console.error('[ai/smart-council] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في تحليل الذكاء الاصطناعي' },
      { status: 500 }
    );
  }
}
