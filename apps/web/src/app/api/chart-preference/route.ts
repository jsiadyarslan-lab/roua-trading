import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * Resolve userId from session cookie, with DEV_MODE fallback.
 * Returns 'default-user' only when no session is found (anonymous mode).
 */
async function resolveUserId(req: Request): Promise<string> {
  // DEV_MODE auto-authenticate (mirrors /api/auth/me logic)
  if (process.env.DEV_MODE === '1' && process.env.NODE_ENV !== 'production') {
    return 'dev-user-00000000'
  }

  try {
    await ensureDbReady()
    const sessionToken = (req as NextRequest).cookies.get('roua_session')?.value
    if (sessionToken) {
      const session = await db.session.findUnique({
        where: { token: sessionToken },
        select: { userId: true, expiresAt: true },
      })
      if (session && session.expiresAt > new Date()) {
        return session.userId
      }
    }
  } catch (error) {
    console.warn('[chart-preference] Session lookup failed, using anonymous:', error)
  }

  return 'default-user'
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || 'global'
    const userId = await resolveUserId(req)

    const pref = await db.chartPreference.findUnique({
      where: { userId_symbol: { userId, symbol } }
    })

    return NextResponse.json({ success: true, data: pref })
  } catch (error) {
    console.error('ChartPreference GET Error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || 'global'
    const userId = await resolveUserId(req)
    
    const body = await req.json()
    const { settings, drawings } = body

    // Ensure the user exists for development/demo purposes
    await db.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `user-${userId}@rouatrading.com`, displayName: `User ${userId.slice(0, 8)}` }
    })

    const pref = await db.chartPreference.upsert({
      where: { userId_symbol: { userId, symbol } },
      update: {
        settings: settings ? JSON.stringify(settings) : undefined,
        drawings: drawings ? JSON.stringify(drawings) : undefined,
      },
      create: {
        userId,
        symbol,
        settings: settings ? JSON.stringify(settings) : '{}',
        drawings: drawings ? JSON.stringify(drawings) : '[]',
      }
    })

    return NextResponse.json({ success: true, data: pref })
  } catch (error) {
    console.error('ChartPreference POST Error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
