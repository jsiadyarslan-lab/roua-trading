import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';

/**
 * HuggingFace Inference Service — Free/Open-Source AI Models
 * 
 * Uses HUGGINGFACE_API_KEY (same key already used by EmbeddingService)
 * 
 * Available models (free inference API):
 * - Mistral-7B-Instruct — Fast, multilingual, great for analysis
 * - Phi-3-mini — Lightweight, efficient for quick tasks
 * - Llama-3.1-8B-Instruct — Strong reasoning, versatile
 * 
 * Best for: Free multilingual analysis, translation, diverse open-source models
 * No additional cost — HuggingFace Inference API is free tier
 */
@Injectable()
export class HuggingFaceService {
  private readonly logger = new Logger(HuggingFaceService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api-inference.huggingface.co/models/';
  
  // Primary model for text generation (free, fast, multilingual)
  private readonly primaryModel = 'mistralai/Mistral-7B-Instruct-v0.3';
  // Fallback models
  private readonly fallbackModels = [
    'microsoft/Phi-3-mini-4k-instruct',
    'meta-llama/Meta-Llama-3.1-8B-Instruct',
  ];

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY', '');
    if (this.apiKey) {
      this.logger.log('🤗 HuggingFace Service initialized (Mistral-7B + Phi-3 + Llama-3)');
    } else {
      this.logger.warn('⚠️ HUGGINGFACE_API_KEY not set');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.apiKey) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);
    const fullPrompt = `<s>[INST] ${systemPrompt}\n\n${request.prompt} [/INST]`;

    // Try primary model first, then fallbacks
    const models = [this.primaryModel, ...this.fallbackModels];
    
    for (const model of models) {
      try {
        const response = await axios.post(
          `${this.baseUrl}${model}`,
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

        // HuggingFace returns array of generated text
        let content = '';
        if (Array.isArray(response.data) && response.data.length > 0) {
          content = response.data[0].generated_text || '';
        } else if (typeof response.data === 'string') {
          content = response.data;
        }

        // Clean up the response
        content = content.replace(/\[\/INST\]/g, '').trim();

        if (content.length > 10) {
          const modelShort = model.split('/').pop() || model;
          return {
            model: `HuggingFace/${modelShort}`,
            content,
            confidence: this._calculateConfidence(content, 'huggingface'),
            processingTimeMs: Date.now() - startTime,
            language: request.language || 'ar',
          };
        }
      } catch (error: any) {
        const modelShort = model.split('/').pop();
        this.logger.warn(`⚠️ HuggingFace model ${modelShort} failed: ${error.message} — trying next`);
        continue;
      }
    }

    // All models failed
    return this._stubResponse(request);
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a professional financial AI analyst specializing in ${request.type}. Respond in ${lang}. Be concise, data-driven, and professional. Provide clear analysis with actionable insights. Always include risk disclaimers.`;
  }

  private _calculateConfidence(content: string, model: string): number {
    let confidence = 0.5; // base

    // Length bonus: longer analysis = more confident (capped)
    if (content.length > 200) confidence += 0.1;
    if (content.length > 500) confidence += 0.1;
    if (content.length > 1000) confidence += 0.05;

    // Clear recommendation bonus
    const hasRecommendation = /شراء|بيع|انتظار|BUY|SELL|HOLD|صعود|هبوط/i.test(content);
    if (hasRecommendation) confidence += 0.15;

    // Model base confidence
    const modelBase: Record<string, number> = {
      'gemini': 0.05,
      'groq': 0.0,
      'glm': 0.02,
      'huggingface': -0.05,
      'ollama': 0.0,
      'bedrock': 0.08,
    };
    confidence += modelBase[model] || 0;

    return Math.min(Math.max(confidence, 0.1), 0.95); // Clamp 0.1-0.95
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: 'HuggingFace/Mistral-7B',
      content: `⚠️ مفتاح HuggingFace API غير مكوّن. النماذج المفتوحة المصدر (Mistral, Phi-3, Llama) ستكون متاحة عند تفعيل الخدمة — مجاني بالكامل.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
