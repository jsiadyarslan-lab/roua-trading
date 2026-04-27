import { NextRequest, NextResponse } from 'next/server'

/**
 * Catch-all proxy for /api/trading/* → NestJS backend
 *
 * Why this exists instead of relying on next.config.ts rewrites:
 * - Next.js rewrites do NOT forward Authorization headers set by middleware
 * - NestJS AuthGuard requires Authorization: Bearer <token>
 * - This route handler extracts roua_session cookie and injects the header
 *
 * All trading routes are proxied to NestJS which enforces:
 * - RiskGatekeeper (5 safety checks)
 * - IdempotencyService (prevent duplicate orders)
 * - BullMQ execution queue
 * - Proper AES-256-GCM encryption for credentials
 */

const API_TARGET = process.env.API_INTERNAL_URL || 'http://localhost:3001'

export const dynamic = 'force-dynamic'

async function proxyRequest(request: NextRequest, method: string) {
  const { pathname, search } = request.nextUrl

  // Extract session token from cookie
  const sessionToken = request.cookies.get('roua_session')?.value

  if (!sessionToken) {
    return NextResponse.json(
      { success: false, error: 'لم يتم تقديم رمز المصادقة' },
      { status: 401 },
    )
  }

  // Build target URL — strip /api prefix since NestJS has globalPrefix('api')
  // pathname = /api/trading/positions → NestJS expects /api/trading/positions
  const targetUrl = `${API_TARGET}${pathname}${search}`

  try {
    // Build headers for the proxied request
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': request.headers.get('content-type') || 'application/json',
    }

    // Forward relevant headers
    const forwardedHeaders = ['accept', 'user-agent', 'x-forwarded-for', 'x-real-ip']
    for (const h of forwardedHeaders) {
      const val = request.headers.get(h)
      if (val) headers[h] = val
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(30000), // 30s timeout
    }

    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const body = await request.text()
        if (body) fetchOptions.body = body
      } catch {
        // No body or failed to read — that's fine
      }
    }

    const response = await fetch(targetUrl, fetchOptions)

    // Forward the response with the same status
    const responseBody = await response.text()

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    console.error(`[trading-proxy] ${method} ${pathname} failed:`, error.message)

    // Return a clean error — don't leak internal details
    return NextResponse.json(
      {
        success: false,
        error: 'خدمة التداول غير متاحة حالياً',
        // Include hint for development
        ...(process.env.NODE_ENV === 'development' && { debug: error.message }),
      },
      { status: 502 },
    )
  }
}

export async function GET(request: NextRequest) {
  return proxyRequest(request, 'GET')
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, 'POST')
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request, 'PUT')
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, 'PATCH')
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, 'DELETE')
}
