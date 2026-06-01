import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
export declare class RedisService implements OnModuleDestroy {
    private readonly configService;
    private readonly logger;
    private readonly client;
    private readonly isAvailable;
    constructor(configService: ConfigService);
    private handleUnavailable;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlMs?: number): Promise<void>;
    setIfNotExists(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
    del(key: string): Promise<void>;
    incr(key: string): Promise<number>;
    expire(key: string, ttlMs: number): Promise<void>;
    ttl(key: string): Promise<number>;
    exists(key: string): Promise<boolean>;
    private readonly rateLimitScript;
    checkRateLimit(key: string, limit: number, windowMs: number): Promise<{
        allowed: boolean;
        remaining: number;
        resetIn: number;
    }>;
    cacheOrGet<T>(key: string, factory: () => Promise<T>, ttlMs: number): Promise<T>;
    scanKeys(pattern: string, count?: number): Promise<string[]>;
    scanAndCleanup(pattern?: string, defaultTtlMs?: number): Promise<number>;
    publish(channel: string, message: string): Promise<number>;
    onModuleDestroy(): Promise<void>;
    ping(): Promise<string>;
    getIsAvailable(): boolean;
    duplicateSubscriber(): Redis | null;
}
