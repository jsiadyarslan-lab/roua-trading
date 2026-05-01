import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/neural/train
 * Proxies to NestJS /api/neural/train
 * Forwards both cookie and Authorization header for auth.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001';

    // Extract session token from cookie to also pass as Bearer header
    const sessionToken = request.cookies.get('roua_session')?.value;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') || '',
    };

    // Add Authorization header as fallback for NestJS AuthGuard
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    const res = await fetch(`${apiTarget}/api/neural/train`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `Neural train proxy error: ${error.message}` },
      { status: 502 },
    );
  }
}
