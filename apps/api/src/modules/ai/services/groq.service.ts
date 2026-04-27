import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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
    this.apiKey = this.configService.get<string>('GROQ_API_KEY', '');
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
      confidence: this._calculateConfidence(content, 'groq'),
      processingTimeMs: Date.now() - startTime,
      language: request.language || 'ar',
    };
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a financial analysis AI specializing in ${request.type}. Respond in ${lang}. Be concise, data-driven, and professional. Always include risk disclaimers.`;
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
      model: `Groq/${this.model}`,
      content: `⚠️ Groq API key not configured. Analysis for "${request.prompt}" would be generated here.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
