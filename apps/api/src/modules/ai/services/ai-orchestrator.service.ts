import { Injectable, Logger, Optional, Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
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
export class AIOrchestratorService implements OnModuleDestroy {
  private readonly logger = new Logger(AIOrchestratorService.name);

  /** FIX (C4): Reference to cache cleanup interval so it can be cleared on shutdown */
  private _cacheCleanupInterval: NodeJS.Timeout | null = null;

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
  private readonly modelLatencyCooldowns = new Map<string, number>(); // model → cooldown until timestamp

  /** In-flight request deduplication — prevents duplicate AI calls for the same symbol+type */
  private readonly inFlightRequests = new Map<string, Promise<AIAnalysisResponse>>();

  /** Cleanup on module destroy — prevents orphaned intervals on hot-reload */
  onModuleDestroy() {
    if (this._cacheCleanupInterval) {
      clearInterval(this._cacheCleanupInterval);
      this._cacheCleanupInterval = null;
      this.logger.log('🧹 Cache cleanup interval cleared on module destroy');
    }
  }

  /** In-memory cache for AI responses with TTL */
  private readonly responseCache = new Map<string, { result: AIAnalysisResponse; expiresAt: number }>();
  /** Maximum number of entries in the in-memory cache (prevents unbounded growth) */
  private readonly MAX_CACHE_SIZE = 500;

  /** Last-known-good price cache — prevents hallucination when all sources fail */
  private readonly lastKnownPriceCache = new Map<string, { price: number; rsi: number; macd: string; timestamp: number }>();
  private readonly PRICE_CACHE_MAX_AGE = 30 * 60 * 1000; // 30 minutes — stale price > no price

  /**
   * Price sanity ranges — reject absurd prices BEFORE they reach the executor.
   * BTC at $34.98 is clearly wrong (should be ~$80,000+).
   * These ranges MUST be kept updated as markets move.
   */
  private readonly PRICE_SANITY: Record<string, { min: number; max: number }> = {
    'BTC/USDT': { min: 20000, max: 250000 }, 'BTC/USD': { min: 20000, max: 250000 },
    'ETH/USDT': { min: 500, max: 15000 }, 'ETH/USD': { min: 500, max: 15000 },
    'SOL/USDT': { min: 5, max: 1000 }, 'SOL/USD': { min: 5, max: 1000 },
    'BNB/USDT': { min: 100, max: 3000 }, 'BNB/USD': { min: 100, max: 3000 },
    'XRP/USDT': { min: 0.1, max: 10 }, 'XRP/USD': { min: 0.1, max: 10 },
    'ADA/USDT': { min: 0.05, max: 5 }, 'ADA/USD': { min: 0.05, max: 5 },
    'DOGE/USDT': { min: 0.01, max: 2 }, 'DOGE/USD': { min: 0.01, max: 2 },
    'DOT/USDT': { min: 1, max: 50 }, 'DOT/USD': { min: 1, max: 50 },
    'AVAX/USDT': { min: 5, max: 200 }, 'AVAX/USD': { min: 5, max: 200 },
    'LINK/USDT': { min: 2, max: 50 }, 'LINK/USD': { min: 2, max: 50 },
    'MATIC/USDT': { min: 0.1, max: 5 }, 'MATIC/USD': { min: 0.1, max: 5 },
    'EUR/USD': { min: 0.8, max: 1.5 }, 'GBP/USD': { min: 1.0, max: 1.8 },
    'USD/JPY': { min: 100, max: 200 }, 'XAU/USD': { min: 1000, max: 5000 },
    'AAPL': { min: 100, max: 400 }, 'MSFT': { min: 200, max: 600 },
    'GOOGL': { min: 100, max: 300 }, 'TSLA': { min: 100, max: 500 },
  };

  /**
   * Reference prices — used as fallback when all live sources fail or return insane prices.
   * Updated 2026-05.
   */
  private readonly REFERENCE_PRICES: Record<string, number> = {
    'BTC/USDT': 81000, 'BTC/USD': 81000,
    'ETH/USDT': 2340, 'ETH/USD': 2340,
    'SOL/USDT': 95, 'SOL/USD': 95,
    'BNB/USDT': 652, 'BNB/USD': 652,
    'XRP/USDT': 2.4, 'XRP/USD': 2.4,
    'ADA/USDT': 0.75, 'ADA/USD': 0.75,
    'DOGE/USDT': 0.22, 'DOGE/USD': 0.22,
    'DOT/USDT': 7.0, 'DOT/USD': 7.0,
    'AVAX/USDT': 35, 'AVAX/USD': 35,
    'LINK/USDT': 15, 'LINK/USD': 15,
    'MATIC/USDT': 0.50, 'MATIC/USD': 0.50,
    'EUR/USD': 1.135, 'GBP/USD': 1.325, 'USD/JPY': 143.5,
    'XAU/USD': 3250,
    'AAPL': 210, 'MSFT': 440, 'GOOGL': 168, 'TSLA': 280,
  };

  /**
   * CoinCap ID mapping — CoinCap requires full lowercase IDs, not ticker symbols.
   * e.g., "bitcoin" not "btc". Without this, /assets/btc returns wrong data or 404.
   */
  private static readonly COINCAP_IDS: Record<string, string> = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana',
    'BNB': 'binance-coin', 'XRP': 'xrp', 'ADA': 'cardano',
    'DOGE': 'dogecoin', 'DOT': 'polkadot', 'LTC': 'litecoin',
    'AVAX': 'avalanche', 'LINK': 'chainlink', 'UNI': 'uniswap',
    'ATOM': 'cosmos', 'MATIC': 'polygon', 'SHIB': 'shiba-inu',
    'SUI': 'sui', 'ARB': 'arbitrum', 'OP': 'optimism',
    'PEPE': 'pepe', 'WIF': 'dogwifcoin', 'INJ': 'injective-protocol',
    'NEAR': 'near-protocol', 'FTM': 'fantom', 'AAVE': 'aave',
    'ETC': 'ethereum-classic', 'XLM': 'stellar', 'BCH': 'bitcoin-cash',
  };

  private readonly CACHE_TTL: Record<string, number> = {
    sentiment: 5 * 60 * 1000,        // 5 minutes
    market_analysis: 15 * 60 * 1000,  // 15 minutes
    prediction: 10 * 60 * 1000,       // 10 minutes
    signal_generation: 5 * 60 * 1000, // 5 minutes
    risk_analysis: 15 * 60 * 1000,    // 15 minutes
    translation: 30 * 60 * 1000,      // 30 minutes
    general: 10 * 60 * 1000,          // 10 minutes
    consensus: 3 * 60 * 1000,        // 3 minutes for FULL consensus results
    consensus_partial: 1 * 60 * 1000, // 1 minute for PARTIAL consensus (< 3 models)
  };

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
    sentiment:        { primary: 'groq',       fallback: ['cerebras', 'gemini', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
    market_analysis:  { primary: 'gemini',     fallback: ['cerebras', 'groq', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
    prediction:       { primary: 'gemini',     fallback: ['cerebras', 'groq', 'ollama', 'mistral', 'nvidia', 'glm', 'bedrock'] },
    signal_generation:{ primary: 'gemini',     fallback: ['groq', 'cerebras', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
    risk_analysis:    { primary: 'gemini',     fallback: ['cerebras', 'groq', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
    translation:      { primary: 'groq',       fallback: ['cerebras', 'gemini', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
    general:          { primary: 'gemini',     fallback: ['groq', 'cerebras', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
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
    private readonly usageLogger: AiUsageLoggerService,
    @Optional() private readonly ragService?: RagService,
    @Optional() @Inject(forwardRef(() => PredictionMarketService)) private readonly predictionMarket?: PredictionMarketService,
    @Optional() private readonly redis?: RedisService,
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

    // FIX (C4): Periodic cleanup of expired in-memory cache entries (every 5 minutes)
    // Prevents memory leak where expired entries persist indefinitely when the service is idle.
    // Store the interval reference so it can be cleared in onModuleDestroy().
    this._cacheCleanupInterval = setInterval(() => {
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
      if (latencyInfo && latencyInfo.samples >= 3 && latencyInfo.avgMs > this.LATENCY_THRESHOLD_MS) {
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
      result = {
        model: 'Orchestrator/Fallback',
        content: enrichedRequest.language === 'en' ? 'Analysis currently unavailable. Please try again later.' : 'التحليل غير متاح حالياً. يرجى المحاولة لاحقاً.',
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
  async getConsensusAnalysis(symbol: string, options?: { forceFresh?: boolean; newsContext?: string; language?: 'ar' | 'en' }): Promise<{
    consensusScore: number;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[];
    masterStrategy: string;
    isFallback?: boolean;
  }> {
    // FIX: Added `forceFresh` option — when the Strategic Council calls this method,
    // it passes forceFresh=true to bypass the Redis cache. This is CRITICAL because:
    // 1. The startup council session (30s after boot) runs before AI models are ready
    // 2. It produces fallback/HOLD results that get cached for 10 minutes
    // 3. All subsequent council sessions read the stale HOLD cache → 0 briefs issued
    // 4. Even manual consensus triggers don't help because the Council reads the OLD cache
    // By forcing fresh results during Council sessions, we guarantee that each session
    // gets the CURRENT state of all AI models, not stale startup data.
    const forceFresh = options?.forceFresh ?? false;
    const newsContext = options?.newsContext ?? '';
    const language = options?.language ?? 'ar';

    // Check Redis cache first — consensus valid for 10 minutes (increased from 5)
    // FIX: Cache key version bumped to v8 to invalidate stale v7 results
    // that were produced during startup when models weren't ready.
    const cacheKey = `ai:consensus:v8:${symbol}`;
    if (!forceFresh) {
      try {
        const cached = await this.redis?.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          this.logger.debug(`🎼 Redis cache hit for consensus: ${symbol}`);
          return parsed;
        }
      } catch {}
    } else {
      this.logger.log(`🎼 ForceFresh=true: bypassing cache for consensus: ${symbol}`);
      // Also delete the old cache entry to prevent stale data
      try {
        await this.redis?.del(cacheKey);
      } catch {}
    }

    // Also check in-memory cache
    // FIX: Disabled in-memory cache for consensus to prevent stale HOLD results
    // from blocking brief issuance. The Redis cache (v5 key) is sufficient.
    // The in-memory cache was holding old HOLD results from before the fix,
    // causing the council to never issue briefs even after code update.
    // const memKey = `consensus:${symbol}`;
    // const memCached = this._getCachedResult(memKey);
    // if (memCached) {
    //   this.logger.debug(`🎯 Memory cache hit for consensus: ${symbol}`);
    //   return memCached as any;
    // }

    this.logger.log(`🎼 Initiating AI Council Consensus for ${symbol} — 8 models + Prediction Market`);

    try {
      const decisionInstruction = language === 'en'
        ? '\n\n⛔⛔⛔ CRITICAL decision instructions:\n- You MUST end your response with exactly one line in this format: "DECISION: BUY" or "DECISION: SELL"\n- Writing "DECISION: HOLD" is STRICTLY FORBIDDEN — there is no waiting in active trading!\n- If you are not 100% sure, choose the most probable direction based on analysis\n- Even if signals are conflicting, choose the stronger direction (BUY or SELL)\n- The market always moves — there is no "wait" — pick a direction!\nThis line MUST be the last line of your response.'
        : '\n\n⛔⛔⛔ تعليمات حاسمة حول القرار:\n- يجب أن تنهي ردك بسطر واحد بالضبط بهذا الشكل: "DECISION: BUY" أو "DECISION: SELL"\n- ممنوع تماماً كتابة "DECISION: HOLD" — لا يوجد انتظار في التداول النشط!\n- إذا لم تكن متأكداً بنسبة 100%، اختر الاتجاه الأكثر احتمالاً بناءً على التحليل\n- حتى لو كانت الإشارات متضاربة، اختر الاتجاه الأقوى (BUY أو SELL)\n- السوق دائماً يتحرك — ليس هناك "انتظار" — اختر اتجاهاً!\nهذا السطر يجب أن يكون آخر سطر في ردك.';

      // FIX: Fetch live market data before building prompts to prevent hallucinations
      // (e.g., Groq saying BTC is $28,500 when it's actually much higher)
      const marketData = await this._fetchQuickMarketData(symbol);
      const marketDataPrefix = marketData.price > 0
        ? language === 'en'
          ? `\n⛔⛔⛔ CRITICAL WARNING — Live market data (DO NOT invent prices!):\n- 🔴 Actual current price: ${marketData.price.toLocaleString()}$ — use ONLY this number! Any other price you mention will be false!\n- Real RSI: ${marketData.rsi} (use this value only)\n- MACD: ${marketData.macd}\n\n⚠️ Final warning: If you mention any price other than ${marketData.price.toLocaleString()}$ your entire analysis will be rejected as false. The price is ${marketData.price.toLocaleString()}$ and nothing else.\n`
          : `\n⛔⛔⛔ تحذير حرج — بيانات السوق الحية (ممنوع اختراع أسعار!):\n- 🔴 السعر الحالي الفعلي: ${marketData.price.toLocaleString()}$ — استخدم هذا الرقم فقط! أي سعر آخر تذكره سيكون كاذباً!\n- مؤشر RSI الحقيقي: ${marketData.rsi} (استخدم هذه القيمة فقط)\n- مؤشر MACD: ${marketData.macd}\n\n⚠️ تحذير نهائي: إذا ذكرت أي سعر غير ${marketData.price.toLocaleString()}$ فتحليلك كله سيكون مرفوضاً وكاذباً. السعر هو ${marketData.price.toLocaleString()}$ فقط لا غير.\n`
        : language === 'en'
          ? '\n⚠️⚠️⚠️ Unable to fetch live market data — DO NOT invent any price or number. If you need to mention a price, write "Price unavailable". Any fabricated price makes your analysis unreliable.\n'
          : '\n⚠️⚠️⚠️ لم نتمكن من جلب بيانات السوق الحية — ممنوع تماماً اختراع أي سعر أو رقم من عندك. إذا احتجت لذكر السعر اكتب "السعر غير متاح". أي سعر تختلقه سيجعل تحليلك غير موثوق.\n';

      // V143: Inject news context into all AI prompts.
      // This is the critical integration point where analyzed news
      // reaches the AI models for the first time.
      const newsPrefix = newsContext
        ? `\n📰📰📰 بيانات الأخبار المحللة (مصدر موثوق — خذها بعين الاعتبار!):\n${newsContext}\n⚠️ هذه أخبار حقيقية محللة — يجب أن تؤثر على قرارك!\n\n`
        : '';

      // FIX: Each model has exactly ONE role — no duplicates, no role overlap
      // 8 models = 8 roles (1:1 mapping) — clean, predictable, no rate-limiting
      // + 1 Prediction Market role (9th model) — votes only when relevant events exist
      //
      // FIX: Added deepseek and ollama to more fallback chains to prevent
      // all roles from collapsing to a single model (GLM-4) when primary
      // models fail. This was causing 6+ roles to use GLM-4 simultaneously,
      // which defeats the multi-model purpose and causes rate-limiting.
      const roles = language === 'en' ? [
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
      // FIX 3: Model diversification — prevent the same model from being used for
      // too many roles. When multiple roles fall back to the same model (e.g.,
      // GLM-4), we try to distribute across available working models instead.
      // This prevents rate-limiting and ensures genuine multi-model analysis.
      // FIX: Dynamic MAX_MODEL_REUSE — when few models are available, allow more reuse.
      // If only 3 models work, we NEED each to serve 3 roles to fill all 8 slots.
      // Previous fixed MAX_MODEL_REUSE=2 meant only 6/8 roles filled with 3 models.
      const availableModelCount = ['groq', 'glm', 'gemini', 'cerebras', 'ollama', 'bedrock', 'nvidia', 'mistral']
        .filter(m => this._isModelKeyAvailable(m)).length;
      const MAX_MODEL_REUSE = availableModelCount <= 3 ? 3 : 2; // Allow 3 reuse when models are scarce
      const modelUsageCount = new Map<string, number>(); // Track how many roles each model is assigned to

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

        // FIX: Two-pass resolution — first pass respects diversification,
        // second pass relaxes it to ensure NO role goes unfilled.
        // A role with a reused model is better than a role with a stub (confidence=0).
        for (const model of models) {
          // Check cooldown: only active after 3+ consecutive 429 failures
          const consecutiveFails = this.modelConsecutiveFailures.get(model) || 0;
          if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
            const cooldownUntil = this.modelCooldowns.get(model) || 0;
            if (Date.now() < cooldownUntil) continue; // In short cooldown
          }
          if (!this._isModelKeyAvailable(model)) continue; // Skip — no API key
          // Check model diversification — skip if model is already used for MAX_MODEL_REUSE roles
          const currentUsage = modelUsageCount.get(model) || 0;
          if (currentUsage >= MAX_MODEL_REUSE) {
            this.logger.debug(`🔀 Model ${model} already used for ${currentUsage} roles — trying next model for role ${role.name}`);
            continue; // Try next model in fallback chain
          }
          // Assign this model to this role and increment usage count
          modelUsageCount.set(model, currentUsage + 1);
          return { ...role, resolvedModel: model };
        }

        // FIX: Second pass — relax diversification. Better to reuse a model
        // than to have a role with no working model (stub = confidence=0 = wasted role).
        for (const model of models) {
          const consecutiveFails = this.modelConsecutiveFailures.get(model) || 0;
          if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
            const cooldownUntil = this.modelCooldowns.get(model) || 0;
            if (Date.now() < cooldownUntil) continue;
          }
          if (!this._isModelKeyAvailable(model)) continue;
          // Skip models already at a very high reuse count (5+) to avoid rate limits
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

      this.logger.log(`🎼 Resolved models for consensus: ${activeRoles.map(r => `${r.name}→${r.resolvedModel}`).join(', ')}`);

      const results = await Promise.allSettled(
        activeRoles.map(async (role) => {
          const roleStart = Date.now();
          try {
            const response = await this._callModel(role.resolvedModel, {
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
                language,
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
      // FIX: HOLD votes are weighted at 0.3x to prevent HOLD-dominance.
      // In active trading, staying out (HOLD) is not a productive signal.
      // A directional vote (BUY/SELL) should carry more weight because it
      // represents conviction and actionable analysis. HOLD is often the
      // lazy/default answer from small models. Reducing its weight ensures
      // that even 2-3 directional votes out of 8 can produce a consensus.
      const HOLD_WEIGHT_MULTIPLIER = 0.3;

      for (const [roleId, { name, response }] of roleResponses) {
        const content = response.content || '';
        const vote = this._parseVote(content);

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

      // ── Add 9th model (Prediction Market) vote — V175: Dynamic Weight ──
      // الأحداث الكبيرة (FOMC, halving, regulation) تُؤثر فعلاً على المجلس
      if (predictionMarketVote) {
        const pmConf = predictionMarketVote.confidence / 100;
        // وزن ديناميكي: كلما كان Prediction Market واثقاً أكثر، وزنه أعلى
        const pmWeight = pmConf > 0.70 ? 3.0   // ثقة عالية جداً → 3x وزن
                       : pmConf > 0.55 ? 1.8   // ثقة عالية → 1.8x
                       : pmConf > 0.40 ? 1.0   // ثقة متوسطة → وزن عادي
                       :                 0.4;  // ثقة منخفضة → تقليل التأثير
        const pmWeightedConf = pmConf * pmWeight;

        if (predictionMarketVote.vote === 'BUY')  { buyWeight  += pmWeightedConf; buyConfidences.push(pmWeightedConf); }
        else if (predictionMarketVote.vote === 'SELL') { sellWeight += pmWeightedConf; sellConfidences.push(pmWeightedConf); }
        else { holdWeight += pmConf; holdConfidences.push(pmConf); }
        totalConfidence += pmWeightedConf;

        analyses.push({
          ...predictionMarketVote,
          reason: predictionMarketVote.reason + ` [weight×${pmWeight.toFixed(1)}]`,
        });
      }

      // ── Add 10th vote: Advanced Scanner (SmartScore) ──
      // يقرأ مباشرة من Redis — بدون circular dependency
      // Scanner:deep:SYMBOL يُحدَّث كل 2 دقيقة بالتحليل الفني الكامل
      try {
        const scannerCacheKey = `scanner:deep:${symbol.replace('/','').replace('-','')}`;
        // جرب أشكال مختلفة للـ symbol
        const scannerKeys = [
          `scanner:deep:${symbol}`,
          `scanner:deep:${symbol.replace('/USDT','').replace('/USD','')}USDT`,
          scannerCacheKey,
        ];
        let scannerData: any = null;
        for (const key of scannerKeys) {
          const raw = await this.redis?.get(key);
          if (raw) { scannerData = JSON.parse(raw); break; }
        }

        if (scannerData?.smartScore && scannerData.smartScore.action !== 'HOLD') {
          const isBuy    = scannerData.smartScore.action.includes('BUY');
          const rawScore = Math.abs(scannerData.smartScore.score || 0); // 0-100
          const scanConf = rawScore / 100;

          // وزن Scanner أعلى لأنه تحليل فني حقيقي لا توقعات لغوية
          // STRONG_BUY/STRONG_SELL → وزن 2x | BUY/SELL → وزن 1.2x
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

      let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let consensusScore = 0;

      // FIX: Active trading consensus — directional votes beat HOLD.
      // Previous logic: Majority wins, which meant 7 HOLD + 1 SELL = HOLD (useless!)
      // New logic: If ANY directional signal (BUY or SELL) exists, prefer it over HOLD.
      // Trading requires action — HOLD is only valid when there's genuine uncertainty
      // (equal BUY and SELL votes). With the 0.3x HOLD weight reduction above,
      // even 2-3 BUY/SELL votes out of 8 will dominate the weighted calculation.
      if (totalConfidence > 0) {
        const buyPct = buyWeight / totalConfidence;
        const sellPct = sellWeight / totalConfidence;
        const holdPct = holdWeight / totalConfidence;

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

          // FIX: Try multiple models for master strategy, not just Groq.
          // Groq is often rate-limited (429), which means the master strategy
          // generation always fails when Groq is down. Now we try available
          // models in order: GLM-4 (always works), Ollama (fast), Bedrock (reliable),
          // then Groq as last resort.
          const strategyModels = ['glm', 'ollama', 'bedrock', 'groq'];
          let masterStrategy: AIAnalysisResponse | null = null;

          for (const model of strategyModels) {
            // Skip models in cooldown or without keys
            if (!this._isModelKeyAvailable(model)) continue;
            const consecutiveFails = this.modelConsecutiveFailures.get(model) || 0;
            if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
              const cooldownUntil = this.modelCooldowns.get(model) || 0;
              if (Date.now() < cooldownUntil) continue;
            }

            try {
              const response = await this._callModel(model, {
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
              // Try next model
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

      // FIX: When very few models responded (< 3) and consensus is HOLD,
      // boost confidence of directional signals. With only 2-3 models working,
      // even a single BUY/SELL vote should be respected because:
      // 1. The models that ARE working are the reliable ones (GLM-4, Bedrock, Ollama)
      // 2. Their analysis is still valid even if fewer perspectives are available
      // 3. HOLD with few models means "we couldn't get enough data", not "market is flat"
      if (analyses.length < 3 && recommendation === 'HOLD' && (buyWeight > 0 || sellWeight > 0)) {
        // There ARE directional votes — just not enough to override HOLD weight
        // Recalculate ignoring HOLD votes entirely
        if (buyWeight > 0 || sellWeight > 0) {
          const prevRecommendation = recommendation;
          if (buyWeight >= sellWeight) {
            recommendation = 'BUY';
            consensusScore = buyConfidences.length > 0
              ? Math.round(buyConfidences.reduce((a, b) => a + b, 0) / buyConfidences.length * 100)
              : Math.round((buyWeight / (buyWeight + sellWeight)) * 100);
          } else {
            recommendation = 'SELL';
            consensusScore = sellConfidences.length > 0
              ? Math.round(sellConfidences.reduce((a, b) => a + b, 0) / sellConfidences.length * 100)
              : Math.round((sellWeight / (buyWeight + sellWeight)) * 100);
          }
          // Ensure minimum score so briefs get issued
          consensusScore = Math.max(consensusScore, 55);
          this.logger.log(`🎼 Few-model override: ${prevRecommendation} → ${recommendation} (${consensusScore}%) — ${analyses.length}/${totalModels} models, ignoring HOLD with sparse data`);
        }
      }

      // FIX: When all working models agree on a direction, boost confidence
      // If 2+ models agree and 0 disagree, this is actually a strong signal
      if (recommendation !== 'HOLD' && analyses.length >= 2) {
        const dirVotes = recommendation === 'BUY' ? buyConfidences : sellConfidences;
        const oppVotes = recommendation === 'BUY' ? sellConfidences : buyConfidences;
        if (dirVotes.length >= 2 && oppVotes.length === 0) {
          // Unanimous directional vote — boost confidence
          consensusScore = Math.max(consensusScore, Math.min(75, dirVotes.length * 20 + 35));
          this.logger.log(`🎼 Unanimous ${recommendation} from ${dirVotes.length} models — boosting confidence to ${consensusScore}%`);
        }
      }

      this.logger.log(`✅ Consensus: ${recommendation} (${consensusScore}%) from ${analyses.length}/${totalModels} models in ${Date.now() - start}ms`);

      const result = { consensusScore, recommendation, analyses, masterStrategy: masterStrategyContent };

      // FIX: Cache with differentiated TTL — partial results (2 min) vs full results (10 min)
      // This prevents stale partial results from blocking retries that could reach more models.
      // FIX: Reduced partial TTL from 2 min to 1 min to allow faster retries when
      // models recover from rate limits.
      const isPartial = analyses.length < 3;
      const consensusCacheTTL = isPartial
        ? 60 * 1000                          // 1 minute for partial (< 3 models) — retry sooner
        : this.CACHE_TTL.consensus;           // 10 minutes for full (3+ models)
      try {
        await this.redis?.set(cacheKey, JSON.stringify(result), consensusCacheTTL);
      } catch {}
      // NOTE: In-memory cache for consensus was disabled to prevent stale HOLD results.
      // Redis cache (v5 key) is the only cache for consensus now.
      // const memKey = `consensus:${symbol}`;
      // this._setCachedResult(memKey, result as any, isPartial ? 'consensus_partial' : 'consensus');

      return result;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`❌ AI Council failed: ${err.message}`, err.stack);
      return { consensusScore: 0, recommendation: 'HOLD', analyses: [], masterStrategy: language === 'en' ? 'Error processing consensus request.' : 'خطأ في معالجة طلب إجماع النماذج.', isFallback: true };
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
    const models = ['groq', 'glm', 'gemini', 'cerebras', 'ollama', 'bedrock', 'nvidia', 'mistral', 'huggingface', 'openrouter', 'deepseek'];
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
      this.cerebrasService.analyze(enrichedRequest),
      this.ollamaService.analyze(enrichedRequest),
      this.bedrockService.analyze(enrichedRequest),
      this.nvidiaService.analyze(enrichedRequest),
      this.mistralService.analyze(enrichedRequest),
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
  /**
   * Public method: Fetch quick market data (price, RSI, MACD) for a symbol.
   * Used by Strategic Council for technical fallback analysis.
   * This method uses multiple parallel price sources (Binance, CoinGecko, CoinCap, Bybit, TwelveData)
   * and works reliably on Railway/cloud platforms where individual sources may be blocked.
   */
  async fetchQuickMarketData(symbol: string): Promise<{ price: number; rsi: number; macd: string; change24h?: number }> {
    return this._fetchQuickMarketData(symbol);
  }

  private async _fetchQuickMarketData(symbol: string): Promise<{ price: number; rsi: number; macd: string; change24h?: number }> {
    // FIX: Normalize symbol for Binance — handle both /USD and /USDT pairs correctly.
    const stripped = symbol.replace(/[\/\-]/g, '').toUpperCase();
    const binanceSymbol = stripped.endsWith('USDT') ? stripped : stripped.replace('USD', 'USDT');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CRITICAL FIX: Use Promise.allSettled() instead of Promise.any()
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // OLD BUG: Promise.any() returned the FIRST valid price (> 0), even if wrong.
    // Example: CoinCap with wrong ID "/assets/btc" returns $34.98 for a different
    // asset → Promise.any() accepts it → BTC trades at wrong price → all downstream fails.
    //
    // NEW APPROACH: Gather ALL results, then:
    // 1. Filter by price sanity ranges (reject BTC at $34.98)
    // 2. Cross-validate — if multiple sources agree (within 5%), use median
    // 3. If only one source passes sanity, use it
    // 4. If none pass, use reference price as last resort
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const sanity = this.PRICE_SANITY[symbol];
    const refPrice = this.REFERENCE_PRICES[symbol];

    // Run ALL sources in parallel — no early termination
    const allResults = await Promise.allSettled([
      // Source 1: Binance (most accurate, but often blocked on Railway)
      (async () => {
        const res = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`, { timeout: 4000 });
        const price = parseFloat(res.data?.lastPrice || '0');
        if (price <= 0) throw new Error('Binance price=0');
        const change24h = parseFloat(res.data?.priceChangePercent || '0');
        return { price, source: 'binance', change24h };
      })(),
      // Source 2: CoinGecko (reliable, free, no auth)
      (async () => {
        const coingeckoId = this._symbolToCoingeckoId(symbol);
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`, { timeout: 5000 });
        const price = res.data?.[coingeckoId]?.usd;
        if (!price || price <= 0) throw new Error('CoinGecko no price');
        const change24h = res.data?.[coingeckoId]?.usd_24h_change;
        return { price, source: 'coingecko', change24h };
      })(),
      // Source 3: CoinCap (FIX: Use proper CoinCap IDs instead of raw ticker)
      // OLD BUG: Used symbol.split('/')[0].toLowerCase() = "btc" → wrong asset
      // FIX: Use COINCAP_IDS mapping → "bitcoin" → correct price
      (async () => {
        const base = symbol.split('/')[0].toUpperCase();
        const coincapId = AIOrchestratorService.COINCAP_IDS[base];
        if (!coincapId) {
          // Unknown symbol — skip CoinCap to avoid returning wrong asset data
          // (e.g., "BTC" → Bitcoin Group SE stock at $34.98 instead of Bitcoin at $79K)
          throw new Error(`No CoinCap ID mapping for ${base} — skipping to prevent wrong price`);
        }
        const res = await axios.get(`https://api.coincap.io/v2/assets/${coincapId}`, { timeout: 5000 });
        const price = parseFloat(res.data?.data?.priceUsd || '0');
        if (price <= 0) throw new Error('CoinCap price=0');
        const change24h = parseFloat(res.data?.data?.changePercent24Hr || '0');
        return { price, source: 'coincap', change24h };
      })(),
      // Source 4: Bybit (alternative exchange, works on cloud)
      (async () => {
        const bybitSymbol = symbol.replace(/[\/\-]/g, '').toUpperCase();
        const res = await axios.get(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${bybitSymbol}`, { timeout: 4000 });
        const price = parseFloat(res.data?.result?.list?.[0]?.lastPrice || '0');
        if (price <= 0) throw new Error('Bybit price=0');
        const change24h = parseFloat(res.data?.result?.list?.[0]?.price24hPcnt || '0') * 100;
        return { price, source: 'bybit', change24h };
      })(),
      // Source 5: TwelveData (API key available, reliable on cloud)
      (async () => {
        const tdApiKey = this.configService.get<string>('TWELVE_DATA_API_KEY', '');
        if (!tdApiKey) throw new Error('No TwelveData key');
        const tdSymbol = symbol.replace(/[\/\-]/g, '');
        const res = await axios.get(`https://api.twelvedata.com/price?symbol=${tdSymbol}&apikey=${tdApiKey}`, { timeout: 5000 });
        const price = parseFloat(res.data?.price || '0');
        if (price <= 0) throw new Error('TwelveData price=0');
        return { price, source: 'twelvedata', change24h: undefined };
      })(),
      // Source 6: Yahoo Finance (FREE, no API key, works for Forex/Stocks/Commodities on cloud)
      (async () => {
        let yahooSymbol: string;
        const base = symbol.split('/')[0].toUpperCase();
        const quote = symbol.split('/')[1]?.toUpperCase();

        if (quote && ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'].includes(base) &&
            ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'].includes(quote)) {
          yahooSymbol = `${base}${quote}=X`;
        } else if (base === 'XAU' || base === 'XAG' || base === 'XPT') {
          yahooSymbol = `${base}${quote}=X`;
        } else if (!quote || quote === 'USD' || quote === 'USDT') {
          yahooSymbol = `${base}-USD`;  // FIX: "BTC" → stock price ($34.98), "BTC-USD" → crypto price (~$79K)
        } else {
          yahooSymbol = `${base}-${quote}`;
        }

        const res = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`,
          {
            timeout: 6000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          },
        );
        const result = res.data?.chart?.result?.[0];
        const meta = result?.meta;
        const price = meta?.regularMarketPrice;
        if (!price || price <= 0) throw new Error('Yahoo Finance price=0');
        let change24h: number | undefined;
        const closes: number[] = result?.indicators?.quote?.[0]?.close?.filter((v: number) => v != null) || [];
        if (closes.length >= 2) {
          const prevClose = closes[closes.length - 2];
          const latestClose = closes[closes.length - 1];
          if (prevClose > 0) {
            change24h = ((latestClose - prevClose) / prevClose) * 100;
          }
        }
        return { price, source: 'yahoo-finance', change24h };
      })(),
      // Source 7: ExchangeRate API (FREE, no API key, Forex-only)
      (async () => {
        const base = symbol.split('/')[0].toUpperCase();
        const quote = symbol.split('/')[1]?.toUpperCase();
        const fiatCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'SGD', 'HKD'];
        if (!fiatCurrencies.includes(base) || !fiatCurrencies.includes(quote)) {
          throw new Error('Not a fiat pair');
        }
        const res = await axios.get(`https://api.exchangerate-api.com/v4/latest/${base}`, { timeout: 5000 });
        const rate = res.data?.rates?.[quote];
        if (!rate || rate <= 0) throw new Error('ExchangeRate no rate');
        return { price: rate, source: 'exchangerate-api', change24h: undefined };
      })(),
      // Source 8: Alpha Vantage (FREE tier: 25 req/day, Forex + Stocks + Commodities)
      (async () => {
        const avApiKey = this.configService.get<string>('ALPHA_VANTAGE_API_KEY', 'demo');
        if (!avApiKey || avApiKey === 'disabled') throw new Error('No Alpha Vantage key');
        const base = symbol.split('/')[0].toUpperCase();
        const quote = symbol.split('/')[1]?.toUpperCase();
        const fiatCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];

        if (fiatCurrencies.includes(base) && fiatCurrencies.includes(quote)) {
          const res = await axios.get(
            `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote}&apikey=${avApiKey}`,
            { timeout: 6000 },
          );
          const rate = parseFloat(res.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'] || '0');
          if (rate <= 0) throw new Error('Alpha Vantage forex rate=0');
          return { price: rate, source: 'alpha-vantage-forex', change24h: undefined };
        } else if (base === 'XAU' || base === 'XAG') {
          const res = await axios.get(
            `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote || 'USD'}&apikey=${avApiKey}`,
            { timeout: 6000 },
          );
          const rate = parseFloat(res.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'] || '0');
          if (rate <= 0) throw new Error('Alpha Vantage commodity rate=0');
          return { price: rate, source: 'alpha-vantage-commodity', change24h: undefined };
        } else {
          const res = await axios.get(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${base}&apikey=${avApiKey}`,
            { timeout: 6000 },
          );
          const price = parseFloat(res.data?.['Global Quote']?.['05. price'] || '0');
          if (price <= 0) throw new Error('Alpha Vantage stock price=0');
          const prevClose = parseFloat(res.data?.['Global Quote']?.['08. previous close'] || '0');
          let change24h: number | undefined;
          if (prevClose > 0) {
            change24h = ((price - prevClose) / prevClose) * 100;
          }
          return { price, source: 'alpha-vantage-stock', change24h };
        }
      })(),
    ]);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 2: Extract successful results and filter by sanity ranges
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const validPrices: { price: number; source: string; change24h?: number }[] = [];
    const rejectedPrices: { price: number; source: string; reason: string }[] = [];

    for (const result of allResults) {
      if (result.status === 'fulfilled' && result.value?.price > 0) {
        const { price, source, change24h: srcChange24h } = result.value;

        // Sanity check: reject prices outside expected range
        if (sanity && (price < sanity.min || price > sanity.max)) {
          rejectedPrices.push({ price, source, reason: `outside [${sanity.min}, ${sanity.max}]` });
          this.logger.warn(
            `📊 PRICE SANITY REJECTED ${symbol}: $${price} from ${source} — outside range [$${sanity.min}, $${sanity.max}]`
          );
          continue;
        }

        validPrices.push({ price, source, change24h: srcChange24h });
      }
    }

    // Log rejected prices for debugging
    if (rejectedPrices.length > 0) {
      this.logger.warn(
        `📊 ${symbol}: ${rejectedPrices.length} source(s) rejected by sanity check: ` +
        rejectedPrices.map(r => `${r.source}=$${r.price} (${r.reason})`).join(', ')
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 3: Select the best price using cross-validation
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let finalPrice = 0;
    let finalSource = 'none';
    let change24h: number | undefined;

    if (validPrices.length >= 2) {
      // Multiple sources — cross-validate: if prices agree within 5%, use median
      const prices = validPrices.map(v => v.price).sort((a, b) => a - b);
      const medianPrice = prices.length % 2 === 0
        ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
        : prices[Math.floor(prices.length / 2)];

      // Check if most sources agree (within 5% of median)
      const agreeing = validPrices.filter(v => {
        const deviation = Math.abs(v.price - medianPrice) / medianPrice;
        return deviation < 0.05; // 5% tolerance
      });

      if (agreeing.length >= 2) {
        // Use the median of agreeing sources
        const agreeingPrices = agreeing.map(v => v.price).sort((a, b) => a - b);
        finalPrice = agreeingPrices.length % 2 === 0
          ? (agreeingPrices[agreeingPrices.length / 2 - 1] + agreeingPrices[agreeingPrices.length / 2]) / 2
          : agreeingPrices[Math.floor(agreeingPrices.length / 2)];
        finalSource = agreeing.map(v => v.source).join('+');
        change24h = agreeing[0].change24h;
        this.logger.debug(
          `📊 ${symbol}: Cross-validated price $${finalPrice} from ${agreeing.length} agreeing sources (${finalSource})`
        );
      } else {
        // Sources disagree — use the most reliable single source
        // Priority: binance > coingecko > bybit > coincap > yahoo > others
        const sourcePriority = ['binance', 'coingecko', 'bybit', 'coincap', 'yahoo-finance', 'twelvedata', 'exchangerate-api', 'alpha-vantage'];
        const sorted = [...validPrices].sort((a, b) => {
          const aIdx = sourcePriority.indexOf(a.source);
          const bIdx = sourcePriority.indexOf(b.source);
          return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
        });
        finalPrice = sorted[0].price;
        finalSource = sorted[0].source + ' (disputed)';
        change24h = sorted[0].change24h;
        this.logger.warn(
          `📊 ${symbol}: Sources disagree — using most reliable: $${finalPrice} from ${finalSource}`
        );
      }
    } else if (validPrices.length === 1) {
      // Only one source — use it (already passed sanity check)
      finalPrice = validPrices[0].price;
      finalSource = validPrices[0].source;
      change24h = validPrices[0].change24h;
      this.logger.debug(`📊 ${symbol}: Single source price $${finalPrice} from ${finalSource}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 4: Fallback chain if no valid price found
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (!finalPrice || finalPrice <= 0) {
      // Try reference price
      if (refPrice && refPrice > 0) {
        finalPrice = refPrice;
        finalSource = 'reference-table';
        this.logger.warn(`📊 ${symbol}: ALL live sources failed/insane — using reference price $${refPrice}`);
      } else {
        // Try last-known-good cache
        const cachedPrice = this.lastKnownPriceCache.get(symbol);
        if (cachedPrice && (Date.now() - cachedPrice.timestamp) < this.PRICE_CACHE_MAX_AGE) {
          finalPrice = cachedPrice.price;
          finalSource = `cache (${Math.round((Date.now() - cachedPrice.timestamp) / 1000)}s old)`;
          this.logger.warn(`📊 ${symbol}: Using cached price $${finalPrice} (${finalSource})`);
        } else {
          this.logger.error(`📊 ALL price sources FAILED for ${symbol} — no reference price, no cache`);
          return { price: 0, rsi: 50, macd: 'غير متوفر', change24h: 0 };
        }
      }
    }

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

    // Try Bybit klines as fallback for RSI/MACD when Binance is blocked
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
          .reverse();
        if (closes.length > 14) {
          rsi = this._calculateRSI(closes);
          macd = this._calculateMACD(closes);
        }
      } catch {
        // Bybit klines also unavailable
      }
    }

    // Try Yahoo Finance klines as fallback for Forex/Stock/Commodity RSI/MACD
    if (rsi === 50) {
      try {
        let yahooKlineSymbol: string;
        const base = symbol.split('/')[0].toUpperCase();
        const quote = symbol.split('/')[1]?.toUpperCase();
        const fiatCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];

        if (fiatCurrencies.includes(base) && fiatCurrencies.includes(quote)) {
          yahooKlineSymbol = `${base}${quote}=X`;
        } else if (base === 'XAU' || base === 'XAG' || base === 'XPT') {
          yahooKlineSymbol = `${base}${quote}=X`;
        } else if (!quote || quote === 'USD' || quote === 'USDT') {
          yahooKlineSymbol = base;
        } else {
          yahooKlineSymbol = `${base}-${quote}`;
        }

        const yfKlineRes = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooKlineSymbol)}?interval=1h&range=5d`,
          {
            timeout: 6000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          },
        );
        const yfCloses: number[] = (yfKlineRes.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [])
          .filter((v: number) => v != null && v > 0);
        if (yfCloses.length > 14) {
          rsi = this._calculateRSI(yfCloses);
          macd = this._calculateMACD(yfCloses);
        }
      } catch {
        // Yahoo Finance klines also unavailable
      }
    }

    // Save to last-known-good cache
    this.lastKnownPriceCache.set(symbol, { price: finalPrice, rsi, macd, timestamp: Date.now() });
    if (this.lastKnownPriceCache.size > 50) {
      const now = Date.now();
      for (const [key, entry] of this.lastKnownPriceCache) {
        if (now - entry.timestamp > this.PRICE_CACHE_MAX_AGE) this.lastKnownPriceCache.delete(key);
      }
    }

    this.logger.log(
      `📊 ${symbol}: price=$${finalPrice} from ${finalSource}, RSI=${rsi}, MACD=${macd}, 24h=${change24h?.toFixed(2) || 'N/A'}%` +
      (validPrices.length > 0 ? ` (${validPrices.length}/${allResults.length} sources valid)` : ' (fallback)')
    );
    return { price: finalPrice, rsi, macd, change24h };
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
