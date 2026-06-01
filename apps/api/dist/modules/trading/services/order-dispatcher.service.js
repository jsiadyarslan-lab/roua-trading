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
var OrderDispatcherService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderDispatcherService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const idempotency_service_1 = require("./idempotency.service");
const risk_gatekeeper_service_1 = require("./risk-gatekeeper.service");
const order_state_manager_service_1 = require("./order-state-manager.service");
const trading_service_1 = require("../trading.service");
const trading_types_1 = require("../trading.types");
const crypto = __importStar(require("crypto"));
let OrderDispatcherService = OrderDispatcherService_1 = class OrderDispatcherService {
    constructor(prisma, redis, idempotency, riskGatekeeper, stateManager, tradingService) {
        this.prisma = prisma;
        this.redis = redis;
        this.idempotency = idempotency;
        this.riskGatekeeper = riskGatekeeper;
        this.stateManager = stateManager;
        this.tradingService = tradingService;
        this.logger = new common_1.Logger(OrderDispatcherService_1.name);
    }
    async submitOrder(request) {
        const briefRef = request.briefId || request.signalId || 'manual';
        const sourceKey = `${request.source}:${request.userId}:${briefRef}:${request.symbol}:${request.side}`;
        const sourceIdempotencyKey = crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 32);
        const symbolSourceKey = `${request.source}:${request.userId}:${request.symbol}:${request.side}`;
        const symbolSourceIdempotencyKey = crypto.createHash('sha256').update(symbolSourceKey).digest('hex').slice(0, 32);
        const isUnique = await this.idempotency.checkAndLock(sourceIdempotencyKey, request.timeframe);
        if (!isUnique) {
            return { success: false, message: `أمر مكرر — ${request.symbol} ${request.side} (${request.source})` };
        }
        const isSymbolUnique = await this.idempotency.checkAndLock(symbolSourceIdempotencyKey, request.timeframe);
        if (!isSymbolUnique) {
            try {
                await this.idempotency.releaseLock(sourceIdempotencyKey);
            }
            catch { }
            return { success: false, message: `مركز نشط على ${request.symbol} ${request.side} من ${request.source}` };
        }
        try {
            if (!request.stopLoss || request.stopLoss <= 0) {
                await this.idempotency.releaseLock(sourceIdempotencyKey);
                try {
                    await this.idempotency.releaseLock(symbolSourceIdempotencyKey);
                }
                catch { }
                return { success: false, error: `وقف الخسارة إجباري` };
            }
            const existing = await this.prisma.position.findFirst({
                where: { userId: request.userId, symbol: request.symbol, status: 'OPEN' },
            });
            if (existing) {
                if (existing.side === request.side && existing.source === request.source) {
                    await this.idempotency.releaseLock(sourceIdempotencyKey);
                    try {
                        await this.idempotency.releaseLock(symbolSourceIdempotencyKey);
                    }
                    catch { }
                    return { success: false, message: `مركز ${existing.side} مفتوح بالفعل لـ ${request.symbol} (مصدر: ${existing.source})` };
                }
                if (existing.side === request.side && existing.source !== request.source) {
                    this.logger.log(`[Dispatcher] V146b Cross-source same-direction allowed: ${request.symbol} has ${existing.side}/${existing.source}, ${request.source} opening ${request.side}`);
                }
                else if (existing.side !== request.side && existing.source !== request.source) {
                    this.logger.log(`[Dispatcher] V146c Cross-source hedge allowed: ${request.symbol} has ${existing.side}/${existing.source}, ${request.source} opening ${request.side}`);
                }
                else if (request.isPaperTrading) {
                    this.logger.log(`[Dispatcher] V133 Paper hedge allowed: ${request.symbol} has ${existing.side}, opening ${request.side}`);
                }
                else {
                    await this.idempotency.releaseLock(sourceIdempotencyKey);
                    try {
                        await this.idempotency.releaseLock(symbolSourceIdempotencyKey);
                    }
                    catch { }
                    return { success: false, message: `مركز مفتوح بالفعل لـ ${request.symbol} (لا تحوط في التداول الحقيقي)` };
                }
            }
            const command = {
                userId: request.userId,
                exchangeCredentialId: request.credentialId,
                symbol: request.symbol,
                side: request.side === 'BUY' ? trading_types_1.OrderSide.BUY : trading_types_1.OrderSide.SELL,
                type: trading_types_1.OrderType.MARKET,
                quantity: request.quantity,
                price: request.price,
                stopLoss: request.stopLoss ?? 0,
                takeProfit: request.takeProfit,
                idempotencyKey: sourceIdempotencyKey,
                clientOrderId: `${request.source}-${briefRef}-${Date.now()}`,
                isPaperTrading: request.isPaperTrading ?? false,
                source: request.source,
            };
            const riskCheck = await this.riskGatekeeper.validateOrder(command);
            if (!riskCheck.allowed) {
                await this.idempotency.releaseLock(sourceIdempotencyKey);
                try {
                    await this.idempotency.releaseLock(symbolSourceIdempotencyKey);
                }
                catch { }
                return { success: false, error: `مرفوض: ${riskCheck.reason}` };
            }
            const result = await this.tradingService.placeOrder(request.userId, {
                credentialId: request.credentialId,
                symbol: request.symbol,
                side: request.side === 'BUY' ? 'BUY' : 'SELL',
                type: 'MARKET',
                quantity: request.quantity,
                price: request.price,
                stopLoss: request.stopLoss,
                takeProfit: request.takeProfit,
                source: request.source,
            });
            this.logger.log(`✅ [${request.source}] ${request.symbol} ${request.side} | orderId: ${result?.id}`);
            return { success: true, orderId: result?.id || 'unknown' };
        }
        catch (err) {
            this.logger.error(`[Dispatcher] ${err.message}`);
            try {
                await this.idempotency.releaseLock(sourceIdempotencyKey);
            }
            catch { }
            try {
                await this.idempotency.releaseLock(symbolSourceIdempotencyKey);
            }
            catch { }
            return { success: false, error: err.message };
        }
    }
    async getActiveOrders(userId) {
        try {
            return await this.prisma.order.findMany({
                where: { userId, status: { in: ['PENDING', 'ACCEPTED'] } },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });
        }
        catch {
            return [];
        }
    }
};
exports.OrderDispatcherService = OrderDispatcherService;
exports.OrderDispatcherService = OrderDispatcherService = OrderDispatcherService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        idempotency_service_1.IdempotencyService,
        risk_gatekeeper_service_1.RiskGatekeeperService,
        order_state_manager_service_1.OrderStateManagerService,
        trading_service_1.TradingService])
], OrderDispatcherService);
//# sourceMappingURL=order-dispatcher.service.js.map