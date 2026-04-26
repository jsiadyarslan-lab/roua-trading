import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';

/**
 * Claude Service — Anthropic (Claude 3.5 Sonnet)
 * Best for: Critical risk analysis, regulatory interpretation, nuanced ethical assessment
 * Strong at: Long-context analysis (200k tokens), safety-critical reasoning, compliance review
 */
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.anthropic.com/v1/messages';
  private readonly model = 'claude-3-5-sonnet-20241022';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ANTHROPIC_API_KEY', '');
    if (this.apiKey) {
      this.logger.log('🛡️ Claude Service initialized (Claude 3.5 Sonnet)');
    } else {
      this.logger.warn('⚠️ ANTHROPIC_API_KEY not set');
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
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: request.prompt },
        ],
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const content = response.data.content?.[0]?.text || '';

    return {
      model: `Claude/${this.model}`,
      content,
      confidence: 0.9,
      processingTimeMs: Date.now() - startTime,
      language: request.language || 'ar',
    };
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a safety-focused financial AI analyst specializing in ${request.type}. 
Respond in ${lang}. Provide thorough, cautious analysis with emphasis on risk factors and edge cases.
Pay special attention to regulatory implications, compliance requirements, and ethical considerations.
Always highlight potential downsides and worst-case scenarios alongside opportunities.
Include clear risk disclaimers and emphasize that this is not financial advice.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: `Claude/${this.model}`,
      content: `⚠️ مفتاح Anthropic API غير مكوّن. تحليل المخاطر المتقدم سيظهر هنا عند تفعيل الخدمة.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
