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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AlpacaAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlpacaAdapter = void 0;
const common_1 = require("@nestjs/common");
const base_adapter_interface_1 = require("./base-adapter.interface");
const audit_service_1 = require("../../../audit/audit.service");
const axios_1 = __importDefault(require("axios"));
let AlpacaAdapter = AlpacaAdapter_1 = class AlpacaAdapter {
    constructor(apiKey, apiSecret, auditService, userId, paper = true) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.auditService = auditService;
        this.userId = userId;
        this.paper = paper;
        this.logger = new common_1.Logger(AlpacaAdapter_1.name);
        this.rateLimits = {
            maxRequestsPerSecond: 3,
            maxRequestsPerMinute: 200,
        };
        const baseURL = this.paper
            ? 'https://paper-api.alpaca.markets'
            : 'https://api.alpaca.markets';
        this.httpClient = axios_1.default.create({
            baseURL,
            headers: {
                'APCA-API-KEY-ID': this.apiKey,
                'APCA-API-SECRET-KEY': this.apiSecret,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
        this.logger.log(`🏛️ Alpaca adapter initialized (${this.paper ? 'PAPER' : 'LIVE'} mode)`);
    }
    async placeOrder(order) {
        this.logger.log(`📦 Placing Alpaca order: ${order.side} ${order.quantity} ${order.symbol}`);
        try {
            const payload = {
                symbol: order.symbol.replace('/', ''),
                qty: order.quantity.toString(),
                side: order.side.toLowerCase(),
                type: order.type.toLowerCase(),
                time_in_force: order.type === 'MARKET' ? 'ioc' : 'gtc',
                client_order_id: order.idempotencyKey,
            };
            if (order.type === 'LIMIT' && order.price) {
                payload.limit_price = order.price.toString();
            }
            if (order.stopLoss) {
                payload.stop_loss = { stop_price: order.stopLoss.toString() };
            }
            if (order.takeProfit) {
                payload.take_profit = { limit_price: order.takeProfit.toString() };
            }
            const response = await this.httpClient.post('/v2/orders', payload);
            const data = response.data;
            const executionResult = {
                success: true,
                exchangeOrderId: data.id,
                filledQuantity: parseFloat(data.filled_qty) || 0,
                averagePrice: parseFloat(data.filled_avg_price) || undefined,
                fee: 0,
                feeCurrency: 'USD',
                status: this._mapStatus(data.status),
                timestamp: new Date(),
            };
            await this._auditLog('ORDER_PLACED', {
                orderId: data.id,
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                quantity: order.quantity,
                filledQuantity: executionResult.filledQuantity,
                averagePrice: executionResult.averagePrice,
            });
            this.logger.log(`✅ Alpaca order executed: ${data.id} — ${order.side} ${executionResult.filledQuantity}/${order.quantity} ${order.symbol}`);
            return executionResult;
        }
        catch (error) {
            const errorMessage = error.response?.data?.message || error.message;
            this.logger.error(`❌ Alpaca order failed: ${errorMessage}`);
            await this._auditLog('ORDER_FAILED', {
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                quantity: order.quantity,
                error: errorMessage,
            });
            return {
                success: false,
                error: this._normalizeError(error),
                timestamp: new Date(),
            };
        }
    }
    async cancelOrder(orderId, symbol) {
        this.logger.log(`🗑️ Cancelling Alpaca order: ${orderId}`);
        try {
            await this.httpClient.delete(`/v2/orders/${orderId}`);
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
            const response = await this.httpClient.get(`/v2/orders/${orderId}`);
            return this._mapStatus(response.data.status);
        }
        catch (error) {
            this.logger.error(`Failed to get order status ${orderId}: ${error.message}`);
            return base_adapter_interface_1.OrderExecutionStatus.PENDING;
        }
    }
    async fetchOpenOrders(symbol) {
        try {
            const params = { status: 'open' };
            if (symbol) {
                params.symbols = JSON.stringify([symbol.replace('/', '')]);
            }
            const response = await this.httpClient.get('/v2/orders', { params });
            return (response.data || []).map((o) => this._toUnifiedOrder(o));
        }
        catch (error) {
            this.logger.error(`Failed to fetch open orders: ${error.message}`);
            return [];
        }
    }
    async fetchBalance() {
        try {
            const response = await this.httpClient.get('/v2/account');
            const data = response.data;
            const balances = {
                USD: {
                    free: parseFloat(data.cash) || 0,
                    used: parseFloat(data.position_market_value) || 0,
                    total: parseFloat(data.equity) || 0,
                },
            };
            return {
                totalEquity: parseFloat(data.equity) || 0,
                availableBalance: parseFloat(data.cash) || 0,
                usedMargin: parseFloat(data.position_market_value) || 0,
                currency: 'USD',
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
                currency: 'USD',
                balances: {},
                timestamp: new Date(),
            };
        }
    }
    getExchangeId() {
        return 'alpaca';
    }
    supportsWebSocket() {
        return true;
    }
    getRateLimits() {
        return this.rateLimits;
    }
    _mapStatus(status) {
        const mapping = {
            'new': base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
            'partially_filled': base_adapter_interface_1.OrderExecutionStatus.PARTIALLY_FILLED,
            'filled': base_adapter_interface_1.OrderExecutionStatus.FILLED,
            'done_for_day': base_adapter_interface_1.OrderExecutionStatus.PARTIALLY_FILLED,
            'canceled': base_adapter_interface_1.OrderExecutionStatus.CANCELLED,
            'cancelled': base_adapter_interface_1.OrderExecutionStatus.CANCELLED,
            'rejected': base_adapter_interface_1.OrderExecutionStatus.REJECTED,
            'expired': base_adapter_interface_1.OrderExecutionStatus.EXPIRED,
            'replaced': base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
            'pending_replace': base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
            'pending_cancel': base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
            'pending_new': base_adapter_interface_1.OrderExecutionStatus.PENDING,
            'accepted': base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
            'accepted_for_bidding': base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
            'stopped': base_adapter_interface_1.OrderExecutionStatus.ACCEPTED,
            'suspended': base_adapter_interface_1.OrderExecutionStatus.PENDING,
            'calculated': base_adapter_interface_1.OrderExecutionStatus.PARTIALLY_FILLED,
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
            quantity: parseFloat(o.qty) || 0,
            price: o.limit_price ? parseFloat(o.limit_price) : undefined,
            stopLoss: o.stop_price ? parseFloat(o.stop_price) : undefined,
            idempotencyKey: o.client_order_id || o.id,
            clientOrderId: o.client_order_id,
        };
    }
    _normalizeError(error) {
        const message = error.response?.data?.message || error.message || 'Unknown error';
        if (message.includes('insufficient') || message.includes('buying power')) {
            return 'رصيد غير كافي في حساب Alpaca';
        }
        if (message.includes('invalid symbol')) {
            return 'رمز السهم غير صالح';
        }
        if (message.includes('rate limit') || message.includes('too many')) {
            return 'تم تجاوز حد الطلبات — حاول بعد قليل';
        }
        if (message.includes('market is closed') || message.includes('not open')) {
            return 'السوق مغلق حالياً — لا يمكن تنفيذ الطلب';
        }
        if (message.includes('authentication') || message.includes('API key')) {
            return 'فشل المصادقة — مفتاح API غير صالح';
        }
        return message;
    }
    async _auditLog(action, details) {
        try {
            await this.auditService.log({
                userId: this.userId,
                action: `ALPACA_${action}`,
                resource: 'execution-adapter',
                details: JSON.stringify(details),
            });
        }
        catch {
        }
    }
};
exports.AlpacaAdapter = AlpacaAdapter;
exports.AlpacaAdapter = AlpacaAdapter = AlpacaAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [String, String, audit_service_1.AuditService, String, Boolean])
], AlpacaAdapter);
//# sourceMappingURL=alpaca.adapter.js.map