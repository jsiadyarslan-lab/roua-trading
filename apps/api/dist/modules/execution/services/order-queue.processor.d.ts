import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExecutionGatewayService } from '../gateways/execution-gateway.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { ConnectionResilienceService } from './connection-resilience.service';
import { RateLimiterService } from './rate-limiter.service';
import { AuditService } from '../../../audit/audit.service';
export declare class OrderQueueProcessor extends WorkerHost {
    private readonly prisma;
    private readonly gatewayService;
    private readonly lifecycleService;
    private readonly resilienceService;
    private readonly rateLimiter;
    private readonly auditService;
    private readonly logger;
    constructor(prisma: PrismaService, gatewayService: ExecutionGatewayService, lifecycleService: OrderLifecycleService, resilienceService: ConnectionResilienceService, rateLimiter: RateLimiterService, auditService: AuditService);
    process(job: Job<ExecutionJobData>, token?: string): Promise<ExecutionJobResult>;
    private _isTransientError;
}
export interface ExecutionJobData {
    orderId: string;
    userId: string;
    exchangeCredentialId: string;
    symbol: string;
    side: string;
    type: string;
    quantity: number;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    idempotencyKey: string;
    clientOrderId?: string;
    source?: string;
}
export interface ExecutionJobResult {
    success: boolean;
    exchangeOrderId?: string;
    filledQuantity?: number;
    averagePrice?: number;
    error?: string;
}
