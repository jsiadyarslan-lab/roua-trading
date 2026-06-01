import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { ExecutionResult, OrderExecutionStatus } from '../adapters/base-adapter.interface';
export declare class OrderLifecycleService {
    private readonly prisma;
    private readonly auditService;
    private readonly logger;
    constructor(prisma: PrismaService, auditService: AuditService);
    handleExecutionResult(result: ExecutionResult, orderId: string, userId: string): Promise<void>;
    syncOrderFromExchange(orderId: string, exchangeOrderId: string, adapterStatus: OrderExecutionStatus): Promise<void>;
    private _handleSuccess;
    private _handleFailure;
    private _updatePosition;
    private _mapAdapterStatus;
    private _statusToEventType;
    private _extractSourceFromClientOrderId;
}
