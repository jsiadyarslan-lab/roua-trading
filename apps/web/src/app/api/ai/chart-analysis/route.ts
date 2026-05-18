// ═══════════════════════════════════════════════════════════
// ROUA Trading — AI Chart Analysis API Route
// POST /api/ai/chart-analysis
// Uses z-ai-web-dev-sdk for pattern recognition
// Falls back to local algorithmic detection
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

// ── ZAI Singleton — reuse connection across requests ──
// FIX: Previously created a new ZAI instance per request → slow + wasteful
let _zaiInstance: any = null;
let _zaiCreating = false;
async function getZAI(): Promise<any> {
  if (_zaiInstance) return _zaiInstance;
  if (_zaiCreating) {
    // Wait for ongoing creation
    await new Promise(r => setTimeout(r, 1000));
    return _zaiInstance;
  }
  _zaiCreating = true;
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    _zaiInstance = await ZAI.create();
    return _zaiInstance;
  } catch {
    _zaiInstance = null;
    return null;
  } finally {
    _zaiCreating = false;
  }
}

// ── Request timeout helper ──
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Rate Limiting ──
// In-memory rate limiter: max 20 requests per IP per 60-second window
// FIX: Increased from 10 to 20 — users need more AI analysis requests
// FIX: Added automatic cleanup every 5 minutes to prevent memory growth
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Auto-cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key);
    }
  }, 5 * 60 * 1000);
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // Emergency cleanup if map grows too large
  if (rateLimitMap.size > 500) {
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

// ── Convert candles text to compact JSON for AI ──
// FIX: AI reads JSON much more reliably than text format
function candlesToJson(candlesText: string): string {
  const lines = candlesText.trim().split('\n').filter(Boolean);
  const candles: any[] = [];
  for (const line of lines) {
    const t = line.match(/t=([\S]+)/)?.[1];
    const o = parseFloat(line.match(/O=([\d.]+)/)?.[1] || '0');
    const h = parseFloat(line.match(/H=([\d.]+)/)?.[1] || '0');
    const l = parseFloat(line.match(/L=([\d.]+)/)?.[1] || '0');
    const c = parseFloat(line.match(/C=([\d.]+)/)?.[1] || '0');
    const v = parseFloat(line.match(/V=([\d.]+)/)?.[1] || '0');
    if (o && h && l && c) candles.push({ t, o, h, l, c, v });
  }
  // Send last 50 candles max to avoid token limit
  return JSON.stringify(candles.slice(-50));
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

  // ── Detect swing highs and lows for advanced patterns ──
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].h > candles[i-1].h && candles[i].h > candles[i-2].h &&
        candles[i].h > candles[i+1].h && candles[i].h > candles[i+2].h) {
      swingHighs.push(i);
    }
    if (candles[i].l < candles[i-1].l && candles[i].l < candles[i-2].l &&
        candles[i].l < candles[i+1].l && candles[i].l < candles[i+2].l) {
      swingLows.push(i);
    }
  }

  // Double Top — two swing highs at similar price level
  for (let i = 1; i < swingHighs.length; i++) {
    const h1 = candles[swingHighs[i-1]].h;
    const h2 = candles[swingHighs[i]].h;
    if (Math.abs(h1 - h2) / h1 < 0.005) { // within 0.5%
      patterns.push({ type: 'Double Top', timeIndex: swingHighs[i], confidence: 0.78, direction: 'bearish' });
    }
  }

  // Double Bottom — two swing lows at similar price level
  for (let i = 1; i < swingLows.length; i++) {
    const l1 = candles[swingLows[i-1]].l;
    const l2 = candles[swingLows[i]].l;
    if (Math.abs(l1 - l2) / l1 < 0.005) { // within 0.5%
      patterns.push({ type: 'Double Bottom', timeIndex: swingLows[i], confidence: 0.78, direction: 'bullish' });
    }
  }

  // Head & Shoulders — L-H-H(highest)-H-L pattern in swing highs
  if (swingHighs.length >= 3) {
    for (let i = 2; i < swingHighs.length; i++) {
      const ls = candles[swingHighs[i-2]].h;
      const head = candles[swingHighs[i-1]].h;
      const rs = candles[swingHighs[i]].h;
      if (head > ls && head > rs && Math.abs(ls - rs) / ls < 0.02) {
        patterns.push({ type: 'Head & Shoulders', timeIndex: swingHighs[i], confidence: 0.82, direction: 'bearish' });
      }
    }
  }

  // Inverse Head & Shoulders — in swing lows
  if (swingLows.length >= 3) {
    for (let i = 2; i < swingLows.length; i++) {
      const ls = candles[swingLows[i-2]].l;
      const head = candles[swingLows[i-1]].l;
      const rs = candles[swingLows[i]].l;
      if (head < ls && head < rs && Math.abs(ls - rs) / ls < 0.02) {
        patterns.push({ type: 'Inverse Head & Shoulders', timeIndex: swingLows[i], confidence: 0.82, direction: 'bullish' });
      }
    }
  }

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

    // ── NEW PATTERNS (V144) ──

    // Tweezer Bottom — two candles with same low (bullish reversal)
    if (i > 0 && Math.abs(c.l - prev.l) / c.l < 0.001 && prev.c < prev.o && c.c > c.o) {
      patterns.push({ type: 'Tweezer Bottom', timeIndex: i, confidence: 0.72, direction: 'bullish' });
    }

    // Tweezer Top — two candles with same high (bearish reversal)
    if (i > 0 && Math.abs(c.h - prev.h) / c.h < 0.001 && prev.c > prev.o && c.c < c.o) {
      patterns.push({ type: 'Tweezer Top', timeIndex: i, confidence: 0.72, direction: 'bearish' });
    }

    // Morning Star (3-candle) — bearish, doji/small, bullish
    if (i >= 2) {
      const c0 = candles[i - 2]; const c1 = candles[i - 1];
      const body0 = Math.abs(c0.c - c0.o); const body1 = Math.abs(c1.c - c1.o);
      const range0 = c0.h - c0.l;
      if (c0.c < c0.o && body1 / (c1.h - c1.l || 1) < 0.3 && c.c > c.o && body0 > 0 && body0 / range0 > 0.5) {
        patterns.push({ type: 'Morning Star', timeIndex: i, confidence: 0.82, direction: 'bullish' });
      }
    }

    // Evening Star (3-candle) — bullish, doji/small, bearish
    if (i >= 2) {
      const c0 = candles[i - 2]; const c1 = candles[i - 1];
      const body0 = Math.abs(c0.c - c0.o); const body1 = Math.abs(c1.c - c1.o);
      const range0 = c0.h - c0.l;
      if (c0.c > c0.o && body1 / (c1.h - c1.l || 1) < 0.3 && c.c < c.o && body0 > 0 && body0 / range0 > 0.5) {
        patterns.push({ type: 'Evening Star', timeIndex: i, confidence: 0.82, direction: 'bearish' });
      }
    }

    // Three White Soldiers — 3 consecutive bullish candles
    if (i >= 2) {
      const c0 = candles[i - 2]; const c1 = candles[i - 1];
      if (c0.c > c0.o && c1.c > c1.o && c.c > c.o && c1.c > c0.c && c.c > c1.c) {
        patterns.push({ type: 'Three White Soldiers', timeIndex: i, confidence: 0.78, direction: 'bullish' });
      }
    }

    // Three Black Crows — 3 consecutive bearish candles
    if (i >= 2) {
      const c0 = candles[i - 2]; const c1 = candles[i - 1];
      if (c0.c < c0.o && c1.c < c1.o && c.c < c.o && c1.c < c0.c && c.c < c1.c) {
        patterns.push({ type: 'Three Black Crows', timeIndex: i, confidence: 0.78, direction: 'bearish' });
      }
    }

    // Dragonfly Doji — very small body, long lower wick, tiny upper wick
    if (body / range < 0.05 && lowerWick > range * 0.65 && upperWick < range * 0.1) {
      patterns.push({ type: 'Dragonfly Doji', timeIndex: i, confidence: 0.75, direction: 'bullish' });
    }

    // Gravestone Doji — very small body, long upper wick, tiny lower wick
    if (body / range < 0.05 && upperWick > range * 0.65 && lowerWick < range * 0.1) {
      patterns.push({ type: 'Gravestone Doji', timeIndex: i, confidence: 0.75, direction: 'bearish' });
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

    // Try to use z-ai-web-dev-sdk (singleton — reuse connection)
    try {
      const zai = await withTimeout(getZAI(), 3000);
      if (!zai) throw new Error('ZAI unavailable');

      // Build system prompt based on request type
      const systemPrompt = isEntryExitRequest
        ? `أنت محلل فني خبير في تداول العملات والعملات الرقمية. حلل بيانات الشارت المقدمة وحدد أفضل نقاط الدخول والخروج. أعد النتيجة ككائن JSON فقط يحتوي على: "direction" ("long" أو "short")، "entryPrice" (رقم)، "stopLoss" (رقم)، "takeProfit" (رقم)، "confidence" (0-1)، "reasonAr" (شرح بالعربية، 2-3 جمل)، "keyLevels" (مصفوفة من {price: number, label: string} مع مستويات الدعم/المقاومة الرئيسية).`
        : `أنت محلل فني خبير في أنماط الشموع اليابانية. حلل بيانات الشارت المقدمة واكتشف أي أنماط شموع. أعد النتائج كمصفوفة JSON فقط. كل عنصر يجب أن يحتوي على: "type" (اسم النمط بالإنجليزية)، "timeIndex" (فهرس base-0 في البيانات)، "confidence" (0-1)، "direction" ("bullish"|"bearish"|"neutral"). الأنماط المطلوبة: Doji, Hammer, Inverted Hammer, Engulfing Bullish, Engulfing Bearish, Morning Star, Evening Star, Three White Soldiers, Three Black Crows, Harami Bullish, Harami Bearish, Piercing Line, Dark Cloud Cover, Spinning Top, Marubozu, Shooting Star, Dragonfly Doji, Gravestone Doji, Belt Hold, Abandoned Baby, Tweezer Top, Tweezer Bottom.`;

      // Use the client's instruction as the user message if provided
      // FIX: Use compact JSON format for candles — AI parses it more reliably
      const candlesJson = candlesToJson(candles);
      const userMessage = instruction
        ? instruction
        : `حلل بيانات الشارت التالية لـ ${symbol} (JSON OHLCV):\n${candlesJson}${indicators ? `\n\nمؤشرات: ${indicators}` : ''}`;

      const completion = await withTimeout(zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }), 15000); // 15 second timeout

      const responseText = (completion as any).choices?.[0]?.message?.content || '';

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
