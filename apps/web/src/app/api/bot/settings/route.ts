import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { safeParseFloat, safeParseInt, UNIFIED_DEFAULTS, BOT_SETTINGS_KEYS } from '@/lib/settings-validation'

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
  maxOpenPositions: '20',  // V188: Unified default — same as RiskManager, ExposureManager
}

// V188: Added agentExecutorConfig defaults (was missing from bot settings)
const DEFAULT_AGENT_EXECUTOR_CONFIG = {
  executorMaxOpenPositions: '20',   // V188: Unified from 15 → 20
  agentMaxOpenPositions: '20',     // V188: Unified from 15 → 20
  executorMinConfidence: '65',     // V188: Unified from 40 → 65 (SAFE default)
  executorRiskPerTrade: '1',
  executorTickIntervalSec: '10',
  agentAnalysisIntervalMin: '30',
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

    // V188 SECURITY FIX: Only fetch needed keys (botConfig, riskConfig, agentExecutorConfig)
    // Previously, findMany() with NO filter loaded ALL settings including user-scoped data.
    const settings = await db.setting.findMany({
      where: { key: { in: BOT_SETTINGS_KEYS } },
    })

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
    const agentExecutorConfig = settingsMap.agentExecutorConfig || DEFAULT_AGENT_EXECUTOR_CONFIG

    return NextResponse.json({
      settings: mapToBotSettings(botConfig, riskConfig, agentExecutorConfig),
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
  agentExecutorConfig?: typeof DEFAULT_AGENT_EXECUTOR_CONFIG,
) {
  return {
    // ── Protection limits (the most critical settings) ──
    // V188: Use safeParseFloat/Int to prevent NaN from malformed strings
    maxDailyLoss: -Math.abs(safeParseFloat(botConfig.maxDailyLoss, 2000)),
    maxDrawdown: safeParseFloat(riskConfig.maxDrawdown, UNIFIED_DEFAULTS.maxDailyLossPercent),
    maxOpenPositions: safeParseInt(riskConfig.maxOpenPositions, UNIFIED_DEFAULTS.maxOpenPositions),
    stopLossDefault: safeParseFloat(riskConfig.stopLossDefault, UNIFIED_DEFAULTS.stopLossDefault),
    takeProfitDefault: safeParseFloat(riskConfig.takeProfitDefault, UNIFIED_DEFAULTS.takeProfitDefault),

    // ── Bot execution settings ──
    riskPerTrade: safeParseFloat(riskConfig.riskPerTrade, UNIFIED_DEFAULTS.riskPerTrade),
    strategy: botConfig.strategy || 'Scalp AI',
    refreshInterval: safeParseInt(botConfig.refreshInterval, 30),
    cooldownPeriod: safeParseInt(botConfig.cooldownPeriod, 60),
    // V188: confLimit now reads from agentExecutorConfig instead of being hardcoded
    confLimit: agentExecutorConfig
      ? safeParseInt(agentExecutorConfig.executorMinConfidence, UNIFIED_DEFAULTS.minConfidence)
      : UNIFIED_DEFAULTS.minConfidence,

    // ── Raw admin values (for display) ──
    maxPositionSize: safeParseFloat(botConfig.maxPositionSize, 10000),
    autoTrading: botConfig.autoTrading || false,

    // V188: Include agentExecutorConfig values for the bot engine
    executorMaxOpenPositions: agentExecutorConfig
      ? safeParseInt(agentExecutorConfig.executorMaxOpenPositions, UNIFIED_DEFAULTS.maxOpenPositions)
      : UNIFIED_DEFAULTS.maxOpenPositions,
    agentMaxOpenPositions: agentExecutorConfig
      ? safeParseInt(agentExecutorConfig.agentMaxOpenPositions, UNIFIED_DEFAULTS.maxOpenPositions)
      : UNIFIED_DEFAULTS.maxOpenPositions,
    executorRiskPerTrade: agentExecutorConfig
      ? safeParseFloat(agentExecutorConfig.executorRiskPerTrade, UNIFIED_DEFAULTS.riskPerTrade)
      : UNIFIED_DEFAULTS.riskPerTrade,
    executorTickIntervalSec: agentExecutorConfig
      ? safeParseInt(agentExecutorConfig.executorTickIntervalSec, 10)
      : 10,
    agentAnalysisIntervalMin: agentExecutorConfig
      ? safeParseInt(agentExecutorConfig.agentAnalysisIntervalMin, 30)
      : 30,
  }
}
