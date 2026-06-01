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
var OllamaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const confidence_util_1 = require("./confidence.util");
let OllamaService = OllamaService_1 = class OllamaService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(OllamaService_1.name);
        this.apiKey = this._resolveApiKey();
        this.baseUrl = this.configService.get('OLLAMA_BASE_URL', 'http://localhost:11434')?.trim() || 'http://localhost:11434';
        this.defaultModel = this.configService.get('OLLAMA_MODEL', 'qwen2.5:7b')?.trim() || 'qwen2.5:7b';
        if (this.apiKey || this._isOllamaReachable()) {
            this.logger.log(`🏠 Ollama Service initialized (${this.defaultModel}) — URL: ${this.baseUrl}`);
        }
        else {
            this.logger.warn('⚠️ Ollama not reachable (will re-check on each call) — set OLLAMA_API_KEY or start Ollama server');
        }
    }
    _resolveApiKey() {
        const env = process.env;
        return (this.configService.get('OLLAMA_API_KEY', '')?.trim() ||
            env['OLLAMA_API_KEY']?.trim() ||
            '');
    }
    async analyze(request) {
        if (!this.apiKey) {
            const resolved = this._resolveApiKey();
            if (resolved) {
                this.apiKey = resolved;
                this.logger.log('🏠 Ollama key resolved on-demand');
            }
        }
        if (this._isCloudWithLocalhost()) {
            return this._stubResponse(request);
        }
        const startTime = Date.now();
        const systemPrompt = this._buildSystemPrompt(request);
        const model = this._resolveModel();
        try {
            let apiEndpoint;
            let requestBody;
            const headers = { 'Content-Type': 'application/json' };
            if (this.apiKey)
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            if (this.baseUrl.endsWith('/v1') || this.baseUrl.endsWith('/v1/')) {
                apiEndpoint = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
                requestBody = {
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: request.prompt },
                    ],
                    temperature: 0.3,
                    max_tokens: 1024,
                };
            }
            else {
                apiEndpoint = `${this.baseUrl}/api/chat`;
                requestBody = {
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: request.prompt },
                    ],
                    stream: false,
                    options: { temperature: 0.3, num_predict: 1024 },
                };
            }
            const response = await axios_1.default.post(apiEndpoint, requestBody, {
                headers,
                timeout: 30000,
            });
            const content = response.data?.message?.content || response.data?.choices?.[0]?.message?.content || '';
            if (content.trim().length > 0) {
                return {
                    model: `Ollama/${response.data?.model || this.defaultModel}`,
                    content,
                    confidence: (0, confidence_util_1.calculateConfidence)(content, 'ollama'),
                    processingTimeMs: Date.now() - startTime,
                    language: request.language || 'ar',
                };
            }
            this.logger.warn(`Ollama returned empty response (data: ${JSON.stringify(response.data)?.substring(0, 200)})`);
        }
        catch (error) {
            if (error.response?.status === 429) {
                this.logger.warn(`Ollama rate limited (429) — throwing for circuit breaker`);
                throw error;
            }
            const status = error.response?.status;
            const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : '';
            this.logger.warn(`Ollama inference failed: ${error.message} (status: ${status}) ${errData}`);
            return {
                ...this._stubResponse(request),
                content: `⚠️ Ollama API error (${status || 'N/A'}): ${error.message?.substring(0, 150)}`,
            };
        }
        return this._stubResponse(request);
    }
    _isOllamaReachable() {
        return this.baseUrl !== 'http://localhost:11434' || this.apiKey !== '';
    }
    _resolveModel() {
        const envModel = this.configService.get('OLLAMA_MODEL', '');
        if (envModel && envModel.trim()) {
            return envModel.trim();
        }
        if (this.baseUrl.includes('ollama.com')) {
            this.logger.log(`🏠 Detected ollama.com cloud — using gemma3:4b (cloud-compatible)`);
            return 'gemma3:4b';
        }
        return this.defaultModel;
    }
    _isCloudWithLocalhost() {
        const isCloud = !!(process.env.RAILWAY_ENVIRONMENT ||
            process.env.RENDER ||
            process.env.AWS_EXECUTION_ENV ||
            process.env.VERCEL ||
            process.env.DYNO);
        const isLocalhost = this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1');
        return isCloud && isLocalhost;
    }
    async listModels() {
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/api/tags`, {
                timeout: 5000,
                headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
            });
            return (response.data?.models || []).map((m) => m.name);
        }
        catch {
            return [];
        }
    }
    _buildSystemPrompt(request) {
        return `أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت استراتيجي تنفيذ متخصص في ${request.type}. كن دقيقاً ومهنياً. قدّم تحليلاً واضحاً مع توصيات عملية. أضف دائماً تنبيه المخاطر. IMPORTANT: Respond in Arabic only.`;
    }
    _stubResponse(request) {
        return {
            model: `Ollama/${this.defaultModel}`,
            content: `⚠️ خادم Ollama غير متاح. النماذج المحلية (Qwen2.5, Llama3, Mistral) ستعمل عند تشغيل Ollama — مجاني بالكامل وبدون حدود استخدام.`,
            confidence: 0,
            processingTimeMs: 0,
            language: request.language || 'ar',
        };
    }
};
exports.OllamaService = OllamaService;
exports.OllamaService = OllamaService = OllamaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OllamaService);
//# sourceMappingURL=ollama.service.js.map