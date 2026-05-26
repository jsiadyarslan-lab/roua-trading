
import { ScalpingStrategy } from '../agents/autonomous-trader/strategies/scalping.strategy';
import { MarketAnalysis, StrategySignal, StrategyType } from '../agents/autonomous-trader/types/agent.types';

async function testRelaxedLogic() {
  console.log('🧪 Testing Relaxed Scalping Logic...');

  const strategy = new ScalpingStrategy({});

  // 1. Mock Market Data: ONLY 1 bullish indicator (Trend)
  // Old logic required 2. New logic requires 1.
  const mockMarket: MarketAnalysis = {
    symbol: 'BTC/USDT',
    timestamp: new Date(),
    price: 94500,
    change24h: 1000,
    changePercent24h: 1.1,
    volume24h: 1000000000,
    high24h: 95000,
    low24h: 93000,
    rsi: 50, // Neutral (not oversold)
    macd: {
      macd: 0.1,
      signal: 0.1,
      histogram: 0.01,
      crossover: 'NONE' // Neutral
    },
    bollingerBands: {
      upper: 95500,
      middle: 94500,
      lower: 93500,
      bandwidth: 0.02,
      percentB: 0.5 // Neutral
    },
    ema: {
      ema9: 94600,
      ema21: 94400, // BULLISH TREND (This is 1 signal)
      ema50: 94000
    },
    atr: 500,
    volatility: 'MEDIUM',
    trend: 'BULLISH',
    trendStrength: 60,
    aiConfidence: 0,
    aiSignal: StrategySignal.NEUTRAL,
    aiReasoning: ''
  };

  // @ts-ignore - analyze is protected, but we can access it for testing
  const analysis = (strategy as any).analyze(mockMarket);

  console.log('--- Results ---');
  console.log(`Direction: ${analysis.direction}`);
  console.log(`Strength: ${analysis.strength}`);
  console.log(`Has Opportunity: ${analysis.hasOpportunity}`);
  console.log(`Reasoning: ${analysis.reasoning}`);

  if (analysis.hasOpportunity && analysis.direction === 'BUY') {
    console.log('✅ SUCCESS: Scalping strategy now triggers with only 1 indicator (Trend)!');
  } else {
    console.log('❌ FAILURE: Strategy still too conservative.');
  }
}

testRelaxedLogic().catch(console.error);
