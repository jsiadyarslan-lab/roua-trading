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
var PositionManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const aggregator_service_1 = require("../../analytics/aggregator.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const symbol_metadata_1 = require("./symbol-metadata");
let PositionManagerService = PositionManagerService_1 = class PositionManagerService {
    constructor(prisma, aggregator, redis) {
        this.prisma = prisma;
        this.aggregator = aggregator;
        this.redis = redis;
        this.logger = new common_1.Logger(PositionManagerService_1.name);
        this.DAILY_PNL_TTL_MS = 60_000;
        this.logger.log('📊 Position Manager initialized — tracking across all exchanges');
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
        const quoteResults = await Promise.allSettled(positions.map((position) => this.aggregator.getAggregatedQuote(position.symbol)));
        const positionInfos = [];
        const dbUpdates = [];
        for (let i = 0; i < positions.length; i++) {
            const position = positions[i];
            const result = quoteResults[i];
            if (result.status === 'fulfilled') {
                const currentPrice = result.value.price;
                dbUpdates.push({
                    id: position.id,
                    currentPrice,
                    highestPrice: Math.max(Number(position.highestPrice || currentPrice), currentPrice),
                    lowestPrice: Math.min(Number(position.lowestPrice || currentPrice), currentPrice),
                });
                const unrealizedPnL = this.calculateUnrealizedPnL({
                    side: position.side,
                    entryPrice: Number(position.entryPrice),
                    currentPrice,
                    quantity: Number(position.quantity),
                });
                positionInfos.push({
                    id: position.id,
                    symbol: position.symbol,
                    side: position.side,
                    quantity: Number(position.quantity),
                    entryPrice: Number(position.entryPrice),
                    currentPrice,
                    unrealizedPnL,
                    stopLoss: position.stopLoss != null ? Number(position.stopLoss) : null,
                    takeProfit: position.takeProfit != null ? Number(position.takeProfit) : null,
                    exchange: position.exchange,
                    openedAt: position.openedAt,
                });
            }
            else {
                const unrealizedPnL = this.calculateUnrealizedPnL({
                    side: position.side,
                    entryPrice: Number(position.entryPrice),
                    currentPrice: Number(position.currentPrice || position.entryPrice),
                    quantity: Number(position.quantity),
                });
                positionInfos.push({
                    id: position.id,
                    symbol: position.symbol,
                    side: position.side,
                    quantity: Number(position.quantity),
                    entryPrice: Number(position.entryPrice),
                    currentPrice: Number(position.currentPrice || position.entryPrice),
                    unrealizedPnL,
                    stopLoss: position.stopLoss != null ? Number(position.stopLoss) : null,
                    takeProfit: position.takeProfit != null ? Number(position.takeProfit) : null,
                    exchange: position.exchange,
                    openedAt: position.openedAt,
                });
            }
        }
        if (dbUpdates.length > 0) {
            await this.prisma.$transaction(dbUpdates.map((u) => this.prisma.position.update({
                where: { id: u.id },
                data: {
                    currentPrice: u.currentPrice,
                    highestPrice: u.highestPrice,
                    lowestPrice: u.lowestPrice,
                },
            })));
        }
        return positionInfos;
    }
    calculateUnrealizedPnL(position) {
        if (position.side === 'BUY') {
            return (position.currentPrice - position.entryPrice) * position.quantity;
        }
        else {
            return (position.entryPrice - position.currentPrice) * position.quantity;
        }
    }
    async getPortfolioSummary(userId) {
        const portfolios = await this.prisma.portfolio.aggregate({
            where: { userId },
            _sum: { totalValue: true },
        });
        const baseBalance = Number(portfolios._sum.totalValue || 0);
        const positions = await this.getOpenPositions(userId);
        const totalExposure = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
        const usedMargin = positions.reduce((sum, p) => sum + (0, symbol_metadata_1.calculateMargin)(p.quantity, p.currentPrice, p.symbol), 0);
        const unrealizedPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
        const dailyPnL = await this.getDailyPnL(userId);
        const totalBalance = baseBalance + totalExposure;
        const dailyPnLPercent = totalBalance > 0
            ? (dailyPnL / totalBalance) * 100
            : 0;
        const allTimeTrades = await this.prisma.trade.findMany({
            where: { userId, type: { in: ['EXIT', 'PARTIAL_EXIT'] } },
            orderBy: { executedAt: 'asc' },
        });
        let peak = 0;
        let cumulativePnL = 0;
        let maxDrawdown = 0;
        for (const trade of allTimeTrades) {
            cumulativePnL += Number(trade.pnl || 0);
            peak = Math.max(peak, cumulativePnL);
            const drawdown = peak - cumulativePnL;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
        const maxDrawdownPercent = totalBalance > 0
            ? (maxDrawdown / totalBalance) * 100
            : 0;
        return {
            totalBalance,
            dailyPnL,
            dailyPnLPercent,
            totalExposure,
            usedMargin,
            openPositionsCount: positions.length,
            maxDrawdownPercent,
            unrealizedPnL,
            positions,
        };
    }
    async getDailyPnL(userId) {
        const cacheKey = `daily:pnl:${userId}`;
        try {
            const cached = await this.redis?.get(cacheKey);
            if (cached !== null && cached !== undefined) {
                const parsed = parseFloat(cached);
                if (!isNaN(parsed))
                    return parsed;
            }
        }
        catch { }
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTrades = await this.prisma.trade.findMany({
            where: {
                userId,
                executedAt: { gte: todayStart },
                type: { in: ['EXIT', 'PARTIAL_EXIT'] },
            },
        });
        const dailyPnL = todayTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
        try {
            await this.redis?.set(cacheKey, dailyPnL.toString(), this.DAILY_PNL_TTL_MS);
        }
        catch { }
        return dailyPnL;
    }
};
exports.PositionManagerService = PositionManagerService;
exports.PositionManagerService = PositionManagerService = PositionManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        aggregator_service_1.MarketDataAggregatorService,
        redis_service_1.RedisService])
], PositionManagerService);
//# sourceMappingURL=position-manager.service.js.map