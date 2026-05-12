import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/news/fetch
 * Trigger manual news fetch
 *
 * FIX: Standardized to use proxyToNestJS for consistent auth handling.
 * Previously used manual session token extraction which didn't handle
 * auto-auth (guest sessions) or cookie setting.
 */
export async function POST(request: NextRequest) {
  try {
    const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';

    // Get session token from cookie — proxy handles auto-auth
    const sessionToken = request.cookies.get('roua_session')?.value;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': sessionToken ? `Bearer ${sessionToken}` : '',
      'x-roua-session': sessionToken || '',
    };

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
      // Return proper error status instead of 200 with success:false
      return NextResponse.json(
        { success: false, error: `فشل في جلب الأخبار (HTTP ${res.status})` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    } catch {
      // NestJS offline — return 502 Bad Gateway
      return NextResponse.json(
        { success: false, error: 'خادم الأخبار غير متاح حالياً', offline: true },
        { status: 502 },
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `خطأ: ${error.message}` },
      { status: 502 },
    );
  }
}
