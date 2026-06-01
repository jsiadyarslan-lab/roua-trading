"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DCAStrategy = void 0;
const base_strategy_1 = require("./base-strategy");
const agent_types_1 = require("../types/agent.types");
class DCAStrategy extends base_strategy_1.BaseStrategy {
    constructor(params) {
        super(params);
        this.type = agent_types_1.StrategyType.DCA;
        this.name = 'متوسط التكلفة';
        this.description = 'استراتيجية التراكم المنتظم — شراء دوري مع تعزيز التوقيت حسب ظروف السوق';
        this.baseBuyMultiplier = params.dcaBaseMultiplier ?? 1.0;
        this.discountThreshold = params.dcaDiscountRsi ?? 40;
        this.skipThreshold = params.dcaSkipRsi ?? 70;
        this.minRiskRewardRatio = 0.5;
        this.minConfidence = 25;
    }
    analyze(market) {
        const { rsi, bollingerBands, ema, atr, price } = market;
        let sizeMultiplier = this.baseBuyMultiplier;
        let direction = 'NEUTRAL';
        let strength = 0;
        if (rsi > this.skipThreshold) {
            if (rsi > 75 && bollingerBands.percentB > 0.8 && price > ema.ema21) {
                direction = 'SELL';
                strength = 60;
                sizeMultiplier = 1.0;
            }
            else {
                return {
                    hasOpportunity: false,
                    direction: 'NEUTRAL',
                    strength: 0,
                    requiresTrend: false,
                    spreadTooWide: false,
                    indicators: {
                        trendAlignment: false,
                        indicatorStrength: 0,
                        volumeConfirmation: market.volume24h > 0,
                        rsi,
                    },
                    reasoning: `RSI مرتفع (${rsi.toFixed(1)}) — تأجيل الشراء حتى انخفاض السعر`,
                    metadata: { strategy: 'DCA', action: 'SKIP', rsi, reason: 'overbought' },
                };
            }
        }
        if (direction !== 'SELL') {
            direction = 'BUY';
            if (rsi < 30) {
                sizeMultiplier = 2.0;
                strength = 70;
            }
            else if (rsi < this.discountThreshold) {
                sizeMultiplier = 1.5;
                strength = 55;
            }
            else if (rsi < 60) {
                sizeMultiplier = 1.0;
                strength = 40;
            }
            else {
                sizeMultiplier = 0.5;
                strength = 25;
            }
            if (price < ema.ema21) {
                sizeMultiplier *= 1.3;
                strength += 10;
            }
            if (bollingerBands.percentB < 0.3) {
                sizeMultiplier *= 1.2;
                strength += 10;
            }
            sizeMultiplier = Math.min(3.0, sizeMultiplier);
        }
        const hasOpportunity = strength >= 25 &&
            market.volatility !== 'EXTREME' &&
            atr > 0;
        return {
            hasOpportunity,
            direction,
            strength,
            requiresTrend: false,
            spreadTooWide: false,
            indicators: {
                trendAlignment: ema.ema9 > ema.ema21,
                indicatorStrength: strength,
                volumeConfirmation: market.volume24h > 0,
                rsi,
            },
            reasoning: this._buildReasoning(direction, rsi, sizeMultiplier, price, ema.ema21),
            metadata: {
                strategy: 'DCA',
                sizeMultiplier: parseFloat(sizeMultiplier.toFixed(2)),
                action: direction,
                rsi,
                bbPercentB: bollingerBands.percentB,
                priceVsEma21: price > ema.ema21 ? 'ABOVE' : 'BELOW',
            },
        };
    }
    generateSignal(market, analysis) {
        const side = analysis.direction;
        const sizeMultiplier = analysis.metadata?.sizeMultiplier || 1.0;
        if (side === agent_types_1.OrderSide.BUY) {
            const stopLoss = market.price - market.atr * 2.5;
            const takeProfit = market.price + market.atr * 2.0;
            const risk = Math.abs(market.price - stopLoss);
            const reward = Math.abs(takeProfit - market.price);
            const riskRewardRatio = risk > 0 ? reward / risk : 0.8;
            return {
                id: '',
                symbol: market.symbol,
                action: side,
                type: agent_types_1.OrderType.MARKET,
                confidence: Math.min(80, 30 + analysis.strength * 0.5),
                strategy: agent_types_1.StrategyType.DCA,
                entryPrice: market.price,
                stopLoss,
                takeProfit,
                quantity: sizeMultiplier,
                reasoning: analysis.reasoning,
                riskRewardRatio,
                riskScore: 0,
                timestamp: new Date(),
                metadata: analysis.metadata,
            };
        }
        const stopLoss = market.price + market.atr * 1.5;
        const takeProfit = market.price - market.atr * 3.0;
        const risk = Math.abs(market.price - stopLoss);
        const reward = Math.abs(takeProfit - market.price);
        const riskRewardRatio = risk > 0 ? reward / risk : 1.5;
        return {
            id: '',
            symbol: market.symbol,
            action: side,
            type: agent_types_1.OrderType.MARKET,
            confidence: Math.min(75, 35 + analysis.strength * 0.4),
            strategy: agent_types_1.StrategyType.DCA,
            entryPrice: market.price,
            stopLoss,
            takeProfit,
            quantity: 1.0,
            reasoning: analysis.reasoning,
            riskRewardRatio,
            riskScore: 0,
            timestamp: new Date(),
            metadata: analysis.metadata,
        };
    }
    _buildReasoning(direction, rsi, sizeMultiplier, price, ema21) {
        const parts = [];
        if (direction === 'BUY') {
            parts.push('شراء DCA دوري');
            if (sizeMultiplier >= 2.0)
                parts.push(`حجم مُضاعف (${sizeMultiplier.toFixed(1)}x) — خصم كبير`);
            else if (sizeMultiplier >= 1.5)
                parts.push(`حجم مُعزز (${sizeMultiplier.toFixed(1)}x) — سعر مخفض`);
            else if (sizeMultiplier < 1.0)
                parts.push(`حجم مخفض (${sizeMultiplier.toFixed(1)}x) — سعر مرتفع`);
            if (rsi < 40)
                parts.push(`RSI منخفض (${rsi.toFixed(1)}) — فرصة شراء`);
            if (price < ema21)
                parts.push('السعر دون المتوسط — توقيت جيد');
        }
        else if (direction === 'SELL') {
            parts.push('بيع DCA — تحقيق أرباح');
            if (rsi > 70)
                parts.push(`RSI مرتفع (${rsi.toFixed(1)}) — توقيت جيد للبيع`);
        }
        return parts.join(' | ');
    }
}
exports.DCAStrategy = DCAStrategy;
//# sourceMappingURL=dca.strategy.js.map