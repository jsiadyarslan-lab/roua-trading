import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import {
  validateUserSetting,
  validateUserRiskCrossFields,
  ALLOWED_USER_SETTINGS_KEYS,
} from '@/lib/settings-validation'

export const dynamic = 'force-dynamic'

/**
 * GET /api/settings — Load user settings
 * Reads the user's settings from the Setting table (key-value store)
 * V188: Only returns user-scoped keys (user:{userId}:*)
 */
export async function GET(req: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ settings: {} })
    }

    // Get user ID from session cookie
    const sessionToken = req.cookies.get('roua_session')?.value

    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let userId: string | null = null

    try {
      const session = await db.session.findUnique({
        where: { token: sessionToken },
        select: { userId: true },
      })
      if (session?.userId) {
        userId = session.userId
      }
    } catch {
      // Session lookup failed
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // V188: Only fetch user-scoped settings (was already scoped, but explicitly documented)
    const settings = await db.setting.findMany({
      where: { key: { startsWith: `user:${userId}:` } },
    })

    // Convert to flat object
    const result: Record<string, any> = {}
    for (const s of settings) {
      const cleanKey = s.key.replace(`user:${userId}:`, '')
      // V188: Only return whitelisted keys to client
      if (!ALLOWED_USER_SETTINGS_KEYS.has(cleanKey)) continue
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
 *
 * V188 SECURITY FIXES:
 *   1. Key whitelist — only ALLOWED_USER_SETTINGS_KEYS can be saved
 *   2. Value validation — ranges, types, and sizes enforced
 *   3. Cross-field validation — SL < TP, riskPerTrade <= maxDailyLoss
 *   4. No privilege escalation — users cannot write to admin keys
 */
export async function PUT(req: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    // V188: Limit request body size to 10KB
    const contentLength = req.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > 10240) {
      return NextResponse.json({ error: 'حجم البيانات كبير جداً (الحد: 10 كيلوبايت)' }, { status: 413 })
    }

    const body = await req.json()
    const { settings } = body

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'بيانات الإعدادات غير صالحة' }, { status: 400 })
    }

    // V188: Limit number of keys per request
    const entries = Object.entries(settings)
    if (entries.length > 30) {
      return NextResponse.json({ error: 'عدد الإعدادات كبير جداً (الحد: 30 مفتاح)' }, { status: 400 })
    }

    // Get user ID from session cookie
    const sessionToken = req.cookies.get('roua_session')?.value

    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let userId: string | null = null

    try {
      const session = await db.session.findUnique({
        where: { token: sessionToken },
        select: { userId: true },
      })
      if (session?.userId) {
        userId = session.userId
      }
    } catch {
      // Session lookup failed
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // V188: Validate each setting before saving
    const validationErrors: string[] = []
    const validEntries: [string, any][] = []

    for (const [key, value] of entries) {
      const result = validateUserSetting(key, value)
      if (!result.valid) {
        validationErrors.push(result.error!)
      } else {
        validEntries.push([key, result.sanitized ?? value])
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json({
        error: 'أخطاء في التحقق من الإعدادات',
        details: validationErrors,
      }, { status: 400 })
    }

    // V188: Cross-field validation
    const allSettings: Record<string, any> = {}
    for (const [key, value] of validEntries) {
      allSettings[key] = value
    }
    const crossErrors = validateUserRiskCrossFields(allSettings)
    if (crossErrors.length > 0) {
      return NextResponse.json({
        error: 'أخطاء في التحقق المتبادل',
        details: crossErrors,
      }, { status: 400 })
    }

    // Upsert each validated setting
    const savedKeys: string[] = []
    for (const [key, value] of validEntries) {
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
        savedKeys.push(key)
      } catch (error: any) {
        console.error(`[settings PUT] Failed to save ${key}:`, error?.message)
      }
    }

    return NextResponse.json({ success: true, saved: savedKeys.length, keys: savedKeys })
  } catch (error: any) {
    console.error('[settings PUT] Error:', error?.message || error)
    return NextResponse.json({ error: 'فشل في حفظ الإعدادات' }, { status: 500 })
  }
}
