import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/settings — Load user settings
 * Reads the user's settings from the Setting table (key-value store)
 */
export async function GET(req: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ settings: {} })
    }

    // Get user ID from session cookie
    const sessionToken = req.cookies.get('roua_session')?.value
    let userId = 'default'

    if (sessionToken) {
      try {
        const session = await db.session.findUnique({
          where: { token: sessionToken },
          select: { userId: true },
        })
        if (session?.userId) {
          userId = session.userId
        }
      } catch {
        // Session lookup failed — use default
      }
    }

    // Load all settings for this user
    const settings = await db.setting.findMany({
      where: { key: { startsWith: `user:${userId}:` } },
    })

    // Convert to flat object
    const result: Record<string, any> = {}
    for (const s of settings) {
      const cleanKey = s.key.replace(`user:${userId}:`, '')
      try {
        result[cleanKey] = JSON.parse(s.value)
      } catch {
        result[cleanKey] = s.value
      }
    }

    return NextResponse.json({ settings: result })
  } catch (error: any) {
    console.error('[settings GET] Error:', error?.message || error)
    return NextResponse.json({ settings: {} })
  }
}

/**
 * PUT /api/settings — Save user settings
 * Body: { settings: { key: value, ... } }
 * Stores in Setting table with user-scoped keys
 */
export async function PUT(req: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const body = await req.json()
    const { settings } = body

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'بيانات الإعدادات غير صالحة' }, { status: 400 })
    }

    // Get user ID from session cookie
    const sessionToken = req.cookies.get('roua_session')?.value
    let userId = 'default'

    if (sessionToken) {
      try {
        const session = await db.session.findUnique({
          where: { token: sessionToken },
          select: { userId: true },
        })
        if (session?.userId) {
          userId = session.userId
        }
      } catch {
        // Session lookup failed — use default
      }
    }

    // Upsert each setting
    const entries = Object.entries(settings)
    for (const [key, value] of entries) {
      const scopedKey = `user:${userId}:${key}`
      const jsonValue = typeof value === 'string' ? value : JSON.stringify(value)

      try {
        await db.setting.upsert({
          where: { key: scopedKey },
          update: { value: jsonValue, updatedAt: new Date() },
          create: {
            id: `set_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            key: scopedKey,
            value: jsonValue,
          },
        })
      } catch (error: any) {
        console.error(`[settings PUT] Failed to save ${key}:`, error?.message)
      }
    }

    return NextResponse.json({ success: true, saved: entries.length })
  } catch (error: any) {
    console.error('[settings PUT] Error:', error?.message || error)
    return NextResponse.json({ error: 'فشل في حفظ الإعدادات' }, { status: 500 })
  }
}
