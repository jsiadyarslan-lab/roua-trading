import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AuditService } from '../audit/audit.service';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
export declare class AuthService {
    private readonly prisma;
    private readonly redis;
    private readonly configService;
    private readonly auditService;
    private readonly logger;
    private readonly rpId;
    private readonly rpName;
    private readonly origin;
    private readonly challengeTtlMs;
    private readonly sessionTtlMs;
    private readonly refreshTtlMs;
    private readonly sessionRedisPrefix;
    private readonly sessionRedisTtlMs;
    constructor(prisma: PrismaService, redis: RedisService, configService: ConfigService, auditService: AuditService);
    generateRegistrationChallenge(email: string, displayName?: string): Promise<import("@simplewebauthn/server").PublicKeyCredentialCreationOptionsJSON>;
    generateAuthenticationChallenge(email: string): Promise<import("@simplewebauthn/server").PublicKeyCredentialRequestOptionsJSON>;
    verifyRegistration(email: string, regResponse: RegistrationResponseJSON, userAgent?: string, ipAddress?: string): Promise<{
        success: boolean;
        sessionToken: string;
        refreshToken: string | null;
        user: {
            id: string;
            email: string;
            displayName: string | null;
            tier: import(".prisma/client").$Enums.Tier;
        };
    }>;
    verifyAuthentication(email: string, assertion: AuthenticationResponseJSON, userAgent?: string, ipAddress?: string): Promise<{
        success: boolean;
        sessionToken: string;
        refreshToken: string | null;
        user: {
            id: string;
            email: string;
            displayName: string | null;
            tier: import(".prisma/client").$Enums.Tier;
        };
    }>;
    validateSession(token: string): Promise<any>;
    refreshSession(refreshToken: string, userAgent?: string, ipAddress?: string): Promise<{
        success: boolean;
        sessionToken: string;
        refreshToken: string | null;
        user: {
            id: string;
            email: string;
            displayName: string | null;
            tier: import(".prisma/client").$Enums.Tier;
        };
    }>;
    getUserSessions(userId: string): Promise<{
        id: string;
        device: any;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: Date;
        expiresAt: Date;
        lastActive: Date;
        maskedIp: string | null;
    }[]>;
    revokeSession(sessionId: string, userId: string): Promise<{
        success: boolean;
    }>;
    revokeAllOtherSessions(userId: string, currentSessionToken: string): Promise<{
        success: boolean;
        revokedCount: number;
    }>;
    destroySession(token: string): Promise<{
        success: boolean;
    }>;
    cleanupExpiredSessions(): Promise<{
        cleaned: number;
    }>;
    private getUserIdBuffer;
    private createSession;
    private parseUserAgent;
    private maskIpAddress;
}
