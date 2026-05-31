import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('roua_admin_session')?.value

    if (token) {
      const dbReady = await ensureDbReady()
      if (dbReady) {
        await db.adminSession.delete({ where: { token } }).catch(() => {})
      }
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set('roua_admin_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })

    return response
  } catch (error: any) {
    console.error('[admin/auth/logout] Error:', error?.message || error)
    return NextResponse.json({ success: true })
  }
}
