// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Bot Strategy Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Bot Strategy Types — Shared types for bot strategy system
 *
 * The bot strategy system mirrors the agent's strategy architecture
 * but is adapted for the signal-based execution model of TradingBotService.
 */

// ── Bot Strategy Enum ──

export enum BotStrategyType {
  TREND_FOLLOWING = 'TREND_FOLLOWING',
  MEAN_REVERSION = 'MEAN_REVERSION',
  BREAKOUT = 'BREAKOUT',
  MOMENTUM = 'MOMENTUM',
  AUTO = 'AUTO',
}

// ── Bot Strategy Signal ──

export enum BotStrategySignal {
  STRONG_BUY = 'STRONG_BUY',
  BUY = 'BUY',
  NEUTRAL = 'NEUTRAL',
  SELL = 'SELL',
  STRONG_SELL = 'STRONG_SELL',
}

// ── Market Data for Bot Strategies ──

export interface BotMarketData {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;

  // Technical Indicators
  rsi: number;
  macdHistogram: number;
  macdCrossover: 'BULLISH' | 'BEARISH' | 'NONE';
  bbPercentB: number;       // Position within Bollinger Bands (0-1)
  bbBandwidth: number;      // Bollinger Band bandwidth
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  ema9: number;
  ema21: number;
  ema50: number;
  atr: number;

  // Market Sentiment
  volatility: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  trendStrength: number; // 0-100

  // Signal data (from SignalService)
  signalAction?: 'BUY' | 'SELL' | 'WAIT';
  signalConfidence?: number;

  timestamp: Date;
}

// ── Bot Strategy Analysis Result ──

export interface BotStrategyAnalysis {
  hasOpportunity: boolean;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  strength: number; // 0-100
  confidence: number; // 0-100
  reasoning: string;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  metadata: Record<string, any>;
}

// ── Bot Strategy Config ──

export interface BotStrategyConfig {
  strategy: BotStrategyType;
  minConfidence: number;
  minRiskRewardRatio: number;
  maxConcurrentPositions: number;
  riskPerTrade: number; // fraction (0.02 = 2%)
  symbols: string[];
  // Strategy-specific params
  params: Record<string, any>;
}

// ── Bot Regime Detection ──

export enum BotMarketRegime {
  TRENDING_UP = 'TRENDING_UP',
  TRENDING_DOWN = 'TRENDING_DOWN',
  RANGING = 'RANGING',
  VOLATILE = 'VOLATILE',
  TRANSITIONAL = 'TRANSITIONAL',
}

export interface BotRegimeDetection {
  regime: BotMarketRegime;
  confidence: number;
  recommendedStrategy: BotStrategyType;
  indicators: {
    trendStrength: number;
    volatility: string;
    emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED';
    bbBandwidth: number;
    momentumDirection: 'UP' | 'DOWN' | 'FLAT';
  };
}
