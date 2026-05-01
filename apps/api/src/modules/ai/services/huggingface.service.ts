import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';

/**
 * HuggingFace Inference Service — Free/Open-Source AI Models
 *
 * Uses HUGGINGFACE_API_KEY or HF_API_KEY (Railway variable name)
 *
 * FIX: HuggingFace migrated their Inference API to a new URL format:
 *   OLD (dead): https://api-inference.huggingface.co/models/{model}
 *   NEW:        https://router.huggingface.co/hf-inference/v1/chat/completions
 *
 * The new API uses OpenAI-compatible format (chat/completions), so we no
 * longer need per-model prompt formatting — we send messages[] instead.
 *
 * Available models (free serverless inference):
 * - Qwen2.5-72B-Instruct — Strong reasoning, excellent Arabic support
 * - Mistral-7B-Instruct-v0.3 — Fast, multilingual
 * - Zephyr-7B-Beta — Chat-optimized, reliable
 * - Phi-3-mini-4k-instruct — Lightweight, efficient
 * - Gemma-2-2b-it — Google's small model, reliable
 *
 * Best for: Free multilingual analysis, translation, diverse open-source models
 * No additional cost — HuggingFace Serverless Inference API is free tier
 */
@Injectable()
export class HuggingFaceService {
  private readonly logger = new Logger(HuggingFaceService.name);
  private readonly apiKey: string;

  // FIX: New HuggingFace Inference API URL (OpenAI-compatible format)
  private readonly baseUrl = 'https://router.huggingface.co/hf-inference/v1/chat/completions';

  // Model candidates — ordered by reliability on free serverless tier
  // Qwen2.5-72B has excellent Arabic support and is very reliable on HF free tier
  private readonly modelCandidates = [
    'Qwen/Qwen2.5-72B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.3',
    'HuggingFaceH4/zephyr-7b-beta',
    'microsoft/Phi-3-mini-4k-instruct',
    'google/gemma-2-2b-it',
  ];

  // Cache the working model after first successful call
  private resolvedModel: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY', '')?.trim() || this.configService.get<string>('HF_API_KEY', '')?.trim() || '';
    if (this.apiKey) {
      this.logger.log('🤗 HuggingFace Service initialized (Qwen2.5-72B + Mistral-7B + Zephyr + Phi-3 + Gemma-2)');
    } else {
      this.logger.warn('⚠️ HUGGINGFACE_API_KEY / HF_API_KEY not set');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.apiKey) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    // Use resolved model if available, otherwise try all candidates
    const models = this.resolvedModel ? [this.resolvedModel] : this.modelCandidates;

    for (const model of models) {
      try {
        // FIX: Use new OpenAI-compatible chat/completions format
        const response = await axios.post(
          this.baseUrl,
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: request.prompt },
            ],
            max_tokens: 1024,
            temperature: 0.3,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000, // 60s — HF serverless can be slow on cold start
          },
        );

        // OpenAI-compatible response format
        const content = response.data?.choices?.[0]?.message?.content || '';

        if (content.trim().length > 0) {
          // Cache the working model for future calls
          if (!this.resolvedModel) {
            this.resolvedModel = model;
            this.logger.log(`🤗 HuggingFace model resolved: ${model}`);
          }

          const modelShort = model.split('/').pop() || model;
          return {
            model: `HuggingFace/${modelShort}`,
            content: content.trim(),
            confidence: calculateConfidence(content, 'huggingface'),
            processingTimeMs: Date.now() - startTime,
            language: request.language || 'ar',
          };
        }

        // Empty content — try next model
        this.logger.warn(`🤗 HuggingFace model ${model} returned empty content — trying next...`);
      } catch (error: any) {
        const modelShort = model.split('/').pop();
        const status = error.response?.status;
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 300) : '';

        if (status === 429) {
          this.logger.warn(`🚫 HuggingFace model ${modelShort} rate limited (429) — throwing for circuit breaker`);
          throw error;
        }

        if (status === 401) {
          this.logger.error(`❌ HuggingFace API key invalid (401) — skipping all models. ${errData}`);
          break; // No point trying other models with same invalid key
        }

        if (status === 503) {
          this.logger.warn(`⏳ HuggingFace model ${modelShort} is loading (503) — trying next model...`);
        } else if (status === 404) {
          this.logger.warn(`🔍 HuggingFace model ${modelShort} not found (404) — may not be available on serverless. Trying next...`);
        } else if (status === 422) {
          this.logger.warn(`⚠️ HuggingFace model ${modelShort} format error (422): ${errData} — trying next...`);
        } else {
          this.logger.warn(`⚠️ HuggingFace model ${modelShort} failed (${status || 'N/A'}): ${errData || error.message} — trying next`);
        }
        continue;
      }
    }

    // All models failed — reset resolved model so next call tries all candidates again
    this.resolvedModel = null;
    this.logger.warn(`🤗 All HuggingFace models failed — returning stub`);
    return this._stubResponse(request);
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a professional financial AI analyst specializing in ${request.type}. Respond in ${lang}. Be concise, data-driven, and professional. Provide clear analysis with actionable insights. Always include risk disclaimers.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: 'HuggingFace/Qwen2.5-72B',
      content: `⚠️ خدمة HuggingFace غير متاحة حالياً. النماذج المفتوحة المصدر (Qwen2.5, Mistral, Zephyr, Phi-3, Gemma) ستكون متاحة عند استعادة الخدمة — مجاني بالكامل.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
