import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { AuditService } from '../../../audit/audit.service';
import { IExchangeAdapter, UnifiedOrder, ExecutionResult } from '../adapters/base-adapter.interface';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { RedisService } from '../../../common/redis/redis.service';
export declare class ExecutionGatewayService {
    private readonly prisma;
    private readonly credentialsService;
    private readonly auditService;
    private readonly aggregator;
    private readonly redisService;
    private readonly configService?;
    private readonly logger;
    private readonly adapterCache;
    private readonly ADAPTER_CACHE_TTL_MS;
    constructor(prisma: PrismaService, credentialsService: CredentialsService, auditService: AuditService, aggregator: MarketDataAggregatorService, redisService: RedisService, configService?: ConfigService | undefined);
    getAdapterForUser(userId: string, exchangeCredentialId: string): Promise<IExchangeAdapter>;
    placeOrder(userId: string, order: UnifiedOrder): Promise<ExecutionResult>;
    cancelOrder(userId: string, exchangeCredentialId: string, orderId: string, symbol: string): Promise<boolean>;
    clearCache(credentialId?: string): void;
    private _createAdapter;
    private _validatePermissions;
    private _isTestExchange;
}
