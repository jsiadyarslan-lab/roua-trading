import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';

/**
 * Gemini Service — Google AI Studio (Gemini 2.5 Pro)
 * Best for: Creative analysis, complex reasoning, multi-modal understanding
 * Strong at: Pattern recognition, strategic thinking, narrative generation
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  private readonly model = 'gemini-2.0-flash';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_AI_STUDIO_API_KEY', '');
    if (this.apiKey) {
      this.logger.log('💎 Gemini Service initialized (2.0 Flash)');
    } else {
      this.logger.warn('⚠️ GOOGLE_AI_STUDIO_API_KEY not set');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.apiKey) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    const url = `${this.baseUrl}/${this.model}:generateContent`;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${request.prompt}` }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        timeout: 60000,
      },
    );

    const content =
      response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      model: `Gemini/${this.model}`,
      content,
      confidence: this._calculateConfidence(content, 'gemini'),
      processingTimeMs: Date.now() - startTime,
      language: request.language || 'ar',
    };
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a sophisticated financial AI analyst specializing in ${request.type}. 
Respond in ${lang}. Provide deep, creative analysis with strategic insights.
Structure your response clearly. Always include risk disclaimers.
If analyzing a specific asset, consider both bullish and bearish scenarios.`;
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
      model: `Gemini/${this.model}`,
      content: `⚠️ مفتاح Google AI Studio غير مكوّن. التحليل الإبداعي سيظهر هنا عند تفعيل الخدمة.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
