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
 * FIX: HuggingFace has TWO Inference API formats:
 *   1. Chat/Completions: router.huggingface.co/hf-inference/v1/chat/completions
 *      (OpenAI-compatible, requires "serverless inference" enabled on account)
 *   2. Direct model:     router.huggingface.co/hf-inference/models/{model}
 *      (Legacy format, works with ALL HF accounts including free tier)
 *
 * We try Method 1 first (better response format), then fall back to Method 2.
 *
 * Best for: Free multilingual analysis, translation, diverse open-source models
 * No additional cost — HuggingFace Inference API is free tier
 */
@Injectable()
export class HuggingFaceService {
  private readonly logger = new Logger(HuggingFaceService.name);
  private readonly apiKey: string;

  // API endpoint bases — try chat/completions first, then direct model
  private readonly chatBaseUrl = 'https://router.huggingface.co/hf-inference/v1/chat/completions';
  private readonly modelBaseUrl = 'https://router.huggingface.co/hf-inference/models/';

  // Model candidates — ordered by reliability on free tier
  private readonly modelCandidates = [
    'Qwen/Qwen2.5-72B-Instruct',         // Best reasoning + Arabic support
    'Qwen/Qwen2.5-7B-Instruct',          // Faster, lighter alternative
    'mistralai/Mistral-7B-Instruct-v0.3', // Fast, multilingual
    'HuggingFaceH4/zephyr-7b-beta',       // Chat-optimized, reliable
    'microsoft/Phi-3-mini-4k-instruct',   // Lightweight, efficient
  ];

  // Cache the working model and API method after first successful call
  private resolvedModel: string | null = null;
  private resolvedMethod: 'chat' | 'direct' | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY', '')?.trim() || this.configService.get<string>('HF_API_KEY', '')?.trim() || '';
    if (this.apiKey) {
      this.logger.log('🤗 HuggingFace Service initialized (Qwen2.5 + Mistral + Zephyr + Phi-3)');
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

    // If we've resolved a working model+method before, use it directly
    if (this.resolvedModel && this.resolvedMethod) {
      try {
        const result = await this._callWithMethod(this.resolvedMethod, this.resolvedModel, systemPrompt, request.prompt, startTime);
        if (result) return result;
      } catch (error: any) {
        // Resolved model/method failed — reset and try all
        this.logger.warn(`🤗 Resolved model ${this.resolvedModel} failed — resetting`);
        this.resolvedModel = null;
        this.resolvedMethod = null;
      }
    }

    let lastModelError = '';

    // Try each model with each method
    for (const model of this.modelCandidates) {
      // Method 1: Chat/Completions (OpenAI-compatible, preferred)
      try {
        const result = await this._callChatCompletions(model, systemPrompt, request.prompt, startTime);
        if (result) {
          this.resolvedModel = model;
          this.resolvedMethod = 'chat';
          this.logger.log(`🤗 HuggingFace model resolved: ${model} (chat/completions)`);
          return result;
        }
      } catch (error: any) {
        const status = error.response?.status;
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : '';
        lastModelError = `${model} chat (${status || 'N/A'}): ${errData || error.message}`;

        if (status === 429) {
          this.logger.warn(`🚫 HuggingFace model ${model} rate limited (429) — throwing for circuit breaker`);
          throw error;
        }
        if (status === 401) {
          this.logger.error(`❌ HuggingFace API key invalid (401) — skipping all. ${errData}`);
          lastModelError = `API key invalid (401): ${errData}`;
          break; // No point trying other models with same invalid key
        }
        // 400 "Model not supported" means chat/completions isn't available for this model/key
        // Try the direct model method instead
        this.logger.debug(`🤗 Chat/completions failed for ${model.split('/').pop()} (${status}) — trying direct model API...`);
      }

      // Method 2: Direct model API (legacy, works with all HF accounts)
      try {
        const result = await this._callDirectModel(model, systemPrompt, request.prompt, startTime);
        if (result) {
          this.resolvedModel = model;
          this.resolvedMethod = 'direct';
          this.logger.log(`🤗 HuggingFace model resolved: ${model} (direct)`);
          return result;
        }
      } catch (error: any) {
        const modelShort = model.split('/').pop();
        const status = error.response?.status;
        const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : '';
        lastModelError = `${modelShort} direct (${status || 'N/A'}): ${errData || error.message}`;

        if (status === 429) {
          this.logger.warn(`🚫 HuggingFace model ${modelShort} rate limited (429) — throwing for circuit breaker`);
          throw error;
        }
        if (status === 401) {
          this.logger.error(`❌ HuggingFace API key invalid (401) — skipping all. ${errData}`);
          break;
        }
        if (status === 503) {
          this.logger.warn(`⏳ HuggingFace model ${modelShort} is loading (503) — trying next model...`);
        } else {
          this.logger.warn(`⚠️ HuggingFace model ${modelShort} direct failed (${status || 'N/A'}): ${errData || error.message}`);
        }
        continue;
      }
    }

    // All models and methods failed
    this.resolvedModel = null;
    this.resolvedMethod = null;
    const lastErr = lastModelError || 'All models returned empty or errors';
    this.logger.warn(`🤗 All HuggingFace models/methods failed — returning stub. Last error: ${lastErr}`);
    return {
      ...this._stubResponse(request),
      content: `⚠️ HuggingFace API error: ${lastErr.substring(0, 250)}`,
    };
  }

