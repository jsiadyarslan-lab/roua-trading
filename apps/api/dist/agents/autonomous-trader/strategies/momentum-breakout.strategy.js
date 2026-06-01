"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MomentumBreakoutStrategy = void 0;
const base_strategy_1 = require("./base-strategy");
const agent_types_1 = require("../types/agent.types");
class MomentumBreakoutStrategy extends base_strategy_1.BaseStrategy {
    constructor(params) {
        super(params);
        this.type = agent_types_1.StrategyType.MOMENTUM_BREAKOUT;
        this.name = 'اختراق الزخم';
        this.description = 'استراتيجية اختراق الزخم — الدخول عند كسور المستويات مع زخم قوي';
        this.minRiskRewardRatio = 1.2;
        this.minConfidence = 30;
    }
    analyze(market) {
        const { rsi, macd, bollingerBands, ema, atr, price } = market;
        const aboveUpperBand = price > bollingerBands.upper || bollingerBands.percentB > 0.95;
        const belowLowerBand = price < bollingerBands.lower || bollingerBands.percentB < 0.05;
        const bullishMomentum = rsi > 55 && rsi < 80;
        const bearishMomentum = rsi < 45 && rsi > 20;
        const macdExpandingUp = macd.histogram > 0 && macd.crossover === 'BULLISH';
        const macdExpandingDown = macd.histogram < 0 && macd.crossover === 'BEARISH';
        const emaBullish = ema.ema9 > ema.ema21;
        const emaBearish = ema.ema9 < ema.ema21;
        const hasVolume = market.volume24h > 0;
        const volatilityConfirming = market.volatility === 'HIGH' || market.volatility === 'MEDIUM';
        const buySignals = [aboveUpperBand, bullishMomentum, macdExpandingUp, emaBullish, hasVolume, volatilityConfirming].filter(Boolean).length;
        const sellSignals = [belowLowerBand, bearishMomentum, macdExpandingDown, emaBearish, hasVolume, volatilityConfirming].filter(Boolean).length;
        let direction = 'NEUTRAL';
        let strength = 0;
        let trendAlignment = false;
        if (buySignals >= 3 && (aboveUpperBand || emaBullish)) {
            direction = 'BUY';
            strength = this._calculateBreakoutStrength(aboveUpperBand, bullishMomentum, macdExpandingUp, emaBullish, hasVolume, market.aiSignal);
            trendAlignment = emaBullish;
        }
        else if (sellSignals >= 3 && (belowLowerBand || emaBearish)) {
            direction = 'SELL';
            strength = this._calculateBreakoutStrength(belowLowerBand, bearishMomentum, macdExpandingDown, emaBearish, hasVolume, market.aiSignal);
            trendAlignment = emaBearish;
        }
        const hasOpportunity = direction !== 'NEUTRAL' &&
            strength >= 25 &&
            market.volatility !== 'EXTREME' &&
            atr > 0;
        return {
            hasOpportunity,
            direction,
            strength,
            requiresTrend: false,
            spreadTooWide: false,
            indicators: {
                trendAlignment,
                indicatorStrength: strength,
                volumeConfirmation: hasVolume,
                rsi,
                macdCrossover: macd.crossover,
            },
            reasoning: this._buildReasoning(direction, aboveUpperBand, belowLowerBand, rsi, macd.crossover, price, bollingerBands),
            metadata: {
                strategy: 'MOMENTUM_BREAKOUT',
                aboveUpperBand,
                belowLowerBand,
                bbPercentB: bollingerBands.percentB,
                rsi,
                macdHistogram: macd.histogram,
                emaAlignment: emaBullish ? 'BULLISH' : emaBearish ? 'BEARISH' : 'MIXED',
                atr,
                volatility: market.volatility,
            },
        };
    }
    generateSignal(market, analysis) {
        const side = analysis.direction;
        const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(market.price, side, market.atr, 1.5, 3.0);
        const confidence = this.calculateConfidence({
            trendAlignment: analysis.indicators.trendAlignment,
            indicatorStrength: analysis.strength,
            volumeConfirmation: analysis.indicators.volumeConfirmation,
            aiSignal: market.aiSignal,
            rsi: market.rsi,
            macdCrossover: analysis.indicators.macdCrossover,
        });
        return {
            id: '',
            symbol: market.symbol,
            action: side,
            type: agent_types_1.OrderType.MARKET,
            confidence,
            strategy: agent_types_1.StrategyType.MOMENTUM_BREAKOUT,
            entryPrice: market.price,
            stopLoss,
            takeProfit,
            quantity: 0,
            reasoning: analysis.reasoning,
            riskRewardRatio,
            riskScore: 0,
            timestamp: new Date(),
            metadata: analysis.metadata,
        };
    }
    _calculateBreakoutStrength(breakout, momentum, macdExpanding, emaAligned, hasVolume, aiSignal) {
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
        if (aiSignal === agent_types_1.StrategySignal.STRONG_BUY || aiSignal === agent_types_1.StrategySignal.STRONG_SELL) {
            strength += 10;
        }
        else if (aiSignal === agent_types_1.StrategySignal.BUY || aiSignal === agent_types_1.StrategySignal.SELL) {
            strength += 5;
        }
        return Math.min(100, strength);
    }
    _buildReasoning(direction, aboveUpperBand, belowLowerBand, rsi, macdCrossover, price, bb) {
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
exports.MomentumBreakoutStrategy = MomentumBreakoutStrategy;
//# sourceMappingURL=momentum-breakout.strategy.js.map