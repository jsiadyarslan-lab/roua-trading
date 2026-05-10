/**
 * Shared Confidence Calculation Utility
 *
 * FIX: Previously, confidence was dominated by model name (~0.5 base + 0.15
 * for any keyword match). A hallucinated response mentioning "BUY" got 0.65+
 * regardless of quality. "لا أنصح بالشراء" was counted as a buy recommendation.
 *
 * Now, confidence is CONTENT-QUALITY driven:
 * 1. Base confidence (0.3) — must earn confidence through quality signals
 * 2. Length/completeness bonus — detailed analysis scores higher
 * 3. Structured output bonus — clear DECISION/JSON/numbered lists
 * 4. Recommendation with NEGATION detection — "لا أنصح بالشراء" is NOT a buy
 * 5. Risk awareness bonus — mentions risks/disclaimers
 * 6. Model reliability — small modifier (±0.05), NOT the dominant factor
 * 7. Penalty for stub/error/low-quality responses
 *
 * Result is clamped to [0.05, 0.95]
 */

/** Model-specific confidence adjustments — SMALL modifiers only */
const MODEL_RELIABILITY: Record<string, number> = {
  groq: 0.02,
  gemini: 0.05,
  glm: 0.03,
  cerebras: 0.03,    // Fast, reliable — Llama 3.1 on wafer-scale engine
  ollama: 0.00,
  bedrock: 0.05,
  nvidia: 0.02,      // Good quality — Llama 3.3 70B on NVIDIA infrastructure
  mistral: 0.04,     // Excellent multilingual — Mistral Small/Nemo
  // Legacy models (still supported for backward compatibility)
  huggingface: -0.02,
  openrouter: 0.00,
  deepseek: 0.03,
};

/**
 * Calculate confidence score for an AI model response
 *
 * @param content The AI-generated text content
 * @param model The model identifier (groq, gemini, glm, huggingface, ollama, bedrock)
 * @returns Confidence score between 0.05 and 0.95
 */
export function calculateConfidence(content: string, model: string): number {
  let confidence = 0.3; // Low base — must earn through quality

  // ── Length/completeness bonus (0-0.20) ──
  if (content.length > 100) confidence += 0.05;
  if (content.length > 300) confidence += 0.05;
  if (content.length > 600) confidence += 0.05;
  if (content.length > 1000) confidence += 0.05;

  // ── Structured output bonus (0-0.12) ──
  if (content.includes('DECISION:') || content.includes('القرار:')) confidence += 0.04;
  if (content.includes('{') && content.includes('}')) confidence += 0.03;
  if (content.includes('```') || content.includes('1.') || content.includes('-')) confidence += 0.03;
  // Contains price levels — relevant for trading analysis
  if (/(\$?\d+[\.,]?\d*|\d+\s*%)/.test(content)) confidence += 0.02;

  // ── Recommendation with NEGATION detection (0-0.13) ──
  // FIX: "لا أنصح بالشراء" should NOT count as a buy recommendation
  const hasBuy = /شراء|BUY|صعود|long/i.test(content);
  const hasSell = /بيع|SELL|هبوط|short/i.test(content);
  const hasHold = /انتظار|HOLD|WAIT|محايد/i.test(content);
  const hasNegation = /لا أنصح|لا أنصح بال|غير مستحسن|لا يُنصح|I don't recommend|not recommended|avoid/i.test(content);

  if ((hasBuy || hasSell || hasHold) && !hasNegation) {
    confidence += 0.10; // Clear, affirmative recommendation
  } else if ((hasBuy || hasSell || hasHold) && hasNegation) {
    confidence += 0.03; // Recommendation with negation — less confident
  }

  // ── Risk awareness bonus (0-0.08) ──
  const hasRisk = /مخاطر|risk|تحذير|warning|حذر|caution|قد يخسر|may lose/i.test(content);
  const hasDisclaimer = /إخلاء مسؤولية|disclaimer|تعليمي|educational|ليس نصيحة/i.test(content);
  if (hasRisk) confidence += 0.04;
  if (hasDisclaimer) confidence += 0.04;

  // ── Arabic content quality (0-0.05) ──
  const arabicPattern = /[\u0600-\u06FF]/;
  if (arabicPattern.test(content)) confidence += 0.03;
  if (arabicPattern.test(content) && /[a-zA-Z]{3,}/.test(content)) confidence += 0.02;

  // ── Model reliability modifier (small, ±0.05) ──
  confidence += MODEL_RELIABILITY[model] || 0.00;

  // ── Penalty for low-quality responses (0 to -0.15) ──
  if (content.includes('⚠️') || content.includes('غير متاح') || content.includes('unavailable')) confidence -= 0.15;
  if (content.length < 50) confidence -= 0.10;
  if (/لم أتمكن|لا أستطيع|I cannot|I'm unable/i.test(content)) confidence -= 0.10;

  return Math.min(Math.max(confidence, 0.05), 0.95);
}
