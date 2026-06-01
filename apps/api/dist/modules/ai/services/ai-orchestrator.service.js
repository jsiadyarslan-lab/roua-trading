"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AIOrchestratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const groq_service_1 = require("./groq.service");
const glm_service_1 = require("./glm.service");
const gemini_service_1 = require("./gemini.service");
const huggingface_service_1 = require("./huggingface.service");
const ollama_service_1 = require("./ollama.service");
const bedrock_service_1 = require("./bedrock.service");
const openrouter_service_1 = require("./openrouter.service");
const deepseek_service_1 = require("./deepseek.service");
const cerebras_service_1 = require("./cerebras.service");
const mistral_service_1 = require("./mistral.service");
const nvidia_service_1 = require("./nvidia.service");
const rag_service_1 = require("./rag.service");
const ai_usage_logger_service_1 = require("./ai-usage-logger.service");
const retry_util_1 = require("./retry.util");
const redis_service_1 = require("../../../common/redis/redis.service");
const prediction_market_service_1 = require("../../prediction-market/prediction-market.service");
const crypto = __importStar(require("crypto"));
const axios_1 = __importDefault(require("axios"));
let AIOrchestratorService = AIOrchestratorService_1 = class AIOrchestratorService {
    onModuleDestroy() {
        if (this._cacheCleanupInterval) {
            clearInterval(this._cacheCleanupInterval);
            this._cacheCleanupInterval = null;
            this.logger.log('🧹 Cache cleanup interval cleared on module destroy');
        }
    }
    _isCloudEnvironment() {
        return !!(process.env.RAILWAY_ENVIRONMENT ||
            process.env.RENDER ||
            process.env.AWS_EXECUTION_ENV ||
            process.env.VERCEL ||
            process.env.DYNO);
    }
    _isLocalhostUrl(url) {
        return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0');
    }
    constructor(configService, groqService, glmService, geminiService, huggingfaceService, ollamaService, bedrockService, openrouterService, deepseekService, cerebrasService, mistralService, nvidiaService, usageLogger, ragService, predictionMarket, redis) {
        this.configService = configService;
        this.groqService = groqService;
        this.glmService = glmService;
        this.geminiService = geminiService;
        this.huggingfaceService = huggingfaceService;
        this.ollamaService = ollamaService;
        this.bedrockService = bedrockService;
        this.openrouterService = openrouterService;
        this.deepseekService = deepseekService;
        this.cerebrasService = cerebrasService;
        this.mistralService = mistralService;
        this.nvidiaService = nvidiaService;
        this.usageLogger = usageLogger;
        this.ragService = ragService;
        this.predictionMarket = predictionMarket;
        this.redis = redis;
        this.logger = new common_1.Logger(AIOrchestratorService_1.name);
        this._cacheCleanupInterval = null;
        this.modelCooldowns = new Map();
        this.modelConsecutiveFailures = new Map();
        this.modelCooldownLevel = new Map();
        this.BASE_COOLDOWN_MS = 30_000;
        this.MAX_COOLDOWN_MS = 5 * 60 * 1000;
        this.FAILURES_BEFORE_COOLDOWN = 3;
        this.modelLatencies = new Map();
        this.LATENCY_THRESHOLD_MS = 10_000;
        this.LATENCY_SAMPLE_WINDOW = 5;
        this.LATENCY_COOLDOWN_MS = 10 * 60 * 1000;
        this.modelLatencyCooldowns = new Map();
        this.inFlightRequests = new Map();
        this.responseCache = new Map();
        this.MAX_CACHE_SIZE = 500;
        this.lastKnownPriceCache = new Map();
        this.PRICE_CACHE_MAX_AGE = 30 * 60 * 1000;
        this.PRICE_SANITY = {
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
        this.REFERENCE_PRICES = {
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
        this.CACHE_TTL = {
            sentiment: 5 * 60 * 1000,
            market_analysis: 15 * 60 * 1000,
            prediction: 10 * 60 * 1000,
            signal_generation: 5 * 60 * 1000,
            risk_analysis: 15 * 60 * 1000,
            translation: 30 * 60 * 1000,
            general: 10 * 60 * 1000,
            consensus: 3 * 60 * 1000,
            consensus_partial: 1 * 60 * 1000,
        };
        this.MODEL_KEY_MAP = {
            groq: ['GROQ_API_KEY'],
            glm: ['GLM_API_KEY'],
            gemini: ['GOOGLE_AI_STUDIO_API_KEY', 'GEMINI_API_KEY'],
            cerebras: ['CEREBRAS_API_KEY', 'CEREBRAS_KEY'],
            ollama: ['OLLAMA_API_KEY', 'OLLAMA_BASE_URL'],
            bedrock: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
            nvidia: ['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY', 'NIM_API_KEY'],
            mistral: ['MISTRAL_API_KEY', 'MISTRAL_KEY'],
            huggingface: ['HUGGINGFACE_API_KEY', 'HF_API_KEY'],
            openrouter: ['OPENROUTER_API_KEY', 'OPEN_ROUTER_API_KEY'],
            deepseek: ['DEEPSEEK_API_KEY'],
        };
        this.ROUTING = {
            sentiment: { primary: 'groq', fallback: ['cerebras', 'gemini', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
            market_analysis: { primary: 'gemini', fallback: ['cerebras', 'groq', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
            prediction: { primary: 'gemini', fallback: ['cerebras', 'groq', 'ollama', 'mistral', 'nvidia', 'glm', 'bedrock'] },
            signal_generation: { primary: 'gemini', fallback: ['groq', 'cerebras', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
            risk_analysis: { primary: 'gemini', fallback: ['cerebras', 'groq', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
            translation: { primary: 'groq', fallback: ['cerebras', 'gemini', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
            general: { primary: 'gemini', fallback: ['groq', 'cerebras', 'ollama', 'glm', 'mistral', 'nvidia', 'bedrock'] },
        };
        this.bedrockMonthlySpend = 0;
        this.bedrockBudgetLastChecked = 0;
        this.BEDROCK_BUDGET_THRESHOLD_PERCENT = 0.95;
        this.BEDROCK_MONTHLY_BUDGET_USD = parseInt(this.configService.get('BEDROCK_MONTHLY_BUDGET_USD', '100'), 10) || 100;
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
        const available = this.getModelsStatus().filter(m => m.available);
        this.logger.log(`🔑 Models with API keys: ${available.map(m => m.model).join(', ') || 'NONE'}`);
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
    async analyze(request) {
        const redisCacheKey = `ai:analysis:${this._hashPrompt(this._stableStringify(request))}`;
        try {
            const cached = await this.redis?.get(redisCacheKey);
            if (cached) {
                this.logger.debug(`🎼 Redis cache hit for ${request.type} analysis`);
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
        }
        catch { }
        const enrichedRequest = await this._enrichWithContext(request);
        if (enrichedRequest.symbol) {
            try {
                const marketData = await this._fetchQuickMarketData(enrichedRequest.symbol);
                if (marketData.price > 0) {
                    enrichedRequest.prompt = `⛔ بيانات السوق الحية (لا تخترع أسعاراً!): السعر الفعلي=${marketData.price.toLocaleString()}$, RSI=${marketData.rsi}, MACD=${marketData.macd}. ممنوع اختراع أسعار مختلفة.\n\n${enrichedRequest.prompt}`;
                }
                else {
                    enrichedRequest.prompt = `⚠️ لم نتمكن من جلب بيانات السوق — لا تخترع أسعاراً. اكتب "السعر غير متاح".\n\n${enrichedRequest.prompt}`;
                }
            }
            catch {
            }
        }
        const memCacheKey = this._getCacheKey(enrichedRequest);
        const memCached = this._getCachedResult(memCacheKey);
        if (memCached) {
            this.logger.debug(`🎯 Memory cache hit for ${enrichedRequest.type} analysis`);
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
        }
        finally {
            this.inFlightRequests.delete(dedupeKey);
        }
    }
    async _executeAnalysis(enrichedRequest, redisCacheKey, memCacheKey) {
        const routing = this.ROUTING[enrichedRequest.type] || this.ROUTING.general;
        const models = [routing.primary, ...routing.fallback];
        this.logger.debug(`🎼 Orchestrating ${enrichedRequest.type} → models: ${models.join(' → ')}`);
        let result = null;
        for (const model of models) {
            if (!this._isModelKeyAvailable(model)) {
                continue;
            }
            const consecutiveFails = this.modelConsecutiveFailures.get(model) || 0;
            if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
                const cooldownUntil = this.modelCooldowns.get(model) || 0;
                if (Date.now() < cooldownUntil) {
                    this.logger.debug(`⏭️ Model ${model} in 429 cooldown (${consecutiveFails} consecutive) — skipping`);
                    continue;
                }
                this.modelConsecutiveFailures.set(model, 0);
            }
            const latencyCooldownUntil = this.modelLatencyCooldowns.get(model) || 0;
            if (Date.now() < latencyCooldownUntil) {
                this.logger.debug(`⏭️ Model ${model} in latency cooldown (avg > ${this.LATENCY_THRESHOLD_MS}ms) — skipping`);
                continue;
            }
            const latencyInfo = this.modelLatencies.get(model);
            if (latencyInfo && latencyInfo.samples >= 3 && latencyInfo.avgMs > this.LATENCY_THRESHOLD_MS) {
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
                this.usageLogger?.logSuccess({
                    model: response.model,
                    endpoint: enrichedRequest.type || 'general',
                    inputPrompt: enrichedRequest.prompt,
                    outputContent: response.content,
                    latencyMs: response.processingTimeMs,
                    cached: false,
                });
                this.modelConsecutiveFailures.delete(model);
                this.modelCooldownLevel.delete(model);
                this._recordLatency(model, response.processingTimeMs);
                result = response;
                result.confidence = this._calculateDynamicConfidence(model, result.content, enrichedRequest.type);
                break;
            }
            catch (error) {
                this.usageLogger?.logFailure({
                    model,
                    endpoint: enrichedRequest.type || 'general',
                    inputPrompt: enrichedRequest.prompt,
                    latencyMs: 0,
                    errorMessage: error.message,
                });
                const timeoutMatch = error.message?.match(/timeout of (\d+)ms/i);
                const timeoutMs = timeoutMatch ? parseInt(timeoutMatch[1]) : this.LATENCY_THRESHOLD_MS;
                this._recordLatency(model, timeoutMs);
                if (error.response?.status === 429 || error.message?.includes('429')) {
                    const fails = (this.modelConsecutiveFailures.get(model) || 0) + 1;
                    this.modelConsecutiveFailures.set(model, fails);
                    if (fails >= this.FAILURES_BEFORE_COOLDOWN) {
                        const level = (this.modelCooldownLevel.get(model) || 0) + 1;
                        this.modelCooldownLevel.set(model, level);
                        const cooldownMs = Math.min(this.BASE_COOLDOWN_MS * Math.pow(2, level - 1), this.MAX_COOLDOWN_MS);
                        this.modelCooldowns.set(model, Date.now() + cooldownMs);
                        this.logger.warn(`🚫 Model ${model} rate-limited ${fails}x consecutively — ${Math.round(cooldownMs / 1000)}s cooldown (level ${level})`);
                    }
                    else {
                        this.logger.warn(`🚫 Model ${model} rate-limited (429) attempt ${fails}/${this.FAILURES_BEFORE_COOLDOWN} — still trying`);
                    }
                }
                else {
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
        const redisTTL = this.CACHE_TTL[enrichedRequest.type] || this.CACHE_TTL.general;
        try {
            await this.redis?.set(redisCacheKey, JSON.stringify(result), redisTTL);
        }
        catch { }
        this._setCachedResult(memCacheKey, result, enrichedRequest.type);
        return result;
    }
    async getConsensusAnalysis(symbol, options) {
        const forceFresh = options?.forceFresh ?? false;
        const newsContext = options?.newsContext ?? '';
        const language = options?.language ?? 'ar';
        const cacheKey = `ai:consensus:v8:${symbol}`;
        if (!forceFresh) {
            try {
                const cached = await this.redis?.get(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    this.logger.debug(`🎼 Redis cache hit for consensus: ${symbol}`);
                    return parsed;
                }
            }
            catch { }
        }
        else {
            this.logger.log(`🎼 ForceFresh=true: bypassing cache for consensus: ${symbol}`);
            try {
                await this.redis?.del(cacheKey);
            }
            catch { }
        }
        this.logger.log(`🎼 Initiating AI Council Consensus for ${symbol} — 8 models + Prediction Market`);
        try {
            const decisionInstruction = language === 'en'
                ? '\n\n⛔⛔⛔ CRITICAL decision instructions:\n- You MUST end your response with exactly one line in this format: "DECISION: BUY" or "DECISION: SELL"\n- Writing "DECISION: HOLD" is STRICTLY FORBIDDEN — there is no waiting in active trading!\n- If you are not 100% sure, choose the most probable direction based on analysis\n- Even if signals are conflicting, choose the stronger direction (BUY or SELL)\n- The market always moves — there is no "wait" — pick a direction!\nThis line MUST be the last line of your response.'
                : '\n\n⛔⛔⛔ تعليمات حاسمة حول القرار:\n- يجب أن تنهي ردك بسطر واحد بالضبط بهذا الشكل: "DECISION: BUY" أو "DECISION: SELL"\n- ممنوع تماماً كتابة "DECISION: HOLD" — لا يوجد انتظار في التداول النشط!\n- إذا لم تكن متأكداً بنسبة 100%، اختر الاتجاه الأكثر احتمالاً بناءً على التحليل\n- حتى لو كانت الإشارات متضاربة، اختر الاتجاه الأقوى (BUY أو SELL)\n- السوق دائماً يتحرك — ليس هناك "انتظار" — اختر اتجاهاً!\nهذا السطر يجب أن يكون آخر سطر في ردك.';
            const marketData = await this._fetchQuickMarketData(symbol);
            const marketDataPrefix = marketData.price > 0
                ? language === 'en'
                    ? `\n⛔⛔⛔ CRITICAL WARNING — Live market data (DO NOT invent prices!):\n- 🔴 Actual current price: ${marketData.price.toLocaleString()}$ — use ONLY this number! Any other price you mention will be false!\n- Real RSI: ${marketData.rsi} (use this value only)\n- MACD: ${marketData.macd}\n\n⚠️ Final warning: If you mention any price other than ${marketData.price.toLocaleString()}$ your entire analysis will be rejected as false. The price is ${marketData.price.toLocaleString()}$ and nothing else.\n`
                    : `\n⛔⛔⛔ تحذير حرج — بيانات السوق الحية (ممنوع اختراع أسعار!):\n- 🔴 السعر الحالي الفعلي: ${marketData.price.toLocaleString()}$ — استخدم هذا الرقم فقط! أي سعر آخر تذكره سيكون كاذباً!\n- مؤشر RSI الحقيقي: ${marketData.rsi} (استخدم هذه القيمة فقط)\n- مؤشر MACD: ${marketData.macd}\n\n⚠️ تحذير نهائي: إذا ذكرت أي سعر غير ${marketData.price.toLocaleString()}$ فتحليلك كله سيكون مرفوضاً وكاذباً. السعر هو ${marketData.price.toLocaleString()}$ فقط لا غير.\n`
                : language === 'en'
                    ? '\n⚠️⚠️⚠️ Unable to fetch live market data — DO NOT invent any price or number. If you need to mention a price, write "Price unavailable". Any fabricated price makes your analysis unreliable.\n'
                    : '\n⚠️⚠️⚠️ لم نتمكن من جلب بيانات السوق الحية — ممنوع تماماً اختراع أي سعر أو رقم من عندك. إذا احتجت لذكر السعر اكتب "السعر غير متاح". أي سعر تختلقه سيجعل تحليلك غير موثوق.\n';
            const newsPrefix = newsContext
                ? `\n📰📰📰 بيانات الأخبار المحللة (مصدر موثوق — خذها بعين الاعتبار!):\n${newsContext}\n⚠️ هذه أخبار حقيقية محللة — يجب أن تؤثر على قرارك!\n\n`
                : '';
            const roles = language === 'en' ? [
                { id: 'tech', name: 'Technical Analyst', model: 'gemini', fallbackModels: ['groq', 'ollama', 'deepseek', 'glm', 'bedrock', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}Analyze the technical chart for ${symbol} based on trend, momentum, and resistance levels.${decisionInstruction}` },
                { id: 'sent', name: 'Sentiment Analyst', model: 'groq', fallbackModels: ['deepseek', 'ollama', 'gemini', 'bedrock', 'glm', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}Analyze current market sentiment for ${symbol} from a news and momentum perspective.${decisionInstruction}` },
                { id: 'risk', name: 'Risk Expert', model: 'gemini', fallbackModels: ['cerebras', 'groq', 'ollama', 'deepseek', 'glm', 'mistral', 'nvidia', 'bedrock'], prompt: `${newsPrefix}${marketDataPrefix}Identify risks of entering a trade on ${symbol} now, stop-loss levels, and worst-case scenario assessment.${decisionInstruction}` },
                { id: 'macro', name: 'Macro Expert', model: 'gemini', fallbackModels: ['cerebras', 'groq', 'deepseek', 'ollama', 'glm', 'bedrock', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}Analyze the macroeconomic situation and its impact on ${symbol}.${decisionInstruction}` },
                { id: 'pattern', name: 'Pattern Expert', model: 'cerebras', fallbackModels: ['ollama', 'mistral', 'groq', 'gemini', 'bedrock', 'glm', 'nvidia'], prompt: `${newsPrefix}${marketDataPrefix}Do you see any recurring historical patterns in the current movement of ${symbol}?${decisionInstruction}` },
                { id: 'exec', name: 'Execution Strategist', model: 'ollama', fallbackModels: ['deepseek', 'bedrock', 'glm', 'gemini', 'groq', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}What is the best timing for entering ${symbol} based on liquidity and available models?${decisionInstruction}` },
                { id: 'diverge', name: 'Divergence Analyst', model: 'cerebras', fallbackModels: ['groq', 'ollama', 'bedrock', 'gemini', 'mistral', 'glm', 'nvidia'], prompt: `${newsPrefix}${marketDataPrefix}Look for counter-signals or divergences in the analysis of ${symbol} — is there a reason not to follow the prevailing trend?${decisionInstruction}` },
                { id: 'scenario', name: 'Scenario Analyst', model: 'mistral', fallbackModels: ['ollama', 'bedrock', 'gemini', 'groq', 'glm', 'cerebras', 'nvidia'], prompt: `${newsPrefix}${marketDataPrefix}Analyze possible scenarios for ${symbol} with probability estimates for each scenario.${decisionInstruction}` },
            ] : [
                { id: 'tech', name: 'المحلل الفني', model: 'gemini', fallbackModels: ['groq', 'ollama', 'deepseek', 'glm', 'bedrock', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}حلل الشارت الفني لـ ${symbol} بناءً على الاتجاه والزخم والمقاومات.${decisionInstruction}` },
                { id: 'sent', name: 'محلل المشاعر', model: 'groq', fallbackModels: ['deepseek', 'ollama', 'gemini', 'bedrock', 'glm', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}حلل مشاعر السوق الحالية لـ ${symbol} من منظور الأخبار والزخم.${decisionInstruction}` },
                { id: 'risk', name: 'خبير المخاطر', model: 'gemini', fallbackModels: ['cerebras', 'groq', 'ollama', 'deepseek', 'glm', 'mistral', 'nvidia', 'bedrock'], prompt: `${newsPrefix}${marketDataPrefix}حدد مخاطر دخول صفقة على ${symbol} الآن ومستويات وقف الخسارة مع تقييم السيناريو الأسوأ.${decisionInstruction}` },
                { id: 'macro', name: 'خبير الماكرو', model: 'gemini', fallbackModels: ['cerebras', 'groq', 'deepseek', 'ollama', 'glm', 'bedrock', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}حلل الوضع الاقتصادي العام وتأثيره على ${symbol} مع مراعاة السياق العربي.${decisionInstruction}` },
                { id: 'pattern', name: 'خبير الأنماط', model: 'cerebras', fallbackModels: ['ollama', 'mistral', 'groq', 'gemini', 'bedrock', 'glm', 'nvidia'], prompt: `${newsPrefix}${marketDataPrefix}هل ترى أي أنماط تاريخية متكررة في حركة ${symbol} الحالية؟${decisionInstruction}` },
                { id: 'exec', name: 'استراتيجي التنفيذ', model: 'ollama', fallbackModels: ['deepseek', 'bedrock', 'glm', 'gemini', 'groq', 'huggingface', 'openrouter'], prompt: `${newsPrefix}${marketDataPrefix}ما هو أفضل توقيت للدخول في ${symbol} بناءً على السيولة والنماذج المتاحة؟${decisionInstruction}` },
                { id: 'diverge', name: 'محلل التباين', model: 'cerebras', fallbackModels: ['groq', 'ollama', 'bedrock', 'gemini', 'mistral', 'glm', 'nvidia'], prompt: `${newsPrefix}${marketDataPrefix}ابحث عن إشارات معاكسة أو تباينات في تحليل ${symbol} — هل هناك سبب لعدم اتباع الاتجاه السائد؟${decisionInstruction}` },
                { id: 'scenario', name: 'محلل السيناريوهات', model: 'mistral', fallbackModels: ['ollama', 'bedrock', 'gemini', 'groq', 'glm', 'cerebras', 'nvidia'], prompt: `${newsPrefix}${marketDataPrefix}حلل السيناريوهات المحتملة لـ ${symbol} مع تقدير احتمالات كل سيناريو.${decisionInstruction}` },
            ];
            let predictionMarketVote = null;
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
                }
                catch (error) {
                    this.logger.debug(`🔮 9th model abstained (no data or error): ${error.message}`);
                }
            }
            const start = Date.now();
            const availableModelCount = ['groq', 'glm', 'gemini', 'cerebras', 'ollama', 'bedrock', 'nvidia', 'mistral']
                .filter(m => this._isModelKeyAvailable(m)).length;
            const MAX_MODEL_REUSE = availableModelCount <= 3 ? 3 : 2;
            const modelUsageCount = new Map();
            const activeRoles = roles.map(role => {
                let roleModels = [role.model, ...(role.fallbackModels || [])];
                if (role.model === 'ollama' && this._isCloudEnvironment()) {
                    const ollamaBaseUrl = this.configService.get('OLLAMA_BASE_URL', 'http://localhost:11434');
                    if (this._isLocalhostUrl(ollamaBaseUrl || 'http://localhost:11434')) {
                        roleModels = [...(role.fallbackModels || []), 'ollama'];
                    }
                }
                const models = roleModels;
                for (const model of models) {
                    const consecutiveFails = this.modelConsecutiveFailures.get(model) || 0;
                    if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
                        const cooldownUntil = this.modelCooldowns.get(model) || 0;
                        if (Date.now() < cooldownUntil)
                            continue;
                    }
                    if (!this._isModelKeyAvailable(model))
                        continue;
                    const currentUsage = modelUsageCount.get(model) || 0;
                    if (currentUsage >= MAX_MODEL_REUSE) {
                        this.logger.debug(`🔀 Model ${model} already used for ${currentUsage} roles — trying next model for role ${role.name}`);
                        continue;
                    }
                    modelUsageCount.set(model, currentUsage + 1);
                    return { ...role, resolvedModel: model };
                }
                for (const model of models) {
                    const consecutiveFails = this.modelConsecutiveFailures.get(model) || 0;
                    if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
                        const cooldownUntil = this.modelCooldowns.get(model) || 0;
                        if (Date.now() < cooldownUntil)
                            continue;
                    }
                    if (!this._isModelKeyAvailable(model))
                        continue;
                    const currentUsage = modelUsageCount.get(model) || 0;
                    if (currentUsage >= 5)
                        continue;
                    modelUsageCount.set(model, currentUsage + 1);
                    this.logger.warn(`⚠️ Relaxed diversification for role ${role.name}: using model ${model} (${currentUsage + 1} roles now)`);
                    return { ...role, resolvedModel: model };
                }
                this.logger.warn(`⚠️ All models for role ${role.name} are unavailable`);
                return { ...role, resolvedModel: role.model };
            });
            this.logger.log(`🎼 Resolved models for consensus: ${activeRoles.map(r => `${r.name}→${r.resolvedModel}`).join(', ')}`);
            const results = await Promise.allSettled(activeRoles.map(async (role) => {
                const roleStart = Date.now();
                try {
                    const response = await this._callModel(role.resolvedModel, {
                        symbol,
                        prompt: role.prompt,
                        type: 'market_analysis',
                        language,
                    });
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
                    if (response.confidence === 0) {
                        this.logger.warn(`🚫 Model ${role.resolvedModel} returned stub — no cooldown (key likely missing)`);
                    }
                    if (response.confidence > 0) {
                        this.modelConsecutiveFailures.delete(role.resolvedModel);
                        this.modelCooldownLevel.delete(role.resolvedModel);
                    }
                    return { ...role, response };
                }
                catch (error) {
                    this.usageLogger?.logFailure({
                        model: role.model,
                        endpoint: 'consensus',
                        inputPrompt: role.prompt,
                        latencyMs: Date.now() - roleStart,
                        errorMessage: error.message,
                    });
                    if (error.response?.status === 429 || error.message?.includes('429')) {
                        const fails = (this.modelConsecutiveFailures.get(role.resolvedModel) || 0) + 1;
                        this.modelConsecutiveFailures.set(role.resolvedModel, fails);
                        if (fails >= this.FAILURES_BEFORE_COOLDOWN) {
                            const level = (this.modelCooldownLevel.get(role.resolvedModel) || 0) + 1;
                            this.modelCooldownLevel.set(role.resolvedModel, level);
                            const cooldownMs = Math.min(this.BASE_COOLDOWN_MS * Math.pow(2, level - 1), this.MAX_COOLDOWN_MS);
                            this.modelCooldowns.set(role.resolvedModel, Date.now() + cooldownMs);
                        }
                    }
                    throw error;
                }
            }));
            const analyses = [];
            let buyWeight = 0;
            let sellWeight = 0;
            let holdWeight = 0;
            let totalConfidence = 0;
            let buyConfidences = [];
            let sellConfidences = [];
            let holdConfidences = [];
            const roleResponses = new Map();
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
                for (const role of failedRoles) {
                    for (const fallbackModel of role.fallbackModels || []) {
                        if (fallbackModel === role.resolvedModel)
                            continue;
                        if (!this._isModelKeyAvailable(fallbackModel))
                            continue;
                        const consecutiveFails = this.modelConsecutiveFailures.get(fallbackModel) || 0;
                        if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
                            const cooldownUntil = this.modelCooldowns.get(fallbackModel) || 0;
                            if (Date.now() < cooldownUntil)
                                continue;
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
                                this.modelConsecutiveFailures.delete(fallbackModel);
                                break;
                            }
                            else {
                                this.logger.warn(`⚠️ Fallback model ${fallbackModel} returned stub for role "${role.name}"`);
                            }
                        }
                        catch (error) {
                            if (error.response?.status === 429 || error.message?.includes('429')) {
                                const fails = (this.modelConsecutiveFailures.get(fallbackModel) || 0) + 1;
                                this.modelConsecutiveFailures.set(fallbackModel, fails);
                                if (fails >= this.FAILURES_BEFORE_COOLDOWN) {
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
            const HOLD_WEIGHT_MULTIPLIER = 0.3;
            for (const [roleId, { name, response }] of roleResponses) {
                const content = response.content || '';
                const vote = this._parseVote(content);
                const conf = response.confidence || 0.5;
                if (vote === 'BUY') {
                    buyWeight += conf;
                    buyConfidences.push(conf);
                }
                else if (vote === 'SELL') {
                    sellWeight += conf;
                    sellConfidences.push(conf);
                }
                else {
                    holdWeight += conf * HOLD_WEIGHT_MULTIPLIER;
                    holdConfidences.push(conf);
                }
                totalConfidence += vote === 'HOLD' ? conf * HOLD_WEIGHT_MULTIPLIER : conf;
                analyses.push({
                    role: name,
                    model: response.model,
                    vote,
                    confidence: Math.round(conf * 100),
                    reason: content.slice(0, 300) + '...',
                });
            }
            if (predictionMarketVote) {
                const pmConf = predictionMarketVote.confidence / 100;
                const pmWeight = pmConf > 0.70 ? 3.0
                    : pmConf > 0.55 ? 1.8
                        : pmConf > 0.40 ? 1.0
                            : 0.4;
                const pmWeightedConf = pmConf * pmWeight;
                if (predictionMarketVote.vote === 'BUY') {
                    buyWeight += pmWeightedConf;
                    buyConfidences.push(pmWeightedConf);
                }
                else if (predictionMarketVote.vote === 'SELL') {
                    sellWeight += pmWeightedConf;
                    sellConfidences.push(pmWeightedConf);
                }
                else {
                    holdWeight += pmConf;
                    holdConfidences.push(pmConf);
                }
                totalConfidence += pmWeightedConf;
                analyses.push({
                    ...predictionMarketVote,
                    reason: predictionMarketVote.reason + ` [weight×${pmWeight.toFixed(1)}]`,
                });
            }
            try {
                const scannerCacheKey = `scanner:deep:${symbol.replace('/', '').replace('-', '')}`;
                const scannerKeys = [
                    `scanner:deep:${symbol}`,
                    `scanner:deep:${symbol.replace('/USDT', '').replace('/USD', '')}USDT`,
                    scannerCacheKey,
                ];
                let scannerData = null;
                for (const key of scannerKeys) {
                    const raw = await this.redis?.get(key);
                    if (raw) {
                        scannerData = JSON.parse(raw);
                        break;
                    }
                }
                if (scannerData?.smartScore && scannerData.smartScore.action !== 'HOLD') {
                    const isBuy = scannerData.smartScore.action.includes('BUY');
                    const rawScore = Math.abs(scannerData.smartScore.score || 0);
                    const scanConf = rawScore / 100;
                    const isStrong = scannerData.smartScore.action.includes('STRONG');
                    const scanWeight = isStrong ? 2.0 : 1.2;
                    const scanWeightedConf = scanConf * scanWeight;
                    if (isBuy) {
                        buyWeight += scanWeightedConf;
                        buyConfidences.push(scanWeightedConf);
                    }
                    else {
                        sellWeight += scanWeightedConf;
                        sellConfidences.push(scanWeightedConf);
                    }
                    totalConfidence += scanWeightedConf;
                    analyses.push({
                        role: 'السكانر الفني المتقدم',
                        model: 'TechnicalScanner/10th',
                        vote: isBuy ? 'BUY' : 'SELL',
                        confidence: Math.round(rawScore),
                        reason: `SmartScore:${rawScore} | ${scannerData.smartScore.signalType || ''} | ${scannerData.smartScore.tradeTimeframe || ''} | divergence:${scannerData.divergence?.type || 'none'} [weight×${scanWeight}]`,
                    });
                    this.logger.debug(`🔍 Scanner vote for ${symbol}: ${isBuy ? 'BUY' : 'SELL'} score=${rawScore} weight=${scanWeight}`);
                }
            }
            catch (scanErr) {
                this.logger.debug(`Scanner vote skipped for ${symbol}: ${scanErr.message}`);
            }
            let recommendation = 'HOLD';
            let consensusScore = 0;
            if (totalConfidence > 0) {
                const buyPct = buyWeight / totalConfidence;
                const sellPct = sellWeight / totalConfidence;
                const holdPct = holdWeight / totalConfidence;
                if (buyWeight > 0 || sellWeight > 0) {
                    if (buyWeight >= sellWeight) {
                        recommendation = 'BUY';
                        consensusScore = buyConfidences.length > 0
                            ? Math.round(buyConfidences.reduce((a, b) => a + b, 0) / buyConfidences.length * 100)
                            : Math.round(buyPct * 100);
                    }
                    else {
                        recommendation = 'SELL';
                        consensusScore = sellConfidences.length > 0
                            ? Math.round(sellConfidences.reduce((a, b) => a + b, 0) / sellConfidences.length * 100)
                            : Math.round(sellPct * 100);
                    }
                }
                else {
                    recommendation = 'HOLD';
                    consensusScore = holdConfidences.length > 0
                        ? Math.round(holdConfidences.reduce((a, b) => a + b, 0) / holdConfidences.length * 100)
                        : 50;
                }
                if (recommendation !== 'HOLD' && consensusScore < 50) {
                    const votersForRec = recommendation === 'BUY' ? buyConfidences : sellConfidences;
                    const totalVoters = analyses.length + (predictionMarketVote ? 1 : 0);
                    if (votersForRec.length >= Math.ceil(totalVoters / 2)) {
                        consensusScore = Math.max(consensusScore, Math.round((votersForRec.length / totalVoters) * 100));
                    }
                }
            }
            const totalModels = 8 + (predictionMarketVote ? 1 : 0);
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
                    const strategyModels = ['glm', 'ollama', 'bedrock', 'groq'];
                    let masterStrategy = null;
                    for (const model of strategyModels) {
                        if (!this._isModelKeyAvailable(model))
                            continue;
                        const consecutiveFails = this.modelConsecutiveFailures.get(model) || 0;
                        if (consecutiveFails >= this.FAILURES_BEFORE_COOLDOWN) {
                            const cooldownUntil = this.modelCooldowns.get(model) || 0;
                            if (Date.now() < cooldownUntil)
                                continue;
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
                        }
                        catch {
                            continue;
                        }
                    }
                    if (masterStrategy && masterStrategy.confidence > 0 && masterStrategy.content.length > 10) {
                        masterStrategyContent = masterStrategy.content;
                    }
                }
                catch {
                }
            }
            if (analyses.length < 3 && recommendation === 'HOLD' && (buyWeight > 0 || sellWeight > 0)) {
                if (buyWeight > 0 || sellWeight > 0) {
                    const prevRecommendation = recommendation;
                    if (buyWeight >= sellWeight) {
                        recommendation = 'BUY';
                        consensusScore = buyConfidences.length > 0
                            ? Math.round(buyConfidences.reduce((a, b) => a + b, 0) / buyConfidences.length * 100)
                            : Math.round((buyWeight / (buyWeight + sellWeight)) * 100);
                    }
                    else {
                        recommendation = 'SELL';
                        consensusScore = sellConfidences.length > 0
                            ? Math.round(sellConfidences.reduce((a, b) => a + b, 0) / sellConfidences.length * 100)
                            : Math.round((sellWeight / (buyWeight + sellWeight)) * 100);
                    }
                    consensusScore = Math.max(consensusScore, 55);
                    this.logger.log(`🎼 Few-model override: ${prevRecommendation} → ${recommendation} (${consensusScore}%) — ${analyses.length}/${totalModels} models, ignoring HOLD with sparse data`);
                }
            }
            if (recommendation !== 'HOLD' && analyses.length >= 2) {
                const dirVotes = recommendation === 'BUY' ? buyConfidences : sellConfidences;
                const oppVotes = recommendation === 'BUY' ? sellConfidences : buyConfidences;
                if (dirVotes.length >= 2 && oppVotes.length === 0) {
                    consensusScore = Math.max(consensusScore, Math.min(75, dirVotes.length * 20 + 35));
                    this.logger.log(`🎼 Unanimous ${recommendation} from ${dirVotes.length} models — boosting confidence to ${consensusScore}%`);
                }
            }
            this.logger.log(`✅ Consensus: ${recommendation} (${consensusScore}%) from ${analyses.length}/${totalModels} models in ${Date.now() - start}ms`);
            const result = { consensusScore, recommendation, analyses, masterStrategy: masterStrategyContent };
            const isPartial = analyses.length < 3;
            const consensusCacheTTL = isPartial
                ? 60 * 1000
                : this.CACHE_TTL.consensus;
            try {
                await this.redis?.set(cacheKey, JSON.stringify(result), consensusCacheTTL);
            }
            catch { }
            return result;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`❌ AI Council failed: ${err.message}`, err.stack);
            return { consensusScore: 0, recommendation: 'HOLD', analyses: [], masterStrategy: language === 'en' ? 'Error processing consensus request.' : 'خطأ في معالجة طلب إجماع النماذج.', isFallback: true };
        }
    }
    async diagnoseModels() {
        const models = [
            { id: 'groq', name: 'Groq/Llama 3.3 70B', keyEnv: 'GROQ_API_KEY' },
            { id: 'gemini', name: 'Gemini 2.0 Flash', keyEnv: 'GOOGLE_AI_STUDIO_API_KEY', altKeyEnv: 'GEMINI_API_KEY' },
            { id: 'glm', name: 'GLM-4 (Zhipu AI)', keyEnv: 'GLM_API_KEY' },
            { id: 'cerebras', name: 'Cerebras/Llama 3.1 8B', keyEnv: 'CEREBRAS_API_KEY', altKeyEnv: 'CEREBRAS_KEY' },
            { id: 'ollama', name: 'Ollama/Qwen2.5', keyEnv: 'OLLAMA_API_KEY' },
            { id: 'bedrock', name: 'Bedrock/Claude 4.5 Haiku', keyEnv: 'AWS_ACCESS_KEY_ID' },
            { id: 'nvidia', name: 'NVIDIA NIM/Llama 3.3 70B', keyEnv: 'NVIDIA_API_KEY', altKeyEnv: 'NVIDIA_NIM_API_KEY' },
            { id: 'mistral', name: 'Mistral/Small', keyEnv: 'MISTRAL_API_KEY', altKeyEnv: 'MISTRAL_KEY' },
            { id: 'huggingface', name: 'HuggingFace/Mistral-7B', keyEnv: 'HUGGINGFACE_API_KEY', altKeyEnv: 'HF_API_KEY' },
            { id: 'openrouter', name: 'OpenRouter/Llama 3.1', keyEnv: 'OPENROUTER_API_KEY' },
            { id: 'deepseek', name: 'DeepSeek V3', keyEnv: 'DEEPSEEK_API_KEY' },
        ];
        const results = await Promise.all(models.map(async (m) => {
            const keyAvailable = this._isModelKeyAvailable(m.id);
            let apiWorking = false;
            let responseTimeMs = 0;
            let error;
            const altKeyEnv = m.altKeyEnv;
            let keyValue = this.configService.get(m.keyEnv, '') ||
                (altKeyEnv ? this.configService.get(altKeyEnv, '') : '') ||
                (m.id === 'bedrock' ? this.configService.get('AWS_ACCESS_KEY_ID', '') : '');
            if (!keyAvailable) {
                error = `API key not configured or not available on this platform`;
                return { model: m.name, keyAvailable, apiWorking, responseTimeMs, error };
            }
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
                }
                else {
                    const contentStr = response.content || '';
                    if (contentStr.includes('API error') || contentStr.includes('error:') || contentStr.includes('Error:') || contentStr.includes('⚠️')) {
                        error = contentStr.replace(/^⚠️\s*/, '').substring(0, 300);
                    }
                    else if (contentStr.length > 10) {
                        error = `Model returned stub (conf=${response.confidence}): ${contentStr.substring(0, 200)}`;
                    }
                    else {
                        error = `Model returned stub/empty response (confidence: ${response.confidence}, content: "${contentStr.substring(0, 50)}")`;
                    }
                }
            }
            catch (err) {
                responseTimeMs = Date.now() - start;
                error = err?.message || String(err);
                if (err?.response?.status) {
                    error = `HTTP ${err.response.status}: ${err.response?.data ? JSON.stringify(err.response.data).substring(0, 200) : err.message}`;
                }
            }
            return { model: m.name, keyAvailable, apiWorking, responseTimeMs, error };
        }));
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
    getCircuitBreakerStatus() {
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
    async analyzeWithAllModels(request) {
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
            this.huggingfaceService.analyze(enrichedRequest),
            this.openrouterService.analyze(enrichedRequest),
            this.deepseekService.analyze(enrichedRequest),
        ]);
        const analyses = [];
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
    getModelsStatus() {
        return [
            { model: 'Groq/Llama 3.3 70B', available: this._isModelKeyAvailable('groq'), specialty: '⚡ سرعة فائقة — تحليل المشاعر والترجمة الفورية' },
            { model: 'Gemini 2.0 Flash', available: this._isModelKeyAvailable('gemini'), specialty: '💎 تحليل إبداعي — استراتيجية ومنطق مهيكل' },
            { model: 'GLM-4 (Zhipu AI)', available: this._isModelKeyAvailable('glm'), specialty: '🧠 تحليل عربي — سياق طويل 200k' },
            { model: 'Cerebras/Llama 3.1 8B', available: this._isModelKeyAvailable('cerebras'), specialty: '🧠 سرعة خارقة — أنماط وتحليل فني (14,400 طلب/يوم مجاناً)' },
            { model: 'Ollama/Qwen2.5', available: this._isModelKeyAvailable('ollama'), specialty: '🏠 محلي بدون تكلفة — دعم عربي ممتاز' },
            { model: 'Bedrock/Claude 4.5 Haiku', available: this._isModelKeyAvailable('bedrock'), specialty: '☁️ أفضل جودة/سعر — مخاطر وأمان (Haiku 4.5 + Nova)' },
            { model: 'NVIDIA NIM/Llama 3.3 70B', available: this._isModelKeyAvailable('nvidia'), specialty: '🟢 تباين ومعاكسة — نماذج متنوعة (40 طلب/دقيقة مجاناً)' },
            { model: 'Mistral/Small', available: this._isModelKeyAvailable('mistral'), specialty: '🔮 سيناريوهات — تحليل عميق (1 مليار token/شهر مجاناً)' },
        ];
    }
    _recordLatency(model, responseMs) {
        const existing = this.modelLatencies.get(model);
        if (existing) {
            const alpha = 2 / (this.LATENCY_SAMPLE_WINDOW + 1);
            const newAvg = alpha * responseMs + (1 - alpha) * existing.avgMs;
            this.modelLatencies.set(model, {
                avgMs: newAvg,
                samples: existing.samples + 1,
                lastSampleAt: Date.now(),
            });
        }
        else {
            this.modelLatencies.set(model, {
                avgMs: responseMs,
                samples: 1,
                lastSampleAt: Date.now(),
            });
        }
    }
    _isModelKeyAvailable(model) {
        const keys = this.MODEL_KEY_MAP[model];
        if (!keys)
            return false;
        const env = process.env;
        const resolveKey = (keyName) => {
            if (this.configService) {
                const configValue = this.configService.get(keyName, '')?.trim() || '';
                if (configValue)
                    return configValue;
            }
            return env[keyName]?.trim() || '';
        };
        if (model === 'ollama') {
            const apiKey = resolveKey('OLLAMA_API_KEY');
            const baseUrl = resolveKey('OLLAMA_BASE_URL');
            const effectiveBaseUrl = baseUrl || 'http://localhost:11434';
            if (this._isCloudEnvironment() && this._isLocalhostUrl(effectiveBaseUrl)) {
                this.logger.debug(`🏠 Ollama skipped — localhost URL unreachable on cloud platform`);
                return false;
            }
            return !!apiKey || !!(baseUrl && !this._isLocalhostUrl(baseUrl));
        }
        if (model === 'huggingface') {
            const hasOwnKey = keys.some(key => !!resolveKey(key));
            if (hasOwnKey)
                return true;
            const orKey = resolveKey('OPENROUTER_API_KEY') || resolveKey('OPEN_ROUTER_API_KEY');
            return !!orKey;
        }
        if (model === 'gemini') {
            return keys.some(key => !!resolveKey(key));
        }
        if (model === 'bedrock') {
            return keys.every(key => !!resolveKey(key));
        }
        return keys.some(key => !!resolveKey(key));
    }
    _parseVote(content) {
        const decisionMatch = content.match(/DECISION:\s*(BUY|SELL|HOLD)/i);
        if (decisionMatch) {
            const decision = decisionMatch[1].toUpperCase();
            this.logger.debug(`📋 Parsed DECISION line: ${decision}`);
            return decision;
        }
        const arBuyPatterns = /(?:أنصح|أوصي|التوصية|توصيتي|رأيي|أرى|أميل|أرتئي|ننصح|نوصي)\s*(?:بـ)?(?:الشراء|بالشراء|بشراء|شراء|الدخول|بالشراء)/i;
        const arSellPatterns = /(?:أنصح|أوصي|التوصية|توصيتي|رأيي|أرى|أميل|أرتئي|ننصح|نوصي)\s*(?:بـ)?(?:البيع|بالبيع|ببيع|بيع|الخروج|بالبيع)/i;
        const arHoldPatterns = /(?:أنصح|أوصي|التوصية|توصيتي|رأيي|أرى|أميل|أرتئي|ننصح|نوصي)\s*(?:بـ)?(?:الانتظار|بالانتظار|بانتظار|الحياد|بالحشد|بالتوقف|التوقف|الحذر|الترقب)/i;
        const hasArBuy = arBuyPatterns.test(content);
        const hasArSell = arSellPatterns.test(content);
        const hasArHold = arHoldPatterns.test(content);
        if (hasArBuy && !hasArSell && !hasArHold)
            return 'BUY';
        if (hasArSell && !hasArBuy && !hasArHold)
            return 'SELL';
        if (hasArHold && !hasArBuy && !hasArSell)
            return 'HOLD';
        if (hasArBuy && hasArHold && !hasArSell)
            return 'BUY';
        if (hasArSell && hasArHold && !hasArBuy)
            return 'SELL';
        const engBuy = /(?:I\s+recommend\s+(?:buying|a\s+buy|to\s+buy)|my\s+recommendation\s+is\s+(?:to\s+)?buy|recommend\s+BUY|go\s+long|enter\s+long|buy\s+signal|bullish\s+outlook|upside|buy\s+on\s+dips|accumulate)/i.test(content);
        const engSell = /(?:I\s+recommend\s+(?:selling|a\s+sell|to\s+sell)|my\s+recommendation\s+is\s+(?:to\s+)?sell|recommend\s+SELL|go\s+short|enter\s+short|sell\s+signal|bearish\s+outlook|downside|sell\s+on\s+rally|distribute)/i.test(content);
        if (engBuy && !engSell)
            return 'BUY';
        if (engSell && !engBuy)
            return 'SELL';
        const contentLen = content.length;
        const buyKeywordRegex = /(شراء|صعود|شرائية|إيجابي|ارتفاع|BUY|BULLISH|LONG|UPWARD|UPTREND|أميل\s*للشراء|توقع\s*صعود|مستهدف\s*صعودي|استمرار\s*الصعود)/gi;
        const sellKeywordRegex = /(بيع|هبوط|بيعية|سلبي|انخفاض|SELL|BEARISH|SHORT|DOWNWARD|DOWNTREND|أميل\s*للبيع|توقع\s*هبوط|مستهدف\s*هبوطي|استمرار\s*الهبوط)/gi;
        let buyScore = 0, sellScore = 0;
        let m;
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
        const conclusion = content.slice(-200);
        const conclusionBuy = /(?:شراء|صعود|BUY|BULLISH|LONG|إيجابي|ارتفاع)/i.test(conclusion);
        const conclusionSell = /(?:بيع|هبوط|SELL|BEARISH|SHORT|سلبي|انخفاض)/i.test(conclusion);
        if (conclusionBuy && !conclusionSell)
            return 'BUY';
        if (conclusionSell && !conclusionBuy)
            return 'SELL';
        if (buyScore > sellScore * 1.2)
            return 'BUY';
        if (sellScore > buyScore * 1.2)
            return 'SELL';
        if (buyScore > 0 && sellScore === 0)
            return 'BUY';
        if (sellScore > 0 && buyScore === 0)
            return 'SELL';
        if (buyScore > sellScore)
            return 'BUY';
        if (sellScore > buyScore)
            return 'SELL';
        return 'HOLD';
    }
    _getCacheKey(request) {
        const raw = `${request.type}:${request.symbol || ''}:${request.language || ''}:${request.prompt}`;
        return crypto.createHash('sha256').update(raw).digest('hex');
    }
    _getCachedResult(key) {
        const entry = this.responseCache.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            this.responseCache.delete(key);
            return null;
        }
        return entry.result;
    }
    _setCachedResult(key, result, type) {
        const ttl = this.CACHE_TTL[type] || this.CACHE_TTL.general;
        this.responseCache.set(key, { result, expiresAt: Date.now() + ttl });
        if (this.responseCache.size > this.MAX_CACHE_SIZE) {
            this._evictOldestEntries(Math.floor(this.MAX_CACHE_SIZE * 0.2));
        }
        if (this.responseCache.size % 100 === 0) {
            this._cleanExpiredCache();
        }
    }
    _cleanExpiredCache() {
        const now = Date.now();
        for (const [key, entry] of this.responseCache) {
            if (now > entry.expiresAt) {
                this.responseCache.delete(key);
            }
        }
    }
    _evictOldestEntries(count) {
        let evicted = 0;
        for (const key of this.responseCache.keys()) {
            if (evicted >= count)
                break;
            this.responseCache.delete(key);
            evicted++;
        }
        this.logger.debug(`🗑️ Cache eviction: removed ${evicted} oldest entries (size: ${this.responseCache.size})`);
    }
    clearCache() {
        this.responseCache.clear();
        this.logger.debug('🗑️ AI response cache cleared');
    }
    async _enrichWithContext(request) {
        if (!this.ragService)
            return request;
        try {
            const searchQuery = request.symbol ? `${request.symbol} ${request.prompt}` : request.prompt;
            const context = await this.ragService.retrieveRelevantContext(searchQuery, 5);
            if (!context || context.trim().length === 0)
                return request;
            return { ...request, prompt: `📚 سياق من أرشيف الأخبار:\n${context}\n\n---\n\n${request.prompt}` };
        }
        catch (error) {
            this.logger.warn(`RAG enrichment failed: ${error.message}`);
            return request;
        }
    }
    async _callModel(model, request) {
        if (model === 'bedrock') {
            await this._refreshBedrockBudget();
            const budgetLimit = this.BEDROCK_MONTHLY_BUDGET_USD * this.BEDROCK_BUDGET_THRESHOLD_PERCENT;
            if (this.bedrockMonthlySpend >= budgetLimit) {
                this.logger.warn(`☁️ Bedrock budget guard: $${this.bedrockMonthlySpend.toFixed(2)}/$${this.BEDROCK_MONTHLY_BUDGET_USD} (>= ${this.BEDROCK_BUDGET_THRESHOLD_PERCENT * 100}%) — skipping Bedrock call`);
                throw new Error(`Bedrock monthly budget exceeded ($${this.bedrockMonthlySpend.toFixed(2)}/$${this.BEDROCK_MONTHLY_BUDGET_USD}, threshold ${this.BEDROCK_BUDGET_THRESHOLD_PERCENT * 100}%)`);
            }
        }
        const MODEL_TIMEOUT_MS = {
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
        const callWithTimeout = async () => {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Orchestrator timeout: model ${model} exceeded ${timeoutMs}ms`)), timeoutMs));
            const modelCall = () => {
                switch (model) {
                    case 'groq': return this.groqService.analyze(request);
                    case 'glm': return this.glmService.analyze(request);
                    case 'gemini': return this.geminiService.analyze(request);
                    case 'huggingface': return this.huggingfaceService.analyze(request);
                    case 'ollama': return this.ollamaService.analyze(request);
                    case 'bedrock': return this.bedrockService.analyze(request);
                    case 'openrouter': return this.openrouterService.analyze(request);
                    case 'deepseek': return this.deepseekService.analyze(request);
                    case 'cerebras': return this.cerebrasService.analyze(request);
                    case 'mistral': return this.mistralService.analyze(request);
                    case 'nvidia': return this.nvidiaService.analyze(request);
                    default: return this.geminiService.analyze(request);
                }
            };
            return Promise.race([modelCall(), timeoutPromise]);
        };
        return (0, retry_util_1.withExponentialBackoff)(callWithTimeout, {
            maxAttempts: 2,
            baseDelayMs: 1000,
            maxDelayMs: 8000,
            jitterMs: 200,
            logger: { warn: (msg) => this.logger.warn(msg) },
        });
    }
    async _refreshBedrockBudget() {
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        const currentMonth = new Date().getMonth();
        const lastCheckMonth = new Date(this.bedrockBudgetLastChecked).getMonth();
        if (currentMonth !== lastCheckMonth && this.bedrockBudgetLastChecked > 0) {
            this.bedrockMonthlySpend = 0;
        }
        if (now - this.bedrockBudgetLastChecked < fiveMinutes)
            return;
        try {
            this.bedrockBudgetLastChecked = now;
            const bedrockProviders = ['bedrock', 'bedrock-nova-micro', 'bedrock-nova-lite', 'bedrock-claude-haiku', 'bedrock-titan', 'bedrock-llama'];
            let totalSpend = 0;
            for (const provider of bedrockProviders) {
                const spend = await this.usageLogger?.getMonthlySpendForProvider(provider);
                if (spend)
                    totalSpend += spend;
            }
            this.bedrockMonthlySpend = totalSpend;
            if (this.bedrockMonthlySpend >= this.BEDROCK_MONTHLY_BUDGET_USD * 0.85) {
                this.logger.warn(`☁️ Bedrock budget at ${((this.bedrockMonthlySpend / this.BEDROCK_MONTHLY_BUDGET_USD) * 100).toFixed(1)}% ($${this.bedrockMonthlySpend.toFixed(2)}/$${this.BEDROCK_MONTHLY_BUDGET_USD})`);
            }
        }
        catch {
        }
    }
    _stableStringify(obj) {
        if (obj === null || typeof obj !== 'object')
            return JSON.stringify(obj);
        if (Array.isArray(obj))
            return '[' + obj.map(v => this._stableStringify(v)).join(',') + ']';
        const keys = Object.keys(obj).sort();
        return '{' + keys.map(k => JSON.stringify(k) + ':' + this._stableStringify(obj[k])).join(',') + '}';
    }
    _hashPrompt(prompt) {
        return crypto.createHash('sha256').update(prompt).digest('hex');
    }
    async fetchQuickMarketData(symbol) {
        return this._fetchQuickMarketData(symbol);
    }
    async _fetchQuickMarketData(symbol) {
        const stripped = symbol.replace(/[\/\-]/g, '').toUpperCase();
        const binanceSymbol = stripped.endsWith('USDT') ? stripped : stripped.replace('USD', 'USDT');
        const sanity = this.PRICE_SANITY[symbol];
        const refPrice = this.REFERENCE_PRICES[symbol];
        const allResults = await Promise.allSettled([
            (async () => {
                const res = await axios_1.default.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`, { timeout: 4000 });
                const price = parseFloat(res.data?.lastPrice || '0');
                if (price <= 0)
                    throw new Error('Binance price=0');
                const change24h = parseFloat(res.data?.priceChangePercent || '0');
                return { price, source: 'binance', change24h };
            })(),
            (async () => {
                const coingeckoId = this._symbolToCoingeckoId(symbol);
                const res = await axios_1.default.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`, { timeout: 5000 });
                const price = res.data?.[coingeckoId]?.usd;
                if (!price || price <= 0)
                    throw new Error('CoinGecko no price');
                const change24h = res.data?.[coingeckoId]?.usd_24h_change;
                return { price, source: 'coingecko', change24h };
            })(),
            (async () => {
                const base = symbol.split('/')[0].toUpperCase();
                const coincapId = AIOrchestratorService_1.COINCAP_IDS[base];
                if (!coincapId) {
                    throw new Error(`No CoinCap ID mapping for ${base} — skipping to prevent wrong price`);
                }
                const res = await axios_1.default.get(`https://api.coincap.io/v2/assets/${coincapId}`, { timeout: 5000 });
                const price = parseFloat(res.data?.data?.priceUsd || '0');
                if (price <= 0)
                    throw new Error('CoinCap price=0');
                const change24h = parseFloat(res.data?.data?.changePercent24Hr || '0');
                return { price, source: 'coincap', change24h };
            })(),
            (async () => {
                const bybitSymbol = symbol.replace(/[\/\-]/g, '').toUpperCase();
                const res = await axios_1.default.get(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${bybitSymbol}`, { timeout: 4000 });
                const price = parseFloat(res.data?.result?.list?.[0]?.lastPrice || '0');
                if (price <= 0)
                    throw new Error('Bybit price=0');
                const change24h = parseFloat(res.data?.result?.list?.[0]?.price24hPcnt || '0') * 100;
                return { price, source: 'bybit', change24h };
            })(),
            (async () => {
                const tdApiKey = this.configService.get('TWELVE_DATA_API_KEY', '');
                if (!tdApiKey)
                    throw new Error('No TwelveData key');
                const tdSymbol = symbol.replace(/[\/\-]/g, '');
                const res = await axios_1.default.get(`https://api.twelvedata.com/price?symbol=${tdSymbol}&apikey=${tdApiKey}`, { timeout: 5000 });
                const price = parseFloat(res.data?.price || '0');
                if (price <= 0)
                    throw new Error('TwelveData price=0');
                return { price, source: 'twelvedata', change24h: undefined };
            })(),
            (async () => {
                let yahooSymbol;
                const base = symbol.split('/')[0].toUpperCase();
                const quote = symbol.split('/')[1]?.toUpperCase();
                if (quote && ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'].includes(base) &&
                    ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'].includes(quote)) {
                    yahooSymbol = `${base}${quote}=X`;
                }
                else if (base === 'XAU' || base === 'XAG' || base === 'XPT') {
                    yahooSymbol = `${base}${quote}=X`;
                }
                else if (!quote || quote === 'USD' || quote === 'USDT') {
                    yahooSymbol = `${base}-USD`;
                }
                else {
                    yahooSymbol = `${base}-${quote}`;
                }
                const res = await axios_1.default.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`, {
                    timeout: 6000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                });
                const result = res.data?.chart?.result?.[0];
                const meta = result?.meta;
                const price = meta?.regularMarketPrice;
                if (!price || price <= 0)
                    throw new Error('Yahoo Finance price=0');
                let change24h;
                const closes = result?.indicators?.quote?.[0]?.close?.filter((v) => v != null) || [];
                if (closes.length >= 2) {
                    const prevClose = closes[closes.length - 2];
                    const latestClose = closes[closes.length - 1];
                    if (prevClose > 0) {
                        change24h = ((latestClose - prevClose) / prevClose) * 100;
                    }
                }
                return { price, source: 'yahoo-finance', change24h };
            })(),
            (async () => {
                const base = symbol.split('/')[0].toUpperCase();
                const quote = symbol.split('/')[1]?.toUpperCase();
                const fiatCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'SGD', 'HKD'];
                if (!fiatCurrencies.includes(base) || !fiatCurrencies.includes(quote)) {
                    throw new Error('Not a fiat pair');
                }
                const res = await axios_1.default.get(`https://api.exchangerate-api.com/v4/latest/${base}`, { timeout: 5000 });
                const rate = res.data?.rates?.[quote];
                if (!rate || rate <= 0)
                    throw new Error('ExchangeRate no rate');
                return { price: rate, source: 'exchangerate-api', change24h: undefined };
            })(),
            (async () => {
                const avApiKey = this.configService.get('ALPHA_VANTAGE_API_KEY', 'demo');
                if (!avApiKey || avApiKey === 'disabled')
                    throw new Error('No Alpha Vantage key');
                const base = symbol.split('/')[0].toUpperCase();
                const quote = symbol.split('/')[1]?.toUpperCase();
                const fiatCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
                if (fiatCurrencies.includes(base) && fiatCurrencies.includes(quote)) {
                    const res = await axios_1.default.get(`https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote}&apikey=${avApiKey}`, { timeout: 6000 });
                    const rate = parseFloat(res.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'] || '0');
                    if (rate <= 0)
                        throw new Error('Alpha Vantage forex rate=0');
                    return { price: rate, source: 'alpha-vantage-forex', change24h: undefined };
                }
                else if (base === 'XAU' || base === 'XAG') {
                    const res = await axios_1.default.get(`https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote || 'USD'}&apikey=${avApiKey}`, { timeout: 6000 });
                    const rate = parseFloat(res.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'] || '0');
                    if (rate <= 0)
                        throw new Error('Alpha Vantage commodity rate=0');
                    return { price: rate, source: 'alpha-vantage-commodity', change24h: undefined };
                }
                else {
                    const res = await axios_1.default.get(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${base}&apikey=${avApiKey}`, { timeout: 6000 });
                    const price = parseFloat(res.data?.['Global Quote']?.['05. price'] || '0');
                    if (price <= 0)
                        throw new Error('Alpha Vantage stock price=0');
                    const prevClose = parseFloat(res.data?.['Global Quote']?.['08. previous close'] || '0');
                    let change24h;
                    if (prevClose > 0) {
                        change24h = ((price - prevClose) / prevClose) * 100;
                    }
                    return { price, source: 'alpha-vantage-stock', change24h };
                }
            })(),
        ]);
        const validPrices = [];
        const rejectedPrices = [];
        for (const result of allResults) {
            if (result.status === 'fulfilled' && result.value?.price > 0) {
                const { price, source, change24h: srcChange24h } = result.value;
                if (sanity && (price < sanity.min || price > sanity.max)) {
                    rejectedPrices.push({ price, source, reason: `outside [${sanity.min}, ${sanity.max}]` });
                    this.logger.warn(`📊 PRICE SANITY REJECTED ${symbol}: $${price} from ${source} — outside range [$${sanity.min}, $${sanity.max}]`);
                    continue;
                }
                validPrices.push({ price, source, change24h: srcChange24h });
            }
        }
        if (rejectedPrices.length > 0) {
            this.logger.warn(`📊 ${symbol}: ${rejectedPrices.length} source(s) rejected by sanity check: ` +
                rejectedPrices.map(r => `${r.source}=$${r.price} (${r.reason})`).join(', '));
        }
        let finalPrice = 0;
        let finalSource = 'none';
        let change24h;
        if (validPrices.length >= 2) {
            const prices = validPrices.map(v => v.price).sort((a, b) => a - b);
            const medianPrice = prices.length % 2 === 0
                ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
                : prices[Math.floor(prices.length / 2)];
            const agreeing = validPrices.filter(v => {
                const deviation = Math.abs(v.price - medianPrice) / medianPrice;
                return deviation < 0.05;
            });
            if (agreeing.length >= 2) {
                const agreeingPrices = agreeing.map(v => v.price).sort((a, b) => a - b);
                finalPrice = agreeingPrices.length % 2 === 0
                    ? (agreeingPrices[agreeingPrices.length / 2 - 1] + agreeingPrices[agreeingPrices.length / 2]) / 2
                    : agreeingPrices[Math.floor(agreeingPrices.length / 2)];
                finalSource = agreeing.map(v => v.source).join('+');
                change24h = agreeing[0].change24h;
                this.logger.debug(`📊 ${symbol}: Cross-validated price $${finalPrice} from ${agreeing.length} agreeing sources (${finalSource})`);
            }
            else {
                const sourcePriority = ['binance', 'coingecko', 'bybit', 'coincap', 'yahoo-finance', 'twelvedata', 'exchangerate-api', 'alpha-vantage'];
                const sorted = [...validPrices].sort((a, b) => {
                    const aIdx = sourcePriority.indexOf(a.source);
                    const bIdx = sourcePriority.indexOf(b.source);
                    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
                });
                finalPrice = sorted[0].price;
                finalSource = sorted[0].source + ' (disputed)';
                change24h = sorted[0].change24h;
                this.logger.warn(`📊 ${symbol}: Sources disagree — using most reliable: $${finalPrice} from ${finalSource}`);
            }
        }
        else if (validPrices.length === 1) {
            finalPrice = validPrices[0].price;
            finalSource = validPrices[0].source;
            change24h = validPrices[0].change24h;
            this.logger.debug(`📊 ${symbol}: Single source price $${finalPrice} from ${finalSource}`);
        }
        if (!finalPrice || finalPrice <= 0) {
            if (refPrice && refPrice > 0) {
                finalPrice = refPrice;
                finalSource = 'reference-table';
                this.logger.warn(`📊 ${symbol}: ALL live sources failed/insane — using reference price $${refPrice}`);
            }
            else {
                const cachedPrice = this.lastKnownPriceCache.get(symbol);
                if (cachedPrice && (Date.now() - cachedPrice.timestamp) < this.PRICE_CACHE_MAX_AGE) {
                    finalPrice = cachedPrice.price;
                    finalSource = `cache (${Math.round((Date.now() - cachedPrice.timestamp) / 1000)}s old)`;
                    this.logger.warn(`📊 ${symbol}: Using cached price $${finalPrice} (${finalSource})`);
                }
                else {
                    this.logger.error(`📊 ALL price sources FAILED for ${symbol} — no reference price, no cache`);
                    return { price: 0, rsi: 50, macd: 'غير متوفر', change24h: 0 };
                }
            }
        }
        let rsi = 50;
        let macd = 'غير متوفر';
        try {
            const klinesRes = await axios_1.default.get(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=30`, { timeout: 4000 });
            const closes = (klinesRes.data || []).map((k) => parseFloat(k[4])).filter((v) => !isNaN(v));
            if (closes.length > 14) {
                rsi = this._calculateRSI(closes);
                macd = this._calculateMACD(closes);
            }
        }
        catch {
        }
        if (rsi === 50) {
            try {
                const bybitSymbol = symbol.replace(/[\/\-]/g, '').toUpperCase();
                const bybitKlinesRes = await axios_1.default.get(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=60&limit=30`, { timeout: 4000 });
                const closes = (bybitKlinesRes.data?.result?.list || [])
                    .map((k) => parseFloat(k[4]))
                    .filter((v) => !isNaN(v))
                    .reverse();
                if (closes.length > 14) {
                    rsi = this._calculateRSI(closes);
                    macd = this._calculateMACD(closes);
                }
            }
            catch {
            }
        }
        if (rsi === 50) {
            try {
                let yahooKlineSymbol;
                const base = symbol.split('/')[0].toUpperCase();
                const quote = symbol.split('/')[1]?.toUpperCase();
                const fiatCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
                if (fiatCurrencies.includes(base) && fiatCurrencies.includes(quote)) {
                    yahooKlineSymbol = `${base}${quote}=X`;
                }
                else if (base === 'XAU' || base === 'XAG' || base === 'XPT') {
                    yahooKlineSymbol = `${base}${quote}=X`;
                }
                else if (!quote || quote === 'USD' || quote === 'USDT') {
                    yahooKlineSymbol = base;
                }
                else {
                    yahooKlineSymbol = `${base}-${quote}`;
                }
                const yfKlineRes = await axios_1.default.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooKlineSymbol)}?interval=1h&range=5d`, {
                    timeout: 6000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                });
                const yfCloses = (yfKlineRes.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [])
                    .filter((v) => v != null && v > 0);
                if (yfCloses.length > 14) {
                    rsi = this._calculateRSI(yfCloses);
                    macd = this._calculateMACD(yfCloses);
                }
            }
            catch {
            }
        }
        this.lastKnownPriceCache.set(symbol, { price: finalPrice, rsi, macd, timestamp: Date.now() });
        if (this.lastKnownPriceCache.size > 50) {
            const now = Date.now();
            for (const [key, entry] of this.lastKnownPriceCache) {
                if (now - entry.timestamp > this.PRICE_CACHE_MAX_AGE)
                    this.lastKnownPriceCache.delete(key);
            }
        }
        this.logger.log(`📊 ${symbol}: price=$${finalPrice} from ${finalSource}, RSI=${rsi}, MACD=${macd}, 24h=${change24h?.toFixed(2) || 'N/A'}%` +
            (validPrices.length > 0 ? ` (${validPrices.length}/${allResults.length} sources valid)` : ' (fallback)'));
        return { price: finalPrice, rsi, macd, change24h };
    }
    _symbolToCoingeckoId(symbol) {
        const map = {
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
        for (const [key, id] of Object.entries(map)) {
            if (key.toUpperCase() === normalized || key.toUpperCase() === symbol.toUpperCase())
                return id;
        }
        const base = symbol.split('/')[0].toUpperCase();
        for (const [key, id] of Object.entries(map)) {
            if (key.startsWith(base))
                return id;
        }
        return base.toLowerCase();
    }
    async _fetchCoinGeckoFallback(symbol) {
        try {
            const coingeckoId = this._symbolToCoingeckoId(symbol);
            const cgUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`;
            const cgRes = await axios_1.default.get(cgUrl, { timeout: 5000 });
            const cgPrice = cgRes.data?.[coingeckoId]?.usd;
            if (cgPrice && cgPrice > 0) {
                this.logger.debug(`📊 CoinGecko fallback for ${symbol}: price=${cgPrice}`);
                return { price: cgPrice, rsi: 50, macd: 'غير متوفر' };
            }
        }
        catch (error) {
            this.logger.debug(`📊 CoinGecko fallback also failed for ${symbol}: ${error.message}`);
        }
        return { price: 0, rsi: 50, macd: 'غير متوفر' };
    }
    _calculateRSI(closes, period = 14) {
        if (closes.length < period + 1)
            return 50;
        let gains = 0, losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            if (change > 0)
                gains += change;
            else
                losses += Math.abs(change);
        }
        if (losses === 0)
            return 100;
        const rs = gains / losses;
        return Math.round(100 - (100 / (1 + rs)));
    }
    _calculateMACD(closes) {
        if (closes.length < 26)
            return 'غير متوفر (بيانات غير كافية)';
        const ema12 = this._calculateEMA(closes, 12);
        const ema26 = this._calculateEMA(closes, 26);
        const macdLine = ema12 - ema26;
        const direction = macdLine > 0 ? 'صاعد' : 'هبوطي';
        return `${direction} (القيمة: ${macdLine.toFixed(2)})`;
    }
    _calculateEMA(data, period) {
        const multiplier = 2 / (period + 1);
        let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < data.length; i++) {
            ema = (data[i] - ema) * multiplier + ema;
        }
        return ema;
    }
    _calculateDynamicConfidence(model, content, type) {
        let confidence = 0.3;
        if (content.length > 100)
            confidence += 0.05;
        if (content.length > 300)
            confidence += 0.05;
        if (content.length > 600)
            confidence += 0.05;
        if (content.length > 1000)
            confidence += 0.05;
        if (content.includes('DECISION:') || content.includes('القرار:'))
            confidence += 0.05;
        if (content.includes('{') && content.includes('}'))
            confidence += 0.03;
        if (content.includes('```') || content.includes('1.') || content.includes('-'))
            confidence += 0.04;
        if (/(\$?\d+[\.,]?\d*|\d+\s*%)/.test(content))
            confidence += 0.03;
        const hasBuy = /شراء|BUY|صعود|long/i.test(content);
        const hasSell = /بيع|SELL|هبوط|short/i.test(content);
        const hasHold = /انتظار|HOLD|WAIT|محايد/i.test(content);
        const hasNegation = /لا أنصح|لا أ 推荐|غير مستحسن|لا يُنصح|I don't recommend|not recommended|avoid/i.test(content);
        if ((hasBuy || hasSell || hasHold) && !hasNegation)
            confidence += 0.10;
        if ((hasBuy || hasSell || hasHold) && hasNegation)
            confidence += 0.03;
        const hasRisk = /مخاطر|risk|تحذير|warning|حذر|caution|قد يخسر|may lose/i.test(content);
        const hasDisclaimer = /إخلاء مسؤولية|disclaimer|تعليمي|educational|ليس نصيحة/i.test(content);
        if (hasRisk)
            confidence += 0.05;
        if (hasDisclaimer)
            confidence += 0.05;
        const arabicPattern = /[\u0600-\u06FF]/;
        if (arabicPattern.test(content))
            confidence += 0.03;
        if (arabicPattern.test(content) && /[a-zA-Z]{3,}/.test(content))
            confidence += 0.02;
        const modelReliability = {
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
        if (content.includes('⚠️') || content.includes('غير متاح') || content.includes('unavailable'))
            confidence -= 0.15;
        if (content.length < 50)
            confidence -= 0.10;
        if (/لم أتمكن|لا أستطيع|I cannot|I'm unable/i.test(content))
            confidence -= 0.10;
        return Math.min(Math.max(confidence, 0.05), 0.95);
    }
};
exports.AIOrchestratorService = AIOrchestratorService;
AIOrchestratorService.COINCAP_IDS = {
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
exports.AIOrchestratorService = AIOrchestratorService = AIOrchestratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(13, (0, common_1.Optional)()),
    __param(14, (0, common_1.Optional)()),
    __param(14, (0, common_1.Inject)((0, common_1.forwardRef)(() => prediction_market_service_1.PredictionMarketService))),
    __param(15, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        groq_service_1.GroqService,
        glm_service_1.GlmService,
        gemini_service_1.GeminiService,
        huggingface_service_1.HuggingFaceService,
        ollama_service_1.OllamaService,
        bedrock_service_1.BedrockService,
        openrouter_service_1.OpenRouterService,
        deepseek_service_1.DeepSeekService,
        cerebras_service_1.CerebrasService,
        mistral_service_1.MistralService,
        nvidia_service_1.NvidiaService,
        ai_usage_logger_service_1.AiUsageLoggerService,
        rag_service_1.RagService,
        prediction_market_service_1.PredictionMarketService,
        redis_service_1.RedisService])
], AIOrchestratorService);
//# sourceMappingURL=ai-orchestrator.service.js.map