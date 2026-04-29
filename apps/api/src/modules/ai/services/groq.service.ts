import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { calculateConfidence } from './confidence.util';

export interface AIAnalysisRequest {
  symbol?: string;
  prompt: string;
  type: 'market_analysis' | 'sentiment' | 'prediction' | 'general' | 'signal_generation' | 'risk_analysis';
  language?: string; // 'ar' | 'en'
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
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  private readonly model = 'llama-3.3-70b-versatile';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GROQ_API_KEY', '')?.trim() || '';
    if (this.apiKey) {
      this.logger.log('⚡ Groq Service initialized (Llama 3.3 70B)');
    } else {
      this.logger.warn('⚠️ GROQ_API_KEY not set');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.apiKey) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    try {
      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
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

      return {
        model: `Groq/${this.model}`,
        content,
        confidence: calculateConfidence(content, 'groq'),
        processingTimeMs: Date.now() - startTime,
        language: request.language || 'ar',
      };
    } catch (error: any) {
      this.logger.warn(`Groq inference failed: ${error.message}`);
      return this._stubResponse(request);
    }
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a financial analysis AI specializing in ${request.type}. Respond in ${lang}. Be concise, data-driven, and professional. Always include risk disclaimers.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: `Groq/${this.model}`,
      content: `⚠️ Groq API key not configured. Analysis for "${request.prompt}" would be generated here.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
