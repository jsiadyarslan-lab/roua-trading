import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady, resetDbInitialized } from '@/lib/db'
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
    return NextResponse.json({ configs: [], error: error?.message || 'فشل في جلب الإعدادات' })
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      console.error('[admin/notifications/config] POST: DB not ready')
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const body = await req.json()
    const { type, enabled, config } = body

    console.log(`[admin/notifications/config] POST: type=${type}, enabled=${enabled}, configKeys=${config ? Object.keys(config).join(',') : 'none'}`)

    if (!type) {
      return NextResponse.json({ error: 'نوع التنبيه مطلوب' }, { status: 400 })
    }

    // Validate type
    const validTypes = ['telegram', 'browser', 'email', 'events']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `نوع غير صالح: ${type}` }, { status: 400 })
    }

    const existing = await db.notificationConfig.findUnique({ where: { type } })

    if (existing) {
      const updateData: any = {}
      if (typeof enabled === 'boolean') updateData.enabled = enabled

      if (config && typeof config === 'object') {
        // Merge with existing config: if client omitted a sensitive field
        // (e.g., botToken not sent because it was masked), keep the existing value
        const existingConfig = JSON.parse(existing.config || '{}')
        const mergedConfig = { ...existingConfig }

        for (const [key, value] of Object.entries(config)) {
          // Skip masked placeholder values — keep the original
          if (typeof value === 'string' && value.startsWith('••••')) continue
          // Remove _masked flags before saving
          if (key.endsWith('_masked')) continue
          // Skip empty strings for sensitive fields (user cleared the field but we should keep existing)
          const SENSITIVE_KEYS = new Set(['botToken', 'apiKey', 'apiSecret', 'secret', 'password', 'token'])
          if (SENSITIVE_KEYS.has(key) && (value === '' || value === undefined)) {
            // User explicitly cleared the sensitive field — remove it
            delete mergedConfig[key]
            continue
          }
          mergedConfig[key] = value
        }

        updateData.config = JSON.stringify(mergedConfig)
      }

      // If updateData is empty, still update to ensure the record is touched
      if (Object.keys(updateData).length === 0) {
        updateData.enabled = existing.enabled // No-op update
      }

      console.log(`[admin/notifications/config] POST: Updating ${type}, updateData keys: ${Object.keys(updateData).join(',')}`)

      const updated = await db.notificationConfig.update({
        where: { type },
        data: updateData,
      })

      console.log(`[admin/notifications/config] POST: Updated ${type} successfully, enabled=${updated.enabled}`)

      return NextResponse.json({
        ok: true,
        config: {
          id: updated.id,
          type: updated.type,
          enabled: updated.enabled,
          config: maskSensitiveFields(JSON.parse(updated.config || '{}')),
          description: updated.description,
        },
      })
    } else {
      // Create new config
      const configData = config && typeof config === 'object' ? config : {}

      console.log(`[admin/notifications/config] POST: Creating ${type}, enabled=${enabled ?? false}`)

      const created = await db.notificationConfig.create({
        data: {
          type,
          enabled: enabled ?? false,
          config: JSON.stringify(configData),
        },
      })

      console.log(`[admin/notifications/config] POST: Created ${type} successfully, id=${created.id}`)

      return NextResponse.json({
        ok: true,
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
    // V188: Removed resetDbInitialized() — resetting the entire DB connection pool
    // on a single POST error causes cascading failures for other in-flight requests.
    // The DB client will handle reconnection naturally on the next request.
    return NextResponse.json({ error: 'فشل في حفظ إعدادات التنبيهات — يرجى المحاولة مرة أخرى' }, { status: 500 })
  }
}
