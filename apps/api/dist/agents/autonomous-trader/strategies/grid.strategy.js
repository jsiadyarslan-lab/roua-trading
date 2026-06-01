"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GridStrategy = void 0;
const base_strategy_1 = require("./base-strategy");
const agent_types_1 = require("../types/agent.types");
class GridStrategy extends base_strategy_1.BaseStrategy {
    constructor(params) {
        super(params);
        this.type = agent_types_1.StrategyType.GRID;
        this.name = 'شبكي';
        this.description = 'استراتيجية الشبكة — تداول في نطاق سعري بأوامر شراء وبيع متدرجة';
        this.gridLevels = params.gridLevels ?? 5;
        this.gridSpacingPercent = params.gridSpacingPercent ?? 0.5;
        this.gridQuantityPerLevel = params.gridQuantityPerLevel ?? 0;
        this.minRiskRewardRatio = 1.0;
        this.minConfidence = 50;
    }
    analyze(market) {
        const { rsi, bollingerBands, ema, atr } = market;
        const isRanging = market.trend === 'SIDEWAYS' || bollingerBands.bandwidth < 0.04;
        const rsiNeutral = rsi >= 35 && rsi <= 65;
        const noStrongTrend = Math.abs(ema.ema9 - ema.ema21) / market.price < 0.01;
        const bbSqueeze = bollingerBands.bandwidth < 0.03;
        const hasOpportunity = isRanging &&
            rsiNeutral &&
            market.volatility !== 'EXTREME' &&
            market.volatility !== 'HIGH' &&
            atr > 0;
        let direction = 'NEUTRAL';
        if (hasOpportunity) {
            direction = bollingerBands.percentB < 0.5 ? agent_types_1.OrderSide.BUY : agent_types_1.OrderSide.SELL;
        }
        const strength = this._calculateGridStrength(isRanging, rsiNeutral, noStrongTrend, bbSqueeze, market.aiSignal);
        return {
            hasOpportunity,
            direction,
            strength,
            requiresTrend: false,
            spreadTooWide: false,
            indicators: {
                trendAlignment: !noStrongTrend,
                indicatorStrength: strength,
                volumeConfirmation: market.volume24h > 0,
                rsi,
            },
            reasoning: this._buildReasoning(hasOpportunity, isRanging, rsi, bollingerBands.bandwidth, market.price, bollingerBands),
            metadata: {
                strategy: 'GRID',
                isRanging,
                rsiNeutral,
                bbSqueeze,
                bbBandwidth: bollingerBands.bandwidth,
                gridLevels: this.gridLevels,
                gridSpacingPercent: this.gridSpacingPercent,
                gridRange: this._calculateGridRange(market),
            },
        };
    }
    generateSignal(market, analysis) {
        const side = analysis.direction;
        const gridRange = this._calculateGridRange(market);
        const stopLoss = side === agent_types_1.OrderSide.BUY
            ? gridRange.lowerBound
            : gridRange.upperBound;
        const takeProfit = side === agent_types_1.OrderSide.BUY
            ? gridRange.upperBound
            : gridRange.lowerBound;
        const risk = Math.abs(market.price - stopLoss);
        const reward = Math.abs(takeProfit - market.price);
        const riskRewardRatio = risk > 0 ? reward / risk : 0;
        const confidence = this.calculateConfidence({
            trendAlignment: false,
            indicatorStrength: analysis.strength,
            volumeConfirmation: analysis.indicators.volumeConfirmation,
            aiSignal: market.aiSignal,
            rsi: market.rsi,
        });
        return {
            id: '',
            symbol: market.symbol,
            action: side,
            type: agent_types_1.OrderType.LIMIT,
            confidence,
            strategy: agent_types_1.StrategyType.GRID,
            entryPrice: market.price,
            stopLoss,
            takeProfit,
            quantity: 0,
            reasoning: analysis.reasoning,
            riskRewardRatio,
            riskScore: 0,
            timestamp: new Date(),
            metadata: {
                ...analysis.metadata,
                gridRange,
                gridLevels: this._generateGridLevels(market, gridRange),
            },
        };
    }
    validateEntry(market, analysis) {
        if (market.trend === 'BULLISH' || market.trend === 'BEARISH') {
            if (market.trendStrength > 70) {
                return { valid: false, reason: 'اتجاه قوي جداً — الشبكة لا تعمل في الأسواق المتجهة' };
            }
        }
        if (market.volatility === 'EXTREME' || market.volatility === 'HIGH') {
            return { valid: false, reason: 'تقلب عالي جداً — غير مناسب لاستراتيجية الشبكة' };
        }
        return { valid: true };
    }
    _calculateGridRange(market) {
        const upperBound = market.bollingerBands.upper;
        const lowerBound = market.bollingerBands.lower;
        const centerPrice = market.bollingerBands.middle;
        const totalRange = upperBound - lowerBound;
        return { upperBound, lowerBound, centerPrice, totalRange };
    }
    _generateGridLevels(market, gridRange) {
        const levels = [];
        const totalRange = gridRange.upperBound - gridRange.lowerBound;
        const step = totalRange / (this.gridLevels + 1);
        for (let i = 1; i <= this.gridLevels; i++) {
            const price = gridRange.lowerBound + step * i;
            const side = price < market.price ? agent_types_1.OrderSide.BUY : agent_types_1.OrderSide.SELL;
            levels.push({
                price: parseFloat(price.toFixed(8)),
                side,
                quantity: this.gridQuantityPerLevel,
            });
        }
        return levels;
    }
    _calculateGridStrength(isRanging, rsiNeutral, noStrongTrend, bbSqueeze, aiSignal) {
        let strength = 0;
        if (isRanging)
            strength += 30;
        if (rsiNeutral)
            strength += 25;
        if (noStrongTrend)
            strength += 20;
        if (bbSqueeze)
            strength += 15;
        if (aiSignal === agent_types_1.StrategySignal.NEUTRAL) {
            strength += 10;
        }
        return Math.min(100, strength);
    }
    _buildReasoning(hasOpportunity, isRanging, rsi, bbBandwidth, price, bb) {
        if (!hasOpportunity) {
            return 'السوق ليس في نطاق مناسب للشبكة';
        }
        const parts = [];
        if (isRanging)
            parts.push('السوق في نطاق عرضي');
        parts.push(`RSI محايد (${rsi.toFixed(1)})`);
        parts.push(`عرض بولنجر: ${(bbBandwidth * 100).toFixed(2)}%`);
        parts.push(`النطاق: ${bb.lower.toFixed(2)} - ${bb.upper.toFixed(2)}`);
        parts.push(`${this.gridLevels} مستويات شبكة`);
        return parts.join(' | ');
    }
}
exports.GridStrategy = GridStrategy;
//# sourceMappingURL=grid.strategy.js.map