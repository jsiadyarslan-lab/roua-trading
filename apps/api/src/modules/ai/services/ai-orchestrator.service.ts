import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroqService, AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { GlmService } from './glm.service';
import { GeminiService } from './gemini.service';
import { HuggingFaceService } from './huggingface.service';
import { OllamaService } from './ollama.service';
import { BedrockService } from './bedrock.service';
import { OpenRouterService } from './openrouter.service';
import { RagService } from './rag.service';
import { AiUsageLoggerService } from './ai-usage-logger.service';
import { RedisService } from '../../../common/redis/redis.service';
import { PredictionMarketService } from '../../prediction-market/prediction-market.service';
import * as crypto from 'crypto';
import axios from 'axios';

/**
 * AI Orchestrator — Routes tasks to the optimal AI model
 *
 * 7 AI Models Available (using existing API keys):
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ Model                 │ Key                │ Specialty              │
 * ├───────────────────────┼────────────────────┼────────────────────────┤
 * │ Groq/Llama 3.3 70B   │ GROQ_API_KEY       │ ⚡ سرعة — مشاعر/ترجمة │
 * │ Gemini 2.0 Flash     │ GOOGLE_AI_STUDIO   │ 💎 إبداعي — استراتيجية│
 * │ GLM-4 (Zhipu AI)     │ GLM_API_KEY        │ 🧠 عربي — سياق طويل   │
 * │ HuggingFace/Mistral  │ HUGGINGFACE_API_KEY│ 🤗 مجاني — متنوع      │
 * │ Ollama/Qwen2.5       │ OLLAMA_API_KEY     │ 🏠 محلي — بدون تكلفة  │
 * │ Bedrock/Claude 3.5   │ AWS_ACCESS_KEY_ID  │ ☁️ مؤسسي — مخاطر/أمان │
 * │ OpenRouter/Llama 3.1 │ OPENROUTER_API_KEY │ 🔀 تباين — نماذج مجانية│
 * └───────────────────────┴────────────────────┴────────────────────────┘
 *
 * Task → Model Routing:
 * ┌──────────────────────┬──────────────────────────────────────────────────────┐
 * │ Task Type            │ Best Model + Fallback Chain                          │
 * ├──────────────────────┼──────────────────────────────────────────────────────┤
 * │ sentiment            │ Groq → GLM → HuggingFace → Ollama → OpenRouter      │
 * │ market_analysis      │ Gemini → Bedrock → GLM → HuggingFace → OpenRouter   │
 * │ prediction           │ GLM → Ollama → Gemini → Bedrock → OpenRouter        │
 * │ signal_generation    │ Gemini → Bedrock → Groq → GLM → OpenRouter          │
 * │ risk_analysis        │ Bedrock → GLM → Ollama → Gemini → OpenRouter        │
 * │ translation          │ Groq → GLM → Ollama → HuggingFace → OpenRouter      │
 * │ general              │ Gemini → Groq → GLM → HuggingFace → Ollama → OR     │
 * └──────────────────────┴──────────────────────────────────────────────────────┘
 */
@Injectable()
export class AIOrchestratorService {
  private readonly logger = new Logger(AIOrchestratorService.name);

  /** Circuit breaker: track consecutive failures per model
   *  FIX: Previous cooldown was too aggressive — it blocked ALL models after
   *  a few failures, causing the entire AI Council to go offline.
   *  New approach: Only skip models after 3+ CONSECUTIVE failures (429 only).
   *  Other errors are logged but don't trigger cooldown.
   *  Cooldown is very short (10s) and resets on success.
   */
  private readonly modelCooldowns = new Map<string, number>();
  private readonly modelConsecutiveFailures = new Map<string, number>();
  private readonly COOLDOWN_MS = 10_000; // Short cooldown: 10s after 3+ consecutive 429s
  private readonly FAILURES_BEFORE_COOLDOWN = 3; // Only cooldown after 3+ consecutive 429 failures

  /** In-flight request deduplication — prevents duplicate AI calls for the same symbol+type */
  private readonly inFlightRequests = new Map<string, Promise<AIAnalysisResponse>>();

  /** In-memory cache for AI responses with TTL */
  private readonly responseCache = new Map<string, { result: AIAnalysisResponse; expiresAt: number }>();
  /** Maximum number of entries in the in-memory cache (prevents unbounded growth) */
  private readonly MAX_CACHE_SIZE = 500;
  private readonly CACHE_TTL: Record<string, number> = {
    sentiment: 5 * 60 * 1000,        // 5 minutes
    market_analysis: 15 * 60 * 1000,  // 15 minutes
    prediction: 10 * 60 * 1000,       // 10 minutes
    signal_generation: 5 * 60 * 1000, // 5 minutes
    risk_analysis: 15 * 60 * 1000,    // 15 minutes
    translation: 30 * 60 * 1000,      // 30 minutes
    general: 10 * 60 * 1000,          // 10 minutes
    consensus: 10 * 60 * 1000,        // 10 minutes for FULL consensus results
    consensus_partial: 2 * 60 * 1000, // FIX: 2 minutes for PARTIAL consensus (< 3 models)
  };

