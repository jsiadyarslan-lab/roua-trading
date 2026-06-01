"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BreakoutBotStrategy = void 0;
const bot_base_strategy_1 = require("./bot-base-strategy");
const bot_strategy_types_1 = require("./bot-strategy.types");
class BreakoutBotStrategy extends bot_base_strategy_1.BotBaseStrategy {
    constructor(params = {}) {
        super(params);
        this.type = bot_strategy_types_1.BotStrategyType.BREAKOUT;
        this.name = 'الاختراق';
        this.description = 'استراتيجية الاختراق — الدخول عند كسر مستويات الدعم والمقاومة مع زخم قوي';
        this.minRiskRewardRatio = 1.5;
        this.minConfidence = 40;
    }
    analyze(market) {
        const { rsi, macdHistogram, macdCrossover, bbPercentB, bbUpper, bbLower, ema9, ema21, atr, price } = market;
        const aboveUpperBand = price > bbUpper || bbPercentB > 0.95;
        const belowLowerBand = price < bbLower || bbPercentB < 0.05;
        const bullishMomentum = rsi > 55 && rsi < 80;
        const bearishMomentum = rsi < 45 && rsi > 20;
        const macdExpandingUp = macdHistogram > 0 && macdCrossover === 'BULLISH';
        const macdExpandingDown = macdHistogram < 0 && macdCrossover === 'BEARISH';
        const emaBullish = ema9 > ema21;
        const emaBearish = ema9 < ema21;
        const hasVolume = market.volume24h > 0;
        const volatilityConfirming = market.volatility === 'HIGH' || market.volatility === 'MEDIUM';
        const buySignals = [aboveUpperBand, bullishMomentum, macdExpandingUp, emaBullish, hasVolume, volatilityConfirming].filter(Boolean).length;
        const sellSignals = [belowLowerBand, bearishMomentum, macdExpandingDown, emaBearish, hasVolume, volatilityConfirming].filter(Boolean).length;
        let direction = 'NEUTRAL';
        let strength = 0;
        let trendAlignment = false;
        if (buySignals >= 3 && (aboveUpperBand || emaBullish)) {
            direction = 'BUY';
            strength = this._calculateBreakoutStrength(aboveUpperBand, bullishMomentum, macdExpandingUp, emaBullish, hasVolume, market.signalAction);
            trendAlignment = emaBullish;
        }
        else if (sellSignals >= 3 && (belowLowerBand || emaBearish)) {
            direction = 'SELL';
            strength = this._calculateBreakoutStrength(belowLowerBand, bearishMomentum, macdExpandingDown, emaBearish, hasVolume, market.signalAction);
            trendAlignment = emaBearish;
        }
        const hasOpportunity = direction !== 'NEUTRAL' && strength >= 35 && atr > 0;
        const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(price, direction, atr, 1.5, 3.0);
        const confidence = this.calculateConfidence({
            trendAlignment,
            indicatorStrength: strength,
            volumeConfirmation: hasVolume,
            signalAgreement: market.signalAction === direction,
            rsi,
            macdCrossover,
        });
        return {
            hasOpportunity,
            direction,
            strength,
            confidence,
            reasoning: this._buildReasoning(direction, aboveUpperBand, belowLowerBand, rsi, macdCrossover, price),
            stopLoss,
            takeProfit,
            riskRewardRatio,
            metadata: {
                strategy: 'BREAKOUT',
                aboveUpperBand,
                belowLowerBand,
                bbPercentB,
                rsi,
                macdHistogram,
                emaAlignment: emaBullish ? 'BULLISH' : emaBearish ? 'BEARISH' : 'MIXED',
                atr,
                volatility: market.volatility,
            },
        };
    }
    _calculateBreakoutStrength(breakout, momentum, macdExpanding, emaAligned, hasVolume, signalAction) {
        let strength = 0;
        if (breakout)
            strength += 25;
        if (momentum)
            strength += 20;
        if (macdExpanding)
            strength += 20;
        if (emaAligned)
            strength += 15;
        if (hasVolume)
            strength += 10;
        if (signalAction === 'BUY' || signalAction === 'SELL')
            strength += 10;
        return Math.min(100, strength);
    }
    _buildReasoning(direction, aboveUpperBand, belowLowerBand, rsi, macdCrossover, price) {
        const parts = [];
        if (direction === 'BUY') {
            if (aboveUpperBand)
                parts.push('اختراق الحد العلوي لبولنجر');
            parts.push(`RSI يشير لزخم صعودي (${rsi.toFixed(1)})`);
            if (macdCrossover === 'BULLISH')
                parts.push('تقاطع MACD صعودي');
            parts.push('اختراق بمستوى مرتفع — احتمال بداية اتجاه جديد');
        }
        else if (direction === 'SELL') {
            if (belowLowerBand)
                parts.push('كسر الحد السفلي لبولنجر');
            parts.push(`RSI يشير لزخم هبوطي (${rsi.toFixed(1)})`);
            if (macdCrossover === 'BEARISH')
                parts.push('تقاطع MACD هبوطي');
            parts.push('كسر بمستوى مرتفع — احتمال بداية اتجاه هابط');
        }
        else {
            parts.push('لا يوجد اختراق واضح');
        }
        return parts.join(' | ');
    }
}
exports.BreakoutBotStrategy = BreakoutBotStrategy;
//# sourceMappingURL=breakout.strategy.js.map