import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { calculateConfidence } from './confidence.util';

export interface AIAnalysisRequest {
  symbol?: string;
  prompt: string;
  type: 'market_analysis' | 'sentiment' | 'prediction' | 'general' | 'signal_generation' | 'risk_analysis';
  language?: string; // 'ar' | 'en' | 'es'
}

export interface AIAnalysisResponse {
  model: string;
  content: string;
  confidence: number;
  processingTimeMs: number;
  language: string;
  isFallback?: boolean;
}

/**
 * Groq Service — Ultra-fast AI inference via Llama 3
 * Best for: Real-time translation, sentiment analysis, speed-critical tasks
 */
@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);
  private apiKey: string; // FIX: Not readonly — allows on-demand key resolution
  private readonly baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  // FIX: Model fallback chain — llama-3.3-70b hits daily limits fast.
  // Try multiple models in order: fast → capable → lightweight
  private readonly modelCandidates = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',     // Higher daily limits, very fast
    'llama3-70b-8192',
    'mixtral-8x7b-32768',
    'llama3-8b-8192',
    'gemma2-9b-it',              // Google Gemma 2, good multilingual
  ];
  private resolvedModel: string | null = null; // Cached after first successful call

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this._resolveApiKey();
    if (this.apiKey) {
      this.logger.log('⚡ Groq Service initialized (Llama 3.3 70B)');
    } else {
      this.logger.warn('⚠️ GROQ_API_KEY not set (will re-check on each call)');
    }
  }

  /**
   * FIX: Resolve API key from multiple sources — same pattern as DeepSeek/OpenRouter services.
   * ConfigService.get() may return empty during construction on Railway/cloud.
   */
  private _resolveApiKey(): string {
    const env = process.env as Record<string, string | undefined>;
    return (
      this.configService.get<string>('GROQ_API_KEY', '')?.trim() ||
      env['GROQ_API_KEY']?.trim() ||
      ''
    );
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // FIX: Re-resolve key on every call — ConfigService may load keys after construction
    if (!this.apiKey) {
      const resolved = this._resolveApiKey();
      if (resolved) {
        this.apiKey = resolved;
        this.logger.log('⚡ Groq key resolved on-demand');
      }
    }
    if (!this.apiKey) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    // FIX: Try multiple models — if one hits rate limit, try the next
    const modelsToTry = this.resolvedModel ? [this.resolvedModel] : this.modelCandidates;

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

        const content = response.data.choices?.[0]?.message?.content || '';

        // Success — cache this model name for future calls
        if (!this.resolvedModel) {
          this.resolvedModel = model;
          this.logger.log(`⚡ Groq model resolved: ${model}`);
        }

        return {
          model: `Groq/${model}`,
          content,
          confidence: calculateConfidence(content, 'groq'),
          processingTimeMs: Date.now() - startTime,
          language: request.language || 'ar',
        };
      } catch (error: any) {
        const status = error.response?.status;
        const errData = error.response?.data;
        
        if (status === 429) {
          // Rate limited on this model — try next model
          this.logger.warn(`⚡ Groq model ${model} rate limited (429) — trying next model...`);
          if (!this.resolvedModel) continue; // Try next model candidate
          // If resolved model got rate-limited, throw for circuit breaker
          this.logger.warn(`Groq resolved model ${model} rate limited (429) — throwing for circuit breaker`);
          throw error;
        }
        if (status === 401 || status === 403) {
          // Auth error — no point trying other models with same key
          this.logger.error(`Groq auth failed (${status}) — API key may be invalid`);
          return this._stubResponse(request);
        }
        this.logger.warn(`Groq model ${model} failed: ${error.message} (status: ${status})`);
        if (!this.resolvedModel) continue; // Try next model
        return this._stubResponse(request);
      }
    }

    // All models failed
    this.logger.warn(`⚡ All Groq models failed — returning stub`);
    return this._stubResponse(request);
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a financial analysis AI specializing in ${request.type}. Respond in ${lang}. Be concise, data-driven, and professional. Always include risk disclaimers.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: `Groq/${this.modelCandidates[0]}`,
      content: `⚠️ Groq API key not configured. Analysis for "${request.prompt}" would be generated here.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
