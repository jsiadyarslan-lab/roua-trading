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
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = RedisService_1 = class RedisService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RedisService_1.name);
        this.rateLimitScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('PTTL', KEYS[1])
    return { current, ttl }
  `;
        const redisUrl = this.configService.get('REDIS_URL', '');
        if (!redisUrl || redisUrl === 'CHANGE_ME_IN_PRODUCTION') {
            this.logger.warn('REDIS_URL not configured — operating in degraded mode (no caching, no BullMQ queues)');
            this.isAvailable = false;
            this.client = new ioredis_1.default({
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                retryStrategy: () => null,
                enableOfflineQueue: false,
            });
            return;
        }
        this.isAvailable = true;
        this.client = new ioredis_1.default(redisUrl, {
            maxRetriesPerRequest: 3,
            enableOfflineQueue: true,
            retryStrategy: (times) => {
                if (times > 10) {
                    this.logger.warn(`Redis retry limit reached (${times} attempts) — giving up`);
                    return null;
                }
                const delay = Math.min(times * 200, 5000);
                return delay;
            },
        });
        this.client.on('connect', () => {
            this.logger.log('Redis connected');
        });
        this.client.on('error', (err) => {
            this.logger.warn(`Redis connection error: ${err.message}`);
        });
        this.client.on('close', () => {
            this.logger.warn('Redis connection closed');
        });
    }
    handleUnavailable(fallback, operation) {
        this.logger.debug(`Redis unavailable — skipping ${operation}`);
        return fallback;
    }
    async get(key) {
        if (!this.isAvailable)
            return this.handleUnavailable(null, `get(${key})`);
        try {
            return await this.client.get(key);
        }
        catch (err) {
            this.logger.warn(`Redis GET failed for key "${key}": ${err.message}`);
            return null;
        }
    }
    async set(key, value, ttlMs) {
        if (!this.isAvailable)
            return this.handleUnavailable(undefined, `set(${key})`);
        try {
            if (ttlMs) {
                await this.client.set(key, value, 'PX', ttlMs);
            }
            else {
                const env = process.env.NODE_ENV || 'development';
                const defaultTtlMs = 24 * 60 * 60 * 1000;
                if (env === 'production') {
                    this.logger.warn(`[Redis] Setting key "${key}" without TTL in production — defaulting to 24h.`);
                    await this.client.set(key, value, 'PX', defaultTtlMs);
                }
                else {
                    await this.client.set(key, value);
                }
            }
        }
        catch (err) {
            this.logger.warn(`Redis SET failed for key "${key}": ${err.message}`);
        }
    }
    async setIfNotExists(key, value, ttlSeconds = 86400) {
        if (!this.isAvailable)
            return this.handleUnavailable(false, `setIfNotExists(${key})`);
        try {
            const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
            return result === 'OK';
        }
        catch (err) {
            this.logger.warn(`Redis SETNX failed for key "${key}": ${err.message}`);
            return false;
        }
    }
    async del(key) {
        if (!this.isAvailable)
            return this.handleUnavailable(undefined, `del(${key})`);
        try {
            await this.client.del(key);
        }
        catch (err) {
            this.logger.warn(`Redis DEL failed for key "${key}": ${err.message}`);
        }
    }
    async incr(key) {
        if (!this.isAvailable)
            return this.handleUnavailable(0, `incr(${key})`);
        try {
            return await this.client.incr(key);
        }
        catch (err) {
            this.logger.warn(`Redis INCR failed for key "${key}": ${err.message}`);
            return 0;
        }
    }
    async expire(key, ttlMs) {
        if (!this.isAvailable)
            return this.handleUnavailable(undefined, `expire(${key})`);
        try {
            await this.client.pexpire(key, ttlMs);
        }
        catch (err) {
            this.logger.warn(`Redis EXPIRE failed for key "${key}": ${err.message}`);
        }
    }
    async ttl(key) {
        if (!this.isAvailable)
            return this.handleUnavailable(-2, `ttl(${key})`);
        try {
            return await this.client.pttl(key);
        }
        catch (err) {
            this.logger.warn(`Redis TTL failed for key "${key}": ${err.message}`);
            return -2;
        }
    }
    async exists(key) {
        if (!this.isAvailable)
            return this.handleUnavailable(false, `exists(${key})`);
        try {
            const result = await this.client.exists(key);
            return result === 1;
        }
        catch (err) {
            this.logger.warn(`Redis EXISTS failed for key "${key}": ${err.message}`);
            return false;
        }
    }
    async checkRateLimit(key, limit, windowMs) {
        if (!this.isAvailable) {
            return { allowed: true, remaining: limit, resetIn: windowMs };
        }
        try {
            const result = await this.client.eval(this.rateLimitScript, 1, key, windowMs);
            const current = result[0];
            const ttl = result[1];
            if (current > limit) {
                return { allowed: false, remaining: 0, resetIn: ttl };
            }
            return { allowed: true, remaining: limit - current, resetIn: ttl };
        }
        catch (err) {
            this.logger.warn(`Redis rate limit check failed: ${err.message}`);
            return { allowed: true, remaining: limit, resetIn: windowMs };
        }
    }
    async cacheOrGet(key, factory, ttlMs) {
        if (!this.isAvailable) {
            return factory();
        }
        const cached = await this.get(key);
        if (cached) {
            try {
                return JSON.parse(cached);
            }
            catch {
            }
        }
        const value = await factory();
        await this.set(key, JSON.stringify(value), ttlMs);
        return value;
    }
    async scanKeys(pattern, count = 100) {
        if (!this.isAvailable)
            return this.handleUnavailable([], `scanKeys(${pattern})`);
        try {
            const keys = [];
            let cursor = '0';
            do {
                const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
                cursor = result[0];
                keys.push(...result[1]);
            } while (cursor !== '0');
            return keys;
        }
        catch (err) {
            this.logger.warn(`Redis SCAN failed: ${err.message}`);
            return [];
        }
    }
    async scanAndCleanup(pattern = '*', defaultTtlMs = 24 * 60 * 60 * 1000) {
        if (!this.isAvailable)
            return 0;
        let cleaned = 0;
        try {
            const keys = await this.scanKeys(pattern);
            for (const key of keys) {
                const ttl = await this.client.pttl(key);
                if (ttl === -1) {
                    await this.client.pexpire(key, defaultTtlMs);
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                this.logger.log(`[Redis] Cleanup: set default TTL on ${cleaned}/${keys.length} keys matching "${pattern}"`);
            }
        }
        catch (error) {
            this.logger.warn(`[Redis] Cleanup scan failed: ${error?.message || error}`);
        }
        return cleaned;
    }
    async publish(channel, message) {
        if (!this.isAvailable)
            return this.handleUnavailable(0, `publish(${channel})`);
        try {
            return await this.client.publish(channel, message);
        }
        catch (err) {
            this.logger.warn(`Redis PUBLISH failed on channel "${channel}": ${err.message}`);
            return 0;
        }
    }
    async onModuleDestroy() {
        if (this.isAvailable) {
            try {
                await this.client.quit();
                this.logger.log('Redis disconnected');
            }
            catch {
            }
        }
    }
    async ping() {
        if (!this.isAvailable)
            return 'DEGRADED';
        try {
            return await this.client.ping();
        }
        catch (err) {
            this.logger.warn(`Redis PING failed: ${err.message}`);
            return 'ERROR';
        }
    }
    getIsAvailable() {
        return this.isAvailable;
    }
    duplicateSubscriber() {
        if (!this.isAvailable)
            return null;
        try {
            const redisUrl = this.configService.get('REDIS_URL', '');
            if (!redisUrl || redisUrl === 'CHANGE_ME_IN_PRODUCTION')
                return null;
            const dup = new ioredis_1.default(redisUrl, {
                maxRetriesPerRequest: null,
                retryStrategy: (times) => {
                    if (times > 10)
                        return null;
                    return Math.min(times * 200, 5000);
                },
            });
            dup.on('error', (err) => {
                this.logger.warn(`Redis subscriber error: ${err.message}`);
            });
            return dup;
        }
        catch (err) {
            this.logger.warn(`Failed to create Redis subscriber: ${err.message}`);
            return null;
        }
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map