  /**
   * Call using the resolved method
   */
  private async _callWithMethod(method: 'chat' | 'direct', model: string, systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    if (method === 'chat') {
      return this._callChatCompletions(model, systemPrompt, userPrompt, startTime);
    } else {
      return this._callDirectModel(model, systemPrompt, userPrompt, startTime);
    }
  }

  /**
   * Method 1: Chat/Completions API (OpenAI-compatible)
   * Preferred — returns structured responses, no prompt formatting needed
   */
  private async _callChatCompletions(model: string, systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    const response = await axios.post(
      this.chatBaseUrl,
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
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    if (content.trim().length > 0) {
      const modelShort = model.split('/').pop() || model;
      return {
        model: `HuggingFace/${modelShort}`,
        content: content.trim(),
        confidence: calculateConfidence(content, 'huggingface'),
        processingTimeMs: Date.now() - startTime,
        language: 'ar',
      };
    }
    return null;
  }

  /**
   * Method 2: Direct Model API (legacy format)
   * Works with ALL HF accounts including those without serverless inference
   * Uses text-generation pipeline format
   */
  private async _callDirectModel(model: string, systemPrompt: string, userPrompt: string, startTime: number): Promise<AIAnalysisResponse | null> {
    // Format the prompt based on the model type
    const fullPrompt = this._formatPrompt(model, systemPrompt, userPrompt);

    const response = await axios.post(
      `${this.modelBaseUrl}${model}`,
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
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    // Handle response format
    let content = '';
    if (Array.isArray(response.data) && response.data.length > 0) {
      content = response.data[0].generated_text || '';
    } else if (typeof response.data === 'string') {
      content = response.data;
    }

    // Handle "model loading" response
    if (!content && response.data?.estimated_time) {
      this.logger.warn(`⏳ HuggingFace model ${model.split('/').pop()} is loading — estimated ${Math.ceil(response.data.estimated_time)}s`);
      return null;
    }

    // Clean up response
    content = content.replace(/\[\/INST\]/g, '').trim();

    if (content.length > 1) {
      const modelShort = model.split('/').pop() || model;
      return {
        model: `HuggingFace/${modelShort}`,
        content,
        confidence: calculateConfidence(content, 'huggingface'),
        processingTimeMs: Date.now() - startTime,
        language: 'ar',
      };
    }
    return null;
  }

  /**
   * Format the prompt according to the model's expected template (for direct API)
   */
  private _formatPrompt(model: string, systemPrompt: string, userPrompt: string): string {
    if (model.includes('Phi-3')) {
      return `<s>user\n${systemPrompt}\n\n${userPrompt}<|end|>\n<|assistant|)\n`;
    }
    if (model.includes('Qwen')) {
      return `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;
    }
    if (model.includes('zephyr')) {
      return `<|system|>\n${systemPrompt}</s>\n<|user|>\n${userPrompt}</s>\n<|assistant|)\n`;
    }
    // Default: Mistral format (works for most models)
    return `<s>[INST] ${systemPrompt}\n\n${userPrompt} [/INST]`;
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a professional financial AI analyst specializing in ${request.type}. Respond in ${lang}. Be concise, data-driven, and professional. Provide clear analysis with actionable insights. Always include risk disclaimers.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: 'HuggingFace/Qwen2.5-72B',
      content: `⚠️ خدمة HuggingFace غير متاحة — مفتاح API لا يدعم Serverless Inference. الحل: 1) اذهب إلى huggingface.co/settings/tokens 2) أنشئ مفتاح جديد بصلاحية "Make calls to the serverless Inference API" 3) حدث HF_API_KEY في Railway.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
