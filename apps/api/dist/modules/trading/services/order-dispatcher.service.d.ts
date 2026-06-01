import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { IdempotencyService } from './idempotency.service';
import { RiskGatekeeperService } from './risk-gatekeeper.service';
import { OrderStateManagerService } from './order-state-manager.service';
import { TradingService } from '../trading.service';
export interface AutoOrderRequest {
    source: 'smart_executor' | 'agent';
    userId: string;
    credentialId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    briefId?: string;
    signalId?: string;
    isPaperTrading?: boolean;
    timeframe?: string;
}
export interface OrderResult {
    success: boolean;
    orderId?: string;
    message?: string;
    error?: string;
}
export declare class OrderDispatcherService {
    private readonly prisma;
    private readonly redis;
    private readonly idempotency;
    private readonly riskGatekeeper;
    private readonly stateManager;
    private readonly tradingService;
    private readonly logger;
    constructor(prisma: PrismaService, redis: RedisService, idempotency: IdempotencyService, riskGatekeeper: RiskGatekeeperService, stateManager: OrderStateManagerService, tradingService: TradingService);
    submitOrder(request: AutoOrderRequest): Promise<OrderResult>;
    getActiveOrders(userId: string): Promise<any[]>;
}
