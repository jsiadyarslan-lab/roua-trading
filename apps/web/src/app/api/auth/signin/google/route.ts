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
  const redirectUri = `${request.nextUrl.origin}/api/auth/callback/google`

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
