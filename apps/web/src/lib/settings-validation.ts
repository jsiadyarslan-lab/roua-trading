/**
 * Settings Validation Module — V188
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * موديول التحقق من صحة الإعدادات
 *
 * يعالج الثغرات الأمنية والمنطقية في قسم الإعدادات:
 *   1. قائمة المفاتيح المسموحة (key whitelist) — يمنع حقن مفاتيح عشوائية
 *   2. تحقق من نطاقات القيم (value ranges) — يمنع قيم خطيرة
 *   3. تحقق متبادل بين الحقول (cross-field validation)
 *   4. تنظيف المدخلات (sanitization)
 */

// ── Allowed user settings keys (whitelist) ──
// فقط هذه المفاتيح يمكن للمستخدم حفظها عبر PUT /api/settings
export const ALLOWED_USER_SETTINGS_KEYS = new Set([
  'activeCredentialId',
  'userRiskPerTrade',
  'userMaxOpenPositions',
  'userMaxDailyLoss',
  'userStopLoss',
  'userTakeProfit',
  'riskWarningAcknowledged',
  'dailyLossHit',
  'orderSize',
  'riskLevel',
  'chartType',
  'timeframe',
  'confirmTrades',
  'showPositions',
  'autoStopLoss',
  'trailingStop',
  'aiConfidence',
  'aiAutoTrade',
  'aiModel',
  'analyticsEnabled',
  'crashReports',
  'notificationsEnabled',
  'soundEnabled',
  'browserNotifications',
  'botAlerts',
  'aiAlerts',
  'scannerAlerts',
  'tradeAlerts',
  'minConfidence',
  'autoExecute',
  'isDark',
  'language',
  'fontSize',
  'tradingMode',
])

// ── Value range constraints ──
export const SETTINGS_RANGES = {
  userRiskPerTrade: { min: 0.1, max: 10, type: 'number' as const },
  userMaxOpenPositions: { min: 1, max: 50, type: 'integer' as const },
  userMaxDailyLoss: { min: 1, max: 50, type: 'number' as const },
  userStopLoss: { min: 0.1, max: 50, type: 'number' as const },
  userTakeProfit: { min: 0.1, max: 100, type: 'number' as const },
  aiConfidence: { min: 50, max: 99, type: 'integer' as const },
  orderSize: { min: 1, max: 100, type: 'number' as const },
  fontSize: { min: 12, max: 24, type: 'integer' as const },
} as const

// ── Allowed admin config keys (whitelist for /api/admin/settings POST) ──
export const ALLOWED_ADMIN_CONFIG_KEYS = new Set([
  'botConfig',
  'riskConfig',
  'agentExecutorConfig',
  'platformConfig',
])

// ── Bot config field constraints ──
export const BOT_CONFIG_RANGES = {
  maxPositionSize: { min: 100, max: 1000000, type: 'number' as const },
  maxDailyLoss: { min: 100, max: 100000, type: 'number' as const },
  strategy: {
    type: 'enum' as const,
    values: ['Scalp AI', 'Trend Following', 'Mean Reversion', 'Breakout', 'Momentum', 'AUTO'],
  },
  refreshInterval: { min: 5, max: 300, type: 'integer' as const },
  cooldownPeriod: { min: 10, max: 600, type: 'integer' as const },
}

// ── Risk config field constraints ──
export const RISK_CONFIG_RANGES = {
  maxDrawdown: { min: 1, max: 50, type: 'number' as const },
  stopLossDefault: { min: 0.1, max: 20, type: 'number' as const },
  takeProfitDefault: { min: 0.1, max: 50, type: 'number' as const },
  riskPerTrade: { min: 0.1, max: 10, type: 'number' as const },
  maxOpenPositions: { min: 1, max: 50, type: 'integer' as const },
}

// ── Agent executor config field constraints ──
export const AGENT_EXECUTOR_CONFIG_RANGES = {
  executorMaxOpenPositions: { min: 1, max: 50, type: 'integer' as const },
  agentMaxOpenPositions: { min: 1, max: 50, type: 'integer' as const },
  executorMinConfidence: { min: 10, max: 90, type: 'integer' as const },
  executorRiskPerTrade: { min: 0.1, max: 10, type: 'number' as const },
  executorTickIntervalSec: { min: 5, max: 300, type: 'integer' as const },
  agentAnalysisIntervalMin: { min: 5, max: 1440, type: 'integer' as const },
}

