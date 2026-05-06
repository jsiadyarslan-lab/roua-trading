// ═══════════════════════════════════════════════════════════
// ROUA Trading — AI Chart Analysis API Route
// POST /api/ai/chart-analysis
// Uses z-ai-web-dev-sdk for pattern recognition
// Falls back to local algorithmic detection
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

// ── Rate Limiting ──
// In-memory rate limiter: max 10 requests per IP per 60-second window
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // Clean up expired entries periodically
  if (rateLimitMap.size > 1000) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key);
    }
  }

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  entry.count++;
  return { allowed: true, retryAfterSec: 0 };
}

// ── Local Pattern Detection (server-side fallback) ──
function detectLocalPatternsServer(candlesData: string): Array<{
  type: string;
  timeIndex: number;
  confidence: number;
  direction: string;
}> {
  const patterns: Array<{ type: string; timeIndex: number; confidence: number; direction: string }> = [];

  // Parse OHLC data from text format: "t=2024-01-01T08:00 O=42000 H=42100 L=41900 C=42050 V=100"
  const lines = candlesData.trim().split('\n').filter(Boolean);
  const candles: Array<{ o: number; h: number; l: number; c: number }> = [];

  for (const line of lines) {
    const oMatch = line.match(/O=([\d.]+)/);
    const hMatch = line.match(/H=([\d.]+)/);
    const lMatch = line.match(/L=([\d.]+)/);
    const cMatch = line.match(/C=([\d.]+)/);
    if (oMatch && hMatch && lMatch && cMatch) {
      candles.push({
        o: parseFloat(oMatch[1]),
        h: parseFloat(hMatch[1]),
        l: parseFloat(lMatch[1]),
        c: parseFloat(cMatch[1]),
      });
    }
  }

  if (candles.length < 3) return patterns;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const body = Math.abs(c.c - c.o);
    const range = c.h - c.l;
    const upperWick = c.h - Math.max(c.o, c.c);
    const lowerWick = Math.min(c.o, c.c) - c.l;

    // Skip if range is zero (no movement)
    if (range <= 0) continue;

    // Doji — very small body relative to range
    if (body / range < 0.1) {
      patterns.push({ type: 'Doji', timeIndex: i, confidence: 0.7, direction: 'neutral' });
    }

    // Hammer — small body at top, long lower wick
    if (body > 0 && lowerWick > body * 2 && upperWick < body * 0.5) {
      patterns.push({ type: 'Hammer', timeIndex: i, confidence: 0.75, direction: 'bullish' });
    }

    // Inverted Hammer / Shooting Star — small body at bottom, long upper wick
    if (body > 0 && upperWick > body * 2 && lowerWick < body * 0.5) {
      // Determine if it's a shooting star (after uptrend) or inverted hammer (after downtrend)
      const isUptrend = prev.c > prev.o;
      if (isUptrend) {
        patterns.push({ type: 'Shooting Star', timeIndex: i, confidence: 0.7, direction: 'bearish' });
      } else {
        patterns.push({ type: 'Inverted Hammer', timeIndex: i, confidence: 0.65, direction: 'bullish' });
      }
    }

    // Bullish Engulfing — previous red candle, current green candle engulfs it
    if (prev.c < prev.o && c.c > c.o && c.o <= prev.c && c.c >= prev.o) {
      patterns.push({ type: 'Engulfing Bullish', timeIndex: i, confidence: 0.8, direction: 'bullish' });
    }

    // Bearish Engulfing — previous green candle, current red candle engulfs it
    if (prev.c > prev.o && c.c < c.o && c.o >= prev.c && c.c <= prev.o) {
      patterns.push({ type: 'Engulfing Bearish', timeIndex: i, confidence: 0.8, direction: 'bearish' });
    }

    // Spinning Top — small body with wicks on both sides
    if (body > 0 && body / range < 0.3 && body / range >= 0.1 && upperWick > body * 0.5 && lowerWick > body * 0.5) {
      patterns.push({ type: 'Spinning Top', timeIndex: i, confidence: 0.6, direction: 'neutral' });
    }

    // Marubozu (very large body, tiny wicks)
    if (body > 0 && body / range > 0.85) {
      const dir = c.c > c.o ? 'bullish' : 'bearish';
      patterns.push({ type: 'Marubozu', timeIndex: i, confidence: 0.75, direction: dir });
    }

    // Harami Bullish — prev big red, current small green inside prev range
    if (prev.c < prev.o && c.c > c.o) {
      const prevBody = Math.abs(prev.o - prev.c);
      if (c.o > prev.c && c.c < prev.o && body < prevBody * 0.6) {
        patterns.push({ type: 'Harami Bullish', timeIndex: i, confidence: 0.65, direction: 'bullish' });
      }
    }

    // Harami Bearish — prev big green, current small red inside prev range
    if (prev.c > prev.o && c.c < c.o) {
      const prevBody = Math.abs(prev.c - prev.o);
      if (c.o < prev.c && c.c > prev.o && body < prevBody * 0.6) {
        patterns.push({ type: 'Harami Bearish', timeIndex: i, confidence: 0.65, direction: 'bearish' });
      }
    }

    // Dragonfly Doji — open=close=high, long lower wick
    if (body / range < 0.1 && upperWick < range * 0.1 && lowerWick > range * 0.6) {
      patterns.push({ type: 'Dragonfly Doji', timeIndex: i, confidence: 0.7, direction: 'bullish' });
    }

    // Gravestone Doji — open=close=low, long upper wick
    if (body / range < 0.1 && lowerWick < range * 0.1 && upperWick > range * 0.6) {
      patterns.push({ type: 'Gravestone Doji', timeIndex: i, confidence: 0.7, direction: 'bearish' });
    }
  }

  // Three-candle patterns (need at least 3 candles)
  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const prev2 = candles[i - 2];

    // Morning Star — bearish, indecision, bullish
    if (prev2.c < prev2.o && c.c > c.o) {
      const prev2Body = Math.abs(prev2.o - prev2.c);
      const prevBody = Math.abs(prev.o - prev.c);
      const currBody = Math.abs(c.c - c.o);
      if (prevBody < prev2Body * 0.3 && currBody > prev2Body * 0.5) {
        patterns.push({ type: 'Morning Star', timeIndex: i, confidence: 0.8, direction: 'bullish' });
      }
    }

    // Evening Star — bullish, indecision, bearish
    if (prev2.c > prev2.o && c.c < c.o) {
      const prev2Body = Math.abs(prev2.c - prev2.o);
      const prevBody = Math.abs(prev.o - prev.c);
      const currBody = Math.abs(c.o - c.c);
      if (prevBody < prev2Body * 0.3 && currBody > prev2Body * 0.5) {
        patterns.push({ type: 'Evening Star', timeIndex: i, confidence: 0.8, direction: 'bearish' });
      }
    }

    // Three White Soldiers — three consecutive bullish candles, each opening within prev body and closing higher
    if (prev2.c > prev2.o && prev.c > prev.o && c.c > c.o) {
      if (prev.c > prev2.c && c.c > prev.c && prev.o >= prev2.o && c.o >= prev.o) {
        patterns.push({ type: 'Three White Soldiers', timeIndex: i, confidence: 0.8, direction: 'bullish' });
      }
    }

    // Three Black Crows — three consecutive bearish candles
    if (prev2.c < prev2.o && prev.c < prev.o && c.c < c.o) {
      if (prev.c < prev2.c && c.c < prev.c && prev.o <= prev2.o && c.o <= prev.o) {
        patterns.push({ type: 'Three Black Crows', timeIndex: i, confidence: 0.8, direction: 'bearish' });
      }
    }

    // Piercing Line — bearish prev, bullish current opens below prev low, closes above prev midpoint
    if (prev.c < prev.o && c.c > c.o) {
      const prevMid = (prev.o + prev.c) / 2;
      if (c.o < prev.c && c.c > prevMid) {
        patterns.push({ type: 'Piercing Line', timeIndex: i, confidence: 0.7, direction: 'bullish' });
      }
    }

    // Dark Cloud Cover — bullish prev, bearish current opens above prev high, closes below prev midpoint
    if (prev.c > prev.o && c.c < c.o) {
      const prevMid = (prev.o + prev.c) / 2;
      if (c.o > prev.c && c.c < prevMid) {
        patterns.push({ type: 'Dark Cloud Cover', timeIndex: i, confidence: 0.7, direction: 'bearish' });
      }
    }
  }

  // Deduplicate: keep only the highest-confidence pattern per candle index
  const bestByIndex = new Map<number, { type: string; timeIndex: number; confidence: number; direction: string }>();
  for (const p of patterns) {
    const existing = bestByIndex.get(p.timeIndex);
    if (!existing || p.confidence > existing.confidence) {
      bestByIndex.set(p.timeIndex, p);
    }
  }

  return Array.from(bestByIndex.values()).slice(-12);
}

