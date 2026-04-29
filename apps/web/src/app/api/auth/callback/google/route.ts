import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
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
 * FIX: Previously this route didn't exist, causing 404 errors when users
 * clicked "Sign in with Google" on the login page.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')

  // User denied consent
  if (error === 'access_denied' || !code) {
    return NextResponse.redirect(new URL('/login?error=access_denied', request.url))
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?error=oauth_not_configured', request.url))
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
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        // FIX: Must match the redirect_uri used in /api/auth/signin/google
        // Use ORIGIN env var or X-Forwarded-Host to get the real public URL
        redirect_uri: `${(process.env.ORIGIN || (request.headers.get('x-forwarded-proto') || 'https') + '://' + (request.headers.get('x-forwarded-host') || request.nextUrl.host))}/api/auth/callback/google`,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!tokenResponse.ok) {
      console.error('[auth/callback/google] Token exchange failed:', tokenResponse.status)
      return NextResponse.redirect(new URL('/login?error=token_exchange_failed', request.url))
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      return NextResponse.redirect(new URL('/login?error=no_access_token', request.url))
    }

    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!userResponse.ok) {
      console.error('[auth/callback/google] User info fetch failed:', userResponse.status)
      return NextResponse.redirect(new URL('/login?error=user_info_failed', request.url))
    }

    const googleUser = await userResponse.json()
    const email = googleUser.email
    const displayName = googleUser.name || googleUser.given_name || email?.split('@')[0]

    if (!email) {
      return NextResponse.redirect(new URL('/login?error=no_email', request.url))
    }

    // Find or create user in database
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.redirect(new URL('/login?error=db_unavailable', request.url))
    }

    let user = await db.user.findUnique({ where: { email } })

    if (!user) {
      // Create new user with BASIC tier (higher than guest FREE)
      try {
        user = await db.user.create({
          data: {
            email,
            displayName,
            tier: 'BASIC',
            image: googleUser.picture || null,
          },
        })
      } catch {
        user = await db.user.findUnique({ where: { email } })
      }
    } else {
      // Update display name and image if changed
      try {
        user = await db.user.update({
          where: { id: user.id },
          data: {
            displayName: displayName || user.displayName,
            image: googleUser.picture || user.image,
          },
        })
      } catch { /* Non-critical */ }
    }

    if (!user) {
      return NextResponse.redirect(new URL('/login?error=user_creation_failed', request.url))
    }

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days for OAuth

    await db.session.create({
      data: { userId: user.id, token: sessionToken, expiresAt },
    })

    // Redirect with session cookie
    const response = NextResponse.redirect(new URL(callbackUrl, request.url))

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
    return NextResponse.redirect(new URL('/login?error=unknown', request.url))
  }
}
