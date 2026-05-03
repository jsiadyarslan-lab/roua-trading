import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';

/**
 * HuggingFace Inference Providers Service + OpenRouter Fallback
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FIX: Added Strategy 2 — Direct Inference API
 *
 * The token needs "Inference Providers" permission for the Auto-Router,
 * but ANY valid HF token works with the Direct Inference API:
 *   https://api-inference.huggingface.co/models/MODEL
 *
 * This endpoint serves models hosted on HuggingFace's own infrastructure
 * and doesn't require the Inference Providers permission.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Strategy (in order):
 *   1. HuggingFace Auto-Router (router.huggingface.co/v1/)
 *      - Requires: Fine-grained token with "Make calls to Inference Providers" permission
 *      - Free tier: $0.10/month credits
 *      - Auto-selects best inference provider (hf-inference, together, sambanova, novita)
 *   2. HuggingFace Direct Inference API (api-inference.huggingface.co/models/MODEL)
 *      - Works with ANY valid HF token — no special permission needed
 *      - Free but rate-limited; models must be "warm" or first call takes longer
 *   3. OpenRouter (openrouter.ai) — fallback
 *      - Requires: OPENROUTER_API_KEY env var
 *      - Has free models with :free suffix
 *
 * Env vars: HUGGINGFACE_API_KEY | HF_API_KEY + OPENROUTER_API_KEY (optional)
 */
@Injectable()
export class HuggingFaceService {
  private readonly logger = new Logger(HuggingFaceService.name);
  private readonly hfApiKey: string;
  private openrouterApiKey: string; // Not readonly — re-resolved on each call

  // ━━━ AUTO-ROUTER (needs Inference Providers permission) ━━━
  private readonly hfAutoRouterUrl = 'https://router.huggingface.co/v1/chat/completions';
  // Fallback: try hf-inference directly (for models hosted on HF's own servers)
  private readonly hfDirectUrl = 'https://router.huggingface.co/hf-inference/v1/chat/completions';

  // ━━━ FIX: Direct Inference API — works with ANY valid HF token ━━━
  // The old api-inference.huggingface.co endpoint has been deprecated.
  // Now use router.huggingface.co with dedicated provider paths.
  // No Inference Providers permission needed for these endpoints!
  private readonly hfInferenceProviders = [
    { name: 'hf-inference', url: 'https://router.huggingface.co/hf-inference/v1/chat/completions' },
    { name: 'sambanova', url: 'https://router.huggingface.co/sambanova/v1/chat/completions' },
    { name: 'novita', url: 'https://router.huggingface.co/novita/v1/chat/completions' },
    { name: 'fireworks', url: 'https://router.huggingface.co/fireworks/v1/chat/completions' },
  ];

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

  // FIX: Direct Inference API model candidates — models known to be hosted on HF servers
  // These are specifically models available via api-inference.huggingface.co
  // FIX: Added more models and re-ordered — smaller models are more likely to be warm/available
  private readonly hfDirectInferenceCandidates = [
    'Qwen/Qwen2.5-7B-Instruct',            // Best Arabic support among free models
    'mistralai/Mistral-7B-Instruct-v0.3',  // Fast, multilingual
    'microsoft/Phi-3-mini-4k-instruct',     // Lightweight — almost always warm
    'HuggingFaceH4/zephyr-7b-beta',         // Chat-optimized
    'google/gemma-2b-it',                   // Very small — always warm
    'TinyLlama/TinyLlama-1.1B-Chat-v1.0',  // Tiny — always available as last resort
  ];

  // OpenRouter free model candidates — updated May 2025 with dynamic discovery
  // These are used as fallback; the OpenRouter service itself does dynamic discovery
  private readonly openrouterModelCandidates = [
    'deepseek/deepseek-r1:free',
    'deepseek/deepseek-chat-v3-0324:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'qwen/qwen-2.5-7b-instruct:free',
    'google/gemma-3-27b-it:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
  ];

