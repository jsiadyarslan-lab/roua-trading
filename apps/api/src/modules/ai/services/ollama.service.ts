import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';

/**
 * Ollama Service — Self-Hosted / Local AI Models
 * 
 * Uses OLLAMA_API_KEY for authentication (if Ollama server requires it)
 * Connects to Ollama API at configurable URL (default: http://localhost:11434)
 * 
 * Available models (self-hosted, no API costs):
 * - llama3.1:8b — Strong general-purpose model
 * - mistral:7b — Fast, multilingual analysis
 * - qwen2.5:7b — Excellent Arabic support
 * - deepseek-coder:6.7b — Quantitative/reasoning tasks
 * - codellama:13b — Complex logic and strategy
 * 
 * Best for: Zero-cost inference, privacy, unlimited requests, Arabic-optimized models
 * Cost: FREE (self-hosted, no per-token charges)
 */
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  
  // Default model — excellent Arabic support
  private readonly defaultModel = 'qwen2.5:7b';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OLLAMA_API_KEY', '')?.trim() || '';
    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434')?.trim() || 'http://localhost:11434';
    
    if (this.apiKey || this._isOllamaReachable()) {
      this.logger.log(`🏠 Ollama Service initialized (${this.defaultModel}) — URL: ${this.baseUrl}`);
    } else {
      this.logger.warn('⚠️ Ollama not reachable — set OLLAMA_API_KEY or start Ollama server');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // Skip Ollama call entirely if running on cloud with localhost URL
    // This prevents 30s timeouts on Railway/Render/etc.
    if (this._isCloudWithLocalhost()) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/chat`,
        {
          model: this.defaultModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: request.prompt },
          ],
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 1024,
          },
        },
        {
          headers: {
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
            'Content-Type': 'application/json',
          },
          timeout: 5000, // Reduced from 30s — on cloud, Ollama will never respond; 5s is enough for local
        },
      );

      const content = response.data?.message?.content || '';

      if (content.length > 5) {
        return {
          model: `Ollama/${response.data?.model || this.defaultModel}`,
          content,
          confidence: calculateConfidence(content, 'ollama'),
          processingTimeMs: Date.now() - startTime,
          language: request.language || 'ar',
        };
      }
    } catch (error: any) {
      this.logger.warn(`Ollama inference failed: ${error.message}`);
    }

    return this._stubResponse(request);
  }

  /**
   * Check if Ollama server is reachable
   */
  private _isOllamaReachable(): boolean {
    // This is a synchronous check during init; actual reachability tested per-request
    return this.baseUrl !== 'http://localhost:11434' || this.apiKey !== '';
  }

  /**
   * Check if running on a cloud platform with localhost Ollama URL.
   * On Railway/Render/AWS/etc., localhost Ollama will never work.
   * Detects cloud via RAILWAY_ENVIRONMENT, RENDER, or similar env vars.
   */
  private _isCloudWithLocalhost(): boolean {
    const isCloud = !!(
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RENDER ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.VERCEL ||
      process.env.DYNO // Heroku
    );
    const isLocalhost = this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1');
    return isCloud && isLocalhost;
  }

  /**
   * List available models on the Ollama server
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000,
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });
      return (response.data?.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `أنت محلل مالي محترف متخصص في ${request.type}. أجب باللغة ${lang === 'Arabic' ? 'العربية' : 'الإنجليزية'}. كن دقيقاً ومهنياً. قدّم تحليلاً واضحاً مع توصيات عملية. أضف دائماً تنبيه المخاطر.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: `Ollama/${this.defaultModel}`,
      content: `⚠️ خادم Ollama غير متاح. النماذج المحلية (Qwen2.5, Llama3, Mistral) ستعمل عند تشغيل Ollama — مجاني بالكامل وبدون حدود استخدام.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
