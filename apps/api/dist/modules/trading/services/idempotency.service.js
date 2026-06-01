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
var IdempotencyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../../common/redis/redis.service");
const strategic_council_types_1 = require("../../ai/strategic-council/strategic-council.types");
let IdempotencyService = IdempotencyService_1 = class IdempotencyService {
    getTimeframeTTL(timeframe) {
        if (!timeframe)
            return 60;
        const tf = timeframe.toUpperCase();
        const expiryMs = strategic_council_types_1.TIMEFRAME_EXPIRY_MS[tf];
        if (!expiryMs)
            return 60;
        const ttl = Math.max(30, Math.min(300, Math.round(expiryMs / 1000 * 0.02)));
        return ttl;
    }
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(IdempotencyService_1.name);
        this.KEY_PREFIX = 'idempotency:';
        this.logger.log('🔑 Idempotency Service initialized — duplicate protection active');
    }
    async checkAndLock(key, timeframe) {
        const redisKey = `${this.KEY_PREFIX}${key}`;
        const ttl = this.getTimeframeTTL(timeframe);
        try {
            const acquired = await this.redisService.setIfNotExists(redisKey, JSON.stringify({ locked: true, lockedAt: new Date().toISOString(), timeframe: timeframe || 'unknown' }), ttl);
            if (!acquired) {
                this.logger.warn(`🔑 Duplicate idempotency key detected: ${key} (TTL: ${ttl}s)`);
                return false;
            }
            this.logger.debug(`🔑 Idempotency key locked: ${key} (TTL: ${ttl}s, timeframe: ${timeframe || 'default'})`);
            return true;
        }
        catch (error) {
            this.logger.error(`Idempotency check failed for ${key}: ${error.message} — blocking request to prevent duplicates`);
            return false;
        }
    }
    async releaseLock(key) {
        const redisKey = `${this.KEY_PREFIX}${key}`;
        try {
            await this.redisService.del(redisKey);
            this.logger.debug(`🔑 Idempotency key released: ${key}`);
        }
        catch (error) {
            this.logger.error(`Failed to release idempotency key ${key}: ${error.message}`);
        }
    }
    async isLocked(key) {
        const redisKey = `${this.KEY_PREFIX}${key}`;
        try {
            const exists = await this.redisService.get(redisKey);
            return !!exists;
        }
        catch {
            return false;
        }
    }
};
exports.IdempotencyService = IdempotencyService;
exports.IdempotencyService = IdempotencyService = IdempotencyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], IdempotencyService);
//# sourceMappingURL=idempotency.service.js.map