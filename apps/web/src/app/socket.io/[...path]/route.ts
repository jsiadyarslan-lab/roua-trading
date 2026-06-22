import { NextRequest, NextResponse } from 'next/server';

/**
 * V388: Socket.IO polling proxy — catch-all for sub-paths.
 *
 * Socket.IO polling requests look like:
 *   GET  /socket.io/?EIO=4&transport=polling           ← handled by /app/socket.io/route.ts
 *   GET  /socket.io/?EIO=4&transport=polling&sid=xxx   ← handled by /app/socket.io/route.ts
 *   POST /socket.io/?EIO=4&transport=polling&sid=xxx   ← handled by /app/socket.io/route.ts
 *
 * But some Socket.IO versions also request sub-paths:
 *   GET  /socket.io/1/?t=xxx                           ← handled here (catch-all)
 *   GET  /socket.io/2/?t=xxx                           ← handled here (catch-all)
 *
 * This catch-all forwards ALL /socket.io/* requests to NestJS with proper
 * header/cookie forwarding. See /app/socket.io/route.ts for full docs.
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

async function proxyRequest(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const url = new URL(req.url);
  // Reconstruct the path: /socket.io/{path segments}
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
    // @ts-expect-error — Node.js fetch supports this
    duplex: 'half',
  });

  const responseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };
  FORWARD_RESPONSE_HEADERS.forEach((h) => {
    const val = upstreamRes.headers.get(h);
    if (val) responseHeaders[h] = val;
  });

  const setCookies = upstreamRes.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  try {
    const { path = [] } = await params;
    return await proxyRequest(req, path);
  } catch (err: any) {
    console.error('[socket.io/[...path] proxy] GET error:', err?.message);
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
    console.error('[socket.io/[...path] proxy] POST error:', err?.message);
    return new NextResponse('Proxy error', { status: 502 });
  }
}
