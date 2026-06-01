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
var DeepSeekService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepSeekService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const retry_util_1 = require("./retry.util");
const confidence_util_1 = require("./confidence.util");
const axios_1 = __importDefault(require("axios"));
let DeepSeekService = DeepSeekService_1 = class DeepSeekService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(DeepSeekService_1.name);
    }
    _resolveApiKey() {
        const env = process.env;
        return (this.configService.get('DEEPSEEK_API_KEY', '')?.trim() ||
            env['DEEPSEEK_API_KEY']?.trim() ||
            '');
    }
    async analyze(request) {
        const apiKey = this._resolveApiKey();
        if (!apiKey) {
            return {
                model: 'DeepSeek/Stub',
                content: '',
                confidence: 0,
                processingTimeMs: 0,
                language: request.language || 'ar',
                isFallback: true,
            };
        }
        const modelCandidates = ['deepseek-chat', 'deepseek-v3-0324', 'deepseek-reasoner'];
        const baseUrls = [
            'https://api.deepseek.com/v1/chat/completions',
            'https://api.deepseek.com/chat/completions',
        ];
        const start = Date.now();
        const errors = [];
        for (const baseUrl of baseUrls) {
            for (const model of modelCandidates) {
                try {
                    const response = await (0, retry_util_1.withExponentialBackoff)(() => axios_1.default.post(baseUrl, {
                        model,
                        messages: [
                            {
                                role: 'system',
                                content: request.language === 'ar'
                                    ? 'أنت محلل مالي ذكي. أجب بالعربية باختصار. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"'
                                    : 'You are a smart financial analyst. Be concise. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"',
                            },
                            { role: 'user', content: request.prompt },
                        ],
                        temperature: 0.3,
                        max_tokens: 1024,
                    }, {
                        headers: {
                            Authorization: `Bearer ${apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: 30000,
                    }), {
                        maxAttempts: 2,
                        baseDelayMs: 1000,
                    });
                    const message = response.data?.choices?.[0]?.message;
                    let content = message?.content || '';
                    const reasoningContent = message?.reasoning_content || '';
                    if (!content.trim() && reasoningContent.trim()) {
                        this.logger.debug(`🔬 DeepSeek/${model} returned reasoning_content instead of content — using it`);
                        content = reasoningContent;
                    }
                    if (content.trim() && reasoningContent.trim() && model === 'deepseek-reasoner') {
                        const reasoningSummary = reasoningContent.length > 300
                            ? reasoningContent.slice(0, 300) + '...'
                            : reasoningContent;
                        content = `[تحليل منطقي]: ${reasoningSummary}\n\n[التوصية]: ${content}`;
                    }
                    if (content.trim().length === 0) {
                        const errMsg = `DeepSeek/${model} @ ${baseUrl} returned empty — full response: ${JSON.stringify(response.data)?.substring(0, 500)}`;
                        this.logger.warn(`🔬 ${errMsg}`);
                        errors.push(errMsg);
                        continue;
                    }
                    const confidence = (0, confidence_util_1.calculateConfidence)(content, 'deepseek');
                    this.logger.debug(`✅ DeepSeek/${model} responded in ${Date.now() - start}ms`);
                    return {
                        model: `DeepSeek/${model}`,
                        content,
                        confidence,
                        processingTimeMs: Date.now() - start,
                        language: request.language || 'ar',
                    };
                }
                catch (error) {
                    const status = error.response?.status;
                    const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : '';
                    errors.push(`${model}@${baseUrl.split('/v1')[0]}: ${status || 'N/A'} — ${errData}`);
                    if (status === 429) {
                        this.logger.warn(`🚫 DeepSeek/${model} rate-limited — trying next. ${errData}`);
                        continue;
                    }
                    if (status === 401 || status === 403) {
                        this.logger.error(`❌ DeepSeek auth failed (${status}) — key may be invalid. ${errData}`);
                        continue;
                    }
                    if (status === 402) {
                        this.logger.warn(`💸 DeepSeek/${model} requires payment (402) — balance exhausted. ${errData}`);
                        continue;
                    }
                    if (status === 404) {
                        this.logger.warn(`🔬 DeepSeek/${model} not found at ${baseUrl} (404) — trying next`);
                        continue;
                    }
                    this.logger.warn(`❌ DeepSeek/${model} failed: ${error.message} (status: ${status}) ${errData}`);
                    continue;
                }
            }
        }
        const env = process.env;
        const orApiKey = this.configService.get('OPENROUTER_API_KEY', '')?.trim() || env['OPENROUTER_API_KEY']?.trim() || '';
        if (orApiKey) {
            try {
                this.logger.log(`🔬 DeepSeek direct failed — trying OpenRouter fallback`);
                const orResponse = await (0, retry_util_1.withExponentialBackoff)(() => axios_1.default.post('https://openrouter.ai/api/v1/chat/completions', {
                    model: 'deepseek/deepseek-chat-v3-0324:free',
                    messages: [
                        { role: 'system', content: request.language === 'ar' ? 'أنت محلل مالي ذكي. أجب بالعربية باختصار. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' : 'You are a smart financial analyst. Be concise. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
                        { role: 'user', content: request.prompt },
                    ],
                    temperature: 0.3,
                    max_tokens: 1024,
                }, {
                    headers: {
                        Authorization: `Bearer ${orApiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://roua-trading-production.up.railway.app',
                        'X-Title': 'Roua Trading AI',
                    },
                    timeout: 30000,
                }), { maxAttempts: 1, baseDelayMs: 500 });
                const orContent = orResponse.data?.choices?.[0]?.message?.content || '';
                if (orContent.trim().length > 0) {
                    this.logger.log(`🔬 DeepSeek via OpenRouter fallback succeeded`);
                    return {
                        model: 'DeepSeek/OpenRouter-V3',
                        content: orContent,
                        confidence: (0, confidence_util_1.calculateConfidence)(orContent, 'deepseek'),
                        processingTimeMs: Date.now() - start,
                        language: request.language || 'ar',
                    };
                }
            }
            catch (orError) {
                this.logger.warn(`🔬 DeepSeek OpenRouter fallback also failed: ${orError.message}`);
            }
        }
        return {
            model: 'DeepSeek/Stub',
            content: '',
            confidence: 0,
            processingTimeMs: Date.now() - start,
            language: request.language || 'ar',
            isFallback: true,
        };
    }
};
exports.DeepSeekService = DeepSeekService;
exports.DeepSeekService = DeepSeekService = DeepSeekService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DeepSeekService);
//# sourceMappingURL=deepseek.service.js.map