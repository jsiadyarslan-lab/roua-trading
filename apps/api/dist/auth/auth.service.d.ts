import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AuditService } from '../audit/audit.service';
export declare class AuthService {
    private readonly prisma;
    private readonly redis;
    private readonly configService;
    private readonly auditService;
    private readonly logger;
    private readonly rpId;
    private readonly rpName;
    private readonly challengeTtlMs;
    private readonly sessionTtlMs;
    constructor(prisma: PrismaService, redis: RedisService, configService: ConfigService, auditService: AuditService);
    generateRegistrationChallenge(email: string, displayName?: string): Promise<{
        challenge: string;
        rp: {
            name: string;
            id: string;
        };
        user: {
            id: string;
            name: string;
            displayName: string;
        };
        pubKeyCredParams: {
            type: "public-key";
            alg: number;
        }[];
        timeout: number;
        attestation: "none";
        authenticatorSelection: {
            authenticatorAttachment: "platform";
            userVerification: "required";
            residentKey: "required";
        };
    }>;
    generateAuthenticationChallenge(email: string): Promise<{
        challenge: string;
        rpId: string;
        allowCredentials: {
            type: "public-key";
            id: string;
            transports: "internal"[];
        }[];
        userVerification: "required";
        timeout: number;
    }>;
    verifyRegistration(email: string, credential: any, userAgent?: string, ipAddress?: string): Promise<{
        success: boolean;
        sessionToken: string;
        user: {
            id: string;
            email: string;
            displayName: string | null;
            tier: import("@prisma/client").$Enums.Tier;
        };
    }>;
    verifyAuthentication(email: string, assertion: any, userAgent?: string, ipAddress?: string): Promise<{
        success: boolean;
        sessionToken: string;
        user: {
            id: string;
            email: string;
            displayName: string | null;
            tier: import("@prisma/client").$Enums.Tier;
        };
    }>;
    validateSession(token: string): Promise<{
        authenticated: boolean;
        user?: undefined;
    } | {
        authenticated: boolean;
        user: {
            id: string;
            email: string;
            displayName: string | null;
            tier: import("@prisma/client").$Enums.Tier;
        };
    }>;
    destroySession(token: string): Promise<{
        success: boolean;
    }>;
    private generateChallenge;
    private getUserIdBuffer;
    private createSession;
}
