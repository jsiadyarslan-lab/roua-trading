/**
 * Shared Confidence Calculation Utility
 *
 * Previously, the `_calculateConfidence` method was duplicated across
 * all 6 AI model service files (Groq, Gemini, GLM-4, HuggingFace,
 * Ollama, Bedrock). This shared utility eliminates that duplication
 * and provides a single source of truth for confidence scoring.
 *
 * Confidence is calculated based on:
 * 1. Base confidence (0.5)
 * 2. Length bonus — longer analysis = more confident (capped)
 * 3. Clear recommendation bonus — explicit BUY/SELL/HOLD keywords
 * 4. Model-specific base adjustment — reflects model capability tier
 *
 * Result is clamped to [0.1, 0.95]
 */

/** Model-specific confidence adjustments based on model capability */
const MODEL_BASE: Record<string, number> = {
  groq: 0.0,
  gemini: 0.05,
  glm: 0.02,
  huggingface: -0.05,
  ollama: 0.0,
  bedrock: 0.08,
  openrouter: -0.03,  // FIX: OpenRouter uses free/cheap models — slightly lower base confidence
};

/**
 * Calculate confidence score for an AI model response
 *
 * @param content The AI-generated text content
 * @param model The model identifier (groq, gemini, glm, huggingface, ollama, bedrock)
 * @returns Confidence score between 0.1 and 0.95
 */
export function calculateConfidence(content: string, model: string): number {
  let confidence = 0.5; // base

  // Length bonus: longer analysis = more confident (capped)
  if (content.length > 200) confidence += 0.1;
  if (content.length > 500) confidence += 0.1;
  if (content.length > 1000) confidence += 0.05;

  // Clear recommendation bonus
  const hasRecommendation = /شراء|بيع|انتظار|BUY|SELL|HOLD|صعود|هبوط/i.test(content);
  if (hasRecommendation) confidence += 0.15;

  // Model base confidence
  confidence += MODEL_BASE[model] || 0;

  return Math.min(Math.max(confidence, 0.1), 0.95); // Clamp 0.1-0.95
}
