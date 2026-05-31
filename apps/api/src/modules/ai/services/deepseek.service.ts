import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { withExponentialBackoff } from './retry.util';
import { calculateConfidence } from './confidence.util';
import axios from 'axios';

@Injectable()
export class DeepSeekService {
  private readonly logger = new Logger(DeepSeekService.name);

  constructor(private readonly configService: ConfigService) {}

  // FIX: Re-resolve API key on every call — ConfigService may load keys after construction
  private _resolveApiKey(): string {
    const env = process.env as Record<string, string | undefined>;
    return (
      this.configService.get<string>('DEEPSEEK_API_KEY', '')?.trim() ||
      env['DEEPSEEK_API_KEY']?.trim() ||
      ''
    );
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // FIX: Re-resolve key on every call
    const apiKey = this._resolveApiKey();
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

    // FIX: Try deepseek-chat FIRST — deepseek-reasoner returns empty content
    // and puts the actual answer in reasoning_content, which is hard to extract.
    // deepseek-chat is more reliable for structured financial analysis.
    // FIX v2: Added more model variants — DeepSeek sometimes deprecates model names.
    // Also try the v3-specific endpoint and alternative base URLs.
    const modelCandidates = ['deepseek-chat', 'deepseek-v3-0324', 'deepseek-reasoner'];
    // FIX: Try multiple base URLs — DeepSeek has changed their API base before
    const baseUrls = [
      'https://api.deepseek.com/v1/chat/completions',
      'https://api.deepseek.com/chat/completions', // Alternative path
    ];
    const start = Date.now();
    const errors: string[] = []; // Collect errors for debugging

    for (const baseUrl of baseUrls) {
      for (const model of modelCandidates) {
        try {
          const response = await withExponentialBackoff(
            () =>
              axios.post(
                baseUrl,
                {
                  model,
                  messages: [
                    {
                      role: 'system',
                      content:
                        request.language === 'ar'
                          ? 'أنت محلل مالي ذكي. أجب بالعربية باختصار. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"'
                          : 'You are a smart financial analyst. Be concise. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"',
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
                  timeout: 30000, // FIX: Increased from 25s — DeepSeek can be very slow on cold starts
                },
              ),
            {
              maxAttempts: 2,
              baseDelayMs: 1000,
            },
          );

          // FIX: DeepSeek reasoner returns reasoning_content + content
          // Sometimes content is empty but reasoning_content has the answer
          const message = response.data?.choices?.[0]?.message;
          let content = message?.content || '';
          const reasoningContent = message?.reasoning_content || '';

          // FIX: If content is empty but reasoning_content exists, use reasoning
          if (!content.trim() && reasoningContent.trim()) {
            this.logger.debug(`🔬 DeepSeek/${model} returned reasoning_content instead of content — using it`);
            content = reasoningContent;
          }

          // FIX: If both are present, prepend reasoning as context (shortened)
          if (content.trim() && reasoningContent.trim() && model === 'deepseek-reasoner') {
            const reasoningSummary = reasoningContent.length > 300
              ? reasoningContent.slice(0, 300) + '...'
              : reasoningContent;
            content = `[تحليل منطقي]: ${reasoningSummary}\n\n[التوصية]: ${content}`;
          }

          if (content.trim().length === 0) {
            // FIX: Log the full response for debugging empty content
            const errMsg = `DeepSeek/${model} @ ${baseUrl} returned empty — full response: ${JSON.stringify(response.data)?.substring(0, 500)}`;
            this.logger.warn(`🔬 ${errMsg}`);
            errors.push(errMsg);
            continue;
          }

          const confidence = calculateConfidence(content, 'deepseek');

          this.logger.debug(`✅ DeepSeek/${model} responded in ${Date.now() - start}ms`);
          return {
            model: `DeepSeek/${model}`,
            content,
            confidence,
            processingTimeMs: Date.now() - start,
            language: request.language || 'ar',
          };
        } catch (error: any) {
          const status = error.response?.status;
          const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : '';
          errors.push(`${model}@${baseUrl.split('/v1')[0]}: ${status || 'N/A'} — ${errData}`);

          if (status === 429) {
            this.logger.warn(`🚫 DeepSeek/${model} rate-limited — trying next. ${errData}`);
            continue;
          }
          if (status === 401 || status === 403) {
            this.logger.error(`❌ DeepSeek auth failed (${status}) — key may be invalid. ${errData}`);
            continue; // Try next model/base URL
          }
          if (status === 402) {
            this.logger.warn(`💸 DeepSeek/${model} requires payment (402) — balance exhausted. ${errData}`);
            continue;
          }
          if (status === 404) {
            this.logger.warn(`🔬 DeepSeek/${model} not found at ${baseUrl} (404) — trying next`);
            continue; // Model name may be deprecated — try next
          }
          this.logger.warn(`❌ DeepSeek/${model} failed: ${error.message} (status: ${status}) ${errData}`);
          continue;
        }
      }
    }

    // FIX: DeepSeek direct API failed — try DeepSeek via OpenRouter as fallback
    // This ensures DeepSeek still works even when balance is exhausted on direct API
    const env = process.env as Record<string, string | undefined>;
    const orApiKey = this.configService.get<string>('OPENROUTER_API_KEY', '')?.trim() || env['OPENROUTER_API_KEY']?.trim() || '';
    if (orApiKey) {
      try {
        this.logger.log(`🔬 DeepSeek direct failed — trying OpenRouter fallback`);
        const orResponse = await withExponentialBackoff(
          () => axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              model: 'deepseek/deepseek-chat-v3-0324:free',
              messages: [
                { role: 'system', content: request.language === 'ar' ? 'أنت محلل مالي ذكي. أجب بالعربية باختصار. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' : 'You are a smart financial analyst. Be concise. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
                { role: 'user', content: request.prompt },
              ],
              temperature: 0.3,
              max_tokens: 1024,
            },
            {
              headers: {
                Authorization: `Bearer ${orApiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://roua-trading-production.up.railway.app',
                'X-Title': 'Roua Trading AI',
              },
              timeout: 30000,
            },
          ),
          { maxAttempts: 1, baseDelayMs: 500 },
        );

        const orContent = orResponse.data?.choices?.[0]?.message?.content || '';
        if (orContent.trim().length > 0) {
          this.logger.log(`🔬 DeepSeek via OpenRouter fallback succeeded`);
          return {
            model: 'DeepSeek/OpenRouter-V3',
            content: orContent,
            confidence: calculateConfidence(orContent, 'deepseek'),
            processingTimeMs: Date.now() - start,
            language: request.language || 'ar',
          };
        }
      } catch (orError: any) {
        this.logger.warn(`🔬 DeepSeek OpenRouter fallback also failed: ${orError.message}`);
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
