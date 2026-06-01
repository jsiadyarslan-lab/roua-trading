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
var GroqService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const confidence_util_1 = require("./confidence.util");
let GroqService = GroqService_1 = class GroqService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(GroqService_1.name);
        this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
        this.modelCandidates = [
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
            'llama3-70b-8192',
            'mixtral-8x7b-32768',
            'llama3-8b-8192',
            'gemma2-9b-it',
        ];
        this.resolvedModel = null;
        this.apiKey = this._resolveApiKey();
        if (this.apiKey) {
            this.logger.log('⚡ Groq Service initialized (Llama 3.3 70B)');
        }
        else {
            this.logger.warn('⚠️ GROQ_API_KEY not set (will re-check on each call)');
        }
    }
    _resolveApiKey() {
        const env = process.env;
        return (this.configService.get('GROQ_API_KEY', '')?.trim() ||
            env['GROQ_API_KEY']?.trim() ||
            '');
    }
    async analyze(request) {
        if (!this.apiKey) {
            const resolved = this._resolveApiKey();
            if (resolved) {
                this.apiKey = resolved;
                this.logger.log('⚡ Groq key resolved on-demand');
            }
        }
        if (!this.apiKey) {
            return this._stubResponse(request);
        }
        const startTime = Date.now();
        const systemPrompt = this._buildSystemPrompt(request);
        const modelsToTry = this.resolvedModel ? [this.resolvedModel] : this.modelCandidates;
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
                    timeout: 30000,
                });
                const content = response.data.choices?.[0]?.message?.content || '';
                if (!this.resolvedModel) {
                    this.resolvedModel = model;
                    this.logger.log(`⚡ Groq model resolved: ${model}`);
                }
                return {
                    model: `Groq/${model}`,
                    content,
                    confidence: (0, confidence_util_1.calculateConfidence)(content, 'groq'),
                    processingTimeMs: Date.now() - startTime,
                    language: request.language || 'ar',
                };
            }
            catch (error) {
                const status = error.response?.status;
                const errData = error.response?.data;
                if (status === 429) {
                    this.logger.warn(`⚡ Groq model ${model} rate limited (429) — trying next model...`);
                    if (!this.resolvedModel)
                        continue;
                    this.logger.warn(`Groq resolved model ${model} rate limited (429) — throwing for circuit breaker`);
                    throw error;
                }
                if (status === 401 || status === 403) {
                    this.logger.error(`Groq auth failed (${status}) — API key may be invalid`);
                    return this._stubResponse(request);
                }
                this.logger.warn(`Groq model ${model} failed: ${error.message} (status: ${status})`);
                if (!this.resolvedModel)
                    continue;
                return this._stubResponse(request);
            }
        }
        this.logger.warn(`⚡ All Groq models failed — returning stub`);
        return this._stubResponse(request);
    }
    _buildSystemPrompt(request) {
        const lang = request.language === 'en' ? 'English' : 'Arabic';
        return `You are a financial analysis AI specializing in ${request.type}. Respond in ${lang}. Be concise, data-driven, and professional. Always include risk disclaimers.`;
    }
    _stubResponse(request) {
        return {
            model: `Groq/${this.modelCandidates[0]}`,
            content: `⚠️ Groq API key not configured. Analysis for "${request.prompt}" would be generated here.`,
            confidence: 0,
            processingTimeMs: 0,
            language: request.language || 'ar',
        };
    }
};
exports.GroqService = GroqService;
exports.GroqService = GroqService = GroqService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GroqService);
//# sourceMappingURL=groq.service.js.map