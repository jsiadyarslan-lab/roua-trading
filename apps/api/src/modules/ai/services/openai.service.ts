import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';

/**
 * OpenAI Service — GPT-4o via OpenAI API
 * Best for: Versatile analysis, nuanced market interpretation, structured output generation
 * Strong at: Multi-asset analysis, macroeconomic synthesis, portfolio strategy
 */
@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openai.com/v1/chat/completions';
  private readonly model = 'gpt-4o';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (this.apiKey) {
      this.logger.log('🤖 OpenAI Service initialized (GPT-4o)');
    } else {
      this.logger.warn('⚠️ OPENAI_API_KEY not set');
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
        max_tokens: 2048,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const content = response.data.choices?.[0]?.message?.content || '';

    return {
      model: `OpenAI/${this.model}`,
      content,
      confidence: 0.92,
      processingTimeMs: Date.now() - startTime,
      language: request.language || 'ar',
    };
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are an expert financial analyst AI specializing in ${request.type}. 
Respond in ${lang}. Provide comprehensive, nuanced analysis considering multiple perspectives.
Consider macroeconomic factors, cross-asset correlations, and market microstructure.
Structure your response with clear sections. Always include risk disclaimers.
If analyzing a specific asset, provide both bull and bear cases with probability estimates.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: `OpenAI/${this.model}`,
      content: `⚠️ مفتاح OpenAI API غير مكوّن. التحليل متعدد الأصول سيظهر هنا عند تفعيل الخدمة.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
