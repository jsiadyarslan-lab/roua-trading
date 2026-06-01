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
var OrderLifecycleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderLifecycleService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const audit_service_1 = require("../../../audit/audit.service");
const base_adapter_interface_1 = require("../adapters/base-adapter.interface");
let OrderLifecycleService = OrderLifecycleService_1 = class OrderLifecycleService {
    constructor(prisma, auditService) {
        this.prisma = prisma;
        this.auditService = auditService;
        this.logger = new common_1.Logger(OrderLifecycleService_1.name);
        this.logger.log('🔄 Order Lifecycle Service initialized — execution state management active');
    }
    async handleExecutionResult(result, orderId, userId) {
        this.logger.debug(`🔄 Handling execution result for order ${orderId}: ${result.success ? 'SUCCESS' : 'FAILURE'}`);
        if (result.success) {
            await this._handleSuccess(result, orderId, userId);
        }
        else {
            await this._handleFailure(result, orderId, userId);
        }
    }
    async syncOrderFromExchange(orderId, exchangeOrderId, adapterStatus) {
        this.logger.debug(`🔄 Syncing order ${orderId} from exchange (status: ${adapterStatus})`);
        try {
            const order = await this.prisma.order.findUnique({
                where: { id: orderId },
            });
            if (!order) {
                this.logger.warn(`Order ${orderId} not found for sync`);
                return;
            }
            const newStatus = this._mapAdapterStatus(adapterStatus);
            if (order.status === newStatus) {
                return;
            }
            await this.prisma.$transaction([
                this.prisma.order.update({
                    where: { id: orderId },
                    data: {
                        status: newStatus,
                        exchangeOrderId,
                    },
                }),
                this.prisma.orderEvent.create({
                    data: {
                        orderId,
                        eventType: this._statusToEventType(newStatus),
                        payload: JSON.stringify({
                            source: 'SYNC_FROM_EXCHANGE',
                            previousStatus: order.status,
                            newStatus,
                            exchangeOrderId,
                            syncedAt: new Date().toISOString(),
                        }),
                    },
                }),
            ]);
            this.logger.log(`🔄 Order ${orderId} synced: ${order.status} → ${newStatus}`);
        }
        catch (error) {
            this.logger.error(`Failed to sync order ${orderId}: ${error.message}`);
        }
    }
    async _handleSuccess(result, orderId, userId) {
        const newStatus = result.status === base_adapter_interface_1.OrderExecutionStatus.FILLED
            ? 'FILLED'
            : result.status === base_adapter_interface_1.OrderExecutionStatus.PARTIALLY_FILLED
                ? 'PARTIALLY_FILLED'
                : 'ACCEPTED';
        await this.prisma.$transaction([
            this.prisma.order.update({
                where: { id: orderId },
                data: {
                    status: newStatus,
                    filledQuantity: result.filledQuantity || 0,
                    averagePrice: result.averagePrice,
                    fee: result.fee,
                    feeCurrency: result.feeCurrency,
                    exchangeOrderId: result.exchangeOrderId,
                },
            }),
            this.prisma.orderEvent.create({
                data: {
                    orderId,
                    eventType: newStatus === 'FILLED' ? 'FILLED' : 'ACCEPTED',
                    payload: JSON.stringify({
                        source: 'EXECUTION_RESULT',
                        exchangeOrderId: result.exchangeOrderId,
                        filledQuantity: result.filledQuantity,
                        averagePrice: result.averagePrice,
                        fee: result.fee,
                        feeCurrency: result.feeCurrency,
                        executedAt: new Date().toISOString(),
                    }),
                },
            }),
        ]);
        if (newStatus === 'FILLED' || newStatus === 'PARTIALLY_FILLED') {
            await this._updatePosition(orderId, result, userId);
        }
        await this.auditService.log({
            userId,
            action: `ORDER_${newStatus}`,
            resource: 'order-lifecycle',
            details: JSON.stringify({
                orderId,
                exchangeOrderId: result.exchangeOrderId,
                filledQuantity: result.filledQuantity,
                averagePrice: result.averagePrice,
                fee: result.fee,
            }),
        });
        this.logger.log(`✅ Order ${orderId} → ${newStatus} (fill: ${result.filledQuantity} @ ${result.averagePrice})`);
    }
    async _handleFailure(result, orderId, userId) {
        await this.prisma.$transaction([
            this.prisma.order.update({
                where: { id: orderId },
                data: {
                    status: 'REJECTED',
                    rejectReason: result.error || 'Execution failed',
                },
            }),
            this.prisma.orderEvent.create({
                data: {
                    orderId,
                    eventType: 'RISK_REJECTED',
                    payload: JSON.stringify({
                        source: 'EXECUTION_RESULT',
                        reason: result.error,
                        rejectedAt: new Date().toISOString(),
                    }),
                },
            }),
        ]);
        await this.auditService.log({
            userId,
            action: 'ORDER_REJECTED_BY_EXCHANGE',
            resource: 'order-lifecycle',
            details: JSON.stringify({
                orderId,
                reason: result.error,
            }),
        });
        this.logger.warn(`❌ Order ${orderId} → REJECTED: ${result.error}`);
    }
    async _updatePosition(orderId, result, userId) {
        if (!result.filledQuantity || result.filledQuantity <= 0)
            return;
        if (!result.averagePrice || result.averagePrice <= 0)
            return;
        try {
            const order = await this.prisma.order.findUnique({
                where: { id: orderId },
            });
            if (!order)
                return;
            const existingTrade = await this.prisma.trade.findFirst({
                where: { orderId },
            });
            if (existingTrade) {
                this.logger.debug(`📊 Order ${orderId} already has a trade record (id: ${existingTrade.id}) — skipping position update to prevent duplicate`);
                return;
            }
            await this.prisma.$transaction(async (tx) => {
                const existingPosition = await tx.position.findFirst({
                    where: {
                        userId,
                        symbol: order.symbol,
                        status: 'OPEN',
                        side: order.side,
                    },
                });
                if (existingPosition) {
                    const totalQuantity = Number(existingPosition.quantity) + (result.filledQuantity ?? 0);
                    const avgPrice = (Number(existingPosition.entryPrice) * Number(existingPosition.quantity) +
                        (result.averagePrice ?? 0) * (result.filledQuantity ?? 0)) /
                        totalQuantity;
                    await tx.position.update({
                        where: { id: existingPosition.id },
                        data: {
                            quantity: totalQuantity,
                            entryPrice: avgPrice,
                            currentPrice: result.averagePrice ?? 0,
                            stopLoss: Number(order.stopLoss) || existingPosition.stopLoss,
                            takeProfit: Number(order.takeProfit) || existingPosition.takeProfit,
                        },
                    });
                }
                else {
                    const credential = await tx.exchangeCredential.findUnique({
                        where: { id: order.exchangeCredentialId },
                    });
                    await tx.position.create({
                        data: {
                            userId,
                            credentialId: order.exchangeCredentialId,
                            exchange: credential?.exchange || order.exchange || 'unknown',
                            symbol: order.symbol,
                            side: order.side,
                            status: 'OPEN',
                            quantity: result.filledQuantity ?? 0,
                            entryPrice: result.averagePrice ?? 0,
                            currentPrice: result.averagePrice ?? 0,
                            highestPrice: result.averagePrice ?? 0,
                            lowestPrice: result.averagePrice ?? 0,
                            stopLoss: Number(order.stopLoss) || null,
                            takeProfit: Number(order.takeProfit) || null,
                            source: this._extractSourceFromClientOrderId(order.clientOrderId),
                        },
                    });
                }
                const credential = await tx.exchangeCredential.findUnique({
                    where: { id: order.exchangeCredentialId },
                });
                await tx.trade.create({
                    data: {
                        userId,
                        orderId,
                        exchange: credential?.exchange || order.exchange || 'unknown',
                        symbol: order.symbol,
                        side: order.side,
                        type: 'ENTRY',
                        quantity: result.filledQuantity,
                        price: result.averagePrice,
                        fee: result.fee || 0,
                        feeCurrency: result.feeCurrency,
                        source: this._extractSourceFromClientOrderId(order.clientOrderId),
                    },
                });
            }, {
                isolationLevel: 'Serializable',
            });
            this.logger.log(`📊 Position updated for ${order.symbol}: ${result.filledQuantity} @ ${result.averagePrice}`);
        }
        catch (error) {
            this.logger.error(`Failed to update position for order ${orderId}: ${error.message}`);
        }
    }
    _mapAdapterStatus(status) {
        const mapping = {
            [base_adapter_interface_1.OrderExecutionStatus.PENDING]: 'PENDING',
            [base_adapter_interface_1.OrderExecutionStatus.ACCEPTED]: 'ACCEPTED',
            [base_adapter_interface_1.OrderExecutionStatus.PARTIALLY_FILLED]: 'PARTIALLY_FILLED',
            [base_adapter_interface_1.OrderExecutionStatus.FILLED]: 'FILLED',
            [base_adapter_interface_1.OrderExecutionStatus.CANCELLED]: 'CANCELLED',
            [base_adapter_interface_1.OrderExecutionStatus.REJECTED]: 'REJECTED',
            [base_adapter_interface_1.OrderExecutionStatus.EXPIRED]: 'CANCELLED',
        };
        return mapping[status] || 'PENDING';
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
    _extractSourceFromClientOrderId(clientOrderId) {
        if (!clientOrderId)
            return 'user_manual';
        const knownSources = ['smart_executor', 'agent', 'auto_paper'];
        for (const src of knownSources) {
            if (clientOrderId.startsWith(src + '-'))
                return src;
        }
        return 'user_manual';
    }
};
exports.OrderLifecycleService = OrderLifecycleService;
exports.OrderLifecycleService = OrderLifecycleService = OrderLifecycleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], OrderLifecycleService);
//# sourceMappingURL=order-lifecycle.service.js.map