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
var AiUsageLoggerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiUsageLoggerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const COST_PER_1K = {
    'groq': { input: 0.00059, output: 0.00079 },
    'gemini': { input: 0.000075, output: 0.00030 },
    'glm': { input: 0.00140, output: 0.00140 },
    'huggingface': { input: 0, output: 0 },
    'ollama': { input: 0, output: 0 },
    'bedrock-nova-micro': { input: 0.000035, output: 0.00014 },
    'bedrock-nova-lite': { input: 0.00006, output: 0.00024 },
    'bedrock-claude-haiku': { input: 0.0008, output: 0.004 },
    'bedrock-titan': { input: 0.0005, output: 0.0015 },
    'bedrock-llama': { input: 0.0003, output: 0.0006 },
    'bedrock': { input: 0.0008, output: 0.004 },
    'openrouter': { input: 0, output: 0 },
    'openrouter-paid': { input: 0.00015, output: 0.00015 },
    'deepseek': { input: 0.00014, output: 0.00028 },
    'cerebras': { input: 0, output: 0 },
    'nvidia': { input: 0, output: 0 },
    'mistral': { input: 0, output: 0 },
    'cache': { input: 0, output: 0 },
    'system': { input: 0, output: 0 },
    'prediction': { input: 0, output: 0 },
};
function extractProvider(model) {
    const lower = model.toLowerCase();
    if (lower.includes('groq'))
        return 'groq';
    if (lower.includes('gemini'))
        return 'gemini';
    if (lower.includes('glm'))
        return 'glm';
    if (lower.includes('huggingface') || lower.includes('hf'))
        return 'huggingface';
    if (lower.includes('ollama'))
        return 'ollama';
    if (lower.includes('bedrock')) {
        if (lower.includes('nova-micro') || lower.includes('nova_micro'))
            return 'bedrock-nova-micro';
        if (lower.includes('nova-lite') || lower.includes('nova_lite'))
            return 'bedrock-nova-lite';
        if (lower.includes('claude-haiku') || lower.includes('haiku'))
            return 'bedrock-claude-haiku';
        if (lower.includes('titan'))
            return 'bedrock-titan';
        if (lower.includes('llama'))
            return 'bedrock-llama';
        return 'bedrock';
    }
    if (lower.includes('claude')) {
        if (lower.includes('haiku'))
            return 'bedrock-claude-haiku';
        return 'openrouter-paid';
    }
    if (lower.includes('deepseek'))
        return 'deepseek';
    if (lower.includes('cerebras'))
        return 'cerebras';
    if (lower.includes('nvidia'))
        return 'nvidia';
    if (lower.includes('mistral'))
        return 'mistral';
    if (lower.includes('openrouter')) {
        if (lower.includes(':free'))
            return 'openrouter';
        return 'openrouter-paid';
    }
    if (lower.includes('cache/') || lower.includes('cache:'))
        return 'cache';
    if (lower.includes('predictionmarket') || lower.includes('prediction'))
        return 'prediction';
    if (lower.includes('orchestrator') || lower.includes('fallback'))
        return 'system';
    return 'unknown';
}
function calculateCost(provider, inputTokens, outputTokens) {
    const rates = COST_PER_1K[provider] || { input: 0, output: 0 };
    return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}
