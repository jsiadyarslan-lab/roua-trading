"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scalping_strategy_1 = require("../agents/autonomous-trader/strategies/scalping.strategy");
const agent_types_1 = require("../agents/autonomous-trader/types/agent.types");
async function testRelaxedLogic() {
    console.log('🧪 Testing Relaxed Scalping Logic...');
    const strategy = new scalping_strategy_1.ScalpingStrategy({});
    const mockMarket = {
        symbol: 'BTC/USDT',
        timestamp: new Date(),
        price: 94500,
        change24h: 1000,
        changePercent24h: 1.1,
        volume24h: 1000000000,
        high24h: 95000,
        low24h: 93000,
        rsi: 50,
        macd: {
            macd: 0.1,
            signal: 0.1,
            histogram: 0.01,
            crossover: 'NONE'
        },
        bollingerBands: {
            upper: 95500,
            middle: 94500,
            lower: 93500,
            bandwidth: 0.02,
            percentB: 0.5
        },
        ema: {
            ema9: 94600,
            ema21: 94400,
            ema50: 94000
        },
        atr: 500,
        volatility: 'MEDIUM',
        trend: 'BULLISH',
        trendStrength: 60,
        aiConfidence: 0,
        aiSignal: agent_types_1.StrategySignal.NEUTRAL,
        aiReasoning: ''
    };
    const analysis = strategy.analyze(mockMarket);
    console.log('--- Results ---');
    console.log(`Direction: ${analysis.direction}`);
    console.log(`Strength: ${analysis.strength}`);
    console.log(`Has Opportunity: ${analysis.hasOpportunity}`);
    console.log(`Reasoning: ${analysis.reasoning}`);
    if (analysis.hasOpportunity && analysis.direction === 'BUY') {
        console.log('✅ SUCCESS: Scalping strategy now triggers with only 1 indicator (Trend)!');
    }
    else {
        console.log('❌ FAILURE: Strategy still too conservative.');
    }
}
testRelaxedLogic().catch(console.error);
//# sourceMappingURL=test_scalp.js.map