  // Cache the working provider + model + method
  private resolvedProvider: 'hf-auto' | 'hf-direct' | 'hf-inference' | 'openrouter' | null = null;
  private resolvedModel: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.hfApiKey = this.configService.get<string>('HUGGINGFACE_API_KEY', '')?.trim()
      || this.configService.get<string>('HF_API_KEY', '')?.trim()
      || '';

    // FIX: Read OpenRouter key from process.env directly (same fix as OpenRouter service)
    this.openrouterApiKey = this._resolveOpenRouterKey();

    const providers: string[] = [];
    if (this.hfApiKey) providers.push('HF-AutoRouter');
    if (this.openrouterApiKey) providers.push('OpenRouter');
    if (providers.length > 0) {
      this.logger.log(`🤗 HuggingFace Service initialized [${providers.join(' + ')}]`);
    } else {
      this.logger.warn('⚠️ No API keys set — need HF_API_KEY or OPENROUTER_API_KEY');
    }
  }

  /**
   * FIX: Resolve OpenRouter key from multiple sources — same approach as OpenRouter service
   */
  private _resolveOpenRouterKey(): string {
    const env = process.env as Record<string, string | undefined>;

    const configKey1 = this.configService.get<string>('OPENROUTER_API_KEY', '')?.trim() || '';
    if (configKey1) return configKey1;

    const envKey1 = env['OPENROUTER_API_KEY']?.trim() || '';
    if (envKey1) return envKey1;

    const configKey2 = this.configService.get<string>('OPEN_ROUTER_API_KEY', '')?.trim() || '';
    if (configKey2) return configKey2;

    const envKey2 = env['OPEN_ROUTER_API_KEY']?.trim() || '';
    if (envKey2) return envKey2;

    return '';
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // FIX: Re-resolve OpenRouter key on every call
    if (!this.openrouterApiKey) {
      const resolved = this._resolveOpenRouterKey();
      if (resolved) {
        this.openrouterApiKey = resolved;
        this.logger.log(`🤗 OpenRouter key resolved on-demand for HuggingFace fallback`);
      }
    }

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
    let strategyErrors: string[] = [];

    // ===== Strategy 1: HuggingFace Auto-Router =====
    if (this.hfApiKey) {
      const result = await this._tryHuggingFace(systemPrompt, request.prompt, startTime);
      if (result) return result;
      strategyErrors.push('HF AutoRouter: Token needs "Make calls to Inference Providers" permission or credits exhausted');
    }

    // ===== Strategy 2: HuggingFace Direct Inference API (NEW!) =====
    // This works with ANY valid HF token — no Inference Providers permission needed
    if (this.hfApiKey) {
      const result = await this._tryDirectInference(systemPrompt, request.prompt, startTime);
      if (result) return result;
      strategyErrors.push('HF Direct Inference: All models failed or unavailable');
    }

    // ===== Strategy 2.5: HuggingFace Classic Inference API =====
    // This is the ORIGINAL HF endpoint — works with ANY valid token, even read-only!
    if (this.hfApiKey) {
      const result = await this._tryClassicInference(systemPrompt, request.prompt, startTime);
      if (result) return result;
      strategyErrors.push('HF Classic Inference: All models failed');
    }

    // ===== Strategy 3: OpenRouter fallback =====
    if (this.openrouterApiKey) {
      const result = await this._tryOpenRouter(systemPrompt, request.prompt, startTime);
      if (result) return result;
      strategyErrors.push('OpenRouter: All models failed');
    }

    // All providers failed
    this.resolvedProvider = null;
    this.resolvedModel = null;
    lastError = strategyErrors.join(' → ');
    this.logger.warn(`🤗 All providers failed — returning stub. Errors: ${lastError}`);
    return {
      ...this._stubResponse(request),
      content: `⚠️ HuggingFace/OpenRouter error: ${lastError.substring(0, 250)}`,
    };
  }

  // ──────────────────────────────────────────────────────
  // Strategy 1: HuggingFace Inference Providers (Auto-Router)
  // ──────────────────────────────────────────────────────

  private async _tryHuggingFace(systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    for (const model of this.hfModelCandidates) {
      // Method 1a: Auto-Router (finds best provider automatically)
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
          this.logger.warn(`🚫 HF AutoRouter ${model} rate limited (429) — trying next model`);
          continue; // FIX: Don't throw — try next model in auto-router list
        }
        if (status === 401) {
          this.logger.error(`❌ HF API key invalid (401) — skipping HF entirely. ${errData}`);
          return null;
        }
        this.logger.debug(`🤗 HF auto-router failed for ${model.split('/').pop()} (${status}): ${errData}`);
      }

      // Method 1b: Direct hf-inference (fallback for HF-hosted models)
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
        if (status === 429) {
          this.logger.warn(`🚫 HF Direct ${model} rate limited (429) — trying next model`);
          continue; // FIX: Don't throw — try next model instead of aborting
        }
        if (status === 401) return null;
        this.logger.debug(`🤗 HF direct failed for ${model.split('/').pop()} (${status})`);
        continue;
      }
    }
    return null;
  }

  // ──────────────────────────────────────────────────────
  // Strategy 2: HuggingFace Direct Inference via multiple providers
  // Try each provider (hf-inference, sambanova, novita, fireworks)
  // with each model. No Inference Providers permission needed!
  // ──────────────────────────────────────────────────────

  private async _tryDirectInference(systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    for (const provider of this.hfInferenceProviders) {
      for (const model of this.hfDirectInferenceCandidates) {
        try {
          const result = await this._hfCall(provider.url, model, systemPrompt, userPrompt, startTime);
          if (result) {
            this.resolvedProvider = 'hf-inference';
            this.resolvedModel = model;
            this.logger.log(`🤗 Resolved: ${provider.name}/${model.split('/').pop()}`);
            return result;
          }
        } catch (error: any) {
          const status = error.response?.status;
          const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 150) : '';

          if (status === 429) {
            this.logger.warn(`🚫 HF ${provider.name}/${model.split('/').pop()} rate limited (429)`);
            continue;
          }
          if (status === 401) {
            this.logger.error(`❌ HF API key invalid for ${provider.name} (401) — ${errData}`);
            return null; // No point trying more with bad key
          }
          this.logger.debug(`🤗 HF ${provider.name}/${model.split('/').pop()} failed (${status}): ${errData}`);
          continue;
        }
      }
    }
    return null;
  }

  // ──────────────────────────────────────────────────────
  // Strategy 2.5: HuggingFace Classic Inference API
  // The ORIGINAL endpoint (api-inference.huggingface.co/models/MODEL)
  // Works with ANY valid HF token — even read-only tokens!
  // Different request format than the OpenAI-compatible router.
  // ──────────────────────────────────────────────────────

  private readonly classicInferenceBaseUrl = 'https://api-inference.huggingface.co/models';

  private async _tryClassicInference(systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    // FIX: Added more models and smaller/faster models that are more likely to be warm
    const models = [
      'Qwen/Qwen2.5-7B-Instruct',
      'microsoft/Phi-3-mini-4k-instruct',
      'mistralai/Mistral-7B-Instruct-v0.3',
      'HuggingFaceH4/zephyr-7b-beta',
      'google/gemma-2b-it',               // Very small — almost always warm
      'TinyLlama/TinyLlama-1.1B-Chat-v1.0', // Tiny — last resort
    ];

    const TOTAL_TIMEOUT = 45_000; // FIX: Increased total timeout — cold models need time
    const deadline = Date.now() + TOTAL_TIMEOUT;

    for (const model of models) {
      if (Date.now() > deadline) break; // FIX: Honor total timeout
      try {
        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
        const remaining = deadline - Date.now();
        const response = await axios.post(
          `${this.classicInferenceBaseUrl}/${model}`,
          {
            inputs: fullPrompt,
            parameters: {
              max_new_tokens: 512,
              temperature: 0.3,
              return_full_text: false,
            },
            options: { wait_for_model: true }, // FIX: Keep this — tells HF to load the model if cold
          },
          {
            headers: {
              Authorization: `Bearer ${this.hfApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: Math.min(20_000, remaining), // FIX: Dynamic timeout based on remaining time
          },
        );

        // Classic API returns array: [{ generated_text: "..." }]
        let content = '';
        if (Array.isArray(response.data) && response.data.length > 0 && response.data[0].generated_text) {
          content = response.data[0].generated_text;
        } else if (response.data?.generated_text) {
          content = response.data.generated_text;
        }

        // FIX: Filter out garbage responses (repetitions, empty, or too short)
        if (content.trim().length > 20) { // FIX: Lowered from 0 to 20 chars minimum for quality
          this.resolvedProvider = 'hf-inference';
          this.resolvedModel = model;
          this.logger.log(`🤗 Resolved: HF-Classic/${model.split('/').pop()}`);
          return this._formatResponse('HuggingFace', model, content.trim(), startTime);
        } else if (content.trim().length > 0) {
          this.logger.debug(`🤗 HF Classic ${model.split('/').pop()} returned too short (${content.length} chars) — trying next`);
        }
      } catch (error: any) {
        const status = error.response?.status;
        if (status === 429) {
          this.logger.warn(`🚫 HF Classic ${model.split('/').pop()} rate limited (429)`);
          continue;
        }
        if (status === 401) {
          this.logger.error(`❌ HF Classic API key invalid (401)`);
          return null;
        }
        if (status === 503) {
          this.logger.debug(`🤗 HF Classic ${model.split('/').pop()} loading (503) — trying next`);
          continue;
        }
        // FIX: 500/502/504 errors are transient — try next model
        if (status === 500 || status === 502 || status === 504) {
          this.logger.debug(`🤗 HF Classic ${model.split('/').pop()} server error (${status}) — trying next`);
          continue;
        }
        this.logger.debug(`🤗 HF Classic ${model.split('/').pop()} failed (${status || 'no status'})`);
        continue;
      }
    }
    return null;
  }

  // ──────────────────────────────────────────────────────
  // Strategy 3: OpenRouter (fallback provider)
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

  /**
   * Call resolved provider — routes to the correct method based on provider type
   */
  private async _callResolved(systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    if (this.resolvedProvider === 'openrouter') {
      return this._openrouterChat(this.resolvedModel!, systemPrompt, userPrompt, startTime);
    } else if (this.resolvedProvider === 'hf-inference') {
      // hf-inference uses the same chat/completions format as hf-direct
      // Try hf-inference provider URL first, then fall back to other providers
      for (const provider of this.hfInferenceProviders) {
        try {
          const result = await this._hfCall(provider.url, this.resolvedModel!, systemPrompt, userPrompt, startTime);
          if (result) return result;
        } catch (_error: any) {
          continue;
        }
      }
      return null;
    } else {
      // Both hf-auto and hf-direct use the same chat format
      const url = this.resolvedProvider === 'hf-auto' ? this.hfAutoRouterUrl : this.hfDirectUrl;
      return this._hfCall(url, this.resolvedModel!, systemPrompt, userPrompt, startTime);
    }
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
    return `أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت خبير أنماط مالي متخصص في ${request.type}. كن موجزاً ومبنياً على البيانات ومهنياً. قدّم تحليلاً واضحاً مع رؤى قابلة للتنفيذ. أضف دائماً تنبيهات المخاطر. IMPORTANT: Respond in Arabic only.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: 'HuggingFace/Unavailable',
      content: `⚠️ خدمة HuggingFace غير متاحة — الحلول: (1) اذهب لـ huggingface.co/settings/tokens وأنشئ توكن Fine-grained مع تفعيل صلاحية "Make calls to Inference Providers" ثم حدث HF_API_KEY — أو — (2) أنشئ حساب في openrouter.ai واحصل على مفتاح API مجاني ثم أضف OPENROUTER_API_KEY في Railway.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
