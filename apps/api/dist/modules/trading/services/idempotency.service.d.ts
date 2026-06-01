import { RedisService } from '../../../common/redis/redis.service';
export declare class IdempotencyService {
    private readonly redisService;
    private readonly logger;
    private readonly KEY_PREFIX;
    private getTimeframeTTL;
    constructor(redisService: RedisService);
    checkAndLock(key: string, timeframe?: string): Promise<boolean>;
    releaseLock(key: string): Promise<void>;
    isLocked(key: string): Promise<boolean>;
}
