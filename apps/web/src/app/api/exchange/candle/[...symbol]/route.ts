import { NextRequest, NextResponse } from 'next/server';

/**
 * V385: GET /api/exchange/candle/[...symbol]?timeframe=M1
 *
 * CRITICAL MISSING PIECE — this is why V384 "didn't change anything".
 *
 * V384 added:
 *   ✅ Backend OandaStreamingService._buildCandles() — builds OHLC from stream
 *   ✅ NestJS ExchangeController.getLatestCandle() at /api/exchange/candle/:symbol
 *   ✅ Frontend useChartWebSocket.fetchLatestCandle() calls /api/exchange/candle/...
 *
 * But it FORGOT to wire the URL from the browser through Next.js to NestJS.
 * Without this route handler, every call to /api/exchange/candle/EUR%2FUSD
 * returned 404, the frontend silently fell through to the OLD /api/exchange/quote
 * fallback (which builds candles locally with O=H=L=C — exactly the bug we
 * were supposed to fix), and "nothing changed".
 *
 * This route handler is a thin proxy to NestJS, following the exact same
 * pattern as /api/exchange/quote/[...symbol]/route.ts. It:
 *   1. Catches [...symbol] catch-all (handles both EUR%2FUSD and EUR/USD)
 *   2. Normalizes symbol to 'EUR/USD' format
 *   3. Reads ?timeframe= query param
 *   4. Proxies to NestJS: ${backendUrl}/api/exchange/candle/{symbol}?timeframe={tf}
 *   5. Returns the { success, data } envelope unchanged
 *
 * NO caching — the backend OandaStreamingService writes fresh candles to Redis
 * on every stream tick. Caching here would add stale delay (the same mistake
 * V382 fixed for the quote route).
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string[] }> },
) {
  try {
    // Catch-all route: /api/exchange/candle/EUR/USD → symbol = ['EUR', 'USD']
    // Or: /api/exchange/candle/EUR%2FUSD → symbol = ['EUR%2FUSD']
    const symbolParts = await params;
    const joined = Array.isArray(symbolParts.symbol)
      ? symbolParts.symbol.join('/')
      : String(symbolParts.symbol);

    // Decode %2F → / so 'EUR%2FUSD' becomes 'EUR/USD'
    let symbol: string;
    try {
      symbol = decodeURIComponent(joined);
    } catch {
      symbol = joined;
    }

    const timeframe = request.nextUrl.searchParams.get('timeframe') || 'M1';

    // Validate timeframe — only allow values the backend knows about
    const VALID_TF = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']; // V450: added H4, D1, W1
    if (!VALID_TF.includes(timeframe)) {
      return NextResponse.json(
        { success: false, error: `Invalid timeframe: ${timeframe}. Valid: ${VALID_TF.join(', ')}` },
        { status: 400 },
      );
    }

    // Determine backend URL — same logic as next.config.ts apiTarget
    const rawApiTarget =
      process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
    const backendUrl = rawApiTarget.includes('http://api:')
      ? 'http://127.0.0.1:3001' // Railway single-container: NestJS is on localhost:3001
      : rawApiTarget;

    // Proxy to NestJS — no cache, no transform
    const upstreamUrl = `${backendUrl}/api/exchange/candle/${encodeURIComponent(symbol)}?timeframe=${timeframe}`;
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        // Do NOT send Content-Type on GET — OANDA rejects it (V381)
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5s timeout — Redis read should be <50ms
    });

    if (!upstreamRes.ok) {
      return NextResponse.json(
        { success: false, error: `Backend returned ${upstreamRes.status}` },
        { status: upstreamRes.status },
      );
    }

    const data = await upstreamRes.json();
    return NextResponse.json(data, {
      headers: {
        // No cache — candles update every stream tick (sub-second)
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    console.error('[exchange/candle] Proxy error:', err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal error' },
      { status: 500 },
    );
  }
}
