import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * Check if an email belongs to a guest user.
 * Matches both the legacy guest@roua.auto and the new unique guest-{uuid}@roua.auto pattern.
 */
function isGuestEmail(email: string): boolean {
  return email === 'guest@roua.auto' || /^guest-[a-f0-9]+@roua\.auto$/.test(email)
}

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

  const isGuest = isGuestEmail(session.user.email) || session.user.id.startsWith('guest')
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
