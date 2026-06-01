"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OrderStateManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderStateManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const audit_service_1 = require("../../../audit/audit.service");
let OrderStateManagerService = OrderStateManagerService_1 = class OrderStateManagerService {
    constructor(prisma, auditService) {
        this.prisma = prisma;
        this.auditService = auditService;
        this.logger = new common_1.Logger(OrderStateManagerService_1.name);
        this.logger.log('📋 Order State Manager initialized — lifecycle tracking active');
    }
    async createOrder(command) {
        this.logger.debug(`📋 Creating order: ${command.side} ${command.quantity} ${command.symbol}`);
        const credential = await this.prisma.exchangeCredential.findUnique({
            where: { id: command.exchangeCredentialId },
        });
        const exchangeName = credential?.exchange || 'unknown';
        const order = await this.prisma.order.create({
            data: {
                userId: command.userId,
                exchangeCredentialId: command.exchangeCredentialId,
                exchange: exchangeName,
                symbol: command.symbol,
                side: command.side,
                type: command.type,
                quantity: command.quantity,
                price: command.price ?? null,
                stopLoss: command.stopLoss,
                takeProfit: command.takeProfit ?? null,
                status: 'PENDING',
                filledQuantity: 0,
                idempotencyKey: command.idempotencyKey,
                clientOrderId: command.clientOrderId ?? null,
                events: {
                    create: {
                        eventType: 'CREATED',
                        payload: JSON.stringify({
                            command: {
                                symbol: command.symbol,
                                side: command.side,
                                type: command.type,
                                quantity: command.quantity,
                                price: command.price,
                                stopLoss: command.stopLoss,
                                takeProfit: command.takeProfit,
                            },
                            ipAddress: command.ipAddress,
                            userAgent: command.userAgent,
                        }),
                    },
                },
            },
            include: { events: true },
        });
        await this.auditService.log({
            userId: command.userId,
            action: 'ORDER_CREATED',
            resource: 'order',
            details: JSON.stringify({
                orderId: order.id,
                symbol: command.symbol,
                side: command.side,
                type: command.type,
                quantity: command.quantity,
                stopLoss: command.stopLoss,
                idempotencyKey: command.idempotencyKey,
            }),
            ipAddress: command.ipAddress,
            userAgent: command.userAgent,
        });
        this.logger.log(`📋 Order created: ${order.id} — ${command.side} ${command.quantity} ${command.symbol}`);
        return order;
    }
    async updateOrderStatus(orderId, status, payload) {
        this.logger.debug(`📋 Updating order ${orderId} → ${status}`);
        const eventType = this._statusToEventType(status);
        await this.prisma.$transaction([
            this.prisma.order.update({
                where: { id: orderId },
                data: {
                    status: status,
                    ...(payload?.filledQuantity !== undefined && { filledQuantity: payload.filledQuantity }),
                    ...(payload?.averagePrice !== undefined && { averagePrice: payload.averagePrice }),
                    ...(payload?.fee !== undefined && { fee: payload.fee }),
                    ...(payload?.feeCurrency !== undefined && { feeCurrency: payload.feeCurrency }),
                    ...(payload?.exchangeOrderId !== undefined && { exchangeOrderId: payload.exchangeOrderId }),
                },
            }),
            this.prisma.orderEvent.create({
                data: {
                    orderId,
                    eventType: eventType,
                    payload: payload ? JSON.stringify(payload) : null,
                },
            }),
        ]);
        this.logger.log(`📋 Order ${orderId} → ${status} (event: ${eventType})`);
    }
    async rejectOrder(orderId, reason, failedCheck) {
        await this.prisma.$transaction([
            this.prisma.order.update({
                where: { id: orderId },
                data: { status: 'REJECTED' },
            }),
            this.prisma.orderEvent.create({
                data: {
                    orderId,
                    eventType: 'RISK_REJECTED',
                    payload: JSON.stringify({ reason, failedCheck }),
                },
            }),
        ]);
        this.logger.warn(`🛡️ Order ${orderId} REJECTED: ${reason}`);
    }
    async findOrderById(orderId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                events: {
                    orderBy: { timestamp: 'asc' },
                },
            },
        });
        if (!order) {
            throw new common_1.NotFoundException(`الطلب ${orderId} غير موجود`);
        }
        return order;
    }
    async findOrders(userId, filters) {
        const where = { userId };
        if (filters?.symbol)
            where.symbol = filters.symbol;
        if (filters?.status)
            where.status = filters.status;
        return this.prisma.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: filters?.limit || 50,
            include: {
                events: {
                    orderBy: { timestamp: 'desc' },
                    take: 5,
                },
            },
        });
    }
    async getOrderEvents(orderId) {
        return this.prisma.orderEvent.findMany({
            where: { orderId },
            orderBy: { timestamp: 'asc' },
        });
    }
    _statusToEventType(status) {
        const mapping = {
            PENDING: 'CREATED',
            ACCEPTED: 'ACCEPTED',
            PARTIALLY_FILLED: 'FILLED',
            FILLED: 'FILLED',
            CANCELLED: 'CANCELLED',
            REJECTED: 'RISK_REJECTED',
        };
        return mapping[status] || 'CREATED';
    }
};
exports.OrderStateManagerService = OrderStateManagerService;
exports.OrderStateManagerService = OrderStateManagerService = OrderStateManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], OrderStateManagerService);
//# sourceMappingURL=order-state-manager.service.js.map