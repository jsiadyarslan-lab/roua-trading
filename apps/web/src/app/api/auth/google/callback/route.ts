import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-config'
import crypto from 'crypto'

/**
 * Google OAuth → roua_session bridge
 *
 * After NextAuth successfully authenticates the user with Google,
 * this route creates a roua_session cookie so the existing
 * session system (used by dashboard) recognizes the user.
 *
 * Flow:
 * 1. User clicks "Sign in with Google" → NextAuth handles OAuth
 * 2. NextAuth's redirect callback sends user here
 * 3. We read the NextAuth session to get the user's email
 * 4. We create a roua_session in the database
 * 5. We set the roua_session cookie and redirect to /dashboard
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    // Auto-detect NEXTAUTH_URL from request (same logic as [...nextauth]/route.ts)
    const host = request.headers.get('host')
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    if (host) {
      const detectedUrl = `${protocol}://${host}`
      const currentUrl = process.env.NEXTAUTH_URL
      const isInternalUrl = currentUrl && (
        currentUrl.includes('0.0.0.0') ||
        currentUrl.includes('127.0.0.1') ||
        (currentUrl.includes('localhost') && !host.includes('localhost'))
      )
      if (!currentUrl || isInternalUrl) {
        process.env.NEXTAUTH_URL = detectedUrl
      }
    }

    // Get the authenticated user from NextAuth session
    const authOptions = getAuthOptions()
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      console.warn('[Google Callback] No NextAuth session found')
      return NextResponse.redirect(
        new URL('/?error=Configuration', request.url)
      )
    }

    const email = session.user.email

    const user = await db.user.findUnique({ where: { email } })

    if (!user) {
      console.warn(`[Google Callback] User not found in DB: ${email}`)
      return NextResponse.redirect(
        new URL('/?error=OAuthCreateAccount', request.url)
      )
    }

    // Update avatar from Google if available
    if (session.user.image && !user.avatar) {
      try {
        await db.user.update({
          where: { id: user.id },
          data: { avatar: session.user.image },
        })
      } catch {
        // Non-critical
      }
    }

    // Update displayName from Google if available and not set
    const googleName = session.user.name
    if (googleName && (!user.displayName || user.displayName === user.email.split('@')[0])) {
      try {
        await db.user.update({
          where: { id: user.id },
          data: { displayName: googleName },
        })
      } catch {
        // Non-critical
      }
    }

    // Create a session in our custom session system
    const sessionToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await db.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt,
      },
    })

    // Log the login
    try {
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'AUTH_GOOGLE_LOGIN',
          resource: 'google_oauth',
          userAgent: request.headers.get('user-agent') || undefined,
        },
      })
    } catch {
      // Non-critical
    }

    console.log(`[Google Callback] Session created for ${email} — redirecting to dashboard`)

    // Redirect to dashboard with session cookie
    const response = NextResponse.redirect(new URL('/dashboard', request.url))
    response.cookies.set('roua_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[Google Callback] Error:', error)
    return NextResponse.redirect(
      new URL('/?error=Default', request.url)
    )
  }
}
