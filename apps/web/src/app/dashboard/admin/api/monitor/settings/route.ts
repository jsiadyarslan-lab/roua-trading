import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

const SETTINGS_TYPE = 'monitor_settings'

const DEFAULT_SETTINGS = {
  checkInterval: 60,
  alertThreshold: 2000,
  telegramEnabled: false,
}

/**
 * GET /dashboard/admin/api/monitor/settings
 *
 * Returns the monitor settings stored in NotificationConfig.
 * Falls back to defaults if no row exists.
 */
export async function GET() {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json(
        { settings: DEFAULT_SETTINGS, error: 'قاعدة البيانات غير متاحة' },
        { status: 503 }
      )
    }

    const row = await db.notificationConfig.findUnique({
      where: { type: SETTINGS_TYPE },
    })

    if (!row) {
      return NextResponse.json({ settings: DEFAULT_SETTINGS })
    }

    const config = JSON.parse(row.config || '{}')
    const settings = {
      checkInterval: config.checkInterval ?? DEFAULT_SETTINGS.checkInterval,
      alertThreshold: config.alertThreshold ?? DEFAULT_SETTINGS.alertThreshold,
      telegramEnabled: config.telegramEnabled ?? DEFAULT_SETTINGS.telegramEnabled,
    }

    return NextResponse.json({ settings })
  } catch (error: any) {
    console.error('[admin/monitor/settings] GET Error:', error?.message || error)
    return NextResponse.json({ settings: DEFAULT_SETTINGS })
  }
}

/**
 * POST /dashboard/admin/api/monitor/settings
 *
 * Accepts partial settings update:
 *   { checkInterval?: number, alertThreshold?: number, telegramEnabled?: boolean }
 *
 * Merges with existing settings and saves to NotificationConfig.
 */
export async function POST(req: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json(
        { error: 'قاعدة البيانات غير متاحة' },
        { status: 503 }
      )
    }

    const body = await req.json()

    // Validate inputs
    if (body.checkInterval !== undefined) {
      const val = Number(body.checkInterval)
      if (isNaN(val) || val < 10 || val > 3600) {
        return NextResponse.json(
          { error: 'فاصل الفحص يجب أن يكون بين 10 و 3600 ثانية' },
          { status: 400 }
        )
      }
    }

    if (body.alertThreshold !== undefined) {
      const val = Number(body.alertThreshold)
      if (isNaN(val) || val < 100 || val > 30000) {
        return NextResponse.json(
          { error: 'عتبة التنبيه يجب أن تكون بين 100 و 30000 ميلي ثانية' },
          { status: 400 }
        )
      }
    }

    // Load existing settings
    const existing = await db.notificationConfig.findUnique({
      where: { type: SETTINGS_TYPE },
    })

    const currentConfig = existing
      ? JSON.parse(existing.config || '{}')
      : { ...DEFAULT_SETTINGS }

    // Merge updates
    const updatedConfig = {
      checkInterval: body.checkInterval ?? currentConfig.checkInterval ?? DEFAULT_SETTINGS.checkInterval,
      alertThreshold: body.alertThreshold ?? currentConfig.alertThreshold ?? DEFAULT_SETTINGS.alertThreshold,
      telegramEnabled: body.telegramEnabled ?? currentConfig.telegramEnabled ?? DEFAULT_SETTINGS.telegramEnabled,
    }

    // Upsert
    if (existing) {
      await db.notificationConfig.update({
        where: { type: SETTINGS_TYPE },
        data: { config: JSON.stringify(updatedConfig) },
      })
    } else {
      await db.notificationConfig.create({
        data: {
          type: SETTINGS_TYPE,
          enabled: true,
          config: JSON.stringify(updatedConfig),
        },
      })
    }

    return NextResponse.json({
      success: true,
      settings: updatedConfig,
    })
  } catch (error: any) {
    console.error('[admin/monitor/settings] POST Error:', error?.message || error)
    return NextResponse.json(
      { error: 'فشل في حفظ إعدادات المراقبة' },
      { status: 500 }
    )
  }
}
