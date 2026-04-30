import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroqService, AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { GlmService } from './glm.service';
import { GeminiService } from './gemini.service';
import { HuggingFaceService } from './huggingface.service';
import { OllamaService } from './ollama.service';
import { BedrockService } from './bedrock.service';
import { RagService } from './rag.service';
import { AiUsageLoggerService } from './ai-usage-logger.service';
import { RedisService } from '../../../common/redis/redis.service';
import * as crypto from 'crypto';

/**
 * AI Orchestrator — Routes tasks to the optimal AI model
 *
 * 6 AI Models Available (using existing API keys):
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ Model                 │ Key                │ Specialty              │
 * ├───────────────────────┼────────────────────┼────────────────────────┤
 * │ Groq/Llama 3.3 70B   │ GROQ_API_KEY       │ ⚡ سرعة — مشاعر/ترجمة │
 * │ Gemini 2.0 Flash     │ GOOGLE_AI_STUDIO   │ 💎 إبداعي — استراتيجية│
 * │ GLM-4 (Zhipu AI)     │ GLM_API_KEY        │ 🧠 عربي — سياق طويل   │
 * │ HuggingFace/Mistral  │ HUGGINGFACE_API_KEY│ 🤗 مجاني — متنوع      │
 * │ Ollama/Qwen2.5       │ OLLAMA_API_KEY     │ 🏠 محلي — بدون تكلفة  │
 * │ Bedrock/Claude 3.5   │ AWS_ACCESS_KEY_ID  │ ☁️ مؤسسي — مخاطر/أمان │
 * └───────────────────────┴────────────────────┴────────────────────────┘
 *
 * Task → Model Routing:
 * ┌──────────────────────┬──────────────────────────────────────────────┐
 * │ Task Type            │ Best Model + Fallback Chain                  │
 * ├──────────────────────┼──────────────────────────────────────────────┤
 * │ sentiment            │ Groq → GLM → HuggingFace → Ollama           │
 * │ market_analysis      │ Gemini → Bedrock → GLM → HuggingFace        │
 * │ prediction           │ GLM → Ollama → Gemini → Bedrock             │
 * │ signal_generation    │ Gemini → Bedrock → Groq → GLM               │
 * │ risk_analysis        │ Bedrock → GLM → Ollama → Gemini             │
 * │ translation          │ Groq → GLM → Ollama → HuggingFace           │
 * │ general              │ Gemini → Groq → GLM → HuggingFace → Ollama  │
 * └──────────────────────┴──────────────────────────────────────────────┘
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
    huggingface: ['HUGGINGFACE_API_KEY'],
    ollama:      ['OLLAMA_API_KEY'],  // Also checks OLLAMA_BASE_URL reachability
    bedrock:     ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
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

  /** Model routing — 6 models with smart fallbacks */
  private readonly ROUTING: Record<string, { primary: string; fallback: string[] }> = {
    sentiment:        { primary: 'groq',       fallback: ['glm', 'huggingface', 'ollama', 'gemini', 'bedrock'] },
    market_analysis:  { primary: 'gemini',     fallback: ['bedrock', 'glm', 'huggingface', 'ollama', 'groq'] },
    prediction:       { primary: 'glm',        fallback: ['ollama', 'gemini', 'bedrock', 'huggingface', 'groq'] },
    signal_generation:{ primary: 'gemini',     fallback: ['bedrock', 'groq', 'glm', 'huggingface', 'ollama'] },
    risk_analysis:    { primary: 'bedrock',    fallback: ['glm', 'ollama', 'gemini', 'huggingface', 'groq'] },
    translation:      { primary: 'groq',       fallback: ['glm', 'ollama', 'huggingface', 'gemini', 'bedrock'] },
    general:          { primary: 'gemini',     fallback: ['groq', 'glm', 'huggingface', 'ollama', 'bedrock'] },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly groqService: GroqService,
    private readonly glmService: GlmService,
    private readonly geminiService: GeminiService,
    private readonly huggingfaceService: HuggingFaceService,
    private readonly ollamaService: OllamaService,
    private readonly bedrockService: BedrockService,
    @Optional() private readonly ragService?: RagService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly usageLogger?: AiUsageLoggerService,
  ) {
    this.logger.log('🎼 AI Orchestrator initialized — 6 models (Groq, Gemini, GLM-4, HuggingFace, Ollama, Bedrock)');
    if (this.ragService) {
      this.logger.log('📚 RAG integration enabled — context retrieval active');
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

    this.logger.log(`🎼 Initiating AI Council Consensus for ${symbol} — 6 models`);

    try {
      const decisionInstruction = '\n\nIMPORTANT: End your response with a single line in exactly this format: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD". This line must be the last line of your response.';

      // FIX: Each role has primary + fallback models to prevent disconnection
      // When primary model fails/rate-limited, fallback model takes over
      const roles = [
        { id: 'tech',   name: 'المحلل الفني',    model: 'gemini',     fallbackModels: ['groq', 'glm', 'huggingface'],  prompt: `حلل الشارت الفني لـ ${symbol} بناءً على الاتجاه والزخم والمقاومات.${decisionInstruction}` },
        { id: 'sent',   name: 'محلل المشاعر',     model: 'groq',       fallbackModels: ['glm', 'gemini', 'huggingface'], prompt: `حلل مشاعر السوق الحالية لـ ${symbol} من منظور الأخبار والزخم.${decisionInstruction}` },
        { id: 'risk',   name: 'خبير المخاطر',     model: 'bedrock',    fallbackModels: ['glm', 'gemini', 'groq'],        prompt: `حدد مخاطر دخول صفقة على ${symbol} الآن ومستويات وقف الخسارة مع تقييم السيناريو الأسوأ.${decisionInstruction}` },
        { id: 'macro',  name: 'خبير الماكرو',     model: 'glm',        fallbackModels: ['gemini', 'groq', 'huggingface'], prompt: `حلل الوضع الاقتصادي العام وتأثيره على ${symbol} مع مراعاة السياق العربي.${decisionInstruction}` },
        { id: 'pattern',name: 'خبير الأنماط',     model: 'huggingface',fallbackModels: ['groq', 'gemini', 'glm'],        prompt: `هل ترى أي أنماط تاريخية متكررة في حركة ${symbol} الحالية؟${decisionInstruction}` },
        { id: 'exec',   name: 'استراتيجي التنفيذ', model: 'ollama',     fallbackModels: ['groq', 'gemini', 'glm'],        prompt: `ما هو أفضل توقيت للدخول في ${symbol} بناءً على السيولة والنماذج المحلية؟${decisionInstruction}` },
      ];

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
      let totalConfidence = 0;

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
        if (vote === 'BUY') buyWeight += conf;
        else if (vote === 'SELL') sellWeight += conf;
        totalConfidence += conf;

        analyses.push({
          role: name,
          model: response.model,
          vote,
          confidence: Math.round(conf * 100),
          reason: content.slice(0, 300) + '...',
        });
      }

      let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let consensusScore = 0;

      if (totalConfidence > 0) {
        const buyPct = buyWeight / totalConfidence;
        const sellPct = sellWeight / totalConfidence;
        if (buyPct > 0.6) { recommendation = 'BUY'; consensusScore = Math.round(buyPct * 100); }
        else if (sellPct > 0.6) { recommendation = 'SELL'; consensusScore = Math.round(sellPct * 100); }
        else { recommendation = 'HOLD'; consensusScore = Math.round((1 - Math.abs(buyPct - sellPct)) * 50); }
      }

      // FIX: Generate master strategy with 15s timeout — don't let it block the response
      // If it fails, use a quick summary instead
      let masterStrategyContent = `إجماع المجلس (${analyses.length}/6 نماذج): ${recommendation === 'BUY' ? 'شراء قوي' : recommendation === 'SELL' ? 'بيع قوي' : 'انتظار'} بنسبة ثقة ${consensusScore}%.`;

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

      this.logger.log(`✅ Consensus: ${recommendation} (${consensusScore}%) from ${analyses.length}/6 models in ${Date.now() - start}ms`);

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
   * Analyze with ALL 6 models
   */
  async analyzeWithAllModels(request: AIAnalysisRequest): Promise<{
    analyses: AIAnalysisResponse[];
    consensus: string;
  }> {
    const enrichedRequest = await this._enrichWithContext(request);
    this.logger.debug(`🎼 Multi-model analysis for ${enrichedRequest.type} — 6 models`);

    const results = await Promise.allSettled([
      this.groqService.analyze(enrichedRequest),
      this.glmService.analyze(enrichedRequest),
      this.geminiService.analyze(enrichedRequest),
      this.huggingfaceService.analyze(enrichedRequest),
      this.ollamaService.analyze(enrichedRequest),
      this.bedrockService.analyze(enrichedRequest),
    ]);

    const analyses: AIAnalysisResponse[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.confidence > 0) {
        analyses.push(result.value);
      }
    }

    const consensus = analyses.length > 0
      ? `تم الحصول على ${analyses.length} تحليل من ${analyses.length}/6 نماذج ذكاء اصطناعي`
      : 'لا توجد نماذج متاحة حالياً';

    return { analyses, consensus };
  }

  /**
   * Get available models status — 6 models
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
    ];
  }

  // ── Private: Model Key Availability ──
  /**
   * Check if the required environment variable(s) for a model are set and non-empty
   *
   * FIX: Ollama on cloud platforms with localhost URL is NOT truly available —
   * the service will return a stub (confidence=0) even though the API key is set.
   * This caused the orchestrator to assign roles to Ollama that would never produce
   * results, with no fallback triggered.
   */
  private _isModelKeyAvailable(model: string): boolean {
    const keys = this.MODEL_KEY_MAP[model];
    if (!keys) return false;
    if (!this.configService) return false;

    // Special handling for Ollama: must have a reachable URL AND (API key or non-localhost URL)
    if (model === 'ollama') {
      const apiKey = this.configService.get<string>('OLLAMA_API_KEY', '');
      const baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', '');

      // FIX: On cloud platforms, localhost Ollama is unreachable — mark as unavailable
      // so the role resolution picks a fallback model instead of wasting the role
      if (this._isCloudEnvironment() && this._isLocalhostUrl(baseUrl || 'http://localhost:11434')) {
        this.logger.debug(`🏠 Ollama skipped — localhost URL unreachable on cloud platform`);
        return false;
      }

      // Available if API key is set or a non-default base URL is configured
      return !!(apiKey && apiKey.trim()) || !!(baseUrl && baseUrl.trim() && baseUrl !== 'http://localhost:11434');
    }

    // All listed keys must be present and non-empty
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
      default:            return this.geminiService.analyze(request);
    }
  }

  // ── Private: Cache Key Hashing ──
  // FIX: Upgraded from MD5 to SHA-256 for stronger dedup hashing
  private _hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

}
