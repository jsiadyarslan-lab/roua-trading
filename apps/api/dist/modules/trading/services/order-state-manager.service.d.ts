import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { OrderCommand, OrderStatusEnum } from '../events/order.events';
export declare class OrderStateManagerService {
    private readonly prisma;
    private readonly auditService;
    private readonly logger;
    constructor(prisma: PrismaService, auditService: AuditService);
    createOrder(command: OrderCommand): Promise<any>;
    updateOrderStatus(orderId: string, status: OrderStatusEnum | string, payload?: Record<string, any>): Promise<void>;
    rejectOrder(orderId: string, reason: string, failedCheck?: string): Promise<void>;
    findOrderById(orderId: string): Promise<any>;
    findOrders(userId: string, filters?: {
        symbol?: string;
        status?: string;
        limit?: number;
    }): Promise<any[]>;
    getOrderEvents(orderId: string): Promise<any[]>;
    private _statusToEventType;
}
