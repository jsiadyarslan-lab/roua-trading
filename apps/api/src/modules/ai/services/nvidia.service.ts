import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';
import { resolveEnvKey, reResolveKey } from './env-resolver';

/**
 * NVIDIA NIM Service — NVIDIA Inference Microservices (replaces OpenRouter)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FREE TIER (as of 2026):
 *   - 40 requests/minute
 *   - ~1,000 requests/day (estimated)
 *   - No credit card required
 *   - Requires: phone number verification
 *
 * Much better than OpenRouter's 50 requests/day free limit!
 * NVIDIA NIM provides access to various open models with fast inference.
 *
 * Models available for free:
 *   - meta/llama-3.3-70b-instruct: Large, capable, good reasoning
 *   - meta/llama-3.1-8b-instruct: Fast, reliable
 *   - mistralai/mistral-small-24b-instruct: Good multilingual
 *   - qwen/qwen2.5-7b-instruct: Good Arabic support
 *   - nvidia/llama-3.1-nemotron-70b-instruct: NVIDIA optimized
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Get API key: https://build.nvidia.com/ (free, phone verification required)
 * Env var: NVIDIA_API_KEY or NVIDIA_NIM_API_KEY
 */
@Injectable()
export class NvidiaService {
  private readonly logger = new Logger(NvidiaService.name);
  private apiKey: string;
  private readonly baseUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';

  // Model candidates — ordered by quality for financial analysis
  private readonly modelCandidates = [
    'meta/llama-3.3-70b-instruct',                    // Best reasoning, large model
    'nvidia/llama-3.1-nemotron-70b-instruct',          // NVIDIA optimized Llama
    'mistralai/mistral-small-24b-instruct',            // Good multilingual
    'qwen/qwen2.5-7b-instruct',                        // Good Arabic support
    'meta/llama-3.1-8b-instruct',                      // Fast fallback
  ];

  private resolvedModel: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this._resolveApiKey();
    if (this.apiKey) {
      this.logger.log('🟢 NVIDIA NIM Service initialized — 40 req/min FREE (replaces OpenRouter)');
    } else {
      this.logger.warn('⚠️ NVIDIA_API_KEY not set — get free key at build.nvidia.com');
    }
  }

  private _resolveApiKey(): string {
    return resolveEnvKey(this.configService, 'NVIDIA_API_KEY', ['NVIDIA_NIM_API_KEY', 'NIM_API_KEY']);
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // Re-resolve key on every call if still empty
    if (!this.apiKey) {
      const resolved = reResolveKey(this.configService, this.apiKey, 'NVIDIA_API_KEY', ['NVIDIA_NIM_API_KEY', 'NIM_API_KEY']);
      if (resolved) {
        this.apiKey = resolved;
        this.logger.log('🟢 NVIDIA NIM key resolved on-demand');
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
            timeout: 45000,
          },
        );

        const content = response.data?.choices?.[0]?.message?.content || '';
        if (content.trim().length === 0) {
          errors.push(`${model}: empty response`);
          continue;
        }

        if (!this.resolvedModel) {
          this.resolvedModel = model;
          this.logger.log(`🟢 NVIDIA NIM model resolved: ${model}`);
        }

        return {
          model: `NVIDIA/${model.split('/').pop()}`,
          content: content.trim(),
          confidence: calculateConfidence(content, 'nvidia'),
          processingTimeMs: Date.now() - startTime,
          language: request.language || 'ar',
        };
      } catch (error: any) {
        const status = error.response?.status;
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : error.message;
        errors.push(`${model}: ${status || 'N/A'} — ${errData}`);

        if (status === 429) {
          this.logger.warn(`🚫 NVIDIA NIM ${model} rate limited (429) — trying next model...`);
          continue;
        }
        if (status === 401 || status === 403) {
          this.logger.error(`❌ NVIDIA NIM auth failed (${status}) — API key may be invalid`);
          return this._stubResponse(request, errors, true);
        }
        if (status === 404) {
          this.logger.warn(`🟢 NVIDIA NIM model ${model} not found (404) — trying next...`);
          continue;
        }
        this.logger.warn(`🟢 NVIDIA NIM ${model} failed: ${error.message} (${status})`);
        continue;
      }
    }

    this.logger.warn(`🟢 All NVIDIA NIM models failed (${errors.length} attempts) — returning stub`);
    return this._stubResponse(request, errors);
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `أنت محلل تباين مالي متخصص في ${request.type}. أجب بالعربية فقط. ابحث عن إشارات معاكسة أو تباينات في التحليل — هل هناك سبب لعدم اتباع الاتجاه السائد؟ كن نقدياً وموضوعياً. أضف دائماً تنبيهات المخاطر. IMPORTANT: Respond in ${lang} only.`;
  }

  private _stubResponse(request: AIAnalysisRequest, errors: string[] = [], authFailed = false): AIAnalysisResponse {
    const errorDetail = errors.length > 0 ? ` الأخطاء: ${errors.slice(0, 2).join(' | ')}` : '';
    const content = authFailed
      ? `⚠️ مفتاح NVIDIA NIM API غير صالح أو منتهي.${errorDetail}`
      : `⚠️ مفتاح NVIDIA NIM API غير مكوّن. احصل على مفتاح مجاني من build.nvidia.com (يتطلب تأكيد رقم الهاتف) واضبط NVIDIA_API_KEY في Railway.${errorDetail}`;
    return {
      model: 'NVIDIA/Unavailable',
      content,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
      isFallback: true,
    };
  }
}
