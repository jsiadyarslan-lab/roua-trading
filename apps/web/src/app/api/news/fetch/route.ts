import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/news/fetch
 * Trigger manual news fetch
 */
export async function POST(request: NextRequest) {
  try {
    const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001';
    const sessionToken = request.cookies.get('roua_session')?.value;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') || '',
    };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    try {
      const res = await fetch(`${apiTarget}/api/news/fetch`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // NestJS unavailable
    }

    return NextResponse.json({
      success: false,
      error: 'خادم الأخبار غير متاح حالياً',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `خطأ: ${error.message}` },
      { status: 502 },
    );
  }
}
