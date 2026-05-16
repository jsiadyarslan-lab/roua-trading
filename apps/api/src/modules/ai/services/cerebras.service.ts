import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';
import { resolveEnvKey, reResolveKey } from './env-resolver';

/**
 * Cerebras Service — Ultra-fast AI inference (replaces HuggingFace)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FREE TIER (as of 2026):
 *   - 14,400 requests/day
 *   - 1,000,000 tokens/day
 *   - 30 requests/minute
 *   - 60,000 tokens/minute
 *
 * This is FAR more generous than HuggingFace ($0.10/month credits).
 * Cerebras uses wafer-scale inference engines for ultra-fast responses.
 *
 * Models available for free:
 *   - gpt-oss-120b: OpenAI's open-source 120B model
 *   - llama3.1-8b: Meta's Llama 3.1 8B (fast, reliable)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Get API key: https://cloud.cerebras.ai/ (free, no credit card)
 * Env var: CEREBRAS_API_KEY
 */
@Injectable()
export class CerebrasService {
  private readonly logger = new Logger(CerebrasService.name);
  private apiKey: string;
  private readonly baseUrl = 'https://api.cerebras.ai/v1/chat/completions';

  // Model candidates — ordered by capability
  private readonly modelCandidates = [
    'llama3.1-8b',        // Fast, reliable, good Arabic support
    'llama-3.3-70b',      // Larger model, better reasoning (if available)
  ];

  private resolvedModel: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this._resolveApiKey();
    if (this.apiKey) {
      this.logger.log('🧠 Cerebras Service initialized — 14,400 req/day FREE (replaces HuggingFace)');
    } else {
      this.logger.warn('⚠️ CEREBRAS_API_KEY not set — get free key at cloud.cerebras.ai');
    }
  }

  private _resolveApiKey(): string {
    return resolveEnvKey(this.configService, 'CEREBRAS_API_KEY', ['CEREBRAS_KEY']);
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // Re-resolve key on every call if still empty
    if (!this.apiKey) {
      const resolved = reResolveKey(this.configService, this.apiKey, 'CEREBRAS_API_KEY', ['CEREBRAS_KEY']);
      if (resolved) {
        this.apiKey = resolved;
        this.logger.log('🧠 Cerebras key resolved on-demand');
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
            timeout: 30000,
          },
        );

        const content = response.data?.choices?.[0]?.message?.content || '';
        if (content.trim().length === 0) {
          errors.push(`${model}: empty response`);
          continue;
        }

        if (!this.resolvedModel) {
          this.resolvedModel = model;
          this.logger.log(`🧠 Cerebras model resolved: ${model}`);
        }

        return {
          model: `Cerebras/${model}`,
          content: content.trim(),
          confidence: calculateConfidence(content, 'cerebras'),
          processingTimeMs: Date.now() - startTime,
          language: request.language || 'ar',
        };
      } catch (error: any) {
        const status = error.response?.status;
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 150) : error.message;
        errors.push(`${model}: ${status || 'N/A'} — ${errData}`);

        if (status === 429) {
          this.logger.warn(`🚫 Cerebras ${model} rate limited (429) — trying next model...`);
          continue;
        }
        if (status === 401 || status === 403) {
          this.logger.error(`❌ Cerebras auth failed (${status}) — API key may be invalid`);
          return this._stubResponse(request, errors, true);
        }
        if (status === 404) {
          this.logger.warn(`🧠 Cerebras model ${model} not found (404) — trying next...`);
          continue;
        }
        this.logger.warn(`🧠 Cerebras ${model} failed: ${error.message} (${status})`);
        continue;
      }
    }

    this.logger.warn(`🧠 All Cerebras models failed (${errors.length} attempts) — returning stub`);
    return this._stubResponse(request, errors);
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `أنت محلل مالي متخصص في ${request.type}. أجب بالعربية فقط. كن موجزاً ومبنياً على البيانات. قدم تحليلاً واضحاً مع رؤى قابلة للتنفيذ. أضف دائماً تنبيهات المخاطر. IMPORTANT: Respond in ${lang} only.`;
  }

  private _stubResponse(request: AIAnalysisRequest, errors: string[] = [], authFailed = false): AIAnalysisResponse {
    const errorDetail = errors.length > 0 ? ` الأخطاء: ${errors.slice(0, 2).join(' | ')}` : '';
    const content = authFailed
      ? `⚠️ مفتاح Cerebras API غير صالح أو منتهي.${errorDetail}`
      : `⚠️ مفتاح Cerebras API غير مكوّن. احصل على مفتاح مجاني من cloud.cerebras.ai واضبط CEREBRAS_API_KEY في Railway.${errorDetail}`;
    return {
      model: 'Cerebras/Unavailable',
      content,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
      isFallback: true,
    };
  }
}
