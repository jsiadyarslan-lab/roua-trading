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
var TradingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const redis_service_1 = require("../../common/redis/redis.service");
const credentials_service_1 = require("../portfolio/credentials/credentials.service");
const exchange_service_1 = require("../exchange/exchange.service");
const risk_manager_service_1 = require("./risk-manager.service");
const audit_service_1 = require("../../audit/audit.service");
const symbol_metadata_1 = require("./services/symbol-metadata");
const ccxt = __importStar(require("ccxt"));
const crypto = __importStar(require("crypto"));
const trading_types_1 = require("./trading.types");
let TradingService = TradingService_1 = class TradingService {
    constructor(prisma, redis, credentialsService, exchangeService, riskManager, auditService) {
        this.prisma = prisma;
        this.redis = redis;
        this.credentialsService = credentialsService;
        this.exchangeService = exchangeService;
        this.riskManager = riskManager;
        this.auditService = auditService;
        this.logger = new common_1.Logger(TradingService_1.name);
        this.exchangeCache = new Map();
        this.exchangeCacheTimestamps = new Map();
        this.EXCHANGE_CACHE_TTL_MS = 5 * 60 * 1000;
        this.MAX_CACHE_SIZE = 50;
        this.logger.log('⚡ Trading Engine initialized — ready for execution');
        setInterval(() => this._cleanExchangeCache(), 10 * 60 * 1000);
    }
    _cleanExchangeCache() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key] of this.exchangeCache.entries()) {
            const ts = this.exchangeCacheTimestamps.get(key) || 0;
            if (now - ts > this.EXCHANGE_CACHE_TTL_MS) {
                this.exchangeCache.delete(key);
                this.exchangeCacheTimestamps.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.logger.debug(`🗑️ ExchangeCache: cleaned ${cleaned} expired instances (${this.exchangeCache.size} remaining)`);
        }
        if (this.exchangeCache.size > this.MAX_CACHE_SIZE) {
            const oldest = [...this.exchangeCache.entries()].sort((a, b) => (this.exchangeCacheTimestamps.get(a[0]) || 0) - (this.exchangeCacheTimestamps.get(b[0]) || 0));
            oldest.slice(0, this.exchangeCache.size - this.MAX_CACHE_SIZE).forEach(([k]) => { this.exchangeCache.delete(k); this.exchangeCacheTimestamps.delete(k); });
        }
    }
    async placeOrder(userId, request, ipAddress, userAgent) {
        this.logger.log(`📋 Order request: ${request.side} ${request.quantity} ${request.symbol} (${request.type})`);
        const credential = await this.prisma.exchangeCredential.findFirst({
            where: { id: request.credentialId, userId },
        });
        if (!credential) {
            throw new common_1.NotFoundException('بيانات الاعتماد غير موجودة');
        }
        if (!credential.isValid) {
            throw new common_1.BadRequestException('بيانات الاعتماد غير صالحة — يرجى التحقق من مفتاح API');
        }
        const isTestExchange = ['paper-trading', 'paper', 'demo', 'sandbox', 'simulation'].includes(credential.exchange)
            || credential.exchange.endsWith('_test')
            || credential.exchange.endsWith('_paper')
            || credential.exchange.endsWith('-test')
            || credential.exchange.endsWith('-paper');
        if (!isTestExchange) {
            const permissions = JSON.parse(credential.permissions || '["read"]');
            if (!permissions.includes('trade')) {
                throw new common_1.ForbiddenException('مفتاح API لا يملك صلاحية التداول — أضف مفتاحاً بصلاحية trade');
            }
        }
        let currentPrice = request.price;
        if (!currentPrice) {
            try {
                const quote = await this.exchangeService.getQuote(request.symbol);
                currentPrice = quote.price;
            }
            catch (error) {
                throw new common_1.BadRequestException(`فشل في جلب سعر السوق لـ ${request.symbol}: ${error.message}`);
            }
        }
        const riskCheck = await this.riskManager.checkOrderRisk(userId, request.symbol, request.side, request.quantity, currentPrice, credential.exchange, credential.id);
        if (!riskCheck.allowed) {
            await this.auditService.log({
                userId,
                action: 'ORDER_REJECTED_RISK',
                resource: 'order',
                details: JSON.stringify({
                    symbol: request.symbol,
                    side: request.side,
                    reason: riskCheck.reason,
                }),
                ipAddress,
                userAgent,
            });
            throw new common_1.ForbiddenException(`🛡️ تم رفض الطلب: ${riskCheck.reason}`);
        }
        let execution;
        if (credential.exchange === 'paper-trading') {
            execution = this._executePaperTrade(request, currentPrice);
        }
        else {
            execution = await this._executeOnExchange(credential.exchange, credential.id, request, userId);
        }
        if (!execution.success) {
            const order = await this.prisma.order.create({
                data: {
                    userId,
                    exchangeCredentialId: request.credentialId,
                    exchange: credential.exchange,
                    symbol: request.symbol,
                    side: request.side,
                    type: request.type,
                    status: 'REJECTED',
                    quantity: request.quantity,
                    price: request.price ?? null,
                    stopLoss: request.stopLoss ?? null,
                    idempotencyKey: request.idempotencyKey || `legacy-${Date.now()}-${crypto.randomUUID()}`,
                },
            });
            await this.auditService.log({
                userId,
                action: 'ORDER_REJECTED_EXCHANGE',
                resource: 'order',
                details: JSON.stringify({
                    orderId: order.id,
                    symbol: request.symbol,
                    error: execution.error,
                }),
                ipAddress,
                userAgent,
            });
            throw new common_1.BadRequestException(`فشل في تنفيذ الطلب: ${execution.error}`);
        }
        const order = await this.prisma.$transaction(async (tx) => {
            const createdOrder = await tx.order.create({
                data: {
                    userId,
                    exchangeCredentialId: request.credentialId,
                    exchange: credential.exchange,
                    symbol: request.symbol,
                    side: request.side,
                    type: request.type,
                    status: (execution.filledQuantity || 0) >= request.quantity
                        ? 'FILLED'
                        : 'PARTIALLY_FILLED',
                    quantity: request.quantity,
                    price: request.price ?? null,
                    stopLoss: request.stopLoss ?? null,
                    filledQuantity: execution.filledQuantity || 0,
                    averagePrice: execution.averagePrice,
                    fee: execution.fee ?? null,
                    feeCurrency: execution.feeCurrency ?? null,
                    exchangeOrderId: execution.exchangeOrderId,
                    idempotencyKey: request.idempotencyKey || `legacy-${Date.now()}-${crypto.randomUUID()}`,
                },
            });
            await this._updatePosition(userId, createdOrder, request, execution, tx);
            const tradeQuantity = execution.filledQuantity || 0;
            const tradePrice = execution.averagePrice || currentPrice;
            if (tradeQuantity <= 0 || tradePrice <= 0) {
                this.logger.warn(`Trade record skipped — invalid quantity (${tradeQuantity}) or price (${tradePrice}) for ${request.symbol}`);
            }
            else {
                await tx.trade.create({
                    data: {
                        userId,
                        orderId: createdOrder.id,
                        exchange: credential.exchange,
                        symbol: request.symbol,
                        side: request.side,
                        type: 'ENTRY',
                        quantity: tradeQuantity,
                        price: tradePrice,
                        fee: execution.fee ?? 0,
                        feeCurrency: execution.feeCurrency,
                        source: request.source || (credential.exchange === 'paper-trading' ? 'auto_paper' : 'user_manual'),
                    },
                });
            }
            if (request.signalId) {
                await tx.signal
                    .updateMany({
                    where: { id: request.signalId, userId },
                    data: { status: 'EXECUTED' },
                })
                    .catch(() => { });
            }
            return createdOrder;
        });
        await this.auditService.log({
            userId,
            action: 'ORDER_PLACED',
            resource: 'order',
            details: JSON.stringify({
                orderId: order.id,
                symbol: request.symbol,
                side: request.side,
                type: request.type,
                quantity: request.quantity,
                filledQuantity: execution.filledQuantity,
                averagePrice: execution.averagePrice,
                riskScore: riskCheck.riskScore,
            }),
            ipAddress,
            userAgent,
        });
        if (credential.exchange === 'paper-trading' && execution.success) {
            try {
                const settings = await this.prisma.agentSettings.findUnique({
                    where: { userId },
                    select: { paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
                });
                const meta = (0, symbol_metadata_1.getSymbolMetadata)(request.symbol);
                const cryptoLev = Number(settings?.paperCryptoLeverage) || 1;
                const forexLev = Number(settings?.paperForexLeverage) || 50;
                const goldLev = Number(settings?.paperGoldLeverage) || 20;
                let leverage = 1;
                if (meta.assetClass === symbol_metadata_1.AssetClass.FOREX)
                    leverage = forexLev;
                else if (meta.assetClass === symbol_metadata_1.AssetClass.COMMODITY)
                    leverage = goldLev;
                else
                    leverage = cryptoLev;
                const notional = request.quantity * currentPrice;
                const marginToDeduct = leverage > 1 ? notional / leverage : notional;
                this.logger.log(`📝 V175 Paper margin locked (not deducted): $${marginToDeduct.toFixed(2)} (${request.symbol})`);
            }
            catch (err) {
                this.logger.warn(`V172d Failed to deduct paper margin on open: ${err.message}`);
            }
        }
        this.logger.log(`✅ Order executed: ${order.id} — ${request.side} ${execution.filledQuantity}/${request.quantity} ${request.symbol} @ ${execution.averagePrice}`);
        return order;
    }
    async cancelOrder(userId, orderId, ipAddress, userAgent) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, userId },
        });
        if (!order) {
            throw new common_1.NotFoundException('الطلب غير موجود');
        }
        if (!['PENDING', 'ACCEPTED', 'PARTIALLY_FILLED'].includes(order.status)) {
            throw new common_1.BadRequestException(`لا يمكن إلغاء طلب بحالة "${order.status}"`);
        }
        if (order.exchangeOrderId) {
            try {
                const credential = await this.prisma.exchangeCredential.findFirst({
                    where: { id: order.exchangeCredentialId, userId },
                });
                if (credential) {
                    const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(credential.id, userId);
                    const exchange = this._getExchangeInstance(credential.exchange, apiKey, apiSecret, credential.id, credential.testnet || false);
                    if (exchange) {
                        await exchange.cancelOrder(order.exchangeOrderId, order.symbol);
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Failed to cancel order on exchange: ${error.message}`);
            }
        }
        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: { status: 'CANCELLED' },
        });
        await this.auditService.log({
            userId,
            action: 'ORDER_CANCELLED',
            resource: 'order',
            details: JSON.stringify({ orderId, symbol: order.symbol }),
            ipAddress,
            userAgent,
        });
        return updated;
    }
    async getOrders(userId, filters) {
        const where = { userId };
        if (filters?.symbol)
            where.symbol = filters.symbol;
        if (filters?.status)
            where.status = filters.status;
        return this.prisma.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: filters?.limit || 50,
        });
    }
    async getOrder(userId, orderId) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, userId },
        });
        if (!order) {
            throw new common_1.NotFoundException('الطلب غير موجود');
        }
        return order;
    }
    async getOpenPositions(userId) {
        const positions = await this.prisma.position.findMany({
            where: {
                userId,
                status: 'OPEN',
            },
            orderBy: { openedAt: 'desc' },
        });
        if (positions.length === 0)
            return [];
        const quotePromises = positions.map((pos) => this.exchangeService.getQuote(pos.symbol).catch(() => null));
        const quotes = await Promise.allSettled(quotePromises);
        const updates = [];
        const results = [];
        for (let i = 0; i < positions.length; i++) {
            const position = positions[i];
            const quoteResult = quotes[i];
            const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
            if (quote && quote.price) {
                const currentPrice = quote.price;
                const entryPrice = position.entryPrice.toNumber();
                const quantity = position.quantity.toNumber();
                const unrealizedPnl = position.side === 'BUY'
                    ? (currentPrice - entryPrice) * quantity
                    : (entryPrice - currentPrice) * quantity;
                updates.push(this.prisma.position.update({
                    where: { id: position.id },
                    data: {
                        currentPrice,
                        unrealizedPnl,
                        highestPrice: Math.max(position.highestPrice?.toNumber() ?? currentPrice, currentPrice),
                        lowestPrice: Math.min(position.lowestPrice?.toNumber() ?? currentPrice, currentPrice),
                    },
                }));
                results.push({
                    ...position,
                    currentPrice,
                    unrealizedPnl,
                });
            }
            else {
                this.logger.warn(`Failed to update price for ${position.symbol}: quote unavailable`);
                results.push(position);
            }
        }
        if (updates.length > 0) {
            await this.prisma.$transaction(updates).catch((err) => {
                this.logger.warn(`Batch position update failed: ${err.message}`);
            });
        }
        return results;
    }
    async getPositionSummary(userId) {
        try {
            const positions = await this.getOpenPositions(userId);
            const totalValue = positions.reduce((sum, p) => sum + (typeof p.quantity === 'number' ? p.quantity : Number(p.quantity)) * (Number(p.currentPrice) || Number(p.entryPrice)), 0);
            const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (Number(p.unrealizedPnl) || 0), 0);
            const totalRealizedPnl = positions.reduce((sum, p) => sum + (Number(p.realizedPnl) || 0), 0);
            const usedMargin = positions.reduce((sum, p) => sum + (0, symbol_metadata_1.calculateMargin)(typeof p.quantity === 'number' ? p.quantity : Number(p.quantity), Number(p.currentPrice) || Number(p.entryPrice), p.symbol), 0);
            return {
                totalPositions: positions.length,
                totalValue,
                totalUnrealizedPnl,
                totalRealizedPnl,
                usedMargin,
                positions,
            };
        }
        catch (error) {
            this.logger.error(`Failed to get position summary: ${error.message}`, error.stack);
            throw new Error(`فشل في جلب ملخص المراكز: ${error.message}`);
        }
    }
    async closePosition(userId, request, ipAddress, userAgent, _retryCount = 0) {
        const position = await this.prisma.position.findFirst({
            where: { id: request.positionId, userId },
        });
        if (!position) {
            throw new common_1.NotFoundException('المركز غير موجود');
        }
        const positionVersion = position.version ?? 0;
        if (position.status !== 'OPEN') {
            this.logger.warn(`Position ${position.id} (${position.symbol}) status is ${position.status} — attempting exchange close for safety`);
            try {
                const staleCredential = await this.prisma.exchangeCredential.findFirst({
                    where: { id: position.credentialId, userId },
                });
                if (staleCredential && staleCredential.exchange !== 'paper-trading') {
                    const staleSide = position.side === 'BUY' ? 'SELL' : 'BUY';
                    await this._executeOnExchange(staleCredential.exchange, staleCredential.id, {
                        credentialId: staleCredential.id,
                        symbol: position.symbol,
                        side: staleSide,
                        type: trading_types_1.OrderType.MARKET,
                        quantity: position.quantity.toNumber(),
                    }, userId);
                    this.logger.log(`Successfully closed position ${position.id} on exchange despite DB status being ${position.status}`);
                }
            }
            catch (exchangeErr) {
                this.logger.warn(`Exchange close for already-closed position ${position.id} failed: ${exchangeErr.message}`);
            }
            return {
                order: null,
                pnl: position.realizedPnl?.toNumber() ?? 0,
                position: await this.prisma.position.findUnique({
                    where: { id: position.id },
                }),
                alreadyClosed: true,
            };
        }
        const posQuantity = position.quantity.toNumber();
        const posEntryPrice = position.entryPrice.toNumber();
        const posCurrentPrice = position.currentPrice?.toNumber() ?? null;
        const posRealizedPnl = position.realizedPnl?.toNumber() ?? 0;
        const posStopLoss = position.stopLoss?.toNumber() ?? null;
        const closeQuantity = request.quantity ?? posQuantity;
        if (closeQuantity > posQuantity) {
            throw new common_1.BadRequestException(`كمية الإغلاق (${closeQuantity}) أكبر من حجم المركز (${posQuantity})`);
        }
        const credential = await this.prisma.exchangeCredential.findFirst({
            where: { id: position.credentialId, userId },
        });
        const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';
        let execution;
        if (position.exchange === 'paper-trading' || !credential) {
            let closePrice = posCurrentPrice;
            if (!closePrice || closePrice <= 0) {
                try {
                    const quotePromise = this.exchangeService.getQuote(position.symbol);
                    const quote = await Promise.race([
                        quotePromise,
                        new Promise((resolve) => setTimeout(() => resolve(null), 1000)),
                    ]);
                    closePrice = quote?.price || posEntryPrice;
                }
                catch {
                    closePrice = posEntryPrice;
                }
            }
            if (!closePrice || closePrice <= 0) {
                closePrice = posEntryPrice;
            }
            execution = this._executePaperTrade({
                credentialId: position.credentialId,
                symbol: position.symbol,
                side: closeSide,
                type: trading_types_1.OrderType.MARKET,
                quantity: closeQuantity,
                price: closePrice,
            }, closePrice);
        }
        else {
            execution = await this._executeOnExchange(credential.exchange, credential.id, {
                credentialId: credential.id,
                symbol: position.symbol,
                side: closeSide,
                type: trading_types_1.OrderType.MARKET,
                quantity: closeQuantity,
            }, userId);
        }
        if (!execution.success) {
            const errorMsg = execution.error || '';
            const isPaperTrading = position.exchange === 'paper-trading';
            const isExchangeUnreachable = /timeout|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|unreachable/i.test(errorMsg);
            const isUserCancel = /cancel|not found|already closed|unknown order/i.test(errorMsg);
            const isInsufficientBalance = (errorMsg.includes('رصيد') && errorMsg.includes('غير متاح'))
                || /insufficient.*balance|not enough/i.test(errorMsg);
            const shouldForceClose = isPaperTrading || isExchangeUnreachable || isInsufficientBalance || isUserCancel;
            if (shouldForceClose) {
                this.logger.warn(`⚡ Exchange close failed for ${position.symbol} — attempting force close (DB only). ` +
                    `Reason: ${isPaperTrading ? 'paper-trading' : isExchangeUnreachable ? 'exchange-unreachable' : isInsufficientBalance ? 'insufficient-balance' : 'user-cancel'}. ` +
                    `Error: ${errorMsg}`);
                try {
                    return await this.forceClosePosition(userId, position.id, `Auto force-close: ${isPaperTrading ? 'paper-trading position' : isExchangeUnreachable ? 'exchange unreachable' : isInsufficientBalance ? 'insufficient balance' : 'position likely already closed'} — ${errorMsg}`, ipAddress, userAgent);
                }
                catch (forceErr) {
                    this.logger.error(`❌ Force close also failed for ${position.id}: ${forceErr.message}`);
                }
            }
            if (isPaperTrading) {
                this.logger.warn(`🔴 V114 Paper-trading safety net: force-close failed for ${position.id}, attempting direct DB update as last resort`);
                try {
                    await this.prisma.position.update({
                        where: { id: position.id },
                        data: {
                            status: 'CLOSED',
                            closedAt: new Date(),
                            realizedPnl: posRealizedPnl,
                            exitPrice: posEntryPrice,
                            closeReason: request.closeReason || 'FORCE_CLOSE',
                        },
                    });
                    this._clearProcessedKeysForPosition(userId, position.symbol).catch(() => { });
                    this.logger.log(`🔴 V114 Paper-trading position ${position.id} force-closed via direct DB update`);
                    return {
                        order: null,
                        pnl: 0,
                        position: await this.prisma.position.findUnique({ where: { id: position.id } }),
                        forceClosed: true,
                        safetyNetClose: true,
                    };
                }
                catch (dbErr) {
                    this.logger.error(`❌ V114 Even direct DB update failed for ${position.id}: ${dbErr.message}`);
                }
            }
            throw new common_1.BadRequestException(`فشل في إغلاق المركز: ${execution.error}`);
        }
        const exitPrice = execution.averagePrice != null && execution.averagePrice > 0
            ? execution.averagePrice
            : (posCurrentPrice != null && posCurrentPrice > 0
                ? posCurrentPrice
                : posEntryPrice);
        const grossPnl = position.side === 'BUY'
            ? (exitPrice - posEntryPrice) * closeQuantity
            : (posEntryPrice - exitPrice) * closeQuantity;
        const exitFee = execution.fee ?? (exitPrice * closeQuantity * 0.001);
        const totalFees = exitFee;
        const pnl = grossPnl - totalFees;
        const { order: closedOrder } = await this.prisma.$transaction(async (tx) => {
            let order = null;
            try {
                order = await tx.order.create({
                    data: {
                        userId,
                        exchangeCredentialId: position.credentialId,
                        exchange: position.exchange,
                        symbol: position.symbol,
                        side: closeSide,
                        type: 'MARKET',
                        status: 'FILLED',
                        quantity: closeQuantity,
                        stopLoss: posStopLoss,
                        filledQuantity: execution.filledQuantity || closeQuantity,
                        averagePrice: execution.averagePrice,
                        fee: execution.fee ?? null,
                        feeCurrency: execution.feeCurrency ?? null,
                        exchangeOrderId: execution.exchangeOrderId,
                        idempotencyKey: `close-${position.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    },
                });
            }
            catch (orderErr) {
                this.logger.warn(`closePosition: Order creation failed (non-critical): ${orderErr.message}`);
                order = { id: 'manual-close-' + Date.now() };
            }
            await tx.trade.create({
                data: {
                    userId,
                    orderId: order.id,
                    positionId: position.id,
                    exchange: position.exchange,
                    symbol: position.symbol,
                    side: closeSide,
                    type: closeQuantity >= posQuantity ? 'EXIT' : 'PARTIAL_EXIT',
                    quantity: closeQuantity,
                    price: exitPrice,
                    fee: execution.fee ?? 0,
                    feeCurrency: execution.feeCurrency,
                    pnl,
                    source: position.source || 'user_manual',
                },
            });
            if (closeQuantity >= posQuantity) {
                const updateResult = await tx.position.updateMany({
                    where: { id: position.id, ...(position.exchange === 'paper-trading' ? {} : { version: positionVersion }) },
                    data: {
                        status: 'CLOSED',
                        closedAt: new Date(),
                        realizedPnl: posRealizedPnl + pnl,
                        exitPrice,
                        closeReason: request.closeReason || 'MANUAL',
                        version: positionVersion + 1,
                    },
                });
                if (updateResult.count === 0) {
                    throw new Error('OPTIMISTIC_LOCK_FAILURE: Position was modified by another request. Please retry.');
                }
            }
            else {
                const updateResult = await tx.position.updateMany({
                    where: { id: position.id, ...(position.exchange === 'paper-trading' ? {} : { version: positionVersion }) },
                    data: {
                        quantity: posQuantity - closeQuantity,
                        realizedPnl: posRealizedPnl + pnl,
                        version: positionVersion + 1,
                    },
                });
                if (updateResult.count === 0) {
                    throw new Error('OPTIMISTIC_LOCK_FAILURE: Position was modified by another request. Please retry.');
                }
            }
            return { order };
        });
        await this.auditService.log({
            userId,
            action: 'POSITION_CLOSED',
            resource: 'position',
            details: JSON.stringify({
                positionId: position.id,
                symbol: position.symbol,
                quantity: closeQuantity,
                pnl,
                partial: closeQuantity < Number(position.quantity),
            }),
            ipAddress,
            userAgent,
        });
        this.logger.log(`📈 Position closed: ${position.symbol} — PnL: ${pnl.toFixed(2)} USD`);
        this._clearProcessedKeysForPosition(userId, position.symbol).catch(() => { });
        if (position.exchange === 'paper-trading') {
            try {
                const settings = await this.prisma.agentSettings.findUnique({
                    where: { userId },
                    select: { paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
                });
                const meta = (0, symbol_metadata_1.getSymbolMetadata)(position.symbol);
                const cryptoLev = Number(settings?.paperCryptoLeverage) || 1;
                const forexLev = Number(settings?.paperForexLeverage) || 50;
                const goldLev = Number(settings?.paperGoldLeverage) || 20;
                let leverage = 1;
                if (meta.assetClass === symbol_metadata_1.AssetClass.FOREX)
                    leverage = forexLev;
                else if (meta.assetClass === symbol_metadata_1.AssetClass.COMMODITY)
                    leverage = goldLev;
                else
                    leverage = cryptoLev;
                const notional = posEntryPrice * closeQuantity;
                const marginToReturn = leverage > 1 ? notional / leverage : notional;
                const totalReturn = marginToReturn + pnl;
                await this.prisma.$executeRaw `
          UPDATE "AgentSettings"
          SET "paperBalance" = "paperBalance" + ${pnl}
          WHERE "userId" = ${userId}
        `;
                this.logger.log(`📝 V175 Paper balance on close: PnL ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${position.symbol})`);
                if (position.briefId) {
                    try {
                        await this.prisma.tradingBrief.update({
                            where: { id: position.briefId },
                            data: {
                                outcome: pnl > 0.5 ? 'WIN' : pnl < -0.5 ? 'LOSS' : 'BREAKEVEN',
                                actualPnl: pnl,
                                outcomeAt: new Date(),
                            },
                        }).catch(() => { });
                    }
                    catch { }
                }
            }
            catch (err) {
                this.logger.warn(`V172d Failed to update paper balance on close: ${err.message}`);
            }
        }
        try {
            this.credentialsService.invalidateBalanceCache(userId);
        }
        catch { }
        return {
            order: closedOrder,
            pnl,
            position: await this.prisma.position.findUnique({
                where: { id: position.id },
            }),
        };
    }
    async _clearProcessedKeysForPosition(userId, symbol) {
        try {
            const pattern = `smart-executor:processed:*:${userId}`;
            const keys = await this.redis.scanKeys(pattern);
            let cleared = 0;
            for (const key of keys) {
                try {
                    const parts = key.split(':');
                    const briefId = parts.length >= 4 ? parts[2] : null;
                    if (!briefId)
                        continue;
                    const brief = await this.prisma.tradingBrief.findUnique({
                        where: { id: briefId },
                        select: { pair: true },
                    });
                    if (brief && brief.pair === symbol) {
                        await this.redis.del(key);
                        try {
                            await this.prisma.setting.deleteMany({
                                where: { key: `${key}:db` },
                            });
                        }
                        catch { }
                        cleared++;
                        this.logger.debug(`🗑️ Cleared processedKey ${key} for closed position ${symbol} (user: ${userId})`);
                    }
                }
                catch (keyErr) {
                    this.logger.warn(`Failed to check/clear processed key ${key}: ${keyErr.message}`);
                }
            }
            if (cleared > 0) {
                this.logger.log(`🗑️ Cleared ${cleared} processed key(s) for ${symbol} (user: ${userId}) — new positions can now be opened`);
            }
        }
        catch (error) {
            this.logger.warn(`Failed to clear processed keys for ${symbol} (user: ${userId}): ${error.message}`);
        }
    }
    async closePositionWithRetry(userId, request, ipAddress, userAgent, maxRetries = 3) {
        try {
            return await this.closePosition(userId, request, ipAddress, userAgent, 0);
        }
        catch (error) {
            const errMsg = error?.message || '';
            if (errMsg.includes('OPTIMISTIC_LOCK_FAILURE') && maxRetries > 0) {
                this.logger.warn(`Optimistic lock failure on closePosition for ${request.positionId} — retrying (${maxRetries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, 100));
                return this.closePositionWithRetry(userId, request, ipAddress, userAgent, maxRetries - 1);
            }
            const isTransientError = /timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|rate.?limit|too many|429|network|unreachable|fetch failed|Service Unavailable|502|504/i.test(errMsg);
            if (isTransientError && maxRetries > 0) {
                const delayMs = (4 - maxRetries) * 1000;
                this.logger.warn(`Transient error on closePosition for ${request.positionId} — retrying in ${delayMs}ms (${maxRetries} attempts left). Error: ${errMsg.substring(0, 100)}`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                return this.closePositionWithRetry(userId, request, ipAddress, userAgent, maxRetries - 1);
            }
            throw error;
        }
    }
    async forceClosePosition(userId, positionId, reason, ipAddress, userAgent) {
        const position = await this.prisma.position.findFirst({
            where: { id: positionId, userId },
        });
        if (!position) {
            throw new common_1.NotFoundException('المركز غير موجود');
        }
        if (position.status !== 'OPEN') {
            return {
                order: null,
                pnl: position.realizedPnl?.toNumber() ?? 0,
                position: await this.prisma.position.findUnique({
                    where: { id: position.id },
                }),
                alreadyClosed: true,
            };
        }
        const posQuantity = position.quantity.toNumber();
        const posEntryPrice = position.entryPrice.toNumber();
        const posRealizedPnl = position.realizedPnl?.toNumber() ?? 0;
        const posStopLoss = position.stopLoss?.toNumber() ?? null;
        let currentPrice = position.currentPrice?.toNumber() ?? 0;
        if (currentPrice <= 0) {
            try {
                const quotePromise = this.exchangeService.getQuote(position.symbol);
                const quote = await Promise.race([
                    quotePromise,
                    new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
                ]);
                currentPrice = quote?.price ?? posEntryPrice;
            }
            catch {
                currentPrice = posEntryPrice;
            }
        }
        if (!currentPrice || currentPrice <= 0) {
            currentPrice = posEntryPrice;
        }
        const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';
        const grossPnl2 = position.side === 'BUY'
            ? (currentPrice - posEntryPrice) * posQuantity
            : (posEntryPrice - currentPrice) * posQuantity;
        const paperFees = currentPrice * posQuantity * 0.001;
        const pnl = grossPnl2 - paperFees;
        const { order: closedOrder } = await this.prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    userId,
                    exchangeCredentialId: position.credentialId,
                    exchange: position.exchange,
                    symbol: position.symbol,
                    side: closeSide,
                    type: 'MARKET',
                    status: 'FILLED',
                    quantity: posQuantity,
                    stopLoss: posStopLoss,
                    filledQuantity: posQuantity,
                    averagePrice: currentPrice,
                    fee: 0,
                    feeCurrency: position.symbol.split('/').pop() || 'USDT',
                    exchangeOrderId: `force-${Date.now()}-${crypto.randomUUID()}`,
                    idempotencyKey: `force-close-${Date.now()}-${crypto.randomUUID()}`,
                },
            });
            await tx.trade.create({
                data: {
                    userId,
                    orderId: order.id,
                    positionId: position.id,
                    exchange: position.exchange,
                    symbol: position.symbol,
                    side: closeSide,
                    type: 'EXIT',
                    quantity: posQuantity,
                    price: currentPrice,
                    fee: 0,
                    feeCurrency: position.symbol.split('/').pop() || 'USDT',
                    pnl,
                    source: position.source || 'user_manual',
                },
            });
            await tx.position.update({
                where: { id: position.id },
                data: {
                    status: 'CLOSED',
                    closedAt: new Date(),
                    realizedPnl: posRealizedPnl + pnl,
                    exitPrice: currentPrice,
                    closeReason: reason ? reason.split(' ').slice(0, 3).join('_').toUpperCase() : 'FORCE_CLOSE',
                },
            });
            return { order };
        });
        await this.auditService.log({
            userId,
            action: 'POSITION_FORCE_CLOSED',
            resource: 'position',
            details: JSON.stringify({
                positionId: position.id,
                symbol: position.symbol,
                quantity: posQuantity,
                pnl,
                exitPrice: currentPrice,
                reason,
                warning: 'Position was force-closed in DB only — no exchange order was executed',
            }),
            ipAddress,
            userAgent,
        });
        this.logger.warn(`🔴 FORCE CLOSED position ${position.id} (${position.symbol}) — reason: ${reason}. ` +
            `NO exchange order was executed. DB updated only.`);
        this._clearProcessedKeysForPosition(userId, position.symbol).catch(() => { });
        if (position.exchange === 'paper-trading') {
            try {
                const settings = await this.prisma.agentSettings.findUnique({
                    where: { userId },
                    select: { paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
                });
                const meta = (0, symbol_metadata_1.getSymbolMetadata)(position.symbol);
                const cryptoLev = Number(settings?.paperCryptoLeverage) || 1;
                const forexLev = Number(settings?.paperForexLeverage) || 50;
                const goldLev = Number(settings?.paperGoldLeverage) || 20;
                let leverage = 1;
                if (meta.assetClass === symbol_metadata_1.AssetClass.FOREX)
                    leverage = forexLev;
                else if (meta.assetClass === symbol_metadata_1.AssetClass.COMMODITY)
                    leverage = goldLev;
                else
                    leverage = cryptoLev;
                const notional = Number(position.entryPrice) * posQuantity;
                const marginToReturn = leverage > 1 ? notional / leverage : notional;
                const totalReturn = marginToReturn + pnl;
                await this.prisma.$executeRaw `
          UPDATE "AgentSettings"
          SET "paperBalance" = "paperBalance" + ${pnl}
          WHERE "userId" = ${userId}
        `;
                this.logger.log(`📝 V175 Paper balance on force-close: +margin $${marginToReturn.toFixed(2)} +PnL $${pnl.toFixed(2)} = +$${totalReturn.toFixed(2)} (${position.symbol})`);
            }
            catch (err) {
                this.logger.warn(`V172d Failed to update paper balance on force-close: ${err.message}`);
            }
        }
        try {
            this.credentialsService.invalidateBalanceCache(userId);
        }
        catch { }
        return {
            order: closedOrder,
            pnl,
            position: await this.prisma.position.findUnique({
                where: { id: position.id },
            }),
            forceClosed: true,
        };
    }
    async updatePositionLevels(userId, positionId, data) {
        const position = await this.prisma.position.findFirst({
            where: { id: positionId, userId },
        });
        if (!position) {
            throw new common_1.NotFoundException('المركز غير موجود');
        }
        if (position.status !== 'OPEN') {
            this.logger.warn(`Cannot update SL/TP for position ${positionId} — status is ${position.status}`);
            return this.prisma.position.findUnique({
                where: { id: positionId },
            });
        }
        return this.prisma.position.update({
            where: { id: positionId },
            data: {
                stopLoss: data.stopLoss,
                takeProfit: data.takeProfit,
            },
        });
    }
    async getClosedPositions(userId, limit = 100, from, to) {
        try {
            const where = { userId, status: { in: ['CLOSED', 'LIQUIDATED'] } };
            if (from || to) {
                where.closedAt = {};
                if (from)
                    where.closedAt.gte = new Date(from);
                if (to)
                    where.closedAt.lte = new Date(to);
            }
            return await this.prisma.position.findMany({
                where,
                orderBy: { closedAt: 'desc' },
                take: limit,
                include: { trades: true },
            });
        }
        catch (error) {
            this.logger.error(`Failed to fetch closed positions: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getAllPositions(userId, limit = 100) {
        try {
            const positions = await this.prisma.position.findMany({
                where: { userId },
                orderBy: { openedAt: 'desc' },
                take: limit,
            });
            if (positions.length === 0)
                return [];
            const openPositions = positions.filter((p) => p.status === 'OPEN');
            if (openPositions.length === 0)
                return positions;
            const quotePromises = openPositions.map((pos) => this.exchangeService.getQuote(pos.symbol).catch(() => null));
            const quotes = await Promise.allSettled(quotePromises);
            const updates = [];
            const enrichedMap = new Map();
            for (let i = 0; i < openPositions.length; i++) {
                const position = openPositions[i];
                const quoteResult = quotes[i];
                const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
                if (quote && quote.price) {
                    const currentPrice = quote.price;
                    const entryPrice = position.entryPrice.toNumber();
                    const quantity = position.quantity.toNumber();
                    const unrealizedPnl = position.side === 'BUY'
                        ? (currentPrice - entryPrice) * quantity
                        : (entryPrice - currentPrice) * quantity;
                    updates.push(this.prisma.position.update({
                        where: { id: position.id },
                        data: {
                            currentPrice,
                            unrealizedPnl,
                            highestPrice: Math.max(position.highestPrice?.toNumber() ?? currentPrice, currentPrice),
                            lowestPrice: Math.min(position.lowestPrice?.toNumber() ?? currentPrice, currentPrice),
                        },
                    }));
                    enrichedMap.set(position.id, {
                        currentPrice,
                        unrealizedPnl,
                    });
                }
            }
            if (updates.length > 0) {
                await this.prisma.$transaction(updates).catch((err) => {
                    this.logger.warn(`Batch position update failed: ${err.message}`);
                });
            }
            return positions.map((pos) => {
                const enriched = enrichedMap.get(pos.id);
                if (enriched) {
                    return { ...pos, ...enriched };
                }
                return pos;
            });
        }
        catch (error) {
            this.logger.error(`Failed to fetch all positions: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getTradeHistory(userId, limit = 50, from, to) {
        try {
            const where = { userId };
            if (from || to) {
                where.executedAt = {};
                if (from)
                    where.executedAt.gte = new Date(from);
                if (to)
                    where.executedAt.lte = new Date(to);
            }
            return await this.prisma.trade.findMany({
                where,
                orderBy: { executedAt: 'desc' },
                take: limit,
            });
        }
        catch (error) {
            this.logger.error(`Failed to fetch trade history: ${error.message}`, error.stack);
            throw error;
        }
    }
    _priceDecimals(price, symbol) {
        if (!Number.isFinite(price) || price <= 0)
            return 2;
        if (symbol) {
            try {
                const meta = (0, symbol_metadata_1.getSymbolMetadata)(symbol);
                if (meta.priceDecimals > 2 || meta.assetClass === symbol_metadata_1.AssetClass.FOREX) {
                    return meta.priceDecimals;
                }
            }
            catch {
            }
            const s = symbol.toUpperCase();
            if (s.includes('JPY'))
                return 3;
            if (s.includes('BTC'))
                return 2;
            if (s.includes('XAU') || s.includes('XAG'))
                return 2;
        }
        if (price > 1000)
            return 2;
        if (price > 1)
            return 5;
        return 6;
    }
    _getExchangeInstance(exchangeName, apiKey, apiSecret, credentialId, testnet = false) {
        const cacheKey = `${credentialId}:${exchangeName}:${testnet}`;
        let exchange = this.exchangeCache.get(cacheKey);
        if (!exchange) {
            const isLegacyBinanceTest = exchangeName === 'binance_test' || exchangeName === 'binance_future_test';
            const isTestnet = testnet || isLegacyBinanceTest;
            const normalizedName = isLegacyBinanceTest ? 'binance' : exchangeName;
            const ExchangeClass = ccxt[normalizedName];
            if (!ExchangeClass) {
                return null;
            }
            exchange = new ExchangeClass({
                apiKey,
                secret: apiSecret,
                enableRateLimit: true,
                timeout: 10000,
                options: {
                    defaultType: exchangeName === 'binance_future_test' ? 'future' : 'spot',
                    adjustForTimeDifference: true
                },
            });
            if (isTestnet) {
                exchange.setSandboxMode(true);
                this.logger.log(`🛠️ TradingService: Enabled Binance Sandbox mode for ${credentialId} (testnet=${testnet}, legacy=${isLegacyBinanceTest})`);
            }
            this.exchangeCache.set(cacheKey, exchange);
            this.exchangeCacheTimestamps.set(cacheKey, Date.now());
            setTimeout(() => this.exchangeCache.delete(cacheKey), 10 * 60 * 1000);
        }
        return exchange;
    }
    async _getAvailableBalance(exchange, symbol, walletType = 'spot') {
        const baseCurrency = symbol.split('/')[0];
        try {
            const balanceParams = walletType !== 'spot' ? { type: walletType } : {};
            const balance = await exchange.fetchBalance(balanceParams);
            this.logger.debug(`🔍 Balance fetch for ${symbol} (${walletType}): ${JSON.stringify({
                baseCurrency,
                free: balance[baseCurrency]?.free,
                total: balance[baseCurrency]?.total,
                used: balance[baseCurrency]?.used,
                hasBalance: !!balance[baseCurrency],
            })}`);
            const nonZeroBalances = Object.entries(balance)
                .filter(([key, val]) => {
                if (key === 'free' || key === 'total' || key === 'used' || key === 'info')
                    return false;
                return val && (parseFloat(val.total || 0) > 0 || parseFloat(val.free || 0) > 0);
            })
                .map(([key, val]) => `${key}: free=${val.free}, total=${val.total}`);
            if (nonZeroBalances.length > 0) {
                this.logger.debug(`🔍 Non-zero balances on ${walletType}: ${nonZeroBalances.join(' | ')}`);
            }
            if (!balance[baseCurrency]) {
                return {
                    available: 0,
                    total: 0,
                    currency: baseCurrency,
                    walletType,
                    rawBalance: nonZeroBalances.length > 0 ? nonZeroBalances : undefined,
                };
            }
            let available = parseFloat(balance[baseCurrency].free || '0');
            const total = parseFloat(balance[baseCurrency].total || '0');
            const used = parseFloat(balance[baseCurrency].used || '0');
            if (available <= 0 && total > 0) {
                this.logger.warn(`⚡ Balance locked for ${baseCurrency}: free=${available}, used=${used}, total=${total}. ` +
                    `The ${walletType} wallet shows 0 available but ${total} total. ` +
                    `This usually means the balance is locked in open orders or margin positions.`);
                available = total;
            }
            return { available, total, currency: baseCurrency, walletType };
        }
        catch (error) {
            this.logger.warn(`⚡ Failed to fetch ${walletType} balance for ${symbol}: ${error.message}`);
            return { available: 0, total: 0, currency: baseCurrency, walletType };
        }
    }
    async _checkApiPermissions(exchange) {
        try {
            const balance = await exchange.fetchBalance();
            return {
                success: true,
                permissions: {
                    enableReading: true,
                    canFetchBalance: true,
                    walletAccessible: true,
                },
            };
        }
        catch (error) {
            const message = error.message || '';
            let inferredPermissions = {
                enableReading: false,
                canFetchBalance: false,
                walletAccessible: false,
            };
            if (message.includes('Invalid API-key') || message.includes('Invalid key')) {
                inferredPermissions = { ...inferredPermissions, errorType: 'INVALID_API_KEY' };
            }
            else if (message.includes('IP')) {
                inferredPermissions = { ...inferredPermissions, errorType: 'IP_RESTRICTED' };
            }
            else if (message.includes('timestamp') || message.includes('time')) {
                inferredPermissions = { ...inferredPermissions, errorType: 'TIME_SYNC_ISSUE' };
            }
            this.logger.warn(`⚡ API key test failed: ${message}`);
            return {
                success: false,
                permissions: inferredPermissions,
                error: message,
            };
        }
    }
    _executePaperTrade(request, currentPrice) {
        const slippagePercent = 0.001;
        const rawFillPrice = request.side === 'BUY'
            ? currentPrice * (1 + slippagePercent)
            : currentPrice * (1 - slippagePercent);
        const priceDecimals = this._priceDecimals(rawFillPrice, request.symbol);
        const fillPrice = parseFloat(rawFillPrice.toFixed(priceDecimals));
        const fee = request.quantity * fillPrice * 0.001;
        const feeCurrency = request.symbol.split('/').pop() || 'USDT';
        this.logger.log(`📜 Paper trade executed: ${request.side} ${request.quantity} ${request.symbol} @ ${fillPrice.toFixed(priceDecimals)} ` +
            `(fee: ${fee.toFixed(4)} ${feeCurrency})`);
        return {
            success: true,
            exchangeOrderId: `paper-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            filledQuantity: request.quantity,
            averagePrice: fillPrice,
            fee,
            feeCurrency,
        };
    }
    async _executeOnExchange(exchangeName, credentialId, request, userId) {
        try {
            if (exchangeName === 'paper-trading') {
                const currentPrice = await this.exchangeService.getQuote(request.symbol).then(q => q?.price ?? 0).catch(() => 0);
                if (currentPrice <= 0) {
                    return { success: false, error: `لا يمكن جلب سعر ${request.symbol} للتداول الورقي` };
                }
                return this._executePaperTrade(request, currentPrice);
            }
            const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(credentialId, userId);
            const credential = await this.prisma.exchangeCredential.findFirst({
                where: { id: credentialId, userId },
            });
            const isTestnet = credential?.testnet || false;
            const exchange = this._getExchangeInstance(exchangeName, apiKey, apiSecret, credentialId, isTestnet);
            if (!exchange) {
                return {
                    success: false,
                    error: `البورصة "${exchangeName}" غير مدعومة`,
                };
            }
            if (request.side === 'SELL') {
                const allWallets = [];
                let balance = await this._getAvailableBalance(exchange, request.symbol, 'spot');
                allWallets.push({ type: 'Spot', available: balance.available, total: balance.total, raw: balance.rawBalance });
                if (balance.available <= 0) {
                    this.logger.log(`🔍 Spot balance for ${request.symbol} is 0, checking futures wallet...`);
                    const futuresBalance = await this._getAvailableBalance(exchange, request.symbol, 'future');
                    allWallets.push({ type: 'Futures', available: futuresBalance.available, total: futuresBalance.total, raw: futuresBalance.rawBalance });
                    if (futuresBalance.available > 0) {
                        this.logger.log(`✅ Found ${futuresBalance.available} ${futuresBalance.currency} in futures wallet`);
                        balance = futuresBalance;
                    }
                    else {
                        this.logger.log(`🔍 Futures balance is 0, checking margin wallet...`);
                        const marginBalance = await this._getAvailableBalance(exchange, request.symbol, 'margin');
                        allWallets.push({ type: 'Margin', available: marginBalance.available, total: marginBalance.total, raw: marginBalance.rawBalance });
                        if (marginBalance.available > 0) {
                            this.logger.log(`✅ Found ${marginBalance.available} ${balance.currency} in margin wallet`);
                            balance = marginBalance;
                        }
                    }
                }
                if (balance.available <= 0) {
                    const walletSummary = allWallets
                        .map(w => `${w.type}: total=${w.total}, free=${w.available}`)
                        .join(' | ');
                    const allNonZeroCurrencies = allWallets
                        .flatMap(w => w.raw || [])
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .join(' | ');
                    const apiPermissions = await this._checkApiPermissions(exchange);
                    this.logger.error(`❌ ${request.symbol}: No ${balance.currency} balance found in any wallet. ` +
                        `Checked: ${walletSummary}. ` +
                        `All non-zero balances found: ${allNonZeroCurrencies || 'NONE'}. ` +
                        `API Permissions: ${JSON.stringify(apiPermissions.permissions || apiPermissions.error)}. ` +
                        `This usually means: (1) Position was already closed on exchange, ` +
                        `(2) API key lacks wallet read permission, ` +
                        `(3) Balance is in a sub-account or different wallet type, ` +
                        `(4) Position was opened on different exchange/account.`);
                    let permissionsInfo = '';
                    if (apiPermissions.success && apiPermissions.permissions) {
                        const p = apiPermissions.permissions;
                        permissionsInfo = ` | API key يعمل للقراءة ✅. ` +
                            `⚠️ لا يمكن التحقق من صلاحيات التداول تلقائياً. ` +
                            `تأكد يدوياً في Binance: API Management → ` +
                            `Enable Spot & Margin Trading + Enable Futures.`;
                    }
                    else if (apiPermissions.error) {
                        permissionsInfo = ` | خطأ في فحص API: ${apiPermissions.error}`;
                    }
                    return {
                        success: false,
                        error: `رصيد ${balance.currency} غير متاح في أي محفظة. ` +
                            `المحاولات: ${walletSummary}. ` +
                            `العملات المتاحة: ${allNonZeroCurrencies || 'لا يوجد'}. ` +
                            permissionsInfo +
                            ` | الأسباب المحتملة: (1) المركز مُغلق يدوياً في Binance، ` +
                            `(2) مفتاح API لا يملك صلاحية قراءة المحفظة، ` +
                            `(3) الرصيد في حساب فرعي أو محفظة غير مدعومة، ` +
                            `(4) المركز مفتوح في بورصة أو حساب مختلف.`,
                    };
                }
                if (request.quantity > balance.available) {
                    this.logger.warn(`⚡ Adjusting SELL quantity for ${request.symbol}: requested ${request.quantity} but only ${balance.available} ${balance.currency} available (${balance.walletType} wallet)`);
                    if (userId) {
                        await this.auditService.log({
                            userId,
                            action: 'ORDER_QUANTITY_ADJUSTED',
                            resource: 'trading',
                            details: JSON.stringify({
                                symbol: request.symbol,
                                requestedQuantity: request.quantity,
                                availableBalance: balance.available,
                                walletType: balance.walletType,
                                adjustedQuantity: balance.available,
                                reason: 'Insufficient balance on exchange',
                            }),
                        });
                    }
                    const adjustedQuantity = Math.floor(balance.available * 0.995 * 10000) / 10000;
                    if (adjustedQuantity <= 0) {
                        return {
                            success: false,
                            error: `رصيد ${balance.currency} غير كافٍ: متاح ${balance.available}، مطلوب ${request.quantity}`,
                        };
                    }
                    request.quantity = adjustedQuantity;
                }
            }
            let result;
            switch (request.type) {
                case 'MARKET':
                    const params = {};
                    if (request.idempotencyKey) {
                        if (exchangeName.toLowerCase() === 'alpaca') {
                            params.client_order_id = request.idempotencyKey;
                        }
                        else {
                            params.idempotencyKey = request.idempotencyKey;
                        }
                    }
                    result = await exchange.createMarketOrder(request.symbol, request.side.toLowerCase(), request.quantity, undefined, params);
                    break;
                case 'LIMIT':
                    if (!request.price) {
                        return {
                            success: false,
                            error: 'سعر الحد مطلوب للطلبات المحددة',
                        };
                    }
                    const limitParams = {};
                    if (request.idempotencyKey) {
                        if (exchangeName.toLowerCase() === 'alpaca') {
                            limitParams.client_order_id = request.idempotencyKey;
                        }
                        else {
                            limitParams.idempotencyKey = request.idempotencyKey;
                        }
                    }
                    result = await exchange.createLimitOrder(request.symbol, request.side.toLowerCase(), request.quantity, request.price, limitParams);
                    break;
                default:
                    return {
                        success: false,
                        error: `نوع الطلب "${request.type}" غير مدعوم`,
                    };
            }
            return {
                success: true,
                exchangeOrderId: result.id,
                filledQuantity: result.filled || 0,
                averagePrice: result.average || result.price,
                fee: result.fee?.cost,
                feeCurrency: result.fee?.currency,
            };
        }
        catch (error) {
            const message = error.message || 'Unknown error';
            if (message.includes('Insufficient')) {
                return { success: false, error: 'رصيد غير كافي لتنفيذ الطلب' };
            }
            if (message.includes('Invalid order')) {
                return {
                    success: false,
                    error: 'طلب غير صالح — تحقق من الكمية والسعر',
                };
            }
            if (message.includes('Rate limit')) {
                return {
                    success: false,
                    error: 'تم تجاوز حد الطلبات — حاول مرة أخرى بعد قليل',
                };
            }
            if (message.includes('Network')) {
                return {
                    success: false,
                    error: 'خطأ في الاتصال بالبورصة — تحقق من الإنترنت',
                };
            }
            return {
                success: false,
                error: `خطأ في التنفيذ: ${message}`,
            };
        }
    }
    _toAlpacaSymbol(symbol, exchangeName) {
        if (exchangeName === 'alpaca' || exchangeName === 'alpaca_paper') {
            return symbol.replace('/', '');
        }
        return symbol;
    }
    async _updatePosition(userId, order, request, execution, tx) {
        const filledQty = execution.filledQuantity || 0;
        const fillPrice = execution.averagePrice || (order.price ? Number(order.price) : 0);
        if (filledQty <= 0)
            return;
        const executeUpdate = async (db) => {
            const credential = await db.exchangeCredential.findUnique({
                where: { id: request.credentialId },
            });
            const exchangeName = credential?.exchange || 'unknown';
            const side = request.side;
            const existingPosition = await db.position.findFirst({
                where: {
                    userId,
                    symbol: request.symbol,
                    status: 'OPEN',
                    side,
                },
                orderBy: { openedAt: 'desc' },
            });
            if (existingPosition) {
                const existingQty = existingPosition.quantity.toNumber();
                const existingPrice = existingPosition.entryPrice.toNumber();
                const totalQuantity = existingQty + filledQty;
                const avgPrice = (existingPrice * existingQty + fillPrice * filledQty) /
                    totalQuantity;
                await db.position.update({
                    where: { id: existingPosition.id },
                    data: {
                        quantity: totalQuantity,
                        entryPrice: avgPrice,
                    },
                });
            }
            else {
                const { stopLoss, takeProfit } = this.riskManager.getDefaultLevels(fillPrice, side);
                try {
                    const defaultLevels = this.riskManager.getDefaultLevels(fillPrice, side);
                    const finalStopLoss = request.stopLoss ?? defaultLevels.stopLoss;
                    const finalTakeProfit = request.takeProfit ?? defaultLevels.takeProfit;
                    await db.position.create({
                        data: {
                            userId,
                            credentialId: request.credentialId,
                            exchange: exchangeName,
                            symbol: request.symbol,
                            exchangeSymbol: this._toAlpacaSymbol(request.symbol, exchangeName),
                            side,
                            status: 'OPEN',
                            quantity: filledQty,
                            entryPrice: fillPrice,
                            currentPrice: fillPrice,
                            highestPrice: fillPrice,
                            lowestPrice: fillPrice,
                            stopLoss: finalStopLoss,
                            takeProfit: finalTakeProfit,
                            source: request.source || (exchangeName === 'paper-trading' ? 'auto_paper' : 'user_manual'),
                            briefId: request.briefId ?? null,
                        },
                    });
                }
                catch (createError) {
                    if (createError.code === 'P2002' || createError.message?.includes('Unique constraint')) {
                        this.logger.warn(`Race condition detected in _updatePosition — retrying as update for ${request.symbol}`);
                        const racePosition = await db.position.findFirst({
                            where: {
                                userId,
                                symbol: request.symbol,
                                status: 'OPEN',
                                side,
                            },
                            orderBy: { openedAt: 'desc' },
                        });
                        if (racePosition) {
                            const existingQty = racePosition.quantity.toNumber();
                            const existingPrice = racePosition.entryPrice.toNumber();
                            const totalQuantity = existingQty + filledQty;
                            const avgPrice = (existingPrice * existingQty + fillPrice * filledQty) /
                                totalQuantity;
                            await db.position.update({
                                where: { id: racePosition.id },
                                data: {
                                    quantity: totalQuantity,
                                    entryPrice: avgPrice,
                                },
                            });
                        }
                        else {
                            throw createError;
                        }
                    }
                    else {
                        throw createError;
                    }
                }
            }
        };
        if (tx) {
            return executeUpdate(tx);
        }
        else {
            return this.prisma.$transaction(async (innerTx) => executeUpdate(innerTx));
        }
    }
};
exports.TradingService = TradingService;
exports.TradingService = TradingService = TradingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        credentials_service_1.CredentialsService,
        exchange_service_1.ExchangeService,
        risk_manager_service_1.RiskManagerService,
        audit_service_1.AuditService])
], TradingService);
//# sourceMappingURL=trading.service.js.map