// ── Platform config field constraints ──
export const PLATFORM_CONFIG_RANGES = {
  autoLogout: { min: 5, max: 1440, type: 'integer' as const },
  sessionTimeout: { min: 1, max: 168, type: 'integer' as const },
}

// ── Unified defaults (V188: Consistent across all systems) ──
export const UNIFIED_DEFAULTS = {
  maxOpenPositions: 20,       // موحد: admin=20, riskManager=20, smartExecutor falls back to 20
  minConfidence: 65,          // موحد: SmartExecutor=65, agentExecutorConfig=65
  stopLossDefault: 2,         // موحد: admin=2%, riskManager=2%
  takeProfitDefault: 4,       // موحد: admin=4%, riskManager=4%
  riskPerTrade: 1,            // موحد: admin=1%, riskManager=1%
  maxDailyLossPercent: 5,     // موحد: admin=5%, riskManager=5%
}

// ── Bot settings keys (only these should be fetched by /api/bot/settings) ──
export const BOT_SETTINGS_KEYS = ['botConfig', 'riskConfig', 'agentExecutorConfig']

/**
 * Validate a single user setting key-value pair
 * Returns { valid, error? } 
 */
export function validateUserSetting(
  key: string,
  value: any,
): { valid: boolean; error?: string; sanitized?: any } {
  // Check key whitelist
  if (!ALLOWED_USER_SETTINGS_KEYS.has(key)) {
    return { valid: false, error: `مفتاح غير مسموح: ${key}` }
  }

  // Check for path traversal or injection in key
  if (key.includes('..') || key.includes('/') || key.includes('\\') || key.includes('\0')) {
    return { valid: false, error: `مفتاح يحتوي على أحرف غير مسموحة: ${key}` }
  }

  // Check value size (max 1KB per setting)
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value)
  if (valueStr.length > 1024) {
    return { valid: false, error: `قيمة ${key} كبيرة جداً (الحد: 1 كيلوبايت)` }
  }

  // Validate range constraints
  const range = SETTINGS_RANGES[key as keyof typeof SETTINGS_RANGES]
  if (range && range.type !== 'enum') {
    const num = Number(value)
    if (isNaN(num)) {
      return { valid: false, error: `قيمة ${key} يجب أن تكون رقم: ${value}` }
    }
    if (range.type === 'integer' && !Number.isInteger(num)) {
      return { valid: false, error: `قيمة ${key} يجب أن تكون عدد صحيح` }
    }
    if (num < range.min || num > range.max) {
      return { valid: false, error: `قيمة ${key} يجب أن تكون بين ${range.min} و ${range.max}` }
    }
    return { valid: true, sanitized: range.type === 'integer' ? Math.round(num) : num }
  }

  // Boolean fields
  if (key === 'riskWarningAcknowledged' || key === 'confirmTrades' || key === 'showPositions' ||
      key === 'autoStopLoss' || key === 'trailingStop' || key === 'aiAutoTrade' ||
      key === 'analyticsEnabled' || key === 'crashReports' || key === 'notificationsEnabled' ||
      key === 'soundEnabled' || key === 'browserNotifications' || key === 'botAlerts' ||
      key === 'aiAlerts' || key === 'scannerAlerts' || key === 'tradeAlerts' ||
      key === 'autoExecute' || key === 'isDark') {
    const bool = value === true || value === 'true' || value === false || value === 'false'
    if (!bool && typeof value !== 'boolean') {
      return { valid: false, error: `قيمة ${key} يجب أن تكون true أو false` }
    }
    return { valid: true, sanitized: value === true || value === 'true' }
  }

  // Enum fields
  if (key === 'riskLevel') {
    const valid = ['conservative', 'moderate', 'aggressive']
    if (!valid.includes(value)) {
      return { valid: false, error: `مستوى المخاطر يجب أن يكون: ${valid.join('، ')}` }
    }
  }
  if (key === 'chartType') {
    const valid = ['candlestick', 'line', 'area']
    if (!valid.includes(value)) {
      return { valid: false, error: `نوع الرسم يجب أن يكون: ${valid.join('، ')}` }
    }
  }
  if (key === 'tradingMode') {
    const valid = ['trader', 'investor', 'ai']
    if (!valid.includes(value)) {
      return { valid: false, error: `وضع التداول يجب أن يكون: ${valid.join('، ')}` }
    }
  }

  // String fields — sanitize
  return { valid: true, sanitized: typeof value === 'string' ? value.substring(0, 255) : value }
}

