import { NextRequest, NextResponse } from 'next/server';

/**
 * V389: Socket.IO polling proxy — Route Handler (no dots in path).
 *
 * WHY THIS EXISTS:
 * Next.js Route Handlers don't match paths containing dots (.) by default.
 * Creating a Route Handler at /app/socket.io/route.ts does NOT match
 * requests to /socket.io — Next.js treats it as a static file and returns 404.
 *
 * FIX: Create the Route Handler at /app/api/socket-io-proxy/[...path]/route.ts
 * (no dots in path), and use next.config.ts rewrites to forward:
 *   /socket.io      → /api/socket-io-proxy
 *   /socket.io/     → /api/socket-io-proxy/
 *   /socket.io/:p*  → /api/socket-io-proxy/:p*
 *
 * This Route Handler then proxies to NestJS (port 3001) with proper
 * header/cookie forwarding for Socket.IO polling transport.
 *
 * NOTE: Only polling transport is supported. WebSocket upgrade requests
 * cannot be proxied through Route Handlers (Next.js doesn't support WS
 * upgrade in Route Handlers). Socket.IO will use polling, which is
 * ~100-200ms latency — acceptable for price updates.
 */

// Determine backend URL — same logic as next.config.ts
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

async function proxyRequest(
  req: NextRequest,
  pathSegments: string[],
): Promise<NextResponse> {
  const url = new URL(req.url);
  // Reconstruct: backend/socket.io/{path segments}?{search}
  const pathPart = pathSegments.length > 0 ? '/' + pathSegments.join('/') : '';
  const targetUrl = `${backendUrl}/socket.io${pathPart}${url.search}`;

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

  const responseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };
  FORWARD_RESPONSE_HEADERS.forEach((h) => {
    const val = upstreamRes.headers.get(h);
    if (val) responseHeaders[h] = val;
  });

  // Handle Set-Cookie specially (can have multiple values)
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  try {
    const { path = [] } = await params;
    return await proxyRequest(req, path);
  } catch (err: any) {
    console.error('[socket-io-proxy] GET error:', err?.message);
    return new NextResponse('Proxy error', { status: 502 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  try {
    const { path = [] } = await params;
    return await proxyRequest(req, path);
  } catch (err: any) {
    console.error('[socket-io-proxy] POST error:', err?.message);
    return new NextResponse('Proxy error', { status: 502 });
  }
}
