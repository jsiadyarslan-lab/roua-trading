import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/neural/predict
 * Proxies to NestJS /api/neural/predict
 * Forwards both cookie and Authorization header for auth.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';

    const sessionToken = request.cookies.get('roua_session')?.value;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') || '',
    };

    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    // Forward language to NestJS (default to 'ar' if not provided)
    const forwardedBody = { ...body, language: body.language || 'ar' };

    const res = await fetch(`${apiTarget}/api/neural/predict`, {
      method: 'POST',
      headers,
      body: JSON.stringify(forwardedBody),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `Neural predict proxy error: ${error.message}` },
      { status: 502 },
    );
  }
}
