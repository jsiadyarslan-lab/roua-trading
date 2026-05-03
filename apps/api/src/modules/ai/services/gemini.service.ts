import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';

/**
 * Gemini Service — Google AI Studio (Gemini 2.5 Pro)
 * Best for: Creative analysis, complex reasoning, multi-modal understanding
 * Strong at: Pattern recognition, strategic thinking, narrative generation
 *
 * FIX: Dual auth (header + query param fallback), safetySettings to prevent
 * financial content blocking, blocked-response detection (SAFETY/RECITATION),
 * error collection from every attempt, gemini-2.5-flash-preview-05-20 added,
 * real errors included in stub response.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  // Model fallback chain — try multiple model names since availability
  // varies by API key age, region, and Google's deprecation schedule.
  // Updated May 2025: Added gemini-2.5-flash-preview-05-20, kept stable models.
  private readonly modelCandidates = [
    'gemini-2.0-flash',                   // Stable Gemini 2.0 Flash — best free tier
    'gemini-2.0-flash-lite',              // Lightweight — highest free quota, fastest
    'gemini-2.0-flash-001',               // Versioned 2.0 Flash — stable pin
    'gemini-1.5-flash',                   // Older but widely available, good quota
    'gemini-1.5-flash-8b',                // Smallest, most available, generous quota
    'gemini-2.5-flash-preview-04-17',     // 2.5 Flash preview — may work on some keys
    'gemini-2.5-flash-preview-05-20',     // FIX: Latest 2.5 Flash — separate quota pool
    'gemini-2.0-flash-exp',               // FIX: Experimental — may have separate quota
  ];
  private resolvedModel: string | null = null; // Cached after first successful call

  constructor(private readonly configService: ConfigService) {
    // Check both GOOGLE_AI_STUDIO_API_KEY and GEMINI_API_KEY
    this.apiKey = this.configService.get<string>('GOOGLE_AI_STUDIO_API_KEY', '')?.trim()
      || this.configService.get<string>('GEMINI_API_KEY', '')?.trim()
      || '';
    if (this.apiKey) {
      this.logger.log(`💎 Gemini Service initialized (trying: ${this.modelCandidates.join(' → ')})`);
    } else {
      this.logger.warn('⚠️ GOOGLE_AI_STUDIO_API_KEY / GEMINI_API_KEY not set');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.apiKey) {
      return this._stubResponse(request, ['API key not configured']);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    // If we already know which model works, use it directly
    const modelsToTry = this.resolvedModel
      ? [this.resolvedModel]
      : this.modelCandidates;

    // FIX: Collect real errors from every attempt instead of swallowing them
    const errors: string[] = [];

    for (const model of modelsToTry) {
      // FIX: Dual auth — try header-based auth first, fall back to query param
      const url = `${this.baseUrl}/${model}:generateContent`;
      const urlWithKey = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;

      // Strategy 1: Header-based auth (x-goog-api-key)
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
            // FIX: safetySettings — prevent financial content from being blocked
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
            ],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey,
            },
            timeout: 60000,
          },
        );

        // FIX: Detect blocked responses (finishReason: SAFETY or RECITATION)
        const candidate = response.data.candidates?.[0];
        const finishReason = candidate?.finishReason;
        if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
          const blockMsg = `Model ${model} blocked response (finishReason: ${finishReason})`;
          this.logger.warn(`💎 ${blockMsg}`);
          errors.push(blockMsg);
          continue; // Try next model
        }

        const content = candidate?.content?.parts?.[0]?.text || '';
        if (!content.trim()) {
          const emptyMsg = `Model ${model} returned empty content (finishReason: ${finishReason || 'UNKNOWN'})`;
          errors.push(emptyMsg);
          this.logger.warn(`💎 ${emptyMsg}`);
          continue;
        }

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
        const errMsg = errData ? JSON.stringify(errData).substring(0, 200) : error.message;
        errors.push(`${model} (header auth): ${status || 'N/A'} — ${errMsg}`);

        // FIX: 429 can mean either temporary rate-limit OR permanent quota exhaustion.
        if (status === 429) {
          const isQuotaExhausted = errMsg.includes('quota');
          if (isQuotaExhausted) {
            this.logger.warn(`💎 Gemini quota exhausted for ${model} (429) — trying next model (different quota pool)`);
          } else {
            this.logger.warn(`💎 Gemini rate limited (429) for ${model} — trying next model...`);
          }
          continue;
        }
        if (status === 404) {
          this.logger.warn(`💎 Gemini model ${model} not available (404) — trying next...`);
          continue;
        }
        if (status === 401 || status === 403) {
          this.logger.error(`💎 Gemini auth failed (${status}) — API key may be invalid. Response: ${errMsg}`);
          // FIX: Don't give up yet — try query-param auth as fallback
        } else {
          this.logger.warn(`💎 Gemini inference failed with ${model}: ${errMsg} (status: ${status})`);
          continue;
        }
      }

      // Strategy 2: Query-param auth fallback (?key=) — some API keys only work this way
      try {
        const response = await axios.post(
          urlWithKey,
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
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
            ],
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 60000,
          },
        );

        // FIX: Detect blocked responses (finishReason: SAFETY or RECITATION)
        const candidate = response.data.candidates?.[0];
        const finishReason = candidate?.finishReason;
        if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
          const blockMsg = `Model ${model} blocked response (finishReason: ${finishReason}, query-param auth)`;
          this.logger.warn(`💎 ${blockMsg}`);
          errors.push(blockMsg);
          continue;
        }

        const content = candidate?.content?.parts?.[0]?.text || '';
        if (!content.trim()) {
          const emptyMsg = `Model ${model} returned empty content via query-param auth (finishReason: ${finishReason || 'UNKNOWN'})`;
          errors.push(emptyMsg);
          this.logger.warn(`💎 ${emptyMsg}`);
          continue;
        }

        // Success — cache this model name for future calls
        if (!this.resolvedModel) {
          this.resolvedModel = model;
          this.logger.log(`💎 Gemini model resolved (query-param auth): ${model}`);
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
        const errMsg = errData ? JSON.stringify(errData).substring(0, 200) : error.message;
        errors.push(`${model} (query-param auth): ${status || 'N/A'} — ${errMsg}`);

        if (status === 401 || status === 403) {
          this.logger.error(`💎 Gemini auth failed with both methods (${status}) — API key invalid: ${errMsg}`);
          // Auth error won't change with different model — but still try other models
          continue;
        }
        if (status === 429) {
          this.logger.warn(`💎 Gemini rate limited (429) for ${model} (query-param) — trying next...`);
          continue;
        }
        if (status === 404) {
          this.logger.warn(`💎 Gemini model ${model} not available (404, query-param) — trying next...`);
          continue;
        }
        this.logger.warn(`💎 Gemini ${model} failed (query-param auth): ${errMsg}`);
        continue;
      }
    }

    // All models failed — FIX: include collected errors in stub
    this.logger.warn(`💎 All Gemini models failed (${errors.length} attempts) — returning stub`);
    return this._stubResponse(request, errors);
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a sophisticated financial AI analyst specializing in ${request.type}. 
Respond in ${lang}. Provide deep, creative analysis with strategic insights.
Structure your response clearly. Always include risk disclaimers.
If analyzing a specific asset, consider both bullish and bearish scenarios.`;
  }

  /**
   * FIX: Stub response now includes real error messages from all attempts
   * so the user can see WHY Gemini failed instead of a generic message.
   */
  private _stubResponse(request: AIAnalysisRequest, errors: string[] = []): AIAnalysisResponse {
    const errorDetail = errors.length > 0
      ? ` الأخطاء: ${errors.slice(0, 3).join(' | ')}`
      : '';
    return {
      model: 'Gemini/unavailable',
      content: `⚠️ مفتاح Google AI Studio غير مكوّن أو جميع نماذج Gemini غير متاحة.${errorDetail} التحليل الإبداعي سيظهر هنا عند تفعيل الخدمة.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
