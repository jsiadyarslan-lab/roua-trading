import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class RedisService implements OnModuleDestroy {
    private readonly configService;
    private readonly logger;
    private readonly client;
    constructor(configService: ConfigService);
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlMs?: number): Promise<void>;
    del(key: string): Promise<void>;
    incr(key: string): Promise<number>;
    expire(key: string, ttlMs: number): Promise<void>;
    ttl(key: string): Promise<number>;
    exists(key: string): Promise<boolean>;
    checkRateLimit(key: string, limit: number, windowMs: number): Promise<{
        allowed: boolean;
        remaining: number;
        resetIn: number;
    }>;
    cacheOrGet<T>(key: string, factory: () => Promise<T>, ttlMs: number): Promise<T>;
    onModuleDestroy(): Promise<void>;
}
