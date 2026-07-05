import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroqService, AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { GlmService } from './glm.service';
import { GeminiService } from './gemini.service';
import { HuggingFaceService } from './huggingface.service';
import { OllamaService } from './ollama.service';
import { BedrockService } from './bedrock.service';
import { OpenRouterService } from './openrouter.service';
import { DeepSeekService } from './deepseek.service';
import { CerebrasService } from './cerebras.service';
import { MistralService } from './mistral.service';
import { NvidiaService } from './nvidia.service';
import { CloudflareService } from './cloudflare.service';
import { RagService } from './rag.service';
import { AiUsageLoggerService } from './ai-usage-logger.service';
import { withExponentialBackoff } from './retry.util';
import { AiCacheService } from './ai-cache.service';
import { PredictionMarketService } from '../../prediction-market/prediction-market.service';
import { MarketDataService } from './market-data.service';
import { StrategicCouncilService, ConsensusAnalysisResult } from './strategic-council.service';

/**
 * AI Orchestrator — Routes tasks to the optimal AI model
 *
 * 8 AI Models Available (using existing API keys):
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ Model                 │ Key                │ Specialty              │
 * ├───────────────────────┼────────────────────┼────────────────────────┤
 * │ Groq/Llama 3.3 70B   │ GROQ_API_KEY       │ ⚡ سرعة — مشاعر/ترجمة │
 * │ Gemini 2.0 Flash     │ GOOGLE_AI_STUDIO   │ 💎 إبداعي — تنبؤ/استراتيجية│
 * │ Cerebras              │ CEREBRAS_API_KEY   │ ⚡ مجاني — سرعة فائقة │
 * │ Bedrock/Claude 4.5   │ AWS_ACCESS_KEY_ID  │ ☁️ جودة/سعر — مخاطر/أمان│
 * │ GLM-4 (Zhipu AI)     │ GLM_API_KEY        │ 🧠 عربي — سياق طويل   │
 * │ Ollama/Qwen2.5       │ OLLAMA_API_KEY     │ 🏠 محلي — بدون تكلفة  │
 * │ Mistral               │ MISTRAL_API_KEY    │ 🔮 مجاني — سيناريوهات │
 * │ NVIDIA NIM            │ NVIDIA_API_KEY     │ 🟢 مجاني — تباين      │
 * └───────────────────────┴────────────────────┴────────────────────────┘
 *
 * Task → Model Routing (FIX: GLM demoted from prediction primary due to 18s latency):
 * ┌──────────────────────┬──────────────────────────────────────────────────────────────┐
 * │ Task Type            │ Best Model + Fallback Chain                                  │
 * ├──────────────────────┼──────────────────────────────────────────────────────────────┤
 * │ sentiment            │ Groq → Cerebras → Gemini → Ollama → Bedrock → GLM → NV/NM  │
 * │ market_analysis      │ Gemini → Bedrock → Cerebras → Groq → Ollama → GLM → NV/NM  │
 * │ prediction           │ Gemini → Cerebras → Groq → Bedrock → Ollama → NV/NM → GLM  │
 * │ signal_generation    │ Gemini → Groq → Bedrock → Cerebras → Ollama → GLM → NV/NM  │
 * │ risk_analysis        │ Bedrock → Gemini → GLM → Cerebras → Ollama → Groq → NV/NM  │
 * │ translation          │ Groq → Cerebras → Gemini → Ollama → Bedrock → GLM → NV/NM  │
 * │ general              │ Gemini → Groq → Cerebras → Ollama → Bedrock → GLM → NV/NM  │
 * └──────────────────────┴──────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class AIOrchestratorService {
  private readonly logger = new Logger(AIOrchestratorService.name);

  /** Circuit breaker: track consecutive failures per model
   *  BUG 6 FIX: Exponential backoff starting at 30s, doubling each time,
   *  up to a max of 5 minutes. On success, cooldown resets immediately.
   *  Previous: 120s base / 30min max — too aggressive for transient errors.
   *  New: 30s → 60s → 120s → 240s → 300s (capped at 5min).
   */
  private readonly modelCooldowns = new Map<string, number>();
  private readonly modelConsecutiveFailures = new Map<string, number>();
  private readonly modelCooldownLevel = new Map<string, number>(); // FIX #4: Progressive level
  // BUG 6 FIX: Changed from fixed 120s base / 30min max to exponential backoff
  // starting at 30s and doubling each time up to a max of 5 minutes.
  // This allows faster recovery from transient rate-limits while still
  // protecting against sustained abuse.
  private readonly BASE_COOLDOWN_MS = 30_000; // Base cooldown: 30 seconds
  private readonly MAX_COOLDOWN_MS = 5 * 60 * 1000; // Max cooldown: 5 minutes
  private readonly FAILURES_BEFORE_COOLDOWN = 3; // FIX: Increased from 2 to 3 — give models more chances before cooldown

  /** Latency-aware circuit breaker: track slow responses per model
   *  SUSTAINABLE FIX: Instead of disabling models with hardcoded flags,
   *  this tracks actual response times and automatically puts models
   *  that consistently exceed the latency threshold into cooldown.
   *  When a model is in latency cooldown, it's skipped entirely
   *  (0ms instead of waiting for timeout) and the orchestrator
   *  moves to the next model in the chain immediately.
   *
   *  Models recover automatically: cooldown expires, model gets retried,
   *  and if it responds within threshold, it's re-enabled.
   *
   *  This replaces the need for GLM_ENABLED=false or other manual flags.
   */
  private readonly modelLatencies = new Map<string, { avgMs: number; samples: number; lastSampleAt: number }>();
  private readonly LATENCY_THRESHOLD_MS = 10_000; // 10 seconds — models slower than this get cooldown
  private readonly LATENCY_SAMPLE_WINDOW = 5;     // Use last 5 samples for average
  private readonly LATENCY_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown for slow models
  // V585: Cloudflare Workers AI free tier بطيء بطبيعته — لا نضعه في cooldown
  private readonly LATENCY_EXEMPT_MODELS = new Set(['cloudflare', 'ollama']);
  private readonly modelLatencyCooldowns = new Map<string, number>(); // model → cooldown until timestamp

  /** Model key environment variable mapping
   *  FIX: Added alternate env var names for ALL models to match the
   *  resolution logic in individual services. Previously, only gemini
   *  and huggingface had alternates, causing models to be marked
   *  "unavailable" when the user set the alternate name.
   */
  private readonly MODEL_KEY_MAP: Record<string, string[]> = {
    groq:        ['GROQ_API_KEY'],
    glm:         ['GLM_API_KEY'],
    gemini:      ['GOOGLE_AI_STUDIO_API_KEY', 'GEMINI_API_KEY'],  // Either key works
    cerebras:    ['CEREBRAS_API_KEY', 'CEREBRAS_KEY'],  // Replaced HuggingFace — 14,400 req/day FREE
    ollama:      ['OLLAMA_API_KEY', 'OLLAMA_BASE_URL'],  // Either API key or cloud base URL
    bedrock:     ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],  // Both required
    nvidia:      ['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY', 'NIM_API_KEY'],  // Replaced OpenRouter — 40 req/min FREE
    mistral:     ['MISTRAL_API_KEY', 'MISTRAL_KEY'],  // Replaced DeepSeek — 1B tokens/month FREE
    // Legacy keys (still checked for backward compatibility)
    huggingface: ['HUGGINGFACE_API_KEY', 'HF_API_KEY'],
    openrouter:  ['OPENROUTER_API_KEY', 'OPEN_ROUTER_API_KEY'],
    deepseek:    ['DEEPSEEK_API_KEY'],
    cloudflare:  ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
  };

  /**
   * FIX: Check if running on a cloud platform (Railway, Render, etc.)
   * On cloud, localhost-based services (Ollama) are unreachable.
   */
  private _isCloudEnvironment(): boolean {
    return !!(
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RENDER ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.VERCEL ||
      process.env.DYNO // Heroku
    );
  }

  /**
   * FIX: Check if a URL points to localhost/non-routable address
   */
  private _isLocalhostUrl(url: string): boolean {
    return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0');
  }

  /** Model routing — 8 models with smart fallbacks
   *
   * FIX: Re-routed prediction from GLM (avg 18s latency, expensive) to Gemini
   * (avg 2s latency, 10x cheaper). GLM moved to last fallback for prediction.
   *
   * FIX: Bedrock now uses Nova Micro (cheapest) instead of Claude 3.5 Sonnet
   * (most expensive). This reduces Bedrock costs by ~85x while maintaining quality.
   *
   * FIX: Bedrock budget guard — previous budget tracking was inaccurate:
   * it used Nova Micro rates for all Bedrock models including Claude (85x cheaper),
   * and failed calls contributed to the budget counter. Both issues are now fixed.
   * Moved Bedrock from primary for risk_analysis → last fallback in ALL routes.
   * This ensures Bedrock is only used when all free/cheaper models fail.
   * Gemini (with budget $50) takes over as primary for risk_analysis.
   * A runtime budget guard in _callModel() also blocks Bedrock calls when
   * the monthly budget is exceeded.
   */
  private readonly ROUTING: Record<string, { primary: string; fallback: string[] }> = {
    sentiment:        { primary: 'groq',       fallback: ['gemini', 'cloudflare', 'cerebras', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
    market_analysis:  { primary: 'gemini',     fallback: ['groq', 'cloudflare', 'cerebras', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
    prediction:       { primary: 'gemini',     fallback: ['groq', 'cloudflare', 'cerebras', 'ollama', 'mistral', 'nvidia', 'glm', 'bedrock'] },
    signal_generation:{ primary: 'groq',       fallback: ['gemini', 'cloudflare', 'cerebras', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
    risk_analysis:    { primary: 'gemini',     fallback: ['groq', 'cloudflare', 'cerebras', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
    translation:      { primary: 'groq',       fallback: ['cloudflare', 'gemini', 'cerebras', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
    general:          { primary: 'gemini',     fallback: ['groq', 'cloudflare', 'cerebras', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
  };

  /** Bedrock monthly budget guard — blocks Bedrock calls when budget exceeded
   *  FIX: Budget is now configurable via BEDROCK_MONTHLY_BUDGET_USD env var.
   *  FIX: Budget query aggregates ALL bedrock-* providers (nova-micro, claude-haiku, etc.)
   *  instead of just 'bedrock' — previous code only counted entries with provider='bedrock',
   *  missing bedrock-nova-micro and bedrock-claude-haiku entries.
   *  FIX: Failed calls no longer contribute to budget (costUsd=0 for success=false).
   */
  private readonly BEDROCK_MONTHLY_BUDGET_USD: number;
  private bedrockMonthlySpend = 0;
  private bedrockBudgetLastChecked = 0; // timestamp of last budget check
  // FIX: Budget threshold at 95% instead of 100%.
  private readonly BEDROCK_BUDGET_THRESHOLD_PERCENT = 0.95;

  constructor(
    private readonly configService: ConfigService,
    private readonly marketData: MarketDataService,
    private readonly groqService: GroqService,
    private readonly glmService: GlmService,
    private readonly geminiService: GeminiService,
    private readonly huggingfaceService: HuggingFaceService,
    private readonly ollamaService: OllamaService,
    private readonly bedrockService: BedrockService,
    private readonly openrouterService: OpenRouterService,
    private readonly deepseekService: DeepSeekService,
    private readonly cerebrasService: CerebrasService,
    private readonly mistralService: MistralService,
    private readonly nvidiaService: NvidiaService,
    private readonly cloudflareService: CloudflareService,
    private readonly usageLogger: AiUsageLoggerService,
    private readonly cache: AiCacheService,
    @Inject(forwardRef(() => StrategicCouncilService)) private readonly strategicCouncil: StrategicCouncilService,
    @Optional() private readonly ragService?: RagService,
    @Optional() @Inject(forwardRef(() => PredictionMarketService)) private readonly predictionMarket?: PredictionMarketService,
  ) {
    // FIX: Make Bedrock budget configurable via env var (default $100)
    this.BEDROCK_MONTHLY_BUDGET_USD = parseInt(
      this.configService.get<string>('BEDROCK_MONTHLY_BUDGET_USD', '100'), 10
    ) || 100;

    this.logger.log('🎼 AI Orchestrator initialized — 8 models + Prediction Market (Groq, Gemini, GLM-4, Cerebras, Ollama, Bedrock, NVIDIA NIM, Mistral)');
    if (this.ragService) {
      this.logger.log('📚 RAG integration enabled — context retrieval active');
    }
    if (this.predictionMarket) {
      this.logger.log('🔮 Prediction Market integration enabled — 9th model active');
    }
    if (this.usageLogger) {
      this.logger.log('📊 AI Usage Logger enabled — all calls will be tracked');
    }
    // Log which models have keys available
    const available = this.getModelsStatus().filter(m => m.available);
    this.logger.log(`🔑 Models with API keys: ${available.map(m => m.model).join(', ') || 'NONE'}`);
  }

  /**
   * Analyze using the optimal AI model based on task type
   * Falls back through the model chain if primary fails
   */
  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // Generate a single consistent cache key for Redis
    const redisCacheKey = this.cache.generateRedisCacheKey(request);

    // Check Redis cache first (shared across instances)
    const redisCached = await this.cache.getRedisCache(redisCacheKey);
    if (redisCached) {
      this.logger.debug(`🎼 Redis cache hit for ${request.type} analysis`);
      // FIX: Log cache hits so the dashboard shows real cache rate instead of 0%
      this.usageLogger?.logSuccess({
        model: 'cache/redis',
        endpoint: request.type || 'general',
        inputPrompt: request.prompt,
        outputContent: '[cached]',
        latencyMs: 0,
        cached: true,
      });
      return redisCached;
    }

    const enrichedRequest = await this._enrichWithContext(request);

    // FIX: Inject live market data into ALL analysis requests to prevent price hallucinations.
    // Previously, only getConsensusAnalysis() injected market data. Single-model analysis
    // via analyze() had ZERO price grounding, causing AI to invent prices like "BTC is $28,500".
    if (enrichedRequest.symbol) {
      try {
        const marketData = await this.marketData.fetchQuickMarketData(enrichedRequest.symbol);
        if (marketData.price > 0) {
          enrichedRequest.prompt = `⛔ بيانات السوق الحية (لا تخترع أسعاراً!): السعر الفعلي=${marketData.price.toLocaleString()}$, RSI=${marketData.rsi}, MACD=${marketData.macd}. ممنوع اختراع أسعار مختلفة.\n\n${enrichedRequest.prompt}`;
        } else {
          enrichedRequest.prompt = `⚠️ لم نتمكن من جلب بيانات السوق — لا تخترع أسعاراً. اكتب "السعر غير متاح".\n\n${enrichedRequest.prompt}`;
        }
      } catch {
        // Market data fetch failed — continue without it
      }
    }

    // Check in-memory cache as fallback (faster, per-instance)
    const memCacheKey = this.cache.generateMemoryCacheKey(enrichedRequest);
    const memCached = this.cache.getMemoryCache(memCacheKey);
    if (memCached) {
      this.logger.debug(`🎯 Memory cache hit for ${enrichedRequest.type} analysis`);
      // FIX: Log cache hits so the dashboard shows real cache rate instead of 0%
      this.usageLogger?.logSuccess({
        model: 'cache/memory',
        endpoint: enrichedRequest.type || 'general',
        inputPrompt: enrichedRequest.prompt,
        outputContent: '[cached]',
        latencyMs: 0,
        cached: true,
      });
      return memCached;
    }

    // In-flight request deduplication: if the same symbol+type+prompt is already
    // being processed, reuse that promise instead of making a duplicate AI call.
    const dedupeKey = this.cache.generateDedupeKey(enrichedRequest);
    const existing = this.cache.getInFlightRequest(dedupeKey);
    if (existing) {
      this.logger.debug(`🔄 Deduplicating in-flight AI request for ${dedupeKey}`);
      return existing;
    }

    const promise = this._executeAnalysis(enrichedRequest, redisCacheKey, memCacheKey);
    this.cache.setInFlightRequest(dedupeKey, promise);
    try {
      return await promise;
    } finally {
      this.cache.removeInFlightRequest(dedupeKey);
    }
  }

  /**
   * Execute the actual AI analysis — extracted from analyze() for deduplication.
   * This method contains the model routing, fallback logic, and caching.
   */
  private async _executeAnalysis(
    enrichedRequest: AIAnalysisRequest,
    redisCacheKey: string,
    memCacheKey: string,
  ): Promise<AIAnalysisResponse> {
    const routing = this.ROUTING[enrichedRequest.type] || this.ROUTING.general;
    const models = [routing.primary, ...routing.fallback];

    this.logger.debug(`🎼 Orchestrating ${enrichedRequest.type} → models: ${models.join(' → ')}`);

    let result: AIAnalysisResponse | null = null;

    for (const model of models) {
      // Skip models without API keys
      if (!this._isModelKeyAvailable(model)) {
        continue;
      }

      // Circuit breaker: only skip if 3+ consecutive 429 failures AND still in short cooldown
      const consecutiveFails = this.modelConsecutiveFailures.get(model) || 0;
      if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
        const cooldownUntil = this.modelCooldowns.get(model) || 0;
        if (Date.now() < cooldownUntil) {
          this.logger.debug(`⏭️ Model ${model} in 429 cooldown (${consecutiveFails} consecutive) — skipping`);
          continue;
        }
        // Cooldown expired — try again
        this.modelConsecutiveFailures.set(model, 0);
      }

      // SUSTAINABLE FIX: Latency-aware circuit breaker
      // If a model's average response time exceeds the threshold, skip it entirely
      // instead of waiting for it to timeout. This eliminates the 15s waste on GLM.
      // Models recover automatically when their cooldown expires.
      const latencyCooldownUntil = this.modelLatencyCooldowns.get(model) || 0;
      if (Date.now() < latencyCooldownUntil) {
        this.logger.debug(`⏭️ Model ${model} in latency cooldown (avg > ${this.LATENCY_THRESHOLD_MS}ms) — skipping`);
        continue;
      }
      const latencyInfo = this.modelLatencies.get(model);
      // V585: استثنِ Cloudflare و Ollama من latency cooldown (بطيئة بطبيعتها لكنها تعمل)
      if (
        latencyInfo &&
        latencyInfo.samples >= 3 &&
        latencyInfo.avgMs > this.LATENCY_THRESHOLD_MS &&
        !this.LATENCY_EXEMPT_MODELS.has(model)
      ) {
        // Model is consistently slow — put in cooldown
        this.modelLatencyCooldowns.set(model, Date.now() + this.LATENCY_COOLDOWN_MS);
        this.logger.warn(`🐌 Model ${model} avg latency ${Math.round(latencyInfo.avgMs)}ms > ${this.LATENCY_THRESHOLD_MS}ms — ${this.LATENCY_COOLDOWN_MS / 60000}min cooldown`);
        continue;
      }

      try {
        const response = await this._callModel(model, enrichedRequest);
        if (response.confidence === 0) {
          this.logger.debug(`⚠️ Model ${model} returned stub — trying next`);
          continue;
        }
        // Log successful AI usage
        this.usageLogger?.logSuccess({
          model: response.model,
          endpoint: enrichedRequest.type || 'general',
          inputPrompt: enrichedRequest.prompt,
          outputContent: response.content,
          latencyMs: response.processingTimeMs,
          cached: false,
        });
        // Reset consecutive failure counter AND cooldown level on success
        this.modelConsecutiveFailures.delete(model);
        this.modelCooldownLevel.delete(model); // FIX #4: Reset progressive level on success
        // SUSTAINABLE: Track latency for this model — used by latency-aware circuit breaker
        this._recordLatency(model, response.processingTimeMs);
        result = response;
        // Override fixed confidence with dynamic calculation
        result.confidence = this._calculateDynamicConfidence(model, result.content, enrichedRequest.type);
        break;
      } catch (error: any) {
        // Log failed AI usage
        this.usageLogger?.logFailure({
          model,
          endpoint: enrichedRequest.type || 'general',
          inputPrompt: enrichedRequest.prompt,
          latencyMs: 0,
          errorMessage: error.message,
        });
        // SUSTAINABLE: Track latency for failed models too (timeout = max recorded latency)
        // This ensures slow models get latency-cooldown even on timeout errors
        const timeoutMatch = error.message?.match(/timeout of (\d+)ms/i);
        const timeoutMs = timeoutMatch ? parseInt(timeoutMatch[1]) : this.LATENCY_THRESHOLD_MS;
        this._recordLatency(model, timeoutMs);
        // FIX: Only track consecutive 429 failures for cooldown
        // Other errors are logged but don't block future calls
        if (error.response?.status === 429 || error.message?.includes('429')) {
          const fails = (this.modelConsecutiveFailures.get(model) || 0) + 1;
          this.modelConsecutiveFailures.set(model, fails);
          if (fails >= this.FAILURES_BEFORE_COOLDOWN) {
            // FIX #4: Progressive cooldown — doubles each time (120s → 240s → 480s → ...)
            const level = (this.modelCooldownLevel.get(model) || 0) + 1;
            this.modelCooldownLevel.set(model, level);
            const cooldownMs = Math.min(this.BASE_COOLDOWN_MS * Math.pow(2, level - 1), this.MAX_COOLDOWN_MS);
            this.modelCooldowns.set(model, Date.now() + cooldownMs);
            this.logger.warn(`🚫 Model ${model} rate-limited ${fails}x consecutively — ${Math.round(cooldownMs / 1000)}s cooldown (level ${level})`);
          } else {
            this.logger.warn(`🚫 Model ${model} rate-limited (429) attempt ${fails}/${this.FAILURES_BEFORE_COOLDOWN} — still trying`);
          }
        } else {
          // Non-429 errors: just log, don't cooldown. The model might work for the next request.
          this.logger.warn(`❌ Model ${model} failed: ${error.message} — trying next (no cooldown)`);
        }
        continue;
      }
    }

    if (!result) {
      // RC-9: احترم كل اللغات في fallback message، لا تحوّل كل ما هو غير 'en' إلى عربي
      const fallbackLangs: Record<string, string> = {
        en: 'Analysis currently unavailable. Please try again later.',
        fr: "L'analyse est actuellement indisponible. Veuillez réessayer plus tard.",
        es: 'El análisis no está disponible actualmente. Inténtalo de nuevo más tarde.',
        de: 'Analyse derzeit nicht verfügbar. Bitte versuche es später erneut.',
        ru: 'Анализ временно недоступен. Пожалуйста, попробуйте позже.',
        tr: 'Analiz şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
        // بقية اللغات → fallback للعربية
      };
      const langCode = (enrichedRequest.language || 'ar').toLowerCase().slice(0, 2);
      const fallbackContent = fallbackLangs[langCode]
        || 'التحليل غير متاح حالياً. يرجى المحاولة لاحقاً.';
      result = {
        model: 'Orchestrator/Fallback',
        content: fallbackContent,
        confidence: 0,
        processingTimeMs: 0,
        language: enrichedRequest.language || 'ar',
        isFallback: true,
      };
    }

    // Cache the result in both Redis and in-memory with type-specific TTL
    await this.cache.setRedisCache(redisCacheKey, result, enrichedRequest.type);

    // Also cache in memory for faster subsequent access
    this.cache.setMemoryCache(memCacheKey, result, enrichedRequest.type);

    return result;
  }

  /**
   * AI Council Consensus — 6 specialist roles across 6 models
   *
   * FIX: Added Redis caching with 5-minute TTL to prevent hitting all 6 AI models
   * every 30 seconds when the dashboard polls. Without caching, a single user's
   * dashboard generates 72 API calls/minute (6 models × 12 polls/min).
   * With caching, it's at most 6 calls per 5 minutes per symbol.
   */
  /**
   * AI Council Consensus — delegates to StrategicCouncilService
   *
   * This method is now a thin wrapper that delegates to the StrategicCouncilService,
   * which was extracted from the orchestrator to isolate the council/consensus
   * responsibility (~600 lines) from the single-model routing logic.
   *
   * Cache keys remain the same (`ai:consensus:v8:{symbol}`) so existing
   * cached results are not invalidated.
   *
   * V267: `language` expanded from `'ar' | 'en'` to accept all 32 UI locales.
   * The actual prompt rendering happens in StrategicCouncilService — non-Arabic/
   * non-English locales fall back to a generic English meta-prompt that prepends
   * "Respond ONLY in {languageName}" so any LLM emits content in the user's locale.
   */
  async getConsensusAnalysis(
    symbol: string,
    options?: {
      forceFresh?: boolean;
      newsContext?: string;
      // V267: accept any of the 32 UI locales — the council renders prompts accordingly.
      language?: string;
    },
  ): Promise<ConsensusAnalysisResult> {
    return this.strategicCouncil.getConsensusAnalysis(symbol, options as any);
  }

  /**
   * Diagnose each AI model — test actual API connectivity, not just key existence.
   * Returns detailed results for each model including error messages.
   */
  async diagnoseModels(): Promise<{
    models: Array<{
      model: string;
      keyAvailable: boolean;
      apiWorking: boolean;
      responseTimeMs: number;
      error?: string;
    }>;
    summary: { total: number; keysAvailable: number; apiWorking: number };
    circuitBreaker: Array<{
      model: string;
      consecutiveFailures: number;
      inCooldown: boolean;
      cooldownExpiresAt: string | null;
      cooldownRemainingMs: number;
    }>;
  }> {
    const models = [
      { id: 'groq', name: 'Groq/Llama 3.3 70B', keyEnv: 'GROQ_API_KEY' },
      { id: 'gemini', name: 'Gemini 2.0 Flash', keyEnv: 'GOOGLE_AI_STUDIO_API_KEY', altKeyEnv: 'GEMINI_API_KEY' },
      { id: 'glm', name: 'GLM-4 (Zhipu AI)', keyEnv: 'GLM_API_KEY' },
      { id: 'cerebras', name: 'Cerebras/Llama 3.1 8B', keyEnv: 'CEREBRAS_API_KEY', altKeyEnv: 'CEREBRAS_KEY' },  // 14,400 req/day FREE
      { id: 'ollama', name: 'Ollama/Qwen2.5', keyEnv: 'OLLAMA_API_KEY' },
      { id: 'bedrock', name: 'Bedrock/Claude 4.5 Haiku', keyEnv: 'AWS_ACCESS_KEY_ID' },
      { id: 'nvidia', name: 'NVIDIA NIM/Llama 3.3 70B', keyEnv: 'NVIDIA_API_KEY', altKeyEnv: 'NVIDIA_NIM_API_KEY' },  // 40 req/min FREE
      { id: 'mistral', name: 'Mistral/Small', keyEnv: 'MISTRAL_API_KEY', altKeyEnv: 'MISTRAL_KEY' },  // 1B tokens/month FREE
      { id: 'cloudflare', name: 'Cloudflare/Llama 3.3 70B', keyEnv: 'CLOUDFLARE_API_TOKEN' },  // 10,000 neurons/day FREE
      // Legacy models (still available as fallback)
      { id: 'huggingface', name: 'HuggingFace/Mistral-7B', keyEnv: 'HUGGINGFACE_API_KEY', altKeyEnv: 'HF_API_KEY' },
      { id: 'openrouter', name: 'OpenRouter/Llama 3.1', keyEnv: 'OPENROUTER_API_KEY' },
      { id: 'deepseek', name: 'DeepSeek V3', keyEnv: 'DEEPSEEK_API_KEY' },
    ];

    const results = await Promise.all(
      models.map(async (m) => {
        const keyAvailable = this._isModelKeyAvailable(m.id);
        let apiWorking = false;
        let responseTimeMs = 0;
        let error: string | undefined;

        // Check key presence (DO NOT expose any part of the key)
        const altKeyEnv = (m as any).altKeyEnv as string | undefined;
        let keyValue = this.configService.get<string>(m.keyEnv, '') ||
          (altKeyEnv ? this.configService.get<string>(altKeyEnv, '') : '') ||
          (m.id === 'bedrock' ? this.configService.get<string>('AWS_ACCESS_KEY_ID', '') : '');

        if (!keyAvailable) {
          error = `API key not configured or not available on this platform`;
          return { model: m.name, keyAvailable, apiWorking, responseTimeMs, error };
        }

        // Test actual API call
        const start = Date.now();
        try {
          const response = await this._callModel(m.id, {
            symbol: 'TEST',
            prompt: 'Say "OK" in one word.',
            type: 'general',
            language: 'en',
          });
          responseTimeMs = Date.now() - start;

          if (response.confidence > 0 && !response.isFallback) {
            apiWorking = true;
          } else {
            // FIX: Always show the actual content from the service, even when confidence is 0.
            // The stub response content often contains the real error message (e.g., "API key invalid",
            // "Model not found", etc.) which is critical for debugging.
            const contentStr = response.content || '';
            if (contentStr.includes('API error') || contentStr.includes('error:') || contentStr.includes('Error:') || contentStr.includes('⚠️')) {
              error = contentStr.replace(/^⚠️\s*/, '').substring(0, 300);
            } else if (contentStr.length > 10) {
              error = `Model returned stub (conf=${response.confidence}): ${contentStr.substring(0, 200)}`;
            } else {
              error = `Model returned stub/empty response (confidence: ${response.confidence}, content: "${contentStr.substring(0, 50)}")`;
            }
          }
        } catch (err: any) {
          responseTimeMs = Date.now() - start;
          error = err?.message || String(err);
          // Extract status code if available
          if (err?.response?.status) {
            error = `HTTP ${err.response.status}: ${err.response?.data ? JSON.stringify(err.response.data).substring(0, 200) : err.message}`;
          }
        }

        return { model: m.name, keyAvailable, apiWorking, responseTimeMs, error };
      }),
    );

    return {
      models: results,
      summary: {
        total: results.length,
        keysAvailable: results.filter(r => r.keyAvailable).length,
        apiWorking: results.filter(r => r.apiWorking).length,
      },
      circuitBreaker: this.getCircuitBreakerStatus(),
    };
  }

  /**
   * FIX #15: Get the current circuit breaker status for all models.
   * Returns which models are in cooldown, their consecutive failure counts,
   * and when their cooldown expires.
   * Useful for monitoring and debugging why certain models are being skipped.
   */
  getCircuitBreakerStatus(): Array<{
    model: string;
    consecutiveFailures: number;
    inCooldown: boolean;
    cooldownExpiresAt: string | null;
    cooldownRemainingMs: number;
  }> {
    const models = ['groq', 'glm', 'gemini', 'cerebras', 'ollama', 'bedrock', 'nvidia', 'mistral', 'cloudflare', 'huggingface', 'openrouter', 'deepseek'];
    const now = Date.now();

    return models.map(model => {
      const failures = this.modelConsecutiveFailures.get(model) || 0;
      const cooldownUntil = this.modelCooldowns.get(model) || 0;
      const inCooldown = failures >= this.FAILURES_BEFORE_COOLDOWN && now < cooldownUntil;
      const remaining = inCooldown ? cooldownUntil - now : 0;

      return {
        model,
        consecutiveFailures: failures,
        inCooldown,
        cooldownExpiresAt: inCooldown ? new Date(cooldownUntil).toISOString() : null,
        cooldownRemainingMs: remaining,
      };
    });
  }

  /**
   * Analyze with ALL 6 models
   */
  async analyzeWithAllModels(request: AIAnalysisRequest): Promise<{
    analyses: AIAnalysisResponse[];
    consensus: string;
  }> {
    const enrichedRequest = await this._enrichWithContext(request);
    this.logger.debug(`🎼 Multi-model analysis for ${enrichedRequest.type} — 9 models`);

    const results = await Promise.allSettled([
      this.groqService.analyze(enrichedRequest),
      this.glmService.analyze(enrichedRequest),
      this.geminiService.analyze(enrichedRequest),
      this.cerebrasService.analyze(enrichedRequest),
      this.ollamaService.analyze(enrichedRequest),
      this.bedrockService.analyze(enrichedRequest),
      this.nvidiaService.analyze(enrichedRequest),
      this.mistralService.analyze(enrichedRequest),
      this.cloudflareService.analyze(enrichedRequest),
      // Legacy models
      this.huggingfaceService.analyze(enrichedRequest),
      this.openrouterService.analyze(enrichedRequest),
      this.deepseekService.analyze(enrichedRequest),
    ]);

    const analyses: AIAnalysisResponse[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.confidence > 0) {
        analyses.push(result.value);
      }
    }

    const consensus = analyses.length > 0
      ? `تم الحصول على ${analyses.length} تحليل من ${analyses.length}/11 نماذج ذكاء اصطناعي (8 أساسية + 3 تراثية)`
      : 'لا توجد نماذج متاحة حالياً';

    return { analyses, consensus };
  }

  /**
   * Get available models status — 8 models
   * Checks actual API key availability from environment variables
   */
  getModelsStatus(): { model: string; available: boolean; specialty: string }[] {
    return [
      { model: 'Groq/Llama 3.3 70B',        available: this._isModelKeyAvailable('groq'),        specialty: '⚡ سرعة فائقة — تحليل المشاعر والترجمة الفورية' },
      { model: 'Gemini 2.0 Flash',           available: this._isModelKeyAvailable('gemini'),      specialty: '💎 تحليل إبداعي — استراتيجية ومنطق مهيكل' },
      { model: 'GLM-4 (Zhipu AI)',           available: this._isModelKeyAvailable('glm'),         specialty: '🧠 تحليل عربي — سياق طويل 200k' },
      { model: 'Cerebras/Llama 3.1 8B',     available: this._isModelKeyAvailable('cerebras'),    specialty: '🧠 سرعة خارقة — أنماط وتحليل فني (14,400 طلب/يوم مجاناً)' },
      { model: 'Ollama/Qwen2.5',             available: this._isModelKeyAvailable('ollama'),      specialty: '🏠 محلي بدون تكلفة — دعم عربي ممتاز' },
      { model: 'Bedrock/Claude 4.5 Haiku',   available: this._isModelKeyAvailable('bedrock'),     specialty: '☁️ أفضل جودة/سعر — مخاطر وأمان (Haiku 4.5 + Nova)' },
      { model: 'NVIDIA NIM/Llama 3.3 70B',   available: this._isModelKeyAvailable('nvidia'),      specialty: '🟢 تباين ومعاكسة — نماذج متنوعة (40 طلب/دقيقة مجاناً)' },
      { model: 'Mistral/Small',              available: this._isModelKeyAvailable('mistral'),     specialty: '🔮 سيناريوهات — تحليل عميق (1 مليار token/شهر مجاناً)' },
      { model: 'Cloudflare/Llama 3.3 70B',  available: this._isModelKeyAvailable('cloudflare'),   specialty: '☁️ fallback موثوق — 10,000 neurons/day مجاناً' },
    ];
  }

  // ── Private: Model Key Availability ──
  /**
   * Check if the required environment variable(s) for a model are set and non-empty
   *
   * FIX: Ollama with a cloud URL (non-localhost) works on cloud platforms.
   * Only skip Ollama if the URL is localhost on a cloud platform.
   * If OLLAMA_API_KEY is set and OLLAMA_BASE_URL is a cloud URL, it's available.
   */
  /**
   * FIX: Check if a model's API key is available.
   *
   * CRITICAL BUG FIX: Previously, this method ONLY used ConfigService.get()
   * which may return empty on Railway/cloud even when the key exists in
   * process.env. This caused models to be marked "unavailable" and skipped
   * entirely — the orchestrator never even tried calling them!
   *
   * Now uses the same resolution pattern as resolveEnvKey():
   *   1. ConfigService.get() (NestJS managed)
   *   2. process.env direct access (always available)
   *   3. Alternate env var names from MODEL_KEY_MAP
   *
   * This matches what the individual services (DeepSeek, OpenRouter) already
   * do in their _resolveApiKey() methods.
   */
  /**
   * SUSTAINABLE: Record latency sample for a model.
   * Uses exponential moving average (EMA) with a window of LATENCY_SAMPLE_WINDOW samples.
   * This gives more weight to recent samples while still considering history.
   *
   * When avgMs exceeds LATENCY_THRESHOLD_MS (10s) for 3+ samples, the model
   * enters latency cooldown and is skipped until cooldown expires.
   * Models that improve (e.g., GLM fixes their API) automatically recover.
   */
  private _recordLatency(model: string, responseMs: number): void {
    const existing = this.modelLatencies.get(model);
    if (existing) {
      // Exponential moving average: new_avg = α * new_sample + (1-α) * old_avg
      // α = 2 / (window + 1) gives approximately N-sample weighting
      const alpha = 2 / (this.LATENCY_SAMPLE_WINDOW + 1);
      const newAvg = alpha * responseMs + (1 - alpha) * existing.avgMs;
      this.modelLatencies.set(model, {
        avgMs: newAvg,
        samples: existing.samples + 1,
        lastSampleAt: Date.now(),
      });
    } else {
      this.modelLatencies.set(model, {
        avgMs: responseMs,
        samples: 1,
        lastSampleAt: Date.now(),
      });
    }
  }

  private _isModelKeyAvailable(model: string): boolean {
    const keys = this.MODEL_KEY_MAP[model];
    if (!keys) return false;

    const env = process.env as Record<string, string | undefined>;

    // Helper: resolve a single key from ConfigService → process.env
    const resolveKey = (keyName: string): string => {
      // Try ConfigService first
      if (this.configService) {
        const configValue = this.configService.get<string>(keyName, '')?.trim() || '';
        if (configValue) return configValue;
      }
      // Fallback to process.env directly (FIX: This was missing!)
      return env[keyName]?.trim() || '';
    };

    // Special handling for Ollama: cloud URLs are reachable, localhost is not on cloud
    if (model === 'ollama') {
      const apiKey = resolveKey('OLLAMA_API_KEY');
      const baseUrl = resolveKey('OLLAMA_BASE_URL');

      // If on cloud AND URL is localhost → unreachable
      const effectiveBaseUrl = baseUrl || 'http://localhost:11434';
      if (this._isCloudEnvironment() && this._isLocalhostUrl(effectiveBaseUrl)) {
        this.logger.debug(`🏠 Ollama skipped — localhost URL unreachable on cloud platform`);
        return false;
      }

      // Available if API key is set OR a non-default base URL is configured (cloud Ollama)
      return !!apiKey || !!(baseUrl && !this._isLocalhostUrl(baseUrl));
    }

    // For huggingface: ANY of the listed keys works, PLUS OpenRouter as fallback
    if (model === 'huggingface') {
      const hasOwnKey = keys.some(key => !!resolveKey(key));
      if (hasOwnKey) return true;
      // FIX: Also check OPENROUTER_API_KEY — HuggingFaceService can use it as fallback
      const orKey = resolveKey('OPENROUTER_API_KEY') || resolveKey('OPEN_ROUTER_API_KEY');
      return !!orKey;
    }

    // For gemini: ANY of the listed keys works (GOOGLE_AI_STUDIO_API_KEY or GEMINI_API_KEY)
    if (model === 'gemini') {
      return keys.some(key => !!resolveKey(key));
    }

    // For bedrock: ALL listed keys must be present
    if (model === 'bedrock') {
      return keys.every(key => !!resolveKey(key));
    }

    // For cloudflare: API token is sufficient (account ID resolved from token)
    if (model === 'cloudflare') {
      return keys.some(key => !!resolveKey(key));
    }

    // Default for groq, glm, openrouter, deepseek: at least ONE key must be present
    return keys.some(key => !!resolveKey(key));
  }

  // ── Private: Vote Parsing ──
  /**
   * Parse the vote from AI model response with improved accuracy:
   * 1. First check for structured DECISION: line
   * 2. Fall back to keyword search with negation detection
   * 3. Use last occurrence (later statements override earlier ones)
   */
  private _parseVote(content: string): 'BUY' | 'SELL' | 'HOLD' {
    // ═══════════════════════════════════════════════════════════════
    // FIX: Improved vote parsing — prevents false HOLD classification
    //
    // Previous bug: When AI gives nuanced analysis mentioning both
    // bullish/bearish factors, parser defaulted to HOLD. This caused
    // 89% consensus to be labeled "Neutral — Wait" because most votes
    // were misclassified as HOLD.
    //
    // New approach: Weighted keyword scoring + stronger directional
    // detection + final conclusion extraction.
    //
    // BUG-032 FIX: Added Arabic negation check at the TOP.
    // "لا أنصح بالشراء" was parsed as BUY because "أنصح بالشراء" matched.
    // Now: negation prefix INVERTS the parsed direction.
    // ═══════════════════════════════════════════════════════════════

    // BUG-032: Check for Arabic/English negation FIRST
    const hasNegation = /(?:لا أنصح|لا يُنصح|لا أنصح\s*بـ|غير مستحسن|لا أوصي|لا ننصح|لا نوصي|I don't recommend|not recommended|avoid|do not (?:buy|sell)|don't (?:buy|sell)| advise against)/i.test(content);
    // Track if negation applies to buy or sell specifically
    const negatesBuy = hasNegation && /(?:لا أنصح\s*(?:بـ)?(?:الشراء|بالشراء|بشراء|شراء)|don't (?:recommend\s+)?buy|not recommended.*buy|avoid.*buy|advise against.*buy)/i.test(content);
    const negatesSell = hasNegation && /(?:لا أنصح\s*(?:بـ)?(?:البيع|بالبيع|ببيع|بيع)|don't (?:recommend\s+)?sell|not recommended.*sell|avoid.*sell|advise against.*sell)/i.test(content);
    if (negatesBuy && !negatesSell) {
      this.logger.debug(`📋 Negation detected: "don't recommend buying" → SELL`);
      return 'SELL';
    }
    if (negatesSell && !negatesBuy) {
      this.logger.debug(`📋 Negation detected: "don't recommend selling" → BUY`);
      return 'BUY';
    }

    // Priority 1: Explicit DECISION: BUY/SELL/HOLD format (strongest signal)
    const decisionMatch = content.match(/DECISION:\s*(BUY|SELL|HOLD)/i);
    if (decisionMatch) {
      const decision = decisionMatch[1].toUpperCase() as 'BUY' | 'SELL' | 'HOLD';
      this.logger.debug(`📋 Parsed DECISION line: ${decision}`);
      return decision;
    }

    // Priority 2: Arabic explicit recommendation patterns (expanded)
    const arBuyPatterns = /(?:أنصح|أوصي|التوصية|توصيتي|رأيي|أرى|أميل|أرتئي|ننصح|نوصي)\s*(?:بـ)?(?:الشراء|بالشراء|بشراء|شراء|الدخول|بالشراء)/i;
    const arSellPatterns = /(?:أنصح|أوصي|التوصية|توصيتي|رأيي|أرى|أميل|أرتئي|ننصح|نوصي)\s*(?:بـ)?(?:البيع|بالبيع|ببيع|بيع|الخروج|بالبيع)/i;
    const arHoldPatterns = /(?:أنصح|أوصي|التوصية|توصيتي|رأيي|أرى|أميل|أرتئي|ننصح|نوصي)\s*(?:بـ)?(?:الانتظار|بالانتظار|بانتظار|الحياد|بالحشد|بالتوقف|التوقف|الحذر|الترقب)/i;

    const hasArBuy = arBuyPatterns.test(content);
    const hasArSell = arSellPatterns.test(content);
    const hasArHold = arHoldPatterns.test(content);

    if (hasArBuy && !hasArSell && !hasArHold) return 'BUY';
    if (hasArSell && !hasArBuy && !hasArHold) return 'SELL';
    if (hasArHold && !hasArBuy && !hasArSell) return 'HOLD';
    // If both buy and hold/sell and hold, prioritize the directional signal
    if (hasArBuy && hasArHold && !hasArSell) return 'BUY';
    if (hasArSell && hasArHold && !hasArBuy) return 'SELL';

    // Priority 3: English recommendation patterns (expanded)
    const engBuy = /(?:I\s+recommend\s+(?:buying|a\s+buy|to\s+buy)|my\s+recommendation\s+is\s+(?:to\s+)?buy|recommend\s+BUY|go\s+long|enter\s+long|buy\s+signal|bullish\s+outlook|upside|buy\s+on\s+dips|accumulate)/i.test(content);
    const engSell = /(?:I\s+recommend\s+(?:selling|a\s+sell|to\s+sell)|my\s+recommendation\s+is\s+(?:to\s+)?sell|recommend\s+SELL|go\s+short|enter\s+short|sell\s+signal|bearish\s+outlook|downside|sell\s+on\s+rally|distribute)/i.test(content);
    if (engBuy && !engSell) return 'BUY';
    if (engSell && !engBuy) return 'SELL';

    // Priority 4: Weighted keyword scoring (replaces simple last-occurrence)
    const contentLen = content.length;
    const buyKeywordRegex = /(شراء|صعود|شرائية|إيجابي|ارتفاع|BUY|BULLISH|LONG|UPWARD|UPTREND|أميل\s*للشراء|توقع\s*صعود|مستهدف\s*صعودي|استمرار\s*الصعود)/gi;
    const sellKeywordRegex = /(بيع|هبوط|بيعية|سلبي|انخفاض|SELL|BEARISH|SHORT|DOWNWARD|DOWNTREND|أميل\s*للبيع|توقع\s*هبوط|مستهدف\s*هبوطي|استمرار\s*الهبوط)/gi;

    let buyScore = 0, sellScore = 0;
    let m: RegExpExecArray | null;

    buyKeywordRegex.lastIndex = 0;
    while ((m = buyKeywordRegex.exec(content)) !== null) {
      const position = m.index / contentLen;
      const weight = 1 + position * 1.5;
      buyScore += weight;
    }

    sellKeywordRegex.lastIndex = 0;
    while ((m = sellKeywordRegex.exec(content)) !== null) {
      const position = m.index / contentLen;
      const weight = 1 + position * 1.5;
      sellScore += weight;
    }

    // Priority 5: Final conclusion extraction
    const conclusion = content.slice(-200);
    const conclusionBuy = /(?:شراء|صعود|BUY|BULLISH|LONG|إيجابي|ارتفاع)/i.test(conclusion);
    const conclusionSell = /(?:بيع|هبوط|SELL|BEARISH|SHORT|سلبي|انخفاض)/i.test(conclusion);

    if (conclusionBuy && !conclusionSell) return 'BUY';
    if (conclusionSell && !conclusionBuy) return 'SELL';

    // Final: Use weighted scores to decide
    if (buyScore > sellScore * 1.2) return 'BUY';
    if (sellScore > buyScore * 1.2) return 'SELL';
    if (buyScore > 0 && sellScore === 0) return 'BUY';
    if (sellScore > 0 && buyScore === 0) return 'SELL';
    if (buyScore > sellScore) return 'BUY';
    if (sellScore > buyScore) return 'SELL';

    return 'HOLD';
  }

  /**
   * Invalidate all cached results (call when new data arrives)
   * Delegates to AiCacheService for both in-memory and Redis cache.
   */
  clearCache(): void {
    this.cache.clearCache();
    this.logger.debug('🗑️ AI response cache cleared');
  }

  // ── Public Accessors for StrategicCouncilService ──
  // These methods expose internal functionality needed by the council service
  // for model calling, key checking, vote parsing, and circuit breaker state.

  /** Public accessor for model calling — used by StrategicCouncilService */
  callModel(model: string, request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    return this._callModel(model, request);
  }

  /** Public accessor for key availability checking — used by StrategicCouncilService */
  isModelKeyAvailable(model: string): boolean {
    return this._isModelKeyAvailable(model);
  }

  /** Public accessor for vote parsing — used by StrategicCouncilService */
  parseVote(content: string): 'BUY' | 'SELL' | 'HOLD' {
    return this._parseVote(content);
  }

  /** Public accessor for cloud environment detection — used by StrategicCouncilService */
  isCloudEnvironment(): boolean {
    return this._isCloudEnvironment();
  }

  /** Public accessor for localhost URL detection — used by StrategicCouncilService */
  isLocalhostUrl(url: string): boolean {
    return this._isLocalhostUrl(url);
  }

  /** Get consecutive failure count for a model — used by StrategicCouncilService */
  getModelConsecutiveFailures(model: string): number {
    return this.modelConsecutiveFailures.get(model) || 0;
  }

  /** Get cooldown expiry timestamp for a model — used by StrategicCouncilService */
  getModelCooldown(model: string): number {
    return this.modelCooldowns.get(model) || 0;
  }

  /** Get the FAILURES_BEFORE_COOLDOWN threshold — used by StrategicCouncilService */
  getFailuresBeforeCooldown(): number {
    return this.FAILURES_BEFORE_COOLDOWN;
  }

  /** Record a model success (reset consecutive failures and cooldown level) — used by StrategicCouncilService */
  recordModelSuccess(model: string): void {
    this.modelConsecutiveFailures.delete(model);
    this.modelCooldownLevel.delete(model);
  }

  /** Record a 429 rate-limit failure for a model — used by StrategicCouncilService */
  recordModel429Failure(model: string): void {
    const fails = (this.modelConsecutiveFailures.get(model) || 0) + 1;
    this.modelConsecutiveFailures.set(model, fails);
    if (fails >= this.FAILURES_BEFORE_COOLDOWN) {
      const level = (this.modelCooldownLevel.get(model) || 0) + 1;
      this.modelCooldownLevel.set(model, level);
      const cooldownMs = Math.min(this.BASE_COOLDOWN_MS * Math.pow(2, level - 1), this.MAX_COOLDOWN_MS);
      this.modelCooldowns.set(model, Date.now() + cooldownMs);
    }
  }

  // ── Private: RAG Context ──
  private async _enrichWithContext(request: AIAnalysisRequest): Promise<AIAnalysisRequest> {
    if (!this.ragService) return request;
    try {
      const searchQuery = request.symbol ? `${request.symbol} ${request.prompt}` : request.prompt;
      const context = await this.ragService.retrieveRelevantContext(searchQuery, 5);
      if (!context || context.trim().length === 0) return request;
      return { ...request, prompt: `📚 سياق من أرشيف الأخبار:\n${context}\n\n---\n\n${request.prompt}` };
    } catch (error: any) {
      this.logger.warn(`RAG enrichment failed: ${error.message}`);
      return request;
    }
  }

  // ── Private: Model Routing ──
  private async _callModel(model: string, request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // FIX: Bedrock budget guard — skip Bedrock entirely when monthly budget exceeded.
    // This prevents the $100/month Bedrock budget from being consumed beyond its limit.
    // Budget is refreshed by querying AiUsageLog (every 5 minutes or on each Bedrock call).
    if (model === 'bedrock') {
      await this._refreshBedrockBudget();
      // FIX: Block Bedrock at 95% of budget, not 100% — provides safety buffer.
      const budgetLimit = this.BEDROCK_MONTHLY_BUDGET_USD * this.BEDROCK_BUDGET_THRESHOLD_PERCENT;
      if (this.bedrockMonthlySpend >= budgetLimit) {
        this.logger.warn(`☁️ Bedrock budget guard: $${this.bedrockMonthlySpend.toFixed(2)}/$${this.BEDROCK_MONTHLY_BUDGET_USD} (>= ${this.BEDROCK_BUDGET_THRESHOLD_PERCENT * 100}%) — skipping Bedrock call`);
        throw new Error(`Bedrock monthly budget exceeded ($${this.bedrockMonthlySpend.toFixed(2)}/$${this.BEDROCK_MONTHLY_BUDGET_USD}, threshold ${this.BEDROCK_BUDGET_THRESHOLD_PERCENT * 100}%)`);
      }
    }

    // FIX: Per-model timeout enforced at orchestrator level.
    // Even if an individual service has a long timeout, the orchestrator
    // will abort the call after MODEL_TIMEOUT_MS to prevent the fallback
    // chain from being blocked by a single slow model.
    // GLM: 10s, NVIDIA: 8s, Mistral: 6s, Others: 15s
    const MODEL_TIMEOUT_MS: Record<string, number> = {
      glm: 10_000,
      nvidia: 8_000,
      mistral: 6_000,
      groq: 15_000,
      gemini: 15_000,
      cerebras: 15_000,
      bedrock: 15_000,
      cloudflare: 30_000, // V585: free tier — يحتاج وقت أطول
      ollama: 15_000,
      huggingface: 15_000,
      openrouter: 15_000,
      deepseek: 15_000,
    };
    const timeoutMs = MODEL_TIMEOUT_MS[model] || 15_000;

    const callWithTimeout = async (): Promise<AIAnalysisResponse> => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Orchestrator timeout: model ${model} exceeded ${timeoutMs}ms`)), timeoutMs)
      );
      const modelCall = (): Promise<AIAnalysisResponse> => {
        switch (model) {
          case 'groq':        return this.groqService.analyze(request);
          case 'glm':         return this.glmService.analyze(request);
          case 'gemini':      return this.geminiService.analyze(request);
          case 'huggingface': return this.huggingfaceService.analyze(request);
          case 'ollama':      return this.ollamaService.analyze(request);
          case 'bedrock':     return this.bedrockService.analyze(request);
          case 'openrouter':  return this.openrouterService.analyze(request);
          case 'deepseek':    return this.deepseekService.analyze(request);
          case 'cerebras':    return this.cerebrasService.analyze(request);
          case 'mistral':     return this.mistralService.analyze(request);
          case 'nvidia':      return this.nvidiaService.analyze(request);
          case 'cloudflare':  return this.cloudflareService.analyze(request);
          default:            return this.geminiService.analyze(request);
        }
      };
      return Promise.race([modelCall(), timeoutPromise]);
    };

    // FIX #10/#17: Wrap model calls with exponential backoff retry.
    // Only retries on 429 rate-limit and network errors.
    // Auth errors (401/403), validation errors (400), and 404s are NOT retried.
    // FIX #16: Pass logger to retry utility for consistent logging
    return withExponentialBackoff(
      callWithTimeout,
      {
        maxAttempts: 2,        // 2 retries (3 total attempts) — keep it low to avoid blocking the fallback chain
        baseDelayMs: 1000,    // Start with 1s delay
        maxDelayMs: 8000,     // Cap at 8s — don't want retries to delay the whole council
        jitterMs: 200,        // Add 0-200ms random jitter
        logger: { warn: (msg: string) => this.logger.warn(msg) }, // FIX #16: Consistent logging
      },
    );
  }

  /**
   * FIX: Refresh Bedrock monthly spend from AiUsageLog.
   * Queries the database at most once every 5 minutes to avoid overhead.
   * Automatically resets on the 1st of each month.
   */
  private async _refreshBedrockBudget(): Promise<void> {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    // Auto-reset on new month
    const currentMonth = new Date().getMonth();
    const lastCheckMonth = new Date(this.bedrockBudgetLastChecked).getMonth();
    if (currentMonth !== lastCheckMonth && this.bedrockBudgetLastChecked > 0) {
      this.bedrockMonthlySpend = 0;
    }

    // Throttle: only refresh every 5 minutes
    if (now - this.bedrockBudgetLastChecked < fiveMinutes) return;

    try {
      this.bedrockBudgetLastChecked = now;
      // FIX: Aggregate ALL bedrock-* providers (nova-micro, claude-haiku, etc.)
      // Previously only queried provider='bedrock', missing per-model entries.
      const bedrockProviders = ['bedrock', 'bedrock-nova-micro', 'bedrock-nova-lite', 'bedrock-claude-haiku', 'bedrock-titan', 'bedrock-llama'];
      let totalSpend = 0;
      for (const provider of bedrockProviders) {
        const spend = await this.usageLogger?.getMonthlySpendForProvider(provider);
        if (spend) totalSpend += spend;
      }
      this.bedrockMonthlySpend = totalSpend;
      if (this.bedrockMonthlySpend >= this.BEDROCK_MONTHLY_BUDGET_USD * 0.85) {
        this.logger.warn(`☁️ Bedrock budget at ${((this.bedrockMonthlySpend / this.BEDROCK_MONTHLY_BUDGET_USD) * 100).toFixed(1)}% ($${this.bedrockMonthlySpend.toFixed(2)}/$${this.BEDROCK_MONTHLY_BUDGET_USD})`);
      }
    } catch {
      // If we can't check budget, allow the call — fail open rather than block
    }
  }


  // ── Market Data: Delegated to MarketDataService ──

  /**
   * Public method: Fetch quick market data (price, RSI, MACD) for a symbol.
   * Backward-compatible redirect — delegates to MarketDataService.
   * External consumers (Strategic Council, Smart Executor) call this method.
   */
  async fetchQuickMarketData(symbol: string): Promise<{ price: number; rsi: number; macd: string; change24h?: number }> {
    return this.marketData.fetchQuickMarketData(symbol);
  }


  // ── Private: Dynamic Confidence Scoring ──
  /**
   * Calculate dynamic confidence based on response quality indicators
   * instead of using fixed per-model confidence values.
   *
   * Factors:
   * - Response completeness (length-based)
   * - Structured output detection (DECISION line, JSON)
   * - Model-specific base confidence
   * - Arabic content detection (boost for Arabic-focused platform)
   */
  private _calculateDynamicConfidence(model: string, content: string, type: string): number {
    // FIX: Previously, confidence was ~70-88% fixed per model name regardless
    // of response quality. A hallucinated response from Gemini got 0.85 base
    // simply because it's Gemini. Now, confidence is primarily driven by
    // CONTENT QUALITY signals, with only a small model reliability modifier.

    let confidence = 0.3; // Low base — must earn confidence through quality

    // ── Factor 1: Response completeness (0-0.20) ──
    // Longer, more detailed responses are generally more reliable
    if (content.length > 100) confidence += 0.05;
    if (content.length > 300) confidence += 0.05;
    if (content.length > 600) confidence += 0.05;
    if (content.length > 1000) confidence += 0.05;

    // ── Factor 2: Structured output (0-0.15) ──
    // Structured responses indicate the model followed instructions
    if (content.includes('DECISION:') || content.includes('القرار:')) confidence += 0.05;
    if (content.includes('{') && content.includes('}')) confidence += 0.03;
    if (content.includes('```') || content.includes('1.') || content.includes('-')) confidence += 0.04;
    // Has price levels (entry/SL/TP) — very relevant for trading analysis
    if (/(\$?\d+[\.,]?\d*|\d+\s*%)/.test(content)) confidence += 0.03;

    // ── Factor 3: Actionable recommendation present (0-0.15) ──
    // Presence of a clear trading recommendation
    const hasBuy = /شراء|BUY|صعود|long/i.test(content);
    const hasSell = /بيع|SELL|هبوط|short/i.test(content);
    const hasHold = /انتظار|HOLD|WAIT|محايد/i.test(content);
    // FIX: Check for NEGATION context — "لا أنصح بالشراء" should NOT count as buy
    const hasNegation = /لا أنصح|لا أ 推荐|غير مستحسن|لا يُنصح|I don't recommend|not recommended|avoid/i.test(content);
    if ((hasBuy || hasSell || hasHold) && !hasNegation) confidence += 0.10;
    if ((hasBuy || hasSell || hasHold) && hasNegation) confidence += 0.03; // Less confident if negation present

    // ── Factor 4: Risk awareness (0-0.10) ──
    // Good analysis mentions risks — shows balanced thinking
    const hasRisk = /مخاطر|risk|تحذير|warning|حذر|caution|قد يخسر|may lose/i.test(content);
    const hasDisclaimer = /إخلاء مسؤولية|disclaimer|تعليمي|educational|ليس نصيحة/i.test(content);
    if (hasRisk) confidence += 0.05;
    if (hasDisclaimer) confidence += 0.05;

    // ── Factor 5: Arabic content quality (0-0.05) ──
    // Arabic content is expected for this platform
    const arabicPattern = /[\u0600-\u06FF]/;
    if (arabicPattern.test(content)) confidence += 0.03;
    // Mixed Arabic + English suggests deeper analysis
    if (arabicPattern.test(content) && /[a-zA-Z]{3,}/.test(content)) confidence += 0.02;

    // ── Factor 6: Model reliability modifier (small, ±0.05) ──
    // FIX: Reduced from ±0.15 to ±0.05 — model name should NOT dominate
    // confidence. A poor response from a "reliable" model should score
    // lower than a great response from a "less reliable" model.
    const modelReliability: Record<string, number> = {
      groq: 0.02,
      gemini: 0.05,
      glm: 0.03,
      huggingface: -0.02,
      ollama: 0.00,
      bedrock: 0.05,
      cloudflare: 0.01,
      openrouter: 0.00,
      deepseek: 0.03,
    };
    confidence += (modelReliability[model] || 0.00);

    // ── Factor 7: Penalty for warning signs (0 to -0.15) ──
    // Stub responses, errors, or generic text should score LOW
    if (content.includes('⚠️') || content.includes('غير متاح') || content.includes('unavailable')) confidence -= 0.15;
    if (content.length < 50) confidence -= 0.10; // Too short to be meaningful
    if (/لم أتمكن|لا أستطيع|I cannot|I'm unable/i.test(content)) confidence -= 0.10;

    return Math.min(Math.max(confidence, 0.05), 0.95);
  }

}
