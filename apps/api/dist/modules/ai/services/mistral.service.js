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
var MistralService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MistralService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const confidence_util_1 = require("./confidence.util");
const env_resolver_1 = require("./env-resolver");
let MistralService = MistralService_1 = class MistralService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(MistralService_1.name);
        this.baseUrl = 'https://api.mistral.ai/v1/chat/completions';
        this.modelCandidates = [
            'mistral-small-latest',
            'open-mistral-nemo',
            'mistral-medium-latest',
            'mistral-large-latest',
            'open-mistral-7b',
        ];
        this.resolvedModel = null;
        this.apiKey = this._resolveApiKey();
        if (this.apiKey) {
            this.logger.log('🔮 Mistral Service initialized — 1B tokens/month FREE (replaces DeepSeek)');
        }
        else {
            this.logger.warn('⚠️ MISTRAL_API_KEY not set — get free key at console.mistral.ai');
        }
    }
    _resolveApiKey() {
        return (0, env_resolver_1.resolveEnvKey)(this.configService, 'MISTRAL_API_KEY', ['MISTRAL_KEY', 'MISTRAL_API_KEY_V1']);
    }
    async analyze(request) {
        if (!this.apiKey) {
            const resolved = (0, env_resolver_1.reResolveKey)(this.configService, this.apiKey, 'MISTRAL_API_KEY', ['MISTRAL_KEY', 'MISTRAL_API_KEY_V1']);
            if (resolved) {
                this.apiKey = resolved;
                this.logger.log('🔮 Mistral key resolved on-demand');
            }
        }
        if (!this.apiKey) {
            return this._stubResponse(request);
        }
        const startTime = Date.now();
        const systemPrompt = this._buildSystemPrompt(request);
        const modelsToTry = this.resolvedModel ? [this.resolvedModel, ...this.modelCandidates.filter(m => m !== this.resolvedModel)] : this.modelCandidates;
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
                    },
                    timeout: 6000,
                });
                const content = response.data?.choices?.[0]?.message?.content || '';
                if (content.trim().length === 0) {
                    errors.push(`${model}: empty response`);
                    continue;
                }
                if (!this.resolvedModel) {
                    this.resolvedModel = model;
                    this.logger.log(`🔮 Mistral model resolved: ${model}`);
                }
                return {
                    model: `Mistral/${model}`,
                    content: content.trim(),
                    confidence: (0, confidence_util_1.calculateConfidence)(content, 'mistral'),
                    processingTimeMs: Date.now() - startTime,
                    language: request.language || 'ar',
                };
            }
            catch (error) {
                const status = error.response?.status;
                const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : error.message;
                errors.push(`${model}: ${status || 'N/A'} — ${errData}`);
                if (status === 429) {
                    this.logger.warn(`🚫 Mistral ${model} rate limited (429) — trying next model...`);
                    continue;
                }
                if (status === 401 || status === 403) {
                    this.logger.error(`❌ Mistral auth failed (${status}) — API key may be invalid`);
                    return this._stubResponse(request, errors, true);
                }
                if (status === 402) {
                    this.logger.warn(`💸 Mistral ${model} requires payment (402) — trying free model...`);
                    continue;
                }
                if (status === 404) {
                    this.logger.warn(`🔮 Mistral model ${model} not found (404) — trying next...`);
                    continue;
                }
                this.logger.warn(`🔮 Mistral ${model} failed: ${error.message} (${status})`);
                continue;
            }
        }
        this.logger.warn(`🔮 All Mistral models failed (${errors.length} attempts) — returning stub`);
        return this._stubResponse(request, errors);
    }
    _buildSystemPrompt(request) {
        const lang = request.language === 'en' ? 'English' : 'Arabic';
        return `أنت محلل سيناريوهات مالي متخصص في ${request.type}. أجب بالعربية فقط. حلل السيناريوهات المحتملة مع تقدير احتمالات كل سيناريو. كن موجزاً ومبنياً على البيانات. أضف دائماً تنبيهات المخاطر. IMPORTANT: Respond in ${lang} only.`;
    }
    _stubResponse(request, errors = [], authFailed = false) {
        const errorDetail = errors.length > 0 ? ` الأخطاء: ${errors.slice(0, 2).join(' | ')}` : '';
        const content = authFailed
            ? `⚠️ مفتاح Mistral API غير صالح أو منتهي.${errorDetail}`
            : `⚠️ مفتاح Mistral API غير مكوّن. احصل على مفتاح مجاني من console.mistral.ai (يتطلب تأكيد رقم الهاتف) واضبط MISTRAL_API_KEY في Railway.${errorDetail}`;
        return {
            model: 'Mistral/Unavailable',
            content,
            confidence: 0,
            processingTimeMs: 0,
            language: request.language || 'ar',
            isFallback: true,
        };
    }
};
exports.MistralService = MistralService;
exports.MistralService = MistralService = MistralService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MistralService);
//# sourceMappingURL=mistral.service.js.map