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
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
let RedisService = RedisService_1 = class RedisService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RedisService_1.name);
        const redisUrl = this.configService.get('REDIS_URL', 'redis://localhost:6379');
        this.client = new ioredis_1.default(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                const delay = Math.min(times * 200, 5000);
                return delay;
            },
        });
        this.client.on('connect', () => {
            this.logger.log('🔴 Redis connected');
        });
        this.client.on('error', (err) => {
            this.logger.error('Redis connection error:', err.message);
        });
    }
    async get(key) {
        return this.client.get(key);
    }
    async set(key, value, ttlMs) {
        if (ttlMs) {
            await this.client.set(key, value, 'PX', ttlMs);
        }
        else {
            await this.client.set(key, value);
        }
    }
    async del(key) {
        await this.client.del(key);
    }
    async incr(key) {
        return this.client.incr(key);
    }
    async expire(key, ttlMs) {
        await this.client.pexpire(key, ttlMs);
    }
    async ttl(key) {
        return this.client.pttl(key);
    }
    async exists(key) {
        const result = await this.client.exists(key);
        return result === 1;
    }
    async checkRateLimit(key, limit, windowMs) {
        const current = await this.incr(key);
        if (current === 1) {
            await this.expire(key, windowMs);
        }
        const ttl = await this.ttl(key);
        if (current > limit) {
            return { allowed: false, remaining: 0, resetIn: ttl };
        }
        return { allowed: true, remaining: limit - current, resetIn: ttl };
    }
    async cacheOrGet(key, factory, ttlMs) {
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
    async onModuleDestroy() {
        await this.client.quit();
        this.logger.log('🔴 Redis disconnected');
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map