/**
 * Validate admin config group
 * Returns { valid, errors[], sanitized }
 */
export function validateAdminConfig(
  configKey: string,
  config: Record<string, any>,
): { valid: boolean; errors: string[]; sanitized: Record<string, any> } {
  const errors: string[] = []
  const sanitized: Record<string, any> = {}

  if (!ALLOWED_ADMIN_CONFIG_KEYS.has(configKey)) {
    return { valid: false, errors: [`مجموعة إعدادات غير مسموحة: ${configKey}`], sanitized: {} }
  }

  let ranges: Record<string, any> = {}
  if (configKey === 'botConfig') ranges = BOT_CONFIG_RANGES
  else if (configKey === 'riskConfig') ranges = RISK_CONFIG_RANGES
  else if (configKey === 'agentExecutorConfig') ranges = AGENT_EXECUTOR_CONFIG_RANGES
  else if (configKey === 'platformConfig') ranges = PLATFORM_CONFIG_RANGES

  for (const [field, value] of Object.entries(config)) {
    const range = ranges[field]
    if (!range) {
      // Unknown field — skip but don't error (forward-compatible)
      sanitized[field] = value
      continue
    }

    if (range.type === 'enum') {
      if (!range.values.includes(value)) {
        errors.push(`${field}: قيمة غير صالحة "${value}" — القيم المسموحة: ${range.values.join('، ')}`)
      } else {
        sanitized[field] = value
      }
      continue
    }

    const num = Number(value)
    if (isNaN(num)) {
      errors.push(`${field}: يجب أن يكون رقم (حصلنا على: "${value}")`)
      continue
    }
    if (range.type === 'integer' && !Number.isInteger(num)) {
      errors.push(`${field}: يجب أن يكون عدد صحيح`)
      continue
    }
    if (num < range.min || num > range.max) {
      errors.push(`${field}: يجب أن يكون بين ${range.min} و ${range.max} (حصلنا على: ${num})`)
      continue
    }
    sanitized[field] = range.type === 'integer' ? Math.round(num) : num
  }

  // ── Cross-field validation ──
  if (configKey === 'riskConfig') {
    const sl = Number(sanitized.stopLossDefault ?? config.stopLossDefault)
    const tp = Number(sanitized.takeProfitDefault ?? config.takeProfitDefault)
    if (!isNaN(sl) && !isNaN(tp) && tp <= sl) {
      errors.push('هدف الربط (takeProfitDefault) يجب أن يكون أكبر من وقف الخسارة (stopLossDefault)')
    }
    const rpt = Number(sanitized.riskPerTrade ?? config.riskPerTrade)
    const mdl = Number(sanitized.maxDrawdown ?? config.maxDrawdown)
    if (!isNaN(rpt) && !isNaN(mdl) && rpt > mdl) {
      errors.push('نسبة المخاطرة لكل صفقة (riskPerTrade) لا يجب أن تتجاوز أقصى خسارة يومية (maxDrawdown)')
    }
  }

  return { valid: errors.length === 0, errors, sanitized }
}

/**
 * Cross-field validation for user risk settings
 */
export function validateUserRiskCrossFields(settings: Record<string, any>): string[] {
  const errors: string[] = []
  const sl = Number(settings.userStopLoss)
  const tp = Number(settings.userTakeProfit)
  if (!isNaN(sl) && !isNaN(tp) && tp > 0 && sl > 0 && tp <= sl) {
    errors.push('هدف الربح يجب أن يكون أكبر من وقف الخسارة')
  }
  const rpt = Number(settings.userRiskPerTrade)
  const mdl = Number(settings.userMaxDailyLoss)
  if (!isNaN(rpt) && !isNaN(mdl) && rpt > mdl) {
    errors.push('نسبة المخاطرة لكل صفقة لا يجب أن تتجاوز أقصى خسارة يومية')
  }
  return errors
}

/**
 * Sanitize NaN from parsed settings values
 * Returns the value if valid number, or the fallback
 */
export function safeParseFloat(value: any, fallback: number): number {
  if (value === null || value === undefined) return fallback
  const num = parseFloat(String(value))
  return isNaN(num) ? fallback : num
}

export function safeParseInt(value: any, fallback: number): number {
  if (value === null || value === undefined) return fallback
  const num = parseInt(String(value), 10)
  return isNaN(num) ? fallback : num
}
