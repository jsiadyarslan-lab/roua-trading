import { NextRequest, NextResponse } from 'next/server';

/**
 * V389: Socket.IO proxy — exact match for /api/socket-io-proxy (no sub-path).
 *
 * Handles the case where the rewrite sends /socket.io → /api/socket-io-proxy
 * (no trailing slash, no sub-path). The catch-all at [...path]/route.ts
 * doesn't match this case, so we need a separate handler here.
 *
 * See [...path]/route.ts for full documentation.
 */

const rawApiTarget = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
const backendUrl = rawApiTarget.includes('http://api:')
  ? 'http://127.0.0.1:3001'
  : rawApiTarget;

const FORWARD_REQUEST_HEADERS = [
  'content-type', 'accept', 'accept-encoding', 'accept-language',
  'cookie', 'origin', 'user-agent',
];

const FORWARD_RESPONSE_HEADERS = [
  'content-type', 'set-cookie', 'cache-control', 'connection', 'transfer-encoding',
];

async function proxyRequest(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  // /socket.io (no sub-path) → backend/socket.io?{search}
  const targetUrl = `${backendUrl}/socket.io${url.search}`;

  // V393: Log incoming request for diagnostics
  console.log(`[socket-io-proxy] ${req.method} → ${targetUrl}`);

  const headers: Record<string, string> = {};
  FORWARD_REQUEST_HEADERS.forEach((h) => {
    const val = req.headers.get(h);
    if (val) headers[h] = val;
  });

  let body: BodyInit | null = null;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    body = await req.text();
  }

  const upstreamRes = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
    // @ts-expect-error — Node.js fetch supports this for streaming
    duplex: 'half',
  });

  // V393: Log upstream status for diagnostics
  console.log(`[socket-io-proxy] ← ${upstreamRes.status} ${upstreamRes.statusText}`);

  const responseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };
  FORWARD_RESPONSE_HEADERS.forEach((h) => {
    const val = upstreamRes.headers.get(h);
    if (val) responseHeaders[h] = val;
  });

  const setCookies = (upstreamRes.headers as any).getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    const responseBody = await upstreamRes.arrayBuffer();
    const response = new NextResponse(responseBody, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
    setCookies.forEach((cookie: string) => {
      response.headers.append('set-cookie', cookie);
    });
    return response;
  }

  const responseBody = await upstreamRes.arrayBuffer();
  return new NextResponse(responseBody, {
    status: upstreamRes.status,
    headers: responseHeaders,
  });
}

export async function GET(req: NextRequest) {
  try {
    return await proxyRequest(req);
  } catch (err: any) {
    console.error('[socket-io-proxy exact] GET error:', err?.message);
    return new NextResponse('Proxy error', { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await proxyRequest(req);
  } catch (err: any) {
    console.error('[socket-io-proxy exact] POST error:', err?.message);
    return new NextResponse('Proxy error', { status: 502 });
  }
}
