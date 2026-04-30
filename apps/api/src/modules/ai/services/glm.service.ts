import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import * as crypto from 'crypto';
import { calculateConfidence } from './confidence.util';

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
    this.apiKey = this.configService.get<string>('GLM_API_KEY', '')?.trim() || '';
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

    try {
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
            Authorization: `Bearer ${this._generateJwt()}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        },
      );

      const content = response.data.choices?.[0]?.message?.content || '';

      return {
        model: `GLM-4/${this.model}`,
        content,
        confidence: calculateConfidence(content, 'glm'),
        processingTimeMs: Date.now() - startTime,
        language: request.language || 'ar',
      };
    } catch (error: any) {
      // FIX: Throw 429 errors so the orchestrator's circuit breaker can track them.
      const status = error.response?.status;
      if (status === 429) {
        this.logger.warn(`GLM rate limited (429) — throwing for circuit breaker`);
        throw error;
      }
      this.logger.warn(`GLM inference failed: ${error.message} (status: ${status})`);
      return this._stubResponse(request);
    }
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    return `أنت محلل مالي ذكي متخصص في ${request.type === 'sentiment' ? 'تحليل المشاعر المالية' : request.type === 'market_analysis' ? 'تحليل الأسواق' : 'التحليل المالي العام'}. 
أجب باللغة العربية. كن دقيقاً ومهنياً. استخدم بيانات السوق عند الإمكان. 
أضف دائماً تنبيه المخاطر: "هذا التحليل لأغراض تعليمية فقط وليس نصيحة استثمارية."`;
  }

  /**
   * Generate JWT token for Zhipu AI GLM-4 API authentication.
   * The Zhipu API requires a JWT token derived from the API key,
   * not a raw Bearer token. The API key format is: "{id}.{secret}"
   * The JWT uses HS256 with the secret, and includes id as 'api_key'.
   */
  private _generateJwt(): string {
    const parts = this.apiKey.split('.');
    if (parts.length !== 2) {
      // If the key is not in id.secret format, use it as-is (backward compat)
      this.logger.warn('GLM_API_KEY is not in expected id.secret format — using as raw Bearer token');
      return this.apiKey;
    }

    const [id, secret] = parts;
    const now = Date.now();
    const exp = now + 3600 * 1000; // 1 hour expiry

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' }), 'utf8').toString('base64url');
    const payload = Buffer.from(JSON.stringify({ api_key: id, exp: Math.floor(exp / 1000), timestamp: Math.floor(now / 1000) }), 'utf8').toString('base64url');

    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
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
