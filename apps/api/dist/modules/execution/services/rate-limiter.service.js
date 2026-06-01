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
var RateLimiterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiterService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../../common/redis/redis.service");
const config_1 = require("@nestjs/config");
let RateLimiterService = RateLimiterService_1 = class RateLimiterService {
    constructor(redisService, configService) {
        this.redisService = redisService;
        this.configService = configService;
        this.logger = new common_1.Logger(RateLimiterService_1.name);
        this.RATE_PREFIX_SEC = 'rate:sec:';
        this.RATE_PREFIX_MIN = 'rate:min:';
        this.defaultLimits = {
            binance: { maxRequestsPerSecond: 5, maxRequestsPerMinute: 120 },
            alpaca: { maxRequestsPerSecond: 3, maxRequestsPerMinute: 200 },
            paper: { maxRequestsPerSecond: 20, maxRequestsPerMinute: 1000 },
        };
        this.customLimits = {};
        this._loadCustomLimits();
        this.logger.log('⚡ Rate Limiter Service initialized — token bucket active');
    }
    async checkRateLimit(exchangeId, userId, weight = 1) {
        const limits = this._getLimits(exchangeId);
        const secKey = `${this.RATE_PREFIX_SEC}${exchangeId}:${userId}`;
        const minKey = `${this.RATE_PREFIX_MIN}${exchangeId}:${userId}`;
        try {
            const secResult = await this.redisService.checkRateLimit(secKey, limits.maxRequestsPerSecond, 1000);
            if (!secResult.allowed) {
                this.logger.warn(`⚡ Rate limit EXCEEDED (per-second): ${exchangeId}/${userId} — ${secResult.remaining} remaining`);
                return false;
            }
            const minResult = await this.redisService.checkRateLimit(minKey, limits.maxRequestsPerMinute, 60000);
            if (!minResult.allowed) {
                this.logger.warn(`⚡ Rate limit EXCEEDED (per-minute): ${exchangeId}/${userId} — ${minResult.remaining} remaining`);
                return false;
            }
            return true;
        }
        catch (error) {
            this.logger.error(`⚡ Rate limit check failed: ${error.message} — blocking request to prevent rate limit violations`);
            return false;
        }
    }
    async getRemainingCapacity(exchangeId, userId) {
        const limits = this._getLimits(exchangeId);
        const secKey = `${this.RATE_PREFIX_SEC}${exchangeId}:${userId}`;
        const minKey = `${this.RATE_PREFIX_MIN}${exchangeId}:${userId}`;
        try {
            const secCurrent = parseInt(await this.redisService.get(secKey) || '0', 10);
            const minCurrent = parseInt(await this.redisService.get(minKey) || '0', 10);
            return {
                perSecond: Math.max(0, limits.maxRequestsPerSecond - secCurrent),
                perMinute: Math.max(0, limits.maxRequestsPerMinute - minCurrent),
            };
        }
        catch {
            return {
                perSecond: limits.maxRequestsPerSecond,
                perMinute: limits.maxRequestsPerMinute,
            };
        }
    }
    updateLimits(exchangeId, limits) {
        this.customLimits[exchangeId] = limits;
        this.logger.log(`⚡ Updated rate limits for ${exchangeId}: ${limits.maxRequestsPerSecond}/s, ${limits.maxRequestsPerMinute}/m`);
    }
    _getLimits(exchangeId) {
        if (this.customLimits[exchangeId]) {
            return this.customLimits[exchangeId];
        }
        if (this.defaultLimits[exchangeId]) {
            return this.defaultLimits[exchangeId];
        }
        return { maxRequestsPerSecond: 2, maxRequestsPerMinute: 60 };
    }
    _loadCustomLimits() {
        const customBinance = this.configService.get('RATE_LIMIT_BINANCE');
        if (customBinance) {
            const [sec, min] = customBinance.split(',').map(Number);
            if (sec && min)
                this.customLimits['binance'] = { maxRequestsPerSecond: sec, maxRequestsPerMinute: min };
        }
        const customAlpaca = this.configService.get('RATE_LIMIT_ALPACA');
        if (customAlpaca) {
            const [sec, min] = customAlpaca.split(',').map(Number);
            if (sec && min)
                this.customLimits['alpaca'] = { maxRequestsPerSecond: sec, maxRequestsPerMinute: min };
        }
    }
};
exports.RateLimiterService = RateLimiterService;
exports.RateLimiterService = RateLimiterService = RateLimiterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        config_1.ConfigService])
], RateLimiterService);
//# sourceMappingURL=rate-limiter.service.js.map