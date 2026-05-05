import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { getPublicOrigin } from '@/lib/origin'
import { createSessionSafely } from '@/lib/session-create'
import crypto from 'crypto'

/**
 * GET /api/auth/callback/google — Google OAuth callback
 *
 * After the user consents on Google's consent screen, Google redirects here
 * with an authorization code. This handler:
 * 1. Exchanges the code for user info (email, name, picture)
 * 2. Finds or creates a user in the database
 * 3. Creates a session with device info and refresh token, sets cookies
 * 4. Redirects to the callbackUrl (default: /dashboard)
 */

function parseUserAgent(userAgent?: string | null) {
  if (!userAgent) return null
  const ua = userAgent.toLowerCase()

  let type = 'desktop'
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) type = 'mobile'
  else if (/ipad|tablet|kindle|silk/i.test(ua)) type = 'tablet'

  let browser = 'Unknown'
  if (ua.includes('edg/')) browser = 'Edge'
  else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Chrome'
  else if (ua.includes('firefox/')) browser = 'Firefox'
  else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari'
  else if (ua.includes('opera/') || ua.includes('opr/')) browser = 'Opera'

  let os = 'Unknown'
  if (ua.includes('windows')) os = 'Windows'
  else if (ua.includes('mac os')) os = 'macOS'
  else if (ua.includes('linux')) os = 'Linux'
  else if (ua.includes('android')) os = 'Android'
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS'

  return { browser, os, type, device: type }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')

  if (error === 'access_denied' || !code) {
    console.warn(`[auth/callback/google] Access denied or no code. error=${error}`)
    return NextResponse.redirect(new URL('/login?error=access_denied', getPublicOrigin(request)))
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('[auth/callback/google] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set')
    return NextResponse.redirect(new URL('/login?error=oauth_not_configured', getPublicOrigin(request)))
  }

  let callbackUrl = '/dashboard'
  try {
    if (stateParam) {
      const state = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
      if (state.callbackUrl) {
        const url = state.callbackUrl as string
        if (url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')) {
          callbackUrl = url
        } else {
          console.warn('[auth/callback/google] Blocked external callbackUrl:', url)
        }
      }
    }
  } catch { /* Use default */ }

  try {
    const publicOrigin = getPublicOrigin(request)
    const redirectUri = `${publicOrigin}/api/auth/callback/google`

    console.log(`[auth/callback/google] Using redirect URI: ${redirectUri} (origin: ${publicOrigin})`)

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!tokenResponse.ok) {
      // FIX (H5): Don't log the raw response body — it may contain access_token/id_token.
      // Only log the status code for debugging.
      console.error(`[auth/callback/google] Token exchange failed: ${tokenResponse.status}`)
      return NextResponse.redirect(new URL('/login?error=token_exchange_failed', getPublicOrigin(request)))
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      console.error('[auth/callback/google] No access_token in response:', Object.keys(tokenData))
      return NextResponse.redirect(new URL('/login?error=no_access_token', getPublicOrigin(request)))
    }

    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!userResponse.ok) {
      console.error(`[auth/callback/google] User info fetch failed: ${userResponse.status}`)
      return NextResponse.redirect(new URL('/login?error=user_info_failed', getPublicOrigin(request)))
    }

    const googleUser = await userResponse.json()
    const email = googleUser.email
    const displayName = googleUser.name || googleUser.given_name || email?.split('@')[0]

    if (!email) {
      console.error('[auth/callback/google] No email in Google user info')
      return NextResponse.redirect(new URL('/login?error=no_email', getPublicOrigin(request)))
    }

    console.log(`[auth/callback/google] Got user: ${email}`)

    const dbReady = await ensureDbReady()
    if (!dbReady) {
      console.error('[auth/callback/google] Database not ready')
      return NextResponse.redirect(new URL('/login?error=db_unavailable', getPublicOrigin(request)))
    }

    let user = await db.user.findUnique({ where: { email } })

    if (!user) {
      try {
        user = await db.user.create({
          data: {
            email,
            displayName,
            tier: 'FREE',
            avatar: googleUser.picture || null,
          },
        })
        console.log(`[auth/callback/google] Created new user: ${user.id}`)
      } catch {
        user = await db.user.findUnique({ where: { email } })
      }
    } else {
      try {
        user = await db.user.update({
          where: { id: user.id },
          data: {
            displayName: displayName || user.displayName,
            avatar: googleUser.picture || user.avatar,
          },
        })
      } catch { /* Non-critical */ }
    }

    if (!user) {
      console.error('[auth/callback/google] User creation/lookup failed')
      return NextResponse.redirect(new URL('/login?error=user_creation_failed', getPublicOrigin(request)))
    }

    // Create session with device info using the safe helper
    const userAgent = request.headers.get('user-agent')
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null
    const deviceInfo = parseUserAgent(userAgent)
    const sessionToken = crypto.randomBytes(32).toString('hex')
    const refreshToken = crypto.randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days for OAuth

    const createdToken = await createSessionSafely({
      userId: user.id,
      token: sessionToken,
      refreshToken,
      deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : null,
      ipAddress,
      userAgent,
      isActive: true,
      expiresAt,
    })

    if (!createdToken) {
      console.error('[auth/callback/google] Session creation failed after all strategies')
      return NextResponse.redirect(new URL('/login?error=session_creation_failed', getPublicOrigin(request)))
    }

    console.log(`[auth/callback/google] Session created successfully for user ${user.id}`)

    // Redirect with session + refresh cookies
    const response = NextResponse.redirect(new URL(callbackUrl, getPublicOrigin(request)))

    response.cookies.set('roua_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    response.cookies.set('roua_refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error(`[auth/callback/google] Unhandled error: ${error?.message || error}\n${error?.stack || ''}`)
    return NextResponse.redirect(new URL('/login?error=unknown', getPublicOrigin(request)))
  }
}
