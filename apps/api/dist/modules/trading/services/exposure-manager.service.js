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
var ExposureManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExposureManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const DEFAULT_LIMITS = {
    maxTotalPositions: 20,
    maxExposurePercent: 80,
    onePositionPerSymbol: true,
};
let ExposureManagerService = ExposureManagerService_1 = class ExposureManagerService {
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
        this.logger = new common_1.Logger(ExposureManagerService_1.name);
        this.POSITION_LOCK_PREFIX = 'position-lock:';
        this.logger.log('🛡️ Exposure Manager initialized — unified cross-system exposure tracking with Redis locks');
    }
    async canOpenPosition(userId, symbol, side, estimatedValue, limits = {}) {
        const effectiveLimits = { ...DEFAULT_LIMITS, ...limits };
        const lockKey = `${this.POSITION_LOCK_PREFIX}${userId}:${symbol}`;
        const lockTtlMs = 30000;
        let lockAcquired = false;
        try {
            lockAcquired = await this.redis.setIfNotExists(lockKey, `${side}:${Date.now()}`, Math.ceil(lockTtlMs / 1000));
            if (!lockAcquired) {
                this.logger.warn(`🛡️ Position lock contention: ${userId}:${symbol} — another system is already opening a position`);
                return {
                    allowed: false,
                    reason: `نظام آخر يفتح مركزاً على ${symbol} حالياً — يُعاد المحاولة لاحقاً`,
                    totalOpenPositions: -1,
                    totalExposure: 0,
                    positionsBySource: {},
                    existingPositionOnSymbol: true,
                };
            }
            const openPositions = await this.prisma.position.findMany({
                where: {
                    userId,
                    status: 'OPEN',
                    entryPrice: { gt: 0 },
                },
                select: {
                    id: true,
                    symbol: true,
                    side: true,
                    quantity: true,
                    entryPrice: true,
                    source: true,
                },
            });
            const totalOpenPositions = openPositions.length;
            const positionsBySource = {};
            for (const pos of openPositions) {
                const src = pos.source || 'unknown';
                positionsBySource[src] = (positionsBySource[src] || 0) + 1;
            }
            const totalExposure = openPositions.reduce((sum, pos) => {
                return sum + Number(pos.quantity) * Number(pos.entryPrice);
            }, 0);
            const existingPositionOnSymbol = openPositions.some((pos) => pos.symbol === symbol);
            if (totalOpenPositions >= effectiveLimits.maxTotalPositions) {
                return {
                    allowed: false,
                    reason: `تم الوصول للحد الأقصى للمراكز المفتوحة (${totalOpenPositions}/${effectiveLimits.maxTotalPositions}) — عبر كل المصادر: ${JSON.stringify(positionsBySource)}`,
                    totalOpenPositions,
                    totalExposure,
                    positionsBySource,
                    existingPositionOnSymbol,
                };
            }
            if (effectiveLimits.onePositionPerSymbol && existingPositionOnSymbol) {
                const existingOnSymbol = openPositions.find(p => p.symbol === symbol);
                const positionsOnSymbol = openPositions.filter(p => p.symbol === symbol).length;
                if (positionsOnSymbol < 2) {
                    this.logger.debug(`🛡️ Hedge allowed: ${symbol} has ${positionsOnSymbol} position(s), allowing 1 more`);
                }
                else {
                    const existingSource = existingOnSymbol?.source || 'unknown';
                    return {
                        allowed: false,
                        reason: `يوجد مركز مفتوح بالفعل على ${symbol} (من ${existingSource}) — القاعدة: مركز واحد لكل زوج`,
                        totalOpenPositions,
                        totalExposure,
                        positionsBySource,
                        existingPositionOnSymbol,
                    };
                }
            }
            const portfolioValue = await this._getPortfolioValue(userId);
            if (portfolioValue > 0) {
                const maxExposure = portfolioValue * (effectiveLimits.maxExposurePercent / 100);
                const newTotalExposure = totalExposure + estimatedValue;
                if (newTotalExposure > maxExposure) {
                    return {
                        allowed: false,
                        reason: `التعرض الكلي سيتجاوز الحد: $${newTotalExposure.toFixed(2)} > $${maxExposure.toFixed(2)} (${effectiveLimits.maxExposurePercent}% من المحفظة $${portfolioValue.toFixed(2)})`,
                        totalOpenPositions,
                        totalExposure,
                        positionsBySource,
                        existingPositionOnSymbol,
                    };
                }
            }
            return {
                allowed: true,
                totalOpenPositions,
                totalExposure,
                positionsBySource,
                existingPositionOnSymbol,
            };
        }
        catch (error) {
            this.logger.error(`🛡️ Exposure check FAILED (fail-closed): ${error.message}`);
            return {
                allowed: false,
                reason: `فشل فحص التعرض (مرفوض احتياطياً): ${error.message}`,
                totalOpenPositions: -1,
                totalExposure: 0,
                positionsBySource: {},
                existingPositionOnSymbol: true,
            };
        }
    }
    async releasePositionLock(userId, symbol) {
        try {
            const lockKey = `${this.POSITION_LOCK_PREFIX}${userId}:${symbol}`;
            await this.redis.del(lockKey);
        }
        catch { }
    }
    async getExposureSummary(userId) {
        try {
            const openPositions = await this.prisma.position.findMany({
                where: {
                    userId,
                    status: 'OPEN',
                    entryPrice: { gt: 0 },
                },
                select: {
                    symbol: true,
                    quantity: true,
                    entryPrice: true,
                    source: true,
                },
            });
            const positionsBySource = {};
            const symbols = [];
            let totalExposure = 0;
            for (const pos of openPositions) {
                const src = pos.source || 'unknown';
                positionsBySource[src] = (positionsBySource[src] || 0) + 1;
                totalExposure += Number(pos.quantity) * Number(pos.entryPrice);
                if (!symbols.includes(pos.symbol)) {
                    symbols.push(pos.symbol);
                }
            }
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            let dailyPnL = 0;
            try {
                const todayTrades = await this.prisma.trade.findMany({
                    where: {
                        userId,
                        executedAt: { gte: todayStart },
                        type: { in: ['EXIT', 'PARTIAL_EXIT'] },
                        pnl: { not: null },
                    },
                    select: { pnl: true },
                });
                dailyPnL = todayTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
            }
            catch { }
            return {
                totalOpenPositions: openPositions.length,
                totalExposure,
                positionsBySource,
                dailyPnL,
                symbols,
            };
        }
        catch (error) {
            this.logger.warn(`🛡️ Failed to get exposure summary: ${error.message}`);
            return {
                totalOpenPositions: 0,
                totalExposure: 0,
                positionsBySource: {},
                dailyPnL: 0,
                symbols: [],
            };
        }
    }
    async _getPortfolioValue(userId) {
        try {
            const agentSettings = await this.prisma.agentSettings.findUnique({
                where: { userId },
                select: { paperBalance: true },
            });
            if (agentSettings && Number(agentSettings.paperBalance) > 0) {
                return Number(agentSettings.paperBalance);
            }
            const portfolio = await this.prisma.portfolio.aggregate({
                where: { userId },
                _sum: { totalValue: true },
            });
            const totalValue = Number(portfolio._sum.totalValue || 0);
            if (totalValue > 0) {
                return totalValue;
            }
            return 10000;
        }
        catch {
            return 10000;
        }
    }
};
exports.ExposureManagerService = ExposureManagerService;
exports.ExposureManagerService = ExposureManagerService = ExposureManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], ExposureManagerService);
//# sourceMappingURL=exposure-manager.service.js.map