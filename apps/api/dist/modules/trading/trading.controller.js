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
var TradingController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingController = void 0;
const common_1 = require("@nestjs/common");
const trading_service_1 = require("./trading.service");
const risk_manager_service_1 = require("./risk-manager.service");
const risk_gatekeeper_service_1 = require("./services/risk-gatekeeper.service");
const auth_guard_1 = require("../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
const trading_types_1 = require("./trading.types");
let TradingController = TradingController_1 = class TradingController {
    constructor(tradingService, riskManager, riskGatekeeper) {
        this.tradingService = tradingService;
        this.riskManager = riskManager;
        this.riskGatekeeper = riskGatekeeper;
        this.logger = new common_1.Logger(TradingController_1.name);
    }
    async getAccountOverview(req) {
        try {
            const userId = req.user.id;
            return await this.tradingService.getPositionSummary(userId);
        }
        catch (error) {
            this.logger.error(`❌ Failed to fetch account overview: ${error.message}`, error.stack);
            throw error;
        }
    }
    async placeOrder(req, body) {
        const userId = req.user.id;
        const request = {
            credentialId: body.credentialId,
            symbol: body.symbol,
            side: body.side,
            type: body.type,
            quantity: Number(body.quantity),
            price: body.price != null ? Number(body.price) : undefined,
            stopLoss: body.stopLoss != null ? Number(body.stopLoss) : undefined,
            takeProfit: body.takeProfit != null ? Number(body.takeProfit) : undefined,
            signalId: body.signalId,
        };
        if (!request.credentialId ||
            !request.symbol ||
            !request.side ||
            !request.type ||
            !request.quantity) {
            throw new common_1.BadRequestException('بيانات الطلب غير مكتملة — يرجى تعبئة جميع الحقول المطلوبة');
        }
        if (!['BUY', 'SELL'].includes(request.side)) {
            throw new common_1.BadRequestException('جانب الطلب يجب أن يكون BUY أو SELL');
        }
        if (!['MARKET', 'LIMIT'].includes(request.type)) {
            throw new common_1.BadRequestException('نوع الطلب غير صالح');
        }
        if (request.quantity <= 0) {
            throw new common_1.BadRequestException('الكمية يجب أن تكون أكبر من صفر');
        }
        if (!body.stopLoss || Number(body.stopLoss) <= 0) {
            throw new common_1.BadRequestException('وقف الخسارة إجباري. لا يمكن تقديم أمر بدون وقف خسارة — هذا القانون الأول في منصة رؤى.');
        }
        const riskResult = await this.riskGatekeeper.validateOrder({
            userId,
            exchangeCredentialId: request.credentialId,
            symbol: request.symbol,
            side: request.side,
            type: request.type,
            quantity: request.quantity,
            price: request.price,
            stopLoss: request.stopLoss,
            idempotencyKey: `v1-${userId}-${request.symbol}-${request.side}-${request.type}-${request.quantity}-${request.price || 'market'}-${Math.floor(Date.now() / 1000)}`,
        });
        if (!riskResult.allowed) {
            throw new common_1.ForbiddenException(`🛡️ تم رفض الطلب: ${riskResult.reason || 'فشل في فحص المخاطر'}`);
        }
        return this.tradingService.placeOrder(userId, request, req.ip, req.headers['user-agent']);
    }
    async cancelOrder(req, orderId) {
        return this.tradingService.cancelOrder(req.user.id, orderId, req.ip, req.headers['user-agent']);
    }
    async getOrders(req, symbol, status, limit) {
        return this.tradingService.getOrders(req.user.id, {
            symbol,
            status,
            limit: limit ? (parseInt(limit, 10) || 50) : undefined,
        });
    }
    async getOrder(req, orderId) {
        return this.tradingService.getOrder(req.user.id, orderId);
    }
    async getOpenPositions(req) {
        try {
            const userId = req.user.id;
            this.logger.log(`📋 Fetching open positions for user: ${userId}`);
            const positions = await this.tradingService.getOpenPositions(userId);
            this.logger.log(`📋 Found ${positions.length} open positions`);
            return positions;
        }
        catch (error) {
            this.logger.error(`❌ Failed to fetch open positions: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getTradingHistory(req, limit, from, to) {
        try {
            const userId = req.user.id;
            this.logger.log(`📋 Fetching trading history for user: ${userId}`);
            const positions = await this.tradingService.getClosedPositions(userId, limit ? (parseInt(limit, 10) || 50) : 50, from, to);
            const trades = (Array.isArray(positions) ? positions : []).map((p) => {
                const lastTrade = p.trades?.length > 0 ? p.trades[p.trades.length - 1] : null;
                return {
                    id: p.id,
                    symbol: p.symbol,
                    side: p.side?.toLowerCase() === 'buy' ? 'long' : 'short',
                    entryPrice: Number(p.entryPrice) || 0,
                    exitPrice: lastTrade ? Number(lastTrade.price) : (Number(p.exitPrice) || 0),
                    qty: Number(p.quantity) || 0,
                    realizedPnl: Number(p.realizedPnl) || 0,
                    realizedPct: p.entryPrice > 0 ? ((Number(p.realizedPnl) || 0) / (Number(p.entryPrice) * Number(p.quantity))) * 100 : 0,
                    closeTime: p.closedAt ? new Date(p.closedAt).getTime() : Date.now(),
                    status: p.status,
                };
            });
            return { success: true, trades };
        }
        catch (error) {
            this.logger.error(`❌ Failed to fetch trading history: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getClosedPositions(req, limit, from, to) {
        try {
            const userId = req.user.id;
            this.logger.log(`📋 Fetching closed positions for user: ${userId}, from: ${from || 'all'}, to: ${to || 'all'}`);
            return await this.tradingService.getClosedPositions(userId, limit ? (parseInt(limit, 10) || 100) : 100, from, to);
        }
        catch (error) {
            this.logger.error(`❌ Failed to fetch closed positions: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getAllPositions(req, limit) {
        try {
            const userId = req.user.id;
            this.logger.log(`📋 Fetching all positions for user: ${userId}`);
            return await this.tradingService.getAllPositions(userId, limit ? (parseInt(limit, 10) || 100) : 100);
        }
        catch (error) {
            this.logger.error(`❌ Failed to fetch all positions: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getPositionSummary(req) {
        try {
            const userId = req.user.id;
            return await this.tradingService.getPositionSummary(userId);
        }
        catch (error) {
            this.logger.error(`❌ Failed to fetch position summary: ${error.message}`, error.stack);
            throw error;
        }
    }
    async closePosition(req, body) {
        const request = {
            positionId: body.positionId,
            quantity: body.quantity != null ? Number(body.quantity) : undefined,
            closeReason: 'MANUAL',
        };
        if (!request.positionId) {
            throw new common_1.BadRequestException('معرف المركز مطلوب');
        }
        return this.tradingService.closePositionWithRetry(req.user.id, request, req.ip, req.headers['user-agent'], 3);
    }
    async forceClosePosition(req, body) {
        const positionId = body.positionId;
        const reason = body.reason || 'User requested force close';
        if (!positionId) {
            throw new common_1.BadRequestException('معرف المركز مطلوب');
        }
        return this.tradingService.forceClosePosition(req.user.id, positionId, reason, req.ip, req.headers['user-agent']);
    }
    async updatePositionLevels(req, positionId, body) {
        return this.tradingService.updatePositionLevels(req.user.id, positionId, {
            stopLoss: body.stopLoss ? parseFloat(body.stopLoss) : undefined,
            takeProfit: body.takeProfit ? parseFloat(body.takeProfit) : undefined,
        });
    }
    async getTradeHistory(req, limit, from, to) {
        try {
            const userId = req.user.id;
            return await this.tradingService.getTradeHistory(userId, limit ? (parseInt(limit, 10) || 50) : 50, from, to);
        }
        catch (error) {
            this.logger.error(`❌ Failed to fetch trade history: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getRiskParameters() {
        return this.riskManager.getRiskParameters();
    }
    async calculatePositionSize(body) {
        const portfolioValue = parseFloat(body.portfolioValue) || 0;
        const entryPrice = parseFloat(body.entryPrice) || 0;
        const stopLossPrice = parseFloat(body.stopLossPrice) || 0;
        const riskPercent = parseFloat(body.riskPercent) || 1;
        if (!portfolioValue || !entryPrice || !stopLossPrice) {
            throw new common_1.BadRequestException('قيمة المحفظة وسعر الدخول ووقف الخسارة مطلوبة');
        }
        return this.riskManager.calculatePositionSize(portfolioValue, entryPrice, stopLossPrice, riskPercent);
    }
};
exports.TradingController = TradingController;
__decorate([
    (0, common_1.Get)('account'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getAccountOverview", null);
__decorate([
    (0, common_1.Post)('orders'),
    (0, throttler_1.Throttle)({ medium: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, trading_types_1.PlaceOrderDto]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "placeOrder", null);
__decorate([
    (0, common_1.Delete)('orders/:id'),
    (0, throttler_1.Throttle)({ medium: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "cancelOrder", null);
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('symbol')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getOrders", null);
__decorate([
    (0, common_1.Get)('orders/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Get)('positions'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getOpenPositions", null);
__decorate([
    (0, common_1.Get)('history'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getTradingHistory", null);
__decorate([
    (0, common_1.Get)('positions/history'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getClosedPositions", null);
__decorate([
    (0, common_1.Get)('positions/all'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getAllPositions", null);
__decorate([
    (0, common_1.Get)('positions/summary'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getPositionSummary", null);
__decorate([
    (0, common_1.Post)('positions/close'),
    (0, throttler_1.Throttle)({ medium: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, trading_types_1.ClosePositionDto]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "closePosition", null);
__decorate([
    (0, common_1.Post)('positions/force-close'),
    (0, throttler_1.Throttle)({ medium: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "forceClosePosition", null);
__decorate([
    (0, common_1.Post)('positions/:id/levels'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "updatePositionLevels", null);
__decorate([
    (0, common_1.Get)('trades'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getTradeHistory", null);
__decorate([
    (0, common_1.Get)('risk/parameters'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "getRiskParameters", null);
__decorate([
    (0, common_1.Post)('risk/position-size'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TradingController.prototype, "calculatePositionSize", null);
exports.TradingController = TradingController = TradingController_1 = __decorate([
    (0, common_1.Controller)('trading'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [trading_service_1.TradingService,
        risk_manager_service_1.RiskManagerService,
        risk_gatekeeper_service_1.RiskGatekeeperService])
], TradingController);
//# sourceMappingURL=trading.controller.js.map