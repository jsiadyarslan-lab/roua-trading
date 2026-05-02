import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { getPublicOrigin } from '@/lib/origin'
import crypto from 'crypto'

/**
 * GET /api/auth/callback/google — Google OAuth callback
 *
 * After the user consents on Google's consent screen, Google redirects here
 * with an authorization code. This handler:
 * 1. Exchanges the code for user info (email, name, picture)
 * 2. Finds or creates a user in the database
 * 3. Creates a session and sets the roua_session cookie
 * 4. Redirects to the callbackUrl (default: /dashboard)
 *
 * FIXES:
 * - Uses getPublicOrigin() for consistent redirect_uri (matches signin route)
 * - Fixed `image` → `avatar` to match Prisma User model
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')

  // User denied consent
  if (error === 'access_denied' || !code) {
    return NextResponse.redirect(new URL('/login?error=access_denied', getPublicOrigin(request)))
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?error=oauth_not_configured', getPublicOrigin(request)))
  }

  // Parse callbackUrl from state
  let callbackUrl = '/dashboard'
  try {
    if (stateParam) {
      const state = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
      if (state.callbackUrl) callbackUrl = state.callbackUrl
    }
  } catch { /* Use default */ }

  try {
    // Use the SAME origin helper as the signin route for consistent redirect_uri
    const publicOrigin = getPublicOrigin(request)
    const redirectUri = `${publicOrigin}/api/auth/callback/google`

    console.log(`[auth/callback/google] Using redirect URI: ${redirectUri} (origin: ${publicOrigin})`)

    // Exchange code for tokens
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
      console.error('[auth/callback/google] Token exchange failed:', tokenResponse.status)
      return NextResponse.redirect(new URL('/login?error=token_exchange_failed', getPublicOrigin(request)))
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      return NextResponse.redirect(new URL('/login?error=no_access_token', getPublicOrigin(request)))
    }

    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!userResponse.ok) {
      console.error('[auth/callback/google] User info fetch failed:', userResponse.status)
      return NextResponse.redirect(new URL('/login?error=user_info_failed', getPublicOrigin(request)))
    }

    const googleUser = await userResponse.json()
    const email = googleUser.email
    const displayName = googleUser.name || googleUser.given_name || email?.split('@')[0]

    if (!email) {
      return NextResponse.redirect(new URL('/login?error=no_email', getPublicOrigin(request)))
    }

    // Find or create user in database
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.redirect(new URL('/login?error=db_unavailable', getPublicOrigin(request)))
    }

    let user = await db.user.findUnique({ where: { email } })

    if (!user) {
      // Create new user with BASIC tier (higher than guest FREE)
      // FIX: Use `avatar` not `image` — matches Prisma User model
      try {
        user = await db.user.create({
          data: {
            email,
            displayName,
            tier: 'FREE',
            avatar: googleUser.picture || null,
          },
        })
      } catch {
        user = await db.user.findUnique({ where: { email } })
      }
    } else {
      // Update display name and avatar if changed
      // FIX: Use `avatar` not `image` — matches Prisma User model
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
      return NextResponse.redirect(new URL('/login?error=user_creation_failed', getPublicOrigin(request)))
    }

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days for OAuth

    await db.session.create({
      data: { userId: user.id, token: sessionToken, expiresAt },
    })

    // Redirect with session cookie
    const response = NextResponse.redirect(new URL(callbackUrl, getPublicOrigin(request)))

    response.cookies.set('roua_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[auth/callback/google] Error:', error?.message || error)
    return NextResponse.redirect(new URL('/login?error=unknown', getPublicOrigin(request)))
  }
}