  /** Model key environment variable mapping */
  private readonly MODEL_KEY_MAP: Record<string, string[]> = {
    groq:        ['GROQ_API_KEY'],
    glm:         ['GLM_API_KEY'],
    gemini:      ['GOOGLE_AI_STUDIO_API_KEY'],
    huggingface: ['HUGGINGFACE_API_KEY', 'HF_API_KEY', 'OPENROUTER_API_KEY'],  // OpenRouter is fallback provider
    ollama:      ['OLLAMA_API_KEY'],  // Also checks OLLAMA_BASE_URL reachability
    bedrock:     ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    openrouter:  ['OPENROUTER_API_KEY'],  // 7th model — also serves as HF fallback
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

  /** Model routing — 7 models with smart fallbacks */
  private readonly ROUTING: Record<string, { primary: string; fallback: string[] }> = {
    sentiment:        { primary: 'groq',       fallback: ['glm', 'huggingface', 'ollama', 'gemini', 'bedrock', 'openrouter'] },
    market_analysis:  { primary: 'gemini',     fallback: ['bedrock', 'glm', 'huggingface', 'ollama', 'groq', 'openrouter'] },
    prediction:       { primary: 'glm',        fallback: ['ollama', 'gemini', 'bedrock', 'huggingface', 'groq', 'openrouter'] },
    signal_generation:{ primary: 'gemini',     fallback: ['bedrock', 'groq', 'glm', 'huggingface', 'ollama', 'openrouter'] },
    risk_analysis:    { primary: 'bedrock',    fallback: ['glm', 'ollama', 'gemini', 'huggingface', 'groq', 'openrouter'] },
    translation:      { primary: 'groq',       fallback: ['glm', 'ollama', 'huggingface', 'gemini', 'bedrock', 'openrouter'] },
    general:          { primary: 'gemini',     fallback: ['groq', 'glm', 'huggingface', 'ollama', 'bedrock', 'openrouter'] },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly groqService: GroqService,
    private readonly glmService: GlmService,
    private readonly geminiService: GeminiService,
    private readonly huggingfaceService: HuggingFaceService,
    private readonly ollamaService: OllamaService,
    private readonly bedrockService: BedrockService,
    private readonly openrouterService: OpenRouterService,
    private readonly usageLogger: AiUsageLoggerService,
    @Optional() private readonly ragService?: RagService,
    @Optional() @Inject(forwardRef(() => PredictionMarketService)) private readonly predictionMarket?: PredictionMarketService,
    @Optional() private readonly redis?: RedisService,
  ) {
    this.logger.log('🎼 AI Orchestrator initialized — 7 models + Prediction Market (Groq, Gemini, GLM-4, HuggingFace, Ollama, Bedrock, OpenRouter)');
    if (this.ragService) {
      this.logger.log('📚 RAG integration enabled — context retrieval active');
    }
    if (this.predictionMarket) {
      this.logger.log('🔮 Prediction Market integration enabled — 8th model active');
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
    const redisCacheKey = `ai:analysis:${this._hashPrompt(JSON.stringify(request))}`;

    // Check Redis cache first (shared across instances)
    try {
      const cached = await this.redis?.get(redisCacheKey);
      if (cached) {
        this.logger.debug(`🎼 Redis cache hit for ${request.type} analysis`);
        return JSON.parse(cached);
      }
    } catch {}

    const enrichedRequest = await this._enrichWithContext(request);

    // Check in-memory cache as fallback (faster, per-instance)
    const memCacheKey = this._getCacheKey(enrichedRequest);
    const memCached = this._getCachedResult(memCacheKey);
    if (memCached) {
      this.logger.debug(`🎯 Memory cache hit for ${enrichedRequest.type} analysis`);
      return memCached;
    }

    // In-flight request deduplication: if the same symbol+type+prompt is already
    // being processed, reuse that promise instead of making a duplicate AI call.
    const dedupeKey = `ai:${enrichedRequest.type}:${enrichedRequest.symbol || ''}:${this._hashPrompt(JSON.stringify(enrichedRequest))}`;
    const existing = this.inFlightRequests.get(dedupeKey);
    if (existing) {
      this.logger.debug(`🔄 Deduplicating in-flight AI request for ${dedupeKey}`);
      return existing;
    }

    const promise = this._executeAnalysis(enrichedRequest, redisCacheKey, memCacheKey);
    this.inFlightRequests.set(dedupeKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlightRequests.delete(dedupeKey);
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
          this.logger.debug(`⏭️ Model ${model} in cooldown (${consecutiveFails} consecutive 429s) — skipping`);
          continue;
        }
        // Cooldown expired — try again
        this.modelConsecutiveFailures.set(model, 0);
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
        // Reset consecutive failure counter on success
        this.modelConsecutiveFailures.delete(model);
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
        // FIX: Only track consecutive 429 failures for cooldown
        // Other errors are logged but don't block future calls
        if (error.response?.status === 429 || error.message?.includes('429')) {
          const fails = (this.modelConsecutiveFailures.get(model) || 0) + 1;
          this.modelConsecutiveFailures.set(model, fails);
          if (fails >= this.FAILURES_BEFORE_COOLDOWN) {
            this.modelCooldowns.set(model, Date.now() + this.COOLDOWN_MS);
            this.logger.warn(`🚫 Model ${model} rate-limited ${fails}x consecutively — 10s cooldown`);
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
      result = {
        model: 'Orchestrator/Fallback',
        content: 'التحليل غير متاح حالياً. يرجى المحاولة لاحقاً.',
        confidence: 0,
        processingTimeMs: 0,
        language: enrichedRequest.language || 'ar',
        isFallback: true,
      };
    }

    // Cache the result in both Redis and in-memory with type-specific TTL
    const redisTTL = this.CACHE_TTL[enrichedRequest.type] || this.CACHE_TTL.general;
    try {
      await this.redis?.set(redisCacheKey, JSON.stringify(result), redisTTL);
    } catch {}

    // Also cache in memory for faster subsequent access
    this._setCachedResult(memCacheKey, result, enrichedRequest.type);

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
  async getConsensusAnalysis(symbol: string): Promise<{
    consensusScore: number;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[];
    masterStrategy: string;
  }> {
    // Check Redis cache first — consensus valid for 10 minutes (increased from 5)
    const cacheKey = `ai:consensus:${symbol}`;
    try {
      const cached = await this.redis?.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        this.logger.debug(`🎼 Redis cache hit for consensus: ${symbol}`);
        return parsed;
      }
    } catch {}

    // Also check in-memory cache
    const memKey = `consensus:${symbol}`;
    const memCached = this._getCachedResult(memKey);
    if (memCached) {
      this.logger.debug(`🎯 Memory cache hit for consensus: ${symbol}`);
      return memCached as any;
    }

    this.logger.log(`🎼 Initiating AI Council Consensus for ${symbol} — 7 models + Prediction Market`);

    try {
      const decisionInstruction = '\n\nIMPORTANT: End your response with a single line in exactly this format: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD". This line must be the last line of your response.';

      // FIX: Fetch live market data before building prompts to prevent hallucinations
      // (e.g., Groq saying BTC is $28,500 when it's actually much higher)
      const marketData = await this._fetchQuickMarketData(symbol);
      const marketDataPrefix = marketData.price > 0
        ? `\nبيانات السوق الحية:\n- السعر الحالي: ${marketData.price.toLocaleString()}$\n- مؤشر RSI: ${marketData.rsi}\n- مؤشر MACD: ${marketData.macd}\n\nاستخدم هذه البيانات الحية كأساس لتحليلك. لا تخترع أسعاراً أو مؤشرات من عندك.\n`
        : '';

      // FIX: Each model has exactly ONE role — no duplicates, no role overlap
      // 7 models = 7 roles (1:1 mapping) — clean, predictable, no rate-limiting
      // + 1 Prediction Market role (8th model) — votes only when relevant events exist
      const roles = [
        { id: 'tech',   name: 'المحلل الفني',    model: 'gemini',     fallbackModels: ['groq', 'glm', 'huggingface', 'openrouter'],  prompt: `${marketDataPrefix}حلل الشارت الفني لـ ${symbol} بناءً على الاتجاه والزخم والمقاومات.${decisionInstruction}` },
        { id: 'sent',   name: 'محلل المشاعر',     model: 'groq',       fallbackModels: ['gemini', 'glm', 'huggingface', 'openrouter'], prompt: `حلل مشاعر السوق الحالية لـ ${symbol} من منظور الأخبار والزخم.${decisionInstruction}` },
        { id: 'risk',   name: 'خبير المخاطر',     model: 'bedrock',    fallbackModels: ['glm', 'gemini', 'groq', 'openrouter'],        prompt: `حدد مخاطر دخول صفقة على ${symbol} الآن ومستويات وقف الخسارة مع تقييم السيناريو الأسوأ.${decisionInstruction}` },
        { id: 'macro',  name: 'خبير الماكرو',     model: 'glm',        fallbackModels: ['gemini', 'groq', 'huggingface', 'openrouter'], prompt: `حلل الوضع الاقتصادي العام وتأثيره على ${symbol} مع مراعاة السياق العربي.${decisionInstruction}` },
        { id: 'pattern',name: 'خبير الأنماط',     model: 'huggingface',fallbackModels: ['groq', 'gemini', 'glm', 'openrouter'],        prompt: `هل ترى أي أنماط تاريخية متكررة في حركة ${symbol} الحالية؟${decisionInstruction}` },
        { id: 'exec',   name: 'استراتيجي التنفيذ', model: 'ollama',     fallbackModels: ['groq', 'gemini', 'glm', 'openrouter'],        prompt: `ما هو أفضل توقيت للدخول في ${symbol} بناءً على السيولة والنماذج المتاحة؟${decisionInstruction}` },
        { id: 'diverge',name: 'محلل التباين',     model: 'openrouter', fallbackModels: ['groq', 'gemini', 'glm', 'huggingface'],        prompt: `ابحث عن إشارات معاكسة أو تباينات في تحليل ${symbol} — هل هناك سبب لعدم اتباع الاتجاه السائد؟${decisionInstruction}` },
      ];

      // ── 8th Model: Prediction Market Analyst ──
      // Only votes when there are relevant prediction market events for this symbol.
      // Dynamic confidence based on event count and liquidity (per architecture review).
      let predictionMarketVote: { role: string; model: string; vote: string; confidence: number; reason: string } | null = null;
      if (this.predictionMarket) {
        try {
          const pmVote = await this.predictionMarket.getCouncilVote(symbol);
          if (pmVote) {
            predictionMarketVote = {
              role: 'محلل الأسواق التنبؤية',
              model: 'PredictionMarket/8th',
              vote: pmVote.vote,
              confidence: pmVote.confidence,
              reason: pmVote.reason,
            };
            this.logger.log(`🔮 8th model vote: ${pmVote.vote} (${pmVote.confidence}%) — ${pmVote.eventsAnalyzed} events`);
          }
        } catch (error: any) {
          this.logger.debug(`🔮 8th model abstained (no data or error): ${error.message}`);
        }
      }

      const start = Date.now();

      // FIX: Resolve the best available model for each role (primary → fallback chain)
      // Uses the new lenient cooldown: only skip if 3+ consecutive 429 failures
      const activeRoles = roles.map(role => {
        const models = [role.model, ...(role.fallbackModels || [])];
        for (const model of models) {
          // Check cooldown: only active after 3+ consecutive 429 failures
          const consecutiveFails = this.modelConsecutiveFailures.get(model) || 0;
          if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
            const cooldownUntil = this.modelCooldowns.get(model) || 0;
            if (Date.now() < cooldownUntil) continue; // In short cooldown
          }
          if (!this._isModelKeyAvailable(model)) continue; // Skip — no API key
          return { ...role, resolvedModel: model };
        }
        // All models for this role unavailable — keep primary (will return stub)
        this.logger.warn(`⚠️ All models for role ${role.name} are unavailable`);
        return { ...role, resolvedModel: role.model };
      });

      this.logger.log(`🎼 Resolved models for consensus: ${activeRoles.map(r => `${r.name}→${r.resolvedModel}`).join(', ')}`);

      const results = await Promise.allSettled(
        activeRoles.map(async (role) => {
          const roleStart = Date.now();
          try {
            const response = await this._callModel(role.resolvedModel, {
              symbol,
              prompt: role.prompt,
              type: 'market_analysis',
              language: 'ar',
            });
            // Log each council member's AI usage
            if (response.confidence > 0) {
              this.usageLogger?.logSuccess({
                model: response.model,
                endpoint: 'consensus',
                inputPrompt: role.prompt,
                outputContent: response.content,
                latencyMs: Date.now() - roleStart,
                cached: false,
              });
            }
            // If model returned stub (confidence 0), track as consecutive failure
            // But DON'T put in cooldown — stub means key missing, cooldown won't help
            if (response.confidence === 0) {
              this.logger.warn(`🚫 Model ${role.resolvedModel} returned stub — no cooldown (key likely missing)`);
            }
            // Reset consecutive failures on success
            if (response.confidence > 0) {
              this.modelConsecutiveFailures.delete(role.resolvedModel);
            }
            return { ...role, response };
          } catch (error: any) {
            this.usageLogger?.logFailure({
              model: role.model,
              endpoint: 'consensus',
              inputPrompt: role.prompt,
              latencyMs: Date.now() - roleStart,
              errorMessage: error.message,
            });
            // Track 429 failures but don't cooldown for other errors
            if (error.response?.status === 429 || error.message?.includes('429')) {
              const fails = (this.modelConsecutiveFailures.get(role.resolvedModel) || 0) + 1;
              this.modelConsecutiveFailures.set(role.resolvedModel, fails);
              if (fails >= this.FAILURES_BEFORE_COOLDOWN) {
                this.modelCooldowns.set(role.resolvedModel, Date.now() + this.COOLDOWN_MS);
              }
            }
            // Don't put model in cooldown for other errors — just try again next time
            throw error;
          }
        }),
      );

      const analyses: any[] = [];
      let buyWeight = 0;
      let sellWeight = 0;
      let holdWeight = 0;
      let totalConfidence = 0;
      // FIX: Track individual confidences per vote type for accurate consensus calculation
      let buyConfidences: number[] = [];
      let sellConfidences: number[] = [];
      let holdConfidences: number[] = [];

      // Track which roles got valid responses and which need fallback retry
      const roleResponses = new Map<string, { name: string; response: AIAnalysisResponse }>();

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value && res.value.response) {
          const { name, response, id } = res.value;
          if (response.confidence > 0) {
            roleResponses.set(id, { name, response });
          }
        }
      }

      // ── Phase 2: Retry failed/stub roles with fallback models ──
      // FIX: When a model returns confidence=0 (stub) or throws an error,
      // the role gets no valid response. Previously, the role was simply
      // skipped. Now we try fallback models for each failed role.
      const failedRoles = activeRoles.filter(role => !roleResponses.has(role.id));
      if (failedRoles.length > 0) {
        this.logger.log(`🔄 Phase 2: Retrying ${failedRoles.length} failed roles with fallback models...`);

        for (const role of failedRoles) {
          for (const fallbackModel of role.fallbackModels || []) {
            // Skip if same as already-tried model, or unavailable, or in cooldown
            if (fallbackModel === role.resolvedModel) continue;
            if (!this._isModelKeyAvailable(fallbackModel)) continue;
            const consecutiveFails = this.modelConsecutiveFailures.get(fallbackModel) || 0;
            if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
              const cooldownUntil = this.modelCooldowns.get(fallbackModel) || 0;
              if (Date.now() < cooldownUntil) continue;
            }

            try {
              this.logger.log(`🔄 Retrying role "${role.name}" with fallback model: ${fallbackModel}`);
              const response = await this._callModel(fallbackModel, {
                symbol,
                prompt: role.prompt,
                type: 'market_analysis',
                language: 'ar',
              });

              if (response.confidence > 0) {
                this.logger.log(`✅ Fallback model ${fallbackModel} succeeded for role "${role.name}"`);
                roleResponses.set(role.id, { name: role.name, response });
                // Reset consecutive failures on success
                this.modelConsecutiveFailures.delete(fallbackModel);
                break; // Role filled, stop trying fallbacks
              } else {
                this.logger.warn(`⚠️ Fallback model ${fallbackModel} returned stub for role "${role.name}"`);
              }
            } catch (error: any) {
              // Track 429 errors
              if (error.response?.status === 429 || error.message?.includes('429')) {
                const fails = (this.modelConsecutiveFailures.get(fallbackModel) || 0) + 1;
                this.modelConsecutiveFailures.set(fallbackModel, fails);
                if (fails >= this.FAILURES_BEFORE_COOLDOWN) {
                  this.modelCooldowns.set(fallbackModel, Date.now() + this.COOLDOWN_MS);
                }
              }
              this.logger.warn(`❌ Fallback model ${fallbackModel} failed for role "${role.name}": ${error.message}`);
              continue;
            }
          }
        }
      }

      // ── Build analyses from all successful role responses ──
      for (const [roleId, { name, response }] of roleResponses) {
        const content = response.content || '';
        const vote = this._parseVote(content);

        const conf = response.confidence || 0.5;
        if (vote === 'BUY') { buyWeight += conf; buyConfidences.push(conf); }
        else if (vote === 'SELL') { sellWeight += conf; sellConfidences.push(conf); }
        else { holdWeight += conf; holdConfidences.push(conf); }
        totalConfidence += conf;

        analyses.push({
          role: name,
          model: response.model,
          vote,
          confidence: Math.round(conf * 100),
          reason: content.slice(0, 300) + '...',
        });
      }

      // ── Add 8th model (Prediction Market) vote if available ──
      if (predictionMarketVote) {
        const pmConf = predictionMarketVote.confidence / 100;
        if (predictionMarketVote.vote === 'BUY') { buyWeight += pmConf; buyConfidences.push(pmConf); }
        else if (predictionMarketVote.vote === 'SELL') { sellWeight += pmConf; sellConfidences.push(pmConf); }
        else { holdWeight += pmConf; holdConfidences.push(pmConf); }
        totalConfidence += pmConf;

        analyses.push(predictionMarketVote);
      }

      let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let consensusScore = 0;

      // FIX: Consensus score = average confidence of models that agreed on the final recommendation
      // Previously, HOLD used (1 - |buyPct - sellPct|) * 50 which capped at 50%
      // Now: BUY score = avg confidence of BUY voters, SELL score = avg of SELL voters, HOLD = avg of HOLD voters
      if (totalConfidence > 0) {
        const buyPct = buyWeight / totalConfidence;
        const sellPct = sellWeight / totalConfidence;
        if (buyPct > 0.6) {
          recommendation = 'BUY';
          consensusScore = buyConfidences.length > 0
            ? Math.round(buyConfidences.reduce((a, b) => a + b, 0) / buyConfidences.length * 100)
            : Math.round(buyPct * 100);
        } else if (sellPct > 0.6) {
          recommendation = 'SELL';
          consensusScore = sellConfidences.length > 0
            ? Math.round(sellConfidences.reduce((a, b) => a + b, 0) / sellConfidences.length * 100)
            : Math.round(sellPct * 100);
        } else {
          recommendation = 'HOLD';
          consensusScore = holdConfidences.length > 0
            ? Math.round(holdConfidences.reduce((a, b) => a + b, 0) / holdConfidences.length * 100)
            : Math.round((1 - Math.abs(buyPct - sellPct)) * 50);
        }
      }

      // FIX: Generate master strategy with 15s timeout — don't let it block the response
      // If it fails, use a quick summary instead
      const totalModels = 7 + (predictionMarketVote ? 1 : 0);
      let masterStrategyContent = `إجماع المجلس (${analyses.length}/${totalModels} نماذج): ${recommendation === 'BUY' ? 'شراء قوي' : recommendation === 'SELL' ? 'بيع قوي' : 'انتظار'} بنسبة ثقة ${consensusScore}%.`;

      if (analyses.length > 0) {
        try {
          const strategyPrompt = `بناءً على تحليلات المجلس التالية، لخص الاستراتيجية النهائية للتداول على ${symbol} بالعربية بإيجاز:\n${analyses.map(a => `${a.role} (${a.model}): ${a.vote} (${a.confidence}%)`).join('\n')}`;

          // Try Groq first with 15s timeout, then quick fallback
          const strategyPromise = this.groqService.analyze({
            symbol,
            prompt: strategyPrompt,
            type: 'signal_generation',
            language: 'ar',
          });

          // Race: 15s timeout for master strategy (don't block the whole response)
          const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Strategy timeout')), 15000)
          );

          const masterStrategy = await Promise.race([strategyPromise, timeoutPromise]).catch(() => null);

          if (masterStrategy && masterStrategy.confidence > 0 && masterStrategy.content.length > 10) {
            masterStrategyContent = masterStrategy.content;
          }
        } catch {
          // Use the summary already set above
        }
      }

