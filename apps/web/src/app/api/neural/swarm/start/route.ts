import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/neural/swarm/start
 * Proxies to NestJS /api/neural/swarm/start
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001';

    const res = await fetch(`${apiTarget}/api/neural/swarm/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `Neural swarm start proxy error: ${error.message}` },
      { status: 502 },
    );
  }
}
