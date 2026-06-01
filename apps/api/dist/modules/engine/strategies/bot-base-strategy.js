"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotBaseStrategy = void 0;
class BotBaseStrategy {
    constructor(params = {}) {
        this.minRiskRewardRatio = 1.2;
        this.minConfidence = 40;
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
        if (!analysis.stopLoss || analysis.stopLoss <= 0) {
            return null;
        }
        if (analysis.riskRewardRatio < this.minRiskRewardRatio) {
            return null;
        }
        if (analysis.confidence < this.minConfidence) {
            return null;
        }
        return analysis;
    }
    validateEntry(market, analysis) {
        if (market.volatility === 'EXTREME') {
            return { valid: false, reason: 'تقلب شديد — تجنب الدخول' };
        }
        if (analysis.direction === 'NEUTRAL') {
            return { valid: false, reason: 'لا اتجاه واضح' };
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
        if (factors.trendAlignment)
            confidence += 25;
        confidence += Math.min(25, factors.indicatorStrength * 0.25);
        if (factors.volumeConfirmation)
            confidence += 15;
        if (factors.signalAgreement)
            confidence += 20;
        if (factors.rsi) {
            if (factors.rsi > 30 && factors.rsi < 70)
                confidence += 15;
            else if (factors.rsi > 20 && factors.rsi < 80)
                confidence += 8;
        }
        return Math.min(100, Math.round(confidence));
    }
    updateParams(params) {
        this.params = { ...this.params, ...params };
    }
}
exports.BotBaseStrategy = BotBaseStrategy;
//# sourceMappingURL=bot-base-strategy.js.map