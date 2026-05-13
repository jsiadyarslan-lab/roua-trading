import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/admin/api/settings — System settings CRUD
 *
 * GET  — Returns all system settings as a JSON object.
 *         Keys: botConfig, riskConfig, platformConfig
 *         Returns defaults if DB is unavailable or no settings exist.
 *
 * POST — Saves settings to the database (upsert by key).
 *         Body: { botConfig?, riskConfig?, platformConfig? }
 *         Each value is stored as JSON in the Setting table.
 */

const DEFAULT_BOT_CONFIG = {
  autoTrading: false,
  maxPositionSize: '10000',
  maxDailyLoss: '2000',
  strategy: 'Scalp AI',
  refreshInterval: '30',
  cooldownPeriod: '60',
}

const DEFAULT_RISK_CONFIG = {
  maxDrawdown: '15',
  stopLossDefault: '2',
  takeProfitDefault: '4',
  riskPerTrade: '1',
  maxOpenPositions: '5',
  leverageLimit: '3',
}

const DEFAULT_PLATFORM_CONFIG = {
  maintenanceMode: false,
  registrationOpen: true,
  demoMode: false,
  notificationsEnabled: true,
  autoLogout: '30',
  sessionTimeout: '24',
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const emptyResponse = () => ({
    botConfig: DEFAULT_BOT_CONFIG,
    riskConfig: DEFAULT_RISK_CONFIG,
    platformConfig: DEFAULT_PLATFORM_CONFIG,
    apiKeys: [],
    error: 'قاعدة البيانات غير متاحة',
  })

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json(emptyResponse())
    }

    // Fetch all settings from the Setting table
    const settings = await db.setting.findMany()

    const settingsMap: Record<string, any> = {}
    for (const s of settings) {
      try {
        settingsMap[s.key] = JSON.parse(s.value)
      } catch {
        settingsMap[s.key] = s.value
      }
    }

    // Fetch API keys from ExchangeCredential (system-wide, for admin)
    let apiKeys: Array<{
      id: string
      exchange: string
      keyPreview: string
      isActive: boolean
      lastValidated: string | null
    }> = []

    try {
      const credentials = await db.exchangeCredential.findMany({
        where: { isValid: true },
        select: {
          id: true,
          exchange: true,
          encryptedApiKey: true,
          isValid: true,
          lastValidatedAt: true,
          label: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      apiKeys = credentials.map(c => ({
        id: c.id,
        exchange: c.exchange,
        keyPreview: maskKey(c.encryptedApiKey),
        isActive: c.isValid,
        lastValidated: c.lastValidatedAt?.toISOString() || null,
      }))
    } catch (err) {
      console.warn('[admin/settings] Could not fetch exchange credentials:', err)
    }

    // Also try ApiKey model
    try {
      const apiKeysFromModel = await db.apiKey.findMany({
        where: { isActive: true },
        select: {
          id: true,
          exchange: true,
          encryptedKey: true,
          isActive: true,
          lastValidated: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      // Merge with existing API keys (avoid duplicates by id)
      const existingIds = new Set(apiKeys.map(k => k.id))
      for (const k of apiKeysFromModel) {
        if (!existingIds.has(k.id)) {
          apiKeys.push({
            id: k.id,
            exchange: k.exchange,
            keyPreview: maskKey(k.encryptedKey),
            isActive: k.isActive,
            lastValidated: k.lastValidated?.toISOString() || null,
          })
        }
      }
    } catch (err) {
      console.warn('[admin/settings] Could not fetch API keys:', err)
    }

    return NextResponse.json({
      botConfig: settingsMap.botConfig || DEFAULT_BOT_CONFIG,
      riskConfig: settingsMap.riskConfig || DEFAULT_RISK_CONFIG,
      platformConfig: settingsMap.platformConfig || DEFAULT_PLATFORM_CONFIG,
      apiKeys,
    })
  } catch (error: any) {
    console.error('[admin/settings] GET Error:', error?.message || error)
    return NextResponse.json(emptyResponse())
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

    const body = await req.json()
    const { botConfig, riskConfig, platformConfig } = body

    // Verify Setting table exists before attempting upsert
    // FIX: DDL (CREATE TABLE, ALTER TABLE) has been REMOVED from application code.
    // All schema changes must ONLY be done via `prisma migrate deploy` in start.sh.
    // Previously, this code ran CREATE TABLE IF NOT EXISTS as a "safety net",
    // which conflicts with Prisma schema management and can cause connection
    // pool exhaustion during deployment.
    try {
      await db.setting.findFirst()
    } catch (tableErr: any) {
      const msg = tableErr?.message || String(tableErr)
      const code = (tableErr as any)?.code
      console.error('[admin/settings] Setting table error:', msg)
      if (msg.includes('does not exist') || msg.includes('not found') || code === 'P2021') {
        return NextResponse.json({
          error: 'جدول الإعدادات غير موجود — يرجى تشغيل prisma db push أو prisma migrate deploy من خلال start.sh',
        }, { status: 500 })
      }
    }

    // Upsert each settings group
    const upserts: Promise<any>[] = []

    if (botConfig) {
      upserts.push(
        db.setting.upsert({
          where: { key: 'botConfig' },
          update: { value: JSON.stringify(botConfig) },
          create: { key: 'botConfig', value: JSON.stringify(botConfig) },
        })
      )
    }

    if (riskConfig) {
      upserts.push(
        db.setting.upsert({
          where: { key: 'riskConfig' },
          update: { value: JSON.stringify(riskConfig) },
          create: { key: 'riskConfig', value: JSON.stringify(riskConfig) },
        })
      )
    }

    if (platformConfig) {
      upserts.push(
        db.setting.upsert({
          where: { key: 'platformConfig' },
          update: { value: JSON.stringify(platformConfig) },
          create: { key: 'platformConfig', value: JSON.stringify(platformConfig) },
        })
      )
    }

    if (upserts.length === 0) {
      return NextResponse.json({ error: 'لم يتم توفير أي إعدادات للحفظ' }, { status: 400 })
    }

    await Promise.all(upserts)

    console.log('[admin/settings] Settings saved successfully:', {
      botConfig: !!botConfig,
      riskConfig: !!riskConfig,
      platformConfig: !!platformConfig,
    })

    return NextResponse.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' })
  } catch (error: any) {
    console.error('[admin/settings] POST Error:', error?.message || error, error?.code || '')
    // Provide specific error messages based on Prisma error codes
    if (error?.code === 'P2021') {
      return NextResponse.json({ error: 'جدول الإعدادات غير موجود في قاعدة البيانات — يرجى تشغيل prisma db push' }, { status: 500 })
    }
    return NextResponse.json({ error: `فشل في حفظ الإعدادات: ${error?.message || 'خطأ غير معروف'}` }, { status: 500 })
  }
}

/**
 * Mask a key for display — show only first 2 and last 4 chars
 */
function maskKey(encrypted: string): string {
  if (!encrypted) return '••••••••'
  const visible = encrypted.replace(/[^a-zA-Z0-9]/g, '')
  if (visible.length <= 6) return '••••••••'
  const prefix = visible.substring(0, 2).toUpperCase()
  const suffix = visible.substring(visible.length - 4).toUpperCase()
  return `${prefix}••••••••${suffix}`
}
