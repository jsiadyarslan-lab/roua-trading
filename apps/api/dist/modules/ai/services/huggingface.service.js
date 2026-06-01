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
var HuggingFaceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HuggingFaceService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const confidence_util_1 = require("./confidence.util");
let HuggingFaceService = HuggingFaceService_1 = class HuggingFaceService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(HuggingFaceService_1.name);
        this.hfAutoRouterUrl = 'https://router.huggingface.co/v1/chat/completions';
        this.hfDirectUrl = 'https://router.huggingface.co/hf-inference/v1/chat/completions';
        this.hfInferenceProviders = [
            { name: 'hf-inference', url: 'https://router.huggingface.co/hf-inference/v1/chat/completions' },
            { name: 'sambanova', url: 'https://router.huggingface.co/sambanova/v1/chat/completions' },
            { name: 'novita', url: 'https://router.huggingface.co/novita/v1/chat/completions' },
            { name: 'fireworks', url: 'https://router.huggingface.co/fireworks/v1/chat/completions' },
        ];
        this.openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.hfModelCandidates = [
            'Qwen/Qwen2.5-7B-Instruct',
            'mistralai/Mistral-7B-Instruct-v0.3',
            'HuggingFaceH4/zephyr-7b-beta',
            'microsoft/Phi-3-mini-4k-instruct',
            'Qwen/Qwen2.5-72B-Instruct',
        ];
        this.hfDirectInferenceCandidates = [
            'Qwen/Qwen2.5-7B-Instruct',
            'mistralai/Mistral-7B-Instruct-v0.3',
            'microsoft/Phi-3-mini-4k-instruct',
            'HuggingFaceH4/zephyr-7b-beta',
            'google/gemma-2b-it',
            'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
        ];
        this.openrouterModelCandidates = [
            'deepseek/deepseek-r1:free',
            'deepseek/deepseek-chat-v3-0324:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'meta-llama/llama-3.1-8b-instruct:free',
            'qwen/qwen-2.5-7b-instruct:free',
            'google/gemma-3-27b-it:free',
            'mistralai/mistral-small-3.1-24b-instruct:free',
        ];
        this.resolvedProvider = null;
        this.resolvedModel = null;
        this.classicInferenceBaseUrl = 'https://api-inference.huggingface.co/models';
        this.hfApiKey = this._resolveHfKey();
        this.openrouterApiKey = this._resolveOpenRouterKey();
        const providers = [];
        if (this.hfApiKey)
            providers.push('HF-AutoRouter');
        if (this.openrouterApiKey)
            providers.push('OpenRouter');
        if (providers.length > 0) {
            this.logger.log(`🤗 HuggingFace Service initialized [${providers.join(' + ')}]`);
        }
        else {
            this.logger.warn('⚠️ No API keys set — need HF_API_KEY or OPENROUTER_API_KEY');
        }
    }
    _resolveHfKey() {
        const env = process.env;
        return (this.configService.get('HUGGINGFACE_API_KEY', '')?.trim() ||
            env['HUGGINGFACE_API_KEY']?.trim() ||
            this.configService.get('HF_API_KEY', '')?.trim() ||
            env['HF_API_KEY']?.trim() ||
            '');
    }
    _resolveOpenRouterKey() {
        const env = process.env;
        const configKey1 = this.configService.get('OPENROUTER_API_KEY', '')?.trim() || '';
        if (configKey1)
            return configKey1;
        const envKey1 = env['OPENROUTER_API_KEY']?.trim() || '';
        if (envKey1)
            return envKey1;
        const configKey2 = this.configService.get('OPEN_ROUTER_API_KEY', '')?.trim() || '';
        if (configKey2)
            return configKey2;
        const envKey2 = env['OPEN_ROUTER_API_KEY']?.trim() || '';
        if (envKey2)
            return envKey2;
        return '';
    }
    async analyze(request) {
        if (!this.hfApiKey) {
            const resolved = this._resolveHfKey();
            if (resolved) {
                this.hfApiKey = resolved;
                this.logger.log(`🤗 HuggingFace key resolved on-demand`);
            }
        }
        if (!this.openrouterApiKey) {
            const resolved = this._resolveOpenRouterKey();
            if (resolved) {
                this.openrouterApiKey = resolved;
                this.logger.log(`🤗 OpenRouter key resolved on-demand for HuggingFace fallback`);
            }
        }
        if (!this.hfApiKey && !this.openrouterApiKey) {
            return this._stubResponse(request);
        }
        const startTime = Date.now();
        const systemPrompt = this._buildSystemPrompt(request);
        if (this.resolvedProvider && this.resolvedModel) {
            try {
                const result = await this._callResolved(systemPrompt, request.prompt, startTime);
                if (result)
                    return result;
            }
            catch (_error) {
                this.logger.warn(`🤗 Resolved ${this.resolvedProvider}/${this.resolvedModel} failed — resetting`);
                this.resolvedProvider = null;
                this.resolvedModel = null;
            }
        }
        let lastError = '';
        let strategyErrors = [];
        if (this.hfApiKey) {
            const result = await this._tryHuggingFace(systemPrompt, request.prompt, startTime);
            if (result)
                return result;
            strategyErrors.push('HF AutoRouter: Token needs "Make calls to Inference Providers" permission or credits exhausted');
        }
        if (this.hfApiKey) {
            const result = await this._tryDirectInference(systemPrompt, request.prompt, startTime);
            if (result)
                return result;
            strategyErrors.push('HF Direct Inference: All models failed or unavailable');
        }
        if (this.hfApiKey) {
            const result = await this._tryClassicInference(systemPrompt, request.prompt, startTime);
            if (result)
                return result;
            strategyErrors.push('HF Classic Inference: All models failed');
        }
        if (this.openrouterApiKey) {
            const result = await this._tryOpenRouter(systemPrompt, request.prompt, startTime);
            if (result)
                return result;
            strategyErrors.push('OpenRouter: All models failed');
        }
        this.resolvedProvider = null;
        this.resolvedModel = null;
        lastError = strategyErrors.join(' → ');
        this.logger.warn(`🤗 All providers failed — returning stub. Errors: ${lastError}`);
        return {
            ...this._stubResponse(request),
            content: `⚠️ HuggingFace/OpenRouter error: ${lastError.substring(0, 250)}`,
        };
    }
    async _tryHuggingFace(systemPrompt, userPrompt, startTime) {
        for (const model of this.hfModelCandidates) {
            try {
                const result = await this._hfCall(this.hfAutoRouterUrl, model, systemPrompt, userPrompt, startTime);
                if (result) {
                    this.resolvedProvider = 'hf-auto';
                    this.resolvedModel = model;
                    this.logger.log(`🤗 Resolved: HF-AutoRouter/${model.split('/').pop()}`);
                    return result;
                }
            }
            catch (error) {
                const status = error.response?.status;
                const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 150) : '';
                if (status === 429) {
                    this.logger.warn(`🚫 HF AutoRouter ${model} rate limited (429) — trying next model`);
                    continue;
                }
                if (status === 401) {
                    this.logger.error(`❌ HF API key invalid (401) — skipping HF entirely. ${errData}`);
                    return null;
                }
                this.logger.debug(`🤗 HF auto-router failed for ${model.split('/').pop()} (${status}): ${errData}`);
            }
            try {
                const result = await this._hfCall(this.hfDirectUrl, model, systemPrompt, userPrompt, startTime);
                if (result) {
                    this.resolvedProvider = 'hf-direct';
                    this.resolvedModel = model;
                    this.logger.log(`🤗 Resolved: HF-Direct/${model.split('/').pop()}`);
                    return result;
                }
            }
            catch (error) {
                const status = error.response?.status;
                if (status === 429) {
                    this.logger.warn(`🚫 HF Direct ${model} rate limited (429) — trying next model`);
                    continue;
                }
                if (status === 401)
                    return null;
                this.logger.debug(`🤗 HF direct failed for ${model.split('/').pop()} (${status})`);
                continue;
            }
        }
        return null;
    }
    async _tryDirectInference(systemPrompt, userPrompt, startTime) {
        for (const provider of this.hfInferenceProviders) {
            for (const model of this.hfDirectInferenceCandidates) {
                try {
                    const result = await this._hfCall(provider.url, model, systemPrompt, userPrompt, startTime);
                    if (result) {
                        this.resolvedProvider = 'hf-inference';
                        this.resolvedModel = model;
                        this.logger.log(`🤗 Resolved: ${provider.name}/${model.split('/').pop()}`);
                        return result;
                    }
                }
                catch (error) {
                    const status = error.response?.status;
                    const errData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 150) : '';
                    if (status === 429) {
                        this.logger.warn(`🚫 HF ${provider.name}/${model.split('/').pop()} rate limited (429)`);
                        continue;
                    }
                    if (status === 401) {
                        this.logger.error(`❌ HF API key invalid for ${provider.name} (401) — ${errData}`);
                        return null;
                    }
                    this.logger.debug(`🤗 HF ${provider.name}/${model.split('/').pop()} failed (${status}): ${errData}`);
                    continue;
                }
            }
        }
        return null;
    }
    async _tryClassicInference(systemPrompt, userPrompt, startTime) {
        const models = [
            'Qwen/Qwen2.5-7B-Instruct',
            'microsoft/Phi-3-mini-4k-instruct',
            'mistralai/Mistral-7B-Instruct-v0.3',
            'HuggingFaceH4/zephyr-7b-beta',
            'google/gemma-2b-it',
            'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
        ];
        const TOTAL_TIMEOUT = 65_000;
        const deadline = Date.now() + TOTAL_TIMEOUT;
        for (const model of models) {
            if (Date.now() > deadline)
                break;
            try {
                const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
                const remaining = deadline - Date.now();
                const response = await axios_1.default.post(`${this.classicInferenceBaseUrl}/${model}`, {
                    inputs: fullPrompt,
                    parameters: {
                        max_new_tokens: 512,
                        temperature: 0.3,
                        return_full_text: false,
                    },
                    options: { wait_for_model: true },
                }, {
                    headers: {
                        Authorization: `Bearer ${this.hfApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: Math.min(20_000, remaining),
                });
                let content = '';
                if (Array.isArray(response.data) && response.data.length > 0 && response.data[0].generated_text) {
                    content = response.data[0].generated_text;
                }
                else if (response.data?.generated_text) {
                    content = response.data.generated_text;
                }
                if (content.trim().length > 20) {
                    this.resolvedProvider = 'hf-inference';
                    this.resolvedModel = model;
                    this.logger.log(`🤗 Resolved: HF-Classic/${model.split('/').pop()}`);
                    return this._formatResponse('HuggingFace', model, content.trim(), startTime);
                }
                else if (content.trim().length > 0) {
                    this.logger.debug(`🤗 HF Classic ${model.split('/').pop()} returned too short (${content.length} chars) — trying next`);
                }
            }
            catch (error) {
                const status = error.response?.status;
                if (status === 429) {
                    this.logger.warn(`🚫 HF Classic ${model.split('/').pop()} rate limited (429)`);
                    continue;
                }
                if (status === 401) {
                    this.logger.error(`❌ HF Classic API key invalid (401)`);
                    return null;
                }
                if (status === 503) {
                    this.logger.debug(`🤗 HF Classic ${model.split('/').pop()} loading (503) — trying next`);
                    continue;
                }
                if (status === 500 || status === 502 || status === 504) {
                    this.logger.debug(`🤗 HF Classic ${model.split('/').pop()} server error (${status}) — trying next`);
                    continue;
                }
                this.logger.debug(`🤗 HF Classic ${model.split('/').pop()} failed (${status || 'no status'})`);
                continue;
            }
        }
        return null;
    }
    async _tryOpenRouter(systemPrompt, userPrompt, startTime) {
        for (const model of this.openrouterModelCandidates) {
            try {
                const result = await this._openrouterChat(model, systemPrompt, userPrompt, startTime);
                if (result) {
                    this.resolvedProvider = 'openrouter';
                    this.resolvedModel = model;
                    this.logger.log(`🤗 Resolved: OpenRouter/${model.split('/').pop()}`);
                    return result;
                }
            }
            catch (error) {
                const status = error.response?.status;
                if (status === 429) {
                    this.logger.warn(`🚫 OpenRouter ${model} rate limited (429)`);
                    continue;
                }
                if (status === 401) {
                    this.logger.error(`❌ OpenRouter API key invalid (401)`);
                    return null;
                }
                this.logger.debug(`🤗 OpenRouter ${model} failed (${status})`);
                continue;
            }
        }
        return null;
    }
    async _openrouterChat(model, systemPrompt, userPrompt, startTime) {
        const response = await axios_1.default.post(this.openrouterUrl, {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 1024,
            temperature: 0.3,
        }, {
            headers: {
                Authorization: `Bearer ${this.openrouterApiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://roua-trading-production.up.railway.app',
                'X-Title': 'Roua Trading AI',
            },
            timeout: 60000,
        });
        const content = response.data?.choices?.[0]?.message?.content || '';
        if (content.trim().length > 0) {
            return this._formatResponse('OpenRouter', model, content.trim(), startTime);
        }
        return null;
    }
    async _callResolved(systemPrompt, userPrompt, startTime) {
        if (this.resolvedProvider === 'openrouter') {
            return this._openrouterChat(this.resolvedModel, systemPrompt, userPrompt, startTime);
        }
        else if (this.resolvedProvider === 'hf-inference') {
            for (const provider of this.hfInferenceProviders) {
                try {
                    const result = await this._hfCall(provider.url, this.resolvedModel, systemPrompt, userPrompt, startTime);
                    if (result)
                        return result;
                }
                catch (_error) {
                    continue;
                }
            }
            return null;
        }
        else {
            const url = this.resolvedProvider === 'hf-auto' ? this.hfAutoRouterUrl : this.hfDirectUrl;
            return this._hfCall(url, this.resolvedModel, systemPrompt, userPrompt, startTime);
        }
    }
    async _hfCall(url, model, systemPrompt, userPrompt, startTime) {
        const response = await axios_1.default.post(url, {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 1024,
            temperature: 0.3,
        }, {
            headers: {
                Authorization: `Bearer ${this.hfApiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000,
        });
        const content = response.data?.choices?.[0]?.message?.content || '';
        if (content.trim().length > 0) {
            return this._formatResponse('HuggingFace', model, content.trim(), startTime);
        }
        return null;
    }
    _formatResponse(provider, model, content, startTime) {
        const modelShort = model.split('/').pop() || model;
        return {
            model: `${provider}/${modelShort}`,
            content,
            confidence: (0, confidence_util_1.calculateConfidence)(content, 'huggingface'),
            processingTimeMs: Date.now() - startTime,
            language: 'ar',
        };
    }
    _buildSystemPrompt(request) {
        return `أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت خبير أنماط مالي متخصص في ${request.type}. كن موجزاً ومبنياً على البيانات ومهنياً. قدّم تحليلاً واضحاً مع رؤى قابلة للتنفيذ. أضف دائماً تنبيهات المخاطر. IMPORTANT: Respond in Arabic only.`;
    }
    _stubResponse(request) {
        return {
            model: 'HuggingFace/Unavailable',
            content: `⚠️ خدمة HuggingFace غير متاحة — الحلول: (1) اذهب لـ huggingface.co/settings/tokens وأنشئ توكن Fine-grained مع تفعيل صلاحية "Make calls to Inference Providers" ثم حدث HF_API_KEY — أو — (2) أنشئ حساب في openrouter.ai واحصل على مفتاح API مجاني ثم أضف OPENROUTER_API_KEY في Railway.`,
            confidence: 0,
            processingTimeMs: 0,
            language: request.language || 'ar',
        };
    }
};
exports.HuggingFaceService = HuggingFaceService;
exports.HuggingFaceService = HuggingFaceService = HuggingFaceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], HuggingFaceService);
//# sourceMappingURL=huggingface.service.js.map