import { OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditService } from '../../../audit/audit.service';
import { TradingService } from '../../../modules/trading/trading.service';
import { ExchangeService } from '../../../modules/exchange/exchange.service';
import { EvaluatedSignal, TradeExecution, RiskAssessment } from '../types/agent.types';
import { OrderDispatcherService } from '../../../modules/trading/services/order-dispatcher.service';
import { ExposureManagerService } from '../../../modules/trading/services/exposure-manager.service';
import { CredentialsService } from '../../../modules/portfolio/credentials/credentials.service';
export declare class OrderExecutorService implements OnModuleDestroy {
    private readonly prisma;
    private readonly redis;
    private readonly audit;
    private readonly tradingService;
    private readonly orderDispatcher;
    private readonly exposureManager;
    private readonly exchangeService;
    private readonly credentialsService;
    private readonly logger;
    private readonly MAX_SLIPPAGE_PERCENT;
    private readonly recentOrders;
    private cleanupInterval;
    constructor(prisma: PrismaService, redis: RedisService, audit: AuditService, tradingService: TradingService, orderDispatcher: OrderDispatcherService, exposureManager: ExposureManagerService, exchangeService: ExchangeService, credentialsService: CredentialsService);
    onModuleDestroy(): void;
    execute(userId: string, signal: EvaluatedSignal, risk: RiskAssessment, credentialId: string): Promise<TradeExecution>;
    emergencyCloseAll(userId: string): Promise<{
        closedCount: number;
        errors: number;
        totalPnL: number;
    }>;
    private _isDuplicateOrder;
    private _calculateSlippage;
    private _cleanupOldOrders;
    private _checkSufficientBalance;
}
