import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * Mask a sensitive token — show only last 4 characters.
 * Returns empty string if token is too short or empty.
 */
function maskToken(token: string): string {
  if (!token || token.length <= 4) return '••••'
  return `••••••••${token.slice(-4)}`
}

/**
 * Recursively mask known sensitive fields in a config object.
 * Currently masks: botToken, apiKey, apiSecret, secret, password, token
 */
function maskSensitiveFields(obj: Record<string, any>): Record<string, any> {
  const SENSITIVE_KEYS = new Set(['botToken', 'apiKey', 'apiSecret', 'secret', 'password', 'token', 'accessToken', 'refreshToken'])
  const masked = { ...obj }
  for (const key of Object.keys(masked)) {
    if (SENSITIVE_KEYS.has(key) && typeof masked[key] === 'string' && masked[key].length > 0) {
      masked[key] = maskToken(masked[key])
      // Add a flag so the frontend knows this is masked
      masked[`${key}_masked`] = true
    }
  }
  return masked
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ configs: [], error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const configs = await db.notificationConfig.findMany({
      orderBy: { type: 'asc' },
    })

    return NextResponse.json({
      configs: configs.map(c => {
        const parsedConfig = JSON.parse(c.config || '{}')
        return {
          id: c.id,
          type: c.type,
          enabled: c.enabled,
          // Mask sensitive fields before sending to client
          config: maskSensitiveFields(parsedConfig),
          description: c.description,
          lastTriggeredAt: c.lastTriggeredAt?.toISOString() || null,
          triggerCount: c.triggerCount,
          createdAt: c.createdAt.toISOString(),
        }
      }),
    })
  } catch (error: any) {
    console.error('[admin/notifications/config] GET Error:', error?.message || error)
    return NextResponse.json({ configs: [] })
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const { type, enabled, config } = await req.json()

    if (!type) {
      return NextResponse.json({ error: 'نوع التنبيه مطلوب' }, { status: 400 })
    }

    const existing = await db.notificationConfig.findUnique({ where: { type } })

    if (existing) {
      const updateData: any = {}
      if (typeof enabled === 'boolean') updateData.enabled = enabled

      if (config) {
        // Merge with existing config: if client omitted a sensitive field
        // (e.g., botToken not sent because it was masked), keep the existing value
        const existingConfig = JSON.parse(existing.config || '{}')
        const mergedConfig = { ...existingConfig }

        for (const [key, value] of Object.entries(config)) {
          // Skip masked placeholder values — keep the original
          if (typeof value === 'string' && value.startsWith('••••')) continue
          // Remove _masked flags before saving
          if (key.endsWith('_masked')) continue
          mergedConfig[key] = value
        }

        updateData.config = JSON.stringify(mergedConfig)
      }

      const updated = await db.notificationConfig.update({
        where: { type },
        data: updateData,
      })

      return NextResponse.json({
        config: {
          id: updated.id,
          type: updated.type,
          enabled: updated.enabled,
          config: maskSensitiveFields(JSON.parse(updated.config || '{}')),
          description: updated.description,
        },
      })
    } else {
      const created = await db.notificationConfig.create({
        data: {
          type,
          enabled: enabled ?? false,
          config: JSON.stringify(config || {}),
        },
      })

      return NextResponse.json({
        config: {
          id: created.id,
          type: created.type,
          enabled: created.enabled,
          config: maskSensitiveFields(JSON.parse(created.config || '{}')),
          description: created.description,
        },
      })
    }
  } catch (error: any) {
    console.error('[admin/notifications/config] POST Error:', error?.message || error)
    return NextResponse.json({ error: 'فشل في حفظ الإعدادات' }, { status: 500 })
  }
}
