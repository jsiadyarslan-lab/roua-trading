"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeanReversionBotStrategy = void 0;
const bot_base_strategy_1 = require("./bot-base-strategy");
const bot_strategy_types_1 = require("./bot-strategy.types");
class MeanReversionBotStrategy extends bot_base_strategy_1.BotBaseStrategy {
    constructor(params = {}) {
        super(params);
        this.type = bot_strategy_types_1.BotStrategyType.MEAN_REVERSION;
        this.name = 'عودة للمتوسط';
        this.description = 'استراتيجية عودة السعر لمتوسطه — صفقات عكسية عند الانحرافات الكبيرة';
        this.rsiOversold = params.rsiOversold ?? 30;
        this.rsiOverbought = params.rsiOverbought ?? 70;
        this.bbLowerThreshold = params.bbLowerThreshold ?? 0.15;
        this.bbUpperThreshold = params.bbUpperThreshold ?? 0.85;
        this.deviationMultiplier = params.deviationMultiplier ?? 1.5;
        this.minRiskRewardRatio = 1.0;
        this.minConfidence = 35;
    }
    analyze(market) {
        const { rsi, bbPercentB, bbMiddle, ema21, atr, price } = market;
        const deviation = ema21 > 0
            ? (price - ema21) / (atr > 0 ? atr : ema21 * 0.01)
            : 0;
        const absoluteDeviation = Math.abs(deviation);
        const deeplyBelowMean = deviation < -this.deviationMultiplier;
        const belowBbLower = bbPercentB < this.bbLowerThreshold;
        const rsiOversold = rsi < this.rsiOversold;
        const stronglyOversold = rsi < 25;
        const deeplyAboveMean = deviation > this.deviationMultiplier;
        const aboveBbUpper = bbPercentB > this.bbUpperThreshold;
        const rsiOverbought = rsi > this.rsiOverbought;
        const stronglyOverbought = rsi > 75;
        const buyConfirmations = [deeplyBelowMean, belowBbLower, rsiOversold, market.trend !== 'BULLISH'].filter(Boolean).length;
        const sellConfirmations = [deeplyAboveMean, aboveBbUpper, rsiOverbought, market.trend !== 'BEARISH'].filter(Boolean).length;
        let direction = 'NEUTRAL';
        let strength = 0;
        if (buyConfirmations >= 2 && (deeplyBelowMean || rsiOversold)) {
            direction = 'BUY';
            strength = this._calculateReversionStrength(deeplyBelowMean, belowBbLower, rsiOversold, stronglyOversold, absoluteDeviation, market.signalAction);
        }
        else if (sellConfirmations >= 2 && (deeplyAboveMean || rsiOverbought)) {
            direction = 'SELL';
            strength = this._calculateReversionStrength(deeplyAboveMean, aboveBbUpper, rsiOverbought, stronglyOverbought, absoluteDeviation, market.signalAction);
        }
        const hasOpportunity = direction !== 'NEUTRAL' && strength >= 30 && atr > 0;
        const stopLoss = direction === 'BUY'
            ? price - atr * 2.0
            : price + atr * 2.0;
        const takeProfit = direction === 'BUY'
            ? Math.min(ema21, bbMiddle)
            : Math.max(ema21, bbMiddle);
        const risk = Math.abs(price - stopLoss);
        const reward = Math.abs(takeProfit - price);
        const riskRewardRatio = risk > 0 ? reward / risk : 0;
        const confidence = this.calculateConfidence({
            trendAlignment: false,
            indicatorStrength: strength,
            volumeConfirmation: market.volume24h > 0,
            signalAgreement: market.signalAction === direction,
            rsi,
            macdCrossover: market.macdCrossover,
        });
        return {
            hasOpportunity,
            direction,
            strength,
            confidence,
            reasoning: this._buildReasoning(direction, rsi, bbPercentB, deviation, ema21, price),
            stopLoss,
            takeProfit,
            riskRewardRatio,
            metadata: {
                strategy: 'MEAN_REVERSION',
                deviation: deviation.toFixed(3),
                absoluteDeviation: absoluteDeviation.toFixed(3),
                bbPercentB,
                rsi,
                ema21,
                atr,
            },
        };
    }
    _calculateReversionStrength(deepDeviation, bbExtreme, rsiExtreme, stronglyExtreme, absoluteDeviation, signalAction) {
        let strength = 0;
        if (deepDeviation)
            strength += 25;
        if (bbExtreme)
            strength += 25;
        if (rsiExtreme)
            strength += 20;
        if (stronglyExtreme)
            strength += 15;
        if (absoluteDeviation > 3)
            strength += 10;
        else if (absoluteDeviation > 2)
            strength += 5;
        if (signalAction === 'BUY' || signalAction === 'SELL')
            strength += 5;
        return Math.min(100, strength);
    }
    _buildReasoning(direction, rsi, bbPercentB, deviation, ema21, price) {
        const parts = [];
        if (direction === 'BUY') {
            parts.push(`انحراف سلبي عن المتوسط (${deviation.toFixed(2)}σ)`);
            if (rsi < 30)
                parts.push(`RSI في تشبع بيعي (${rsi.toFixed(1)})`);
            if (bbPercentB < 0.15)
                parts.push(`السعر تحت الحد السفلي لبولنجر (%B=${bbPercentB.toFixed(2)})`);
            parts.push(`السعر (${price.toFixed(2)}) دون المتوسط (${ema21.toFixed(2)}) — متوقع عودة`);
        }
        else if (direction === 'SELL') {
            parts.push(`انحراف إيجابي عن المتوسط (+${deviation.toFixed(2)}σ)`);
            if (rsi > 70)
                parts.push(`RSI في تشبع شرائي (${rsi.toFixed(1)})`);
            if (bbPercentB > 0.85)
                parts.push(`السعر فوق الحد العلوي لبولنجر (%B=${bbPercentB.toFixed(2)})`);
            parts.push(`السعر (${price.toFixed(2)}) فوق المتوسط (${ema21.toFixed(2)}) — متوقع عودة`);
        }
        else {
            parts.push('السعر قريب من المتوسط — لا فرصة عودة');
        }
        return parts.join(' | ');
    }
}
exports.MeanReversionBotStrategy = MeanReversionBotStrategy;
//# sourceMappingURL=mean-reversion.strategy.js.map