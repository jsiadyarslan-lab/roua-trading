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
var MarketScannerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketScannerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const signal_generator_service_1 = require("../../analytics/signal-generator.service");
const analytical_ai_service_1 = require("../../analytics/analytical-ai.service");
const aggregator_service_1 = require("../../analytics/aggregator.service");
const audit_service_1 = require("../../../audit/audit.service");
const market_hours_util_1 = require("../../../common/utils/market-hours.util");
let MarketScannerService = MarketScannerService_1 = class MarketScannerService {
    constructor(prisma, redis, signalGenerator, analyticalAI, aggregator, audit) {
        this.prisma = prisma;
        this.redis = redis;
        this.signalGenerator = signalGenerator;
        this.analyticalAI = analyticalAI;
        this.aggregator = aggregator;
        this.audit = audit;
        this.logger = new common_1.Logger(MarketScannerService_1.name);
        this.MIN_CONFIDENCE = 70;
        this.MIN_TECH_SCORE = 30;
        this.DEFAULT_SYMBOLS = [
            'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
            'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL',
            'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD',
        ];
        this.isScanning = false;
        this.SCANNER_DAILY_COST_CAP_USD = 3.00;
        this.REDIS_SCANNER_COST_KEY = 'scanner:daily_cost';
        this.REDIS_SCANNER_COST_DATE_KEY = 'scanner:daily_cost_date';
        this.logger.log('🔍 Market Scanner initialized — surveillance active (with $3/day AI cost cap)');
    }
    async runMarketScan() {
        if (!this.prisma.isAvailable?.()) {
            return;
        }
        if (this.isScanning) {
            this.logger.warn('🔍 Previous scan still running — skipping this cycle');
            return;
        }
        this.isScanning = true;
        const startTime = Date.now();
        try {
            this.logger.log('🔍 Starting market scan cycle...');
            const todayCost = await this._getScannerDailyCost();
            if (todayCost >= this.SCANNER_DAILY_COST_CAP_USD) {
                this.logger.warn(`💰 Scanner daily cost cap reached ($${todayCost.toFixed(2)}/$${this.SCANNER_DAILY_COST_CAP_USD}) — skipping scan cycle`);
                return;
            }
            const symbols = await this._collectSymbols();
            this.logger.log(`🔍 Scanning ${symbols.length} symbols`);
            const batchSize = 5;
            const results = {
                scanned: 0,
                signalsGenerated: 0,
                opportunitiesFound: 0,
                errors: 0,
            };
            for (let i = 0; i < symbols.length; i += batchSize) {
                const batch = symbols.slice(i, i + batchSize);
                const batchResults = await this._processBatch(batch);
                results.scanned += batchResults.scanned;
                results.signalsGenerated += batchResults.signalsGenerated;
                results.opportunitiesFound += batchResults.opportunitiesFound;
                results.errors += batchResults.errors;
                if (i + batchSize < symbols.length) {
                    await this._sleep(1000);
                }
            }
            const elapsed = Date.now() - startTime;
            this.logger.log(`🔍 Scan complete: ${results.scanned} scanned, ${results.signalsGenerated} signals, ${results.opportunitiesFound} opportunities, ${results.errors} errors (${elapsed}ms)`);
            await this.redis.set('scanner:last_scan', JSON.stringify({
                timestamp: new Date().toISOString(),
                durationMs: elapsed,
                ...results,
            }), 3600000);
        }
        catch (error) {
            this.logger.error(`🔍 Scan cycle failed: ${error.message}`);
        }
        finally {
            this.isScanning = false;
        }
    }
    async forceScan(userId, symbols) {
        this.logger.log(`🔍 Manual scan triggered by user ${userId}`);
        const scanSymbols = symbols || await this._collectSymbols(userId);
        const results = await this._processBatch(scanSymbols);
        await this.audit.log({
            userId,
            action: 'SCANNER_MANUAL_TRIGGER',
            resource: 'market-scanner',
            details: JSON.stringify({ symbols: scanSymbols, results }),
        });
        return {
            success: true,
            symbolsScanned: scanSymbols.length,
            ...results,
        };
    }
    async getLastScan() {
        const cached = await this.redis.get('scanner:last_scan');
        return cached ? JSON.parse(cached) : null;
    }
    async _collectSymbols(userId) {
        const symbolSet = new Set(this.DEFAULT_SYMBOLS);
        try {
            const watchlistWhere = userId ? { userId } : {};
            const watchlists = await this.prisma.watchlist?.findMany({
                where: watchlistWhere,
                select: { symbols: true },
            });
            if (watchlists) {
                for (const wl of watchlists) {
                    if (Array.isArray(wl.symbols)) {
                        wl.symbols.forEach((s) => symbolSet.add(s));
                    }
                }
            }
        }
        catch {
        }
        try {
            const signalWhere = { status: 'ACTIVE' };
            if (userId) {
                signalWhere.userId = userId;
            }
            const activeSignals = await this.prisma.signal.findMany({
                where: signalWhere,
                select: { pair: true },
                distinct: ['pair'],
            });
            activeSignals.forEach((s) => symbolSet.add(s.pair));
        }
        catch {
        }
        return Array.from(symbolSet);
    }
    async _processBatch(symbols) {
        const results = { scanned: 0, signalsGenerated: 0, opportunitiesFound: 0, errors: 0 };
        for (const symbol of symbols) {
            try {
                results.scanned++;
                const marketStatus = (0, market_hours_util_1.isMarketOpen)(symbol);
                if (!marketStatus.open) {
                    this.logger.debug(`🔍 Skipping ${symbol} — market closed: ${marketStatus.reason}`);
                    continue;
                }
                const quote = await this.aggregator.getAggregatedQuote(symbol);
                if (!quote || quote.price === 0) {
                    continue;
                }
                if (Math.abs(quote.changePercent) >= 5) {
                    results.opportunitiesFound++;
                    this.logger.log(`🚨 ${symbol} extreme move detected: ${quote.changePercent}%`);
                    await this.redis.set(`scanner:alert:${symbol}`, JSON.stringify({
                        symbol,
                        changePercent: quote.changePercent,
                        price: quote.price,
                        timestamp: new Date().toISOString(),
                    }), 300000);
                }
                if (Math.abs(quote.changePercent) >= 2) {
                    const todayCost = await this._getScannerDailyCost();
                    if (todayCost >= this.SCANNER_DAILY_COST_CAP_USD) {
                        this.logger.warn(`💰 Scanner daily cost cap reached ($${todayCost.toFixed(2)}/$${this.SCANNER_DAILY_COST_CAP_USD}) — skipping remaining AI analyses`);
                        break;
                    }
                    try {
                        const analysis = await this.analyticalAI.analyzeAsset(symbol);
                        await this._addScannerCost(0.015);
                        if (analysis.confidence >= this.MIN_CONFIDENCE &&
                            analysis.sentiment !== 'NEUTRAL' &&
                            analysis.sentiment !== 'MIXED') {
                            const systemUser = await this._getSystemUser();
                            if (systemUser) {
                                const signal = await this.signalGenerator.generateSignal(systemUser.id, symbol, analysis);
                                results.signalsGenerated++;
                                this.logger.log(`📡 Auto-signal generated: ${signal.action} ${symbol} (confidence: ${signal.confidence}%)`);
                            }
                        }
                    }
                    catch (analysisError) {
                        this.logger.debug(`Analysis failed for ${symbol}: ${analysisError.message}`);
                    }
                }
            }
            catch (error) {
                results.errors++;
                this.logger.debug(`Scan error for ${symbol}: ${error.message}`);
            }
        }
        return results;
    }
    async _getSystemUser() {
        try {
            const admin = await this.prisma.user.findFirst({
                where: { tier: { in: ['PRO', 'PREMIUM', 'INSTITUTIONAL'] } },
                orderBy: { createdAt: 'asc' },
                select: { id: true },
            });
            if (admin)
                return admin;
            const user = await this.prisma.user.findFirst({
                orderBy: { createdAt: 'asc' },
                select: { id: true },
            });
            return user;
        }
        catch {
            return null;
        }
    }
    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async _getScannerDailyCost() {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const storedDate = await this.redis.get(this.REDIS_SCANNER_COST_DATE_KEY);
            if (storedDate !== today) {
                await this.redis.set(this.REDIS_SCANNER_COST_KEY, '0', 86400000);
                await this.redis.set(this.REDIS_SCANNER_COST_DATE_KEY, today, 86400000);
                return 0;
            }
            const redisCost = await this.redis.get(this.REDIS_SCANNER_COST_KEY);
            if (redisCost) {
                const cost = parseFloat(redisCost);
                if (!isNaN(cost) && cost > 0)
                    return cost;
            }
            return 0;
        }
        catch {
            return 0;
        }
    }
    async _addScannerCost(estimatedCostUsd) {
        try {
            const currentCost = await this._getScannerDailyCost();
            const newCost = currentCost + estimatedCostUsd;
            await this.redis.set(this.REDIS_SCANNER_COST_KEY, newCost.toString(), 86400000);
            this.logger.debug(`💰 Scanner cost: +$${estimatedCostUsd.toFixed(4)} (total today: $${newCost.toFixed(2)})`);
        }
        catch {
        }
    }
};
exports.MarketScannerService = MarketScannerService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MarketScannerService.prototype, "runMarketScan", null);
exports.MarketScannerService = MarketScannerService = MarketScannerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        signal_generator_service_1.SignalGeneratorService,
        analytical_ai_service_1.AnalyticalAIService,
        aggregator_service_1.MarketDataAggregatorService,
        audit_service_1.AuditService])
], MarketScannerService);
//# sourceMappingURL=market-scanner.service.js.map