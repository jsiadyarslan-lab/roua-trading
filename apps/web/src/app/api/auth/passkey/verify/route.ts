import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/auth/passkey/verify — WebAuthn passkey verification
 *
 * Proxies passkey verification to the NestJS backend.
 * The NestJS backend handles WebAuthn challenge generation and verification
 * at /api/auth/challenge and /api/auth/verify.
 *
 * This route handles the two-step passkey flow:
 * Step 1: Client requests challenge → GET /api/auth/challenge?email=...
 * Step 2: Client verifies credential → POST /api/auth/verify
 *
 * FIX: Previously the login page called /api/auth/passkey/verify which
 * didn't exist (404). This handler properly proxies to NestJS's
 * /api/auth/verify endpoint with the correct payload format.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001'

    // Transform the frontend payload to match NestJS /api/auth/verify format
    // Frontend sends: { id, rawId, response: { authenticatorData, clientDataJSON, signature } }
    // NestJS expects: { assertion: { id, rawId, response: { ... } }, email }
    const nestjsPayload = {
      assertion: {
        id: body.id,
        rawId: body.rawId,
        response: body.response,
      },
      email: body.email || 'passkey@roua.auto', // Fallback email for discoverable credentials
    }

    const response = await fetch(`${apiTarget}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward session cookie if present
        Cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify(nestjsPayload),
      signal: AbortSignal.timeout(15000),
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || 'فشل التحقق من Passkey',
        },
        { status: response.ok ? 400 : response.status },
      )
    }

    // Set session cookie if NestJS returned one
    const setCookieHeader = response.headers.get('set-cookie')
    const result: NextResponse = NextResponse.json({
      success: true,
      user: data.user,
    })

    if (setCookieHeader) {
      // Parse and forward the roua_session cookie from NestJS
      const cookieMatch = setCookieHeader.match(/roua_session=([^;]+)/)
      if (cookieMatch) {
        result.cookies.set('roua_session', cookieMatch[1], {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60, // 24 hours
          path: '/',
        })
      }
    }

    return result
  } catch (error: any) {
    console.error('[auth/passkey/verify] Error:', error?.message || error)

    // If NestJS is offline, return error
    return NextResponse.json(
      {
        success: false,
        error: 'خدمة المصادقة غير متاحة حالياً. حاول لاحقاً.',
      },
      { status: 502 },
    )
  }
}
