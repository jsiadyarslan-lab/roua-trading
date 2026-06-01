"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrendFollowingStrategy = void 0;
const bot_base_strategy_1 = require("./bot-base-strategy");
const bot_strategy_types_1 = require("./bot-strategy.types");
class TrendFollowingStrategy extends bot_base_strategy_1.BotBaseStrategy {
    constructor(params = {}) {
        super(params);
        this.type = bot_strategy_types_1.BotStrategyType.TREND_FOLLOWING;
        this.name = 'متابعة الاتجاه';
        this.description = 'استراتيجية متابعة الاتجاه — الدخول مع الاتجاه القوي والبقاء حتى الانعكاس';
        this.minRiskRewardRatio = 1.5;
        this.minConfidence = 45;
    }
    analyze(market) {
        const { rsi, macdHistogram, macdCrossover, bbPercentB, ema9, ema21, ema50, atr, price } = market;
        const strongUptrend = ema9 > ema21 && ema21 > ema50;
        const mildUptrend = ema9 > ema21;
        const strongDowntrend = ema9 < ema21 && ema21 < ema50;
        const mildDowntrend = ema9 < ema21;
        const bullishMomentum = rsi > 45 && rsi < 70;
        const bearishMomentum = rsi < 55 && rsi > 30;
        const macdBullish = macdHistogram > 0 || macdCrossover === 'BULLISH';
        const macdBearish = macdHistogram < 0 || macdCrossover === 'BEARISH';
        const priceAboveEMA21 = price > ema21;
        const priceBelowEMA21 = price < ema21;
        const bbAboveMid = bbPercentB > 0.5;
        const bbBelowMid = bbPercentB < 0.5;
        const buySignals = [strongUptrend || mildUptrend, bullishMomentum, macdBullish, priceAboveEMA21, bbAboveMid].filter(Boolean).length;
        const sellSignals = [strongDowntrend || mildDowntrend, bearishMomentum, macdBearish, priceBelowEMA21, bbBelowMid].filter(Boolean).length;
        let direction = 'NEUTRAL';
        let strength = 0;
        let trendAlignment = false;
        if (buySignals >= 3 && (strongUptrend || mildUptrend)) {
            direction = 'BUY';
            strength = this._calculateTrendStrength(strongUptrend, bullishMomentum, macdBullish, priceAboveEMA21, bbAboveMid, market.signalAction);
            trendAlignment = strongUptrend;
        }
        else if (sellSignals >= 3 && (strongDowntrend || mildDowntrend)) {
            direction = 'SELL';
            strength = this._calculateTrendStrength(strongDowntrend, bearishMomentum, macdBearish, priceBelowEMA21, bbBelowMid, market.signalAction);
            trendAlignment = strongDowntrend;
        }
        const hasOpportunity = direction !== 'NEUTRAL' && strength >= 35;
        const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(price, direction, atr, 2.0, 4.0);
        const confidence = this.calculateConfidence({
            trendAlignment,
            indicatorStrength: strength,
            volumeConfirmation: market.volume24h > 0,
            signalAgreement: market.signalAction === direction,
            rsi,
            macdCrossover,
        });
        return {
            hasOpportunity,
            direction,
            strength,
            confidence,
            reasoning: this._buildReasoning(direction, rsi, macdCrossover, ema9, ema21, ema50, price),
            stopLoss,
            takeProfit,
            riskRewardRatio,
            metadata: {
                strategy: 'TREND_FOLLOWING',
                strongUptrend,
                strongDowntrend,
                rsi,
                macdCrossover,
                emaAlignment: strongUptrend ? 'BULLISH' : strongDowntrend ? 'BEARISH' : 'MIXED',
                atr,
            },
        };
    }
    _calculateTrendStrength(strongTrend, momentum, macdAligned, pricePosition, bbPosition, signalAction) {
        let strength = 0;
        if (strongTrend)
            strength += 30;
        if (momentum)
            strength += 25;
        if (macdAligned)
            strength += 20;
        if (pricePosition)
            strength += 10;
        if (bbPosition)
            strength += 10;
        if (signalAction === 'BUY' || signalAction === 'SELL')
            strength += 5;
        return Math.min(100, strength);
    }
    _buildReasoning(direction, rsi, macdCrossover, ema9, ema21, ema50, price) {
        const parts = [];
        if (direction === 'BUY') {
            if (ema9 > ema21 && ema21 > ema50)
                parts.push('اتجاه صعودي قوي (EMA9 > EMA21 > EMA50)');
            else if (ema9 > ema21)
                parts.push('اتجاه صعودي (EMA9 > EMA21)');
            parts.push(`RSI في منطقة صعودية (${rsi.toFixed(1)})`);
            if (macdCrossover === 'BULLISH')
                parts.push('تقاطع MACD صعودي');
            parts.push(`السعر فوق EMA21 (${price.toFixed(2)} > ${ema21.toFixed(2)})`);
        }
        else if (direction === 'SELL') {
            if (ema9 < ema21 && ema21 < ema50)
                parts.push('اتجاه هبوطي قوي (EMA9 < EMA21 < EMA50)');
            else if (ema9 < ema21)
                parts.push('اتجاه هبوطي (EMA9 < EMA21)');
            parts.push(`RSI في منطقة هبوطية (${rsi.toFixed(1)})`);
            if (macdCrossover === 'BEARISH')
                parts.push('تقاطع MACD هبوطي');
            parts.push(`السعر تحت EMA21 (${price.toFixed(2)} < ${ema21.toFixed(2)})`);
        }
        else {
            parts.push('لا يوجد اتجاه واضح — لا توجد فرصة');
        }
        return parts.join(' | ');
    }
}
exports.TrendFollowingStrategy = TrendFollowingStrategy;
//# sourceMappingURL=trend-following.strategy.js.map