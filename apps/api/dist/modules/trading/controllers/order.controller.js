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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var OrderController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderController = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const idempotency_service_1 = require("../services/idempotency.service");
const risk_gatekeeper_service_1 = require("../services/risk-gatekeeper.service");
const order_state_manager_service_1 = require("../services/order-state-manager.service");
const position_manager_service_1 = require("../services/position-manager.service");
const order_producer_service_1 = require("../services/order-producer.service");
const auth_guard_1 = require("../../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
const order_events_1 = require("../events/order.events");
const place_order_dto_1 = require("./dtos/place-order.dto");
let OrderController = OrderController_1 = class OrderController {
    constructor(idempotencyService, riskGatekeeper, stateManager, positionManager, orderProducer, executionQueue) {
        this.idempotencyService = idempotencyService;
        this.riskGatekeeper = riskGatekeeper;
        this.stateManager = stateManager;
        this.positionManager = positionManager;
        this.orderProducer = orderProducer;
        this.executionQueue = executionQueue;
        this.logger = new common_1.Logger(OrderController_1.name);
        this.logger.log('📋 Order Controller initialized (with BullMQ execution_queue)');
    }
    async placeOrder(req, body) {
        const userId = req.user.id;
        this._validateOrderBusinessLogic(body);
        const isUnique = await this.idempotencyService.checkAndLock(body.idempotencyKey);
        if (!isUnique) {
            throw new common_1.ConflictException('تم استلام هذا الطلب مسبقاً. لا يمكن تكرار نفس idempotencyKey خلال 24 ساعة.');
        }
        const command = {
            userId,
            exchangeCredentialId: body.exchangeCredentialId,
            symbol: body.symbol,
            side: body.side === 'BUY' ? order_events_1.OrderSideEnum.BUY : order_events_1.OrderSideEnum.SELL,
            type: body.type === 'MARKET' ? order_events_1.OrderTypeEnum.MARKET : order_events_1.OrderTypeEnum.LIMIT,
            quantity: Number(body.quantity),
            price: body.price != null ? Number(body.price) : undefined,
            stopLoss: body.stopLoss != null ? Number(body.stopLoss) : 0,
            takeProfit: body.takeProfit != null ? Number(body.takeProfit) : undefined,
            idempotencyKey: body.idempotencyKey,
            clientOrderId: body.clientOrderId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        };
        let order;
        try {
            order = await this.stateManager.createOrder(command);
        }
        catch (error) {
            await this.idempotencyService.releaseLock(body.idempotencyKey);
            throw error;
        }
        const riskResult = await this.riskGatekeeper.validateOrder(command);
        if (!riskResult.allowed) {
            await this.stateManager.rejectOrder(order.id, riskResult.reason || 'فشل في فحص المخاطر', riskResult.failedCheck);
            await this.idempotencyService.releaseLock(body.idempotencyKey);
            throw new common_1.ForbiddenException(`🛡️ تم رفض الطلب: ${riskResult.reason}`);
        }
        await this.stateManager.updateOrderStatus(order.id, 'ACCEPTED', {
            riskScore: riskResult.riskScore,
            validatedAt: new Date().toISOString(),
        });
        const queueMessage = {
            orderId: order.id,
            userId: command.userId,
            exchangeCredentialId: command.exchangeCredentialId,
            symbol: command.symbol,
            side: command.side,
            type: command.type,
            quantity: command.quantity,
            price: command.price,
            stopLoss: command.stopLoss,
            takeProfit: command.takeProfit,
            clientOrderId: command.clientOrderId,
            idempotencyKey: command.idempotencyKey,
            submittedAt: new Date(),
        };
        let submittedViaRabbitMQ = false;
        try {
            await this.orderProducer.sendOrder(queueMessage);
            submittedViaRabbitMQ = true;
            this.logger.log(`📤 Order ${order.id} submitted to RabbitMQ order_queue`);
        }
        catch (rabbitError) {
            this.logger.warn(`RabbitMQ failed for ${order.id}: ${rabbitError.message} — trying BullMQ fallback`);
            try {
                if (!this.executionQueue) {
                    throw new Error('BullMQ execution_queue not available');
                }
                await this.executionQueue.add('execute', {
                    orderId: order.id,
                    userId: command.userId,
                    exchangeCredentialId: command.exchangeCredentialId,
                    symbol: command.symbol,
                    side: command.side,
                    type: command.type,
                    quantity: command.quantity,
                    price: command.price,
                    stopLoss: command.stopLoss,
                    takeProfit: command.takeProfit,
                    clientOrderId: command.clientOrderId,
                    idempotencyKey: command.idempotencyKey,
                }, {
                    jobId: command.idempotencyKey,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 5000,
                    },
                });
                this.logger.log(`📤 Order ${order.id} added to BullMQ execution_queue (fallback, jobId: ${command.idempotencyKey})`);
            }
            catch (bullError) {
                this.logger.error(`Both queues failed for order ${order.id}. Order is ACCEPTED but not submitted for execution. ` +
                    `RabbitMQ: ${rabbitError.message}, BullMQ: ${bullError.message}`);
            }
        }
        return {
            success: true,
            data: {
                orderId: order.id,
                status: 'ACCEPTED',
                idempotencyKey: body.idempotencyKey,
                riskScore: riskResult.riskScore,
            },
        };
    }
    async getOrders(req, symbol, status, limitStr) {
        const userId = req.user.id;
        const filters = {
            symbol,
            status,
            limit: limitStr ? parseInt(limitStr, 10) : undefined,
        };
        const orders = await this.stateManager.findOrders(userId, filters);
        return { success: true, data: orders };
    }
    async getOrder(req, orderId) {
        const order = await this.stateManager.findOrderById(orderId);
        if (!order) {
            throw new common_1.NotFoundException('الطلب غير موجود');
        }
        if (order.userId !== req.user.id) {
            throw new common_1.ForbiddenException('ليس لديك صلاحية الوصول لهذا الطلب');
        }
        return { success: true, data: order };
    }
    async cancelOrder(req, orderId) {
        const order = await this.stateManager.findOrderById(orderId);
        if (!order) {
            throw new common_1.NotFoundException('الطلب غير موجود');
        }
        if (order.userId !== req.user.id) {
            throw new common_1.ForbiddenException('ليس لديك صلاحية إلغاء هذا الطلب');
        }
        if (!['PENDING', 'ACCEPTED'].includes(order.status)) {
            throw new common_1.BadRequestException(`لا يمكن إلغاء طلب بحالة "${order.status}"`);
        }
        await this.stateManager.updateOrderStatus(orderId, 'CANCELLED', {
            cancelledBy: req.user.id,
            cancelledAt: new Date().toISOString(),
        });
        return {
            success: true,
            data: { orderId, status: 'CANCELLED' },
        };
    }
    async getOpenPositions(req) {
        const positions = await this.positionManager.getOpenPositions(req.user.id);
        return { success: true, data: positions };
    }
    async getPortfolioSummary(req) {
        const summary = await this.positionManager.getPortfolioSummary(req.user.id);
        return { success: true, data: summary };
    }
    _validateOrderBusinessLogic(body) {
        if (body.type === 'LIMIT' && !body.price) {
            throw new common_1.BadRequestException('سعر الحد مطلوب للطلبات المحددة (LIMIT)');
        }
        if (body.stopLoss !== undefined && body.stopLoss <= 0) {
            throw new common_1.BadRequestException('وقف الخسارة يجب أن يكون رقماً أكبر من صفر');
        }
        if (body.takeProfit !== undefined && body.takeProfit <= 0) {
            throw new common_1.BadRequestException('جني الأرباح يجب أن يكون رقماً أكبر من صفر');
        }
        if (!/^[A-Za-z0-9/_.-]+$/.test(body.symbol)) {
            throw new common_1.BadRequestException('رمز التداول يحتوي على أحرف غير صالحة');
        }
    }
};
exports.OrderController = OrderController;
__decorate([
    (0, common_1.Post)('orders'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, place_order_dto_1.PlaceOrderDto]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "placeOrder", null);
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('symbol')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "getOrders", null);
__decorate([
    (0, common_1.Get)('orders/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Delete)('orders/:id'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "cancelOrder", null);
__decorate([
    (0, common_1.Get)('positions'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "getOpenPositions", null);
__decorate([
    (0, common_1.Get)('portfolio'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "getPortfolioSummary", null);
exports.OrderController = OrderController = OrderController_1 = __decorate([
    (0, common_1.Controller)('trading/v2'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(5, (0, common_1.Optional)()),
    __param(5, (0, bullmq_1.InjectQueue)('execution_queue')),
    __metadata("design:paramtypes", [idempotency_service_1.IdempotencyService,
        risk_gatekeeper_service_1.RiskGatekeeperService,
        order_state_manager_service_1.OrderStateManagerService,
        position_manager_service_1.PositionManagerService,
        order_producer_service_1.OrderProducerService, Object])
], OrderController);
//# sourceMappingURL=order.controller.js.map