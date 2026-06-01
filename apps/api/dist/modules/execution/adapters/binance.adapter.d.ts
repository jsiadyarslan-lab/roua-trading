import { IExchangeAdapter, UnifiedOrder, ExecutionResult, OrderExecutionStatus, UnifiedBalance } from './base-adapter.interface';
import { AuditService } from '../../../audit/audit.service';
export declare class BinanceAdapter implements IExchangeAdapter {
    private readonly apiKey;
    private readonly apiSecret;
    private readonly auditService;
    private readonly userId;
    private readonly isSandbox;
    private readonly defaultType;
    private readonly logger;
    private exchange;
    private readonly rateLimits;
    constructor(apiKey: string, apiSecret: string, auditService: AuditService, userId: string, isSandbox?: boolean, defaultType?: 'spot' | 'future');
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
    private _initializeExchange;
    private _mapStatus;
    private _toUnifiedOrder;
    private _normalizeError;
    private _auditLog;
}
