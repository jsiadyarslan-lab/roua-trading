import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('roua_admin_session')?.value

    if (!token) {
      return NextResponse.json({ authenticated: false })
    }

    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ authenticated: false, error: 'DB unavailable' }, { status: 503 })
    }

    const session = await db.adminSession.findUnique({
      where: { token },
    })

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await db.adminSession.delete({ where: { token } }).catch(() => {})
      }
      return NextResponse.json({ authenticated: false })
    }

    return NextResponse.json({
      authenticated: true,
      expiresAt: session.expiresAt.toISOString(),
    })
  } catch (error: any) {
    console.error('[admin/auth/session] Error:', error?.message || error)
    return NextResponse.json({ authenticated: false, error: 'Service unavailable' }, { status: 503 })
  }
}
