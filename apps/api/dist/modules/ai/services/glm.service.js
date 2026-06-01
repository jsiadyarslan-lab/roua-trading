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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var GlmService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlmService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const confidence_util_1 = require("./confidence.util");
let GlmService = GlmService_1 = class GlmService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(GlmService_1.name);
        this.baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
        this.modelCandidates = [
            'glm-4-flash',
            'glm-4',
            'glm-3-turbo',
        ];
        this.resolvedModel = null;
        this.apiKey = this._resolveApiKey();
        if (this.apiKey) {
            this.logger.log('🧠 GLM-4 Service initialized (Zhipu AI)');
        }
        else {
            this.logger.warn('⚠️ GLM_API_KEY not set (will re-check on each call)');
        }
    }
    _resolveApiKey() {
        const env = process.env;
        return (this.configService.get('GLM_API_KEY', '')?.trim() ||
            env['GLM_API_KEY']?.trim() ||
            '');
    }
    async analyze(request) {
        if (!this.apiKey) {
            const resolved = this._resolveApiKey();
            if (resolved) {
                this.apiKey = resolved;
                this.logger.log('🧠 GLM key resolved on-demand');
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
                    temperature: 0.4,
                    max_tokens: 2048,
                }, {
                    headers: {
                        Authorization: `Bearer ${this._generateJwt()}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 60000,
                });
                const content = response.data.choices?.[0]?.message?.content || '';
                if (!this.resolvedModel) {
                    this.resolvedModel = model;
                    this.logger.log(`🧠 GLM model resolved: ${model}`);
                }
                return {
                    model: `GLM-4/${model}`,
                    content,
                    confidence: (0, confidence_util_1.calculateConfidence)(content, 'glm'),
                    processingTimeMs: Date.now() - startTime,
                    language: request.language || 'ar',
                };
            }
            catch (error) {
                const status = error.response?.status;
                const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : '';
                if (status === 429) {
                    this.logger.warn(`🧠 GLM model ${model} rate limited (429) — trying next... ${errData}`);
                    if (!this.resolvedModel)
                        continue;
                    this.logger.warn(`GLM resolved model ${model} rate limited (429) — throwing for circuit breaker`);
                    throw error;
                }
                if (status === 401 || status === 403) {
                    this.logger.error(`🧠 GLM auth failed (${status}) — API key may be invalid. ${errData}`);
                    return this._stubResponse(request);
                }
                this.logger.warn(`🧠 GLM model ${model} failed: ${error.message} (status: ${status}) ${errData}`);
                if (!this.resolvedModel)
                    continue;
                this.logger.error(`🧠 GLM API error (${status || 'N/A'}): ${errData || error.message?.substring(0, 150)}`);
                throw new Error(`GLM API error (${status || 'N/A'}): ${errData || error.message?.substring(0, 150)}`);
            }
        }
        this.logger.warn(`🧠 All GLM models failed — returning stub`);
        return this._stubResponse(request);
    }
    _buildSystemPrompt(request) {
        return `أنت محلل مالي ذكي متخصص في ${request.type === 'sentiment' ? 'تحليل المشاعر المالية' : request.type === 'market_analysis' ? 'تحليل الأسواق' : 'التحليل المالي العام'}. 
أجب باللغة العربية. كن دقيقاً ومهنياً. استخدم بيانات السوق عند الإمكان. 
أضف دائماً تنبيه المخاطر: "هذا التحليل لأغراض تعليمية فقط وليس نصيحة استثمارية."`;
    }
    _generateJwt() {
        const parts = this.apiKey.split('.');
        if (parts.length !== 2) {
            this.logger.warn('GLM_API_KEY is not in expected id.secret format — using as raw Bearer token');
            return this.apiKey;
        }
        const [id, secret] = parts;
        const now = Date.now();
        const exp = now + 3600 * 1000;
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' }), 'utf8').toString('base64url');
        const payload = Buffer.from(JSON.stringify({ api_key: id, exp: Math.floor(exp / 1000), timestamp: Math.floor(now / 1000) }), 'utf8').toString('base64url');
        const signature = crypto
            .createHmac('sha256', secret)
            .update(`${header}.${payload}`)
            .digest('base64url');
        return `${header}.${payload}.${signature}`;
    }
    _stubResponse(request) {
        return {
            model: `GLM-4/${this.modelCandidates[0]}`,
            content: `⚠️ مفتاح GLM API غير مكوّن. التحليل سيظهر هنا عند تفعيل الخدمة.`,
            confidence: 0,
            processingTimeMs: 0,
            language: request.language || 'ar',
        };
    }
};
exports.GlmService = GlmService;
exports.GlmService = GlmService = GlmService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GlmService);
//# sourceMappingURL=glm.service.js.map