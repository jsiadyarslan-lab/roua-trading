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
var PaperTradingAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaperTradingAdapter = void 0;
const common_1 = require("@nestjs/common");
const base_adapter_interface_1 = require("./base-adapter.interface");
const audit_service_1 = require("../../../audit/audit.service");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const aggregator_service_1 = require("../../analytics/aggregator.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const symbol_metadata_1 = require("../../trading/services/symbol-metadata");
let PaperTradingAdapter = PaperTradingAdapter_1 = class PaperTradingAdapter {
    constructor(prisma, aggregator, redisService, auditService, userId) {
        this.prisma = prisma;
        this.aggregator = aggregator;
        this.redisService = redisService;
        this.auditService = auditService;
        this.userId = userId;
        this.logger = new common_1.Logger(PaperTradingAdapter_1.name);
        this.pendingLimitOrders = new Map();
        this.rateLimits = {
            maxRequestsPerSecond: 20,
            maxRequestsPerMinute: 1000,
        };
        this.slippagePercent = parseFloat(process.env.PAPER_SLIPPAGE_PERCENT || '0.1');
        this.commissionPercent = parseFloat(process.env.PAPER_COMMISSION_PERCENT || '0.1');
        this.logger.log(`📝 Paper Trading adapter initialized (slippage: ${this.slippagePercent}%, commission: ${this.commissionPercent}%)`);
    }
    async placeOrder(order) {
        this.logger.log(`📝 Placing paper order: ${order.side} ${order.quantity} ${order.symbol}`);
        try {
            const currentPrice = await this._getCurrentPrice(order.symbol);
            if (currentPrice <= 0) {
                return {
                    success: false,
                    error: `لا يمكن الحصول على السعر الحالي لـ ${order.symbol}`,
                    timestamp: new Date(),
                };
            }
            if (order.type === 'MARKET') {
                return await this._executeMarketOrder(order, currentPrice);
            }
            else {
                return await this._executeLimitOrder(order, currentPrice);
            }
        }
        catch (error) {
            this.logger.error(`❌ Paper order failed: ${error.message}`);
            return {
                success: false,
                error: error.message,
                timestamp: new Date(),
            };
        }
    }
    async cancelOrder(orderId, symbol) {
        this.logger.log(`🗑️ Cancelling paper order: ${orderId}`);
        try {
            this.pendingLimitOrders.delete(orderId);
            await this.prisma.paperOrder.update({
                where: { id: orderId },
                data: { status: 'CANCELLED' },
            });
            await this._auditLog('ORDER_CANCELLED', { orderId, symbol });
            return true;
        }
        catch (error) {
            this.logger.error(`❌ Cancel failed for ${orderId}: ${error.message}`);
            return false;
        }
    }
    async getOrderStatus(orderId, symbol) {
        try {
            const order = await this.prisma.paperOrder.findUnique({
                where: { id: orderId },
            });
            if (!order)
                return base_adapter_interface_1.OrderExecutionStatus.PENDING;
            const statusMap = {
                PENDING: base_adapter_interface_1.OrderExecutionStatus.PENDING,
                ACCEPTED: base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
                PARTIALLY_FILLED: base_adapter_interface_1.OrderExecutionStatus.PARTIALLY_FILLED,
                FILLED: base_adapter_interface_1.OrderExecutionStatus.FILLED,
                CANCELLED: base_adapter_interface_1.OrderExecutionStatus.CANCELLED,
                REJECTED: base_adapter_interface_1.OrderExecutionStatus.REJECTED,
            };
            return statusMap[order.status] || base_adapter_interface_1.OrderExecutionStatus.PENDING;
        }
        catch {
            return base_adapter_interface_1.OrderExecutionStatus.PENDING;
        }
    }
    async fetchOpenOrders(symbol) {
        try {
            const where = { userId: this.userId, status: 'PENDING' };
            if (symbol)
                where.symbol = symbol;
            const orders = await this.prisma.paperOrder.findMany({ where });
            return orders.map((o) => ({
                id: o.id,
                userId: o.userId,
                exchangeCredentialId: '',
                symbol: o.symbol,
                side: o.side,
                type: o.type,
                quantity: Number(o.quantity),
                price: o.price ? Number(o.price) : undefined,
                stopLoss: o.stopLoss ? Number(o.stopLoss) : undefined,
                takeProfit: o.takeProfit ? Number(o.takeProfit) : undefined,
                idempotencyKey: o.idempotencyKey,
                clientOrderId: o.clientOrderId || undefined,
            }));
        }
        catch (error) {
            this.logger.error(`Failed to fetch open orders: ${error.message}`);
            return [];
        }
    }
    async fetchBalance() {
        const fallbackBalance = 10000;
        let baseBalance = fallbackBalance;
        try {
            const settings = await this.prisma.agentSettings.findUnique({
                where: { userId: this.userId },
            });
            if (settings && Number(settings.paperBalance) > 0) {
                baseBalance = Number(settings.paperBalance);
            }
        }
        catch {
        }
        try {
            const openPositions = await this.prisma.position.findMany({
                where: { userId: this.userId, status: 'OPEN' },
            });
            const usedMargin = openPositions.reduce((sum, p) => sum + (0, symbol_metadata_1.calculateMargin)(Number(p.quantity), Number(p.currentPrice) || Number(p.entryPrice), p.symbol), 0);
            const unrealizedPnL = openPositions.reduce((sum, p) => sum + Number(p.unrealizedPnl || 0), 0);
            const totalEquity = baseBalance + unrealizedPnL;
            const freeMargin = Math.max(0, totalEquity - usedMargin);
            this.logger.debug(`📝 Paper balance: base=$${baseBalance}, usedMargin=$${usedMargin.toFixed(2)}, ` +
                `unrealizedPnL=$${unrealizedPnL.toFixed(2)}, equity=$${totalEquity.toFixed(2)}, ` +
                `free=$${freeMargin.toFixed(2)}, positions=${openPositions.length}`);
            return {
                totalEquity,
                availableBalance: freeMargin,
                usedMargin,
                currency: 'USD',
                balances: {
                    USD: {
                        free: freeMargin,
                        used: usedMargin,
                        total: totalEquity,
                    },
                },
                timestamp: new Date(),
            };
        }
        catch (error) {
            this.logger.error(`Failed to fetch paper balance: ${error.message}`);
            return {
                totalEquity: baseBalance,
                availableBalance: baseBalance,
                usedMargin: 0,
                currency: 'USD',
                balances: { USD: { free: baseBalance, used: 0, total: baseBalance } },
                timestamp: new Date(),
            };
        }
    }
    getExchangeId() {
        return 'paper';
    }
    supportsWebSocket() {
        return false;
    }
    getRateLimits() {
        return this.rateLimits;
    }
    async _executeMarketOrder(order, currentPrice) {
        const slippageMultiplier = 1 + (this.slippagePercent / 100) * (order.side === 'BUY' ? 1 : -1);
        const rawFillPrice = currentPrice * slippageMultiplier;
        const decimals = this._priceDecimals(rawFillPrice, order.symbol);
        const fillPrice = parseFloat(rawFillPrice.toFixed(decimals));
        const commission = (order.quantity * fillPrice) * (this.commissionPercent / 100);
        const paperOrder = await this.prisma.paperOrder.create({
            data: {
                userId: this.userId,
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                quantity: order.quantity,
                price: fillPrice,
                stopLoss: order.stopLoss,
                takeProfit: order.takeProfit,
                status: 'FILLED',
                filledQuantity: order.quantity,
                averagePrice: fillPrice,
                fee: commission,
                feeCurrency: 'USD',
                slippage: Math.abs(fillPrice - currentPrice),
                idempotencyKey: order.idempotencyKey,
                clientOrderId: order.clientOrderId,
            },
        });
        await this._auditLog('ORDER_PLACED', {
            orderId: paperOrder.id,
            symbol: order.symbol,
            side: order.side,
            type: 'MARKET',
            quantity: order.quantity,
            fillPrice,
            slippage: Math.abs(fillPrice - currentPrice),
            commission,
            marketPrice: currentPrice,
        });
        this.logger.log(`✅ Paper market order filled: ${paperOrder.id} — ${order.side} ${order.quantity} ${order.symbol} @ ${fillPrice.toFixed(decimals)} (market: ${currentPrice.toFixed(decimals)}, slippage: ${this.slippagePercent}%)`);
        return {
            success: true,
            exchangeOrderId: paperOrder.id,
            filledQuantity: order.quantity,
            averagePrice: fillPrice,
            fee: commission,
            feeCurrency: 'USD',
            status: base_adapter_interface_1.OrderExecutionStatus.FILLED,
            timestamp: new Date(),
        };
    }
    async _executeLimitOrder(order, currentPrice) {
        const limitPrice = order.price;
        const isFillable = (order.side === 'BUY' && currentPrice <= limitPrice) ||
            (order.side === 'SELL' && currentPrice >= limitPrice);
        if (isFillable) {
            const commission = (order.quantity * limitPrice) * (this.commissionPercent / 100);
            const paperOrder = await this.prisma.paperOrder.create({
                data: {
                    userId: this.userId,
                    symbol: order.symbol,
                    side: order.side,
                    type: order.type,
                    quantity: order.quantity,
                    price: limitPrice,
                    stopLoss: order.stopLoss,
                    takeProfit: order.takeProfit,
                    status: 'FILLED',
                    filledQuantity: order.quantity,
                    averagePrice: limitPrice,
                    fee: commission,
                    feeCurrency: 'USD',
                    slippage: 0,
                    idempotencyKey: order.idempotencyKey,
                    clientOrderId: order.clientOrderId,
                },
            });
            await this._auditLog('ORDER_PLACED', {
                orderId: paperOrder.id,
                symbol: order.symbol,
                side: order.side,
                type: 'LIMIT',
                quantity: order.quantity,
                fillPrice: limitPrice,
                commission,
            });
            return {
                success: true,
                exchangeOrderId: paperOrder.id,
                filledQuantity: order.quantity,
                averagePrice: limitPrice,
                fee: commission,
                feeCurrency: 'USD',
                status: base_adapter_interface_1.OrderExecutionStatus.FILLED,
                timestamp: new Date(),
            };
        }
        const paperOrder = await this.prisma.paperOrder.create({
            data: {
                userId: this.userId,
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                quantity: order.quantity,
                price: limitPrice,
                stopLoss: order.stopLoss,
                takeProfit: order.takeProfit,
                status: 'PENDING',
                filledQuantity: 0,
                idempotencyKey: order.idempotencyKey,
                clientOrderId: order.clientOrderId,
            },
        });
        this.pendingLimitOrders.set(paperOrder.id, order);
        await this.redisService.set(`paper:limit:${paperOrder.id}`, JSON.stringify({
            orderId: paperOrder.id,
            symbol: order.symbol,
            side: order.side,
            limitPrice,
            quantity: order.quantity,
        }), 86400000);
        await this._auditLog('ORDER_PENDING', {
            orderId: paperOrder.id,
            symbol: order.symbol,
            side: order.side,
            type: 'LIMIT',
            limitPrice,
            currentPrice,
        });
        this.logger.log(`📝 Paper limit order pending: ${paperOrder.id} — ${order.side} ${order.quantity} ${order.symbol} @ ${limitPrice} (current: ${currentPrice})`);
        return {
            success: true,
            exchangeOrderId: paperOrder.id,
            filledQuantity: 0,
            status: base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
            timestamp: new Date(),
        };
    }
    async _getCurrentPrice(symbol) {
        try {
            const quote = await this.aggregator.getAggregatedQuote(symbol);
            const price = quote.price || 0;
            if (price <= 0) {
                throw new Error(`لا يمكن الحصول على سعر صالح لـ ${symbol} — تم إلغاء الأمر الوهمي`);
            }
            return price;
        }
        catch (error) {
            this.logger.error(`Failed to get price for ${symbol}: ${error.message}`);
            throw new Error(`فشل في جلب السعر لـ ${symbol}: ${error.message}`);
        }
    }
    async _auditLog(action, details) {
        try {
            await this.auditService.log({
                userId: this.userId,
                action: `PAPER_${action}`,
                resource: 'execution-adapter',
                details: JSON.stringify(details),
            });
        }
        catch {
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
};
exports.PaperTradingAdapter = PaperTradingAdapter;
exports.PaperTradingAdapter = PaperTradingAdapter = PaperTradingAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        aggregator_service_1.MarketDataAggregatorService,
        redis_service_1.RedisService,
        audit_service_1.AuditService, String])
], PaperTradingAdapter);
//# sourceMappingURL=paper-trading.adapter.js.map