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
var OrderQueueProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderQueueProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const execution_gateway_service_1 = require("../gateways/execution-gateway.service");
const order_lifecycle_service_1 = require("./order-lifecycle.service");
const connection_resilience_service_1 = require("./connection-resilience.service");
const rate_limiter_service_1 = require("./rate-limiter.service");
const audit_service_1 = require("../../../audit/audit.service");
let OrderQueueProcessor = OrderQueueProcessor_1 = class OrderQueueProcessor extends bullmq_1.WorkerHost {
    constructor(prisma, gatewayService, lifecycleService, resilienceService, rateLimiter, auditService) {
        super();
        this.prisma = prisma;
        this.gatewayService = gatewayService;
        this.lifecycleService = lifecycleService;
        this.resilienceService = resilienceService;
        this.rateLimiter = rateLimiter;
        this.auditService = auditService;
        this.logger = new common_1.Logger(OrderQueueProcessor_1.name);
        this.logger.log('⚙️ Order Queue Processor initialized — ready to process execution jobs');
    }
    async process(job, token) {
        const { orderId, userId, exchangeCredentialId, symbol, side, type, quantity, price, stopLoss, takeProfit, idempotencyKey, clientOrderId, source } = job.data;
        this.logger.log(`⚙️ Processing execution job: ${orderId} (${side} ${quantity} ${symbol}) — attempt ${job.attemptsStarted || 1}`);
        try {
            const order = await this.prisma.order.findUnique({
                where: { id: orderId },
            });
            if (!order) {
                return { success: false, error: 'الطلب غير موجود' };
            }
            if (order.status !== 'ACCEPTED' && order.status !== 'PENDING') {
                this.logger.warn(`⚙️ Order ${orderId} is in state "${order.status}" — skipping execution`);
                return { success: false, error: `حالة الطلب "${order.status}" لا تسمح بالتنفيذ` };
            }
            const credential = await this.prisma.exchangeCredential.findUnique({
                where: { id: exchangeCredentialId },
            });
            if (!credential) {
                return { success: false, error: 'بيانات الاعتماد غير موجودة' };
            }
            if (credential.userId !== userId) {
                this.logger.error(`⚙️ SECURITY: User ${userId} attempted to execute order with credential ${exchangeCredentialId} owned by ${credential.userId}`);
                return { success: false, error: 'بيانات الاعتماد لا تنتمي لحسابك' };
            }
            const exchange = order.exchange || 'unknown';
            const withinLimits = await this.rateLimiter.checkRateLimit(exchange, userId);
            if (!withinLimits) {
                throw new Error(`Rate limit exceeded for ${exchange} — will retry`);
            }
            const unifiedOrder = {
                id: orderId,
                userId,
                exchangeCredentialId,
                symbol,
                side: side,
                type: type,
                quantity,
                price,
                stopLoss,
                takeProfit,
                idempotencyKey,
                clientOrderId,
                source,
            };
            await this.prisma.orderEvent.create({
                data: {
                    orderId,
                    eventType: 'SENT_TO_EXCHANGE',
                    payload: JSON.stringify({
                        source: 'QUEUE_PROCESSOR',
                        jobId: job.id,
                        attempt: job.attemptsStarted || 1,
                        sentAt: new Date().toISOString(),
                    }),
                },
            });
            const result = await this.gatewayService.placeOrder(userId, unifiedOrder);
            await this.lifecycleService.handleExecutionResult(result, orderId, userId);
            if (result.success && result.exchangeOrderId) {
                await this.resilienceService.watchOrder({
                    id: orderId,
                    userId,
                    exchangeCredentialId,
                    symbol,
                    exchangeOrderId: result.exchangeOrderId,
                });
            }
            await this.auditService.log({
                userId,
                action: result.success ? 'ORDER_EXECUTED_VIA_QUEUE' : 'ORDER_EXECUTION_FAILED_VIA_QUEUE',
                resource: 'execution-queue',
                details: JSON.stringify({
                    orderId,
                    symbol,
                    side,
                    type,
                    quantity,
                    jobId: job.id,
                    success: result.success,
                    exchangeOrderId: result.exchangeOrderId,
                    filledQuantity: result.filledQuantity,
                    averagePrice: result.averagePrice,
                    error: result.error,
                }),
            });
            return {
                success: result.success,
                exchangeOrderId: result.exchangeOrderId,
                filledQuantity: result.filledQuantity,
                averagePrice: result.averagePrice,
                error: result.error,
            };
        }
        catch (error) {
            this.logger.error(`⚙️ Execution job failed: ${orderId} — ${error.message}`);
            const isTransient = this._isTransientError(error);
            if (!isTransient) {
                await this.lifecycleService.handleExecutionResult({
                    success: false,
                    error: error.message,
                    timestamp: new Date(),
                }, orderId, userId);
            }
            throw error;
        }
    }
    _isTransientError(error) {
        const message = error.message || '';
        const transientPatterns = [
            'Rate limit',
            'Network',
            'timeout',
            'ETIMEDOUT',
            'ECONNRESET',
            'ECONNREFUSED',
            'ENOTFOUND',
            'socket hang up',
            'internal server error',
            '502',
            '503',
            '504',
            'Service Unavailable',
            'Too Many Requests',
            '429',
        ];
        return transientPatterns.some((pattern) => message.toLowerCase().includes(pattern.toLowerCase()));
    }
};
exports.OrderQueueProcessor = OrderQueueProcessor;
exports.OrderQueueProcessor = OrderQueueProcessor = OrderQueueProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('execution_queue', {
        concurrency: 5,
    }),
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        execution_gateway_service_1.ExecutionGatewayService,
        order_lifecycle_service_1.OrderLifecycleService,
        connection_resilience_service_1.ConnectionResilienceService,
        rate_limiter_service_1.RateLimiterService,
        audit_service_1.AuditService])
], OrderQueueProcessor);
//# sourceMappingURL=order-queue.processor.js.map