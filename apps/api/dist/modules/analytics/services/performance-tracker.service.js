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
var PerformanceTrackerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceTrackerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
let PerformanceTrackerService = PerformanceTrackerService_1 = class PerformanceTrackerService {
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
        this.logger = new common_1.Logger(PerformanceTrackerService_1.name);
        this.DAILY_LOSS_LIMIT_PCT = 0.05;
        this.MIN_TRADES_FOR_KELLY = 20;
    }
    async updatePerformanceCache() {
        try {
            const userId = await this._getFirstActiveUser();
            if (!userId)
                return;
            await this.getSystemHealth(userId);
        }
        catch (err) {
            this.logger.debug(`Performance cache update: ${err.message}`);
        }
    }
    async getSourcePerformance(userId, source, daysSince = 30) {
        const since = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const trades = await this.prisma.trade.findMany({
            where: {
                userId,
                source,
                executedAt: { gte: since },
                pnl: { not: null },
            },
            orderBy: { executedAt: 'asc' },
        });
        const dailyTrades = await this.prisma.trade.findMany({
            where: { userId, source, executedAt: { gte: today }, pnl: { not: null } },
        });
        const dailyPnL = dailyTrades.reduce((s, t) => s + Number(t.pnl || 0), 0);
        const portfolio = await this.prisma.portfolio.findFirst({ where: { userId } });
        const portfolioValue = Number(portfolio?.totalValue || 10000);
        const dailyPnLPercent = portfolioValue > 0 ? dailyPnL / portfolioValue : 0;
        if (trades.length === 0) {
            return this._emptyPerformance(source, dailyPnL, dailyPnLPercent);
        }
        const pnls = trades.map(t => Number(t.pnl || 0));
        const winners = pnls.filter(p => p > 0);
        const losers = pnls.filter(p => p < 0);
        const totalPnL = pnls.reduce((s, p) => s + p, 0);
        const winRate = winners.length / pnls.length;
        const avgWin = winners.length > 0 ? winners.reduce((s, p) => s + p, 0) / winners.length : 0;
        const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s, p) => s + p, 0) / losers.length) : 0;
        const profitFactor = avgLoss > 0 ? (winRate * avgWin) / ((1 - winRate) * avgLoss) : 0;
        let peak = 0, maxDrawdown = 0, cumPnl = 0;
        for (const pnl of pnls) {
            cumPnl += pnl;
            if (cumPnl > peak)
                peak = cumPnl;
            const dd = peak - cumPnl;
            if (dd > maxDrawdown)
                maxDrawdown = dd;
        }
        let sharpeRatio = null;
        if (pnls.length >= 10) {
            const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length;
            const variance = pnls.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / pnls.length;
            const stdDev = Math.sqrt(variance);
            sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : null;
        }
        let kellyPercent = 0;
        if (trades.length >= this.MIN_TRADES_FOR_KELLY && avgLoss > 0) {
            const R = avgWin / avgLoss;
            kellyPercent = Math.max(0, Math.min(25, (winRate - (1 - winRate) / R) * 100));
            kellyPercent = kellyPercent / 2;
        }
        else {
            kellyPercent = 2;
        }
        const autoStopTriggered = dailyPnLPercent <= -this.DAILY_LOSS_LIMIT_PCT;
        return {
            source,
            totalTrades: trades.length,
            winningTrades: winners.length,
            losingTrades: losers.length,
            winRate: Math.round(winRate * 1000) / 10,
            avgWin: Math.round(avgWin * 100) / 100,
            avgLoss: Math.round(avgLoss * 100) / 100,
            profitFactor: Math.round(profitFactor * 100) / 100,
            totalPnL: Math.round(totalPnL * 100) / 100,
            maxDrawdown: Math.round(maxDrawdown * 100) / 100,
            sharpeRatio: sharpeRatio !== null ? Math.round(sharpeRatio * 100) / 100 : null,
            kellyPercent: Math.round(kellyPercent * 10) / 10,
            dailyPnL: Math.round(dailyPnL * 100) / 100,
            dailyPnLPercent: Math.round(dailyPnLPercent * 10000) / 100,
            autoStopTriggered,
            lastUpdated: new Date(),
        };
    }
    async getSystemHealth(userId) {
        const [executorPerf, agentPerf] = await Promise.all([
            this.getSourcePerformance(userId, 'smart_executor'),
            this.getSourcePerformance(userId, 'agent'),
        ]);
        const combined = await this.getSourcePerformance(userId, 'combined_all', 30);
        const autoStopActive = executorPerf.autoStopTriggered || agentPerf.autoStopTriggered;
        let recommendation = '';
        if (autoStopActive) {
            recommendation = '🚨 تجاوزت خسارة 5% اليوم — النظام متوقف تلقائياً. راجع الاستراتيجية.';
        }
        else if (executorPerf.winRate > 55 && agentPerf.winRate < 45 && agentPerf.totalTrades > 20) {
            recommendation = '📊 المنفذ الذكي يتفوق على الوكيل. فكّر في تقليل مخاطر الوكيل.';
        }
        else if (agentPerf.winRate > 55 && executorPerf.winRate < 45 && executorPerf.totalTrades > 20) {
            recommendation = '📊 الوكيل يتفوق على المنفذ الذكي. تحقق من إعدادات M5/M15.';
        }
        else if (executorPerf.kellyPercent > 0 || agentPerf.kellyPercent > 0) {
            recommendation = `💡 حجم المركز الأمثل: المنفذ ${executorPerf.kellyPercent}%، الوكيل ${agentPerf.kellyPercent}% (Half Kelly).`;
        }
        else {
            recommendation = '⏳ تحتاج إلى 20+ صفقة لحساب توصيات دقيقة.';
        }
        try {
            await this.redis.set(`performance:health:${userId}`, JSON.stringify({ executorPerf, agentPerf, combined, autoStopActive, recommendation }), 1800);
        }
        catch { }
        return { smart_executor: executorPerf, agent: agentPerf, combined, autoStopActive, recommendation };
    }
    async getKellyPositionSize(userId, source, portfolioValue) {
        try {
            const perf = await this.getSourcePerformance(userId, source);
            const kellyPct = perf.kellyPercent / 100;
            return Math.max(10, portfolioValue * kellyPct);
        }
        catch {
            return portfolioValue * 0.02;
        }
    }
    async isDailyLossLimitReached(userId) {
        try {
            const cached = await this.redis.get(`performance:health:${userId}`);
            if (cached) {
                const data = JSON.parse(cached);
                return data.autoStopActive === true;
            }
            const health = await this.getSystemHealth(userId);
            return health.autoStopActive;
        }
        catch {
            return false;
        }
    }
    _emptyPerformance(source, dailyPnL, dailyPnLPercent) {
        return {
            source, totalTrades: 0, winningTrades: 0, losingTrades: 0,
            winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
            totalPnL: 0, maxDrawdown: 0, sharpeRatio: null,
            kellyPercent: 2, dailyPnL, dailyPnLPercent,
            autoStopTriggered: dailyPnLPercent <= -this.DAILY_LOSS_LIMIT_PCT,
            lastUpdated: new Date(),
        };
    }
    async _getFirstActiveUser() {
        return null;
    }
};
exports.PerformanceTrackerService = PerformanceTrackerService;
__decorate([
    (0, schedule_1.Cron)('*/30 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PerformanceTrackerService.prototype, "updatePerformanceCache", null);
exports.PerformanceTrackerService = PerformanceTrackerService = PerformanceTrackerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], PerformanceTrackerService);
//# sourceMappingURL=performance-tracker.service.js.map