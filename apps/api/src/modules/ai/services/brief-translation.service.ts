// ════════════════════════════════════════════════════════════
// Brief Translation Service
// Translates brief analysisSummary + masterStrategy to the user's
// locale on demand, with Redis caching to avoid duplicate calls.
//
// Uses AIOrchestratorService.callModel() — works with any provider
// (NVIDIA now, GPT-4o/Claude/Gemini Pro at launch).
// ════════════════════════════════════════════════════════════

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { AIOrchestratorService } from './ai-orchestrator.service';

// Cache TTL: 30 minutes. Same as consensus cache (V289).
// If the brief's original text changes, the cache key includes a hash
// of the original text, so stale translations are never served.
const TRANSLATION_CACHE_TTL_MS = 30 * 60 * 1000;

// Language names for the translation prompt
const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic (العربية)',
  en: 'English',
  fr: 'French (Français)',
  tr: 'Turkish (Türkçe)',
  es: 'Spanish (Español)',
  zh: 'Chinese (中文)',
  ru: 'Russian (Русский)',
  hi: 'Hindi (हिन्दी)',
  pt: 'Portuguese (Português)',
  de: 'German (Deutsch)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  id: 'Indonesian (Bahasa Indonesia)',
  vi: 'Vietnamese (Tiếng Việt)',
  th: 'Thai (ภาษาไทย)',
  it: 'Italian (Italiano)',
  pl: 'Polish (Polski)',
  nl: 'Dutch (Nederlands)',
  ms: 'Malay (Bahasa Melayu)',
  he: 'Hebrew (עברית)',
  sv: 'Swedish (Svenska)',
  uk: 'Ukrainian (Українська)',
  fa: 'Persian (فارسی)',
  ur: 'Urdu (اردو)',
  fil: 'Filipino',
  da: 'Danish (Dansk)',
  no: 'Norwegian (Norsk)',
  fi: 'Finnish (Suomi)',
  cs: 'Czech (Čeština)',
  hu: 'Hungarian (Magyar)',
  ro: 'Romanian (Română)',
  bn: 'Bengali (বাংলা)',
};

@Injectable()
export class BriefTranslationService {
  private readonly logger = new Logger(BriefTranslationService.name);

  constructor(
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly orchestrator?: AIOrchestratorService,
  ) {
    this.logger.log('🌐 Brief Translation Service initialized');
  }

  /**
   * Translate a text to the target language.
   *
   * - If target language is 'ar' and text is already Arabic, return as-is.
   * - If translation is in Redis cache, return cached version.
   * - Otherwise, call AI model to translate, cache result, return.
   * - On any failure, return original text (graceful degradation).
   *
   * @param text The original text (usually Arabic)
   * @param targetLanguage The target locale code (e.g. 'fr', 'en', 'zh')
   * @param contextLabel A label for logging (e.g. 'BTC/USDT analysisSummary')
   * @returns The translated text, or original on failure
   */
  async translate(
    text: string,
    targetLanguage: string,
    contextLabel?: string,
  ): Promise<string> {
    // Empty or very short text — no translation needed
    if (!text || text.length < 5) return text;

    // Same language as source (Arabic) — no translation needed
    if (targetLanguage === 'ar') return text;

    // If orchestrator not available, return original
    if (!this.orchestrator) {
      this.logger.debug('Orchestrator not available — returning original text');
      return text;
    }

    // Build cache key: hash of (text + targetLanguage)
    const cacheKey = this._buildCacheKey(text, targetLanguage);

    // Check Redis cache
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          this.logger.debug(`🌐 Translation cache hit: ${contextLabel || 'text'} → ${targetLanguage}`);
          return cached;
        }
      } catch {
        // Redis error — continue to translation
      }
    }

    // Build translation prompt
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || 'English';
    const prompt = `You are a professional financial translator. Translate the following trading analysis to ${targetLangName}. 

Rules:
- Preserve ALL numbers, prices, percentages, and indicator values exactly as-is
- Preserve the "DECISION: BUY/SELL/HOLD" line in English (universal format)
- Preserve any ticker symbols (BTC/USDT, ETH/USDT, etc.) as-is
- Translate only the prose/explanatory text
- Do NOT add any commentary or explanation — output ONLY the translation
- Keep the same formatting (paragraphs, bullet points, bold markers)

Text to translate:
${text}`;

    // Try translation models (prefer NVIDIA — it's available and free)
    const translationModels = ['nvidia', 'glm', 'bedrock', 'groq'];

    for (const model of translationModels) {
      if (!this.orchestrator.isModelKeyAvailable(model)) continue;

      try {
        const response = await this.orchestrator.callModel(model, {
          prompt,
          type: 'translation',
          language: targetLanguage,
        });

        if (response.confidence > 0 && response.content && response.content.length > 10) {
          const translated = response.content.trim();

          // Cache the translation
          if (this.redis) {
            try {
              await this.redis.set(cacheKey, translated, TRANSLATION_CACHE_TTL_MS);
            } catch {
              // Cache write failure — non-critical
            }
          }

          this.logger.log(`🌐 Translated ${contextLabel || 'text'} → ${targetLanguage} (via ${model}, ${translated.length} chars)`);
          return translated;
        }
      } catch (err: any) {
        this.logger.debug(`Translation via ${model} failed: ${err?.message}`);
        continue;
      }
    }

    // All models failed — return original text
    this.logger.warn(`🌐 All translation models failed for ${contextLabel || 'text'} → ${targetLanguage}, returning original`);
    return text;
  }

  /**
   * Translate multiple texts in parallel (for batch processing briefs).
   * Each text is translated independently and cached separately.
   */
  async translateBatch(
    texts: Array<{ id: string; text: string; label?: string }>,
    targetLanguage: string,
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    const translations = await Promise.allSettled(
      texts.map(async ({ id, text, label }) => ({
        id,
        translated: await this.translate(text, targetLanguage, label),
      })),
    );

    for (const result of translations) {
      if (result.status === 'fulfilled') {
        results.set(result.value.id, result.value.translated);
      }
    }

    return results;
  }

  /**
   * Build a stable cache key from text + language.
   * Uses a simple hash to keep the key short.
   */
  private _buildCacheKey(text: string, language: string): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
    return `brief-translation:${language}:${hash}`;
  }
}
