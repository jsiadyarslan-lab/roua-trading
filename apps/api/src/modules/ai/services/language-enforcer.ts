// ════════════════════════════════════════════════════════════
// Language Enforcer — post-processes AI output to ensure it matches
// the requested language. Used when models (especially weak ones like
// Bedrock Nova Micro) ignore the language directive in the prompt.
// ════════════════════════════════════════════════════════════

/**
 * Count Arabic vs Latin characters in a text.
 * Returns the ratio of Arabic chars (0 = pure Latin, 1 = pure Arabic).
 */
function arabicRatio(text: string): number {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const total = arabicChars + latinChars;
  if (total === 0) return 0;
  return arabicChars / total;
}

/**
 * Extract key data points from an analysis text — these are language-agnostic
 * and should be preserved regardless of the output language.
 *
 * Extracted:
 * - DECISION: BUY/SELL/HOLD line
 * - Prices (e.g., $63,233.10, 0.08307)
 * - Indicator values (RSI: 50.03, MACD: 0.00)
 * - Percentages (50%, +1.5%, -3%)
 */
function extractKeyData(text: string): {
  decision?: string;
  prices: string[];
  indicators: string[];
  percentages: string[];
} {
  const decisionMatch = text.match(/DECISION\s*:\s*(BUY|SELL|HOLD)/i);
  const prices = text.match(/\$[\d,]+\.?\d*|\b\d[\d,]*\.\d{2,}\b/g) || [];
  const indicators = text.match(/(?:RSI|MACD|EMA|Bollinger|ATR|Stochastic)\s*[:=]?\s*-?\d+\.?\d*/gi) || [];
  const percentages = text.match(/[+-]?\d+\.?\d*\s*%/g) || [];
  return {
    decision: decisionMatch ? decisionMatch[1].toUpperCase() : undefined,
    prices: [...new Set(prices)].slice(0, 10),
    indicators: [...new Set(indicators)].slice(0, 10),
    percentages: [...new Set(percentages)].slice(0, 10),
  };
}

/**
 * Build a fallback English summary from extracted key data.
 * Used when the model returned Arabic despite an English directive.
 */
function buildEnglishFallback(data: ReturnType<typeof extractKeyData>, role: string, symbol: string): string {
  const parts: string[] = [];
  parts.push(`${role} analysis for ${symbol}:`);

  if (data.indicators.length > 0) {
    parts.push(`Indicators: ${data.indicators.join(", ")}.`);
  }
  if (data.prices.length > 0) {
    parts.push(`Key price levels: ${data.prices.slice(0, 5).join(", ")}.`);
  }
  if (data.percentages.length > 0) {
    parts.push(`Notable percentages: ${data.percentages.slice(0, 5).join(", ")}.`);
  }

  if (data.decision) {
    parts.push(`DECISION: ${data.decision}`);
  }

  return parts.join(" ");
}

/**
 * Build a fallback Arabic summary from extracted key data.
 */
function buildArabicFallback(data: ReturnType<typeof extractKeyData>, role: string, symbol: string): string {
  const roleMap: Record<string, string> = {
    "Technical Analyst": "المحلل الفني",
    "Sentiment Analyst": "محلل المشاعر",
    "Risk Expert": "خبير المخاطر",
    "Macro Expert": "خبير الماكرو",
    "Pattern Expert": "خبير الأنماط",
    "Execution Strategist": "استراتيجي التنفيذ",
    "Divergence Analyst": "محلل التباين",
    "Scenario Analyst": "محلل السيناريوهات",
  };
  const roleAr = roleMap[role] || role;
  const parts: string[] = [];
  parts.push(`تحليل ${roleAr} لـ ${symbol}:`);

  if (data.indicators.length > 0) {
    parts.push(`المؤشرات: ${data.indicators.join("، ")}.`);
  }
  if (data.prices.length > 0) {
    parts.push(`مستويات السعر: ${data.prices.slice(0, 5).join("، ")}.`);
  }
  if (data.percentages.length > 0) {
    parts.push(`نسب ملحوظة: ${data.percentages.slice(0, 5).join("، ")}.`);
  }

  if (data.decision) {
    const decisionAr = data.decision === "BUY" ? "شراء" : data.decision === "SELL" ? "بيع" : "انتظار";
    parts.push(`DECISION: ${data.decision}`);
  }

  return parts.join(" ");
}

/**
 * V300: Enforce the requested language on AI model output.
 *
 * If the model returned text in the wrong language (e.g., Arabic when
 * English was requested), this function:
 * 1. Extracts key data points (prices, indicators, percentages, decision)
 * 2. Builds a clean fallback summary in the requested language
 * 3. Returns the fallback instead of the original text
 *
 * This is a safety net — it doesn't translate the full analysis (which
 * would require another API call), but it ensures the user sees a
 * coherent summary in their language with the key data preserved.
 *
 * The original (wrong-language) text is logged for debugging but not
 * shown to the user.
 *
 * @param content The model's raw output
 * @param language The requested language ('en', 'ar', 'fr', etc.)
 * @param role The role name (for the fallback summary header)
 * @param symbol The trading symbol
 * @returns The enforced-language content
 */
export function enforceLanguage(
  content: string,
  language: string,
  role: string,
  symbol: string,
): { content: string; wasReplaced: boolean; originalContent?: string } {
  if (!content || content.length < 10) {
    return { content, wasReplaced: false };
  }

  const ratio = arabicRatio(content);
  const isArabic = language === "ar" || language === "fa" || language === "ur";
  const isLatin = !isArabic;

  // If output language matches request, no action needed
  if (isArabic && ratio > 0.3) {
    return { content, wasReplaced: false };
  }
  if (isLatin && ratio < 0.1) {
    return { content, wasReplaced: false };
  }

  // Language mismatch detected — build fallback
  const keyData = extractKeyData(content);

  if (isLatin) {
    // Requested Latin but got Arabic — build English fallback
    const fallback = buildEnglishFallback(keyData, role, symbol);
    return {
      content: fallback,
      wasReplaced: true,
      originalContent: content,
    };
  }

  if (isArabic) {
    // Requested Arabic but got Latin — build Arabic fallback
    const fallback = buildArabicFallback(keyData, role, symbol);
    return {
      content: fallback,
      wasReplaced: true,
      originalContent: content,
    };
  }

  return { content, wasReplaced: false };
}
