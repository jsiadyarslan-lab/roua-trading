import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';

/**
 * DeepSeek Service — DeepSeek AI (DeepSeek-V3)
 * Best for: Deep financial reasoning, complex multi-step analysis, quantitative modeling
 * Specialized in mathematical and logical reasoning for trading strategies
 */
@Injectable()
export class DeepSeekService {
  private readonly logger = new Logger(DeepSeekService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.deepseek.com/v1/chat/completions';
  private readonly model = 'deepseek-chat';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('DEEPSEEK_API_KEY', '');
    if (this.apiKey) {
      this.logger.log('🔬 DeepSeek Service initialized (DeepSeek-V3)');
    } else {
      this.logger.warn('⚠️ DEEPSEEK_API_KEY not set');
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
      model: `DeepSeek/${this.model}`,
      content,
      confidence: 0.88,
      processingTimeMs: Date.now() - startTime,
      language: request.language || 'ar',
    };
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a quantitative financial AI specializing in deep reasoning and ${request.type}. 
Respond in ${lang}. Think step-by-step. Provide data-driven analysis with clear logical chains.
Focus on mathematical models, statistical evidence, and quantifiable metrics.
Always include risk disclaimers and confidence intervals when possible.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: `DeepSeek/${this.model}`,
      content: `⚠️ مفتاح DeepSeek API غير مكوّن. التحليل الكمّي العميق سيظهر هنا عند تفعيل الخدمة.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
