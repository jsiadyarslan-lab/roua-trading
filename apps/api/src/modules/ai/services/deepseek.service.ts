import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { withExponentialBackoff } from './retry.util';
import axios from 'axios';

@Injectable()
export class DeepSeekService {
  private readonly logger = new Logger(DeepSeekService.name);

  constructor(private readonly configService: ConfigService) {}

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY', '');
    if (!apiKey) {
      return {
        model: 'DeepSeek/Stub',
        content: '',
        confidence: 0,
        processingTimeMs: 0,
        language: request.language || 'ar',
        isFallback: true,
      };
    }

    const modelCandidates = ['deepseek-chat', 'deepseek-reasoner'];
    const start = Date.now();

    for (const model of modelCandidates) {
      try {
        const response = await withExponentialBackoff(
          () =>
            axios.post(
              'https://api.deepseek.com/v1/chat/completions',
              {
                model,
                messages: [
                  {
                    role: 'system',
                    content:
                      request.language === 'ar'
                        ? 'أنت محلل مالي ذكي. أجب بالعربية باختصار.'
                        : 'You are a smart financial analyst. Be concise.',
                  },
                  { role: 'user', content: request.prompt },
                ],
                temperature: 0.3,
                max_tokens: 1024,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                timeout: 20000,
              },
            ),
          {
            maxAttempts: 2,
            baseDelayMs: 1000,
          },
        );

        const content = response.data?.choices?.[0]?.message?.content || '';
        if (content.trim().length === 0) continue;

        const confidence = Math.min(
          Math.max(
            0.5 +
              (content.length > 200 ? 0.1 : 0) +
              (content.length > 500 ? 0.1 : 0) +
              (/شراء|بيع|انتظار|BUY|SELL|HOLD|صعود|هبوط/i.test(content) ? 0.15 : 0) +
              0.03, // DeepSeek base bonus
            0.1,
          ),
          0.95,
        );

        this.logger.debug(`✅ DeepSeek/${model} responded in ${Date.now() - start}ms`);
        return {
          model: `DeepSeek/${model}`,
          content,
          confidence,
          processingTimeMs: Date.now() - start,
          language: request.language || 'ar',
        };
      } catch (error: any) {
        if (error.response?.status === 429) {
          this.logger.warn(`🚫 DeepSeek/${model} rate-limited — trying next model`);
          continue;
        }
        if (error.response?.status === 401 || error.response?.status === 403) {
          this.logger.error(`❌ DeepSeek auth failed (${error.response.status})`);
          break;
        }
        this.logger.warn(`❌ DeepSeek/${model} failed: ${error.message}`);
        continue;
      }
    }

    return {
      model: 'DeepSeek/Stub',
      content: '',
      confidence: 0,
      processingTimeMs: Date.now() - start,
      language: request.language || 'ar',
      isFallback: true,
    };
  }
}
