"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scalping_strategy_1 = require("./scalping.strategy");
describe('ScalpingStrategy Relaxation Test', () => {
    let strategy;
    beforeEach(() => {
        strategy = new scalping_strategy_1.ScalpingStrategy({});
    });
    it('should trigger a BUY signal with only 1 bullish indicator (Trend)', () => {
        const mockMarket = {
            symbol: 'BTC/USDT',
            timestamp: new Date(),
            price: 94500,
            rsi: 50,
            macd: { histogram: 0, crossover: 'NONE' },
            bollingerBands: { percentB: 0.5, bandwidth: 0.02 },
            ema: { ema9: 94600, ema21: 94400, ema50: 94000 },
            atr: 500,
            volatility: 'MEDIUM',
            trend: 'BULLISH',
            aiSignal: 'NEUTRAL',
            volume24h: 1000000
        };
        const analysis = strategy.analyze(mockMarket);
        expect(analysis.direction).toBe('BUY');
        expect(analysis.strength).toBeGreaterThanOrEqual(10);
        expect(analysis.hasOpportunity).toBe(true);
    });
    it('should trigger a SELL signal with only 1 bearish indicator (RSI)', () => {
        const mockMarket = {
            symbol: 'BTC/USDT',
            timestamp: new Date(),
            price: 94500,
            rsi: 70,
            macd: { histogram: 0, crossover: 'NONE' },
            bollingerBands: { percentB: 0.5, bandwidth: 0.02 },
            ema: { ema9: 94400, ema21: 94400, ema50: 94400 },
            atr: 500,
            volatility: 'MEDIUM',
            trend: 'SIDEWAYS',
            aiSignal: 'NEUTRAL',
            volume24h: 1000000
        };
        const analysis = strategy.analyze(mockMarket);
        expect(analysis.direction).toBe('SELL');
        expect(analysis.strength).toBeGreaterThanOrEqual(10);
        expect(analysis.hasOpportunity).toBe(true);
    });
});
//# sourceMappingURL=scalping.strategy.spec.js.map