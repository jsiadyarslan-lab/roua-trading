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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var IntegrationController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../../common/guards/auth.guard");
const integration_guard_1 = require("../../common/guards/integration.guard");
const exchange_service_1 = require("../exchange/exchange.service");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const config_1 = require("@nestjs/config");
const content_agent_service_1 = require("../../agents/content/content-agent.service");
let IntegrationController = IntegrationController_1 = class IntegrationController {
    constructor(exchangeService, prisma, configService, contentAgent) {
        this.exchangeService = exchangeService;
        this.prisma = prisma;
        this.configService = configService;
        this.contentAgent = contentAgent;
        this.logger = new common_1.Logger(IntegrationController_1.name);
    }
    async healthCheck() {
        const checks = {};
        try {
            const dbStart = Date.now();
            await this.prisma.$queryRaw `SELECT 1`;
            checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
        }
        catch (error) {
            checks.database = { status: 'error', error: error?.message };
        }
        try {
            checks.exchangeService = {
                status: 'ok',
                note: 'ExchangeService available',
            };
        }
        catch (error) {
            checks.exchangeService = { status: 'error', error: error?.message };
        }
        try {
            const activeSignals = await this.prisma.signal.count({
                where: { status: 'ACTIVE' },
            });
            checks.signalService = {
                status: 'ok',
                activeSignals,
            };
        }
        catch (error) {
            checks.signalService = { status: 'error', error: error?.message };
        }
        const allOk = Object.values(checks).every(c => c.status === 'ok');
        return {
            status: allOk ? 'ok' : 'degraded',
            service: 'roua-trading',
            version: '1.0',
            timestamp: new Date().toISOString(),
            checks,
        };
    }
    async getChartData(symbol, interval = '1day', limit = '200') {
        if (!symbol) {
            return { error: 'symbol parameter is required', status: 400 };
        }
        const normalizedSymbol = symbol.replace(/-/g, '/');
        try {
            const candles = await this.exchangeService.getHistoricalData(normalizedSymbol, interval);
            return {
                symbol: normalizedSymbol,
                interval,
                candles,
                count: Array.isArray(candles) ? candles.length : 0,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            this.logger.error(`Chart data fetch failed for ${normalizedSymbol}: ${error?.message}`);
            return {
                symbol: normalizedSymbol,
                error: error?.message || 'Failed to fetch chart data',
                timestamp: new Date().toISOString(),
            };
        }
    }
    async getQuote(symbol) {
        if (!symbol) {
            return { error: 'symbol parameter is required', status: 400 };
        }
        const normalizedSymbol = symbol.replace(/-/g, '/');
        try {
            const quote = await this.exchangeService.getQuote(normalizedSymbol);
            return {
                symbol: normalizedSymbol,
                quote,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            this.logger.error(`Quote fetch failed for ${normalizedSymbol}: ${error?.message}`);
            return {
                symbol: normalizedSymbol,
                error: error?.message || 'Failed to fetch quote',
                timestamp: new Date().toISOString(),
            };
        }
    }
    async getActiveSignals(symbol, limit = '20') {
        try {
            const where = { status: 'ACTIVE' };
            if (symbol) {
                where.pair = { contains: symbol.replace(/-/g, '/'), mode: 'insensitive' };
            }
            const signals = await this.prisma.signal.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: Math.min(parseInt(limit, 10) || 20, 50),
            });
            return {
                signals,
                count: signals.length,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            this.logger.error(`Signals fetch failed: ${error?.message}`);
            return {
                error: error?.message || 'Failed to fetch signals',
                timestamp: new Date().toISOString(),
            };
        }
    }
    async getSignalHistory(limit = '20') {
        try {
            const signals = await this.prisma.signal.findMany({
                where: {
                    status: { in: ['ACTIVE', 'EXPIRED', 'EXECUTED', 'CANCELLED'] },
                },
                orderBy: { createdAt: 'desc' },
                take: Math.min(parseInt(limit, 10) || 20, 50),
                select: {
                    id: true,
                    pair: true,
                    action: true,
                    confidence: true,
                    reason: true,
                    entryPrice: true,
                    stopLoss: true,
                    takeProfit: true,
                    status: true,
                    createdAt: true,
                    expiresAt: true,
                },
            });
            return {
                signals,
                count: signals.length,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            this.logger.error(`Signal history fetch failed: ${error?.message}`);
            return {
                error: error?.message || 'Failed to fetch signal history',
                timestamp: new Date().toISOString(),
            };
        }
    }
    async getSignalStats() {
        try {
            const [active, expired, executed, cancelled] = await Promise.all([
                this.prisma.signal.count({ where: { status: 'ACTIVE' } }),
                this.prisma.signal.count({ where: { status: 'EXPIRED' } }),
                this.prisma.signal.count({ where: { status: 'EXECUTED' } }),
                this.prisma.signal.count({ where: { status: 'CANCELLED' } }),
            ]);
            const recentExecuted = await this.prisma.signal.findMany({
                where: { status: 'EXECUTED' },
                orderBy: { createdAt: 'desc' },
                take: 50,
                select: { action: true, pair: true, entryPrice: true, takeProfit: true, stopLoss: true },
            });
            return {
                total: active + expired + executed + cancelled,
                active,
                expired,
                executed,
                cancelled,
                recentSignals: recentExecuted.length,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            this.logger.error(`Signal stats fetch failed: ${error?.message}`);
            return {
                error: error?.message || 'Failed to fetch signal stats',
                timestamp: new Date().toISOString(),
            };
        }
    }
    async getContentFeed(limit = '5', category, type, symbol) {
        try {
            const feed = await this.contentAgent.getContentFeed({
                status: 'PUBLISHED',
                limit: Math.min(parseInt(limit, 10) || 5, 20),
                page: 1,
                category: category,
                type: type,
                symbol,
            });
            const articles = (feed?.articles || feed?.data?.articles || feed?.data || []).map((article) => ({
                id: article.id,
                title: article.titleAr || article.titleEn || article.title,
                content: article.contentAr || article.contentEn || article.content,
                category: article.category,
                type: article.type || article.contentType,
                symbols: (() => {
                    const raw = article.symbols || article.relatedSymbols || [];
                    if (Array.isArray(raw))
                        return raw;
                    if (typeof raw === 'string') {
                        if (raw.startsWith('[')) {
                            try {
                                const p = JSON.parse(raw);
                                return Array.isArray(p) ? p : raw.split(',').filter(Boolean);
                            }
                            catch {
                                return raw.split(',').filter(Boolean);
                            }
                        }
                        return raw.split(',').filter(Boolean);
                    }
                    return [];
                })(),
                sentiment: article.sentiment || article.sentimentScore,
                impactLevel: article.impactLevel,
                qualityScore: article.qualityScore,
                tags: article.tags ? (typeof article.tags === 'string' ? JSON.parse(article.tags) : article.tags) : [],
                publishedAt: article.publishedAt || article.createdAt,
                summary: article.summaryAr || article.summaryEn || article.summary,
            }));
            return {
                success: true,
                articles,
                count: articles.length,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            this.logger.error(`Content feed fetch failed: ${error?.message}`);
            return {
                success: false,
                articles: [],
                count: 0,
                error: error?.message || 'Failed to fetch content feed',
                timestamp: new Date().toISOString(),
            };
        }
    }
    async getNewsFromNewsSite(limit = '20', category, symbol) {
        const newsSiteUrl = this.configService.get('INTEGRATION_PARTNER_URL');
        const apiKey = this.configService.get('INTEGRATION_API_KEY');
        if (!newsSiteUrl || !apiKey) {
            return {
                articles: [],
                count: 0,
                error: 'News site integration not configured',
                timestamp: new Date().toISOString(),
            };
        }
        try {
            let url = `${newsSiteUrl}/api/integration/news?limit=${Math.min(parseInt(limit, 10) || 20, 50)}`;
            if (category)
                url += `&category=${encodeURIComponent(category)}`;
            if (symbol)
                url += `&symbol=${encodeURIComponent(symbol)}`;
            const response = await fetch(url, {
                headers: {
                    'X-Integration-Key': apiKey,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) {
                this.logger.warn(`News site fetch failed: HTTP ${response.status}`);
                return {
                    articles: [],
                    count: 0,
                    error: `News site returned HTTP ${response.status}`,
                    timestamp: new Date().toISOString(),
                };
            }
            const data = await response.json();
            return data;
        }
        catch (error) {
            this.logger.error(`News site fetch failed: ${error?.message}`);
            return {
                articles: [],
                count: 0,
                error: error?.message || 'Failed to fetch news from news site',
                timestamp: new Date().toISOString(),
            };
        }
    }
};
exports.IntegrationController = IntegrationController;
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IntegrationController.prototype, "healthCheck", null);
__decorate([
    (0, common_1.Get)('chart'),
    __param(0, (0, common_1.Query)('symbol')),
    __param(1, (0, common_1.Query)('interval')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], IntegrationController.prototype, "getChartData", null);
__decorate([
    (0, common_1.Get)('quote'),
    __param(0, (0, common_1.Query)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], IntegrationController.prototype, "getQuote", null);
__decorate([
    (0, common_1.Get)('signals'),
    __param(0, (0, common_1.Query)('symbol')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], IntegrationController.prototype, "getActiveSignals", null);
__decorate([
    (0, common_1.Get)('signals/history'),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], IntegrationController.prototype, "getSignalHistory", null);
__decorate([
    (0, common_1.Get)('signals/stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IntegrationController.prototype, "getSignalStats", null);
__decorate([
    (0, common_1.Get)('content-feed'),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('category')),
    __param(2, (0, common_1.Query)('type')),
    __param(3, (0, common_1.Query)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], IntegrationController.prototype, "getContentFeed", null);
__decorate([
    (0, common_1.Get)('news'),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('category')),
    __param(2, (0, common_1.Query)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], IntegrationController.prototype, "getNewsFromNewsSite", null);
exports.IntegrationController = IntegrationController = IntegrationController_1 = __decorate([
    (0, auth_guard_1.Public)(),
    (0, integration_guard_1.IntegrationRoute)(),
    (0, common_1.UseGuards)(integration_guard_1.IntegrationGuard),
    (0, common_1.Controller)('integration'),
    __metadata("design:paramtypes", [exchange_service_1.ExchangeService,
        prisma_service_1.PrismaService,
        config_1.ConfigService,
        content_agent_service_1.ContentAgentService])
], IntegrationController);
//# sourceMappingURL=integration.controller.js.map