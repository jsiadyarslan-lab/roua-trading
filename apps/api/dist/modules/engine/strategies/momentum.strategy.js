"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MomentumBotStrategy = void 0;
const bot_base_strategy_1 = require("./bot-base-strategy");
const bot_strategy_types_1 = require("./bot-strategy.types");
class MomentumBotStrategy extends bot_base_strategy_1.BotBaseStrategy {
    constructor(params = {}) {
        super(params);
        this.type = bot_strategy_types_1.BotStrategyType.MOMENTUM;
        this.name = 'الزخم';
        this.description = 'استراتيجية الزخم — تداول مع اتجاه السعر القوي بناءً على معدل التغيير';
        this.minChangePercent = params.minChangePercent ?? 1.5;
        this.rsiBullishMin = params.rsiBullishMin ?? 50;
        this.rsiBullishMax = params.rsiBullishMax ?? 75;
        this.rsiBearishMin = params.rsiBearishMin ?? 25;
        this.rsiBearishMax = params.rsiBearishMax ?? 50;
        this.minRiskRewardRatio = 1.3;
        this.minConfidence = 40;
    }
    analyze(market) {
        const { rsi, macdHistogram, macdCrossover, ema9, ema21, atr, price, changePercent24h, volume24h } = market;
        const strongBullishChange = changePercent24h > this.minChangePercent;
        const strongBearishChange = changePercent24h < -this.minChangePercent;
        const moderateBullishChange = changePercent24h > 0.5;
        const moderateBearishChange = changePercent24h < -0.5;
        const rsiBullishZone = rsi > this.rsiBullishMin && rsi < this.rsiBullishMax;
        const rsiBearishZone = rsi > this.rsiBearishMin && rsi < this.rsiBearishMax;
        const macdBullish = macdHistogram > 0 || macdCrossover === 'BULLISH';
        const macdBearish = macdHistogram < 0 || macdCrossover === 'BEARISH';
        const priceAboveEma9 = price > ema9;
        const priceBelowEma9 = price < ema9;
        const hasVolume = volume24h > 0;
        const emaBullish = ema9 > ema21;
        const emaBearish = ema9 < ema21;
        const buySignals = [
            strongBullishChange || moderateBullishChange,
            rsiBullishZone,
            macdBullish,
            priceAboveEma9,
            hasVolume,
            emaBullish,
        ].filter(Boolean).length;
        const sellSignals = [
            strongBearishChange || moderateBearishChange,
            rsiBearishZone,
            macdBearish,
            priceBelowEma9,
            hasVolume,
            emaBearish,
        ].filter(Boolean).length;
        let direction = 'NEUTRAL';
        let strength = 0;
        let trendAlignment = false;
        if (buySignals >= 3 && (strongBullishChange || macdBullish)) {
            direction = 'BUY';
            strength = this._calculateMomentumStrength(strongBullishChange, rsiBullishZone, macdBullish, priceAboveEma9, emaBullish, hasVolume, market.signalAction);
            trendAlignment = emaBullish;
        }
        else if (sellSignals >= 3 && (strongBearishChange || macdBearish)) {
            direction = 'SELL';
            strength = this._calculateMomentumStrength(strongBearishChange, rsiBearishZone, macdBearish, priceBelowEma9, emaBearish, hasVolume, market.signalAction);
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
            reasoning: this._buildReasoning(direction, changePercent24h, rsi, macdCrossover, price, ema9),
            stopLoss,
            takeProfit,
            riskRewardRatio,
            metadata: {
                strategy: 'MOMENTUM',
                changePercent24h,
                rsi,
                macdHistogram,
                emaAlignment: emaBullish ? 'BULLISH' : emaBearish ? 'BEARISH' : 'MIXED',
                atr,
                volume24h,
            },
        };
    }
    _calculateMomentumStrength(strongChange, rsiAligned, macdAligned, priceVsEma9, emaAligned, hasVolume, signalAction) {
        let strength = 0;
        if (strongChange)
            strength += 25;
        if (rsiAligned)
            strength += 20;
        if (macdAligned)
            strength += 20;
        if (priceVsEma9)
            strength += 15;
        if (emaAligned)
            strength += 10;
        if (hasVolume)
            strength += 5;
        if (signalAction === 'BUY' || signalAction === 'SELL')
            strength += 5;
        return Math.min(100, strength);
    }
    _buildReasoning(direction, changePercent, rsi, macdCrossover, price, ema9) {
        const parts = [];
        if (direction === 'BUY') {
            parts.push(`زخم صعودي (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% خلال 24 ساعة)`);
            parts.push(`RSI في منطقة شرائية (${rsi.toFixed(1)})`);
            if (macdCrossover === 'BULLISH')
                parts.push('تقاطع MACD صعودي');
            parts.push(`السعر فوق EMA9 (${price.toFixed(2)} > ${ema9.toFixed(2)})`);
        }
        else if (direction === 'SELL') {
            parts.push(`زخم هبوطي (${changePercent.toFixed(2)}% خلال 24 ساعة)`);
            parts.push(`RSI في منطقة بيعية (${rsi.toFixed(1)})`);
            if (macdCrossover === 'BEARISH')
                parts.push('تقاطع MACD هبوطي');
            parts.push(`السعر تحت EMA9 (${price.toFixed(2)} < ${ema9.toFixed(2)})`);
        }
        else {
            parts.push('لا يوجد زخم كافٍ للدخول');
        }
        return parts.join(' | ');
    }
}
exports.MomentumBotStrategy = MomentumBotStrategy;
//# sourceMappingURL=momentum.strategy.js.map