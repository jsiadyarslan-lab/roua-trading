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
var BedrockService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BedrockService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const confidence_util_1 = require("./confidence.util");
let BedrockService = BedrockService_1 = class BedrockService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(BedrockService_1.name);
        this.client = null;
        this.modelCandidates = [
            'amazon.nova-micro-v1:0',
            'amazon.nova-lite-v1:0',
            'anthropic.claude-haiku-4-5-20250414-v1:0',
            'amazon.titan-text-premier-v1:0',
            'amazon.titan-text-express-v1',
            'meta.llama3-1-8b-instruct-v1:0',
            'meta.llama3-8b-instruct-v1:0',
        ];
        this.resolvedModel = null;
        this.lastError = '';
        this.accessKeyId = this._resolveKey('AWS_ACCESS_KEY_ID');
        this.secretAccessKey = this._resolveKey('AWS_SECRET_ACCESS_KEY');
        this.region = this.configService.get('AWS_REGION', 'us-east-1')?.trim() || 'us-east-1';
        this.available = !!(this.accessKeyId && this.secretAccessKey);
        this._initClient();
    }
    _resolveKey(keyName) {
        const env = process.env;
        return (this.configService.get(keyName, '')?.trim() ||
            env[keyName]?.trim() ||
            '');
    }
    _initClient() {
        if (this.available) {
            this.client = new client_bedrock_runtime_1.BedrockRuntimeClient({
                region: this.region,
                credentials: {
                    accessKeyId: this.accessKeyId,
                    secretAccessKey: this.secretAccessKey,
                },
            });
            this.logger.log(`☁️ AWS Bedrock Service initialized — region: ${this.region} (AWS SDK)`);
        }
        else {
            this.client = null;
            this.logger.warn('⚠️ AWS credentials not configured — Bedrock unavailable');
        }
    }
    async analyze(request) {
        if (!this.available) {
            this.accessKeyId = this._resolveKey('AWS_ACCESS_KEY_ID');
            this.secretAccessKey = this._resolveKey('AWS_SECRET_ACCESS_KEY');
            this.available = !!(this.accessKeyId && this.secretAccessKey);
            if (this.available) {
                this._initClient();
                this.logger.log('☁️ Bedrock keys resolved on-demand');
            }
        }
        if (!this.available || !this.client) {
            return this._stubResponse(request);
        }
        const startTime = Date.now();
        const modelsToTry = this.resolvedModel ? [this.resolvedModel] : this.modelCandidates;
        for (const modelToUse of modelsToTry) {
            try {
                const body = this._buildRequestBody(request, modelToUse);
                const command = new client_bedrock_runtime_1.InvokeModelCommand({
                    modelId: modelToUse,
                    body: JSON.stringify(body),
                    contentType: 'application/json',
                    accept: 'application/json',
                });
                const response = await this.client.send(command);
                const responseBody = new TextDecoder().decode(response.body);
                const data = JSON.parse(responseBody);
                const content = this._extractContent(data, modelToUse);
                if (content.trim().length > 0) {
                    if (!this.resolvedModel) {
                        this.resolvedModel = modelToUse;
                        this.logger.log(`☁️ Bedrock model resolved: ${modelToUse}`);
                    }
                    const modelShort = modelToUse.split('.').pop() || modelToUse;
                    return {
                        model: `Bedrock/${modelShort}`,
                        content,
                        confidence: (0, confidence_util_1.calculateConfidence)(content, 'bedrock'),
                        processingTimeMs: Date.now() - startTime,
                        language: request.language || 'ar',
                    };
                }
            }
            catch (error) {
                const errorName = error.name || '';
                const errorMessage = error.message || String(error);
                this.lastError = `${modelToUse}: ${errorName} — ${errorMessage.substring(0, 150)}`;
                if (errorName === 'ThrottlingException' || errorMessage.includes('429')) {
                    this.logger.warn(`☁️ Bedrock rate limited for model ${modelToUse} — throwing for circuit breaker`);
                    throw error;
                }
                if (errorName === 'AccessDeniedException' || errorMessage.includes('403')) {
                    this.logger.warn(`☁️ Bedrock 403 for model ${modelToUse} — IAM may lack bedrock:InvokeModel or model not enabled in Console. ${errorMessage.substring(0, 200)}`);
                    continue;
                }
                if (errorName === 'ValidationException' || errorMessage.includes('404')) {
                    this.logger.warn(`☁️ Bedrock model ${modelToUse} not found/invalid — trying next...`);
                    continue;
                }
                this.logger.warn(`☁️ Bedrock model ${modelToUse} failed: ${errorMessage.substring(0, 200)}`);
                if (!this.resolvedModel)
                    continue;
                return {
                    ...this._stubResponse(request),
                    content: `⚠️ Bedrock API error: ${errorMessage.substring(0, 200)}`,
                };
            }
        }
        this.resolvedModel = null;
        this.logger.warn(`☁️ All Bedrock models failed — last error: ${this.lastError}`);
        return {
            ...this._stubResponse(request),
            content: `⚠️ Bedrock API error: ${this.lastError.substring(0, 250)}`,
        };
    }
    _buildRequestBody(request, model) {
        const systemPrompt = this._buildSystemPrompt(request);
        if (model.includes('anthropic')) {
            return {
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 2048,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: request.prompt },
                ],
                temperature: 0.3,
            };
        }
        if (model.includes('nova')) {
            return {
                messages: [
                    { role: 'user', content: [{ text: `${systemPrompt}\n\n${request.prompt}` }] },
                ],
                inferenceConfig: {
                    maxTokens: 2048,
                    temperature: 0.3,
                    topP: 0.9,
                },
            };
        }
        if (model.includes('mistral')) {
            return {
                prompt: `${systemPrompt}\n\n[INST] ${request.prompt} [/INST]`,
                max_tokens: 1024,
                temperature: 0.3,
                top_p: 0.9,
            };
        }
        if (model.includes('titan')) {
            return {
                inputText: `${systemPrompt}\n\n${request.prompt}`,
                textGenerationConfig: {
                    maxTokenCount: 1024,
                    temperature: 0.3,
                    topP: 0.9,
                },
            };
        }
        if (model.includes('llama')) {
            return {
                prompt: `${systemPrompt}\n\n[INST] ${request.prompt} [/INST]`,
                max_gen_len: 1024,
                temperature: 0.3,
            };
        }
        return {
            prompt: `${systemPrompt}\n\n${request.prompt}`,
            max_gen_len: 1024,
            temperature: 0.3,
        };
    }
    _extractContent(data, model) {
        if (data.content && Array.isArray(data.content)) {
            return data.content[0]?.text || '';
        }
        if (model.includes('nova') && data.output?.message?.content) {
            const novaContent = data.output.message.content;
            if (Array.isArray(novaContent) && novaContent.length > 0) {
                return novaContent[0].text || '';
            }
        }
        if (data.results && Array.isArray(data.results) && data.results.length > 0) {
            return data.results[0].outputText || '';
        }
        if (model.includes('mistral') && data.outputs && Array.isArray(data.outputs)) {
            return data.outputs[0]?.text || '';
        }
        if (data.generation) {
            return data.generation;
        }
        return data.completion || data.text || data.outputText || '';
    }
    _buildSystemPrompt(request) {
        return `أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت خبير مخاطر متخصص في ${request.type}. قدّم تحليلاً حذراً وشاملاً مع التركيز على عوامل المخاطر والحالات الاستثنائية. أبرز دائماً الجوانب السلبية وأسوأ السيناريوهات إلى جانب الفرص. أضف تنبيهات المخاطر بوضوح. IMPORTANT: Respond in Arabic only.`;
    }
    _stubResponse(request) {
        return {
            model: 'Bedrock/Claude-4.5-Haiku',
            content: `⚠️ نماذج Bedrock غير متاحة حالياً. تأكد من: 1) تفعيل Model Access في AWS Console → Bedrock (خاصة Claude 4.5 Haiku و Amazon Nova)، 2) صلاحيات IAM bedrock:InvokeModel، 3) المنطقة صحيحة.`,
            confidence: 0,
            processingTimeMs: 0,
            language: request.language || 'ar',
        };
    }
};
exports.BedrockService = BedrockService;
exports.BedrockService = BedrockService = BedrockService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], BedrockService);
//# sourceMappingURL=bedrock.service.js.map