import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';

/**
 * HuggingFace / OpenRouter Fallback Service — Free/Open-Source AI Models
 *
 * Strategy (in order):
 *   1. HuggingFace Inference Providers (router.huggingface.co)
 *      - Requires: Fine-grained token with "Make calls to Inference Providers" permission
 *      - Free tier: $0.10/month credits
 *   2. OpenRouter (openrouter.ai) — fallback
 *      - Requires: OPENROUTER_API_KEY env var
 *      - Has free models with :free suffix
 *      - OpenAI-compatible API
 *
 * Env vars used:
 *   - HUGGINGFACE_API_KEY or HF_API_KEY (for HuggingFace)
 *   - OPENROUTER_API_KEY (for OpenRouter fallback)
 */
@Injectable()
export class HuggingFaceService {
  private readonly logger = new Logger(HuggingFaceService.name);
  private readonly hfApiKey: string;
  private readonly openrouterApiKey: string;

  // HuggingFace Inference Providers endpoints
  private readonly hfChatUrl = 'https://router.huggingface.co/hf-inference/v1/chat/completions';
  private readonly hfDirectUrl = 'https://router.huggingface.co/hf-inference/models/';

  // OpenRouter endpoint (OpenAI-compatible)
  private readonly openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions';

  // HuggingFace model candidates
  private readonly hfModelCandidates = [
    'Qwen/Qwen2.5-7B-Instruct',          // Good Arabic support, lighter
    'mistralai/Mistral-7B-Instruct-v0.3', // Fast, multilingual
    'HuggingFaceH4/zephyr-7b-beta',       // Chat-optimized
    'microsoft/Phi-3-mini-4k-instruct',   // Lightweight
  ];

  // OpenRouter free model candidates (models with :free suffix are truly free)
  private readonly openrouterModelCandidates = [
    'meta-llama/llama-3.1-8b-instruct:free',   // Free Llama 3.1
    'mistralai/mistral-7b-instruct:free',       // Free Mistral 7B
    'google/gemma-2-9b-it:free',               // Free Gemma 2
    'qwen/qwen-2.5-7b-instruct:free',          // Free Qwen 2.5
    'huggingfaceh4/zephyr-7b-beta:free',        // Free Zephyr
  ];

  // Cache the working provider + model + method
  private resolvedProvider: 'hf' | 'openrouter' | null = null;
  private resolvedModel: string | null = null;
  private resolvedMethod: 'chat' | 'direct' | null = null;

  constructor(private readonly configService: ConfigService) {
    this.hfApiKey = this.configService.get<string>('HUGGINGFACE_API_KEY', '')?.trim()
      || this.configService.get<string>('HF_API_KEY', '')?.trim()
      || '';
    this.openrouterApiKey = this.configService.get<string>('OPENROUTER_API_KEY', '')?.trim() || '';

    const providers: string[] = [];
    if (this.hfApiKey) providers.push('HuggingFace');
    if (this.openrouterApiKey) providers.push('OpenRouter');
    if (providers.length > 0) {
      this.logger.log(`🤗 HuggingFace Service initialized [${providers.join(' + ')}]`);
    } else {
      this.logger.warn('⚠️ No API keys set — need HUGGINGFACE_API_KEY or OPENROUTER_API_KEY');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.hfApiKey && !this.openrouterApiKey) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    // If we've resolved a working provider+model+method, use it directly
    if (this.resolvedProvider && this.resolvedModel && this.resolvedMethod) {
      try {
        const result = await this._callResolved(systemPrompt, request.prompt, startTime);
        if (result) return result;
      } catch (error: any) {
        this.logger.warn(`🤗 Resolved ${this.resolvedProvider}/${this.resolvedModel} failed — resetting`);
        this.resolvedProvider = null;
        this.resolvedModel = null;
        this.resolvedMethod = null;
      }
    }

    let lastError = '';

    // ===== Strategy 1: HuggingFace Inference Providers =====
    if (this.hfApiKey) {
      const hfResult = await this._tryHuggingFace(systemPrompt, request.prompt, startTime);
      if (hfResult) return hfResult;
      lastError = 'HuggingFace: Token lacks "Make calls to Inference Providers" permission or credits exhausted';
    }

    // ===== Strategy 2: OpenRouter fallback =====
    if (this.openrouterApiKey) {
      const orResult = await this._tryOpenRouter(systemPrompt, request.prompt, startTime);
      if (orResult) return orResult;
      lastError = lastError || 'OpenRouter: All models failed';
    }

    // All providers failed
    this.resolvedProvider = null;
    this.resolvedModel = null;
    this.resolvedMethod = null;
    this.logger.warn(`🤗 All providers failed — returning stub. Last: ${lastError}`);
    return {
      ...this._stubResponse(request),
      content: `⚠️ HuggingFace/OpenRouter error: ${lastError.substring(0, 250)}`,
    };
  }

  // ──────────────────────────────────────────────────────
  // HuggingFace Inference Providers
  // ──────────────────────────────────────────────────────

