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
var AdaptiveStrategySelectorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdaptiveStrategySelectorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const agent_types_1 = require("../types/agent.types");
let AdaptiveStrategySelectorService = AdaptiveStrategySelectorService_1 = class AdaptiveStrategySelectorService {
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
        this.logger = new common_1.Logger(AdaptiveStrategySelectorService_1.name);
        this.REGIME_CACHE_TTL = 30000;
        this.regimeHistory = new Map();
        this.lastSwitchTime = new Map();
        this.COOLDOWN_MS = 5 * 60 * 1000;
        this.REGIME_CONFIRMATION_BARS = 3;
        this.logger.log(`🧠 Adaptive Strategy Selector initialized — auto-regime detection active (prisma=${!!this.prisma}, redis=${!!this.redis})`);
    }
    detectRegime(market) {
        const { ema, rsi, macd, bollingerBands, atr, trendStrength } = market;
        const emaGap = Math.abs(ema.ema9 - ema.ema21) / ema.ema21 * 100;
        const adxProxy = this._calculateADXProxy(trendStrength, emaGap, bollingerBands.bandwidth);
        let emaAlignment = 'MIXED';
        if (ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50) {
            emaAlignment = 'BULLISH';
        }
        else if (ema.ema9 < ema.ema21 && ema.ema21 < ema.ema50) {
            emaAlignment = 'BEARISH';
        }
        let momentumDirection = 'FLAT';
        const macdSignal = macd.histogram > 0 ? 1 : macd.histogram < 0 ? -1 : 0;
        const rsiSignal = rsi > 55 ? 1 : rsi < 45 ? -1 : 0;
        const trendBias = emaAlignment === 'BULLISH' ? 1 : emaAlignment === 'BEARISH' ? -1 : 0;
        const combinedMomentum = macdSignal + rsiSignal * 0.5 + trendBias * 0.3;
        if (combinedMomentum > 0.5)
            momentumDirection = 'UP';
        else if (combinedMomentum < -0.5)
            momentumDirection = 'DOWN';
        let regime;
        let confidence;
        if (adxProxy > 40 && emaAlignment !== 'MIXED') {
            if (emaAlignment === 'BULLISH' && momentumDirection === 'UP') {
                regime = agent_types_1.MarketRegime.TRENDING_UP;
                confidence = this._calculateRegimeConfidence(adxProxy, 50, trendStrength);
            }
            else if (emaAlignment === 'BEARISH' && momentumDirection === 'DOWN') {
                regime = agent_types_1.MarketRegime.TRENDING_DOWN;
                confidence = this._calculateRegimeConfidence(adxProxy, 50, trendStrength);
            }
            else {
                regime = agent_types_1.MarketRegime.TRANSITIONAL;
                confidence = 50;
            }
        }
        else if (adxProxy < 25 && bollingerBands.bandwidth < 0.04 && market.trend === 'SIDEWAYS') {
            regime = agent_types_1.MarketRegime.RANGING;
            confidence = this._calculateRegimeConfidence(25 - adxProxy, 0.04 - bollingerBands.bandwidth, trendStrength);
        }
        else if (bollingerBands.bandwidth > 0.06 || market.volatility === 'EXTREME' || market.volatility === 'HIGH') {
            regime = agent_types_1.MarketRegime.VOLATILE;
            confidence = this._calculateRegimeConfidence(bollingerBands.bandwidth * 100, 50, trendStrength);
        }
        else {
            regime = agent_types_1.MarketRegime.TRANSITIONAL;
            confidence = 40;
        }
        const confirmedRegime = this._applyConfirmation(market.symbol, regime);
        const recommendedStrategies = this._mapRegimeToStrategies(confirmedRegime, rsi, adxProxy);
        const detection = {
            regime: confirmedRegime,
            confidence,
            indicators: {
                trendStrength,
                volatilityLevel: market.volatility,
                emaAlignment,
                bbBandwidth: bollingerBands.bandwidth,
                adxProxy,
                momentumDirection,
            },
            recommendedStrategies,
            timestamp: new Date(),
        };
        this.logger.debug(`🧠 Regime for ${market.symbol}: ${confirmedRegime} (confidence: ${confidence}%, ` +
            `ADX proxy: ${adxProxy.toFixed(1)}, EMA: ${emaAlignment}, momentum: ${momentumDirection})`);
        return detection;
    }
    async scoreStrategies(userId, regime) {
        const allStrategies = [
            agent_types_1.StrategyType.SWING,
            agent_types_1.StrategyType.GRID,
            agent_types_1.StrategyType.MEAN_REVERSION,
            agent_types_1.StrategyType.MOMENTUM_BREAKOUT,
            agent_types_1.StrategyType.DCA,
            agent_types_1.StrategyType.VWAP_RSI,
        ];
        const scores = [];
        for (const strategy of allStrategies) {
            const regimeMatch = this._calculateRegimeMatch(strategy, regime);
            const recentPerformance = await this._getRecentPerformance(userId, strategy);
            const drawdownPenalty = await this._getDrawdownPenalty(userId, strategy);
            const winRateTrend = await this._getWinRateTrend(userId, strategy);
            const score = Math.round(regimeMatch * 0.40 +
                recentPerformance * 0.30 +
                drawdownPenalty * 0.20 +
                winRateTrend * 0.10);
            scores.push({
                strategy,
                score,
                regimeMatch,
                recentPerformance,
                drawdownPenalty,
                winRateTrend,
                reason: this._buildScoreReason(strategy, regime.regime, regimeMatch, recentPerformance),
            });
        }
        scores.sort((a, b) => b.score - a.score);
        this.logger.log(`🧠 Strategy scores for ${userId} [${regime.regime}]: ` +
            scores.map(s => `${s.strategy}=${s.score}`).join(', '));
        return scores;
    }
    async selectBestStrategy(userId, market) {
        const regime = this.detectRegime(market);
        const scores = await this.scoreStrategies(userId, regime);
        const bestScore = scores[0];
        let selectedStrategy = bestScore.strategy;
        const lastSwitch = this.lastSwitchTime.get(userId);
        if (lastSwitch) {
            const timeSinceSwitch = Date.now() - lastSwitch.getTime();
            if (timeSinceSwitch < this.COOLDOWN_MS) {
                const cachedStrategyKey = `agent:auto:last-strategy:${userId}`;
                if (this.redis) {
                    try {
                        const lastStrategy = await this.redis.get(cachedStrategyKey);
                        if (lastStrategy && bestScore.score - 20 < 70) {
                            const previousStrategy = scores.find(s => s.strategy === lastStrategy);
                            if (previousStrategy && previousStrategy.score > 30) {
                                selectedStrategy = previousStrategy.strategy;
                                this.logger.debug(`🧠 Cool-down active for ${userId} — keeping ${selectedStrategy} ` +
                                    `(best was ${bestScore.strategy}=${bestScore.score})`);
                            }
                        }
                    }
                    catch {
                    }
                }
            }
        }
        if (this.redis) {
            try {
                await this.redis.set(`agent:auto:last-strategy:${userId}`, selectedStrategy, this.COOLDOWN_MS);
            }
            catch {
            }
        }
        this.lastSwitchTime.set(userId, new Date());
        this.logger.log(`🧠 AUTO strategy selected for ${userId}: ${selectedStrategy} ` +
            `(regime: ${regime.regime}, score: ${bestScore.score})`);
        return { strategy: selectedStrategy, regime, scores };
    }
    _mapRegimeToStrategies(regime, rsi, adxProxy) {
        switch (regime) {
            case agent_types_1.MarketRegime.TRENDING_UP:
                if (rsi < 65) {
                    return [agent_types_1.StrategyType.SWING, agent_types_1.StrategyType.MOMENTUM_BREAKOUT, agent_types_1.StrategyType.VWAP_RSI];
                }
                else {
                    return [agent_types_1.StrategyType.SWING, agent_types_1.StrategyType.VWAP_RSI, agent_types_1.StrategyType.DCA];
                }
            case agent_types_1.MarketRegime.TRENDING_DOWN:
                if (rsi > 35) {
                    return [agent_types_1.StrategyType.SWING, agent_types_1.StrategyType.MOMENTUM_BREAKOUT, agent_types_1.StrategyType.VWAP_RSI];
                }
                else {
                    return [agent_types_1.StrategyType.DCA, agent_types_1.StrategyType.MEAN_REVERSION, agent_types_1.StrategyType.SWING];
                }
            case agent_types_1.MarketRegime.RANGING:
                return [agent_types_1.StrategyType.MEAN_REVERSION, agent_types_1.StrategyType.GRID, agent_types_1.StrategyType.VWAP_RSI];
            case agent_types_1.MarketRegime.VOLATILE:
                return [agent_types_1.StrategyType.DCA, agent_types_1.StrategyType.MEAN_REVERSION, agent_types_1.StrategyType.GRID];
            case agent_types_1.MarketRegime.TRANSITIONAL:
                return [agent_types_1.StrategyType.DCA, agent_types_1.StrategyType.VWAP_RSI, agent_types_1.StrategyType.MEAN_REVERSION];
            default:
                return [agent_types_1.StrategyType.DCA, agent_types_1.StrategyType.SWING];
        }
    }
    _calculateRegimeMatch(strategy, regime) {
        const recommendedStrategies = regime.recommendedStrategies;
        const index = recommendedStrategies.indexOf(strategy);
        if (index === -1) {
            const versatileStrategies = [agent_types_1.StrategyType.DCA, agent_types_1.StrategyType.SWING];
            return versatileStrategies.includes(strategy) ? 25 : 10;
        }
        const scores = [95, 80, 65, 50];
        return scores[index] ?? 40;
    }
    async _getRecentPerformance(userId, strategy) {
        try {
            if (!this.prisma)
                return 50;
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const trades = await this.prisma.autonomousTrade.findMany({
                where: {
                    userId,
                    strategy,
                    createdAt: { gte: sevenDaysAgo },
                    status: 'FILLED',
                    exitPrice: { not: null },
                },
                orderBy: { createdAt: 'desc' },
                take: 20,
            });
            if (trades.length === 0) {
                return 50;
            }
            const totalPnL = trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
            const wins = trades.filter(t => Number(t.pnl || 0) > 0).length;
            const winRate = wins / trades.length;
            let score = winRate * 60;
            if (totalPnL > 0) {
                score += Math.min(40, (totalPnL / 1000) * 40);
            }
            return Math.min(100, Math.max(0, Math.round(score)));
        }
        catch {
            return 50;
        }
    }
    async _getDrawdownPenalty(userId, strategy) {
        try {
            if (!this.prisma)
                return 70;
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const trades = await this.prisma.autonomousTrade.findMany({
                where: {
                    userId,
                    strategy,
                    createdAt: { gte: sevenDaysAgo },
                    status: 'FILLED',
                },
                orderBy: { createdAt: 'asc' },
                take: 50,
            });
            if (trades.length < 3)
                return 70;
            let peak = 0;
            let maxDrawdown = 0;
            let runningPnL = 0;
            for (const trade of trades) {
                runningPnL += Number(trade.pnl || 0);
                if (runningPnL > peak)
                    peak = runningPnL;
                const drawdown = peak - runningPnL;
                if (drawdown > maxDrawdown)
                    maxDrawdown = drawdown;
            }
            const drawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;
            if (drawdownPercent === 0)
                return 100;
            if (drawdownPercent < 2)
                return 90;
            if (drawdownPercent < 5)
                return 70;
            if (drawdownPercent < 10)
                return 40;
            return 10;
        }
        catch {
            return 70;
        }
    }
    async _getWinRateTrend(userId, strategy) {
        try {
            if (!this.prisma)
                return 50;
            const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const recentTrades = await this.prisma.autonomousTrade.findMany({
                where: {
                    userId,
                    strategy,
                    createdAt: { gte: sevenDaysAgo },
                    status: 'FILLED',
                    exitPrice: { not: null },
                },
            });
            const prevTrades = await this.prisma.autonomousTrade.findMany({
                where: {
                    userId,
                    strategy,
                    createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
                    status: 'FILLED',
                    exitPrice: { not: null },
                },
            });
            if (recentTrades.length < 3)
                return 50;
            const recentWinRate = recentTrades.filter(t => Number(t.pnl || 0) > 0).length / recentTrades.length;
            if (prevTrades.length < 3) {
                return Math.round(recentWinRate * 100);
            }
            const prevWinRate = prevTrades.filter(t => Number(t.pnl || 0) > 0).length / prevTrades.length;
            const improvement = recentWinRate - prevWinRate;
            if (improvement > 0.1)
                return 90;
            if (improvement > 0)
                return 70;
            if (improvement > -0.1)
                return 50;
            if (improvement > -0.2)
                return 30;
            return 10;
        }
        catch {
            return 50;
        }
    }
    _applyConfirmation(symbol, detectedRegime) {
        const history = this.regimeHistory.get(symbol) || [];
        history.push(detectedRegime);
        if (history.length > this.REGIME_CONFIRMATION_BARS) {
            history.shift();
        }
        this.regimeHistory.set(symbol, history);
        if (history.length < this.REGIME_CONFIRMATION_BARS) {
            return detectedRegime;
        }
        const allSame = history.every(r => r === history[0]);
        if (allSame) {
            return history[0];
        }
        const counts = new Map();
        for (const r of history) {
            counts.set(r, (counts.get(r) || 0) + 1);
        }
        let mostFrequent = detectedRegime;
        let maxCount = 0;
        for (const [regime, count] of counts) {
            if (count > maxCount) {
                maxCount = count;
                mostFrequent = regime;
            }
        }
        return mostFrequent;
    }
    _calculateADXProxy(trendStrength, emaGap, bbBandwidth) {
        const trendComponent = trendStrength * 0.50;
        const gapComponent = Math.min(50, emaGap * 30) * 0.30;
        const bandwidthComponent = Math.min(50, bbBandwidth * 500) * 0.20;
        return Math.min(100, Math.round(trendComponent + gapComponent + bandwidthComponent));
    }
    _calculateRegimeConfidence(primaryIndicator, secondaryIndicator, trendStrength) {
        let confidence = 40;
        confidence += Math.min(30, primaryIndicator * 0.5);
        confidence += Math.min(20, Math.abs(secondaryIndicator) * 200);
        if (trendStrength > 60)
            confidence += 10;
        return Math.min(100, Math.max(20, Math.round(confidence)));
    }
    _buildScoreReason(strategy, regime, regimeMatch, performance) {
        const regimeNames = {
            [agent_types_1.MarketRegime.TRENDING_UP]: 'صعودي متجه',
            [agent_types_1.MarketRegime.TRENDING_DOWN]: 'هبوطي متجه',
            [agent_types_1.MarketRegime.RANGING]: 'نطاق عرضي',
            [agent_types_1.MarketRegime.VOLATILE]: 'متقلب',
            [agent_types_1.MarketRegime.TRANSITIONAL]: 'انتقالي',
        };
        const matchLevel = regimeMatch > 80 ? 'ممتاز' : regimeMatch > 50 ? 'جيد' : 'ضعيف';
        const perfLevel = performance > 70 ? 'أداء قوي' : performance > 40 ? 'أداء متوسط' : 'أداء ضعيف';
        return `${strategy} — توافق ${matchLevel} مع السوق ${regimeNames[regime]} (${regimeMatch}%), ${perfLevel} (${performance}%)`;
    }
};
exports.AdaptiveStrategySelectorService = AdaptiveStrategySelectorService;
exports.AdaptiveStrategySelectorService = AdaptiveStrategySelectorService = AdaptiveStrategySelectorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], AdaptiveStrategySelectorService);
//# sourceMappingURL=adaptive-strategy-selector.service.js.map