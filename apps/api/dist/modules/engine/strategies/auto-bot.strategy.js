"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoBotStrategy = void 0;
const bot_base_strategy_1 = require("./bot-base-strategy");
const bot_strategy_types_1 = require("./bot-strategy.types");
const trend_following_strategy_1 = require("./trend-following.strategy");
const mean_reversion_strategy_1 = require("./mean-reversion.strategy");
const breakout_strategy_1 = require("./breakout.strategy");
const momentum_strategy_1 = require("./momentum.strategy");
class AutoBotStrategy extends bot_base_strategy_1.BotBaseStrategy {
    constructor(params = {}) {
        super(params);
        this.type = bot_strategy_types_1.BotStrategyType.AUTO;
        this.name = 'تلقائي (AUTO)';
        this.description = 'استراتيجية تلقائية — تختار أفضل استراتيجية حسب ظروف السوق ووقت التداول';
        this.regimeHistory = new Map();
        this.REGIME_CONFIRMATION_BARS = 3;
        this.lastSwitchTime = new Map();
        this.COOLDOWN_MS = 5 * 60 * 1000;
        this.minRiskRewardRatio = 1.0;
        this.minConfidence = 35;
        this.trendFollowing = new trend_following_strategy_1.TrendFollowingStrategy(params.trendFollowing ?? {});
        this.meanReversion = new mean_reversion_strategy_1.MeanReversionBotStrategy(params.meanReversion ?? {});
        this.breakout = new breakout_strategy_1.BreakoutBotStrategy(params.breakout ?? {});
        this.momentum = new momentum_strategy_1.MomentumBotStrategy(params.momentum ?? {});
    }
    async evaluate(market) {
        const regime = this._detectRegime(market);
        const selectedStrategy = this._selectStrategyForRegime(regime, market);
        const strategyName = this._getStrategyTypeName(selectedStrategy);
        const result = await selectedStrategy.evaluate(market);
        if (!result) {
            return null;
        }
        result.metadata = {
            ...result.metadata,
            parentStrategy: 'AUTO',
            selectedStrategy: strategyName,
            regime: regime.regime,
            regimeConfidence: regime.confidence,
            regimeIndicators: regime.indicators,
        };
        const regimeNames = {
            [bot_strategy_types_1.BotMarketRegime.TRENDING_UP]: 'صعودي متجه',
            [bot_strategy_types_1.BotMarketRegime.TRENDING_DOWN]: 'هبوطي متجه',
            [bot_strategy_types_1.BotMarketRegime.RANGING]: 'نطاق عرضي',
            [bot_strategy_types_1.BotMarketRegime.VOLATILE]: 'متقلب',
            [bot_strategy_types_1.BotMarketRegime.TRANSITIONAL]: 'انتقالي',
        };
        result.reasoning = `[AUTO → ${strategyName} | نظام: ${regimeNames[regime.regime]}] ${result.reasoning}`;
        return result;
    }
    analyze(market) {
        return {
            hasOpportunity: false,
            direction: 'NEUTRAL',
            strength: 0,
            confidence: 0,
            reasoning: 'AUTO strategy uses evaluate() — this should not be called',
            stopLoss: 0,
            takeProfit: 0,
            riskRewardRatio: 0,
            metadata: { strategy: 'AUTO', note: 'fallback' },
        };
    }
    _detectRegime(market) {
        const { ema9, ema21, ema50, rsi, macdHistogram, macdCrossover, bbBandwidth, bbPercentB, atr, price, trendStrength } = market;
        const emaGap = Math.abs(ema9 - ema21) / ema21 * 100;
        const adxProxy = this._calculateADXProxy(trendStrength, emaGap, bbBandwidth);
        let emaAlignment = 'MIXED';
        if (ema9 > ema21 && ema21 > ema50)
            emaAlignment = 'BULLISH';
        else if (ema9 < ema21 && ema21 < ema50)
            emaAlignment = 'BEARISH';
        let momentumDirection = 'FLAT';
        const macdSignal = macdHistogram > 0 ? 1 : macdHistogram < 0 ? -1 : 0;
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
                regime = bot_strategy_types_1.BotMarketRegime.TRENDING_UP;
                confidence = 70;
            }
            else if (emaAlignment === 'BEARISH' && momentumDirection === 'DOWN') {
                regime = bot_strategy_types_1.BotMarketRegime.TRENDING_DOWN;
                confidence = 70;
            }
            else {
                regime = bot_strategy_types_1.BotMarketRegime.TRANSITIONAL;
                confidence = 50;
            }
        }
        else if (adxProxy < 25 && bbBandwidth < 0.04 && market.trend === 'SIDEWAYS') {
            regime = bot_strategy_types_1.BotMarketRegime.RANGING;
            confidence = 65;
        }
        else if (bbBandwidth > 0.06 || market.volatility === 'EXTREME' || market.volatility === 'HIGH') {
            regime = bot_strategy_types_1.BotMarketRegime.VOLATILE;
            confidence = 60;
        }
        else {
            regime = bot_strategy_types_1.BotMarketRegime.TRANSITIONAL;
            confidence = 40;
        }
        const confirmedRegime = this._applyConfirmation(market.symbol, regime);
        const recommendedStrategy = this._mapRegimeToStrategy(confirmedRegime, rsi);
        return {
            regime: confirmedRegime,
            confidence,
            recommendedStrategy,
            indicators: {
                trendStrength,
                volatility: market.volatility,
                emaAlignment,
                bbBandwidth,
                momentumDirection,
            },
        };
    }
    _mapRegimeToStrategy(regime, rsi) {
        switch (regime) {
            case bot_strategy_types_1.BotMarketRegime.TRENDING_UP:
                return rsi < 65 ? bot_strategy_types_1.BotStrategyType.TREND_FOLLOWING : bot_strategy_types_1.BotStrategyType.MOMENTUM;
            case bot_strategy_types_1.BotMarketRegime.TRENDING_DOWN:
                return rsi > 35 ? bot_strategy_types_1.BotStrategyType.TREND_FOLLOWING : bot_strategy_types_1.BotStrategyType.MOMENTUM;
            case bot_strategy_types_1.BotMarketRegime.RANGING:
                return bot_strategy_types_1.BotStrategyType.MEAN_REVERSION;
            case bot_strategy_types_1.BotMarketRegime.VOLATILE:
                return bot_strategy_types_1.BotStrategyType.BREAKOUT;
            case bot_strategy_types_1.BotMarketRegime.TRANSITIONAL:
                return bot_strategy_types_1.BotStrategyType.MOMENTUM;
            default:
                return bot_strategy_types_1.BotStrategyType.MOMENTUM;
        }
    }
    _selectStrategyForRegime(regime, market) {
        const lastSwitch = this.lastSwitchTime.get(market.symbol);
        if (lastSwitch) {
            const timeSinceSwitch = Date.now() - lastSwitch.getTime();
            if (timeSinceSwitch < this.COOLDOWN_MS) {
            }
        }
        this.lastSwitchTime.set(market.symbol, new Date());
        switch (regime.recommendedStrategy) {
            case bot_strategy_types_1.BotStrategyType.TREND_FOLLOWING:
                return this.trendFollowing;
            case bot_strategy_types_1.BotStrategyType.MEAN_REVERSION:
                return this.meanReversion;
            case bot_strategy_types_1.BotStrategyType.BREAKOUT:
                return this.breakout;
            case bot_strategy_types_1.BotStrategyType.MOMENTUM:
                return this.momentum;
            default:
                return this.momentum;
        }
    }
    _calculateADXProxy(trendStrength, emaGap, bbBandwidth) {
        const trendComponent = trendStrength * 0.50;
        const gapComponent = Math.min(50, emaGap * 30) * 0.30;
        const bandwidthComponent = Math.min(50, bbBandwidth * 500) * 0.20;
        return Math.min(100, Math.round(trendComponent + gapComponent + bandwidthComponent));
    }
    _applyConfirmation(symbol, detectedRegime) {
        const history = this.regimeHistory.get(symbol) || [];
        history.push(detectedRegime);
        if (history.length > this.REGIME_CONFIRMATION_BARS)
            history.shift();
        this.regimeHistory.set(symbol, history);
        if (history.length < this.REGIME_CONFIRMATION_BARS)
            return detectedRegime;
        const allSame = history.every(r => r === history[0]);
        if (allSame)
            return history[0];
        const counts = new Map();
        for (const r of history)
            counts.set(r, (counts.get(r) || 0) + 1);
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
    _getStrategyTypeName(strategy) {
        return strategy.type;
    }
}
exports.AutoBotStrategy = AutoBotStrategy;
//# sourceMappingURL=auto-bot.strategy.js.map