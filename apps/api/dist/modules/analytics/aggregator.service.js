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
var MarketDataAggregatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketDataAggregatorService = void 0;
const common_1 = require("@nestjs/common");
const exchange_service_1 = require("../exchange/exchange.service");
const finnhub_adapter_1 = require("./finnhub.adapter");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
let MarketDataAggregatorService = MarketDataAggregatorService_1 = class MarketDataAggregatorService {
    constructor(exchangeService, finnhubAdapter) {
        this.exchangeService = exchangeService;
        this.finnhubAdapter = finnhubAdapter;
        this.logger = new common_1.Logger(MarketDataAggregatorService_1.name);
        this.logger.log('📊 Market Data Aggregator initialized — multi-source fusion ready');
    }
    async getAggregatedQuote(symbol) {
        this.logger.debug(`📊 Aggregating quote for ${symbol} from all sources`);
        const sources$ = {
            primary: (0, rxjs_1.from)(this._fetchFromPrimary(symbol)).pipe((0, operators_1.catchError)((err) => {
                this.logger.debug(`Primary source failed for ${symbol}: ${err.message}`);
                return (0, rxjs_1.of)(null);
            })),
            finnhub: (0, rxjs_1.from)(this._fetchFromFinnhub(symbol)).pipe((0, operators_1.catchError)((err) => {
                this.logger.debug(`Finnhub source failed for ${symbol}: ${err.message}`);
                return (0, rxjs_1.of)(null);
            })),
        };
        const results = await new Promise((resolve) => {
            (0, rxjs_1.forkJoin)(sources$).subscribe({
                next: resolve,
                error: () => resolve({ primary: null, finnhub: null }),
            });
        });
        return this._mergeQuotes(symbol, results.primary, results.finnhub);
    }
    async getAggregatedCandles(symbol, interval = '1day', start, end) {
        this.logger.debug(`📊 Aggregating candles for ${symbol} (${interval})`);
        const endDate = end || new Date();
        const startDate = start || new Date(endDate.getTime() - 250 * 24 * 60 * 60 * 1000);
        const sources$ = {
            primary: (0, rxjs_1.from)(this.exchangeService.getHistoricalData(symbol, interval, startDate, endDate)).pipe((0, operators_1.catchError)((err) => {
                this.logger.debug(`Primary candles failed for ${symbol}: ${err.message}`);
                return (0, rxjs_1.of)([]);
            })),
            finnhub: (0, rxjs_1.from)(this.finnhubAdapter.fetchHistoricalData(symbol, interval, startDate, endDate)).pipe((0, operators_1.catchError)((err) => {
                this.logger.debug(`Finnhub candles failed for ${symbol}: ${err.message}`);
                return (0, rxjs_1.of)([]);
            })),
        };
        const results = await new Promise((resolve) => {
            (0, rxjs_1.forkJoin)(sources$).subscribe({
                next: resolve,
                error: () => resolve({ primary: [], finnhub: [] }),
            });
        });
        return this._mergeCandles(symbol, results.primary, results.finnhub);
    }
    getQuoteStream(symbol) {
        this.logger.debug(`📊 Setting up quote stream for ${symbol}`);
        return new rxjs_1.Observable((subscriber) => {
            const interval = setInterval(async () => {
                try {
                    const quote = await this.getAggregatedQuote(symbol);
                    subscriber.next(quote);
                }
                catch (error) {
                    this.logger.debug(`Stream poll failed for ${symbol}: ${error.message}`);
                }
            }, 30_000);
            this.getAggregatedQuote(symbol)
                .then((quote) => subscriber.next(quote))
                .catch(() => { });
            return () => clearInterval(interval);
        });
    }
    async _fetchFromPrimary(symbol) {
        try {
            return await this.exchangeService.getQuote(symbol);
        }
        catch {
            return null;
        }
    }
    async _fetchFromFinnhub(symbol) {
        if (!this.finnhubAdapter.isAvailable()) {
            return null;
        }
        try {
            return await this.finnhubAdapter.fetchQuote(symbol);
        }
        catch {
            return null;
        }
    }
    _mergeQuotes(symbol, primary, finnhub) {
        const sources = [];
        const base = primary || finnhub;
        if (!base) {
            return {
                symbol,
                name: symbol,
                currency: 'USD',
                price: 0,
                change: 0,
                changePercent: 0,
                open: 0,
                high: 0,
                low: 0,
                close: 0,
                volume: 0,
                marketCap: null,
                fiftyTwoWeekHigh: null,
                fiftyTwoWeekLow: null,
                sources: [],
                primarySource: 'none',
                timestamp: new Date(),
            };
        }
        if (primary)
            sources.push(primary.source);
        if (finnhub)
            sources.push(finnhub.source);
        const merged = {
            symbol,
            name: base.name || symbol,
            currency: base.currency || 'USD',
            price: base.price,
            change: base.change,
            changePercent: base.changePercent,
            open: base.open,
            high: base.high,
            low: base.low,
            close: base.close,
            volume: base.volume,
            marketCap: base.marketCap,
            fiftyTwoWeekHigh: base.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: base.fiftyTwoWeekLow,
            sources,
            primarySource: base.source,
            timestamp: base.timestamp,
        };
        if (primary && finnhub) {
            const priceDeviation = Math.abs(primary.price - finnhub.price) / primary.price;
            if (priceDeviation > 0.01) {
                this.logger.warn(`⚠️ Price deviation > 1% for ${symbol}: Primary=${primary.price}, Finnhub=${finnhub.price}`);
            }
            if (!merged.volume && finnhub.volume)
                merged.volume = finnhub.volume;
            if (!merged.marketCap && finnhub.marketCap)
                merged.marketCap = finnhub.marketCap;
            if (!merged.fiftyTwoWeekHigh && finnhub.fiftyTwoWeekHigh)
                merged.fiftyTwoWeekHigh = finnhub.fiftyTwoWeekHigh;
            if (!merged.fiftyTwoWeekLow && finnhub.fiftyTwoWeekLow)
                merged.fiftyTwoWeekLow = finnhub.fiftyTwoWeekLow;
            if (finnhub.timestamp > merged.timestamp) {
                merged.timestamp = finnhub.timestamp;
            }
        }
        if (!primary && finnhub) {
            merged.primarySource = finnhub.source;
        }
        return merged;
    }
    _mergeCandles(symbol, primary, finnhub) {
        const sources = [];
        if (primary.length > 0)
            sources.push(primary[0].source);
        if (finnhub.length > 0)
            sources.push(finnhub[0].source);
        const baseCandles = primary.length >= finnhub.length ? primary : finnhub;
        const primarySource = baseCandles.length > 0 ? baseCandles[0].source : 'none';
        return baseCandles.map((candle) => ({
            symbol: candle.symbol,
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            sources,
            primarySource,
        }));
    }
};
exports.MarketDataAggregatorService = MarketDataAggregatorService;
exports.MarketDataAggregatorService = MarketDataAggregatorService = MarketDataAggregatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [exchange_service_1.ExchangeService,
        finnhub_adapter_1.FinnhubAdapter])
], MarketDataAggregatorService);
//# sourceMappingURL=aggregator.service.js.map