
import { ScalpingStrategy } from './scalping.strategy';
import { MarketAnalysis, StrategySignal } from '../types/agent.types';

describe('ScalpingStrategy Relaxation Test', () => {
  let strategy: ScalpingStrategy;

  beforeEach(() => {
    strategy = new ScalpingStrategy({});
  });

  it('should trigger a BUY signal with only 1 bullish indicator (Trend)', () => {
    const mockMarket: any = {
      symbol: 'BTC/USDT',
      timestamp: new Date(),
      price: 94500,
      rsi: 50, // Neutral
      macd: { histogram: 0, crossover: 'NONE' },
      bollingerBands: { percentB: 0.5, bandwidth: 0.02 },
      ema: { ema9: 94600, ema21: 94400, ema50: 94000 }, // BULLISH TREND
      atr: 500,
      volatility: 'MEDIUM',
      trend: 'BULLISH',
      aiSignal: 'NEUTRAL',
      volume24h: 1000000
    };

    // @ts-ignore
    const analysis = strategy.analyze(mockMarket);

    expect(analysis.direction).toBe('BUY');
    expect(analysis.strength).toBeGreaterThanOrEqual(10);
    expect(analysis.hasOpportunity).toBe(true);
  });

  it('should trigger a SELL signal with only 1 bearish indicator (RSI)', () => {
    const mockMarket: any = {
      symbol: 'BTC/USDT',
      timestamp: new Date(),
      price: 94500,
      rsi: 70, // OVERBOUGHT (Bearish signal for scalp)
      macd: { histogram: 0, crossover: 'NONE' },
      bollingerBands: { percentB: 0.5, bandwidth: 0.02 },
      ema: { ema9: 94400, ema21: 94400, ema50: 94400 }, // Neutral trend
      atr: 500,
      volatility: 'MEDIUM',
      trend: 'SIDEWAYS',
      aiSignal: 'NEUTRAL',
      volume24h: 1000000
    };

    // @ts-ignore
    const analysis = strategy.analyze(mockMarket);

    expect(analysis.direction).toBe('SELL');
    expect(analysis.strength).toBeGreaterThanOrEqual(10);
    expect(analysis.hasOpportunity).toBe(true);
  });
});
