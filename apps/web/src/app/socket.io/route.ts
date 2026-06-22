import { NextRequest, NextResponse } from 'next/server';

/**
 * V388: Socket.IO polling proxy — Route Handler.
 *
 * WHY THIS EXISTS:
 * The previous approach used NextResponse.rewrite() in proxy.ts to forward
 * /socket.io requests to NestJS (port 3001). This caused 404 errors on Railway
 * because Next.js rewrites to external URLs use fetch() internally, which:
 *   1. Doesn't properly forward Socket.IO handshake cookies
 *   2. May buffer responses (breaking long-polling)
 *   3. Has timeout issues with Socket.IO's polling transport
 *
 * This Route Handler manually proxies the request using fetch() with proper
 * header/cookie forwarding. It handles ALL Socket.IO polling requests:
 *   GET  /socket.io?EIO=4&transport=polling  — handshake + long-poll
 *   POST /socket.io?EIO=4&transport=polling  — send messages
 *
 * WebSocket upgrade requests (transport=websocket) are NOT handled here —
 * they pass through to the Next.js server which can't upgrade them. Socket.IO
 * will fall back to polling (which this handler supports).
 *
 * IMPORTANT: This handler must NOT be cached. Socket.IO polling responses
 * are unique per request and must be delivered immediately.
 */

// Determine backend URL — same logic as next.config.ts
const rawApiTarget = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
const backendUrl = rawApiTarget.includes('http://api:')
  ? 'http://127.0.0.1:3001'
  : rawApiTarget;

// Headers to forward from browser → NestJS
const FORWARD_REQUEST_HEADERS = [
  'content-type',
  'accept',
  'accept-encoding',
  'accept-language',
  'cookie',
  'origin',
  'user-agent',
];

// Headers to forward from NestJS → browser
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'set-cookie',
  'cache-control',
  'connection',
  'transfer-encoding',
];

async function proxyRequest(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const targetUrl = `${backendUrl}${url.pathname}${url.search}`;

  // Build headers — only forward safe ones
  const headers: Record<string, string> = {};
  FORWARD_REQUEST_HEADERS.forEach((h) => {
    const val = req.headers.get(h);
    if (val) headers[h] = val;
  });

  // Get body for POST requests
  let body: BodyInit | null = null;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    body = await req.text();
  }

  const upstreamRes = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
    // @ts-expect-error — Node.js fetch supports this
    duplex: 'half',
  });

  // Build response headers
  const responseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };
  FORWARD_RESPONSE_HEADERS.forEach((h) => {
    const val = upstreamRes.headers.get(h);
    if (val) responseHeaders[h] = val;
  });

  // Handle Set-Cookie specially (it can have multiple values)
  const setCookies = upstreamRes.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    // NextResponse.json doesn't support multiple Set-Cookie headers directly,
    // so we build the response manually
    const responseBody = await upstreamRes.arrayBuffer();
    const response = new NextResponse(responseBody, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
    setCookies.forEach((cookie) => {
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
    console.error('[socket.io proxy] GET error:', err?.message);
    return new NextResponse('Proxy error', { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await proxyRequest(req);
  } catch (err: any) {
    console.error('[socket.io proxy] POST error:', err?.message);
    return new NextResponse('Proxy error', { status: 502 });
  }
}
