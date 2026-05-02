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
 * Env var: OPENROUTER_API_KEY
 *
 * Best for: Cross-model consensus, diverse perspectives, free-tier availability
 */
@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);
  private apiKey: string; // FIX: Not readonly — allows on-demand key resolution
  private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  // Model candidates — free models first, then low-cost models
  // FIX: Updated May 2025 — some free models have been removed by OpenRouter.
  // Added currently available free models with better rate limits.
  private readonly modelCandidates = [
    'qwen/qwen-2.5-7b-instruct:free',          // Free — good Arabic + reasoning
    'meta-llama/llama-3.1-8b-instruct:free',    // Free — fast, capable
    'google/gemma-2-9b-it:free',                // Free — good multilingual
    'mistralai/mistral-7b-instruct:free',        // Free — fast, diverse
    'huggingfaceh4/zephyr-7b-beta:free',         // Free — chat-optimized
    'deepseek/deepseek-chat',                    // Low cost — excellent reasoning
    'qwen/qwen-2.5-72b-instruct',               // Low cost — top-tier reasoning
  ];

  private resolvedModel: string | null = null;

  constructor(private readonly configService: ConfigService) {
    // FIX: Read key from ConfigService FIRST, then fall back to process.env directly.
    // This handles cases where NestJS ConfigModule may not have loaded the env var
    // during service construction, but it's available in the process environment.
    const configKey = this.configService.get<string>('OPENROUTER_API_KEY', '')?.trim() || '';
    const envKey = (process.env as Record<string, string | undefined>)['OPENROUTER_API_KEY']?.trim() || '';
    this.apiKey = configKey || envKey;
    if (this.apiKey) {
      this.logger.log(`🔀 OpenRouter Service initialized — key: ${this.apiKey.substring(0, 4)}***${this.apiKey.length > 8 ? this.apiKey.substring(this.apiKey.length - 4) : ''} (${this.apiKey.length} chars, source: ${configKey ? 'ConfigService' : 'process.env'})`);
    } else {
      this.logger.warn('⚠️ OPENROUTER_API_KEY not set or empty (checked both ConfigService and process.env)');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // FIX: Re-check key on every call — ConfigService may have loaded it after construction
    if (!this.apiKey) {
      const envKey = (process.env as Record<string, string | undefined>)['OPENROUTER_API_KEY']?.trim() || '';
      const configKey = this.configService.get<string>('OPENROUTER_API_KEY', '')?.trim() || '';
      const resolvedKey = configKey || envKey;
      if (resolvedKey) {
        this.apiKey = resolvedKey;
        this.logger.log(`🔀 OpenRouter key resolved on-demand (source: ${configKey ? 'ConfigService' : 'process.env'})`);
      }
    }
    if (!this.apiKey) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    // Try resolved model first, then all candidates
    const modelsToTry = this.resolvedModel ? [this.resolvedModel, ...this.modelCandidates.filter(m => m !== this.resolvedModel)] : this.modelCandidates;

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
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 150) : '';

        if (status === 429) {
          this.logger.warn(`🔀 OpenRouter ${model} rate limited (429) — trying next model...`);
          if (this.resolvedModel === model) {
            this.resolvedModel = null; // Reset resolved model
          }
          continue; // Try next model
        }
        if (status === 401 || status === 403) {
          this.logger.error(`❌ OpenRouter auth failed (${status}) — API key may be invalid. Key starts with: ${this.apiKey.substring(0, 4)}***`);
          return this._stubResponse(request, true);
        }
        if (status === 402) {
          this.logger.warn(`💸 OpenRouter ${model} requires payment (402) — trying free model...`);
          continue;
        }
        this.logger.warn(`🔀 OpenRouter ${model} failed (${status || 'N/A'}): ${errData || error.message}`);
        continue;
      }
    }

    this.logger.warn(`🔀 All OpenRouter models failed — returning stub`);
    return this._stubResponse(request);
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a professional financial AI analyst specializing in ${request.type}. You provide a unique perspective by looking for divergences, contrarian signals, and cross-model validation. Respond in ${lang}. Be concise, data-driven, and professional. Always include risk disclaimers.`;
  }

  private _stubResponse(request: AIAnalysisResponse | AIAnalysisRequest, authFailed = false): AIAnalysisResponse {
    const content = authFailed
      ? `⚠️ OpenRouter API key is invalid or expired (401/403). Please check your OPENROUTER_API_KEY in Railway and make sure it's a valid key from openrouter.ai/keys.`
      : `⚠️ OpenRouter API key not configured. Get a free key at openrouter.ai/keys and set OPENROUTER_API_KEY in Railway.`;
    return {
      model: 'OpenRouter/Unavailable',
      content,
      confidence: 0,
      processingTimeMs: 0,
      language: (request as AIAnalysisRequest).language || 'ar',
    };
  }
}
