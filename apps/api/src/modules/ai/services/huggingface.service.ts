import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';

/**
 * HuggingFace Inference Providers Service + OpenRouter Fallback
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * CRITICAL FIX: Use AUTO-ROUTER, not hf-inference directly!
 *
 * The URL path matters:
 *   ❌ /hf-inference/v1/chat/completions  → Only HuggingFace's own servers (limited models)
 *   ✅ /v1/chat/completions               → Auto-routes to best provider (together, sambanova, novita, etc.)
 *
 * With "Make calls to Inference Providers" permission, the auto-router
 * finds the right provider for each model automatically.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Strategy (in order):
 *   1. HuggingFace Auto-Router (router.huggingface.co/v1/)
 *      - Requires: Fine-grained token with "Make calls to Inference Providers" permission
 *      - Free tier: $0.10/month credits
 *      - Auto-selects best inference provider (hf-inference, together, sambanova, novita)
 *   2. OpenRouter (openrouter.ai) — fallback
 *      - Requires: OPENROUTER_API_KEY env var
 *      - Has free models with :free suffix
 *
 * Env vars: HUGGINGFACE_API_KEY | HF_API_KEY + OPENROUTER_API_KEY (optional)
 */
@Injectable()
export class HuggingFaceService {
  private readonly logger = new Logger(HuggingFaceService.name);
  private readonly hfApiKey: string;
  private readonly openrouterApiKey: string;

  // ━━━ AUTO-ROUTER (not hf-inference!) ━━━
  // This automatically picks the best provider for each model
  private readonly hfAutoRouterUrl = 'https://router.huggingface.co/v1/chat/completions';
  // Fallback: try hf-inference directly (for models hosted on HF's own servers)
  private readonly hfDirectUrl = 'https://router.huggingface.co/hf-inference/v1/chat/completions';

  // OpenRouter endpoint (OpenAI-compatible)
  private readonly openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions';

  // HuggingFace model candidates — popular models likely available on Inference Providers
  private readonly hfModelCandidates = [
    'Qwen/Qwen2.5-7B-Instruct',            // Good Arabic + reasoning
    'mistralai/Mistral-7B-Instruct-v0.3',   // Fast, multilingual
    'HuggingFaceH4/zephyr-7b-beta',         // Chat-optimized
    'microsoft/Phi-3-mini-4k-instruct',     // Lightweight
    'Qwen/Qwen2.5-72B-Instruct',            // Best reasoning (may need PRO)
  ];

  // OpenRouter free model candidates
  private readonly openrouterModelCandidates = [
    'meta-llama/llama-3.1-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'google/gemma-2-9b-it:free',
    'qwen/qwen-2.5-7b-instruct:free',
    'huggingfaceh4/zephyr-7b-beta:free',
  ];

  // Cache the working provider + model + method
  private resolvedProvider: 'hf-auto' | 'hf-direct' | 'openrouter' | null = null;
  private resolvedModel: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.hfApiKey = this.configService.get<string>('HUGGINGFACE_API_KEY', '')?.trim()
      || this.configService.get<string>('HF_API_KEY', '')?.trim()
      || '';
    this.openrouterApiKey = this.configService.get<string>('OPENROUTER_API_KEY', '')?.trim() || '';

    const providers: string[] = [];
    if (this.hfApiKey) providers.push('HF-AutoRouter');
    if (this.openrouterApiKey) providers.push('OpenRouter');
    if (providers.length > 0) {
      this.logger.log(`🤗 HuggingFace Service initialized [${providers.join(' + ')}]`);
    } else {
      this.logger.warn('⚠️ No API keys set — need HF_API_KEY or OPENROUTER_API_KEY');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.hfApiKey && !this.openrouterApiKey) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    // Fast path: use resolved provider+model from previous calls
    if (this.resolvedProvider && this.resolvedModel) {
      try {
        const result = await this._callResolved(systemPrompt, request.prompt, startTime);
        if (result) return result;
      } catch (_error: any) {
        this.logger.warn(`🤗 Resolved ${this.resolvedProvider}/${this.resolvedModel} failed — resetting`);
        this.resolvedProvider = null;
        this.resolvedModel = null;
      }
    }

    let lastError = '';

    // ===== Strategy 1: HuggingFace Auto-Router =====
    if (this.hfApiKey) {
      const result = await this._tryHuggingFace(systemPrompt, request.prompt, startTime);
      if (result) return result;
      lastError = 'HF: Token needs "Make calls to Inference Providers" permission or credits exhausted';
    }

    // ===== Strategy 2: OpenRouter fallback =====
    if (this.openrouterApiKey) {
      const result = await this._tryOpenRouter(systemPrompt, request.prompt, startTime);
      if (result) return result;
      lastError = lastError || 'OpenRouter: All models failed';
    }

