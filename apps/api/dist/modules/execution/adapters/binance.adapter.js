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
var BinanceAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceAdapter = void 0;
const common_1 = require("@nestjs/common");
const base_adapter_interface_1 = require("./base-adapter.interface");
const audit_service_1 = require("../../../audit/audit.service");
const ccxt = __importStar(require("ccxt"));
let BinanceAdapter = BinanceAdapter_1 = class BinanceAdapter {
    constructor(apiKey, apiSecret, auditService, userId, isSandbox = false, defaultType = 'spot') {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.auditService = auditService;
        this.userId = userId;
        this.isSandbox = isSandbox;
        this.defaultType = defaultType;
        this.logger = new common_1.Logger(BinanceAdapter_1.name);
        this.exchange = null;
        this.rateLimits = {
            maxRequestsPerSecond: 5,
            maxRequestsPerMinute: 120,
        };
        this._initializeExchange();
    }
    async placeOrder(order) {
        this.logger.log(`📦 Placing Binance order: ${order.side} ${order.quantity} ${order.symbol}`);
        try {
            let result;
            if (order.type === 'MARKET') {
                result = await this.exchange.createMarketOrder(order.symbol, order.side.toLowerCase(), order.quantity);
            }
            else {
                result = await this.exchange.createLimitOrder(order.symbol, order.side.toLowerCase(), order.quantity, order.price);
            }
            const executionResult = {
                success: true,
                exchangeOrderId: result.id,
                filledQuantity: result.filled || order.quantity,
                averagePrice: result.average || result.price,
                fee: result.fee?.cost,
                feeCurrency: result.fee?.currency,
                status: this._mapStatus(result.status),
                timestamp: new Date(),
            };
            await this._auditLog('ORDER_PLACED', {
                orderId: result.id,
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                quantity: order.quantity,
                filledQuantity: executionResult.filledQuantity,
                averagePrice: executionResult.averagePrice,
            });
            this.logger.log(`✅ Binance order executed: ${result.id} — ${order.side} ${executionResult.filledQuantity}/${order.quantity} ${order.symbol} @ ${executionResult.averagePrice}`);
            return executionResult;
        }
        catch (error) {
            this.logger.error(`❌ Binance order failed: ${error.message}`);
            await this._auditLog('ORDER_FAILED', {
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                quantity: order.quantity,
                error: error.message,
            });
            return {
                success: false,
                error: this._normalizeError(error),
                timestamp: new Date(),
            };
        }
    }
    async cancelOrder(orderId, symbol) {
        this.logger.log(`🗑️ Cancelling Binance order: ${orderId} (${symbol})`);
        try {
            await this.exchange.cancelOrder(orderId, symbol);
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
            const order = await this.exchange.fetchOrder(orderId, symbol);
            return this._mapStatus(order.status);
        }
        catch (error) {
            this.logger.error(`Failed to get order status ${orderId}: ${error.message}`);
            return base_adapter_interface_1.OrderExecutionStatus.PENDING;
        }
    }
    async fetchOpenOrders(symbol) {
        try {
            const orders = await this.exchange.fetchOpenOrders(symbol);
            return orders.map((o) => this._toUnifiedOrder(o));
        }
        catch (error) {
            this.logger.error(`Failed to fetch open orders: ${error.message}`);
            return [];
        }
    }
    async fetchBalance() {
        try {
            const balance = await this.exchange.fetchBalance();
            const balances = {};
            for (const [currency, data] of Object.entries(balance)) {
                if (typeof data === 'object' && data !== null && 'free' in data) {
                    const d = data;
                    if (d.free > 0 || d.used > 0 || d.total > 0) {
                        balances[currency] = {
                            free: d.free || 0,
                            used: d.used || 0,
                            total: d.total || 0,
                        };
                    }
                }
            }
            return {
                totalEquity: balance.total?.USDT || 0,
                availableBalance: balance.free?.USDT || 0,
                usedMargin: balance.used?.USDT || 0,
                currency: 'USDT',
                balances,
                timestamp: new Date(),
            };
        }
        catch (error) {
            this.logger.error(`Failed to fetch balance: ${error.message}`);
            return {
                totalEquity: 0,
                availableBalance: 0,
                usedMargin: 0,
                currency: 'USDT',
                balances: {},
                timestamp: new Date(),
            };
        }
    }
    getExchangeId() {
        return 'binance';
    }
    supportsWebSocket() {
        return true;
    }
    getRateLimits() {
        return this.rateLimits;
    }
    _initializeExchange() {
        const ExchangeClass = ccxt.binance;
        this.exchange = new ExchangeClass({
            apiKey: this.apiKey,
            secret: this.apiSecret,
            enableRateLimit: true,
            options: {
                defaultType: this.defaultType,
                adjustForTimeDifference: true,
            },
        });
        if (this.isSandbox) {
            this.exchange.setSandboxMode(true);
            this.logger.log(`🛠️ Binance sandbox mode enabled for user ${this.userId} (${this.defaultType})`);
        }
    }
    _mapStatus(status) {
        const mapping = {
            'open': base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
            'new': base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
            'partially_filled': base_adapter_interface_1.OrderExecutionStatus.PARTIALLY_FILLED,
            'filled': base_adapter_interface_1.OrderExecutionStatus.FILLED,
            'closed': base_adapter_interface_1.OrderExecutionStatus.FILLED,
            'canceled': base_adapter_interface_1.OrderExecutionStatus.CANCELLED,
            'cancelled': base_adapter_interface_1.OrderExecutionStatus.CANCELLED,
            'rejected': base_adapter_interface_1.OrderExecutionStatus.REJECTED,
            'expired': base_adapter_interface_1.OrderExecutionStatus.EXPIRED,
        };
        return mapping[status] || base_adapter_interface_1.OrderExecutionStatus.PENDING;
    }
    _toUnifiedOrder(o) {
        return {
            id: o.id,
            userId: this.userId,
            exchangeCredentialId: '',
            symbol: o.symbol,
            side: o.side?.toUpperCase() || 'BUY',
            type: o.type?.toUpperCase() || 'MARKET',
            quantity: o.amount || 0,
            price: o.price,
            stopLoss: o.stopPrice,
            idempotencyKey: o.clientOrderId || o.id,
            clientOrderId: o.clientOrderId,
        };
    }
    _normalizeError(error) {
        const message = error.message || 'Unknown error';
        if (message.includes('InsufficientFunds')) {
            return 'رصيد غير كافي في حساب Binance';
        }
        if (message.includes('InvalidOrder')) {
            return 'طلب غير صالح — تحقق من الكمية والسعر';
        }
        if (message.includes('RateLimitExceeded')) {
            return 'تم تجاوز حد الطلبات — حاول بعد قليل';
        }
        if (message.includes('NetworkError') || message.includes('ETIMEDOUT')) {
            return 'خطأ في الاتصال بـ Binance — سيتم إعادة المحاولة';
        }
        if (message.includes('AuthenticationError')) {
            return 'فشل المصادقة — مفتاح API غير صالح';
        }
        return message;
    }
    async _auditLog(action, details) {
        try {
            await this.auditService.log({
                userId: this.userId,
                action: `BINANCE_${action}`,
                resource: 'execution-adapter',
                details: JSON.stringify(details),
            });
        }
        catch {
        }
    }
};
exports.BinanceAdapter = BinanceAdapter;
exports.BinanceAdapter = BinanceAdapter = BinanceAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [String, String, audit_service_1.AuditService, String, Boolean, String])
], BinanceAdapter);
//# sourceMappingURL=binance.adapter.js.map