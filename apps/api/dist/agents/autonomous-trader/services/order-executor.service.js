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
var OrderExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderExecutorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const audit_service_1 = require("../../../audit/audit.service");
const trading_service_1 = require("../../../modules/trading/trading.service");
const exchange_service_1 = require("../../../modules/exchange/exchange.service");
const trading_types_1 = require("../../../modules/trading/trading.types");
const order_dispatcher_service_1 = require("../../../modules/trading/services/order-dispatcher.service");
const exposure_manager_service_1 = require("../../../modules/trading/services/exposure-manager.service");
const credentials_service_1 = require("../../../modules/portfolio/credentials/credentials.service");
let OrderExecutorService = OrderExecutorService_1 = class OrderExecutorService {
    constructor(prisma, redis, audit, tradingService, orderDispatcher, exposureManager, exchangeService, credentialsService) {
        this.prisma = prisma;
        this.redis = redis;
        this.audit = audit;
        this.tradingService = tradingService;
        this.orderDispatcher = orderDispatcher;
        this.exposureManager = exposureManager;
        this.exchangeService = exchangeService;
        this.credentialsService = credentialsService;
        this.logger = new common_1.Logger(OrderExecutorService_1.name);
        this.MAX_SLIPPAGE_PERCENT = 1.0;
        this.recentOrders = new Map();
        this.cleanupInterval = null;
        this.logger.log('⚡ Order Executor initialized — safe execution ready');
        this.cleanupInterval = setInterval(() => this._cleanupOldOrders(), 5 * 60 * 1000);
    }
    onModuleDestroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            this.logger.log('⚡ Order Executor cleanup interval cleared');
        }
    }
    async execute(userId, signal, risk, credentialId) {
        const startTime = Date.now();
        const idempotencyKey = `${userId}-${signal.id}`;
        if (!this.orderDispatcher) {
            return {
                success: false,
                error: 'نظام التنفيذ غير متاح حالياً — يرجى المحاولة لاحقاً',
                executionTimeMs: Date.now() - startTime,
            };
        }
        this.logger.log(`⚡ Executing: ${signal.action} ${risk.positionSize.toFixed(6)} ${signal.symbol} ` +
            `@ ${signal.entryPrice} (SL: ${signal.stopLoss}, TP: ${signal.takeProfit})`);
        try {
            const existingPosition = await this.prisma.position.findFirst({
                where: { userId, symbol: signal.symbol, status: 'OPEN', source: 'agent' },
            });
            if (existingPosition) {
                this.logger.warn(`⚡ ORDER REJECTED: Agent already has position for ${signal.symbol} ` +
                    `(existing: ${existingPosition.side})`);
                return {
                    success: false,
                    error: `يوجد مركز خاص بالوكيل لـ ${signal.symbol} (${existingPosition.side}) — لا يمكن فتح مركز آخر`,
                    executionTimeMs: Date.now() - startTime,
                };
            }
            if (this._isDuplicateOrder(userId, signal.symbol, signal.action)) {
                return {
                    success: false,
                    error: 'أمر مكرر — تم تقديم أمر مشابه مؤخراً',
                    executionTimeMs: Date.now() - startTime,
                };
            }
            if (!signal.stopLoss || signal.stopLoss <= 0) {
                this.logger.error('⚡ ORDER REJECTED: No stop-loss');
                return {
                    success: false,
                    error: 'وقف الخسارة إجباري — لا يمكن تنفيذ أمر بدون وقف خسارة',
                    executionTimeMs: Date.now() - startTime,
                };
            }
            const credential = await this.prisma.exchangeCredential.findFirst({
                where: { id: credentialId, userId },
            });
            if (credential && credential.exchange === 'paper-trading') {
                this.logger.log(`⚡ Paper trading mode — routing through TradingService for ${signal.action} ${signal.symbol}`);
                let executionPrice = signal.entryPrice;
                try {
                    const liveQuote = await this.exchangeService.getQuote(signal.symbol);
                    if (liveQuote && liveQuote.price && liveQuote.price > 0) {
                        const slippagePercent = 0.01 + Math.random() * 0.04;
                        const slippageDirection = signal.action === 'BUY' ? 1 : -1;
                        executionPrice = liveQuote.price * (1 + slippageDirection * slippagePercent / 100);
                        this.logger.log(`⚡ Paper trade using live price: ${liveQuote.price.toFixed(2)} → execution: ${executionPrice.toFixed(2)}`);
                    }
                }
                catch (quoteErr) {
                    this.logger.warn(`⚡ Could not get live quote for ${signal.symbol}: ${quoteErr.message} — using signal price`);
                }
                if (!executionPrice || executionPrice <= 0) {
                    return {
                        success: false,
                        error: `سعر التنفيذ غير صالح (${executionPrice}) لـ ${signal.symbol} — تم إلغاء الأمر`,
                        executionTimeMs: Date.now() - startTime,
                    };
                }
                const tradeValue = risk.positionSize * executionPrice;
                if (tradeValue < 1) {
                    return {
                        success: false,
                        error: `قيمة الصفقة صغيرة جداً ($${tradeValue.toFixed(4)}) — تم الإلغاء`,
                        executionTimeMs: Date.now() - startTime,
                    };
                }
                try {
                    const orderRequest = {
                        credentialId,
                        symbol: signal.symbol,
                        side: signal.action,
                        type: signal.type,
                        quantity: risk.positionSize,
                        price: executionPrice,
                        stopLoss: signal.stopLoss,
                        takeProfit: signal.takeProfit,
                        source: 'agent',
                        idempotencyKey,
                    };
                    const dispatchResult = await this.orderDispatcher.submitOrder({
                        source: 'agent',
                        userId,
                        credentialId: orderRequest.credentialId,
                        symbol: orderRequest.symbol,
                        side: orderRequest.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
                        quantity: orderRequest.quantity,
                        price: orderRequest.price || 0,
                        stopLoss: orderRequest.stopLoss,
                        takeProfit: orderRequest.takeProfit,
                        signalId: signal?.id,
                        briefId: signal?.metadata?.briefId ?? null,
                        isPaperTrading: true,
                        timeframe: signal?.timeframe,
                    });
                    if (!dispatchResult.success) {
                        throw new Error(dispatchResult.error || dispatchResult.message || 'فشل الموزع');
                    }
                    const order = { id: dispatchResult.orderId || 'unknown' };
                    const executionTimeMs = Date.now() - startTime;
                    const calculatedSlippage = this._calculateSlippage(signal.entryPrice, executionPrice, signal.action);
                    this.recentOrders.set(`${userId}:${signal.symbol}:${signal.action}`, new Date());
                    try {
                        await this.prisma.autonomousTrade.create({
                            data: {
                                userId,
                                agentRunId: `run-${userId}-${signal.strategy}`,
                                symbol: signal.symbol,
                                side: signal.action,
                                orderType: signal.type,
                                strategy: signal.strategy,
                                status: 'FILLED',
                                entryPrice: executionPrice,
                                stopLoss: signal.stopLoss,
                                takeProfit: signal.takeProfit,
                                quantity: risk.positionSize,
                                filledQuantity: risk.positionSize,
                                pnl: null,
                                fee: executionPrice * risk.positionSize * 0.001,
                                feeCurrency: 'USD',
                                riskScore: risk.riskScore,
                                confidence: signal.confidence,
                                riskRewardRatio: risk.riskRewardRatio,
                                reasoning: signal.reasoning,
                                signalData: JSON.stringify(signal.metadata || {}),
                                metadata: JSON.stringify({
                                    paperTrading: true,
                                    executionTimeMs,
                                    orderId: order.id,
                                }),
                                execution: JSON.stringify({
                                    success: true,
                                    paperTrading: true,
                                    orderId: order.id,
                                    filledQuantity: risk.positionSize,
                                    averagePrice: executionPrice,
                                    slippage: calculatedSlippage,
                                    executionTimeMs,
                                }),
                                credentialId,
                                exchangeOrderId: null,
                                openedAt: new Date(),
                            },
                        });
                    }
                    catch (tradeErr) {
                        this.logger.error(`Failed to record AutonomousTrade: ${tradeErr.message}`);
                    }
                    this.recentOrders.set(`${userId}:${signal.symbol}:${signal.action}`, new Date());
                    await this.audit?.log({
                        userId,
                        action: 'AGENT_PAPER_TRADE_EXECUTED',
                        resource: 'autonomous-trader',
                        details: JSON.stringify({
                            orderId: order.id,
                            symbol: signal.symbol,
                            side: signal.action,
                            quantity: risk.positionSize,
                            executionPrice,
                            stopLoss: signal.stopLoss,
                            takeProfit: signal.takeProfit,
                            strategy: signal.strategy,
                            paperTrading: true,
                        }),
                    });
                    this.logger.log(`✅ Paper order executed: ${signal.action} ${risk.positionSize} ${signal.symbol} ` +
                        `@ ${executionPrice.toFixed(2)} via TradingService (order: ${order.id})`);
                    return {
                        success: true,
                        orderId: order.id,
                        exchangeOrderId: undefined,
                        filledQuantity: risk.positionSize,
                        averagePrice: executionPrice,
                        fee: executionPrice * risk.positionSize * 0.001,
                        feeCurrency: 'USD',
                        slippage: calculatedSlippage,
                        executionTimeMs,
                    };
                }
                catch (orderErr) {
                    const executionTimeMs = Date.now() - startTime;
                    this.logger.error(`⚡ TradingService.placeOrder failed for paper trade: ${orderErr.message}`);
                    const isDuplicate = orderErr.message?.includes('Unique constraint') ||
                        orderErr.message?.includes('P2002') ||
                        orderErr.message?.includes('already has an open position');
                    return {
                        success: false,
                        error: isDuplicate
                            ? `يوجد مركز مفتوح بالفعل لـ ${signal.symbol} — لا يمكن فتح مركز آخر`
                            : `فشل تنفيذ الصفقة الورقية: ${orderErr.message}`,
                        executionTimeMs,
                    };
                }
            }
            if (!credential || !credential.isValid) {
                return {
                    success: false,
                    error: 'بيانات الاعتماد غير صالحة',
                    executionTimeMs: Date.now() - startTime,
                };
            }
            const permissions = JSON.parse(credential.permissions || '["read"]');
            if (!permissions.includes('trade')) {
                return {
                    success: false,
                    error: 'مفتاح API لا يملك صلاحية التداول — لا يمكن سحب الأموال',
                    executionTimeMs: Date.now() - startTime,
                };
            }
            const isSpotExchange = credential.exchange !== 'paper-trading' &&
                !credential.testnet &&
                credential.exchange !== 'alpaca';
            if (isSpotExchange && signal.action === 'SELL') {
                this.logger.warn(`⚡ V147 ORDER REJECTED: SELL ${signal.symbol} on spot exchange ${credential.exchange} — short selling requires margin/futures`);
                return {
                    success: false,
                    error: `بيع ${signal.symbol} غير ممكن على حساب سبوت (${credential.exchange}) — يحتاج حساب مارجن/فيوتشر للبيع على المكشوف`,
                    executionTimeMs: Date.now() - startTime,
                };
            }
            try {
                const balanceCheck = await this._checkSufficientBalance(credential, signal.symbol, signal.action, risk.positionSize, signal.entryPrice);
                if (!balanceCheck.sufficient) {
                    this.logger.warn(`⚡ V150 ORDER REJECTED: Insufficient balance for ${signal.action} ${risk.positionSize} ${signal.symbol} ` +
                        `on ${credential.exchange} — need $${balanceCheck.required.toFixed(2)}, have $${balanceCheck.available.toFixed(2)}`);
                    return {
                        success: false,
                        error: `رصيد غير كافي في ${credential.exchange} — يحتاج $${balanceCheck.required.toFixed(2)}، المتاح $${balanceCheck.available.toFixed(2)}`,
                        executionTimeMs: Date.now() - startTime,
                    };
                }
            }
            catch (balanceErr) {
                this.logger.warn(`⚡ V150: Pre-trade balance check failed for ${credential.exchange}: ${balanceErr.message} — proceeding with order submission`);
            }
            const orderRequest = {
                credentialId,
                symbol: signal.symbol,
                side: signal.action,
                type: signal.type,
                quantity: risk.positionSize,
                price: signal.type === trading_types_1.OrderType.LIMIT ? signal.entryPrice : undefined,
                stopLoss: signal.stopLoss,
                takeProfit: signal.takeProfit,
                idempotencyKey,
            };
            const dispatchResult = await this.orderDispatcher.submitOrder({
                source: 'agent',
                userId,
                credentialId: orderRequest.credentialId,
                symbol: orderRequest.symbol,
                side: orderRequest.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
                quantity: orderRequest.quantity,
                price: typeof orderRequest.price === 'number' ? orderRequest.price : undefined,
                stopLoss: orderRequest.stopLoss,
                takeProfit: orderRequest.takeProfit,
                signalId: signal?.id,
                isPaperTrading: false,
                timeframe: signal?.timeframe,
            });
            if (!dispatchResult.success) {
                throw new Error(dispatchResult.error || dispatchResult.message || 'فشل الموزع');
            }
            const order = { id: dispatchResult.orderId || 'unknown', filledQuantity: orderRequest.quantity, averagePrice: orderRequest.price || 0, fee: 0, feeCurrency: 'USD', exchangeOrderId: null };
            const executionTimeMs = Date.now() - startTime;
            this.recentOrders.set(`${userId}:${signal.symbol}:${signal.action}`, new Date());
            await this.audit?.log({
                userId,
                action: 'AGENT_TRADE_EXECUTED',
                resource: 'autonomous-trader',
                details: JSON.stringify({
                    orderId: order.id,
                    symbol: signal.symbol,
                    side: signal.action,
                    type: signal.type,
                    quantity: risk.positionSize,
                    entryPrice: signal.entryPrice,
                    stopLoss: signal.stopLoss,
                    takeProfit: signal.takeProfit,
                    confidence: signal.confidence,
                    strategy: signal.strategy,
                    riskScore: risk.riskScore,
                    riskRewardRatio: risk.riskRewardRatio,
                    executionTimeMs,
                    reasoning: signal.reasoning,
                }),
            });
            try {
                await this.prisma.autonomousTrade.create({
                    data: {
                        userId,
                        agentRunId: `run-${userId}-${signal.strategy}`,
                        symbol: signal.symbol,
                        side: signal.action,
                        orderType: signal.type,
                        strategy: signal.strategy,
                        status: 'FILLED',
                        entryPrice: signal.entryPrice,
                        stopLoss: signal.stopLoss,
                        takeProfit: signal.takeProfit,
                        quantity: risk.positionSize,
                        filledQuantity: Number(order.filledQuantity) || risk.positionSize,
                        pnl: null,
                        fee: Number(order.fee) || 0,
                        feeCurrency: order.feeCurrency || 'USD',
                        riskScore: risk.riskScore,
                        confidence: signal.confidence,
                        riskRewardRatio: risk.riskRewardRatio,
                        reasoning: signal.reasoning,
                        signalData: JSON.stringify(signal.metadata || {}),
                        metadata: JSON.stringify({ orderId: order.id, executionTimeMs }),
                        execution: JSON.stringify({
                            success: true,
                            orderId: order.id,
                            exchangeOrderId: order.exchangeOrderId,
                            filledQuantity: Number(order.filledQuantity) || risk.positionSize,
                            averagePrice: Number(order.averagePrice) || signal.entryPrice,
                            fee: Number(order.fee) || 0,
                            slippage: this._calculateSlippage(signal.entryPrice, Number(order.averagePrice) || signal.entryPrice, signal.action),
                            executionTimeMs,
                        }),
                        credentialId,
                        exchangeOrderId: null,
                        openedAt: new Date(),
                    },
                });
            }
            catch (tradeErr) {
                this.logger.error(`Failed to record AutonomousTrade: ${tradeErr.message}`);
            }
            this.logger.log(`✅ Order executed: ${order.id} — ${signal.action} ${risk.positionSize} ${signal.symbol} ` +
                `(${executionTimeMs}ms)`);
            return {
                success: true,
                orderId: order.id,
                exchangeOrderId: undefined,
                filledQuantity: Number(order.filledQuantity) || risk.positionSize,
                averagePrice: Number(order.averagePrice) || signal.entryPrice,
                fee: Number(order.fee) || 0,
                feeCurrency: order.feeCurrency || undefined,
                slippage: this._calculateSlippage(signal.entryPrice, Number(order.averagePrice) || signal.entryPrice, signal.action),
                executionTimeMs,
            };
        }
        catch (error) {
            const executionTimeMs = Date.now() - startTime;
            this.logger.error(`❌ Order execution failed for ${signal.symbol}: ${error.message}`);
            await this.audit?.log({
                userId,
                action: 'AGENT_TRADE_FAILED',
                resource: 'autonomous-trader',
                details: JSON.stringify({
                    symbol: signal.symbol,
                    side: signal.action,
                    error: error.message,
                    executionTimeMs,
                }),
            });
            return {
                success: false,
                error: `فشل في التنفيذ: ${error.message}`,
                executionTimeMs,
            };
        }
    }
    async emergencyCloseAll(userId) {
        this.logger.warn(`🚨 Emergency close all positions for user ${userId}`);
        let closedCount = 0;
        let errors = 0;
        let totalPnL = 0;
        if (!this.tradingService) {
            this.logger.error('🚨 TradingService not available — cannot close positions');
            return { closedCount: 0, errors: 0, totalPnL: 0 };
        }
        try {
            const positions = await this.prisma.position.findMany({
                where: { userId, status: 'OPEN' },
            });
            for (const position of positions) {
                try {
                    const result = await this.tradingService.closePosition(userId, {
                        positionId: position.id,
                    });
                    if (result.pnl) {
                        totalPnL += result.pnl;
                    }
                    closedCount++;
                    await this.audit?.log({
                        userId,
                        action: 'AGENT_EMERGENCY_CLOSE',
                        resource: 'autonomous-trader',
                        details: JSON.stringify({
                            positionId: position.id,
                            symbol: position.symbol,
                            pnl: result.pnl,
                        }),
                    });
                }
                catch (error) {
                    this.logger.error(`Failed to close position ${position.id}: ${error.message}`);
                    errors++;
                }
            }
        }
        catch (error) {
            this.logger.error(`Emergency close failed: ${error.message}`);
        }
        this.logger.log(`🚨 Emergency close complete: ${closedCount} closed, ${errors} errors, PnL: ${totalPnL.toFixed(2)}`);
        return { closedCount, errors, totalPnL };
    }
    _isDuplicateOrder(userId, symbol, side) {
        const key = `${userId}:${symbol}:${side}`;
        const lastOrder = this.recentOrders.get(key);
        if (!lastOrder)
            return false;
        const timeSinceLastOrder = Date.now() - lastOrder.getTime();
        return timeSinceLastOrder < 30000;
    }
    _calculateSlippage(expectedPrice, actualPrice, side) {
        if (!expectedPrice || !actualPrice)
            return 0;
        return Math.abs((actualPrice - expectedPrice) / expectedPrice) * 100;
    }
    _cleanupOldOrders() {
        const cutoff = Date.now() - 5 * 60 * 1000;
        for (const [key, date] of this.recentOrders.entries()) {
            if (date.getTime() < cutoff) {
                this.recentOrders.delete(key);
            }
        }
    }
    async _checkSufficientBalance(credential, symbol, side, quantity, price) {
        const orderValue = Math.abs(quantity * price);
        const required = orderValue * 1.005;
        if (!this.credentialsService) {
            return { sufficient: true, required, available: Infinity };
        }
        try {
            const balances = await this.credentialsService.fetchAllExchangeBalances(credential.userId);
            if (credential.exchange === 'paper-trading') {
                const paperExchange = balances.exchanges.find((e) => e.exchange === 'paper-trading');
                const available = paperExchange?.available ?? 0;
                return { sufficient: available >= required, required, available };
            }
            const exchangeBalance = balances.exchanges.find((e) => e.credentialId === credential.id ||
                e.exchange === credential.exchange ||
                (credential.exchange.includes('test') && e.isTestnet && e.exchange.includes(credential.exchange.replace('_test', '').replace('_future_test', ''))));
            if (!exchangeBalance) {
                return { sufficient: true, required, available: Infinity };
            }
            const available = exchangeBalance.available || 0;
            const sufficient = available >= required;
            if (!sufficient) {
                this.logger.warn(`⚡ V150: Balance check FAILED for ${credential.exchange}: ` +
                    `need $${required.toFixed(2)}, have $${available.toFixed(2)} available`);
            }
            return { sufficient, required, available };
        }
        catch (err) {
            this.logger.warn(`⚡ V150: Balance check error for ${credential.exchange}: ${err.message}`);
            return { sufficient: true, required, available: Infinity };
        }
    }
};
exports.OrderExecutorService = OrderExecutorService;
exports.OrderExecutorService = OrderExecutorService = OrderExecutorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        audit_service_1.AuditService,
        trading_service_1.TradingService,
        order_dispatcher_service_1.OrderDispatcherService,
        exposure_manager_service_1.ExposureManagerService,
        exchange_service_1.ExchangeService,
        credentials_service_1.CredentialsService])
], OrderExecutorService);
//# sourceMappingURL=order-executor.service.js.map