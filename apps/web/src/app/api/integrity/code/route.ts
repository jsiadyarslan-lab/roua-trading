import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/integrity/code?html=1
 *
 * Proxy to NestJS Code Integrity Check (V01-V15).
 * The NestJS API runs on port 3001 internally — not accessible from the browser.
 * This route proxies the request so users can check code integrity from the public URL.
 *
 * Checks: V01-V14 (risk, size limits, cooldown, etc.) + V15 (V184 4h auto-close fix)
 */
export async function GET(request: NextRequest) {
  const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
  const wantHtml = request.nextUrl.searchParams.get('html') === '1';
  const url = `${apiTarget}/api/integrity${wantHtml ? '?html=1' : ''}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': wantHtml ? 'text/html' : 'application/json' },
    });

    if (wantHtml) {
      const html = await res.text();
      return new NextResponse(html, {
        status: res.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Code Integrity API unreachable',
        detail: error.message || 'Failed to connect to NestJS API on port 3001',
        hint: 'Make sure the NestJS API server is running (start.sh should run both services)',
      },
      { status: 502 },
    );
  }
}
