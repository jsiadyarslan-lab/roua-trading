import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/auth/passkey/verify — WebAuthn passkey verification
 *
 * Proxies passkey verification to the NestJS backend.
 * The NestJS backend handles WebAuthn challenge generation and verification
 * at /api/auth/challenge and /api/auth/verify.
 *
 * Now also forwards the roua_refresh cookie from NestJS for cross-device session persistence.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'

    const nestjsPayload = {
      assertion: {
        id: body.id,
        rawId: body.rawId,
        response: body.response,
      },
      email: body.email || 'passkey@roua.auto',
    }

    const response = await fetch(`${apiTarget}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

    // Set session + refresh cookies if NestJS returned them
    const setCookieHeaders = response.headers.getSetCookie?.() || []
    const result: NextResponse = NextResponse.json({
      success: true,
      user: data.user,
    })

    // Parse and forward cookies from NestJS
    const allCookies = setCookieHeaders.length > 0 ? setCookieHeaders : [response.headers.get('set-cookie') || '']

    for (const setCookie of allCookies) {
      const sessionMatch = setCookie.match(/roua_session=([^;]+)/)
      if (sessionMatch) {
        result.cookies.set('roua_session', sessionMatch[1], {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60, // 24 hours
          path: '/',
        })
      }

      const refreshMatch = setCookie.match(/roua_refresh=([^;]+)/)
      if (refreshMatch) {
        result.cookies.set('roua_refresh', refreshMatch[1], {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60, // 30 days
          path: '/',
        })
      }
    }

    return result
  } catch (error: any) {
    console.error('[auth/passkey/verify] Error:', error?.message || error)

    return NextResponse.json(
      {
        success: false,
        error: 'خدمة المصادقة غير متاحة حالياً. حاول لاحقاً.',
      },
      { status: 502 },
    )
  }
}
