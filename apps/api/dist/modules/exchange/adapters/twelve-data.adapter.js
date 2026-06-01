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
var TwelveDataAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwelveDataAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../../../common/redis/redis.service");
const axios_1 = __importDefault(require("axios"));
let TwelveDataAdapter = TwelveDataAdapter_1 = class TwelveDataAdapter {
    constructor(configService, redisService) {
        this.configService = configService;
        this.redisService = redisService;
        this.name = 'TwelveData';
        this.logger = new common_1.Logger(TwelveDataAdapter_1.name);
        this.baseUrl = 'https://api.twelvedata.com';
        this.QUOTE_CACHE_TTL = 600_000;
        this.HISTORY_CACHE_TTL = 600_000;
        this.RATE_LIMIT_WINDOW = 60_000;
        this.RATE_LIMIT_MAX = 8;
        this.DAILY_CREDIT_LIMIT = 700;
        this.DAILY_CREDIT_WINDOW = 86_400_000;
        this.apiKey = this.configService.get('TWELVE_DATA_API_KEY', '')?.trim() || '';
        if (!this.apiKey) {
            this.logger.warn('⚠️ TWELVE_DATA_API_KEY is not set — market data will not work');
        }
    }
    async fetchQuote(symbol) {
        const cacheKey = `quote:${symbol}`;
        try {
            return await this.redisService.cacheOrGet(cacheKey, () => this._fetchQuoteFromApi(symbol), this.QUOTE_CACHE_TTL);
        }
        catch (error) {
            this.logger.error(`Failed to fetch quote for ${symbol}: ${error.message}`);
            throw new common_1.HttpException(`فشل في جلب بيانات ${symbol}: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async fetchHistoricalData(symbol, interval, start, end) {
        const cacheKey = `history:${symbol}:${interval}:${start.toISOString().split('T')[0]}:${end.toISOString().split('T')[0]}`;
        try {
            return await this.redisService.cacheOrGet(cacheKey, () => this._fetchHistoricalFromApi(symbol, interval, start, end), this.HISTORY_CACHE_TTL);
        }
        catch (error) {
            this.logger.error(`Failed to fetch history for ${symbol}: ${error.message}`);
            throw new common_1.HttpException(`فشل في جلب البيانات التاريخية لـ ${symbol}: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async _fetchQuoteFromApi(symbol) {
        await this._checkRateLimit();
        const url = `${this.baseUrl}/quote`;
        const params = {
            symbol,
            apikey: this.apiKey,
        };
        this.logger.debug(`📡 Fetching quote: ${symbol}`);
        const response = await axios_1.default.get(url, { params, timeout: 10000 });
        const data = response.data;
        if (data.status === 'error') {
            if (data.message && (data.message.includes('run out of API credits') ||
                data.message.includes('out of API credits') ||
                data.message.includes('limit being'))) {
                await this._activateDailyCircuitBreaker();
            }
            throw new Error(data.message || 'Twelve Data API error');
        }
        return this._mapQuoteResponse(symbol, data);
    }
    async _fetchHistoricalFromApi(symbol, interval, start, end) {
        await this._checkRateLimit();
        const url = `${this.baseUrl}/time_series`;
        const params = {
            symbol,
            interval,
            start_date: start.toISOString().split('T')[0],
            end_date: end.toISOString().split('T')[0],
            outputsize: 5000,
            apikey: this.apiKey,
        };
        this.logger.debug(`📡 Fetching history: ${symbol} (${interval})`);
        const response = await axios_1.default.get(url, { params, timeout: 15000 });
        const data = response.data;
        if (data.status === 'error') {
            if (data.message && (data.message.includes('run out of API credits') ||
                data.message.includes('out of API credits') ||
                data.message.includes('limit being'))) {
                await this._activateDailyCircuitBreaker();
            }
            throw new Error(data.message || 'Twelve Data API error');
        }
        if (!data.values || !Array.isArray(data.values)) {
            return [];
        }
        return data.values.map((candle) => this._mapCandleResponse(symbol, candle));
    }
    _mapQuoteResponse(symbol, data) {
        return {
            symbol,
            name: data.name || symbol,
            exchange: data.exchange || '',
            currency: data.currency || 'USD',
            price: this._toNumber(data.close),
            change: this._toNumber(data.change),
            changePercent: this._toNumber(data.percent_change),
            open: this._toNumber(data.open),
            high: this._toNumber(data.high),
            low: this._toNumber(data.low),
            close: this._toNumber(data.close),
            volume: this._toNumber(data.volume),
            marketCap: data.market_cap ? this._toNumber(data.market_cap) : null,
            fiftyTwoWeekHigh: data.fifty_two_week?.high
                ? this._toNumber(data.fifty_two_week.high)
                : null,
            fiftyTwoWeekLow: data.fifty_two_week?.low
                ? this._toNumber(data.fifty_two_week.low)
                : null,
            timestamp: new Date(data.timestamp || Date.now()),
            source: this.name,
        };
    }
    _mapCandleResponse(symbol, candle) {
        return {
            symbol,
            timestamp: new Date(candle.datetime),
            open: this._toNumber(candle.open),
            high: this._toNumber(candle.high),
            low: this._toNumber(candle.low),
            close: this._toNumber(candle.close),
            volume: this._toNumber(candle.volume),
            source: this.name,
        };
    }
    async _checkRateLimit() {
        const keyHash = this._getKeyHash();
        const circuitBreakerKey = `twelvedata:daily_exhausted:${keyHash}`;
        const circuitBreaker = await this.redisService.get(circuitBreakerKey);
        if (circuitBreaker) {
            this.logger.warn(`🚫 TwelveData daily credits exhausted (circuit breaker active). All requests paused until reset.`);
            throw new common_1.HttpException(`تم تجاوز الحد اليومي لطلبات Twelve Data. يرجى المحاولة غداً.`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const key = 'ratelimit:twelvedata';
        const result = await this.redisService.checkRateLimit(key, this.RATE_LIMIT_MAX, this.RATE_LIMIT_WINDOW);
        if (!result.allowed) {
            this.logger.warn(`⚠️ Rate limit exceeded for Twelve Data. Reset in ${result.resetIn}ms`);
            throw new common_1.HttpException(`تم تجاوز حد الطلبات. يرجى المحاولة بعد ${Math.ceil((result.resetIn || 60000) / 1000)} ثوانٍ`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const dailyKey = 'ratelimit:twelvedata:daily';
        const dailyResult = await this.redisService.checkRateLimit(dailyKey, this.DAILY_CREDIT_LIMIT, this.DAILY_CREDIT_WINDOW);
        if (!dailyResult.allowed) {
            this.logger.warn(`⚠️ Daily credit limit reached for Twelve Data (${this.DAILY_CREDIT_LIMIT}/day). Remaining credits reset at midnight.`);
            throw new common_1.HttpException(`تم تجاوز الحد اليومي لطلبات Twelve Data. يرجى المحاولة غداً.`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        this.logger.debug(`Rate limit: ${result.remaining}/min, ${dailyResult.remaining}/day remaining`);
    }
    async _activateDailyCircuitBreaker() {
        const keyHash = this._getKeyHash();
        const circuitBreakerKey = `twelvedata:daily_exhausted:${keyHash}`;
        const reactivationKey = `twelvedata:reactivation_count:${keyHash}`;
        let reactivationCount = 0;
        try {
            const existing = await this.redisService.get(reactivationKey);
            reactivationCount = existing ? (JSON.parse(existing).count || 0) + 1 : 1;
        }
        catch {
            reactivationCount = 1;
        }
        const ttlMs = reactivationCount >= 3 ? 8 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
        await this.redisService.set(circuitBreakerKey, JSON.stringify({
            activatedAt: new Date().toISOString(),
            reason: 'TwelveData server reported daily credit exhaustion',
            apiKeyHash: keyHash,
            reactivationCount,
        }), ttlMs);
        await this.redisService.set(reactivationKey, JSON.stringify({ count: reactivationCount, lastActivated: new Date().toISOString() }), 86_400_000);
        const ttlHours = ttlMs / (60 * 60 * 1000);
        this.logger.error(`🚫 TwelveData DAILY CREDITS EXHAUSTED — circuit breaker activated for ${ttlHours} hours ` +
            `(reactivation #${reactivationCount}). ` +
            `If you updated your API key, it will take effect automatically. ` +
            `Set DISABLE_TWELVE_DATA=true to skip TwelveData entirely. ` +
            `Consider upgrading your TwelveData plan at https://twelvedata.com/pricing`);
    }
    _getKeyHash() {
        let hash = 0;
        for (let i = 0; i < this.apiKey.length; i++) {
            const chr = this.apiKey.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash.toString(36);
    }
    _toNumber(value) {
        if (value === null || value === undefined || value === '')
            return 0;
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
    }
};
exports.TwelveDataAdapter = TwelveDataAdapter;
exports.TwelveDataAdapter = TwelveDataAdapter = TwelveDataAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        redis_service_1.RedisService])
], TwelveDataAdapter);
//# sourceMappingURL=twelve-data.adapter.js.map