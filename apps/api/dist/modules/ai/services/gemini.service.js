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
var GeminiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const confidence_util_1 = require("./confidence.util");
let GeminiService = GeminiService_1 = class GeminiService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(GeminiService_1.name);
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
        this.modelCandidates = [
            'gemini-2.0-flash',
            'gemini-2.0-flash-lite',
            'gemini-2.0-flash-001',
            'gemini-1.5-flash',
            'gemini-1.5-flash-8b',
            'gemini-2.5-flash-preview-04-17',
            'gemini-2.5-flash-preview-05-20',
            'gemini-2.0-flash-exp',
        ];
        this.resolvedModel = null;
        this.apiKey = this._resolveApiKey();
        if (this.apiKey) {
            this.logger.log(`💎 Gemini Service initialized (trying: ${this.modelCandidates.join(' → ')})`);
        }
        else {
            this.logger.warn('⚠️ GOOGLE_AI_STUDIO_API_KEY / GEMINI_API_KEY not set (will re-check on each call)');
        }
    }
    _resolveApiKey() {
        const env = process.env;
        return (this.configService.get('GOOGLE_AI_STUDIO_API_KEY', '')?.trim() ||
            env['GOOGLE_AI_STUDIO_API_KEY']?.trim() ||
            this.configService.get('GEMINI_API_KEY', '')?.trim() ||
            env['GEMINI_API_KEY']?.trim() ||
            '');
    }
    async analyze(request) {
        if (!this.apiKey) {
            const resolved = this._resolveApiKey();
            if (resolved) {
                this.apiKey = resolved;
                this.logger.log('💎 Gemini key resolved on-demand');
            }
        }
        if (!this.apiKey) {
            return this._stubResponse(request, ['API key not configured']);
        }
        const startTime = Date.now();
        const systemPrompt = this._buildSystemPrompt(request);
        const modelsToTry = this.resolvedModel
            ? [this.resolvedModel]
            : this.modelCandidates;
        const errors = [];
        for (const model of modelsToTry) {
            const url = `${this.baseUrl}/${model}:generateContent`;
            try {
                const response = await axios_1.default.post(url, {
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: `${systemPrompt}\n\n${request.prompt}` }],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 2048,
                    },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                    ],
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': this.apiKey,
                    },
                    timeout: 60000,
                });
                const candidate = response.data.candidates?.[0];
                const finishReason = candidate?.finishReason;
                if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
                    const blockMsg = `Model ${model} blocked response (finishReason: ${finishReason})`;
                    this.logger.warn(`💎 ${blockMsg}`);
                    errors.push(blockMsg);
                    continue;
                }
                const content = candidate?.content?.parts?.[0]?.text || '';
                if (!content.trim()) {
                    const emptyMsg = `Model ${model} returned empty content (finishReason: ${finishReason || 'UNKNOWN'})`;
                    errors.push(emptyMsg);
                    this.logger.warn(`💎 ${emptyMsg}`);
                    continue;
                }
                if (!this.resolvedModel) {
                    this.resolvedModel = model;
                    this.logger.log(`💎 Gemini model resolved: ${model}`);
                }
                return {
                    model: `Gemini/${model}`,
                    content,
                    confidence: (0, confidence_util_1.calculateConfidence)(content, 'gemini'),
                    processingTimeMs: Date.now() - startTime,
                    language: request.language || 'ar',
                };
            }
            catch (error) {
                const status = error.response?.status;
                const errData = error.response?.data;
                const errMsg = errData ? JSON.stringify(errData).substring(0, 200) : error.message;
                errors.push(`${model}: ${status || 'N/A'} — ${errMsg}`);
                if (status === 429) {
                    const isQuotaExhausted = errMsg.includes('quota');
                    if (isQuotaExhausted) {
                        this.logger.warn(`💎 Gemini quota exhausted for ${model} (429) — trying next model (different quota pool)`);
                    }
                    else {
                        this.logger.warn(`💎 Gemini rate limited (429) for ${model} — trying next model...`);
                    }
                    continue;
                }
                if (status === 404) {
                    this.logger.warn(`💎 Gemini model ${model} not available (404) — trying next...`);
                    continue;
                }
                if (status === 401 || status === 403) {
                    this.logger.error(`💎 Gemini auth failed (${status}) — API key may be invalid. Response: ${errMsg}`);
                    continue;
                }
                else {
                    this.logger.warn(`💎 Gemini inference failed with ${model}: ${errMsg} (status: ${status})`);
                    continue;
                }
            }
        }
        this.logger.warn(`💎 All Gemini models failed (${errors.length} attempts) — returning stub`);
        return this._stubResponse(request, errors);
    }
    _buildSystemPrompt(request) {
        const lang = request.language === 'en' ? 'English' : 'Arabic';
        return `You are a sophisticated financial AI analyst specializing in ${request.type}. 
Respond in ${lang}. Provide deep, creative analysis with strategic insights.
Structure your response clearly. Always include risk disclaimers.
If analyzing a specific asset, consider both bullish and bearish scenarios.`;
    }
    _stubResponse(request, errors = []) {
        const errorDetail = errors.length > 0
            ? ` الأخطاء: ${errors.slice(0, 3).join(' | ')}`
            : '';
        return {
            model: 'Gemini/unavailable',
            content: `⚠️ مفتاح Google AI Studio غير مكوّن أو جميع نماذج Gemini غير متاحة.${errorDetail} التحليل الإبداعي سيظهر هنا عند تفعيل الخدمة.`,
            confidence: 0,
            processingTimeMs: 0,
            language: request.language || 'ar',
        };
    }
};
exports.GeminiService = GeminiService;
exports.GeminiService = GeminiService = GeminiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GeminiService);
//# sourceMappingURL=gemini.service.js.map