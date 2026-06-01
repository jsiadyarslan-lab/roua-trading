"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var OrderConsumerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderConsumerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const credentials_service_1 = require("../../portfolio/credentials/credentials.service");
const order_state_manager_service_1 = require("./order-state-manager.service");
const audit_service_1 = require("../../../audit/audit.service");
const notification_service_1 = require("../../notification/notification.service");
const ccxt = __importStar(require("ccxt"));
let OrderConsumerService = OrderConsumerService_1 = class OrderConsumerService {
    constructor(configService, prisma, credentialsService, stateManager, auditService, notificationService) {
        this.configService = configService;
        this.prisma = prisma;
        this.credentialsService = credentialsService;
        this.stateManager = stateManager;
        this.auditService = auditService;
        this.notificationService = notificationService;
        this.logger = new common_1.Logger(OrderConsumerService_1.name);
        this.connection = null;
        this.channel = null;
        this.queueName = 'order_queue';
        this.rabbitAvailable = false;
    }
    async onModuleInit() {
        const rabbitUrl = this.configService.get('RABBITMQ_URL');
        if (!rabbitUrl) {
            this.logger.warn('🐰 Consumer: RABBITMQ_URL not configured — direct execution mode only');
            return;
        }
        try {
            const CONNECT_TIMEOUT_MS = 5_000;
            await Promise.race([
                this._connect(rabbitUrl),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`RabbitMQ connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)), CONNECT_TIMEOUT_MS)),
            ]);
            this.rabbitAvailable = true;
            this.logger.log('🐰 Order Consumer connected — listening on order_queue');
        }
        catch (error) {
            this.logger.warn(`🐰 Consumer: RabbitMQ connection failed: ${error.message}`);
        }
    }
    async onModuleDestroy() {
        try {
            if (this.channel)
                await this.channel.close();
            if (this.connection)
                await this.connection.close();
        }
        catch {
        }
    }
    async processOrder(message) {
        this.logger.log(`⚙️ Processing order: ${message.orderId} (${message.side} ${message.quantity} ${message.symbol})`);
        try {
            const order = await this.prisma.order.findUnique({
                where: { id: message.orderId },
            });
            if (!order) {
                return { success: false, error: 'الطلب غير موجود' };
            }
            if (order.status !== 'ACCEPTED' && order.status !== 'PENDING') {
                return { success: false, error: `حالة الطلب "${order.status}" لا تسمح بالتنفيذ` };
            }
            const credential = await this.prisma.exchangeCredential.findUnique({
                where: { id: message.exchangeCredentialId },
            });
            if (!credential || !credential.isValid) {
                await this.stateManager.updateOrderStatus(message.orderId, 'REJECTED', {
                    reason: 'بيانات الاعتماد غير صالحة',
                });
                return { success: false, error: 'بيانات الاعتماد غير صالحة' };
            }
            const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(credential.id, message.userId);
            if (credential.exchange === 'paper-trading') {
                this.logger.log(`📝 Order ${message.orderId} is paper-trading — skipping CCXT execution`);
                await this.stateManager.updateOrderStatus(message.orderId, 'FILLED', {
                    filledQuantity: message.quantity,
                    averagePrice: message.price ?? 0,
                    filledAt: new Date().toISOString(),
                });
                await this._updatePosition(message, message.quantity, message.price ?? 0);
                return {
                    success: true,
                    filledQuantity: message.quantity,
                    averagePrice: message.price ?? 0,
                };
            }
            let exchangeName = credential.exchange;
            const testSuffixes = ['_test', '_paper', '_demo', '_sandbox', '_simulation'];
            for (const suffix of testSuffixes) {
                if (exchangeName.toLowerCase().endsWith(suffix)) {
                    exchangeName = exchangeName.slice(0, -suffix.length);
                    this.logger.debug(`🔧 Resolved exchange "${credential.exchange}" → "${exchangeName}" for CCXT`);
                    break;
                }
            }
            const ExchangeClass = ccxt[exchangeName];
            if (!ExchangeClass) {
                await this.stateManager.updateOrderStatus(message.orderId, 'REJECTED', {
                    reason: `البورصة "${credential.exchange}" غير مدعومة`,
                });
                return { success: false, error: `البورصة "${credential.exchange}" غير مدعومة` };
            }
            const exchange = new ExchangeClass({
                apiKey,
                secret: apiSecret,
                enableRateLimit: true,
            });
            await this.stateManager.updateOrderStatus(message.orderId, 'ACCEPTED', {
                event: 'SENT_TO_EXCHANGE',
                sentAt: new Date().toISOString(),
            });
            let result;
            try {
                if (message.type === 'MARKET') {
                    result = await exchange.createMarketOrder(message.symbol, message.side.toLowerCase(), message.quantity);
                }
                else if (message.type === 'LIMIT') {
                    result = await exchange.createLimitOrder(message.symbol, message.side.toLowerCase(), message.quantity, message.price);
                }
                const filledQuantity = result?.filled || message.quantity;
                const averagePrice = result?.average || result?.price || message.price;
                await this.stateManager.updateOrderStatus(message.orderId, 'FILLED', {
                    filledQuantity,
                    averagePrice,
                    exchangeOrderId: result?.id,
                    fee: result?.fee?.cost,
                    feeCurrency: result?.fee?.currency,
                    filledAt: new Date().toISOString(),
                });
                await this._updatePosition(message, filledQuantity, averagePrice);
                await this.auditService.log({
                    userId: message.userId,
                    action: 'ORDER_EXECUTED',
                    resource: 'order',
                    details: JSON.stringify({
                        orderId: message.orderId,
                        symbol: message.symbol,
                        side: message.side,
                        filledQuantity,
                        averagePrice,
                        exchangeOrderId: result?.id,
                    }),
                });
                this.logger.log(`✅ Order executed: ${message.orderId} — ${message.side} ${filledQuantity}/${message.quantity} ${message.symbol} @ ${averagePrice}`);
                if (this.notificationService) {
                    this.notificationService.sendNotification({
                        userId: message.userId,
                        type: 'ORDER_FILLED',
                        priority: 'HIGH',
                        title: `تم تنفيذ أمر ${message.side === 'BUY' ? 'شراء' : 'بيع'} ${message.symbol}`,
                        body: `تم تنفيذ ${filledQuantity} ${message.symbol} بسعر ${averagePrice}`,
                        data: {
                            orderId: message.orderId,
                            symbol: message.symbol,
                            side: message.side,
                            quantity: filledQuantity,
                            averagePrice,
                            exchangeOrderId: result?.id,
                        },
                        source: 'trade',
                        action: message.side === 'BUY' ? 'BUY' : 'SELL',
                        pair: message.symbol,
                    }).catch((e) => this.logger.warn(`Notification push failed: ${e.message}`));
                }
                return {
                    success: true,
                    filledQuantity,
                    averagePrice,
                    exchangeOrderId: result?.id,
                };
            }
            catch (error) {
                const errorMessage = error.message || 'Unknown error';
                await this.stateManager.updateOrderStatus(message.orderId, 'REJECTED', {
                    reason: errorMessage,
                    rejectedAt: new Date().toISOString(),
                });
                if (this.notificationService) {
                    this.notificationService.sendNotification({
                        userId: message.userId,
                        type: 'ORDER_REJECTED',
                        priority: 'HIGH',
                        title: `تم رفض أمر ${message.side === 'BUY' ? 'شراء' : 'بيع'} ${message.symbol}`,
                        body: `السبب: ${errorMessage.substring(0, 150)}`,
                        data: {
                            orderId: message.orderId,
                            symbol: message.symbol,
                            side: message.side,
                            reason: errorMessage,
                        },
                        source: 'trade',
                        action: 'WARN',
                        pair: message.symbol,
                    }).catch((e) => this.logger.warn(`Notification push failed: ${e.message}`));
                }
                this.logger.error(`❌ Order execution failed: ${message.orderId} — ${errorMessage}`);
                return { success: false, error: errorMessage };
            }
        }
        catch (error) {
            this.logger.error(`Order processing error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    async _updatePosition(message, filledQuantity, fillPrice) {
        if (filledQuantity <= 0)
            return;
        try {
            await this.prisma.$transaction(async (tx) => {
                const credential = await tx.exchangeCredential.findUnique({
                    where: { id: message.exchangeCredentialId },
                });
                if (!credential)
                    return;
                if (credential.userId !== message.userId) {
                    this.logger.error(`🐰 SECURITY: User ${message.userId} attempted to use credential ${message.exchangeCredentialId} owned by ${credential.userId}`);
                    return;
                }
                const existingPosition = await tx.position.findFirst({
                    where: {
                        userId: message.userId,
                        symbol: message.symbol,
                        status: 'OPEN',
                        side: message.side,
                    },
                });
                if (existingPosition) {
                    const totalQuantity = Number(existingPosition.quantity) + filledQuantity;
                    const avgPrice = (Number(existingPosition.entryPrice) * Number(existingPosition.quantity) +
                        fillPrice * filledQuantity) /
                        totalQuantity;
                    await tx.position.update({
                        where: { id: existingPosition.id },
                        data: {
                            quantity: totalQuantity,
                            entryPrice: avgPrice,
                            stopLoss: message.stopLoss,
                            takeProfit: message.takeProfit,
                        },
                    });
                }
                else {
                    await tx.position.create({
                        data: {
                            userId: message.userId,
                            credentialId: message.exchangeCredentialId,
                            exchange: credential.exchange,
                            symbol: message.symbol,
                            side: message.side,
                            status: 'OPEN',
                            quantity: filledQuantity,
                            entryPrice: fillPrice,
                            currentPrice: fillPrice,
                            highestPrice: fillPrice,
                            lowestPrice: fillPrice,
                            stopLoss: message.stopLoss,
                            takeProfit: message.takeProfit,
                            source: message.source || (credential.exchange === 'paper-trading' ? 'auto_paper' : 'user_manual'),
                        },
                    });
                }
                await tx.trade.create({
                    data: {
                        userId: message.userId,
                        exchange: credential.exchange,
                        symbol: message.symbol,
                        side: message.side,
                        type: 'ENTRY',
                        quantity: filledQuantity,
                        price: fillPrice,
                        source: message.source || (credential.exchange === 'paper-trading' ? 'auto_paper' : 'user_manual'),
                    },
                });
            }, {
                isolationLevel: 'Serializable',
            });
        }
        catch (error) {
            this.logger.error(`🐰 Position update transaction failed for order ${message.orderId}: ${error.message}`);
            try {
                await this.prisma.positionReconciliation.upsert({
                    where: { orderId: message.orderId },
                    create: {
                        orderId: message.orderId,
                        userId: message.userId,
                        exchangeCredentialId: message.exchangeCredentialId,
                        symbol: message.symbol,
                        side: message.side,
                        filledQuantity: filledQuantity,
                        fillPrice: fillPrice,
                        stopLoss: message.stopLoss,
                        takeProfit: message.takeProfit,
                        status: 'PENDING',
                        lastError: error.message?.substring(0, 500),
                    },
                    update: {
                        attempts: { increment: 1 },
                        lastAttemptAt: new Date(),
                        lastError: error.message?.substring(0, 500),
                        status: 'PENDING',
                    },
                });
                this.logger.log(`🐰 Position reconciliation record created for order ${message.orderId} — will be retried by background job`);
            }
            catch (reconError) {
                this.logger.error(`🐰 CRITICAL: Failed to write reconciliation record for order ${message.orderId}: ${reconError.message}`);
            }
        }
    }
    async _connect(url) {
        const amqp = await Promise.resolve().then(() => __importStar(require('amqplib')));
        this.connection = await amqp.connect(url, { timeout: 5000 });
        this.connection.on('error', () => {
            this.rabbitAvailable = false;
        });
        this.connection.on('close', () => {
            this.rabbitAvailable = false;
        });
        this.channel = await this.connection.createChannel();
        await this.channel.assertQueue(this.queueName, { durable: true });
        this.channel.prefetch(1);
        await this.channel.consume(this.queueName, async (msg) => {
            if (!msg)
                return;
            try {
                const content = JSON.parse(msg.content.toString());
                this.logger.debug(`🐰 Consuming order: ${content.orderId}`);
                const result = await this.processOrder(content);
                if (result.success) {
                    this.channel.ack(msg);
                }
                else {
                    const transientErrors = ['Network', 'timeout', 'ETIMEDOUT', 'ECONNRESET'];
                    const isTransient = transientErrors.some((e) => result.error?.includes(e));
                    if (isTransient) {
                        this.channel.nack(msg, false, true);
                    }
                    else {
                        this.channel.ack(msg);
                    }
                }
            }
            catch (error) {
                this.logger.error(`🐰 Message processing error: ${error.message}`);
                this.channel.nack(msg, false, false);
            }
        });
    }
};
exports.OrderConsumerService = OrderConsumerService;
exports.OrderConsumerService = OrderConsumerService = OrderConsumerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        credentials_service_1.CredentialsService,
        order_state_manager_service_1.OrderStateManagerService,
        audit_service_1.AuditService,
        notification_service_1.NotificationService])
], OrderConsumerService);
//# sourceMappingURL=order-consumer.service.js.map