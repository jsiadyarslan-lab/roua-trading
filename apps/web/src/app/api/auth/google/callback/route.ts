import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../[...nextauth]/route'
import crypto from 'crypto'

/**
 * Google OAuth → roua_session bridge
 *
 * After NextAuth successfully authenticates the user with Google,
 * this route creates a roua_session cookie so the existing
 * passkey-based session system recognizes the user.
 *
 * This route is called via NextAuth's redirect callback.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    // Get the authenticated user from NextAuth session
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      console.warn('[Google Callback] No NextAuth session found')
      return NextResponse.redirect(new URL('/?auth=error', request.url))
    }

    const email = session.user.email

    const user = await db.user.findUnique({ where: { email } })

    if (!user) {
      console.warn(`[Google Callback] User not found in DB: ${email}`)
      return NextResponse.redirect(new URL('/?auth=error', request.url))
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

    console.log(`[Google Callback] Session created for ${email}`)

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
    return NextResponse.redirect(new URL('/?auth=error', request.url))
  }
}
