import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/neural/swarm/[id]/stop
 * Proxies to NestJS /api/neural/swarm/:id/stop
 * Forwards both cookie and Authorization header for auth.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';

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

    const res = await fetch(`${apiTarget}/api/neural/swarm/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
      headers,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `Neural swarm stop proxy error: ${error.message}` },
      { status: 502 },
    );
  }
}
