import { NextRequest, NextResponse } from 'next/server';

/**
 * Integration Proxy — /api/integration/[...path]
 *
 * Proxies all integration requests from the public URL to the NestJS backend.
 * The NestJS IntegrationController runs on port 3001 (API_INTERNAL_URL),
 * but the public-facing Next.js app serves port 3000. This route bridges
 * the gap so the news site can call https://roua-trading.../api/integration/*.
 *
 * Auth: X-Integration-Key header is passed through to NestJS unchanged.
 * The NestJS IntegrationGuard handles the actual key validation.
 */

/**
 * GET handler — proxy all GET requests to NestJS integration endpoints
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001';
  const pathStr = path.join('/');
  const url = new URL(request.url);
  const queryString = url.searchParams.toString();
  const fullUrl = `${apiTarget}/api/integration/${pathStr}${queryString ? `?${queryString}` : ''}`;

  // Forward the integration key header
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const integrationKey = request.headers.get('x-integration-key');
  if (integrationKey) {
    headers['X-Integration-Key'] = integrationKey;
  }

  try {
    const response = await fetch(fullUrl, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();

    // Add CORS headers for cross-origin integration requests
    const partnerUrl = process.env.INTEGRATION_PARTNER_URL || '';
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': partnerUrl || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Integration-Key',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'public, max-age=5',
    };

    return NextResponse.json(data, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error(`[Integration Proxy] Failed to proxy to ${fullUrl}:`, error?.message);
    return NextResponse.json(
      {
        error: 'Trading platform backend unreachable',
        detail: error?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 502 }
    );
  }
}

/**
 * OPTIONS handler — CORS preflight for integration endpoints
 */
export async function OPTIONS() {
  const partnerUrl = process.env.INTEGRATION_PARTNER_URL || '';

  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': partnerUrl || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Integration-Key',
      'Access-Control-Max-Age': '86400',
    },
  });
}
