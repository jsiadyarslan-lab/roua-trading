import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'
import { validateAdminConfig, UNIFIED_DEFAULTS, safeParseFloat, safeParseInt } from '@/lib/settings-validation'

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
  maxDrawdown: '5',
  stopLossDefault: '2',
  takeProfitDefault: '4',
  riskPerTrade: '1',
  maxOpenPositions: '20',  // V188: Unified default — same as SmartExecutor, RiskManager
  // BUG-066c: Global admin-level hard caps (default for all users)
  // Per-user overrides take priority when set via /dashboard/settings
  hardRiskCap: '5',
  maxNotionalPercent: '15', // BUG-066q: was '50' → '15' (15% notional cap — best practice)
}

const DEFAULT_AGENT_EXECUTOR_CONFIG = {
  executorMaxOpenPositions: '20',   // V188: Unified from 15 → 20
  agentMaxOpenPositions: '20',     // V188: Unified from 15 → 20
  executorMinConfidence: '65',     // V188: Unified from 40 → 65 (SAFE default)
  executorRiskPerTrade: '1',
  executorTickIntervalSec: '10',
  agentAnalysisIntervalMin: '30',
}

const DEFAULT_COUNCIL_CONFIG = {
  consensusThreshold: '55',
  minBriefConfidence: '50',
  dailyCostCapUsd: '50',
  executorIntervalMin: '15',
  agentIntervalMin: '30',
  maxPairsPerSession: '7',
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
    agentExecutorConfig: DEFAULT_AGENT_EXECUTOR_CONFIG,
    councilConfig: DEFAULT_COUNCIL_CONFIG,
    platformConfig: DEFAULT_PLATFORM_CONFIG,
    apiKeys: [],
    error: 'قاعدة البيانات غير متاحة',
  })

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json(emptyResponse())
    }

    // V188: Only fetch the config keys we need instead of ALL settings
    const settings = await db.setting.findMany({
      where: { key: { in: ['botConfig', 'riskConfig', 'agentExecutorConfig', 'councilConfig', 'platformConfig'] } },
    })

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
      agentExecutorConfig: settingsMap.agentExecutorConfig || DEFAULT_AGENT_EXECUTOR_CONFIG,
      councilConfig: settingsMap.councilConfig || DEFAULT_COUNCIL_CONFIG,
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

    // V188: Limit request body size to 10KB
    const contentLength = req.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > 10240) {
      return NextResponse.json({ error: 'حجم البيانات كبير جداً' }, { status: 413 })
    }

    const body = await req.json()
    const { botConfig, riskConfig, agentExecutorConfig, councilConfig, platformConfig } = body

    // V188: Validate each config group before saving
    const validationErrors: string[] = []
    const sanitizedConfigs: Record<string, any> = {}

    if (botConfig) {
      const result = validateAdminConfig('botConfig', botConfig)
      if (!result.valid) validationErrors.push(...result.errors)
      sanitizedConfigs.botConfig = { ...botConfig, ...result.sanitized }
    }
    if (riskConfig) {
      const result = validateAdminConfig('riskConfig', riskConfig)
      if (!result.valid) validationErrors.push(...result.errors)
      sanitizedConfigs.riskConfig = { ...riskConfig, ...result.sanitized }
    }
    if (agentExecutorConfig) {
      const result = validateAdminConfig('agentExecutorConfig', agentExecutorConfig)
      if (!result.valid) validationErrors.push(...result.errors)
      sanitizedConfigs.agentExecutorConfig = { ...agentExecutorConfig, ...result.sanitized }
    }
    if (platformConfig) {
      const result = validateAdminConfig('platformConfig', platformConfig)
      if (!result.valid) validationErrors.push(...result.errors)
      sanitizedConfigs.platformConfig = { ...platformConfig, ...result.sanitized }
    }
    if (councilConfig) {
      const result = validateAdminConfig('councilConfig', councilConfig)
      if (!result.valid) validationErrors.push(...result.errors)
      sanitizedConfigs.councilConfig = { ...councilConfig, ...result.sanitized }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json({
        error: 'أخطاء في التحقق من الإعدادات',
        details: validationErrors,
      }, { status: 400 })
    }

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

    // V188: Use sanitized configs instead of raw input
    const sBotConfig = sanitizedConfigs.botConfig || botConfig
    const sRiskConfig = sanitizedConfigs.riskConfig || riskConfig
    const sPlatformConfig = sanitizedConfigs.platformConfig || platformConfig
    const sAgentExecutorConfig = sanitizedConfigs.agentExecutorConfig || agentExecutorConfig
    const sCouncilConfig = sanitizedConfigs.councilConfig || councilConfig

    if (sBotConfig) {
      upserts.push(
        db.setting.upsert({
          where: { key: 'botConfig' },
          update: { value: JSON.stringify(sBotConfig) },
          create: { key: 'botConfig', value: JSON.stringify(sBotConfig) },
        })
      )
    }

    if (sRiskConfig) {
      upserts.push(
        db.setting.upsert({
          where: { key: 'riskConfig' },
          update: { value: JSON.stringify(sRiskConfig) },
          create: { key: 'riskConfig', value: JSON.stringify(sRiskConfig) },
        })
      )
    }

    if (sPlatformConfig) {
      upserts.push(
        db.setting.upsert({
          where: { key: 'platformConfig' },
          update: { value: JSON.stringify(sPlatformConfig) },
          create: { key: 'platformConfig', value: JSON.stringify(sPlatformConfig) },
        })
      )
    }

    if (sAgentExecutorConfig) {
      upserts.push(
        db.setting.upsert({
          where: { key: 'agentExecutorConfig' },
          update: { value: JSON.stringify(sAgentExecutorConfig) },
          create: { key: 'agentExecutorConfig', value: JSON.stringify(sAgentExecutorConfig) },
        })
      )
    }

    if (sCouncilConfig) {
      upserts.push(
        db.setting.upsert({
          where: { key: 'councilConfig' },
          update: { value: JSON.stringify(sCouncilConfig) },
          create: { key: 'councilConfig', value: JSON.stringify(sCouncilConfig) },
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
      agentExecutorConfig: !!agentExecutorConfig,
      councilConfig: !!councilConfig,
      platformConfig: !!platformConfig,
    })

    return NextResponse.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' })
  } catch (error: any) {
    console.error('[admin/settings] POST Error:', error?.message || error, error?.code || '')
    // Provide specific error messages based on Prisma error codes
    if (error?.code === 'P2021') {
      return NextResponse.json({ error: 'جدول الإعدادات غير موجود في قاعدة البيانات — يرجى تشغيل prisma db push' }, { status: 500 })
    }
    // V188: Don't leak raw error messages to client
    console.error('[admin/settings] POST Error details:', error?.message, error?.code)
    return NextResponse.json({ error: 'فشل في حفظ الإعدادات — يرجى المحاولة مرة أخرى' }, { status: 500 })
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
