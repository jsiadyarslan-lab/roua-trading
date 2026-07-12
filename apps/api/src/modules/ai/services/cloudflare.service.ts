import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { calculateConfidence } from './confidence.util';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';

/**
 * Cloudflare Workers AI Service
 * Model: @cf/meta/llama-3.3-70b-instruct-fp8-fast
 * Free tier: 10,000 neurons/day
 * Best for: Fallback when all other providers fail
 */
@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);
  private apiKey: string;
  private accountId: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this._resolveApiKey();
    this.accountId = this._resolveAccountId();
    this.model = this.configService.get<string>('CLOUDFLARE_MODEL', '')?.trim() || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    if (this.apiKey && this.accountId) {
      this.logger.log('☁️ Cloudflare Workers AI Service initialized (Llama 3.3 70B)');
    } else {
      this.logger.warn('⚠️ CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set');
    }
  }

  private _resolveApiKey(): string {
    return (
      this.configService.get<string>('CLOUDFLARE_API_TOKEN', '')?.trim() ||
      (process.env.CLOUDFLARE_API_TOKEN || '').trim() ||
      ''
    );
  }

  private _resolveAccountId(): string {
    return (
      this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID', '')?.trim() ||
      (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim() ||
      ''
    );
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // Re-resolve keys on every call
    if (!this.apiKey) {
      const resolved = this._resolveApiKey();
      if (resolved) this.apiKey = resolved;
    }
    if (!this.accountId) {
      const resolved = this._resolveAccountId();
      if (resolved) this.accountId = resolved;
    }

    // V584: Cloudflare يمكن العمل بـ API token فقط (دون account ID)
    // لو لا account ID، نستخدم endpoint بديل
    if (!this.apiKey) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    // V584: لو لا account ID، نستخدم Workers AI endpoint العام
    const baseUrl = this.accountId
      ? `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/v1`
      : `https://api.cloudflare.com/client/v4/ai/v1`;

    try {
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
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

      const content = response.data?.result?.response || response.data?.choices?.[0]?.message?.content || '';

      if (!content) {
        this.logger.warn('☁️ Cloudflare returned empty content');
        return this._stubResponse(request);
      }

      return {
        model: `Cloudflare/${this.model}`,
        content,
        confidence: calculateConfidence(content, 'cloudflare'),
        processingTimeMs: Date.now() - startTime,
        language: request.language || 'ar',
      };
    } catch (error: any) {
      const status = error.response?.status;
      const errData = error.response?.data;
      this.logger.warn(
        `☁️ Cloudflare failed: ${error.message} (status: ${status}) — ${JSON.stringify(errData?.errors || errData?.error || '').slice(0, 150)}`,
      );
      return this._stubResponse(request);
    }
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'العربية الفصحى';
    return `You are a financial analysis AI for Roua Trading platform. Respond in ${lang}. Be concise, data-driven, and professional. Use real numbers only — never invent prices or data.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: `Cloudflare/${this.model}`,
      content: `⚠️ Cloudflare API not configured. Analysis for "${request.prompt}" would be generated here.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
      isFallback: true,
    };
  }
}
