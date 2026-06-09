import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIOrchestratorService } from './ai-orchestrator.service';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { AiCacheService } from './ai-cache.service';
import { AiUsageLoggerService } from './ai-usage-logger.service';
import { MarketDataService } from './market-data.service';
import { PredictionMarketService } from '../../prediction-market/prediction-market.service';

/**
 * Consensus Analysis result — returned by the AI Council
 */
export interface ConsensusAnalysisResult {
  consensusScore: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[];
  masterStrategy: string;
  isFallback?: boolean;
}

/**
 * Internal role definition for the AI Council
 */
interface CouncilRole {
  id: string;
  name: string;
  model: string;
  fallbackModels: string[];
  prompt: string;
  resolvedModel?: string;
}

/**
 * Strategic Council Service — Extracted from AIOrchestratorService
 *
 * Manages the 8-role AI Council with model diversification,
 * Prediction Market vote integration, consensus score calculation,
 * cache management, and master strategy generation.
 *
 * Dependencies:
 * - AIOrchestratorService: shared model calling infrastructure, circuit breaker state,
 *   key availability checks, and vote parsing
 * - MarketDataService: live market data injection
 * - AiCacheService: Redis + in-memory caching for consensus results
 * - AiUsageLoggerService: AI API call tracking
 * - PredictionMarketService: 9th model vote (optional)
 * - ConfigService: environment configuration
 */
@Injectable()
export class StrategicCouncilService {
  private readonly logger = new Logger(StrategicCouncilService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly marketData: MarketDataService,
    private readonly cache: AiCacheService,
    private readonly usageLogger: AiUsageLoggerService,
    @Inject(forwardRef(() => AIOrchestratorService)) private readonly orchestrator: AIOrchestratorService,
    @Optional() private readonly predictionMarket?: PredictionMarketService,
  ) {
    this.logger.log('🏛️ Strategic Council Service initialized — 8-role AI Council + Prediction Market');
  }

  /**
   * AI Council Consensus — 8 specialist roles across diversified models
   *
   * Extracted from AIOrchestratorService.getConsensusAnalysis() to isolate
   * the council/consensus responsibility (~600 lines) from the orchestrator's
   * single-model routing logic.
   *
   * Cache key format preserved: `ai:consensus:v8:{symbol}` — existing cached
   * results remain valid.
   */
  async getConsensusAnalysis(symbol: string, options?: { forceFresh?: boolean; newsContext?: string; language?: 'ar' | 'en' }): Promise<ConsensusAnalysisResult> {
    const forceFresh = options?.forceFresh ?? false;
    const newsContext = options?.newsContext ?? '';
    const language = options?.language ?? 'ar';

    // ── Cache check (Redis only — in-memory disabled for consensus to prevent stale HOLD results) ──
    const cacheKey = `ai:consensus:v8:${symbol}`;
    const redis = this.cache.getRedis();
    if (!forceFresh) {
      try {
        const cached = await redis?.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          this.logger.debug(`🏛️ Redis cache hit for consensus: ${symbol}`);
          return parsed;
        }
      } catch {}
    } else {
      this.logger.log(`🏛️ ForceFresh=true: bypassing cache for consensus: ${symbol}`);
      try {
        await redis?.del(cacheKey);
      } catch {}
    }

    this.logger.log(`🏛️ Initiating AI Council Consensus for ${symbol} — 8 models + Prediction Market`);

