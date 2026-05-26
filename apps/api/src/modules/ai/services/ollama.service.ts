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
  private apiKey: string; // FIX: Not readonly — allows on-demand key resolution
  private readonly baseUrl: string;
  
  // Model name — configurable via OLLAMA_MODEL env var (for cloud Ollama providers)
  // Cloud Ollama (like ollama.com) may have different model names than local
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this._resolveApiKey();
    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434')?.trim() || 'http://localhost:11434';
    this.defaultModel = this.configService.get<string>('OLLAMA_MODEL', 'qwen2.5:7b')?.trim() || 'qwen2.5:7b';
    
    if (this.apiKey || this._isOllamaReachable()) {
      this.logger.log(`🏠 Ollama Service initialized (${this.defaultModel}) — URL: ${this.baseUrl}`);
    } else {
      this.logger.warn('⚠️ Ollama not reachable (will re-check on each call) — set OLLAMA_API_KEY or start Ollama server');
    }
  }

  /**
   * FIX: Resolve API key from multiple sources — same pattern as other services.
   * ConfigService.get() may return empty during construction on Railway/cloud.
   */
  private _resolveApiKey(): string {
    const env = process.env as Record<string, string | undefined>;
    return (
      this.configService.get<string>('OLLAMA_API_KEY', '')?.trim() ||
      env['OLLAMA_API_KEY']?.trim() ||
      ''
    );
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // FIX: Re-resolve key on every call
    if (!this.apiKey) {
      const resolved = this._resolveApiKey();
      if (resolved) {
        this.apiKey = resolved;
        this.logger.log('🏠 Ollama key resolved on-demand');
      }
    }

    // Skip Ollama call entirely if running on cloud with localhost URL
    // This prevents 30s timeouts on Railway/Render/etc.
    if (this._isCloudWithLocalhost()) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const systemPrompt = this._buildSystemPrompt(request);
    const model = this._resolveModel(); // Use auto-detected model for cloud/local

    try {
      // FIX: Support both native Ollama API (/api/chat) and OpenAI-compatible API (/v1/chat/completions)
      // If the base URL ends with /v1, use the OpenAI-compatible endpoint instead.
      let apiEndpoint: string;
      let requestBody: any;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

      if (this.baseUrl.endsWith('/v1') || this.baseUrl.endsWith('/v1/')) {
        // OpenAI-compatible endpoint (used by Ollama cloud proxies)
        apiEndpoint = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
        requestBody = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: request.prompt },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        };
      } else {
        // Native Ollama API endpoint
        apiEndpoint = `${this.baseUrl}/api/chat`;
        requestBody = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: request.prompt },
          ],
          stream: false,
          options: { temperature: 0.3, num_predict: 1024 },
        };
      }

      // BUG 7 FIX: Reduced timeout from 120s to 30s for both local and cloud Ollama.
      // A 120s timeout blocks the orchestrator's fallback chain, preventing other
      // models from being tried. 30s is generous enough for inference while
      // allowing fast fallback when Ollama is slow or unresponsive.
      const response = await axios.post(apiEndpoint, requestBody, {
        headers,
        timeout: 30000, // 30s for both local and cloud
      });

      // Handle both native Ollama response and OpenAI-compatible response
      const content = response.data?.message?.content || response.data?.choices?.[0]?.message?.content || '';

      // FIX: Lowered threshold from 5 to 1 — even a 1-char response like "OK"
      // is valid. The old threshold (5) caused false negatives where short but
      // valid responses were treated as stubs.
      if (content.trim().length > 0) {
        return {
          model: `Ollama/${response.data?.model || this.defaultModel}`,
          content,
          confidence: calculateConfidence(content, 'ollama'),
          processingTimeMs: Date.now() - startTime,
          language: request.language || 'ar',
        };
      }

      // Response was empty — log for diagnostics
      this.logger.warn(`Ollama returned empty response (data: ${JSON.stringify(response.data)?.substring(0, 200)})`);
    } catch (error: any) {
      // FIX: Throw 429 errors so the orchestrator's circuit breaker can track them.
      if (error.response?.status === 429) {
        this.logger.warn(`Ollama rate limited (429) — throwing for circuit breaker`);
        throw error;
      }
      // FIX: Include error details in response so diagnostics can see them
      const status = error.response?.status;
      const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : '';
      this.logger.warn(`Ollama inference failed: ${error.message} (status: ${status}) ${errData}`);
      return {
        ...this._stubResponse(request),
        content: `⚠️ Ollama API error (${status || 'N/A'}): ${error.message?.substring(0, 150)}`,
      };
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
   * Resolve the best model name for the current Ollama server.
   * - If OLLAMA_MODEL is set, use it directly (user's explicit choice)
   * - If using ollama.com cloud API, use a cloud-compatible model
   * - Otherwise, fall back to the configured defaultModel
   */
  private _resolveModel(): string {
    // If user explicitly set OLLAMA_MODEL, always use it
    const envModel = this.configService.get<string>('OLLAMA_MODEL', '');
    if (envModel && envModel.trim()) {
      return envModel.trim();
    }

    // Detect ollama.com cloud API — use a cloud-compatible model
    if (this.baseUrl.includes('ollama.com')) {
      // ollama.com doesn't have qwen2.5:7b — use gemma3:4b as fast default
      this.logger.log(`🏠 Detected ollama.com cloud — using gemma3:4b (cloud-compatible)`);
      return 'gemma3:4b';
    }

    // Default: use the configured defaultModel (qwen2.5:7b for local Ollama)
    return this.defaultModel;
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
    // FIX: Force Arabic-only responses — previous prompts sometimes caused English responses in Arabic council
    return `أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت استراتيجي تنفيذ متخصص في ${request.type}. كن دقيقاً ومهنياً. قدّم تحليلاً واضحاً مع توصيات عملية. أضف دائماً تنبيه المخاطر. IMPORTANT: Respond in Arabic only.`;
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
