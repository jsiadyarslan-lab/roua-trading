import { NextRequest, NextResponse } from 'next/server'
import { getPublicOrigin } from '@/lib/origin'

export const dynamic = 'force-dynamic'

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
        message: 'تسجيل الدخول عبر Google غير مُفعّل حالياً. استخدم البريد الإلكتروني أو Passkey.',
      },
      { status: 501 },
    )
  }

  // Build Google OAuth URL
  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/dashboard'

  // Use shared origin helper — handles Railway/containers correctly
  const publicOrigin = getPublicOrigin(request)
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
