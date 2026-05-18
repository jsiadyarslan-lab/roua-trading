import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * /api/bot/settings — Public bot settings endpoint
 *
 * This is the CRITICAL bridge between admin dashboard settings
 * and the live bot engine. When the admin saves settings via
 * /api/admin/settings, they are stored in the Setting table.
 * This endpoint reads those settings and returns them in a format
 * the BotEngine can use.
 *
 * No admin auth required — this is read-only and returns only
 * the settings needed for bot operation (no secrets/API keys).
 */

// Fallback defaults (same as useBotStore defaults)
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
  maxOpenPositions: '15',  // V143: Increased from 5 to 15 to match backend default
}

export async function GET(req: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({
        settings: mapToBotSettings(DEFAULT_BOT_CONFIG, DEFAULT_RISK_CONFIG),
        source: 'defaults',
        reason: 'قاعدة البيانات غير متاحة',
      })
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

    const botConfig = settingsMap.botConfig || DEFAULT_BOT_CONFIG
    const riskConfig = settingsMap.riskConfig || DEFAULT_RISK_CONFIG

    return NextResponse.json({
      settings: mapToBotSettings(botConfig, riskConfig),
      source: settingsMap.botConfig ? 'database' : 'defaults',
      updatedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[bot/settings] Error:', error?.message || error)
    return NextResponse.json({
      settings: mapToBotSettings(DEFAULT_BOT_CONFIG, DEFAULT_RISK_CONFIG),
      source: 'error',
      reason: 'فشل في قراءة الإعدادات',
    })
  }
}

/**
 * Map admin settings (DB format) to bot engine format.
 *
 * Admin stores maxDailyLoss as a positive dollar value (e.g., "2000")
 * BotEngine needs it as a negative number for comparison (e.g., -2000)
 */
function mapToBotSettings(
  botConfig: typeof DEFAULT_BOT_CONFIG,
  riskConfig: typeof DEFAULT_RISK_CONFIG,
) {
  return {
    // ── Protection limits (the most critical settings) ──
    maxDailyLoss: -Math.abs(parseFloat(botConfig.maxDailyLoss || '2000')),
    maxDrawdown: parseFloat(riskConfig.maxDrawdown || '15'),
    maxOpenPositions: parseInt(riskConfig.maxOpenPositions || '15', 10), // V143: '5'→'15'
    stopLossDefault: parseFloat(riskConfig.stopLossDefault || '2'),
    takeProfitDefault: parseFloat(riskConfig.takeProfitDefault || '4'),

    // ── Bot execution settings ──
    riskPerTrade: parseFloat(riskConfig.riskPerTrade || '1'),
    strategy: botConfig.strategy || 'Scalp AI',
    refreshInterval: parseInt(botConfig.refreshInterval || '30', 10),
    cooldownPeriod: parseInt(botConfig.cooldownPeriod || '60', 10),
    confLimit: 65, // Not stored in admin settings, use default

    // ── Raw admin values (for display) ──
    maxPositionSize: parseFloat(botConfig.maxPositionSize || '10000'),
    autoTrading: botConfig.autoTrading || false,
  }
}
