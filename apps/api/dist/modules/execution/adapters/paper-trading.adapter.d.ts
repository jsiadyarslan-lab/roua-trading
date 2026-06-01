import { IExchangeAdapter, UnifiedOrder, ExecutionResult, OrderExecutionStatus, UnifiedBalance } from './base-adapter.interface';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { RedisService } from '../../../common/redis/redis.service';
export declare class PaperTradingAdapter implements IExchangeAdapter {
    private readonly prisma;
    private readonly aggregator;
    private readonly redisService;
    private readonly auditService;
    private readonly userId;
    private readonly logger;
    private readonly slippagePercent;
    private readonly commissionPercent;
    private readonly pendingLimitOrders;
    private readonly rateLimits;
    constructor(prisma: PrismaService, aggregator: MarketDataAggregatorService, redisService: RedisService, auditService: AuditService, userId: string);
    placeOrder(order: UnifiedOrder): Promise<ExecutionResult>;
    cancelOrder(orderId: string, symbol: string): Promise<boolean>;
    getOrderStatus(orderId: string, symbol: string): Promise<OrderExecutionStatus>;
    fetchOpenOrders(symbol?: string): Promise<UnifiedOrder[]>;
    fetchBalance(): Promise<UnifiedBalance>;
    getExchangeId(): string;
    supportsWebSocket(): boolean;
    getRateLimits(): {
        maxRequestsPerSecond: number;
        maxRequestsPerMinute: number;
    };
    private _executeMarketOrder;
    private _executeLimitOrder;
    private _getCurrentPrice;
    private _auditLog;
    private _priceDecimals;
}
