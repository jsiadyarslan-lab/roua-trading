"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwingStrategy = void 0;
const base_strategy_1 = require("./base-strategy");
const agent_types_1 = require("../types/agent.types");
class SwingStrategy extends base_strategy_1.BaseStrategy {
    constructor(params) {
        super(params);
        this.type = agent_types_1.StrategyType.SWING;
        this.name = 'تداول سوينغ';
        this.description = 'استراتيجية السوينغ — صفقات متوسطة الأجل تعتمد على الاتجاه والزخم';
        this.holdingPeriodHours = params.swingHoldingPeriodHours ?? 48;
        this.minRiskRewardRatio = 1.5;
        this.minConfidence = 30;
    }
    analyze(market) {
        const { rsi, macd, ema, atr, bollingerBands } = market;
        const strongUptrend = ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50;
        const strongDowntrend = ema.ema9 < ema.ema21 && ema.ema21 < ema.ema50;
        const mildUptrend = ema.ema9 > ema.ema21;
        const mildDowntrend = ema.ema9 < ema.ema21;
        const bullishPullback = rsi >= 30 && rsi <= 55;
        const bearishPullback = rsi >= 45 && rsi <= 70;
        const macdBullish = macd.histogram > 0 || macd.crossover === 'BULLISH';
        const macdBearish = macd.histogram < 0 || macd.crossover === 'BEARISH';
        const priceAboveEMA21 = market.price > ema.ema21;
        const priceBelowEMA21 = market.price < ema.ema21;
        const nearLowerBand = bollingerBands.percentB < 0.4;
        const nearUpperBand = bollingerBands.percentB > 0.6;
        let direction = 'NEUTRAL';
        let strength = 0;
        let trendAlignment = false;
        if ((strongUptrend || mildUptrend) && bullishPullback && macdBullish) {
            direction = 'BUY';
            strength = this._calculateSwingStrength(strongUptrend, bullishPullback, macdBullish, priceAboveEMA21, market.aiSignal);
            trendAlignment = strongUptrend;
        }
        else if ((strongDowntrend || mildDowntrend) && bearishPullback && macdBearish) {
            direction = 'SELL';
            strength = this._calculateSwingStrength(strongDowntrend, bearishPullback, macdBearish, priceBelowEMA21, market.aiSignal);
            trendAlignment = strongDowntrend;
        }
        else if (macd.crossover === 'BULLISH' && mildUptrend && rsi < 60) {
            direction = 'BUY';
            strength = 55;
            trendAlignment = mildUptrend;
        }
        else if (macd.crossover === 'BEARISH' && mildDowntrend && rsi > 40) {
            direction = 'SELL';
            strength = 55;
            trendAlignment = mildDowntrend;
        }
        else if (rsi < 35 && nearLowerBand && (mildUptrend || macdBullish)) {
            direction = 'BUY';
            strength = 45;
            trendAlignment = mildUptrend;
        }
        else if (rsi > 65 && nearUpperBand && (mildDowntrend || macdBearish)) {
            direction = 'SELL';
            strength = 45;
            trendAlignment = mildDowntrend;
        }
        else if (strongUptrend && rsi < 65 && macdBullish) {
            direction = 'BUY';
            strength = 50;
            trendAlignment = true;
        }
        else if (strongDowntrend && rsi > 35 && macdBearish) {
            direction = 'SELL';
            strength = 50;
            trendAlignment = true;
        }
        const hasOpportunity = direction !== 'NEUTRAL' &&
            strength >= 20 &&
            market.volatility !== 'EXTREME';
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
            reasoning: this._buildReasoning(direction, strongUptrend, strongDowntrend, rsi, macd.crossover, market.price, ema),
            metadata: {
                strategy: 'SWING',
                strongUptrend,
                strongDowntrend,
                rsi,
                macdHistogram: macd.histogram,
                priceVsEMA21: priceAboveEMA21 ? 'ABOVE' : 'BELOW',
                emaAlignment: strongUptrend ? 'BULLISH' : strongDowntrend ? 'BEARISH' : 'MIXED',
                holdingPeriodHours: this.holdingPeriodHours,
            },
        };
    }
    generateSignal(market, analysis) {
        const side = analysis.direction;
        const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(market.price, side, market.atr, 2.0, 4.0);
        const confidence = this.calculateConfidence({
            trendAlignment: analysis.indicators.trendAlignment,
            indicatorStrength: analysis.strength,
            volumeConfirmation: analysis.indicators.volumeConfirmation,
            aiSignal: market.aiSignal,
            rsi: market.rsi,
            macdCrossover: analysis.indicators.macdCrossover,
        });
        const orderType = analysis.strength >= 70 ? agent_types_1.OrderType.MARKET : agent_types_1.OrderType.LIMIT;
        return {
            id: '',
            symbol: market.symbol,
            action: side,
            type: orderType,
            confidence,
            strategy: agent_types_1.StrategyType.SWING,
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
    _calculateSwingStrength(strongTrend, pullback, macdAligned, pricePosition, aiSignal) {
        let strength = 0;
        if (strongTrend)
            strength += 30;
        if (pullback)
            strength += 25;
        if (macdAligned)
            strength += 20;
        if (pricePosition)
            strength += 10;
        if (aiSignal === agent_types_1.StrategySignal.STRONG_BUY || aiSignal === agent_types_1.StrategySignal.STRONG_SELL) {
            strength += 15;
        }
        else if (aiSignal === agent_types_1.StrategySignal.BUY || aiSignal === agent_types_1.StrategySignal.SELL) {
            strength += 8;
        }
        return Math.min(100, strength);
    }
    _buildReasoning(direction, strongUptrend, strongDowntrend, rsi, macdCrossover, price, ema) {
        const parts = [];
        if (direction === 'BUY') {
            if (strongUptrend)
                parts.push('اتجاه صعودي قوي (EMA9 > EMA21 > EMA50)');
            parts.push(`ارتداد RSI إلى منطقة الشراء (${rsi.toFixed(1)})`);
            if (macdCrossover === 'BULLISH')
                parts.push('تقاطع MACD صعودي');
            parts.push(`السعر (${price.toFixed(2)}) فوق EMA21 (${ema.ema21.toFixed(2)})`);
        }
        else if (direction === 'SELL') {
            if (strongDowntrend)
                parts.push('اتجاه هبوطي قوي (EMA9 < EMA21 < EMA50)');
            parts.push(`ارتداد RSI إلى منطقة البيع (${rsi.toFixed(1)})`);
            if (macdCrossover === 'BEARISH')
                parts.push('تقاطع MACD هبوطي');
            parts.push(`السعر (${price.toFixed(2)}) تحت EMA21 (${ema.ema21.toFixed(2)})`);
        }
        else {
            parts.push('لا يوجد اتجاه واضح للسوينغ');
        }
        return parts.join(' | ');
    }
}
exports.SwingStrategy = SwingStrategy;
//# sourceMappingURL=swing.strategy.js.map