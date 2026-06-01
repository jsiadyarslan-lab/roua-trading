"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseStrategy = void 0;
const agent_types_1 = require("../types/agent.types");
class BaseStrategy {
    constructor(params) {
        this.minRiskRewardRatio = 1.0;
        this.minConfidence = 20;
        this.params = params;
    }
    async evaluate(market) {
        const analysis = this.analyze(market);
        if (!analysis.hasOpportunity) {
            return null;
        }
        const validation = this.validateEntry(market, analysis);
        if (!validation.valid) {
            return null;
        }
        const signal = this.generateSignal(market, analysis);
        if (!signal.stopLoss || signal.stopLoss <= 0) {
            return null;
        }
        if (signal.riskRewardRatio < this.minRiskRewardRatio) {
            return null;
        }
        if (signal.confidence < this.minConfidence) {
            return null;
        }
        const timeWindow = Math.floor(Date.now() / 30000);
        signal.id = `sig-${signal.symbol}-${signal.action}-${this.type}-${timeWindow}`;
        return signal;
    }
    validateEntry(market, analysis) {
        if (market.volatility === 'EXTREME') {
            return { valid: false, reason: 'تقلب شديد — تجنب الدخول' };
        }
        if (market.trend === 'SIDEWAYS' && analysis.requiresTrend) {
            return { valid: false, reason: 'سوق جانبي — لا اتجاه واضح' };
        }
        if (analysis.spreadTooWide) {
            return { valid: false, reason: 'فارق سعري واسع جداً' };
        }
        return { valid: true };
    }
    calculateLevels(entryPrice, side, atr, slMultiplier = 1.5, tpMultiplier = 3.0) {
        let stopLoss;
        let takeProfit;
        if (side === 'BUY') {
            stopLoss = entryPrice - atr * slMultiplier;
            takeProfit = entryPrice + atr * tpMultiplier;
        }
        else {
            stopLoss = entryPrice + atr * slMultiplier;
            takeProfit = entryPrice - atr * tpMultiplier;
        }
        const risk = Math.abs(entryPrice - stopLoss);
        const reward = Math.abs(takeProfit - entryPrice);
        const riskRewardRatio = risk > 0 ? reward / risk : 0;
        return { stopLoss, takeProfit, riskRewardRatio };
    }
    calculateConfidence(factors) {
        let confidence = 0;
        if (factors.trendAlignment) {
            confidence += 25;
        }
        confidence += Math.min(25, factors.indicatorStrength * 0.25);
        if (factors.volumeConfirmation) {
            confidence += 15;
        }
        if (factors.aiSignal) {
            if ((factors.aiSignal === agent_types_1.StrategySignal.STRONG_BUY || factors.aiSignal === agent_types_1.StrategySignal.BUY ||
                factors.aiSignal === agent_types_1.StrategySignal.STRONG_SELL || factors.aiSignal === agent_types_1.StrategySignal.SELL) &&
                factors.trendAlignment) {
                confidence += 20;
            }
            else if (factors.aiSignal === agent_types_1.StrategySignal.STRONG_BUY || factors.aiSignal === agent_types_1.StrategySignal.BUY ||
                factors.aiSignal === agent_types_1.StrategySignal.STRONG_SELL || factors.aiSignal === agent_types_1.StrategySignal.SELL) {
                confidence += 10;
            }
            else if (factors.aiSignal === agent_types_1.StrategySignal.NEUTRAL) {
                confidence += 5;
            }
        }
        if (factors.rsi) {
            if (factors.rsi > 30 && factors.rsi < 70) {
                confidence += 15;
            }
            else if (factors.rsi > 20 && factors.rsi < 80) {
                confidence += 8;
            }
        }
        return Math.min(100, Math.round(confidence));
    }
    updateParams(params) {
        this.params = { ...this.params, ...params };
    }
    getParams() {
        return { ...this.params };
    }
}
exports.BaseStrategy = BaseStrategy;
//# sourceMappingURL=base-strategy.js.map