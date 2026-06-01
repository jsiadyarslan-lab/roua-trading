import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
export declare const IS_PUBLIC_KEY = "isPublic";
export declare const Public: () => import("@nestjs/common").CustomDecorator<string>;
export declare class AuthGuard implements CanActivate {
    private readonly prisma;
    private readonly reflector;
    private readonly redis?;
    private readonly logger;
    private readonly SESSION_CACHE_PREFIX;
    private readonly SESSION_CACHE_TTL_MS;
    constructor(prisma: PrismaService, reflector: Reflector, redis?: RedisService | undefined);
    canActivate(context: ExecutionContext): Promise<boolean>;
    clearRlsContext(): Promise<void>;
}
