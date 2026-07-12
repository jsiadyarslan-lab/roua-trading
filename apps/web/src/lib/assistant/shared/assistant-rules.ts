/**
 * ═══════════════════════════════════════════════════════════════
 * V601: Unified Assistant Rules — قواعد الـ prompt المشتركة
 * ═══════════════════════════════════════════════════════════════
 * 
 * كل قواعد RSI، المخاطرة/العوائد، منع الهلوسة، ومنع "لا أملك بيانات"
 * في مكان واحد. كل الـ prompts تستورد من هنا.
 */

/**
 * قواعد RSI الحرجة — تمنع الـ AI من وصف RSI 33 بأنه "oversold"
 */
export const RSI_RULES = `
### RSI Threshold Rules (CRITICAL — follow EXACTLY):
- RSI < 30 = Oversold (مفرط بيعي) — potential bounce
- RSI 30-50 = Weak bearish (ضعيف هبوطي) — NOT oversold, do NOT say "oversold"
- RSI 50-70 = Neutral to bullish (محايد مائل للصعود)
- RSI > 70 = Overbought (مفرط شرائي) — potential pullback
- NEVER describe RSI 33-35 as "oversold" or "below 30" — it is NOT below 30.
- ALWAYS state the exact RSI number first, then the correct classification.`;

/**
 * قواعد المخاطرة/العوائد — تمنع الـ AI من وصف 1:3 بأنها "unfavorable"
 */
export const RISK_REWARD_RULES = `
### Risk/Reward Rules (CRITICAL):
- Calculate R:R = (TP distance ÷ SL distance). State the exact ratio.
- R:R > 1:2 = Excellent (favorable)
- R:R 1:1 to 1:2 = Acceptable
- R:R < 1:1 = Poor (unfavorable)
- NEVER call a 1:3 ratio "unfavorable" — it is excellent.
- When analyzing user positions, ALWAYS match each SL and TP to the CORRECT asset. Do NOT swap SL values between different currency pairs.`;

/**
 * قاعدة منع "I don't have access" — تمنع الـ AI من الادعاء بعدم المعرفة
 */
export const ANTI_NO_DATA_RULE = `
- NEVER say "I don't have access to" or "I don't have data" — you ALWAYS have data from the platform. If specific data is missing, say "Based on available data:" and analyze what you have.`;

/**
 * قاعدة منع الهلوسة — تمنع اختراع الأسعار والمؤشرات
 */
export const ANTI_FABRICATION_RULE = `
- Do NOT fabricate stock names, trading symbols, prices, or technical indicators. Use ONLY values from the provided data. If a specific indicator is missing, SKIP it silently.`;

/**
 * كل القواعد مجتمعة — تستورد في أي prompt
 */
export const ALL_RULES = [
  RSI_RULES,
  RISK_REWARD_RULES,
  ANTI_NO_DATA_RULE,
  ANTI_FABRICATION_RULE,
].join('\n');