    // All providers failed
    this.resolvedProvider = null;
    this.resolvedModel = null;
    this.logger.warn(`🤗 All providers failed — returning stub. Last: ${lastError}`);
    return {
      ...this._stubResponse(request),
      content: `⚠️ HuggingFace/OpenRouter error: ${lastError.substring(0, 250)}`,
    };
  }

  // ──────────────────────────────────────────────────────
  // HuggingFace Inference Providers (Auto-Router)
  // ──────────────────────────────────────────────────────

  private async _tryHuggingFace(systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    for (const model of this.hfModelCandidates) {
      // Method 1: Auto-Router (finds best provider automatically)
      try {
        const result = await this._hfCall(this.hfAutoRouterUrl, model, systemPrompt, userPrompt, startTime);
        if (result) {
          this.resolvedProvider = 'hf-auto';
          this.resolvedModel = model;
          this.logger.log(`🤗 Resolved: HF-AutoRouter/${model.split('/').pop()}`);
          return result;
        }
      } catch (error: any) {
        const status = error.response?.status;
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 150) : '';

        if (status === 429) {
          this.logger.warn(`🚫 HF ${model} rate limited (429)`);
          throw error;
        }
        if (status === 401) {
          this.logger.error(`❌ HF API key invalid (401) — skipping HF entirely. ${errData}`);
          return null;
        }
        this.logger.debug(`🤗 HF auto-router failed for ${model.split('/').pop()} (${status}): ${errData}`);
      }

      // Method 2: Direct hf-inference (fallback for HF-hosted models)
      try {
        const result = await this._hfCall(this.hfDirectUrl, model, systemPrompt, userPrompt, startTime);
        if (result) {
          this.resolvedProvider = 'hf-direct';
          this.resolvedModel = model;
          this.logger.log(`🤗 Resolved: HF-Direct/${model.split('/').pop()}`);
          return result;
        }
      } catch (error: any) {
        const status = error.response?.status;
        if (status === 429) throw error;
        if (status === 401) return null;
        this.logger.debug(`🤗 HF direct failed for ${model.split('/').pop()} (${status})`);
        continue;
      }
    }
    return null;
  }

  /**
   * Generic HuggingFace chat/completions call (works with both auto-router and direct)
   */
  private async _hfCall(url: string, model: string, systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    const response = await axios.post(
      url,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${this.hfApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    if (content.trim().length > 0) {
      return this._formatResponse('HuggingFace', model, content.trim(), startTime);
    }
    return null;
  }

  // ──────────────────────────────────────────────────────
  // OpenRouter (fallback provider)
  // ──────────────────────────────────────────────────────

  private async _tryOpenRouter(systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    for (const model of this.openrouterModelCandidates) {
      try {
        const result = await this._openrouterChat(model, systemPrompt, userPrompt, startTime);
        if (result) {
          this.resolvedProvider = 'openrouter';
          this.resolvedModel = model;
          this.logger.log(`🤗 Resolved: OpenRouter/${model.split('/').pop()}`);
          return result;
        }
      } catch (error: any) {
        const status = error.response?.status;
        if (status === 429) {
          this.logger.warn(`🚫 OpenRouter ${model} rate limited (429)`);
          continue;
        }
        if (status === 401) {
          this.logger.error(`❌ OpenRouter API key invalid (401)`);
          return null;
        }
        this.logger.debug(`🤗 OpenRouter ${model} failed (${status})`);
        continue;
      }
    }
    return null;
  }

  private async _openrouterChat(model: string, systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    const response = await axios.post(
      this.openrouterUrl,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${this.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://roua-trading-production.up.railway.app',
          'X-Title': 'Roua Trading AI',
        },
        timeout: 60000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    if (content.trim().length > 0) {
      return this._formatResponse('OpenRouter', model, content.trim(), startTime);
    }
    return null;
  }

  // ──────────────────────────────────────────────────────
  // Shared helpers
  // ──────────────────────────────────────────────────────

  private async _callResolved(systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    if (this.resolvedProvider === 'openrouter') {
      return this._openrouterChat(this.resolvedModel!, systemPrompt, userPrompt, startTime);
    } else {
      // Both hf-auto and hf-direct use the same chat format
      const url = this.resolvedProvider === 'hf-auto' ? this.hfAutoRouterUrl : this.hfDirectUrl;
      return this._hfCall(url, this.resolvedModel!, systemPrompt, userPrompt, startTime);
    }
  }

  private _formatResponse(provider: string, model: string, content: string, startTime: number): AIAnalysisResponse {
    const modelShort = model.split('/').pop() || model;
    return {
      model: `${provider}/${modelShort}`,
      content,
      confidence: calculateConfidence(content, 'huggingface'),
      processingTimeMs: Date.now() - startTime,
      language: 'ar',
    };
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a professional financial AI analyst specializing in ${request.type}. Respond in ${lang}. Be concise, data-driven, and professional. Provide clear analysis with actionable insights. Always include risk disclaimers.`;
  }

  private _stubResponse(request: AIAnalysisResponse): AIAnalysisResponse {
    return {
      model: 'HuggingFace/Unavailable',
      content: `⚠️ خدمة HuggingFace غير متاحة — الحلول: (1) اذهب لـ huggingface.co/settings/tokens وأنشئ توكن Fine-grained مع تفعيل صلاحية "Make calls to Inference Providers" ثم حدث HF_API_KEY — أو — (2) أنشئ حساب في openrouter.ai واحصل على مفتاح API مجاني ثم أضف OPENROUTER_API_KEY في Railway.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