export async function POST(request: NextRequest) {
  try {
    // ── Rate Limiting Check ──
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const { allowed, retryAfterSec } = checkRateLimit(clientIp);
    if (!allowed) {
      console.warn('[ai/chart-analysis] Rate limited:', clientIp);
      return NextResponse.json(
        { success: false, error: `طلبات كثيرة جداً. حاول مجدداً بعد ${retryAfterSec} ثانية` },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch (parseErr: any) {
      console.error('[ai/chart-analysis] JSON parse error:', parseErr?.message);
      return NextResponse.json(
        { success: false, error: 'طلب غير صالح — فشل في تحليل JSON' },
        { status: 400 }
      );
    }
    const { symbol, candles, indicators, instruction } = body;

    if (!candles) {
      console.warn('[ai/chart-analysis] No candles data provided, symbol:', symbol);
      return NextResponse.json(
        { success: false, error: 'بيانات الشارت مطلوبة' },
        { status: 400 }
      );
    }

    // Determine if this is an entry/exit analysis request
    const isEntryExitRequest = instruction && (
      instruction.includes('entry') || instruction.includes('entryPrice') ||
      instruction.includes('نقاط الدخول') || instruction.includes('entry and exit')
    );

    // Try to use z-ai-web-dev-sdk
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      // Build system prompt based on request type
      const systemPrompt = isEntryExitRequest
        ? `أنت محلل فني خبير في تداول العملات والعملات الرقمية. حلل بيانات الشارت المقدمة وحدد أفضل نقاط الدخول والخروج. أعد النتيجة ككائن JSON فقط يحتوي على: "direction" ("long" أو "short")، "entryPrice" (رقم)، "stopLoss" (رقم)، "takeProfit" (رقم)، "confidence" (0-1)، "reasonAr" (شرح بالعربية، 2-3 جمل)، "keyLevels" (مصفوفة من {price: number, label: string} مع مستويات الدعم/المقاومة الرئيسية).`
        : `أنت محلل فني خبير في أنماط الشموع اليابانية. حلل بيانات الشارت المقدمة واكتشف أي أنماط شموع. أعد النتائج كمصفوفة JSON فقط. كل عنصر يجب أن يحتوي على: "type" (اسم النمط بالإنجليزية)، "timeIndex" (فهرس base-0 في البيانات)، "confidence" (0-1)، "direction" ("bullish"|"bearish"|"neutral"). الأنماط المطلوبة: Doji, Hammer, Inverted Hammer, Engulfing Bullish, Engulfing Bearish, Morning Star, Evening Star, Three White Soldiers, Three Black Crows, Harami Bullish, Harami Bearish, Piercing Line, Dark Cloud Cover, Spinning Top, Marubozu, Shooting Star, Dragonfly Doji, Gravestone Doji, Belt Hold, Abandoned Baby, Tweezer Top, Tweezer Bottom.`;

      // Use the client's instruction as the user message if provided
      const userMessage = instruction
        ? instruction
        : `حلل بيانات الشارت التالية لـ ${symbol}:\n\n${candles}${indicators ? `\n\nمؤشرات فنية: ${indicators}` : ''}`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const responseText = completion.choices?.[0]?.message?.content || '';

      // Handle entry/exit response differently from pattern response
      if (isEntryExitRequest) {
        const jsonObjectMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          try {
            const entryExitResult = JSON.parse(jsonObjectMatch[0]);
            if (entryExitResult.direction && entryExitResult.entryPrice) {
              return NextResponse.json({ success: true, data: entryExitResult, source: 'ai' });
            }
          } catch {
            // JSON parse failed, fall through to local
          }
        }
      } else {
        // Pattern detection — try to extract JSON array from the response
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const patterns = JSON.parse(jsonMatch[0]);
            if (Array.isArray(patterns) && patterns.length > 0) {
              return NextResponse.json({ success: true, patterns, source: 'ai' });
            }
          } catch {
            // JSON parse failed, fall through to local
          }
        }
      }

      // AI returned no parseable patterns — use local detection
      const localPatterns = detectLocalPatternsServer(candles);
      return NextResponse.json({
        success: true,
        patterns: localPatterns,
        source: 'local',
        note: 'AI لم يُعد أنماطاً صالحة، يتم استخدام الكشف المحلي',
      });
    } catch (aiError: any) {
      // FIX: Log the actual AI error instead of silently swallowing it
      console.error('[ai/chart-analysis] AI SDK error:', aiError?.message || aiError);
      // AI SDK not available — use local detection as fallback
      const localPatterns = detectLocalPatternsServer(candles);
      return NextResponse.json({
        success: true,
        patterns: localPatterns,
        source: 'local',
        note: 'خدمة الذكاء الاصطناعي غير متاحة، يتم استخدام الكشف المحلي',
        _debug: process.env.NODE_ENV === 'development' ? String(aiError?.message || aiError) : undefined,
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
