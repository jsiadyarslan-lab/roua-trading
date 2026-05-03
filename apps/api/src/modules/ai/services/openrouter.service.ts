import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';

/**
 * OpenRouter Service — 7th AI Model for the AI Council
 *
 * OpenRouter provides access to 200+ AI models through a single OpenAI-compatible API.
 * Models with :free suffix are completely free (rate-limited but no cost).
 *
 * This service is:
 *   1. A STANDALONE 7th model in the AI Council (its own role: "محلل التباين")
 *   2. Also used as FALLBACK inside HuggingFaceService (when HF fails)
 *
 * Env var: OPENROUTER_API_KEY  (or OPEN_ROUTER_API_KEY as alternate name)
 *
 * FIX LOG:
 * - ConfigService.get() returns empty during construction → _resolveApiKey() reads process.env directly
 * - Free model names change frequently → dynamic model discovery from /api/v1/models
 * - OPEN_ROUTER_API_KEY added as alternate env var name
 * - Re-resolves key on every analyze() call if still empty
 * - Collects errors from every model attempt + improved stub responses
 */
@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);
  private apiKey: string; // Not readonly — allows on-demand key resolution
  private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly modelsUrl = 'https://openrouter.ai/api/v1/models';

  // Static model candidates — used as fallback if dynamic discovery fails
  // Updated May 2025 — free models on OpenRouter change frequently
  private readonly staticModelCandidates = [
    'deepseek/deepseek-r1:free',                   // Free — DeepSeek R1
    'deepseek/deepseek-chat-v3-0324:free',         // Free — DeepSeek V3
    'meta-llama/llama-3.3-70b-instruct:free',     // Free — Llama 3.3 70B
    'meta-llama/llama-3.1-8b-instruct:free',      // Free — Llama 3.1 8B
    'google/gemma-3-27b-it:free',                  // Free — Gemma 3 27B
    'qwen/qwen-2.5-7b-instruct:free',             // Free — Qwen 2.5 7B
    'mistralai/mistral-small-3.1-24b-instruct:free', // Free — Mistral Small 3.1
    'deepseek/deepseek-chat',                      // Low cost — excellent reasoning
  ];

  // Dynamically discovered free models (cached for 30 minutes)
  private discoveredFreeModels: string[] = [];
  private lastDiscoveryTime = 0;
  private readonly discoveryCacheMs = 30 * 60 * 1000; // 30 minutes

  private resolvedModel: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this._resolveApiKey();
    if (this.apiKey) {
      this.logger.log(`🔀 OpenRouter Service initialized — key: ${this.apiKey.substring(0, 4)}***${this.apiKey.length > 8 ? this.apiKey.substring(this.apiKey.length - 4) : ''} (${this.apiKey.length} chars)`);
    } else {
      this.logger.warn('⚠️ OPENROUTER_API_KEY not set or empty (checked ConfigService + process.env + OPEN_ROUTER_API_KEY alternate)');
    }
  }

  /**
   * FIX: Resolve API key from multiple sources with fallback chain:
   *   1. ConfigService.get('OPENROUTER_API_KEY')
   *   2. process.env.OPENROUTER_API_KEY (direct)
   *   3. ConfigService.get('OPEN_ROUTER_API_KEY') (alternate name)
   *   4. process.env.OPEN_ROUTER_API_KEY (alternate name, direct)
   */
  private _resolveApiKey(): string {
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

  /**
   * FIX: Dynamically discover free models from OpenRouter API.
   * Free models on OpenRouter change frequently — hardcoded names quickly become stale.
   * This method fetches /api/v1/models and filters for free ones.
   */
  private async _discoverFreeModels(): Promise<string[]> {
    // Return cached discovery if still fresh
    if (this.discoveredFreeModels.length > 0 && Date.now() - this.lastDiscoveryTime < this.discoveryCacheMs) {
      return this.discoveredFreeModels;
    }

    try {
      const response = await axios.get(this.modelsUrl, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        timeout: 15000,
      });

      const models = response.data?.data || [];
      // Filter for free models (pricing.prompt === "0" or model ID ends with :free)
      const freeModels = models
        .filter((m: any) => {
          const id: string = m.id || '';
          const promptPrice = m.pricing?.prompt;
          // Model is free if it has :free suffix OR prompt price is "0"
          return id.endsWith(':free') || promptPrice === '0' || promptPrice === '0.0' || promptPrice === '0.00';
        })
        .map((m: any) => m.id as string)
        .filter((id: string) => {
          // Prefer models that are good for Arabic/financial analysis
          const lower = id.toLowerCase();
          return lower.includes('deepseek') || lower.includes('llama') || lower.includes('qwen')
            || lower.includes('gemma') || lower.includes('mistral') || lower.includes('phi')
            || lower.includes('zephyr') || lower.includes('hermes');
        });

      if (freeModels.length > 0) {
        this.discoveredFreeModels = freeModels;
        this.lastDiscoveryTime = Date.now();
        this.logger.log(`🔀 Discovered ${freeModels.length} free models from OpenRouter: ${freeModels.slice(0, 5).join(', ')}...`);
        return freeModels;
      }
    } catch (error: any) {
      this.logger.warn(`🔀 Failed to discover models from OpenRouter: ${error.message}`);
    }

    // Fallback to static list
    return this.staticModelCandidates;
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // FIX: Re-resolve key on EVERY call — ConfigService may have loaded it after construction
    if (!this.apiKey) {
      const resolved = this._resolveApiKey();
      if (resolved) {
        this.apiKey = resolved;
        this.logger.log(`🔀 OpenRouter key resolved on-demand (key: ${resolved.substring(0, 4)}***${resolved.substring(resolved.length - 4)})`);
      }
    }
    if (!this.apiKey) {
      return this._stubResponse(request, ['API key not found in OPENROUTER_API_KEY or OPEN_ROUTER_API_KEY']);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    // FIX: Dynamically discover free models, then merge with static candidates
    const discoveredModels = await this._discoverFreeModels();
    // Merge: discovered models first (most likely to work), then static candidates as fallback
    const allCandidates = [...new Set([...discoveredModels, ...this.staticModelCandidates])];

    // Try resolved model first, then all candidates
    const modelsToTry = this.resolvedModel
      ? [this.resolvedModel, ...allCandidates.filter(m => m !== this.resolvedModel)]
      : allCandidates;

    // FIX: Collect errors from every model attempt
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
              'HTTP-Referer': 'https://roua-trading-production.up.railway.app',
              'X-Title': 'Roua Trading AI',
            },
            timeout: 60000,
          },
        );

        const content = response.data?.choices?.[0]?.message?.content || '';
        if (content.trim().length > 0) {
          if (!this.resolvedModel || this.resolvedModel !== model) {
            this.resolvedModel = model;
            this.logger.log(`🔀 OpenRouter model resolved: ${model}`);
          }
          return {
            model: `OpenRouter/${model.split('/').pop()}`,
            content: content.trim(),
            confidence: calculateConfidence(content, 'openrouter'),
            processingTimeMs: Date.now() - startTime,
            language: request.language || 'ar',
          };
        }
      } catch (error: any) {
        const status = error.response?.status;
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 150) : error.message;
        errors.push(`${model}: ${status || 'N/A'} — ${errData}`);

        if (status === 429) {
          this.logger.warn(`🔀 OpenRouter ${model} rate limited (429) — trying next model...`);
          if (this.resolvedModel === model) {
            this.resolvedModel = null; // Reset resolved model
          }
          continue;
        }
        if (status === 401 || status === 403) {
          this.logger.error(`❌ OpenRouter auth failed (${status}) — API key may be invalid. Key starts with: ${this.apiKey.substring(0, 4)}***`);
          return this._stubResponse(request, errors, true);
        }
        if (status === 402) {
          this.logger.warn(`💸 OpenRouter ${model} requires payment (402) — trying free model...`);
          continue;
        }
        this.logger.warn(`🔀 OpenRouter ${model} failed (${status || 'N/A'}): ${errData}`);
        continue;
      }
    }

    this.logger.warn(`🔀 All OpenRouter models failed (${errors.length} attempts) — returning stub`);
    return this._stubResponse(request, errors);
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a professional financial AI analyst specializing in ${request.type}. You provide a unique perspective by looking for divergences, contrarian signals, and cross-model validation. Respond in ${lang}. Be concise, data-driven, and professional. Always include risk disclaimers.`;
  }

  /**
   * FIX: Improved stub response with collected errors
   */
  private _stubResponse(request: AIAnalysisRequest | AIAnalysisResponse, errors: string[] = [], authFailed = false): AIAnalysisResponse {
    const errorDetail = errors.length > 0
      ? ` التفاصيل: ${errors.slice(0, 2).join(' | ')}`
      : '';
    const content = authFailed
      ? `⚠️ مفتاح OpenRouter API غير صالح أو منتهي (401/403). تحقق من OPENROUTER_API_KEY في Railway.${errorDetail}`
      : `⚠️ مفتاح OpenRouter API غير مكوّن. احصل على مفتاح مجاني من openrouter.ai/keys واضبط OPENROUTER_API_KEY في Railway.${errorDetail}`;
    return {
      model: 'OpenRouter/Unavailable',
      content,
      confidence: 0,
      processingTimeMs: 0,
      language: (request as AIAnalysisRequest).language || 'ar',
    };
  }
}
