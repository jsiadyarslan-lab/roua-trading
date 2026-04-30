import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';

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
  // FIX: Model fallback chain — try multiple model names since availability
  // varies by API key age, region, and Google's deprecation schedule.
  private readonly modelCandidates = [
    'gemini-2.5-flash',
    'gemini-2.0-flash-001',
    'gemini-1.5-flash',
    'gemini-2.0-flash-lite',
  ];
  private resolvedModel: string | null = null; // Cached after first successful call

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_AI_STUDIO_API_KEY', '')?.trim() || '';
    if (this.apiKey) {
      this.logger.log(`💎 Gemini Service initialized (trying: ${this.modelCandidates.join(' → ')})`);
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

    // If we already know which model works, use it directly
    const modelsToTry = this.resolvedModel
      ? [this.resolvedModel]
      : this.modelCandidates;

    // FIX: Use header-based auth instead of query param to prevent API key leakage
    for (const model of modelsToTry) {
      const url = `${this.baseUrl}/${model}:generateContent`;

      try {
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

      // Success — cache this model name for future calls
      if (!this.resolvedModel) {
        this.resolvedModel = model;
        this.logger.log(`💎 Gemini model resolved: ${model}`);
      }

      return {
        model: `Gemini/${model}`,
        content,
        confidence: calculateConfidence(content, 'gemini'),
        processingTimeMs: Date.now() - startTime,
        language: request.language || 'ar',
      };
    } catch (error: any) {
      const status = error.response?.status;
      const errData = error.response?.data;
      // FIX: Throw 429 errors so the orchestrator's circuit breaker can track them.
      if (status === 429) {
        this.logger.warn(`Gemini rate limited (429) — throwing for circuit breaker`);
        throw error;
      }
      // 404 = model not available, try next model in chain
      if (status === 404) {
        this.logger.warn(`💎 Gemini model ${model} not available (404) — trying next...`);
        continue; // Try next model
      }
      if (status === 401 || status === 403) {
        this.logger.error(`Gemini auth failed (${status}) — API key may be invalid. Response: ${JSON.stringify(errData)?.substring(0, 200)}`);
        return this._stubResponse(request); // Auth error won't change with different model
      }
      this.logger.warn(`Gemini inference failed with ${model}: ${error.message} (status: ${status})`);
      continue; // Try next model for other errors
    }
    }

    // All models failed
    this.logger.warn(`💎 All Gemini models failed — returning stub`);
    return this._stubResponse(request);
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a sophisticated financial AI analyst specializing in ${request.type}. 
Respond in ${lang}. Provide deep, creative analysis with strategic insights.
Structure your response clearly. Always include risk disclaimers.
If analyzing a specific asset, consider both bullish and bearish scenarios.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: 'Gemini/unavailable',
      content: `⚠️ مفتاح Google AI Studio غير مكوّن أو جميع نماذج Gemini غير متاحة. التحليل الإبداعي سيظهر هنا عند تفعيل الخدمة.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
