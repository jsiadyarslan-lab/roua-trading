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
import { RagService } from './rag.service';
import { AiUsageLoggerService } from './ai-usage-logger.service';
import { withExponentialBackoff } from './retry.util';
import { RedisService } from '../../../common/redis/redis.service';
import { PredictionMarketService } from '../../prediction-market/prediction-market.service';
import * as crypto from 'crypto';
import axios from 'axios';

/**
 * AI Orchestrator — Routes tasks to the optimal AI model
 *
 * 8 AI Models Available (using existing API keys):
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
 * │ DeepSeek V3          │ DEEPSEEK_API_KEY   │ 🔬 سيناريوهات — تحليل │
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
   *  FIX #4: Previous cooldown was too short (10s → 120s now).
   *  However, the REAL problem was that after cooldown expires, the model
   *  was immediately retried without checking if it's actually healthy.
   *  New approach: Progressive cooldown — each consecutive cooldown period
   *  doubles (120s → 240s → 480s) up to a max of 30 minutes.
   *  On success, cooldown resets immediately.
   */
  private readonly modelCooldowns = new Map<string, number>();
  private readonly modelConsecutiveFailures = new Map<string, number>();
  private readonly modelCooldownLevel = new Map<string, number>(); // FIX #4: Progressive level
  private readonly BASE_COOLDOWN_MS = 120_000; // Base cooldown: 2 minutes
  private readonly MAX_COOLDOWN_MS = 30 * 60 * 1000; // Max cooldown: 30 minutes
  private readonly FAILURES_BEFORE_COOLDOWN = 3; // FIX: Increased from 2 to 3 — give models more chances before cooldown

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
    gemini:      ['GOOGLE_AI_STUDIO_API_KEY', 'GEMINI_API_KEY'],  // FIX: Check both env var names
    huggingface: ['HUGGINGFACE_API_KEY', 'HF_API_KEY'],  // FIX: Removed OPENROUTER_API_KEY — HuggingFace should only be marked available if its own key exists
    ollama:      ['OLLAMA_API_KEY'],  // Also checks OLLAMA_BASE_URL reachability
    bedrock:     ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    openrouter:  ['OPENROUTER_API_KEY'],  // 7th model — also serves as HF fallback
    deepseek:    ['DEEPSEEK_API_KEY'],     // 8th model — DeepSeek V3
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

  /** Model routing — 8 models with smart fallbacks */
  private readonly ROUTING: Record<string, { primary: string; fallback: string[] }> = {
    sentiment:        { primary: 'groq',       fallback: ['glm', 'huggingface', 'ollama', 'gemini', 'bedrock', 'deepseek', 'openrouter'] },
    market_analysis:  { primary: 'gemini',     fallback: ['bedrock', 'glm', 'huggingface', 'ollama', 'groq', 'deepseek', 'openrouter'] },
    prediction:       { primary: 'glm',        fallback: ['ollama', 'gemini', 'bedrock', 'huggingface', 'groq', 'deepseek', 'openrouter'] },
    signal_generation:{ primary: 'gemini',     fallback: ['bedrock', 'groq', 'glm', 'huggingface', 'ollama', 'deepseek', 'openrouter'] },
    risk_analysis:    { primary: 'bedrock',    fallback: ['glm', 'ollama', 'gemini', 'huggingface', 'groq', 'deepseek', 'openrouter'] },
    translation:      { primary: 'groq',       fallback: ['glm', 'ollama', 'huggingface', 'gemini', 'bedrock', 'deepseek', 'openrouter'] },
    general:          { primary: 'gemini',     fallback: ['groq', 'glm', 'huggingface', 'ollama', 'bedrock', 'deepseek', 'openrouter'] },
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
    private readonly deepseekService: DeepSeekService,
    private readonly usageLogger: AiUsageLoggerService,
    @Optional() private readonly ragService?: RagService,
    @Optional() @Inject(forwardRef(() => PredictionMarketService)) private readonly predictionMarket?: PredictionMarketService,
    @Optional() private readonly redis?: RedisService,
  ) {
    this.logger.log('🎼 AI Orchestrator initialized — 8 models + Prediction Market (Groq, Gemini, GLM-4, HuggingFace, Ollama, Bedrock, OpenRouter, DeepSeek)');
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

    // FIX: Periodic cleanup of expired in-memory cache entries (every 5 minutes)
    // Prevents memory leak where expired entries persist indefinitely when the service is idle.
    setInterval(() => {
      const now = Date.now();
      let expired = 0;
      for (const [key, entry] of this.responseCache) {
        if (now >= entry.expiresAt) {
          this.responseCache.delete(key);
          expired++;
        }
      }
      if (expired > 0) {
        this.logger.debug(`🧹 Cleaned ${expired} expired cache entries (remaining: ${this.responseCache.size})`);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Analyze using the optimal AI model based on task type
   * Falls back through the model chain if primary fails
   */
  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // Generate a single consistent cache key for Redis
    const redisCacheKey = `ai:analysis:${this._hashPrompt(this._stableStringify(request))}`;

    // Check Redis cache first (shared across instances)
    try {
      const cached = await this.redis?.get(redisCacheKey);
      if (cached) {
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
        return JSON.parse(cached);
      }
    } catch {}

    const enrichedRequest = await this._enrichWithContext(request);

    // FIX: Inject live market data into ALL analysis requests to prevent price hallucinations.
    // Previously, only getConsensusAnalysis() injected market data. Single-model analysis
    // via analyze() had ZERO price grounding, causing AI to invent prices like "BTC is $28,500".
    if (enrichedRequest.symbol) {
      try {
        const marketData = await this._fetchQuickMarketData(enrichedRequest.symbol);
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
    const memCacheKey = this._getCacheKey(enrichedRequest);
    const memCached = this._getCachedResult(memCacheKey);
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
    const dedupeKey = `ai:${enrichedRequest.type}:${enrichedRequest.symbol || ''}:${this._hashPrompt(this._stableStringify(enrichedRequest))}`;
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
        // Reset consecutive failure counter AND cooldown level on success
        this.modelConsecutiveFailures.delete(model);
        this.modelCooldownLevel.delete(model); // FIX #4: Reset progressive level on success
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
    // FIX: Cache key version bumped to v3 to invalidate stale pre-fix results
    // that had contradictory labels (e.g., 89% HOLD). Old v1/v2 cache entries
    // will not be found, forcing fresh computation with the fixed parseVote().
    const cacheKey = `ai:consensus:v3:${symbol}`;
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

    this.logger.log(`🎼 Initiating AI Council Consensus for ${symbol} — 8 models + Prediction Market`);

    try {
      const decisionInstruction = '\n\nIMPORTANT: End your response with a single line in exactly this format: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD". This line must be the last line of your response.';

      // FIX: Fetch live market data before building prompts to prevent hallucinations
      // (e.g., Groq saying BTC is $28,500 when it's actually much higher)
      const marketData = await this._fetchQuickMarketData(symbol);
      const marketDataPrefix = marketData.price > 0
        ? `\n⛔⛔⛔ تحذير حرج — بيانات السوق الحية (ممنوع اختراع أسعار!):\n- 🔴 السعر الحالي الفعلي: ${marketData.price.toLocaleString()}$ — استخدم هذا الرقم فقط! أي سعر آخر تذكره سيكون كاذباً!\n- مؤشر RSI الحقيقي: ${marketData.rsi} (استخدم هذه القيمة فقط)\n- مؤشر MACD: ${marketData.macd}\n\n⚠️ تحذير نهائي: إذا ذكرت أي سعر غير ${marketData.price.toLocaleString()}$ فتحليلك كله سيكون مرفوضاً وكاذباً. السعر هو ${marketData.price.toLocaleString()}$ فقط لا غير.\n`
        : '\n⚠️⚠️⚠️ لم نتمكن من جلب بيانات السوق الحية — ممنوع تماماً اختراع أي سعر أو رقم من عندك. إذا احتجت لذكر السعر اكتب "السعر غير متاح". أي سعر تختلقه سيجعل تحليلك غير موثوق.\n';

      // FIX: Each model has exactly ONE role — no duplicates, no role overlap
      // 8 models = 8 roles (1:1 mapping) — clean, predictable, no rate-limiting
      // + 1 Prediction Market role (9th model) — votes only when relevant events exist
      const roles = [
        { id: 'tech',   name: 'المحلل الفني',    model: 'gemini',     fallbackModels: ['groq', 'glm', 'huggingface', 'openrouter'],  prompt: `${marketDataPrefix}حلل الشارت الفني لـ ${symbol} بناءً على الاتجاه والزخم والمقاومات.${decisionInstruction}` },
        { id: 'sent',   name: 'محلل المشاعر',     model: 'groq',       fallbackModels: ['gemini', 'glm', 'huggingface', 'openrouter'], prompt: `${marketDataPrefix}حلل مشاعر السوق الحالية لـ ${symbol} من منظور الأخبار والزخم.${decisionInstruction}` },
        { id: 'risk',   name: 'خبير المخاطر',     model: 'bedrock',    fallbackModels: ['glm', 'gemini', 'groq', 'openrouter'],        prompt: `${marketDataPrefix}حدد مخاطر دخول صفقة على ${symbol} الآن ومستويات وقف الخسارة مع تقييم السيناريو الأسوأ.${decisionInstruction}` },
        { id: 'macro',  name: 'خبير الماكرو',     model: 'glm',        fallbackModels: ['gemini', 'groq', 'huggingface', 'openrouter'], prompt: `${marketDataPrefix}حلل الوضع الاقتصادي العام وتأثيره على ${symbol} مع مراعاة السياق العربي.${decisionInstruction}` },
        { id: 'pattern',name: 'خبير الأنماط',     model: 'huggingface',fallbackModels: ['groq', 'gemini', 'glm', 'openrouter'],        prompt: `${marketDataPrefix}هل ترى أي أنماط تاريخية متكررة في حركة ${symbol} الحالية؟${decisionInstruction}` },
        { id: 'exec',   name: 'استراتيجي التنفيذ', model: 'ollama',     fallbackModels: ['groq', 'gemini', 'glm', 'openrouter'],        prompt: `${marketDataPrefix}ما هو أفضل توقيت للدخول في ${symbol} بناءً على السيولة والنماذج المتاحة؟${decisionInstruction}` },
        { id: 'diverge',name: 'محلل التباين',     model: 'openrouter', fallbackModels: ['groq', 'gemini', 'glm', 'huggingface'],        prompt: `${marketDataPrefix}ابحث عن إشارات معاكسة أو تباينات في تحليل ${symbol} — هل هناك سبب لعدم اتباع الاتجاه السائد؟${decisionInstruction}` },
        { id: 'scenario', name: 'محلل السيناريوهات', model: 'deepseek',    fallbackModels: ['gemini', 'groq', 'glm', 'openrouter'],        prompt: `${marketDataPrefix}حلل السيناريوهات المحتملة لـ ${symbol} مع تقدير احتمالات كل سيناريو.${decisionInstruction}` },
      ];

      // ── 9th Model: Prediction Market Analyst ──
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
            this.logger.log(`🔮 9th model vote: ${pmVote.vote} (${pmVote.confidence}%) — ${pmVote.eventsAnalyzed} events`);
          }
        } catch (error: any) {
          this.logger.debug(`🔮 9th model abstained (no data or error): ${error.message}`);
        }
      }

      const start = Date.now();

      // FIX: Resolve the best available model for each role (primary → fallback chain)
      // Uses the new lenient cooldown: only skip if 3+ consecutive 429 failures
      // FIX: On cloud with localhost Ollama URL, skip it as primary for 'exec' role
      // FIX 2: If Ollama has a cloud URL (like ollama.com), keep it as primary — it works!
      const activeRoles = roles.map(role => {
        let roleModels = [role.model, ...(role.fallbackModels || [])];
        // If Ollama is the primary model but we're on cloud WITH localhost URL, move it to end of fallback list
        // Cloud Ollama URLs (ollama.com, etc.) should remain as primary — they work fine
        if (role.model === 'ollama' && this._isCloudEnvironment()) {
          const ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
          if (this._isLocalhostUrl(ollamaBaseUrl || 'http://localhost:11434')) {
            roleModels = [...(role.fallbackModels || []), 'ollama'];
          }
          // If Ollama has a cloud URL, keep it as primary — no deprioritization needed
        }
        const models = roleModels;
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
              this.modelCooldownLevel.delete(role.resolvedModel); // FIX #4: Reset progressive level
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
                // FIX #4: Progressive cooldown
                const level = (this.modelCooldownLevel.get(role.resolvedModel) || 0) + 1;
                this.modelCooldownLevel.set(role.resolvedModel, level);
                const cooldownMs = Math.min(this.BASE_COOLDOWN_MS * Math.pow(2, level - 1), this.MAX_COOLDOWN_MS);
                this.modelCooldowns.set(role.resolvedModel, Date.now() + cooldownMs);
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
                  // FIX #4: Progressive cooldown
                  const level = (this.modelCooldownLevel.get(fallbackModel) || 0) + 1;
                  this.modelCooldownLevel.set(fallbackModel, level);
                  const cooldownMs = Math.min(this.BASE_COOLDOWN_MS * Math.pow(2, level - 1), this.MAX_COOLDOWN_MS);
                  this.modelCooldowns.set(fallbackModel, Date.now() + cooldownMs);
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

      // ── Add 9th model (Prediction Market) vote if available ──
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
      // Previously, the 0.6 threshold was too strict — 59% BUY would be labeled HOLD!
      // Now: Majority wins (threshold 0.5). BUY if buyPct > sellPct AND buyPct > 0.5,
      // SELL if sellPct > buyPct AND sellPct > 0.5, otherwise HOLD.
      // This ensures the label ALWAYS matches the majority vote direction.
      if (totalConfidence > 0) {
        const buyPct = buyWeight / totalConfidence;
        const sellPct = sellWeight / totalConfidence;
        const holdPct = holdWeight / totalConfidence;

        // Majority vote: whichever side has the highest weighted percentage
        if (buyPct > sellPct && buyPct > holdPct) {
          recommendation = 'BUY';
          consensusScore = buyConfidences.length > 0
            ? Math.round(buyConfidences.reduce((a, b) => a + b, 0) / buyConfidences.length * 100)
            : Math.round(buyPct * 100);
        } else if (sellPct > buyPct && sellPct > holdPct) {
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

        // Ensure minimum consensus score of 50% when majority direction is clear
        // (prevents showing 30% consensus when 5/8 models agree just because confidences are low)
        if (recommendation !== 'HOLD' && consensusScore < 50) {
          const votersForRec = recommendation === 'BUY' ? buyConfidences : sellConfidences;
          const totalVoters = analyses.length + (predictionMarketVote ? 1 : 0);
          if (votersForRec.length >= Math.ceil(totalVoters / 2)) {
            consensusScore = Math.max(consensusScore, Math.round((votersForRec.length / totalVoters) * 100));
          }
        }
      }

      // FIX: Generate master strategy with 15s timeout — don't let it block the response
      // If it fails, use a quick summary instead
      const totalModels = 8 + (predictionMarketVote ? 1 : 0);
      // FIX: Label must ALWAYS match recommendation — no contradictions
      const recLabel = recommendation === 'BUY' ? 'شراء' : recommendation === 'SELL' ? 'بيع' : 'انتظار';
      const recStrength = consensusScore >= 80 ? 'قوي' : consensusScore >= 60 ? 'واضح' : 'محتمل';
      let masterStrategyContent = `إجماع المجلس (${analyses.length}/${totalModels} نماذج): ${recLabel} ${recStrength} بنسبة ثقة ${consensusScore}%.`;

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
      const isPartial = analyses.length < 3;
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
      { id: 'huggingface', name: 'HuggingFace/Mistral-7B', keyEnv: 'HUGGINGFACE_API_KEY', altKeyEnv: 'HF_API_KEY' },  // Also checks OPENROUTER_API_KEY as fallback
      { id: 'ollama', name: 'Ollama/Qwen2.5', keyEnv: 'OLLAMA_API_KEY' },
      { id: 'bedrock', name: 'Bedrock/Claude 3.5', keyEnv: 'AWS_ACCESS_KEY_ID' },
      { id: 'openrouter', name: 'OpenRouter/Llama 3.1', keyEnv: 'OPENROUTER_API_KEY' },
      { id: 'deepseek', name: 'DeepSeek V3', keyEnv: 'DEEPSEEK_API_KEY' },
    ];

    const results = await Promise.all(
      models.map(async (m) => {
        const keyAvailable = this._isModelKeyAvailable(m.id);
        let apiWorking = false;
        let responseTimeMs = 0;
        let error: string | undefined;
        let keyHint: string | undefined;

        // Show key presence (first 4 chars + ***) for debugging
        // FIX: Also check altKeyEnv (e.g., GEMINI_API_KEY as alternative to GOOGLE_AI_STUDIO_API_KEY)
        const altKeyEnv = (m as any).altKeyEnv as string | undefined;
        let keyValue = this.configService.get<string>(m.keyEnv, '') ||
          (altKeyEnv ? this.configService.get<string>(altKeyEnv, '') : '') ||
          (m.id === 'bedrock' ? this.configService.get<string>('AWS_ACCESS_KEY_ID', '') : '');
        if (keyValue) {
          keyHint = `${keyValue.substring(0, 4)}***${keyValue.length > 8 ? keyValue.substring(keyValue.length - 4) : ''}`;
          if (altKeyEnv) keyHint += ` (checked: ${m.keyEnv} or ${altKeyEnv})`;
        } else {
          keyHint = `(empty — tried: ${m.keyEnv}${altKeyEnv ? ` and ${altKeyEnv}` : ''})`;
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
    const models = ['groq', 'glm', 'gemini', 'huggingface', 'ollama', 'bedrock', 'openrouter'];
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
    this.logger.debug(`🎼 Multi-model analysis for ${enrichedRequest.type} — 8 models`);

    const results = await Promise.allSettled([
      this.groqService.analyze(enrichedRequest),
      this.glmService.analyze(enrichedRequest),
      this.geminiService.analyze(enrichedRequest),
      this.huggingfaceService.analyze(enrichedRequest),
      this.ollamaService.analyze(enrichedRequest),
      this.bedrockService.analyze(enrichedRequest),
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
      ? `تم الحصول على ${analyses.length} تحليل من ${analyses.length}/8 نماذج ذكاء اصطناعي`
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
      { model: 'GLM-4 (Zhipu AI)',           available: this._isModelKeyAvailable('glm'),         specialty: '🧠 تحليل عربي — سياق طويل 200k' },
      { model: 'Gemini 2.0 Flash',           available: this._isModelKeyAvailable('gemini'),      specialty: '💎 تحليل إبداعي — استراتيجية ومنطق مهيكل' },
      { model: 'HuggingFace/Mistral-7B',     available: this._isModelKeyAvailable('huggingface'), specialty: '🤗 مجاني مفتوح المصدر — تحليل متنوع' },
      { model: 'Ollama/Qwen2.5',             available: this._isModelKeyAvailable('ollama'),      specialty: '🏠 محلي بدون تكلفة — دعم عربي ممتاز' },
      { model: 'Bedrock/Claude 3.5 Sonnet',  available: this._isModelKeyAvailable('bedrock'),     specialty: '☁️ مؤسسي AWS — مخاطر وامتثال' },
      { model: 'OpenRouter/Llama 3.1',       available: this._isModelKeyAvailable('openrouter'),  specialty: '🔀 تباين ومعاكسة — نماذج مجانية متنوعة' },
      { model: 'DeepSeek V3',                available: this._isModelKeyAvailable('deepseek'),    specialty: '🔬 سيناريوهات — تحليل عميق' },
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

    // For gemini: ANY of the listed keys works (GOOGLE_AI_STUDIO_API_KEY or GEMINI_API_KEY)
    // For huggingface: ANY of the listed keys works (HF_API_KEY, HUGGINGFACE_API_KEY, or OPENROUTER_API_KEY)
    // For bedrock: ALL listed keys must be present (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)
    if (model === 'huggingface') {
      // Check HF keys first, then also check if OpenRouter key exists as fallback
      // (HuggingFaceService.analyze() can use OpenRouter as Strategy 3)
      const hasOwnKey = keys.some(key => {
        const value = this.configService!.get<string>(key, '');
        return !!(value && value.trim());
      });
      if (hasOwnKey) return true;
      // BUG FIX: Also check OPENROUTER_API_KEY — HuggingFaceService can use it as fallback
      const orKey = this.configService!.get<string>('OPENROUTER_API_KEY', '');
      return !!(orKey && orKey.trim());
    }
    if (model === 'gemini') {
      // BUG FIX: Gemini only needs ONE of the keys (GOOGLE_AI_STUDIO_API_KEY or GEMINI_API_KEY),
      // not BOTH. Previously used keys.every() which required both to be set,
      // causing Gemini to be marked unavailable when only one key was configured.
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
    // ═══════════════════════════════════════════════════════════════

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
    // FIX #10/#17: Wrap model calls with exponential backoff retry.
    // Only retries on 429 rate-limit and network errors.
    // Auth errors (401/403), validation errors (400), and 404s are NOT retried.
    // FIX #16: Pass logger to retry utility for consistent logging
    return withExponentialBackoff(
      () => {
        switch (model) {
          case 'groq':        return this.groqService.analyze(request);
          case 'glm':         return this.glmService.analyze(request);
          case 'gemini':      return this.geminiService.analyze(request);
          case 'huggingface': return this.huggingfaceService.analyze(request);
          case 'ollama':      return this.ollamaService.analyze(request);
          case 'bedrock':     return this.bedrockService.analyze(request);
          case 'openrouter':  return this.openrouterService.analyze(request);
          case 'deepseek':    return this.deepseekService.analyze(request);
          default:            return this.geminiService.analyze(request);
        }
      },
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
   * FIX: Deterministic JSON serialization — sort object keys recursively.
   * Prevents cache key mismatches when the same request object has
   * different key ordering across calls.
   */
  private _stableStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(v => this._stableStringify(v)).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + this._stableStringify(obj[k])).join(',') + '}';
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
   * Falls back to CoinGecko if Binance is unreachable (common on Railway).
   */
  private async _fetchQuickMarketData(symbol: string): Promise<{ price: number; rsi: number; macd: string }> {
    // Normalize symbol for Binance: BTC/USD → BTCUSDT, ETH/USD → ETHUSDT
    const binanceSymbol = symbol.replace(/[\/\-]/g, '').replace('USD', 'USDT').toUpperCase();

    // FIX: Try ALL price sources in parallel — first valid price wins!
    // Previous code only tried Binance → CoinGecko sequentially, which fails on
    // Railway because Binance blocks cloud IPs and CoinGecko has strict rate limits.
    // Now: Binance + CoinGecko + CoinCap + Bybit all in parallel.
    const pricePromise = Promise.any([
      // Source 1: Binance (most accurate, but often blocked on Railway)
      (async () => {
        const res = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`, { timeout: 4000 });
        const price = parseFloat(res.data?.lastPrice || '0');
        if (price <= 0) throw new Error('Binance price=0');
        return { price, source: 'binance' };
      })(),
      // Source 2: CoinGecko (reliable, free, no auth)
      (async () => {
        const coingeckoId = this._symbolToCoingeckoId(symbol);
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`, { timeout: 5000 });
        const price = res.data?.[coingeckoId]?.usd;
        if (!price || price <= 0) throw new Error('CoinGecko no price');
        return { price, source: 'coingecko' };
      })(),
      // Source 3: CoinCap (free, no auth, works on cloud platforms)
      (async () => {
        const base = symbol.split('/')[0].toLowerCase();
        const res = await axios.get(`https://api.coincap.io/v2/assets/${base}`, { timeout: 5000 });
        const price = parseFloat(res.data?.data?.priceUsd || '0');
        if (price <= 0) throw new Error('CoinCap price=0');
        return { price, source: 'coincap' };
      })(),
      // Source 4: Bybit (alternative exchange, works on cloud)
      (async () => {
        const bybitSymbol = symbol.replace(/[\/\-]/g, '').toUpperCase();
        const res = await axios.get(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${bybitSymbol}`, { timeout: 4000 });
        const price = parseFloat(res.data?.result?.list?.[0]?.lastPrice || '0');
        if (price <= 0) throw new Error('Bybit price=0');
        return { price, source: 'bybit' };
      })(),
    ]).catch(() => null);

    // Also try to get klines for RSI/MACD (Binance only)
    let rsi = 50;
    let macd = 'غير متوفر';
    try {
      const klinesRes = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=30`, { timeout: 4000 });
      const closes: number[] = (klinesRes.data || []).map((k: any) => parseFloat(k[4])).filter((v: number) => !isNaN(v));
      if (closes.length > 14) {
        rsi = this._calculateRSI(closes);
        macd = this._calculateMACD(closes);
      }
    } catch {
      // Klines unavailable — use defaults
    }

    // FIX: Try Bybit klines as fallback for RSI/MACD when Binance is blocked (common on Railway)
    if (rsi === 50) {
      try {
        const bybitSymbol = symbol.replace(/[\/\-]/g, '').toUpperCase();
        const bybitKlinesRes = await axios.get(
          `https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=60&limit=30`,
          { timeout: 4000 },
        );
        const closes: number[] = (bybitKlinesRes.data?.result?.list || [])
          .map((k: any) => parseFloat(k[4]))
          .filter((v: number) => !isNaN(v))
          .reverse(); // Bybit returns newest-first, we need oldest-first for RSI
        if (closes.length > 14) {
          rsi = this._calculateRSI(closes);
          macd = this._calculateMACD(closes);
        }
      } catch {
        // Bybit klines also unavailable
      }
    }

    const priceResult = await pricePromise;
    if (priceResult && priceResult.price > 0) {
      this.logger.debug(`📊 Market data for ${symbol}: price=${priceResult.price} from ${priceResult.source}, RSI=${rsi}, MACD=${macd}`);
      return { price: priceResult.price, rsi, macd };
    }

    // All sources failed
    this.logger.warn(`📊 ALL price sources failed for ${symbol} — AI may hallucinate prices`);
    return { price: 0, rsi: 50, macd: 'غير متوفر' };
  }

  /**
   * Map trading symbol to CoinGecko asset ID.
   * CoinGecko uses different IDs than Binance (e.g., BTC/USD → bitcoin).
   */
  private _symbolToCoingeckoId(symbol: string): string {
    const map: Record<string, string> = {
      'BTC/USD': 'bitcoin', 'BTC/USDT': 'bitcoin', 'BTCUSDT': 'bitcoin',
      'ETH/USD': 'ethereum', 'ETH/USDT': 'ethereum', 'ETHUSDT': 'ethereum',
      'SOL/USD': 'solana', 'SOL/USDT': 'solana', 'SOLUSDT': 'solana',
      'XRP/USD': 'ripple', 'XRP/USDT': 'ripple', 'XRPUSDT': 'ripple',
      'BNB/USD': 'binancecoin', 'BNB/USDT': 'binancecoin', 'BNBUSDT': 'binancecoin',
      'ADA/USD': 'cardano', 'ADA/USDT': 'cardano', 'ADAUSDT': 'cardano',
      'DOGE/USD': 'dogecoin', 'DOGE/USDT': 'dogecoin', 'DOGEUSDT': 'dogecoin',
      'DOT/USD': 'polkadot', 'DOT/USDT': 'polkadot', 'DOTUSDT': 'polkadot',
      'AVAX/USD': 'avalanche-2', 'AVAX/USDT': 'avalanche-2', 'AVAXUSDT': 'avalanche-2',
      'MATIC/USD': 'matic-network', 'MATIC/USDT': 'matic-network', 'MATICUSDT': 'matic-network',
      'LINK/USD': 'chainlink', 'LINK/USDT': 'chainlink', 'LINKUSDT': 'chainlink',
    };
    const normalized = symbol.replace(/[\/\-]/g, '').replace('USD', 'USDT').toUpperCase();
    // Try direct match first
    for (const [key, id] of Object.entries(map)) {
      if (key.toUpperCase() === normalized || key.toUpperCase() === symbol.toUpperCase()) return id;
    }
    // Fallback: extract base currency
    const base = symbol.split('/')[0].toUpperCase();
    for (const [key, id] of Object.entries(map)) {
      if (key.startsWith(base)) return id;
    }
    return base.toLowerCase();
  }

  /**
   * CoinGecko fallback for when Binance is blocked/unreachable (common on Railway).
   * Free, no auth required, works on cloud platforms.
   */
  private async _fetchCoinGeckoFallback(symbol: string): Promise<{ price: number; rsi: number; macd: string }> {
    try {
      const coingeckoId = this._symbolToCoingeckoId(symbol);
      const cgUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`;
      const cgRes = await axios.get(cgUrl, { timeout: 5000 });
      const cgPrice = cgRes.data?.[coingeckoId]?.usd;
      if (cgPrice && cgPrice > 0) {
        this.logger.debug(`📊 CoinGecko fallback for ${symbol}: price=${cgPrice}`);
        return { price: cgPrice, rsi: 50, macd: 'غير متوفر' };
      }
    } catch (error: any) {
      this.logger.debug(`📊 CoinGecko fallback also failed for ${symbol}: ${error.message}`);
    }
    return { price: 0, rsi: 50, macd: 'غير متوفر' };
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
