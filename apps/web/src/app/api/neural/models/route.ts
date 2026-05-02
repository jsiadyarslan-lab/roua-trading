import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/neural/models
 * Proxies to NestJS /api/neural/models
 * Forwards both cookie and Authorization header for auth.
 */
export async function GET(request: NextRequest) {
  try {
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

    const res = await fetch(`${apiTarget}/api/neural/models`, {
      method: 'GET',
      headers,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `Neural models proxy error: ${error.message}` },
      { status: 502 },
    );
  }
}
