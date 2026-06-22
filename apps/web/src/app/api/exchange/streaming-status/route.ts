import { NextResponse } from 'next/server'

/**
 * GET /api/exchange/streaming-status
 * Proxies to NestJS backend to check OANDA streaming connection status.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const res = await fetch(`${backendUrl}/api/exchange/streaming-status`, {
      signal: AbortSignal.timeout(10000),
    });
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
