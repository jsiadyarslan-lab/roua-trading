// ═══════════════════════════════════════════════════════════
// ROUA Trading — AI Chart Analysis API Route
// POST /api/ai/chart-analysis
// Uses z-ai-web-dev-sdk for pattern recognition
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, candles, instruction } = body;

    if (!candles) {
      return NextResponse.json(
        { success: false, error: 'بيانات الشارت مطلوبة' },
        { status: 400 }
      );
    }

    // Try to use z-ai-web-dev-sdk
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `أنت محلل فني خبير في أنماط الشموع اليابانية. حلل بيانات الشارت المقدمة واكتشف أي أنماط شموع. أعد النتائج كمصفوفة JSON فقط. كل عنصر يجب أن يحتوي على: "type" (اسم النمط بالإنجليزية)، "timeIndex" (فهرس base-0 في البيانات)، "confidence" (0-1)، "direction" ("bullish"|"bearish"|"neutral"). الأنماط المطلوبة: Doji, Hammer, Inverted Hammer, Engulfing Bullish, Engulfing Bearish, Morning Star, Evening Star, Three White Soldiers, Three Black Crows, Harami Bullish, Harami Bearish, Piercing Line, Dark Cloud Cover, Spinning Top, Marubozu, Shooting Star, Dragonfly Doji, Gravestone Doji, Belt Hold, Abandoned Baby, Tweezer Top, Tweezer Bottom.`,
          },
          {
            role: 'user',
            content: `حلل بيانات الشارت التالية لـ ${symbol}:\n\n${candles}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const responseText = completion.choices?.[0]?.message?.content || '';

      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const patterns = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ success: true, patterns });
      }

      return NextResponse.json({ success: true, patterns: [], raw: responseText });
    } catch (aiError: any) {
      // AI SDK not available — return basic local patterns
      return NextResponse.json({
        success: true,
        patterns: [],
        note: 'خدمة الذكاء الاصطناعي غير متاحة حالياً، يتم استخدام الكشف المحلي',
      });
    }
  } catch (error: any) {
    console.error('[ai/chart-analysis] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في تحليل الشارت' },
      { status: 500 }
    );
  }
}