let AiUsageLoggerService = AiUsageLoggerService_1 = class AiUsageLoggerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(AiUsageLoggerService_1.name);
        this.writeQueue = [];
        this.flushTimer = null;
        this.FLUSH_INTERVAL_MS = 5000;
        this.MAX_QUEUE_SIZE = 50;
        this.dbAvailable = true;
        this.fallbackQueue = [];
        this.MAX_FALLBACK_QUEUE_SIZE = 500;
        this.dbRetryAttempts = 0;
        this.MAX_DB_RETRY_ATTEMPTS = 20;
        this.isFlushing = false;
        this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
        this.logger.log('📊 AI Usage Logger initialized — will log all AI API calls to AiUsageLog');
        if (this.prisma?.isAvailable?.()) {
            this.prisma.aiUsageLog.count().then(() => {
                this.dbAvailable = true;
                this.dbRetryAttempts = 0;
                this.logger.log('📊 AI Usage Logger DB connection verified');
            }).catch((err) => {
                this.dbAvailable = false;
                this.logger.warn(`📊 AI Usage Logger: DB not yet available (${err.message}) — will retry on flush`);
            });
        }
        else {
            this.dbAvailable = false;
            this.logger.warn('📊 AI Usage Logger: DB not yet available — will retry on flush');
        }
    }
    log(entry) {
        if (this.dbAvailable) {
            this.writeQueue.push(entry);
        }
        else {
            this.fallbackQueue.push(entry);
            if (this.fallbackQueue.length > this.MAX_FALLBACK_QUEUE_SIZE) {
                this.fallbackQueue.shift();
            }
        }
        if (this.writeQueue.length >= this.MAX_QUEUE_SIZE) {
            this.flush();
        }
    }
    logSuccess(params) {
        const provider = extractProvider(params.model);
        const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
        const inputArabicChars = (params.inputPrompt.match(arabicRegex) || []).length;
        const outputArabicChars = (params.outputContent.match(arabicRegex) || []).length;
        const inputArabicRatio = params.inputPrompt.length > 0 ? inputArabicChars / params.inputPrompt.length : 0;
        const outputArabicRatio = params.outputContent.length > 0 ? outputArabicChars / params.outputContent.length : 0;
        const inputCharsPerToken = 2 * inputArabicRatio + 4 * (1 - inputArabicRatio);
        const outputCharsPerToken = 2 * outputArabicRatio + 4 * (1 - outputArabicRatio);
        const inputTokens = Math.ceil(params.inputPrompt.length / inputCharsPerToken);
        const outputTokens = Math.ceil(params.outputContent.length / outputCharsPerToken);
        this.log({
            userId: params.userId,
            model: params.model,
            provider,
            endpoint: params.endpoint,
            inputTokens,
            outputTokens,
            latencyMs: params.latencyMs,
            cached: params.cached,
            success: true,
        });
    }
    logFailure(params) {
        const provider = extractProvider(params.model);
        const inputTokens = 0;
        this.log({
            userId: params.userId,
            model: params.model,
            provider,
            endpoint: params.endpoint,
            inputTokens,
            outputTokens: 0,
            latencyMs: params.latencyMs,
            cached: false,
            success: false,
            errorMessage: params.errorMessage.substring(0, 500),
        });
    }
    async flush() {
        if (this.writeQueue.length === 0 && this.fallbackQueue.length === 0)
            return;
        if (this.isFlushing)
            return;
        this.isFlushing = true;
        if (this.dbAvailable && this.fallbackQueue.length > 0) {
            this.logger.log(`📊 Recovering ${this.fallbackQueue.length} entries from fallback queue`);
            this.writeQueue.push(...this.fallbackQueue.splice(0, this.fallbackQueue.length));
        }
        const entries = this.writeQueue.splice(0, this.writeQueue.length);
        if (entries.length === 0) {
            this.isFlushing = false;
            return;
        }
        try {
            const records = entries.map(entry => ({
                id: `aul_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                userId: entry.userId || null,
                model: entry.model,
                provider: entry.provider,
                endpoint: entry.endpoint,
                inputTokens: entry.inputTokens,
                outputTokens: entry.outputTokens,
                costUsd: calculateCost(entry.provider, entry.inputTokens, entry.outputTokens),
                latencyMs: entry.latencyMs,
                cached: entry.cached,
                success: entry.success,
                errorMessage: entry.errorMessage || null,
                createdAt: new Date(),
            }));
            await this.prisma.aiUsageLog.createMany({ data: records });
            this.dbAvailable = true;
            this.dbRetryAttempts = 0;
            this.logger.debug(`📊 Flushed ${records.length} AI usage logs to database`);
        }
        catch (error) {
            this.dbAvailable = false;
            this.dbRetryAttempts++;
            this.fallbackQueue.push(...entries);
            if (this.fallbackQueue.length > this.MAX_FALLBACK_QUEUE_SIZE) {
                const dropped = this.fallbackQueue.length - this.MAX_FALLBACK_QUEUE_SIZE;
                this.fallbackQueue.splice(0, dropped);
                this.logger.warn(`📊 Fallback queue overflow — dropped ${dropped} oldest entries`);
            }
            this.logger.warn(`📊 Failed to flush AI usage logs (attempt ${this.dbRetryAttempts}): ${error.message}`);
            if (this.dbRetryAttempts >= this.MAX_DB_RETRY_ATTEMPTS) {
                this.logger.warn(`📊 DB appears persistently unavailable — reducing log frequency`);
            }
        }
        finally {
            this.isFlushing = false;
        }
    }
    async getMonthlySpendForProvider(provider) {
        try {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const result = await this.prisma.aiUsageLog.aggregate({
                where: {
                    provider,
                    createdAt: { gte: monthStart },
                },
                _sum: { costUsd: true },
            });
            return result._sum.costUsd?.toNumber() ?? 0;
        }
        catch {
            return 0;
        }
    }
    async onModuleDestroy() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        await this.flush();
        this.logger.log('📊 AI Usage Logger flushed on shutdown');
    }
};
exports.AiUsageLoggerService = AiUsageLoggerService;
exports.AiUsageLoggerService = AiUsageLoggerService = AiUsageLoggerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AiUsageLoggerService);
//# sourceMappingURL=ai-usage-logger.service.js.map