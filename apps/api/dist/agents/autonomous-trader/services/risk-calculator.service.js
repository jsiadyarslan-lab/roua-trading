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
var RiskCalculatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskCalculatorService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const agent_types_1 = require("../types/agent.types");
const symbol_metadata_1 = require("../../../modules/trading/services/symbol-metadata");
let RiskCalculatorService = RiskCalculatorService_1 = class RiskCalculatorService {
    constructor(prisma, redis, configService) {
        this.prisma = prisma;
        this.redis = redis;
        this.configService = configService;
        this.logger = new common_1.Logger(RiskCalculatorService_1.name);
        this.defaultMaxPositionSizePercent = 2;
        this.defaultMaxDailyLossPercent = 5;
        this.defaultMaxOpenPositions = 5;
        this.defaultRiskPerTradePercent = 1.5;
        this.STRATEGY_MIN_RR = {
            [agent_types_1.StrategyType.DCA]: 0.4,
            [agent_types_1.StrategyType.MEAN_REVERSION]: 0.8,
            [agent_types_1.StrategyType.SCALPING]: 1.0,
            [agent_types_1.StrategyType.GRID]: 0.8,
            [agent_types_1.StrategyType.VWAP_RSI]: 1.0,
            [agent_types_1.StrategyType.SWING]: 1.5,
            [agent_types_1.StrategyType.MOMENTUM_BREAKOUT]: 1.2,
        };
        this.defaultMaxPositionSizePercent = parseFloat(this.configService.get('MAX_POSITION_SIZE_PERCENT', '2'));
        this.defaultMaxDailyLossPercent = parseFloat(this.configService.get('MAX_DAILY_LOSS_PERCENT', '5'));
        this.defaultMaxOpenPositions = parseInt(this.configService.get('MAX_OPEN_POSITIONS', '5'), 10);
        this.logger.log('🛡️ Risk Calculator initialized — capital protection active');
    }
    async assessRisk(userId, signal, config) {
        const portfolioValue = await this._getPortfolioValue(userId);
        const dailyPnL = await this._getDailyPnL(userId);
        const dailyLossPercent = portfolioValue > 0
            ? (Math.abs(Math.min(0, dailyPnL)) / portfolioValue) * 100
            : 0;
        const openPositionsCount = await this._getOpenPositionsCount(userId);
        const maxPositionSizePercent = config.maxPositionSizePercent || this.defaultMaxPositionSizePercent;
        const maxDailyLossPercent = config.maxDailyLossPercent || this.defaultMaxDailyLossPercent;
        const maxOpenPositions = config.maxOpenPositions || this.defaultMaxOpenPositions;
        const riskPerTradePercent = config.riskPerTradePercent || this.defaultRiskPerTradePercent;
        const positionSize = this._calculatePositionSize(portfolioValue, riskPerTradePercent, signal.entryPrice, signal.stopLoss, maxPositionSizePercent, signal.symbol);
        const risk = Math.abs(signal.entryPrice - signal.stopLoss);
        const reward = Math.abs(signal.takeProfit - signal.entryPrice);
        const riskRewardRatio = risk > 0 ? reward / risk : 0;
        const riskScore = this._calculateRiskScore({
            positionSize,
            portfolioValue,
            maxPositionSizePercent,
            openPositionsCount,
            maxOpenPositions,
            dailyLossPercent,
            maxDailyLossPercent,
            riskRewardRatio,
            volatility: signal.metadata?.volatility,
        });
        let canTrade = true;
        let reason;
        if (!signal.stopLoss || signal.stopLoss <= 0) {
            canTrade = false;
            reason = 'وقف الخسارة إجباري — لا يمكن فتح مركز بدون وقف خسارة';
        }
        if (dailyLossPercent >= maxDailyLossPercent) {
            canTrade = false;
            reason = `الخسارة اليومية (${dailyLossPercent.toFixed(1)}%) تجاوزت الحد (${maxDailyLossPercent}%) — توقف الوكيل تلقائياً`;
        }
        if (openPositionsCount >= maxOpenPositions) {
            canTrade = false;
            reason = `عدد المراكز المفتوحة (${openPositionsCount}) بلغ الحد الأقصى (${maxOpenPositions})`;
        }
        const POSITION_SIZE_TOLERANCE = 0.01;
        const positionValuePercent = portfolioValue > 0
            ? (positionSize * signal.entryPrice / portfolioValue) * 100
            : 0;
        if (positionValuePercent > maxPositionSizePercent + POSITION_SIZE_TOLERANCE) {
            canTrade = false;
            reason = `حجم المركز (${positionValuePercent.toFixed(1)}%) يتجاوز الحد (${maxPositionSizePercent}%)`;
        }
        const strategyMinRR = this.STRATEGY_MIN_RR[signal.strategy] ?? 1.2;
        if (riskRewardRatio < strategyMinRR) {
            canTrade = false;
            reason = `نسبة المخاطرة للمكافأة (${riskRewardRatio.toFixed(2)}) أقل من الحد الأدنى لاستراتيجية ${signal.strategy} (${strategyMinRR})`;
        }
        const existingPosition = await this._hasOpenPosition(userId, signal.symbol);
        if (existingPosition) {
            if (existingPosition.strategy === signal.strategy) {
                canTrade = false;
                reason = `يوجد مركز مفتوح بالفعل لـ ${signal.symbol} باستخدام نفس الاستراتيجية (${signal.strategy})`;
            }
            else {
                this.logger.log(`⚠️ Adding additional position for ${signal.symbol} using strategy ${signal.strategy} (existing: ${existingPosition.strategy})`);
            }
        }
        let globalAutoTradingEnabled;
        try {
            const dbSetting = await this.prisma.setting.findUnique({
                where: { key: 'AUTO_TRADING_ENABLED' },
            });
            if (dbSetting) {
                globalAutoTradingEnabled = JSON.parse(dbSetting.value);
            }
            else {
                globalAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
            }
        }
        catch {
            globalAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
        }
        if (!globalAutoTradingEnabled) {
            canTrade = false;
            reason = 'التداول الذاتي معطّل على مستوى النظام — تواصل مع الإدارة';
            this.logger.warn(`🚫 AUTO_TRADING_ENABLED=false (global) — ALL trades for user ${userId} are being rejected.`);
        }
        else {
            try {
                const userSettings = await this.prisma.agentSettings.findUnique({
                    where: { userId },
                });
                if (userSettings && !userSettings.autoTradingEnabled) {
                    canTrade = false;
                    reason = 'التداول الذاتي معطّل في إعداداتك — فعّله من صفحة إعدادات الوكيل';
                    this.logger.warn(`🚫 User ${userId} autoTradingEnabled=false — trades rejected.`);
                }
            }
            catch (e) {
                this.logger.warn(`Could not check user autoTradingEnabled in risk assessment: ${e.message}`);
            }
        }
        if (canTrade) {
            this.logger.debug(`🛡️ Trade allowed: ${signal.action} ${signal.symbol} ` +
                `qty=${positionSize.toFixed(6)} risk=${riskScore}`);
        }
        else {
            this.logger.warn(`🛡️ Trade rejected: ${reason}`);
        }
        return {
            canTrade,
            reason,
            positionSize,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            riskRewardRatio,
            riskScore,
            dailyPnL,
            dailyLossPercent,
            openPositionsCount,
            portfolioValue,
        };
    }
    async isDailyLimitReached(userId, maxDailyLossPercent) {
        try {
            const realCredential = await this.prisma.exchangeCredential.findFirst({
                where: {
                    userId,
                    isValid: true,
                    exchange: { not: 'paper-trading' },
                    testnet: { not: true },
                },
            });
            if (!realCredential) {
                this.logger.debug(`🛡️ Agent daily limit check BYPASSED for user ${userId} — paper-trading only (no real credentials)`);
                return false;
            }
        }
        catch (credErr) {
            this.logger.warn(`🛡️ Could not check credentials for daily limit bypass: ${credErr.message} — proceeding with check`);
        }
        const dailyPnL = await this._getAgentDailyPnL(userId);
        const portfolioValue = await this._getPortfolioValue(userId);
        if (portfolioValue <= 0)
            return false;
        if (dailyPnL >= 0)
            return false;
        const lossPercent = (Math.abs(dailyPnL) / portfolioValue) * 100;
        if (lossPercent >= maxDailyLossPercent) {
            this.logger.warn(`🛡️ Agent daily loss limit reached: ${lossPercent.toFixed(2)}% >= ${maxDailyLossPercent}% (agent-only losses: $${dailyPnL.toFixed(2)})`);
            return true;
        }
        return false;
    }
    getRiskParameters() {
        return {
            maxPositionSizePercent: this.defaultMaxPositionSizePercent,
            maxDailyLossPercent: this.defaultMaxDailyLossPercent,
            maxOpenPositions: this.defaultMaxOpenPositions,
            riskPerTradePercent: this.defaultRiskPerTradePercent,
        };
    }
    _calculatePositionSize(portfolioValue, riskPerTradePercent, entryPrice, stopLoss, maxPositionSizePercent, symbol) {
        if (portfolioValue <= 0 || entryPrice <= 0 || stopLoss <= 0)
            return 0;
        const maxSizePercent = maxPositionSizePercent || this.defaultMaxPositionSizePercent;
        const riskAmount = portfolioValue * (riskPerTradePercent / 100);
        const priceRisk = Math.abs(entryPrice - stopLoss);
        if (priceRisk === 0)
            return 0;
        if (symbol) {
            const result = (0, symbol_metadata_1.calculatePositionSizeFromRisk)(riskAmount, entryPrice, stopLoss, symbol);
            const maxPositionValue = portfolioValue * (maxSizePercent / 100);
            let quantityUnits = result.quantityUnits;
            let quantityLots = result.quantityLots;
            if (result.notional > maxPositionValue) {
                quantityUnits = maxPositionValue / entryPrice;
                quantityLots = (0, symbol_metadata_1.roundLotSize)((0, symbol_metadata_1.unitsToLots)(quantityUnits, symbol), symbol);
                quantityUnits = (0, symbol_metadata_1.lotsToUnits)(quantityLots, symbol);
            }
            return parseFloat(quantityUnits.toFixed(8));
        }
        let quantity = riskAmount / priceRisk;
        const maxPositionValue = portfolioValue * (maxSizePercent / 100);
        const currentPositionValue = quantity * entryPrice;
        if (currentPositionValue > maxPositionValue) {
            quantity = maxPositionValue / entryPrice;
            this.logger.debug(`🛡️ Position size capped: ${currentPositionValue.toFixed(2)} > ${maxPositionValue.toFixed(2)} ` +
                `(max ${maxSizePercent}% of portfolio) → reduced to ${quantity.toFixed(8)} units`);
        }
        return parseFloat(quantity.toFixed(8));
    }
    _calculateRiskScore(params) {
        let score = 0;
        if (params.portfolioValue > 0) {
            const positionPercent = (params.positionSize * 100) / params.portfolioValue;
            score += Math.min(30, (positionPercent / params.maxPositionSizePercent) * 30);
        }
        score += Math.min(25, (params.openPositionsCount / params.maxOpenPositions) * 25);
        score += Math.min(30, (params.dailyLossPercent / params.maxDailyLossPercent) * 30);
        if (params.riskRewardRatio < 2.0)
            score += 15;
        else if (params.riskRewardRatio < 3.0)
            score += 8;
        if (params.volatility === 'EXTREME')
            score += 15;
        else if (params.volatility === 'HIGH')
            score += 8;
        return Math.min(100, Math.round(score));
    }
    async _getPortfolioValue(userId) {
        try {
            const settings = await this.prisma.agentSettings.findUnique({
                where: { userId },
            });
            const isPaperTrading = settings ? settings.autoTradingEnabled !== false : true;
            const paperBalance = settings ? Number(settings.paperBalance) || 10000 : 10000;
            if (isPaperTrading) {
                try {
                    const openPositions = await this.prisma.position.findMany({
                        where: { userId, status: 'OPEN' },
                        select: { quantity: true, currentPrice: true, entryPrice: true, side: true },
                    });
                    let unrealizedPnl = 0;
                    for (const p of openPositions) {
                        const qty = Number(p.quantity) || 0;
                        const currentPrice = Number(p.currentPrice) || Number(p.entryPrice) || 0;
                        const entryPrice = Number(p.entryPrice) || 0;
                        if (p.side === 'BUY') {
                            unrealizedPnl += (currentPrice - entryPrice) * qty;
                        }
                        else {
                            unrealizedPnl += (entryPrice - currentPrice) * qty;
                        }
                    }
                    return paperBalance + unrealizedPnl;
                }
                catch {
                    return paperBalance;
                }
            }
            const portfolios = await this.prisma.portfolio.aggregate({
                where: { userId },
                _sum: { totalValue: true },
            });
            const manualValue = Number(portfolios._sum.totalValue || 0);
            const positions = await this.prisma.position.findMany({
                where: { userId, status: 'OPEN' },
            });
            const positionsValue = positions.reduce((sum, p) => {
                return sum + Number(p.quantity) * (Number(p.currentPrice) || Number(p.entryPrice));
            }, 0);
            const totalValue = manualValue + positionsValue;
            if (totalValue <= 0) {
                this.logger.warn(`🛡️ Portfolio value is 0 for real-trading user ${userId} — NOT executing for safety`);
                return 0;
            }
            return totalValue;
        }
        catch (error) {
            const defaultBalance = parseFloat(this.configService.get('DEFAULT_PAPER_BALANCE', '10000')) || 10000;
            this.logger.warn(`🛡️ Failed to calculate portfolio value for ${userId}: ${error.message} — using default: $${defaultBalance}`);
            return defaultBalance;
        }
    }
    async _getDailyPnL(userId) {
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const trades = await this.prisma.trade.findMany({
                where: {
                    userId,
                    executedAt: { gte: todayStart },
                    type: { in: ['EXIT', 'PARTIAL_EXIT'] },
                },
            });
            return trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
        }
        catch {
            return 0;
        }
    }
    async _getAgentDailyPnL(userId) {
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const trades = await this.prisma.trade.findMany({
                where: {
                    userId,
                    executedAt: { gte: todayStart },
                    type: { in: ['EXIT', 'PARTIAL_EXIT'] },
                    source: 'agent',
                },
            });
            return trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
        }
        catch {
            return 0;
        }
    }
    async _getOpenPositionsCount(userId) {
        try {
            return await this.prisma.position.count({
                where: { userId, status: 'OPEN', source: 'agent' },
            });
        }
        catch {
            return 0;
        }
    }
    async _hasOpenPosition(userId, symbol) {
        try {
            return await this.prisma.position.findFirst({
                where: { userId, symbol, status: 'OPEN' },
            });
        }
        catch {
            return null;
        }
    }
};
exports.RiskCalculatorService = RiskCalculatorService;
exports.RiskCalculatorService = RiskCalculatorService = RiskCalculatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        config_1.ConfigService])
], RiskCalculatorService);
//# sourceMappingURL=risk-calculator.service.js.map