  private async _tryHuggingFace(systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    for (const model of this.hfModelCandidates) {
      // Method 1: Chat/Completions (OpenAI-compatible)
      try {
        const result = await this._hfChatCompletions(model, systemPrompt, userPrompt, startTime);
        if (result) {
          this._setResolved('hf', model, 'chat');
          return result;
        }
      } catch (error: any) {
        const status = error.response?.status;
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 150) : '';

        if (status === 429) {
          this.logger.warn(`🚫 HF ${model} rate limited (429)`);
          throw error; // circuit breaker
        }
        if (status === 401) {
          this.logger.error(`❌ HF API key invalid (401) — skipping HF entirely`);
          return null; // No point trying other models
        }
        this.logger.debug(`🤗 HF chat/completions failed for ${model.split('/').pop()} (${status})`);
      }

      // Method 2: Direct model API
      try {
        const result = await this._hfDirectModel(model, systemPrompt, userPrompt, startTime);
        if (result) {
          this._setResolved('hf', model, 'direct');
          return result;
        }
      } catch (error: any) {
        const status = error.response?.status;
        if (status === 429) throw error;
        if (status === 401) return null;
        if (status === 503) {
          this.logger.warn(`⏳ HF ${model.split('/').pop()} loading (503)`);
        }
        continue;
      }
    }
    return null;
  }

  private async _hfChatCompletions(model: string, systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    const response = await axios.post(
      this.hfChatUrl,
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

  private async _hfDirectModel(model: string, systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    const fullPrompt = this._formatHfPrompt(model, systemPrompt, userPrompt);

    const response = await axios.post(
      `${this.hfDirectUrl}${model}`,
      {
        inputs: fullPrompt,
        parameters: {
          max_new_tokens: 1024,
          temperature: 0.3,
          do_sample: true,
          return_full_text: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${this.hfApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    let content = '';
    if (Array.isArray(response.data) && response.data.length > 0) {
      content = response.data[0].generated_text || '';
    } else if (typeof response.data === 'string') {
      content = response.data;
    }

    if (!content && response.data?.estimated_time) {
      this.logger.warn(`⏳ HF ${model.split('/').pop()} loading — estimated ${Math.ceil(response.data.estimated_time)}s`);
      return null;
    }

    content = content.replace(/\[\/INST\]/g, '').trim();
    if (content.length > 1) {
      return this._formatResponse('HuggingFace', model, content, startTime);
    }
    return null;
  }

  private _formatHfPrompt(model: string, systemPrompt: string, userPrompt: string): string {
    if (model.includes('Phi-3')) {
      return `<s>user\n${systemPrompt}\n\n${userPrompt}<|end|>\n<|assistant|)\n`;
    }
    if (model.includes('Qwen')) {
      return `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;
    }
    if (model.includes('zephyr')) {
      return `<|system|>\n${systemPrompt}</s>\n<|user|>\n${userPrompt}</s>\n<|assistant|)\n`;
    }
    // Default: Mistral format
    return `<s>[INST] ${systemPrompt}\n\n${userPrompt} [/INST]`;
  }

  // ──────────────────────────────────────────────────────
  // OpenRouter (fallback provider)
  // ──────────────────────────────────────────────────────

  private async _tryOpenRouter(systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    for (const model of this.openrouterModelCandidates) {
      try {
        const result = await this._openrouterChat(model, systemPrompt, userPrompt, startTime);
        if (result) {
          this._setResolved('openrouter', model, 'chat');
          return result;
        }
      } catch (error: any) {
        const status = error.response?.status;
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 150) : '';
        if (status === 429) {
          this.logger.warn(`🚫 OpenRouter ${model} rate limited (429)`);
          continue; // Try next model
        }
        if (status === 401) {
          this.logger.error(`❌ OpenRouter API key invalid (401)`);
          return null;
        }
        this.logger.debug(`🤗 OpenRouter ${model} failed (${status}): ${errData}`);
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

  private _setResolved(provider: 'hf' | 'openrouter', model: string, method: 'chat' | 'direct') {
    this.resolvedProvider = provider;
    this.resolvedModel = model;
    this.resolvedMethod = method;
    this.logger.log(`🤗 Resolved: ${provider}/${model.split('/').pop()} (${method})`);
  }

  private async _callResolved(systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    if (this.resolvedProvider === 'hf') {
      if (this.resolvedMethod === 'chat') {
        return this._hfChatCompletions(this.resolvedModel!, systemPrompt, userPrompt, startTime);
      } else {
        return this._hfDirectModel(this.resolvedModel!, systemPrompt, userPrompt, startTime);
      }
    } else {
      return this._openrouterChat(this.resolvedModel!, systemPrompt, userPrompt, startTime);
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

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: 'HuggingFace/Unavailable',
      content: `⚠️ خدمة HuggingFace غير متاحة — الحلول: (1) أنشئ توكن Fine-grained في huggingface.co/settings/tokens مع تفعيل صلاحية "Make calls to Inference Providers" ثم حدث HF_API_KEY — أو — (2) أنشئ حساب في openrouter.ai واحصل على مفتاح API مجاني ثم أضف OPENROUTER_API_KEY في Railway.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
