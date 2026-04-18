import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

// After NextAuth Google sign-in, create a roua_session cookie
// so the existing passkey-based session system recognizes the user
export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    const email = request.nextUrl.searchParams.get('email')

    if (!email) {
      return NextResponse.redirect(new URL('/?auth=error', request.url))
    }

    const user = await db.user.findUnique({ where: { email } })

    if (!user) {
      return NextResponse.redirect(new URL('/?auth=error', request.url))
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
