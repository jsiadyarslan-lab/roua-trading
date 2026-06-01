"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeanReversionStrategy = void 0;
const base_strategy_1 = require("./base-strategy");
const agent_types_1 = require("../types/agent.types");
class MeanReversionStrategy extends base_strategy_1.BaseStrategy {
    constructor(params) {
        super(params);
        this.type = agent_types_1.StrategyType.MEAN_REVERSION;
        this.name = 'عودة للمتوسط';
        this.description = 'استراتيجية عودة السعر لمتوسطه — صفقات عكسية عند الانحرافات الكبيرة مع نسبة فوز عالية';
        this.rsiOversold = params.meanReversionRsiOversold ?? 35;
        this.rsiOverbought = params.meanReversionRsiOverbought ?? 65;
        this.bbLowerThreshold = params.meanReversionBbLower ?? 0.20;
        this.bbUpperThreshold = params.meanReversionBbUpper ?? 0.80;
        this.deviationMultiplier = params.meanReversionDeviation ?? 1.2;
        this.minRiskRewardRatio = 1.0;
        this.minConfidence = 25;
    }
    analyze(market) {
        const { rsi, bollingerBands, ema, atr, price } = market;
        const deviation = ema.ema21 > 0
            ? (price - ema.ema21) / (atr > 0 ? atr : ema.ema21 * 0.01)
            : 0;
        const absoluteDeviation = Math.abs(deviation);
        const deeplyBelowMean = deviation < -this.deviationMultiplier;
        const belowBbLower = bollingerBands.percentB < this.bbLowerThreshold;
        const rsiOversold = rsi < this.rsiOversold;
        const stronglyOversold = rsi < 25;
        const deeplyAboveMean = deviation > this.deviationMultiplier;
        const aboveBbUpper = bollingerBands.percentB > this.bbUpperThreshold;
        const rsiOverbought = rsi > this.rsiOverbought;
        const stronglyOverbought = rsi > 75;
        const buyConfirmations = [deeplyBelowMean, belowBbLower, rsiOversold, market.trend !== 'BULLISH'].filter(Boolean).length;
        const sellConfirmations = [deeplyAboveMean, aboveBbUpper, rsiOverbought, market.trend !== 'BEARISH'].filter(Boolean).length;
        let direction = 'NEUTRAL';
        let strength = 0;
        let trendAlignment = false;
        if (buyConfirmations >= 2 && (deeplyBelowMean || rsiOversold)) {
            direction = 'BUY';
            strength = this._calculateMeanReversionStrength(deeplyBelowMean, belowBbLower, rsiOversold, stronglyOversold, absoluteDeviation, market.aiSignal);
            trendAlignment = false;
        }
        else if (sellConfirmations >= 2 && (deeplyAboveMean || rsiOverbought)) {
            direction = 'SELL';
            strength = this._calculateMeanReversionStrength(deeplyAboveMean, aboveBbUpper, rsiOverbought, stronglyOverbought, absoluteDeviation, market.aiSignal);
            trendAlignment = false;
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
                volumeConfirmation: market.volume24h > 0,
                rsi,
                macdCrossover: market.macd.crossover,
            },
            reasoning: this._buildReasoning(direction, rsi, bollingerBands.percentB, deviation, ema.ema21, price),
            metadata: {
                strategy: 'MEAN_REVERSION',
                deviation: deviation.toFixed(3),
                absoluteDeviation: absoluteDeviation.toFixed(3),
                bbPercentB: bollingerBands.percentB,
                rsi,
                ema21: ema.ema21,
                atr,
            },
        };
    }
    generateSignal(market, analysis) {
        const side = analysis.direction;
        const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(market.price, side, market.atr, 2.0, 2.5);
        const confidence = this.calculateConfidence({
            trendAlignment: false,
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
            strategy: agent_types_1.StrategyType.MEAN_REVERSION,
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
    _calculateMeanReversionStrength(deeplyDeviation, bbExtreme, rsiExtreme, stronglyExtreme, absoluteDeviation, aiSignal) {
        let strength = 0;
        if (deeplyDeviation)
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
        if (aiSignal === agent_types_1.StrategySignal.SELL || aiSignal === agent_types_1.StrategySignal.STRONG_SELL ||
            aiSignal === agent_types_1.StrategySignal.BUY || aiSignal === agent_types_1.StrategySignal.STRONG_BUY) {
            strength += 5;
        }
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
exports.MeanReversionStrategy = MeanReversionStrategy;
//# sourceMappingURL=mean-reversion.strategy.js.map