    try {
      // ── Build decision instructions ──
      const decisionInstruction = language === 'en'
        ? '\n\n⛔⛔⛔ CRITICAL decision instructions:\n- You MUST end your response with exactly one line in this format: "DECISION: BUY" or "DECISION: SELL"\n- Writing "DECISION: HOLD" is STRICTLY FORBIDDEN — there is no waiting in active trading!\n- If you are not 100% sure, choose the most probable direction based on analysis\n- Even if signals are conflicting, choose the stronger direction (BUY or SELL)\n- The market always moves — there is no "wait" — pick a direction!\nThis line MUST be the last line of your response.'
        : '\n\n⛔⛔⛔ تعليمات حاسمة حول القرار:\n- يجب أن تنهي ردك بسطر واحد بالضبط بهذا الشكل: "DECISION: BUY" أو "DECISION: SELL"\n- ممنوع تماماً كتابة "DECISION: HOLD" — لا يوجد انتظار في التداول النشط!\n- إذا لم تكن متأكداً بنسبة 100%، اختر الاتجاه الأكثر احتمالاً بناءً على التحليل\n- حتى لو كانت الإشارات متضاربة، اختر الاتجاه الأقوى (BUY أو SELL)\n- السوق دائماً يتحرك — ليس هناك "انتظار" — اختر اتجاهاً!\nهذا السطر يجب أن يكون آخر سطر في ردك.';

      // ── Inject live market data to prevent price hallucinations ──
      const marketDataResult = await this.marketData.fetchQuickMarketData(symbol);
      const marketDataPrefix = marketDataResult.price > 0
        ? language === 'en'
          ? `\n⛔⛔⛔ CRITICAL WARNING — Live market data (DO NOT invent prices!):\n- 🔴 Actual current price: ${marketDataResult.price.toLocaleString()}$ — use ONLY this number! Any other price you mention will be false!\n- Real RSI: ${marketDataResult.rsi} (use this value only)\n- MACD: ${marketDataResult.macd}\n\n⚠️ Final warning: If you mention any price other than ${marketDataResult.price.toLocaleString()}$ your entire analysis will be rejected as false. The price is ${marketDataResult.price.toLocaleString()}$ and nothing else.\n`
          : `\n⛔⛔⛔ تحذير حرج — بيانات السوق الحية (ممنوع اختراع أسعار!):\n- 🔴 السعر الحالي الفعلي: ${marketDataResult.price.toLocaleString()}$ — استخدم هذا الرقم فقط! أي سعر آخر تذكره سيكون كاذباً!\n- مؤشر RSI الحقيقي: ${marketDataResult.rsi} (استخدم هذه القيمة فقط)\n- مؤشر MACD: ${marketDataResult.macd}\n\n⚠️ تحذير نهائي: إذا ذكرت أي سعر غير ${marketDataResult.price.toLocaleString()}$ فتحليلك كله سيكون مرفوضاً وكاذباً. السعر هو ${marketDataResult.price.toLocaleString()}$ فقط لا غير.\n`
        : language === 'en'
          ? '\n⚠️⚠️⚠️ Unable to fetch live market data — DO NOT invent any price or number. If you need to mention a price, write "Price unavailable". Any fabricated price makes your analysis unreliable.\n'
          : '\n⚠️⚠️⚠️ لم نتمكن من جلب بيانات السوق الحية — ممنوع تماماً اختراع أي سعر أو رقم من عندك. إذا احتجت لذكر السعر اكتب "السعر غير متاح". أي سعر تختلقه سيجعل تحليلك غير موثوق.\n';

      // ── Inject news context ──
      const newsPrefix = newsContext
        ? `\n📰📰📰 بيانات الأخبار المحللة (مصدر موثوق — خذها بعين الاعتبار!):\n${newsContext}\n⚠️ هذه أخبار حقيقية محللة — يجب أن تؤثر على قرارك!\n\n`
        : '';

      // ── Define the 8 Council Roles ──
      const roles: CouncilRole[] = language === 'en' ? [
        { id: 'tech',   name: 'Technical Analyst',    model: 'gemini',     fallbackModels: ['groq', 'ollama', 'deepseek', 'glm', 'bedrock', 'huggingface', 'openrouter'],  prompt: `${newsPrefix}${marketDataPrefix}Analyze the technical chart for ${symbol} based on trend, momentum, and resistance levels.${decisionInstruction}` },
        { id: 'sent',   name: 'Sentiment Analyst',     model: 'groq',       fallbackModels: ['deepseek', 'ollama', 'gemini', 'bedrock', 'glm', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}Analyze current market sentiment for ${symbol} from a news and momentum perspective.${decisionInstruction}` },
        { id: 'risk',   name: 'Risk Expert',     model: 'gemini',     fallbackModels: ['cerebras', 'groq', 'ollama', 'deepseek', 'glm', 'mistral', 'nvidia', 'bedrock'],        prompt: `${newsPrefix}${marketDataPrefix}Identify risks of entering a trade on ${symbol} now, stop-loss levels, and worst-case scenario assessment.${decisionInstruction}` },
        { id: 'macro',  name: 'Macro Expert',     model: 'gemini',     fallbackModels: ['cerebras', 'groq', 'deepseek', 'ollama', 'glm', 'bedrock', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}Analyze the macroeconomic situation and its impact on ${symbol}.${decisionInstruction}` },
        { id: 'pattern',name: 'Pattern Expert',     model: 'cerebras',   fallbackModels: ['ollama', 'mistral', 'groq', 'gemini', 'bedrock', 'glm', 'nvidia'],        prompt: `${newsPrefix}${marketDataPrefix}Do you see any recurring historical patterns in the current movement of ${symbol}?${decisionInstruction}` },
        { id: 'exec',   name: 'Execution Strategist', model: 'ollama',     fallbackModels: ['deepseek', 'bedrock', 'glm', 'gemini', 'groq', 'huggingface', 'openrouter'],        prompt: `${newsPrefix}${marketDataPrefix}What is the best timing for entering ${symbol} based on liquidity and available models?${decisionInstruction}` },
        { id: 'diverge',name: 'Divergence Analyst',     model: 'cerebras',   fallbackModels: ['groq', 'ollama', 'bedrock', 'gemini', 'mistral', 'glm', 'nvidia'],        prompt: `${newsPrefix}${marketDataPrefix}Look for counter-signals or divergences in the analysis of ${symbol} — is there a reason not to follow the prevailing trend?${decisionInstruction}` },
        { id: 'scenario', name: 'Scenario Analyst', model: 'mistral',  fallbackModels: ['ollama', 'bedrock', 'gemini', 'groq', 'glm', 'cerebras', 'nvidia'],        prompt: `${newsPrefix}${marketDataPrefix}Analyze possible scenarios for ${symbol} with probability estimates for each scenario.${decisionInstruction}` },
      ] : [
        { id: 'tech',   name: 'المحلل الفني',    model: 'gemini',     fallbackModels: ['groq', 'ollama', 'deepseek', 'glm', 'bedrock', 'huggingface', 'openrouter'],  prompt: `${newsPrefix}${marketDataPrefix}حلل الشارت الفني لـ ${symbol} بناءً على الاتجاه والزخم والمقاومات.${decisionInstruction}` },
        { id: 'sent',   name: 'محلل المشاعر',     model: 'groq',       fallbackModels: ['deepseek', 'ollama', 'gemini', 'bedrock', 'glm', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}حلل مشاعر السوق الحالية لـ ${symbol} من منظور الأخبار والزخم.${decisionInstruction}` },
        { id: 'risk',   name: 'خبير المخاطر',     model: 'gemini',     fallbackModels: ['cerebras', 'groq', 'ollama', 'deepseek', 'glm', 'mistral', 'nvidia', 'bedrock'],        prompt: `${newsPrefix}${marketDataPrefix}حدد مخاطر دخول صفقة على ${symbol} الآن ومستويات وقف الخسارة مع تقييم السيناريو الأسوأ.${decisionInstruction}` },
        { id: 'macro',  name: 'خبير الماكرو',     model: 'gemini',     fallbackModels: ['cerebras', 'groq', 'deepseek', 'ollama', 'glm', 'bedrock', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}حلل الوضع الاقتصادي العام وتأثيره على ${symbol} مع مراعاة السياق العربي.${decisionInstruction}` },
        { id: 'pattern',name: 'خبير الأنماط',     model: 'cerebras',   fallbackModels: ['ollama', 'mistral', 'groq', 'gemini', 'bedrock', 'glm', 'nvidia'],        prompt: `${newsPrefix}${marketDataPrefix}هل ترى أي أنماط تاريخية متكررة في حركة ${symbol} الحالية؟${decisionInstruction}` },
        { id: 'exec',   name: 'استراتيجي التنفيذ', model: 'ollama',     fallbackModels: ['deepseek', 'bedrock', 'glm', 'gemini', 'groq', 'huggingface', 'openrouter'],        prompt: `${newsPrefix}${marketDataPrefix}ما هو أفضل توقيت للدخول في ${symbol} بناءً على السيولة والنماذج المتاحة؟${decisionInstruction}` },
        { id: 'diverge',name: 'محلل التباين',     model: 'cerebras',   fallbackModels: ['groq', 'ollama', 'bedrock', 'gemini', 'mistral', 'glm', 'nvidia'],        prompt: `${newsPrefix}${marketDataPrefix}ابحث عن إشارات معاكسة أو تباينات في تحليل ${symbol} — هل هناك سبب لعدم اتباع الاتجاه السائد؟${decisionInstruction}` },
        { id: 'scenario', name: 'محلل السيناريوهات', model: 'mistral',  fallbackModels: ['ollama', 'bedrock', 'gemini', 'groq', 'glm', 'cerebras', 'nvidia'],        prompt: `${newsPrefix}${marketDataPrefix}حلل السيناريوهات المحتملة لـ ${symbol} مع تقدير احتمالات كل سيناريو.${decisionInstruction}` },
      ];

      // ── 9th Model: Prediction Market Analyst ──
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

      // ── Resolve models for each role (model diversification) ──
      const availableModelCount = ['groq', 'glm', 'gemini', 'cerebras', 'ollama', 'bedrock', 'nvidia', 'mistral']
        .filter(m => this.orchestrator.isModelKeyAvailable(m)).length;
      const activeRoles = this._resolveModelForRole(roles, availableModelCount);

      this.logger.log(`🏛️ Resolved models for consensus: ${activeRoles.map(r => `${r.name}→${r.resolvedModel}`).join(', ')}`);

      // ── Call all models in parallel ──
      const results = await Promise.allSettled(
        activeRoles.map(async (role) => {
          const roleStart = Date.now();
          try {
            const response = await this.orchestrator.callModel(role.resolvedModel!, {
              symbol,
              prompt: role.prompt,
              type: 'market_analysis',
              language,
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
            if (response.confidence === 0) {
              this.logger.warn(`🚫 Model ${role.resolvedModel} returned stub — no cooldown (key likely missing)`);
            }
            // Reset consecutive failures on success
            if (response.confidence > 0) {
              this.orchestrator.recordModelSuccess(role.resolvedModel!);
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
            // Track 429 failures
            if (error.response?.status === 429 || error.message?.includes('429')) {
              this.orchestrator.recordModel429Failure(role.resolvedModel!);
            }
            throw error;
          }
        }),
      );

      // ── Phase 2: Retry failed/stub roles with fallback models ──
      const roleResponses = new Map<string, { name: string; response: AIAnalysisResponse }>();
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value && res.value.response) {
          const { name, response, id } = res.value;
          if (response.confidence > 0) {
            roleResponses.set(id, { name, response });
          }
        }
      }

      const failedRoles = activeRoles.filter(role => !roleResponses.has(role.id));
      if (failedRoles.length > 0) {
        this.logger.log(`🔄 Phase 2: Retrying ${failedRoles.length} failed roles with fallback models...`);
        await this._retryFailedRoles(failedRoles, roleResponses, symbol, language);
      }

      // ── Build consensus from results ──
      const consensusData = await this._buildConsensusFromResults(roleResponses, predictionMarketVote, symbol);

      // ── Generate master strategy ──
      const totalModels = 8 + (predictionMarketVote ? 1 : 0);
      const masterStrategy = await this._generateMasterStrategy(
        consensusData.analyses,
        symbol,
        language,
        consensusData.recommendation,
        consensusData.consensusScore,
        totalModels,
      );

      // ── Final adjustments for edge cases ──
      let { recommendation, consensusScore, analyses } = consensusData;

      // When very few models responded (< 3) and consensus is HOLD,
      // boost directional signals
      if (analyses.length < 3 && recommendation === 'HOLD' && (consensusData.buyWeight > 0 || consensusData.sellWeight > 0)) {
        if (consensusData.buyWeight > 0 || consensusData.sellWeight > 0) {
          const prevRecommendation = recommendation;
          if (consensusData.buyWeight >= consensusData.sellWeight) {
            recommendation = 'BUY';
            consensusScore = consensusData.buyConfidences.length > 0
              ? Math.round(consensusData.buyConfidences.reduce((a, b) => a + b, 0) / consensusData.buyConfidences.length * 100)
              : Math.round((consensusData.buyWeight / (consensusData.buyWeight + consensusData.sellWeight)) * 100);
          } else {
            recommendation = 'SELL';
            consensusScore = consensusData.sellConfidences.length > 0
              ? Math.round(consensusData.sellConfidences.reduce((a, b) => a + b, 0) / consensusData.sellConfidences.length * 100)
              : Math.round((consensusData.sellWeight / (consensusData.buyWeight + consensusData.sellWeight)) * 100);
          }
          consensusScore = Math.max(consensusScore, 55);
          this.logger.log(`🏛️ Few-model override: ${prevRecommendation} → ${recommendation} (${consensusScore}%) — ${analyses.length}/${totalModels} models, ignoring HOLD with sparse data`);
        }
      }

      // When all working models agree on a direction, boost confidence
      if (recommendation !== 'HOLD' && analyses.length >= 2) {
        const dirVotes = recommendation === 'BUY' ? consensusData.buyConfidences : consensusData.sellConfidences;
        const oppVotes = recommendation === 'BUY' ? consensusData.sellConfidences : consensusData.buyConfidences;
        if (dirVotes.length >= 2 && oppVotes.length === 0) {
          consensusScore = Math.max(consensusScore, Math.min(75, dirVotes.length * 20 + 35));
          this.logger.log(`🏛️ Unanimous ${recommendation} from ${dirVotes.length} models — boosting confidence to ${consensusScore}%`);
        }
      }

      this.logger.log(`✅ Consensus: ${recommendation} (${consensusScore}%) from ${analyses.length}/${totalModels} models in ${Date.now() - start}ms`);

      const result: ConsensusAnalysisResult = { consensusScore, recommendation, analyses, masterStrategy };

      // ── Cache with differentiated TTL ──
      const isPartial = analyses.length < 3;
      const consensusCacheTTL = isPartial
        ? 60 * 1000                          // 1 minute for partial (< 3 models)
        : this.cache.getTTL('consensus');     // 10 minutes for full (3+ models)
      await this.cache.setRedisCacheWithTTL(cacheKey, result, consensusCacheTTL);

      return result;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`❌ AI Council failed: ${err.message}`, err.stack);
      return {
        consensusScore: 0,
        recommendation: 'HOLD',
        analyses: [],
        masterStrategy: language === 'en' ? 'Error processing consensus request.' : 'خطأ في معالجة طلب إجماع النماذج.',
        isFallback: true,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private: Model Diversification
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Resolve the best available model for each council role.
   *
   * Two-pass resolution:
   * 1. First pass respects diversification (MAX_MODEL_REUSE per model)
   * 2. Second pass relaxes diversification to ensure no role goes unfilled
   *
   * Dynamic MAX_MODEL_REUSE: when few models are available, allow more reuse.
   * If only 3 models work, we NEED each to serve 3 roles to fill all 8 slots.
   */
  private _resolveModelForRole(roles: CouncilRole[], availableModelCount: number): CouncilRole[] {
    const MAX_MODEL_REUSE = availableModelCount <= 3 ? 3 : 2;
    const modelUsageCount = new Map<string, number>();

    return roles.map(role => {
      let roleModels = [role.model, ...(role.fallbackModels || [])];

      // If Ollama is the primary model but we're on cloud WITH localhost URL,
      // move it to end of fallback list
      if (role.model === 'ollama' && this.orchestrator.isCloudEnvironment()) {
        const ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
        if (this.orchestrator.isLocalhostUrl(ollamaBaseUrl || 'http://localhost:11434')) {
          roleModels = [...(role.fallbackModels || []), 'ollama'];
        }
      }

      // Pass 1: Respect diversification
      for (const model of roleModels) {
        if (!this._isModelAvailableForRole(model)) continue;
        const currentUsage = modelUsageCount.get(model) || 0;
        if (currentUsage >= MAX_MODEL_REUSE) {
          this.logger.debug(`🔀 Model ${model} already used for ${currentUsage} roles — trying next model for role ${role.name}`);
          continue;
        }
        modelUsageCount.set(model, currentUsage + 1);
        return { ...role, resolvedModel: model };
      }

      // Pass 2: Relax diversification — better to reuse a model than have a stub role
      for (const model of roleModels) {
        if (!this._isModelAvailableForRole(model)) continue;
        const currentUsage = modelUsageCount.get(model) || 0;
        if (currentUsage >= 5) continue;
        modelUsageCount.set(model, currentUsage + 1);
        this.logger.warn(`⚠️ Relaxed diversification for role ${role.name}: using model ${model} (${currentUsage + 1} roles now)`);
        return { ...role, resolvedModel: model };
      }

      // All models for this role unavailable — keep primary (will return stub)
      this.logger.warn(`⚠️ All models for role ${role.name} are unavailable`);
      return { ...role, resolvedModel: role.model };
    });
  }

  /**
   * Check if a model is available for role assignment (not in cooldown, has API key)
   */
  private _isModelAvailableForRole(model: string): boolean {
    const consecutiveFails = this.orchestrator.getModelConsecutiveFailures(model);
    const failsBeforeCooldown = this.orchestrator.getFailuresBeforeCooldown();
    if (consecutiveFails >= failsBeforeCooldown) {
      const cooldownUntil = this.orchestrator.getModelCooldown(model);
      if (Date.now() < cooldownUntil) return false;
    }
    return this.orchestrator.isModelKeyAvailable(model);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private: Retry Failed Roles
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Phase 2: Retry failed/stub roles with fallback models.
   * When a model returns confidence=0 (stub) or throws an error,
   * the role gets no valid response. We try fallback models for each failed role.
   */
  private async _retryFailedRoles(
    failedRoles: CouncilRole[],
    roleResponses: Map<string, { name: string; response: AIAnalysisResponse }>,
    symbol: string,
    language: 'ar' | 'en',
  ): Promise<void> {
    for (const role of failedRoles) {
      for (const fallbackModel of role.fallbackModels || []) {
        // Skip if same as already-tried model, or unavailable, or in cooldown
        if (fallbackModel === role.resolvedModel) continue;
        if (!this._isModelAvailableForRole(fallbackModel)) continue;

        try {
          this.logger.log(`🔄 Retrying role "${role.name}" with fallback model: ${fallbackModel}`);
          const response = await this.orchestrator.callModel(fallbackModel, {
            symbol,
            prompt: role.prompt,
            type: 'market_analysis',
            language,
          });

          if (response.confidence > 0) {
            this.logger.log(`✅ Fallback model ${fallbackModel} succeeded for role "${role.name}"`);
            roleResponses.set(role.id, { name: role.name, response });
            this.orchestrator.recordModelSuccess(fallbackModel);
            break; // Role filled, stop trying fallbacks
          } else {
            this.logger.warn(`⚠️ Fallback model ${fallbackModel} returned stub for role "${role.name}"`);
          }
        } catch (error: any) {
          // Track 429 errors
          if (error.response?.status === 429 || error.message?.includes('429')) {
            this.orchestrator.recordModel429Failure(fallbackModel);
          }
          this.logger.warn(`❌ Fallback model ${fallbackModel} failed for role "${role.name}": ${error.message}`);
          continue;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private: Build Consensus from Results
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Build consensus analysis from all successful role responses.
   *
   * HOLD votes are weighted at 0.3x to prevent HOLD-dominance.
   * In active trading, staying out (HOLD) is not a productive signal.
   * Directional votes (BUY/SELL) carry more weight because they
   * represent conviction and actionable analysis.
   */
  private async _buildConsensusFromResults(
    roleResponses: Map<string, { name: string; response: AIAnalysisResponse }>,
    predictionMarketVote: { role: string; model: string; vote: string; confidence: number; reason: string } | null,
    symbol: string,
  ): Promise<{
    analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[];
    buyWeight: number;
    sellWeight: number;
    holdWeight: number;
    totalConfidence: number;
    buyConfidences: number[];
    sellConfidences: number[];
    holdConfidences: number[];
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    consensusScore: number;
  }> {
    const analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[] = [];
    let buyWeight = 0;
    let sellWeight = 0;
    let holdWeight = 0;
    let totalConfidence = 0;
    let buyConfidences: number[] = [];
    let sellConfidences: number[] = [];
    let holdConfidences: number[] = [];

    const HOLD_WEIGHT_MULTIPLIER = 0.3;

    // Build analyses from role responses
    for (const [, { name, response }] of roleResponses) {
      const content = response.content || '';
      const vote = this.orchestrator.parseVote(content);

      const conf = response.confidence || 0.5;
      if (vote === 'BUY') { buyWeight += conf; buyConfidences.push(conf); }
      else if (vote === 'SELL') { sellWeight += conf; sellConfidences.push(conf); }
      else { holdWeight += conf * HOLD_WEIGHT_MULTIPLIER; holdConfidences.push(conf); }
      totalConfidence += vote === 'HOLD' ? conf * HOLD_WEIGHT_MULTIPLIER : conf;

      analyses.push({
        role: name,
        model: response.model,
        vote,
        confidence: Math.round(conf * 100),
        reason: content.slice(0, 300) + '...',
      });
    }

    // ── Add 9th model (Prediction Market) vote — Dynamic Weight ──
    if (predictionMarketVote) {
      const pmConf = predictionMarketVote.confidence / 100;
      const pmWeight = pmConf > 0.70 ? 3.0
                      : pmConf > 0.55 ? 1.8
                      : pmConf > 0.40 ? 1.0
                      :                 0.4;
      const pmWeightedConf = pmConf * pmWeight;

      if (predictionMarketVote.vote === 'BUY')       { buyWeight  += pmWeightedConf; buyConfidences.push(pmWeightedConf); }
      else if (predictionMarketVote.vote === 'SELL')  { sellWeight += pmWeightedConf; sellConfidences.push(pmWeightedConf); }
      else                                             { holdWeight += pmConf; holdConfidences.push(pmConf); }
      totalConfidence += pmWeightedConf;

      analyses.push({
        ...predictionMarketVote,
        reason: predictionMarketVote.reason + ` [weight×${pmWeight.toFixed(1)}]`,
      });
    }

    // ── Add 10th vote: Advanced Scanner (SmartScore) ──
    try {
      const scannerKeys = [
        `scanner:deep:${symbol}`,
        `scanner:deep:${symbol.replace('/USDT','').replace('/USD','')}USDT`,
        `scanner:deep:${symbol.replace('/','').replace('-','')}`,
      ];
      let scannerData: any = null;
      for (const key of scannerKeys) {
        const raw = await this.cache.getRedis()?.get(key);
        if (raw) { scannerData = JSON.parse(raw); break; }
      }

      if (scannerData?.smartScore && scannerData.smartScore.action !== 'HOLD') {
        const isBuy    = scannerData.smartScore.action.includes('BUY');
        const rawScore = Math.abs(scannerData.smartScore.score || 0);
        const scanConf = rawScore / 100;

        const isStrong  = scannerData.smartScore.action.includes('STRONG');
        const scanWeight = isStrong ? 2.0 : 1.2;
        const scanWeightedConf = scanConf * scanWeight;

        if (isBuy)  { buyWeight  += scanWeightedConf; buyConfidences.push(scanWeightedConf); }
        else        { sellWeight += scanWeightedConf; sellConfidences.push(scanWeightedConf); }
        totalConfidence += scanWeightedConf;

        analyses.push({
          role:       'السكانر الفني المتقدم',
          model:      'TechnicalScanner/10th',
          vote:       isBuy ? 'BUY' : 'SELL',
          confidence: Math.round(rawScore),
          reason:     `SmartScore:${rawScore} | ${scannerData.smartScore.signalType || ''} | ${scannerData.smartScore.tradeTimeframe || ''} | divergence:${scannerData.divergence?.type || 'none'} [weight×${scanWeight}]`,
        });

        this.logger.debug(`🔍 Scanner vote for ${symbol}: ${isBuy?'BUY':'SELL'} score=${rawScore} weight=${scanWeight}`);
      }
    } catch (scanErr: any) {
      this.logger.debug(`Scanner vote skipped for ${symbol}: ${scanErr.message}`);
    }

    // ── Calculate recommendation and consensus score ──
    let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let consensusScore = 0;

    if (totalConfidence > 0) {
      const buyPct = buyWeight / totalConfidence;
      const sellPct = sellWeight / totalConfidence;

      // Direction-first logic: if there are ANY directional votes,
      // choose the stronger direction. Only HOLD if no direction exists.
      if (buyWeight > 0 || sellWeight > 0) {
        if (buyWeight >= sellWeight) {
          recommendation = 'BUY';
          consensusScore = buyConfidences.length > 0
            ? Math.round(buyConfidences.reduce((a, b) => a + b, 0) / buyConfidences.length * 100)
            : Math.round(buyPct * 100);
        } else {
          recommendation = 'SELL';
          consensusScore = sellConfidences.length > 0
            ? Math.round(sellConfidences.reduce((a, b) => a + b, 0) / sellConfidences.length * 100)
            : Math.round(sellPct * 100);
        }
      } else {
        // Pure HOLD — no directional signal at all
        recommendation = 'HOLD';
        consensusScore = holdConfidences.length > 0
          ? Math.round(holdConfidences.reduce((a, b) => a + b, 0) / holdConfidences.length * 100)
          : 50;
      }

      // Ensure minimum consensus score of 50% when majority direction is clear
      if (recommendation !== 'HOLD' && consensusScore < 50) {
        const votersForRec = recommendation === 'BUY' ? buyConfidences : sellConfidences;
        const totalVoters = analyses.length + (predictionMarketVote ? 1 : 0);
        if (votersForRec.length >= Math.ceil(totalVoters / 2)) {
          consensusScore = Math.max(consensusScore, Math.round((votersForRec.length / totalVoters) * 100));
        }
      }
    }

    return {
      analyses,
      buyWeight,
      sellWeight,
      holdWeight,
      totalConfidence,
      buyConfidences,
      sellConfidences,
      holdConfidences,
      recommendation,
      consensusScore,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private: Generate Master Strategy
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Generate the master strategy recommendation from the council analyses.
   * Tries multiple models for generation (not just Groq) to handle rate limits.
   * Falls back to a quick summary if all models fail.
   */
  private async _generateMasterStrategy(
    analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[],
    symbol: string,
    language: 'ar' | 'en',
    recommendation: 'BUY' | 'SELL' | 'HOLD',
    consensusScore: number,
    totalModels: number,
  ): Promise<string> {
    // Build default summary
    const recLabel = language === 'en'
      ? (recommendation === 'BUY' ? 'Buy' : recommendation === 'SELL' ? 'Sell' : 'Hold')
      : (recommendation === 'BUY' ? 'شراء' : recommendation === 'SELL' ? 'بيع' : 'انتظار');
    const recStrength = language === 'en'
      ? (consensusScore >= 80 ? 'Strong' : consensusScore >= 60 ? 'Clear' : 'Probable')
      : (consensusScore >= 80 ? 'قوي' : consensusScore >= 60 ? 'واضح' : 'محتمل');
    let masterStrategyContent = language === 'en'
      ? `Council consensus (${analyses.length}/${totalModels} models): ${recLabel} ${recStrength} with ${consensusScore}% confidence.`
      : `إجماع المجلس (${analyses.length}/${totalModels} نماذج): ${recLabel} ${recStrength} بنسبة ثقة ${consensusScore}%.`;

    if (analyses.length > 0) {
      try {
        const strategyPrompt = language === 'en'
          ? `Based on the following council analyses, summarize the final trading strategy for ${symbol} in English concisely:\n${analyses.map(a => `${a.role} (${a.model}): ${a.vote} (${a.confidence}%)`).join('\n')}`
          : `بناءً على تحليلات المجلس التالية، لخص الاستراتيجية النهائية للتداول على ${symbol} بالعربية بإيجاز:\n${analyses.map(a => `${a.role} (${a.model}): ${a.vote} (${a.confidence}%)`).join('\n')}`;

        // Try multiple models for master strategy generation
        const strategyModels = ['glm', 'ollama', 'bedrock', 'groq'];
        let masterStrategy: AIAnalysisResponse | null = null;

        for (const model of strategyModels) {
          if (!this.orchestrator.isModelKeyAvailable(model)) continue;
          const consecutiveFails = this.orchestrator.getModelConsecutiveFailures(model);
          if (consecutiveFails >= this.orchestrator.getFailuresBeforeCooldown()) {
            const cooldownUntil = this.orchestrator.getModelCooldown(model);
            if (Date.now() < cooldownUntil) continue;
          }

          try {
            const response = await this.orchestrator.callModel(model, {
              symbol,
              prompt: strategyPrompt,
              type: 'signal_generation',
              language,
            });
            if (response.confidence > 0 && response.content.length > 10) {
              masterStrategy = response;
              this.logger.log(`✅ Master strategy generated by ${model}`);
              break;
            }
          } catch {
            continue;
          }
        }

        if (masterStrategy && masterStrategy.confidence > 0 && masterStrategy.content.length > 10) {
          masterStrategyContent = masterStrategy.content;
        }
      } catch {
        // Use the summary already set above
      }
    }

    return masterStrategyContent;
  }
}
