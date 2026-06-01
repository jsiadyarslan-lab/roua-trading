"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScalpingStrategy = void 0;
const base_strategy_1 = require("./base-strategy");
const agent_types_1 = require("../types/agent.types");
class ScalpingStrategy extends base_strategy_1.BaseStrategy {
    constructor(params) {
        super(params);
        this.type = agent_types_1.StrategyType.SCALPING;
        this.name = 'مضاربة سريعة';
        this.description = 'استراتيجية المضاربة السريعة — صفقات قصيرة الأجل بأرباح صغيرة متكررة';
        this.maxSpreadPips = params.scalpingMaxSpread ?? 3;
        this.rsiOversold = 40;
        this.rsiOverbought = 60;
    }
    analyze(market) {
        const { rsi, macd, bollingerBands, ema, atr } = market;
        const bullishTrend = ema.ema9 > ema.ema21;
        const bearishTrend = ema.ema9 < ema.ema21;
        const isOversold = rsi < this.rsiOversold;
        const isOverbought = rsi > this.rsiOverbought;
        const bullishMACD = macd.crossover === 'BULLISH' || macd.histogram > 0;
        const bearishMACD = macd.crossover === 'BEARISH' || macd.histogram < 0;
        const nearLowerBand = bollingerBands.percentB < 0.45;
        const nearUpperBand = bollingerBands.percentB > 0.55;
        const spreadTooWide = false;
        let direction = 'NEUTRAL';
        let strength = 0;
        let trendAlignment = false;
        const buySignals = [isOversold, bullishMACD, nearLowerBand, bullishTrend].filter(Boolean).length;
        const sellSignals = [isOverbought, bearishMACD, nearUpperBand, bearishTrend].filter(Boolean).length;
        if (buySignals >= 1) {
            direction = 'BUY';
            strength = this._calculateScalpStrength(isOversold, bullishMACD, nearLowerBand, bullishTrend, market.aiSignal);
            trendAlignment = bullishTrend;
        }
        else if (sellSignals >= 1) {
            direction = 'SELL';
            strength = this._calculateScalpStrength(isOverbought, bearishMACD, nearUpperBand, bearishTrend, market.aiSignal);
            trendAlignment = bearishTrend;
        }
        const hasOpportunity = direction !== 'NEUTRAL' &&
            strength >= 10 &&
            !spreadTooWide &&
            market.volatility !== 'EXTREME';
        return {
            hasOpportunity,
            direction,
            strength,
            requiresTrend: false,
            spreadTooWide,
            indicators: {
                trendAlignment,
                indicatorStrength: strength,
                volumeConfirmation: market.volume24h > 0,
                rsi,
                macdCrossover: macd.crossover,
            },
            reasoning: this._buildReasoning(direction, rsi, macd.crossover, bollingerBands.percentB, ema),
            metadata: {
                strategy: 'SCALPING',
                rsi,
                macdHistogram: macd.histogram,
                bollingerPercentB: bollingerBands.percentB,
                emaCrossover: bullishTrend ? 'BULLISH' : bearishTrend ? 'BEARISH' : 'NONE',
                atr,
                spreadTooWide,
            },
        };
    }
    generateSignal(market, analysis) {
        const side = analysis.direction;
        const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(market.price, side, market.atr, 1.0, 1.5);
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
            strategy: agent_types_1.StrategyType.SCALPING,
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
    _calculateScalpStrength(rsiExtreme, macdAligned, bbExtreme, trendAligned, aiSignal) {
        let strength = 0;
        if (rsiExtreme)
            strength += 25;
        if (macdAligned)
            strength += 25;
        if (bbExtreme)
            strength += 20;
        if (trendAligned)
            strength += 15;
        if (aiSignal === agent_types_1.StrategySignal.STRONG_BUY || aiSignal === agent_types_1.StrategySignal.STRONG_SELL) {
            strength += 15;
        }
        else if (aiSignal === agent_types_1.StrategySignal.BUY || aiSignal === agent_types_1.StrategySignal.SELL) {
            strength += 8;
        }
        return Math.min(100, strength);
    }
    _buildReasoning(direction, rsi, macdCrossover, bbPercentB, ema) {
        const parts = [];
        if (direction === 'BUY') {
            parts.push(`RSI منخفض (${rsi.toFixed(1)}) — تشبع بيعي`);
            if (macdCrossover === 'BULLISH')
                parts.push('تقاطع MACD صعودي');
            if (bbPercentB < 0.2)
                parts.push('السعر قرب الحد السفلي لبولنجر');
            if (ema.ema9 > ema.ema21)
                parts.push('EMA9 فوق EMA21 — اتجاه صعودي');
        }
        else if (direction === 'SELL') {
            parts.push(`RSI مرتفع (${rsi.toFixed(1)}) — تشبع شرائي`);
            if (macdCrossover === 'BEARISH')
                parts.push('تقاطع MACD هبوطي');
            if (bbPercentB > 0.8)
                parts.push('السعر قرب الحد العلوي لبولنجر');
            if (ema.ema9 < ema.ema21)
                parts.push('EMA9 تحت EMA21 — اتجاه هبوطي');
        }
        else {
            parts.push('لا توجد فرصة واضحة');
        }
        return parts.join(' | ');
    }
}
exports.ScalpingStrategy = ScalpingStrategy;
//# sourceMappingURL=scalping.strategy.js.map