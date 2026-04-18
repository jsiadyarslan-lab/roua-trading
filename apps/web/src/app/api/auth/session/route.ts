import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    // Ensure database is initialized before any queries
    await ensureDbReady()

    const sessionToken = request.cookies.get('roua_session')?.value

    if (!sessionToken) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      // Clean up expired session
      if (session) {
        await db.session.delete({ where: { id: session.id } })
      }
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        tier: session.user.tier,
      },
    })
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('roua_session')?.value

    if (sessionToken) {
      // Delete session from database
      await db.session.deleteMany({
        where: { token: sessionToken },
      })

      // Log the logout
      const session = await db.session.findUnique({
        where: { token: sessionToken },
      })
      if (session) {
        await db.auditLog.create({
          data: {
            userId: session.userId,
            action: 'AUTH_LOGOUT',
            resource: 'session',
          },
        })
      }
    }

    const response = NextResponse.json({ success: true })
    response.cookies.delete('roua_session')

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
