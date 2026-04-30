import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';

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
    this.apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY', '')?.trim() || '';
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

    // Try primary model first, then fallbacks
    const models = [this.primaryModel, ...this.fallbackModels];
    
    for (const model of models) {
      try {
        // Use model-appropriate prompt format for each model
        const fullPrompt = this._formatPrompt(model, systemPrompt, request.prompt);

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
            timeout: 45000, // Reduced from 60s — free tier is slow but shouldn't hang
          },
        );

        // HuggingFace returns array of generated text
        let content = '';
        if (Array.isArray(response.data) && response.data.length > 0) {
          content = response.data[0].generated_text || '';
        } else if (typeof response.data === 'string') {
          content = response.data;
        }

        // Handle "model loading" response from HuggingFace free tier
        if (!content && response.data?.estimated_time) {
          const waitTime = Math.ceil(response.data.estimated_time);
          this.logger.warn(`⏳ HuggingFace model ${model.split('/').pop()} is loading — estimated ${waitTime}s. Trying next model...`);
          continue;
        }

        // Clean up the response
        content = content.replace(/\[\/INST\]/g, '').trim();

        if (content.length > 10) {
          const modelShort = model.split('/').pop() || model;
          return {
            model: `HuggingFace/${modelShort}`,
            content,
            confidence: calculateConfidence(content, 'huggingface'),
            processingTimeMs: Date.now() - startTime,
            language: request.language || 'ar',
          };
        }
      } catch (error: any) {
        const modelShort = model.split('/').pop();
        const status = error.response?.status;
        
        // Handle specific HuggingFace error codes
        if (status === 503) {
          this.logger.warn(`⏳ HuggingFace model ${modelShort} is loading (503) — trying next model...`);
        } else if (status === 429) {
          this.logger.warn(`🚫 HuggingFace model ${modelShort} rate limited (429) — trying next model...`);
        } else if (status === 401) {
          this.logger.error(`❌ HuggingFace API key invalid (401) — skipping all models`);
          break; // No point trying other models with same invalid key
        } else {
          this.logger.warn(`⚠️ HuggingFace model ${modelShort} failed: ${error.message} — trying next`);
        }
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

  /**
   * Format the prompt according to the model's expected template.
   * Mistral uses <s>[INST]...[/INST]
   * Phi-3 uses <|user|>...<|end|><|assistant|>
   * Llama-3.1 uses <|begin_of_text|><|start_header_id|>user<|end_header_id|>...<|eot_id|>
   */
  private _formatPrompt(model: string, systemPrompt: string, userPrompt: string): string {
    if (model.includes('Phi-3')) {
      // Phi-3 format
      return `<|system|>\n${systemPrompt}<|end|>\n<|user|>\n${userPrompt}<|end|>\n<|assistant|>\n`;
    }
    if (model.includes('Llama-3')) {
      // Llama-3.1 format
      return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n${userPrompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;
    }
    // Default: Mistral format
    return `<s>[INST] ${systemPrompt}\n\n${userPrompt} [/INST]`;
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
