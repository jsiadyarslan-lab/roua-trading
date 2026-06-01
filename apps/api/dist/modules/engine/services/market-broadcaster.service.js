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
var MarketBroadcasterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketBroadcasterService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const redis_service_1 = require("../../../common/redis/redis.service");
const aggregator_service_1 = require("../../analytics/aggregator.service");
const exchange_gateway_1 = require("../../exchange/gateway/exchange.gateway");
let MarketBroadcasterService = MarketBroadcasterService_1 = class MarketBroadcasterService {
    constructor(redis, aggregator, exchangeGateway) {
        this.redis = redis;
        this.aggregator = aggregator;
        this.exchangeGateway = exchangeGateway;
        this.logger = new common_1.Logger(MarketBroadcasterService_1.name);
        this.trackedSymbols = new Set([
            'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
            'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL',
            'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD',
        ]);
        this.BROADCAST_THRESHOLD = 0.1;
        this.lastPrices = new Map();
        this.isBroadcasting = false;
        this.logger.log('📡 Market Broadcaster initialized — streaming active');
    }
    async broadcastMarketData() {
        if (this.isBroadcasting) {
            return;
        }
        this.isBroadcasting = true;
        try {
            const symbols = Array.from(this.trackedSymbols);
            const updates = [];
            for (const symbol of symbols) {
                try {
                    const quote = await this.aggregator.getAggregatedQuote(symbol);
                    if (!quote || quote.price === 0) {
                        continue;
                    }
                    const lastPrice = this.lastPrices.get(symbol);
                    const priceChange = lastPrice
                        ? Math.abs((quote.price - lastPrice) / lastPrice) * 100
                        : 0;
                    await this.redis.set(`market:quote:${symbol}`, JSON.stringify({
                        symbol,
                        price: quote.price,
                        change: quote.change,
                        changePercent: quote.changePercent,
                        high: quote.high,
                        low: quote.low,
                        volume: quote.volume,
                        timestamp: new Date().toISOString(),
                    }), 30000);
                    this.lastPrices.set(symbol, quote.price);
                    if (!lastPrice || priceChange >= this.BROADCAST_THRESHOLD) {
                        const update = {
                            symbol,
                            price: quote.price,
                            change: quote.change,
                            changePercent: quote.changePercent,
                            high: quote.high,
                            low: quote.low,
                            volume: quote.volume,
                            timestamp: new Date().toISOString(),
                            isSignificant: priceChange >= this.BROADCAST_THRESHOLD,
                        };
                        updates.push(update);
                        await this.redis['client'].publish('market:updates', JSON.stringify(update));
                    }
                }
                catch (error) {
                    this.logger.debug(`📡 Broadcast error for ${symbol}: ${error.message}`);
                }
            }
            if (updates.length > 0) {
                this._broadcastViaWebSocket(updates);
            }
        }
        catch (error) {
            this.logger.error(`📡 Broadcast cycle failed: ${error.message}`);
        }
        finally {
            this.isBroadcasting = false;
        }
    }
    trackSymbol(symbol) {
        this.trackedSymbols.add(symbol);
        this.logger.log(`📡 Now tracking: ${symbol}`);
    }
    untrackSymbol(symbol) {
        this.trackedSymbols.delete(symbol);
        this.lastPrices.delete(symbol);
        this.logger.log(`📡 Stopped tracking: ${symbol}`);
    }
    getTrackedSymbols() {
        return Array.from(this.trackedSymbols);
    }
    async getCachedQuote(symbol) {
        const cached = await this.redis.get(`market:quote:${symbol}`);
        return cached ? JSON.parse(cached) : null;
    }
    async getAllCachedQuotes() {
        const symbols = Array.from(this.trackedSymbols);
        const quotes = [];
        for (const symbol of symbols) {
            const quote = await this.getCachedQuote(symbol);
            if (quote) {
                quotes.push(quote);
            }
        }
        return quotes;
    }
    _broadcastViaWebSocket(updates) {
        try {
            this.exchangeGateway.broadcast('market:update', {
                type: 'market_update',
                data: updates,
                timestamp: new Date().toISOString(),
            });
            this.logger.debug(`📡 WebSocket broadcast: ${updates.length} updates`);
        }
        catch (error) {
            this.logger.debug(`📡 WebSocket broadcast error: ${error.message}`);
        }
    }
};
exports.MarketBroadcasterService = MarketBroadcasterService;
__decorate([
    (0, schedule_1.Interval)(15000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MarketBroadcasterService.prototype, "broadcastMarketData", null);
exports.MarketBroadcasterService = MarketBroadcasterService = MarketBroadcasterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        aggregator_service_1.MarketDataAggregatorService,
        exchange_gateway_1.ExchangeGateway])
], MarketBroadcasterService);
//# sourceMappingURL=market-broadcaster.service.js.map