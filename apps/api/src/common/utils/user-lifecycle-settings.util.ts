import { PrismaService } from '../prisma/prisma.service';

/**
 * V410: User Lifecycle Settings Helper
 *
 * Reads per-user lifecycle settings from the Setting table (key-value store,
 * user-scoped as `user:{userId}:{key}`). Falls back to process.env defaults
 * when the user has not configured a value.
 *
 * This lets each user tune their own trade lifecycle without needing admin
 * access to Railway env vars. Settings are exposed via /api/settings and
 * the dashboard settings tabs.
 *
 * Settings (all user-scoped):
 *   - monitorTickLogIntervalMs     (5s–10min, default 60s)
 *   - agentMaxNewOpensPerCycle     (1–20, default 3)
 *   - executorMaxNewOpensPerTick   (1–20, default 2)
 *   - v407AutoStaleEnabled         (bool, default false)
 *
 * NOTE: v408CalibrationFactor is intentionally NOT here — it's a global
 * AI Council setting (env var only), not per-user.
 */

export interface UserLifecycleSettings {
  monitorTickLogIntervalMs: number;
  agentMaxNewOpensPerCycle: number;
  executorMaxNewOpensPerTick: number;
  v407AutoStaleEnabled: boolean;
}

const DEFAULTS: UserLifecycleSettings = {
  monitorTickLogIntervalMs: parseInt(process.env.MONITOR_TICK_LOG_INTERVAL_MS || '60000', 10),
  agentMaxNewOpensPerCycle: parseInt(process.env.AGENT_MAX_NEW_OPENS_PER_CYCLE || '3', 10),
  executorMaxNewOpensPerTick: parseInt(process.env.EXECUTOR_MAX_NEW_OPENS_PER_TICK || '2', 10),
  v407AutoStaleEnabled: process.env.V407_AUTO_STALE_ENABLED === 'true',
};

/**
 * Read a single user-scoped setting from the Setting table.
 * Returns null if not found or on error (caller falls back to default).
 * Return type is `any` because Setting values are JSON-encoded and may
 * hold strings, numbers, booleans, or objects (JSON.parse output).
 */
async function readUserSetting(
  prisma: PrismaService,
  userId: string,
  key: string,
): Promise<any | null> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: `user:${userId}:${key}` },
    });
    if (!row || !row.value) return null;
    // Setting values are stored as JSON-encoded strings
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  } catch {
    return null;
  }
}

/**
 * Load all lifecycle settings for a user, applying DB overrides on top of
 * env-var defaults. Returns the merged settings object.
 */
export async function loadUserLifecycleSettings(
  prisma: PrismaService,
  userId: string,
): Promise<UserLifecycleSettings> {
  const [
    monitorTickRaw,
    agentMaxRaw,
    executorMaxRaw,
    autoStaleRaw,
  ] = await Promise.all([
    readUserSetting(prisma, userId, 'monitorTickLogIntervalMs'),
    readUserSetting(prisma, userId, 'agentMaxNewOpensPerCycle'),
    readUserSetting(prisma, userId, 'executorMaxNewOpensPerTick'),
    readUserSetting(prisma, userId, 'v407AutoStaleEnabled'),
  ]);

  // Apply overrides with range validation (mirror of frontend SETTINGS_RANGES)
  const result: UserLifecycleSettings = { ...DEFAULTS };

  // V410: Use `!= null` (loose equality) to catch both null and undefined,
  // since JSON.parse can return undefined for missing keys in some edge cases.
  if (monitorTickRaw != null) {
    const v = parseInt(String(monitorTickRaw), 10);
    if (!Number.isNaN(v) && v >= 5000 && v <= 600000) {
      result.monitorTickLogIntervalMs = v;
    }
  }

  if (agentMaxRaw != null) {
    const v = parseInt(String(agentMaxRaw), 10);
    if (!Number.isNaN(v) && v >= 1 && v <= 20) {
      result.agentMaxNewOpensPerCycle = v;
    }
  }

  if (executorMaxRaw != null) {
    const v = parseInt(String(executorMaxRaw), 10);
    if (!Number.isNaN(v) && v >= 1 && v <= 20) {
      result.executorMaxNewOpensPerTick = v;
    }
  }

  if (autoStaleRaw != null) {
    // Handle both boolean (from JSON) and string ('true'/'false') representations
    result.v407AutoStaleEnabled =
      autoStaleRaw === true ||
      autoStaleRaw === 'true' ||
      autoStaleRaw === 1 ||
      autoStaleRaw === '1';
  }

  return result;
}

/**
 * Return env-var defaults without touching the database. Used by code paths
 * that don't have a user context yet (e.g. position monitor pre-cycle setup).
 */
export function getDefaultLifecycleSettings(): UserLifecycleSettings {
  return { ...DEFAULTS };
}
