import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaExtensionService } from '../../../common/prisma/prisma-extension.service';
import { AuditService } from '../../../audit/audit.service';
export declare class CredentialsService {
    private readonly prisma;
    private readonly prismaExtension;
    private readonly configService;
    private readonly auditService;
    private readonly logger;
    private readonly encryptionKey;
    private readonly FORBIDDEN_PERMISSIONS;
    private readonly balanceCache;
    private readonly BALANCE_CACHE_TTL_MS;
    private readonly BALANCE_CACHE_MAX_SIZE;
    private balanceCleanupInterval;
    constructor(prisma: PrismaService, prismaExtension: PrismaExtensionService, configService: ConfigService, auditService: AuditService);
    addCredential(userId: string, data: {
        exchange: string;
        label: string;
        apiKey: string;
        apiSecret: string;
        passphrase?: string;
        testnet?: boolean;
        keyType?: string;
    }, ipAddress?: string, userAgent?: string): Promise<{
        id: string;
        exchange: string;
        label: string;
        permissions: string;
        isValid: boolean;
        lastValidatedAt: Date | null;
        createdAt: Date;
    }>;
    getUserCredentials(userId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        exchange: string;
        label: string;
        permissions: string;
        isValid: boolean;
        lastValidatedAt: Date | null;
    }[]>;
    updateCredential(userId: string, credentialId: string, data: {
        testnet?: boolean;
    }, ipAddress?: string, userAgent?: string): Promise<{
        keyType: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        exchange: string;
        label: string;
        encryptedApiKey: string;
        encryptedSecret: string;
        iv: string;
        authTag: string;
        secretIv: string | null;
        secretAuthTag: string | null;
        encryptedPassphrase: string | null;
        passphraseIv: string | null;
        passphraseAuthTag: string | null;
        permissions: string;
        isValid: boolean;
        lastValidatedAt: Date | null;
        testnet: boolean;
    }>;
    deleteCredential(userId: string, credentialId: string, ipAddress?: string, userAgent?: string): Promise<{
        success: boolean;
    }>;
    decryptCredential(credentialId: string, userId?: string): Promise<{
        apiKey: string;
        apiSecret: string;
        passphrase?: string;
    }>;
    fetchAllExchangeBalances(userId: string): Promise<{
        totalEquityUsd: number;
        totalAvailableUsd: number;
        totalUsedMargin: number;
        exchanges: Array<{
            exchange: string;
            label: string;
            credentialId: string;
            isTestnet: boolean;
            equity: number;
            available: number;
            currency: string;
            usedMargin: number;
            paperBalance?: number;
            assets: Array<{
                currency: string;
                free: number;
                used: number;
                total: number;
            }>;
            error?: string;
            errorDetail?: string;
        }>;
        allRealExchangesFailed?: boolean;
        hasRealCredentials?: boolean;
    }>;
    private _fetchSingleExchangeBalance;
    private _encrypt;
    private _decrypt;
    private _validateApiKey;
    private _doValidateApiKey;
    private _isAuthError;
    getServerOutboundIp(): Promise<string>;
    invalidateBalanceCache(userId: string): void;
    private _isConnectionError;
    testExchangeConnectivity(exchange: string, userId?: string): Promise<{
        exchange: string;
        reachable: boolean;
        latencyMs: number;
        error?: string;
        errorType?: string;
        serverTime?: number;
        serverIp?: string;
        authTest?: {
            success: boolean;
            latencyMs: number;
            error?: string;
            errorType?: string;
            balanceEquity?: number;
            hasCredentials: boolean;
        };
    }>;
}