      this.logger.log(`✅ Consensus: ${recommendation} (${consensusScore}%) from ${analyses.length}/${totalModels} models in ${Date.now() - start}ms`);

      const result = { consensusScore, recommendation, analyses, masterStrategy: masterStrategyContent };

      // FIX: Cache with differentiated TTL — partial results (2 min) vs full results (10 min)
      // This prevents stale partial results from blocking retries that could reach more models.
      const isPartial = analyses.length < 3
      const consensusCacheTTL = isPartial
        ? this.CACHE_TTL.consensus_partial   // 2 minutes for partial (< 3 models)
        : this.CACHE_TTL.consensus;           // 10 minutes for full (3+ models)
      try {
        await this.redis?.set(cacheKey, JSON.stringify(result), consensusCacheTTL);
      } catch {}
      this._setCachedResult(memKey, result as any, isPartial ? 'consensus_partial' : 'consensus');

      return result;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`❌ AI Council failed: ${err.message}`, err.stack);
      return { consensusScore: 0, recommendation: 'HOLD', analyses: [], masterStrategy: 'خطأ في معالجة طلب إجماع النماذج.' };
    }
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
      keyHint?: string;
    }>;
    summary: { total: number; keysAvailable: number; apiWorking: number };
  }> {
    const models = [
      { id: 'groq', name: 'Groq/Llama 3.3 70B', keyEnv: 'GROQ_API_KEY' },
      { id: 'gemini', name: 'Gemini 2.0 Flash', keyEnv: 'GOOGLE_AI_STUDIO_API_KEY' },
      { id: 'glm', name: 'GLM-4 (Zhipu AI)', keyEnv: 'GLM_API_KEY' },
      { id: 'huggingface', name: 'HuggingFace/Mistral-7B', keyEnv: 'HF_API_KEY' },  // Also checks OPENROUTER_API_KEY as fallback
      { id: 'ollama', name: 'Ollama/Qwen2.5', keyEnv: 'OLLAMA_API_KEY' },
      { id: 'bedrock', name: 'Bedrock/Claude 3.5', keyEnv: 'AWS_ACCESS_KEY_ID' },
      { id: 'openrouter', name: 'OpenRouter/Llama 3.1', keyEnv: 'OPENROUTER_API_KEY' },
    ];

    const results = await Promise.all(
      models.map(async (m) => {
        const keyAvailable = this._isModelKeyAvailable(m.id);
        let apiWorking = false;
        let responseTimeMs = 0;
        let error: string | undefined;
        let keyHint: string | undefined;

        // Show key presence (first 4 chars + ***) for debugging
        let keyValue = this.configService.get<string>(m.keyEnv, '') ||
          (m.id === 'bedrock' ? this.configService.get<string>('AWS_ACCESS_KEY_ID', '') : '');
        if (keyValue) {
          keyHint = `${keyValue.substring(0, 4)}***${keyValue.length > 8 ? keyValue.substring(keyValue.length - 4) : ''}`;
        } else {
          keyHint = '(empty)';
        }

        // For Ollama, also show the base URL
        if (m.id === 'ollama') {
          const baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
          keyHint = `URL: ${baseUrl}`;
        }

        // For Bedrock, show region
        if (m.id === 'bedrock') {
          const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
          keyHint = `Region: ${region}, Key: ${keyHint}`;
        }

        // For HuggingFace, also check OpenRouter fallback key
        if (m.id === 'huggingface') {
          const orKey = this.configService.get<string>('OPENROUTER_API_KEY', '');
          if (orKey) {
            keyHint += ` + OR:${orKey.substring(0, 4)}***${orKey.length > 8 ? orKey.substring(orKey.length - 4) : ''}`;
          }
        }

        // For OpenRouter, show key hint
        if (m.id === 'openrouter') {
          const orKey = this.configService.get<string>('OPENROUTER_API_KEY', '');
          if (orKey) {
            keyHint = `${orKey.substring(0, 4)}***${orKey.length > 8 ? orKey.substring(orKey.length - 4) : ''}`;
          }
        }

        if (!keyAvailable) {
          error = `API key not configured or not available on this platform`;
          return { model: m.name, keyAvailable, apiWorking, responseTimeMs, error, keyHint };
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

        return { model: m.name, keyAvailable, apiWorking, responseTimeMs, error, keyHint };
      }),
    );

    return {
      models: results,
      summary: {
        total: results.length,
        keysAvailable: results.filter(r => r.keyAvailable).length,
        apiWorking: results.filter(r => r.apiWorking).length,
      },
    };
  }

  /**
   * Analyze with ALL 6 models
   */
  async analyzeWithAllModels(request: AIAnalysisRequest): Promise<{
    analyses: AIAnalysisResponse[];
    consensus: string;
  }> {
    const enrichedRequest = await this._enrichWithContext(request);
    this.logger.debug(`🎼 Multi-model analysis for ${enrichedRequest.type} — 7 models`);

    const results = await Promise.allSettled([
      this.groqService.analyze(enrichedRequest),
      this.glmService.analyze(enrichedRequest),
      this.geminiService.analyze(enrichedRequest),
      this.huggingfaceService.analyze(enrichedRequest),
      this.ollamaService.analyze(enrichedRequest),
      this.bedrockService.analyze(enrichedRequest),
      this.openrouterService.analyze(enrichedRequest),
    ]);

    const analyses: AIAnalysisResponse[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.confidence > 0) {
        analyses.push(result.value);
      }
    }

    const consensus = analyses.length > 0
      ? `تم الحصول على ${analyses.length} تحليل من ${analyses.length}/7 نماذج ذكاء اصطناعي`
      : 'لا توجد نماذج متاحة حالياً';

    return { analyses, consensus };
  }

  /**
   * Get available models status — 7 models
   * Checks actual API key availability from environment variables
   */
  getModelsStatus(): { model: string; available: boolean; specialty: string }[] {
    return [
      { model: 'Groq/Llama 3.3 70B',        available: this._isModelKeyAvailable('groq'),        specialty: '⚡ سرعة فائقة — تحليل المشاعر والترجمة الفورية' },
      { model: 'GLM-4 (Zhipu AI)',           available: this._isModelKeyAvailable('glm'),         specialty: '🧠 تحليل عربي — سياق طويل 200k' },
      { model: 'Gemini 2.0 Flash',           available: this._isModelKeyAvailable('gemini'),      specialty: '💎 تحليل إبداعي — استراتيجية ومنطق مهيكل' },
      { model: 'HuggingFace/Mistral-7B',     available: this._isModelKeyAvailable('huggingface'), specialty: '🤗 مجاني مفتوح المصدر — تحليل متنوع' },
      { model: 'Ollama/Qwen2.5',             available: this._isModelKeyAvailable('ollama'),      specialty: '🏠 محلي بدون تكلفة — دعم عربي ممتاز' },
      { model: 'Bedrock/Claude 3.5 Sonnet',  available: this._isModelKeyAvailable('bedrock'),     specialty: '☁️ مؤسسي AWS — مخاطر وامتثال' },
      { model: 'OpenRouter/Llama 3.1',       available: this._isModelKeyAvailable('openrouter'),  specialty: '🔀 تباين ومعاكسة — نماذج مجانية متنوعة' },
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
  private _isModelKeyAvailable(model: string): boolean {
    const keys = this.MODEL_KEY_MAP[model];
    if (!keys) return false;
    if (!this.configService) return false;

    // Special handling for Ollama: cloud URLs are reachable, localhost is not on cloud
    if (model === 'ollama') {
      const apiKey = this.configService.get<string>('OLLAMA_API_KEY', '');
      const baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', '');

      // If on cloud AND URL is localhost → unreachable
      if (this._isCloudEnvironment() && this._isLocalhostUrl(baseUrl || 'http://localhost:11434')) {
        this.logger.debug(`🏠 Ollama skipped — localhost URL unreachable on cloud platform`);
        return false;
      }

      // Available if API key is set OR a non-default base URL is configured (cloud Ollama)
      return !!(apiKey && apiKey.trim()) || !!(baseUrl && baseUrl.trim() && !this._isLocalhostUrl(baseUrl));
    }

    // For huggingface: ANY of the listed keys works (HF_API_KEY, HUGGINGFACE_API_KEY, or OPENROUTER_API_KEY)
    // For bedrock: ALL listed keys must be present (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)
    if (model === 'huggingface') {
      return keys.some(key => {
        const value = this.configService!.get<string>(key, '');
        return !!(value && value.trim());
      });
    }
    // Default: ALL listed keys must be present and non-empty
    return keys.every(key => {
      const value = this.configService!.get<string>(key, '');
      return !!(value && value.trim());
    });
  }

  // ── Private: Vote Parsing ──
  /**
   * Parse the vote from AI model response with improved accuracy:
   * 1. First check for structured DECISION: line
   * 2. Fall back to keyword search with negation detection
   * 3. Use last occurrence (later statements override earlier ones)
   */
  private _parseVote(content: string): 'BUY' | 'SELL' | 'HOLD' {
    // ── Step 1: Check for structured DECISION line ──
    const decisionMatch = content.match(/DECISION:\s*(BUY|SELL|HOLD)/i);
    if (decisionMatch) {
      const decision = decisionMatch[1].toUpperCase() as 'BUY' | 'SELL' | 'HOLD';
      this.logger.debug(`📋 Parsed DECISION line: ${decision}`);
      return decision;
    }

    // ── Step 2: Keyword search with negation detection (fallback) ──
    const negationPatternsAr = ['لا', 'ليس', 'ليست', 'لن', 'غير', 'لا أنصح', 'لا ننصح', 'لا يوصى'];
    const negationPatternsEn = ["don't", 'not', 'no', 'never', 'avoid', 'against', 'refrain'];

    // Buy keywords and their Arabic/English variants
    const buyKeywords = [
      { word: 'شراء', lang: 'ar' },
      { word: 'صعود', lang: 'ar' },
      { word: 'شرائية', lang: 'ar' },
      { word: 'BUY', lang: 'en' },
      { word: 'BULLISH', lang: 'en' },
      { word: 'LONG', lang: 'en' },
    ];
    const sellKeywords = [
      { word: 'بيع', lang: 'ar' },
      { word: 'هبوط', lang: 'ar' },
      { word: 'بيعية', lang: 'ar' },
      { word: 'SELL', lang: 'en' },
      { word: 'BEARISH', lang: 'en' },
      { word: 'SHORT', lang: 'en' },
    ];

    // Find the LAST occurrence of buy/sell keywords with negation check
    let lastBuyIndex = -1;
    let lastBuyNegated = false;
    let lastSellIndex = -1;
    let lastSellNegated = false;

    const upperContent = content.toUpperCase();

    for (const kw of buyKeywords) {
      const textToSearch = kw.lang === 'en' ? upperContent : content;
      const wordToFind = kw.lang === 'en' ? kw.word.toUpperCase() : kw.word;
      let searchFrom = 0;
      while (true) {
        const idx = textToSearch.indexOf(wordToFind, searchFrom);
        if (idx === -1) break;
        if (idx > lastBuyIndex) {
          lastBuyIndex = idx;
          // Check for negation before the keyword (look at 30 chars before)
          const preceding = textToSearch.substring(Math.max(0, idx - 30), idx);
          const negPatterns = kw.lang === 'ar' ? negationPatternsAr : negationPatternsEn;
          lastBuyNegated = negPatterns.some(neg => preceding.includes(neg));
        }
        searchFrom = idx + wordToFind.length;
      }
    }

    for (const kw of sellKeywords) {
      const textToSearch = kw.lang === 'en' ? upperContent : content;
      const wordToFind = kw.lang === 'en' ? kw.word.toUpperCase() : kw.word;
      let searchFrom = 0;
      while (true) {
        const idx = textToSearch.indexOf(wordToFind, searchFrom);
        if (idx === -1) break;
        if (idx > lastSellIndex) {
          lastSellIndex = idx;
          const preceding = textToSearch.substring(Math.max(0, idx - 30), idx);
          const negPatterns = kw.lang === 'ar' ? negationPatternsAr : negationPatternsEn;
          lastSellNegated = negPatterns.some(neg => preceding.includes(neg));
        }
        searchFrom = idx + wordToFind.length;
      }
    }

    // Determine vote based on last non-negated keyword occurrence
    const lastBuy = lastBuyNegated ? -1 : lastBuyIndex;
    const lastSell = lastSellNegated ? -1 : lastSellIndex;

    if (lastBuy === -1 && lastSell === -1) return 'HOLD';
    if (lastBuy > lastSell) return 'BUY';
    if (lastSell > lastBuy) return 'SELL';
    return 'HOLD'; // equal or both -1
  }

  // ── Private: Cache Management ──
  /**
   * Generate a cache key from the request parameters
   */
  private _getCacheKey(request: AIAnalysisRequest): string {
    const raw = `${request.type}:${request.symbol || ''}:${request.language || ''}:${request.prompt}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Retrieve a cached result if it exists and hasn't expired
   */
  private _getCachedResult(key: string): AIAnalysisResponse | null {
    const entry = this.responseCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.responseCache.delete(key);
      return null;
    }
    return entry.result;
  }

  /**
   * Store a result in the cache with the appropriate TTL
   */
  private _setCachedResult(key: string, result: AIAnalysisResponse, type: string): void {
    const ttl = this.CACHE_TTL[type] || this.CACHE_TTL.general;
    this.responseCache.set(key, { result, expiresAt: Date.now() + ttl });
    // FIX: Evict oldest entries when cache exceeds max size to prevent unbounded growth
    if (this.responseCache.size > this.MAX_CACHE_SIZE) {
      this._evictOldestEntries(Math.floor(this.MAX_CACHE_SIZE * 0.2)); // Remove 20% of oldest entries
    }
    // Periodically clean up expired entries (every 100 inserts)
    if (this.responseCache.size % 100 === 0) {
      this._cleanExpiredCache();
    }
  }

  /**
   * Remove all expired entries from the cache
   */
  private _cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.responseCache) {
      if (now > entry.expiresAt) {
        this.responseCache.delete(key);
      }
    }
  }

  /**
   * Evict the oldest entries from the cache (by insertion order in Map)
   * Called when cache exceeds MAX_CACHE_SIZE to prevent unbounded memory growth.
   */
  private _evictOldestEntries(count: number): void {
    let evicted = 0;
    for (const key of this.responseCache.keys()) {
      if (evicted >= count) break;
      this.responseCache.delete(key);
      evicted++;
    }
    this.logger.debug(`🗑️ Cache eviction: removed ${evicted} oldest entries (size: ${this.responseCache.size})`);
  }

  /**
   * Invalidate all cached results (call when new data arrives)
   */
  clearCache(): void {
    this.responseCache.clear();
    this.logger.debug('🗑️ AI response cache cleared');
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
    switch (model) {
      case 'groq':        return this.groqService.analyze(request);
      case 'glm':         return this.glmService.analyze(request);
      case 'gemini':      return this.geminiService.analyze(request);
      case 'huggingface': return this.huggingfaceService.analyze(request);
      case 'ollama':      return this.ollamaService.analyze(request);
      case 'bedrock':     return this.bedrockService.analyze(request);
      case 'openrouter':  return this.openrouterService.analyze(request);
      default:            return this.geminiService.analyze(request);
    }
  }

  // ── Private: Cache Key Hashing ──
  // FIX: Upgraded from MD5 to SHA-256 for stronger dedup hashing
  private _hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

  // ── Private: Live Market Data Fetch ──
  /**
   * FIX: Fetch quick market data (price, RSI, MACD) to prevent AI hallucinations.
   * Models like Groq were inventing prices (e.g., saying BTC is $28,500 when it's
   * actually $95,000+). This method fetches real data and injects it into prompts.
   * Uses Binance public API for crypto — no auth required.
   * Falls back gracefully if fetch fails (returns price=0).
   */
  private async _fetchQuickMarketData(symbol: string): Promise<{ price: number; rsi: number; macd: string }> {
    try {
      // Normalize symbol for Binance: BTC/USD → BTCUSDT, ETH/USD → ETHUSDT
      const binanceSymbol = symbol.replace(/[\/\-]/g, '').replace('USD', 'USDT').toUpperCase();

      // Fetch 24hr ticker for current price
      const tickerUrl = `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`;
      const tickerRes = await axios.get(tickerUrl, { timeout: 5000 });
      const price = parseFloat(tickerRes.data?.lastPrice || '0');

      if (price === 0) return { price: 0, rsi: 50, macd: 'غير متوفر' };

      // Fetch klines (OHLCV) for RSI and MACD calculation — 30 candles on 1h timeframe
      const klinesUrl = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=30`;
      const klinesRes = await axios.get(klinesUrl, { timeout: 5000 });
      const closes: number[] = (klinesRes.data || []).map((k: any) => parseFloat(k[4])).filter((v: number) => !isNaN(v));

      const rsi = this._calculateRSI(closes);
      const macd = this._calculateMACD(closes);

      this.logger.debug(`📊 Market data for ${symbol}: price=${price}, RSI=${rsi}, MACD=${macd}`);
      return { price, rsi, macd };
    } catch (error: any) {
      this.logger.debug(`📊 Market data fetch failed for ${symbol}: ${error.message} — using defaults`);
      return { price: 0, rsi: 50, macd: 'غير متوفر' };
    }
  }

  /** Calculate RSI (Relative Strength Index) from closing prices */
  private _calculateRSI(closes: number[], period = 14): number {
    if (closes.length < period + 1) return 50; // Not enough data
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return Math.round(100 - (100 / (1 + rs)));
  }

  /** Calculate MACD summary from closing prices */
  private _calculateMACD(closes: number[]): string {
    if (closes.length < 26) return 'غير متوفر (بيانات غير كافية)';
    const ema12 = this._calculateEMA(closes, 12);
    const ema26 = this._calculateEMA(closes, 26);
    const macdLine = ema12 - ema26;
    const direction = macdLine > 0 ? 'صاعد' : 'هبوطي';
    return `${direction} (القيمة: ${macdLine.toFixed(2)})`;
  }

  /** Calculate Exponential Moving Average */
  private _calculateEMA(data: number[], period: number): number {
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    return ema;
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
    let confidence = 0.5; // Base confidence

    // Factor 1: Response completeness (0-0.15)
    if (content.length > 200) confidence += 0.05;
    if (content.length > 500) confidence += 0.05;
    if (content.length > 1000) confidence += 0.05;

    // Factor 2: Structured output (0-0.15)
    if (content.includes('DECISION:')) confidence += 0.10;
    if (content.includes('{') && content.includes('}')) confidence += 0.05;

    // Factor 3: Model-specific base confidence
    const modelBaseConfidence: Record<string, number> = {
      groq: 0.75,
      gemini: 0.85,
      glm: 0.80,
      huggingface: 0.70,
      ollama: 0.75,
      bedrock: 0.88,
      openrouter: 0.72,
    };
    confidence = (confidence + (modelBaseConfidence[model] || 0.7)) / 2;

    // Factor 4: Arabic content detection (boost for Arabic-focused platform)
    const arabicPattern = /[\u0600-\u06FF]/;
    if (arabicPattern.test(content)) confidence += 0.03;

    return Math.min(Math.max(confidence, 0.1), 0.99);
  }

}
