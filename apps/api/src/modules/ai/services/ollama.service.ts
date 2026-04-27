import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';

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
    this.apiKey = this.configService.get<string>('OLLAMA_API_KEY', '');
    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
    
    if (this.apiKey || this._isOllamaReachable()) {
      this.logger.log(`🏠 Ollama Service initialized (${this.defaultModel}) — URL: ${this.baseUrl}`);
    } else {
      this.logger.warn('⚠️ Ollama not reachable — set OLLAMA_API_KEY or start Ollama server');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
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
          timeout: 30000, // Reduced from 120s to prevent blocking fallback chain
        },
      );

      const content = response.data?.message?.content || '';

      if (content.length > 5) {
        return {
          model: `Ollama/${response.data?.model || this.defaultModel}`,
          content,
          confidence: this._calculateConfidence(content, 'ollama'),
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

  private _calculateConfidence(content: string, model: string): number {
    let confidence = 0.5; // base

    // Length bonus: longer analysis = more confident (capped)
    if (content.length > 200) confidence += 0.1;
    if (content.length > 500) confidence += 0.1;
    if (content.length > 1000) confidence += 0.05;

    // Clear recommendation bonus
    const hasRecommendation = /شراء|بيع|انتظار|BUY|SELL|HOLD|صعود|هبوط/i.test(content);
    if (hasRecommendation) confidence += 0.15;

    // Model base confidence
    const modelBase: Record<string, number> = {
      'gemini': 0.05,
      'groq': 0.0,
      'glm': 0.02,
      'huggingface': -0.05,
      'ollama': 0.0,
      'bedrock': 0.08,
    };
    confidence += modelBase[model] || 0;

    return Math.min(Math.max(confidence, 0.1), 0.95); // Clamp 0.1-0.95
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
