import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';
import { resolveEnvKey, reResolveKey } from './env-resolver';

/**
 * Mistral Service — Mistral AI La Plateforme (replaces DeepSeek)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FREE TIER (Experiment Plan — as of 2026):
 *   - 1 request/second
 *   - 500,000 tokens/minute
 *   - 1,000,000,000 tokens/month (1 BILLION tokens/month!)
 *   - Requires: phone number verification + opt-in to data training
 *
 * This is the MOST generous free tier of any LLM API provider!
 * Far superior to DeepSeek's limited free tier.
 *
 * Models available for free:
 *   - mistral-small-latest: Fast, efficient, good multilingual
 *   - open-mistral-nemo: Open-source, 12B, excellent multilingual
 *   - mistral-medium-latest: Better reasoning (if available)
 *   - mistral-large-latest: Most capable (limited on free tier)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Get API key: https://console.mistral.ai/ (free, phone verification required)
 * Env var: MISTRAL_API_KEY
 */
@Injectable()
export class MistralService {
  private readonly logger = new Logger(MistralService.name);
  private apiKey: string;
  private readonly baseUrl = 'https://api.mistral.ai/v1/chat/completions';

  // Model candidates — ordered by reliability on free tier
  private readonly modelCandidates = [
    'mistral-small-latest',     // Best for free tier — fast, reliable, good Arabic
    'open-mistral-nemo',        // Open-source, excellent multilingual including Arabic
    'mistral-medium-latest',    // Better reasoning (may be limited on free)
    'mistral-large-latest',     // Most capable (likely limited on free tier)
    'open-mistral-7b',          // Open-source 7B, lightweight
  ];

  private resolvedModel: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this._resolveApiKey();
    if (this.apiKey) {
      this.logger.log('🔮 Mistral Service initialized — 1B tokens/month FREE (replaces DeepSeek)');
    } else {
      this.logger.warn('⚠️ MISTRAL_API_KEY not set — get free key at console.mistral.ai');
    }
  }

  private _resolveApiKey(): string {
    return resolveEnvKey(this.configService, 'MISTRAL_API_KEY', ['MISTRAL_KEY', 'MISTRAL_API_KEY_V1']);
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // Re-resolve key on every call if still empty
    if (!this.apiKey) {
      const resolved = reResolveKey(this.configService, this.apiKey, 'MISTRAL_API_KEY', ['MISTRAL_KEY', 'MISTRAL_API_KEY_V1']);
      if (resolved) {
        this.apiKey = resolved;
        this.logger.log('🔮 Mistral key resolved on-demand');
      }
    }
    if (!this.apiKey) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);
    const modelsToTry = this.resolvedModel ? [this.resolvedModel, ...this.modelCandidates.filter(m => m !== this.resolvedModel)] : this.modelCandidates;
    const errors: string[] = [];

    for (const model of modelsToTry) {
      try {
        const response = await axios.post(
          this.baseUrl,
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: request.prompt },
            ],
            temperature: 0.3,
            max_tokens: 1024,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 45000, // Mistral can be slower than Cerebras
          },
        );

        const content = response.data?.choices?.[0]?.message?.content || '';
        if (content.trim().length === 0) {
          errors.push(`${model}: empty response`);
          continue;
        }

        if (!this.resolvedModel) {
          this.resolvedModel = model;
          this.logger.log(`🔮 Mistral model resolved: ${model}`);
        }

        return {
          model: `Mistral/${model}`,
          content: content.trim(),
          confidence: calculateConfidence(content, 'mistral'),
          processingTimeMs: Date.now() - startTime,
          language: request.language || 'ar',
        };
      } catch (error: any) {
        const status = error.response?.status;
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : error.message;
        errors.push(`${model}: ${status || 'N/A'} — ${errData}`);

        if (status === 429) {
          this.logger.warn(`🚫 Mistral ${model} rate limited (429) — trying next model...`);
          continue;
        }
        if (status === 401 || status === 403) {
          this.logger.error(`❌ Mistral auth failed (${status}) — API key may be invalid`);
          return this._stubResponse(request, errors, true);
        }
        if (status === 402) {
          this.logger.warn(`💸 Mistral ${model} requires payment (402) — trying free model...`);
          continue;
        }
        if (status === 404) {
          this.logger.warn(`🔮 Mistral model ${model} not found (404) — trying next...`);
          continue;
        }
        this.logger.warn(`🔮 Mistral ${model} failed: ${error.message} (${status})`);
        continue;
      }
    }

    this.logger.warn(`🔮 All Mistral models failed (${errors.length} attempts) — returning stub`);
    return this._stubResponse(request, errors);
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `أنت محلل سيناريوهات مالي متخصص في ${request.type}. أجب بالعربية فقط. حلل السيناريوهات المحتملة مع تقدير احتمالات كل سيناريو. كن موجزاً ومبنياً على البيانات. أضف دائماً تنبيهات المخاطر. IMPORTANT: Respond in ${lang} only.`;
  }

  private _stubResponse(request: AIAnalysisRequest, errors: string[] = [], authFailed = false): AIAnalysisResponse {
    const errorDetail = errors.length > 0 ? ` الأخطاء: ${errors.slice(0, 2).join(' | ')}` : '';
    const content = authFailed
      ? `⚠️ مفتاح Mistral API غير صالح أو منتهي.${errorDetail}`
      : `⚠️ مفتاح Mistral API غير مكوّن. احصل على مفتاح مجاني من console.mistral.ai (يتطلب تأكيد رقم الهاتف) واضبط MISTRAL_API_KEY في Railway.${errorDetail}`;
    return {
      model: 'Mistral/Unavailable',
      content,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
      isFallback: true,
    };
  }
}
