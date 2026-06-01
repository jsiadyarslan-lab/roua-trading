"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VWAPRSIStrategy = void 0;
const base_strategy_1 = require("./base-strategy");
const agent_types_1 = require("../types/agent.types");
class VWAPRSIStrategy extends base_strategy_1.BaseStrategy {
    constructor(params) {
        super(params);
        this.type = agent_types_1.StrategyType.VWAP_RSI;
        this.name = 'VWAP + RSI';
        this.description = 'استراتيجية VWAP مع RSI — إدخالات عالية الاحتمالية باستخدام المتوسط المرجح بالحجم ومؤشر القوة النسبية';
        this.rsiBuyMin = params.vwapRsiBuyMin ?? 50;
        this.rsiBuyMax = params.vwapRsiBuyMax ?? 70;
        this.rsiSellMin = params.vwapRsiSellMin ?? 30;
        this.rsiSellMax = params.vwapRsiSellMax ?? 50;
        this.minRiskRewardRatio = 1.0;
        this.minConfidence = 30;
    }
    analyze(market) {
        const { rsi, macd, bollingerBands, ema, atr, price } = market;
        const vwapProxy = ema.ema21;
        const aboveVWAP = price > vwapProxy;
        const belowVWAP = price < vwapProxy;
        const crossingAboveVWAP = aboveVWAP && (price - vwapProxy) / vwapProxy < 0.005;
        const crossingBelowVWAP = belowVWAP && (vwapProxy - price) / vwapProxy < 0.005;
        const rsiBullishZone = rsi > this.rsiBuyMin && rsi < this.rsiBuyMax;
        const rsiBearishZone = rsi > this.rsiSellMin && rsi < this.rsiSellMax;
        const macdBullish = macd.histogram > 0 || macd.crossover === 'BULLISH';
        const macdBearish = macd.histogram < 0 || macd.crossover === 'BEARISH';
        const aboveBBMid = bollingerBands.percentB > 0.5;
        const belowBBMid = bollingerBands.percentB < 0.5;
        const buySignals = [aboveVWAP, rsiBullishZone, macdBullish, aboveBBMid].filter(Boolean).length;
        const sellSignals = [belowVWAP, rsiBearishZone, macdBearish, belowBBMid].filter(Boolean).length;
        let direction = 'NEUTRAL';
        let strength = 0;
        let trendAlignment = false;
        if (buySignals >= 3 && (aboveVWAP || crossingAboveVWAP)) {
            direction = 'BUY';
            strength = this._calculateVWAPStrength(aboveVWAP, crossingAboveVWAP, rsiBullishZone, macdBullish, aboveBBMid, market.aiSignal);
            trendAlignment = aboveVWAP;
        }
        else if (sellSignals >= 3 && (belowVWAP || crossingBelowVWAP)) {
            direction = 'SELL';
            strength = this._calculateVWAPStrength(belowVWAP, crossingBelowVWAP, rsiBearishZone, macdBearish, belowBBMid, market.aiSignal);
            trendAlignment = belowVWAP;
        }
        const hasOpportunity = direction !== 'NEUTRAL' &&
            strength >= 30 &&
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
                macdCrossover: macd.crossover,
            },
            reasoning: this._buildReasoning(direction, price, vwapProxy, rsi, macd.crossover, bollingerBands.percentB),
            metadata: {
                strategy: 'VWAP_RSI',
                vwapProxy,
                priceVsVWAP: aboveVWAP ? 'ABOVE' : belowVWAP ? 'BELOW' : 'AT',
                rsi,
                macdHistogram: macd.histogram,
                bbPercentB: bollingerBands.percentB,
                atr,
            },
        };
    }
    generateSignal(market, analysis) {
        const side = analysis.direction;
        const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(market.price, side, market.atr, 1.5, 2.5);
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
            strategy: agent_types_1.StrategyType.VWAP_RSI,
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
    _calculateVWAPStrength(vwapPosition, vwapCrossing, rsiAligned, macdAligned, bbPosition, aiSignal) {
        let strength = 0;
        if (vwapPosition)
            strength += 20;
        if (vwapCrossing)
            strength += 15;
        if (rsiAligned)
            strength += 25;
        if (macdAligned)
            strength += 20;
        if (bbPosition)
            strength += 10;
        if (aiSignal === agent_types_1.StrategySignal.STRONG_BUY || aiSignal === agent_types_1.StrategySignal.STRONG_SELL) {
            strength += 10;
        }
        else if (aiSignal === agent_types_1.StrategySignal.BUY || aiSignal === agent_types_1.StrategySignal.SELL) {
            strength += 5;
        }
        return Math.min(100, strength);
    }
    _buildReasoning(direction, price, vwap, rsi, macdCrossover, bbPercentB) {
        const parts = [];
        if (direction === 'BUY') {
            parts.push(`السعر فوق VWAP (${price.toFixed(2)} > ${vwap.toFixed(2)})`);
            if (rsi > 50 && rsi < 70)
                parts.push(`RSI في منطقة صعودية (${rsi.toFixed(1)})`);
            if (macdCrossover === 'BULLISH')
                parts.push('تقاطع MACD صعودي');
            if (bbPercentB > 0.5)
                parts.push(`فوق منتصف بولنجر (%B=${bbPercentB.toFixed(2)})`);
        }
        else if (direction === 'SELL') {
            parts.push(`السعر تحت VWAP (${price.toFixed(2)} < ${vwap.toFixed(2)})`);
            if (rsi < 50 && rsi > 30)
                parts.push(`RSI في منطقة هبوطية (${rsi.toFixed(1)})`);
            if (macdCrossover === 'BEARISH')
                parts.push('تقاطع MACD هبوطي');
            if (bbPercentB < 0.5)
                parts.push(`تحت منتصف بولنجر (%B=${bbPercentB.toFixed(2)})`);
        }
        else {
            parts.push('لا يوجد توافق VWAP + RSI');
        }
        return parts.join(' | ');
    }
}
exports.VWAPRSIStrategy = VWAPRSIStrategy;
//# sourceMappingURL=vwap-rsi.strategy.js.map