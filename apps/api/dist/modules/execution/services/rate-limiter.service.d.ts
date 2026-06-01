import { RedisService } from '../../../common/redis/redis.service';
import { ConfigService } from '@nestjs/config';
export declare class RateLimiterService {
    private readonly redisService;
    private readonly configService;
    private readonly logger;
    private readonly RATE_PREFIX_SEC;
    private readonly RATE_PREFIX_MIN;
    private readonly defaultLimits;
    private customLimits;
    constructor(redisService: RedisService, configService: ConfigService);
    checkRateLimit(exchangeId: string, userId: string, weight?: number): Promise<boolean>;
    getRemainingCapacity(exchangeId: string, userId: string): Promise<{
        perSecond: number;
        perMinute: number;
    }>;
    updateLimits(exchangeId: string, limits: {
        maxRequestsPerSecond: number;
        maxRequestsPerMinute: number;
    }): void;
    private _getLimits;
    private _loadCustomLimits;
}
