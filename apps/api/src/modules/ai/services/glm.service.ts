import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';

/**
 * GLM Service — Zhipu AI (GLM-4)
 * Best for: Arabic financial analysis, long-context understanding (200k tokens)
 * Specialized in Chinese and Arabic financial markets
 */
@Injectable()
export class GlmService {
  private readonly logger = new Logger(GlmService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  private readonly model = 'glm-4';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GLM_API_KEY', '');
    if (this.apiKey) {
      this.logger.log('🧠 GLM-4 Service initialized (Zhipu AI)');
    } else {
      this.logger.warn('⚠️ GLM_API_KEY not set');
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
        temperature: 0.4,
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
      model: `GLM-4/${this.model}`,
      content,
      confidence: 0.85,
      processingTimeMs: Date.now() - startTime,
      language: request.language || 'ar',
    };
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    return `أنت محلل مالي ذكي متخصص في ${request.type === 'sentiment' ? 'تحليل المشاعر المالية' : request.type === 'market_analysis' ? 'تحليل الأسواق' : 'التحليل المالي العام'}. 
أجب باللغة العربية. كن دقيقاً ومهنياً. استخدم بيانات السوق عند الإمكان. 
أضف دائماً تنبيه المخاطر: "هذا التحليل لأغراض تعليمية فقط وليس نصيحة استثمارية."`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: `GLM-4/${this.model}`,
      content: `⚠️ مفتاح GLM API غير مكوّن. التحليل سيظهر هنا عند تفعيل الخدمة.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
