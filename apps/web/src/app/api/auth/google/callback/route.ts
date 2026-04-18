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
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    // Get the authenticated user from NextAuth session
    const session = await getServerSession(getAuthOptions())

    if (!session?.user?.email) {
      console.warn('[Google Callback] No NextAuth session found')
      return NextResponse.redirect(
        new URL('/?error=Configuration', request.url)
      )
    }

    const email = session.user.email

    // Find or create user in our DB
    let user = await db.user.findUnique({ where: { email } })

    if (!user) {
      // User should have been created in signIn callback, but create as fallback
      user = await db.user.create({
        data: {
          email,
          displayName: session.user.name || email.split('@')[0],
          avatar: session.user.image || null,
        },
      })
      console.log(`[Google Callback] Created user: ${email}`)
    }

    // Update avatar and name from Google if available
    if (session.user.image && !user.avatar) {
      try {
        await db.user.update({
          where: { id: user.id },
          data: { avatar: session.user.image },
        })
      } catch {}
    }

    const googleName = session.user.name
    if (googleName && (!user.displayName || user.displayName === user.email.split('@')[0])) {
      try {
        await db.user.update({
          where: { id: user.id },
          data: { displayName: googleName },
        })
      } catch {}
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
    } catch {}

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
