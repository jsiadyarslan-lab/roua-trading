import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

const GUEST_EMAIL = 'guest@roua.auto'

export type VerifiedSession = {
  token: string
  userId: string
  email: string
}

export async function verifyUserSession(
  request: NextRequest,
  options: { allowGuest?: boolean } = {},
): Promise<{ session: VerifiedSession; error: null } | { session: null; error: NextResponse }> {
  const token = request.cookies.get('roua_session')?.value

  if (!token) {
    return {
      session: null,
      error: NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 }),
    }
  }

  const dbReady = await ensureDbReady()
  if (!dbReady) {
    return {
      session: null,
      error: NextResponse.json({ success: false, error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 }),
    }
  }

  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!session || !session.isActive || session.expiresAt <= new Date()) {
    if (session) {
      await db.session.update({
        where: { id: session.id },
        data: { isActive: false },
      }).catch(() => {})
    }

    return {
      session: null,
      error: NextResponse.json({ success: false, error: 'SESSION_EXPIRED' }, { status: 401 }),
    }
  }

  const isGuest = session.user.email === GUEST_EMAIL || session.user.id.startsWith('guest')
  if (isGuest && !options.allowGuest) {
    return {
      session: null,
      error: NextResponse.json({ success: false, error: 'LOGIN_REQUIRED' }, { status: 403 }),
    }
  }

  return {
    session: {
      token,
      userId: session.user.id,
      email: session.user.email,
    },
    error: null,
  }
}
