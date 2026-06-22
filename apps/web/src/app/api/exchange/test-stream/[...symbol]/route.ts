import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/exchange/test-stream/:symbol
 * Proxies to NestJS backend to test OANDA streaming for a specific symbol.
 * Waits 10 seconds and reports how many prices were received.
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string[] }> }
) {
  try {
    const { symbol: symbolParts } = await params;
    const symbol = symbolParts.join('/');
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const res = await fetch(
      `${backendUrl}/api/exchange/test-stream/${encodeURIComponent(symbol)}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(20000), // 20s — backend waits 10s for prices
      }
    );
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
    return NextResponse.json(
      { success: false, error: `Backend returned ${res.status}` },
      { status: res.status }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 502 }
    );
  }
}
