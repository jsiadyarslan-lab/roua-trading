"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var OpenRouterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const confidence_util_1 = require("./confidence.util");
const env_resolver_1 = require("./env-resolver");
let OpenRouterService = OpenRouterService_1 = class OpenRouterService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(OpenRouterService_1.name);
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.modelsUrl = 'https://openrouter.ai/api/v1/models';
        this.staticModelCandidates = [
            'qwen/qwen-2.5-7b-instruct:free',
            'meta-llama/llama-3.1-8b-instruct:free',
            'google/gemma-3-27b-it:free',
            'mistralai/mistral-small-3.1-24b-instruct:free',
            'deepseek/deepseek-r1:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'deepseek/deepseek-chat-v3-0324:free',
            'deepseek/deepseek-chat',
            'huggingfaceh4/zephyr-7b-beta:free',
        ];
        this.discoveredFreeModels = [];
        this.lastDiscoveryTime = 0;
        this.discoveryCacheMs = 30 * 60 * 1000;
        this.resolvedModel = null;
        this.apiKey = this._resolveApiKey();
        if (this.apiKey) {
            this.logger.log(`🔀 OpenRouter Service initialized — key configured (${this.apiKey.length} chars)`);
        }
        else {
            this.logger.warn('⚠️ OPENROUTER_API_KEY not set or empty (checked ConfigService + process.env + OPEN_ROUTER_API_KEY alternate)');
        }
    }
    _resolveApiKey() {
        return (0, env_resolver_1.resolveEnvKey)(this.configService, 'OPENROUTER_API_KEY', ['OPEN_ROUTER_API_KEY']);
    }
    async _discoverFreeModels() {
        if (this.discoveredFreeModels.length > 0 && Date.now() - this.lastDiscoveryTime < this.discoveryCacheMs) {
            return this.discoveredFreeModels;
        }
        try {
            const response = await axios_1.default.get(this.modelsUrl, {
                headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
                timeout: 15000,
            });
            const models = response.data?.data || [];
            const freeModels = models
                .filter((m) => {
                const id = m.id || '';
                const promptPrice = m.pricing?.prompt;
                return id.endsWith(':free') || promptPrice === '0' || promptPrice === '0.0' || promptPrice === '0.00';
            })
                .map((m) => m.id)
                .filter((id) => {
                const lower = id.toLowerCase();
                return lower.includes('deepseek') || lower.includes('llama') || lower.includes('qwen')
                    || lower.includes('gemma') || lower.includes('mistral') || lower.includes('phi')
                    || lower.includes('zephyr') || lower.includes('hermes');
            });
            if (freeModels.length > 0) {
                this.discoveredFreeModels = freeModels;
                this.lastDiscoveryTime = Date.now();
                this.logger.log(`🔀 Discovered ${freeModels.length} free models from OpenRouter: ${freeModels.slice(0, 5).join(', ')}...`);
                return freeModels;
            }
        }
        catch (error) {
            this.logger.warn(`🔀 Failed to discover models from OpenRouter: ${error.message}`);
        }
        return this.staticModelCandidates;
    }
    async analyze(request) {
        if (!this.apiKey) {
            const resolved = (0, env_resolver_1.reResolveKey)(this.configService, this.apiKey, 'OPENROUTER_API_KEY', ['OPEN_ROUTER_API_KEY']);
            if (resolved) {
                this.apiKey = resolved;
                this.logger.log(`🔀 OpenRouter key resolved on-demand (key: ${resolved.substring(0, 4)}***${resolved.substring(resolved.length - 4)})`);
            }
        }
        if (!this.apiKey) {
            return this._stubResponse(request, ['API key not found in OPENROUTER_API_KEY or OPEN_ROUTER_API_KEY']);
        }
        const startTime = Date.now();
        const systemPrompt = this._buildSystemPrompt(request);
        const discoveredModels = await this._discoverFreeModels();
        const allCandidates = [...new Set([...discoveredModels, ...this.staticModelCandidates])];
        const modelsToTry = this.resolvedModel
            ? [this.resolvedModel, ...allCandidates.filter(m => m !== this.resolvedModel)]
            : allCandidates;
        const errors = [];
        for (const model of modelsToTry) {
            try {
                const response = await axios_1.default.post(this.baseUrl, {
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: request.prompt },
                    ],
                    temperature: 0.3,
                    max_tokens: 1024,
                }, {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://roua-trading-production.up.railway.app',
                        'X-Title': 'Roua Trading AI',
                    },
                    timeout: 60000,
                });
                const content = response.data?.choices?.[0]?.message?.content || '';
                if (content.trim().length > 0) {
                    if (!this.resolvedModel || this.resolvedModel !== model) {
                        this.resolvedModel = model;
                        this.logger.log(`🔀 OpenRouter model resolved: ${model}`);
                    }
                    return {
                        model: `OpenRouter/${model.split('/').pop()}`,
                        content: content.trim(),
                        confidence: (0, confidence_util_1.calculateConfidence)(content, 'openrouter'),
                        processingTimeMs: Date.now() - startTime,
                        language: request.language || 'ar',
                    };
                }
            }
            catch (error) {
                const status = error.response?.status;
                const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 150) : error.message;
                errors.push(`${model}: ${status || 'N/A'} — ${errData}`);
                if (status === 429) {
                    this.logger.warn(`🔀 OpenRouter ${model} rate limited (429) — trying next model...`);
                    if (this.resolvedModel === model) {
                        this.resolvedModel = null;
                    }
                    await new Promise(r => setTimeout(r, 500));
                    continue;
                }
                if (status === 401 || status === 403) {
                    this.logger.error(`❌ OpenRouter auth failed (${status}) — API key may be invalid. Key starts with: ${this.apiKey.substring(0, 4)}***`);
                    return this._stubResponse(request, errors, true);
                }
                if (status === 402) {
                    this.logger.warn(`💸 OpenRouter ${model} requires payment (402) — trying free model...`);
                    continue;
                }
                if (status === 400) {
                    this.logger.debug(`🔀 OpenRouter ${model} bad request (400) — model may be deprecated`);
                    continue;
                }
                this.logger.warn(`🔀 OpenRouter ${model} failed (${status || 'N/A'}): ${errData}`);
                continue;
            }
        }
        this.logger.warn(`🔀 All OpenRouter models failed (${errors.length} attempts) — returning stub`);
        return this._stubResponse(request, errors);
    }
    _buildSystemPrompt(request) {
        const lang = request.language === 'en' ? 'English' : 'Arabic';
        return `You are a professional financial AI analyst specializing in ${request.type}. You provide a unique perspective by looking for divergences, contrarian signals, and cross-model validation. Respond in ${lang}. Be concise, data-driven, and professional. Always include risk disclaimers.`;
    }
    _stubResponse(request, errors = [], authFailed = false) {
        const errorDetail = errors.length > 0
            ? ` التفاصيل: ${errors.slice(0, 2).join(' | ')}`
            : '';
        const content = authFailed
            ? `⚠️ مفتاح OpenRouter API غير صالح أو منتهي (401/403). تحقق من OPENROUTER_API_KEY في Railway.${errorDetail}`
            : `⚠️ مفتاح OpenRouter API غير مكوّن. احصل على مفتاح مجاني من openrouter.ai/keys واضبط OPENROUTER_API_KEY في Railway.${errorDetail}`;
        return {
            model: 'OpenRouter/Unavailable',
            content,
            confidence: 0,
            processingTimeMs: 0,
            language: request.language || 'ar',
        };
    }
};
exports.OpenRouterService = OpenRouterService;
exports.OpenRouterService = OpenRouterService = OpenRouterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenRouterService);
//# sourceMappingURL=openrouter.service.js.map