import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/auth/signin/google — Initiate Google OAuth flow
 *
 * If Google OAuth credentials are configured (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET),
 * redirects the user to Google's consent screen. After consent, Google redirects
 * back to /api/auth/callback/google.
 *
 * If Google OAuth is NOT configured, returns a clear error so the frontend
 * can inform the user instead of showing a 404.
 *
 * FIX: In containerized environments (Railway), request.nextUrl.origin resolves
 * to the internal address (e.g. 0.0.0.0:8080) instead of the public URL.
 * We use the ORIGIN env var or the X-Forwarded-Host header to get the real origin.
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: 'GOOGLE_OAUTH_NOT_CONFIGURED',
        message: 'تسجيل الدخول عبر Google غير مُفعّل حالياً. استخدم Passkey أو الدخول كضيف.',
      },
      { status: 501 },
    )
  }

  // Build Google OAuth URL
  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/dashboard'

  // FIX: Determine the correct public origin.
  // In Railway/containers, request.nextUrl.origin is the internal address (0.0.0.0:8080).
  // Priority: ORIGIN env var > X-Forwarded-Host header > nextUrl.origin
  let publicOrigin = process.env.ORIGIN
  if (!publicOrigin) {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
    if (forwardedHost) {
      publicOrigin = `${forwardedProto}://${forwardedHost}`
    }
  }
  if (!publicOrigin) {
    // Last resort: use nextUrl.origin (may be wrong in containers)
    publicOrigin = request.nextUrl.origin
  }

  const redirectUri = `${publicOrigin}/api/auth/callback/google`

  console.log(`[auth/google] Using redirect URI: ${redirectUri} (origin: ${publicOrigin})`)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: Buffer.from(JSON.stringify({ callbackUrl })).toString('base64url'),
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
