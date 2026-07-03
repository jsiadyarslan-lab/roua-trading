// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Autonomous Trader Agent Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { OrderSide, OrderType } from '../../../modules/trading/trading.types';

// Re-export OrderSide and OrderType for use in strategies
export { OrderSide, OrderType };

// ── Agent Status ──

export enum AgentStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
  EMERGENCY_STOP = 'EMERGENCY_STOP',
  DAILY_LIMIT_REACHED = 'DAILY_LIMIT_REACHED',
}

// ── Strategy Types ──

export enum StrategyType {
  AUTO = 'AUTO',
  SCALPING = 'SCALPING',
  SWING = 'SWING',
  GRID = 'GRID',
  MEAN_REVERSION = 'MEAN_REVERSION',
  MOMENTUM_BREAKOUT = 'MOMENTUM_BREAKOUT',
  DCA = 'DCA',
  VWAP_RSI = 'VWAP_RSI',
}

// ── Market Regime Types ──

export enum MarketRegime {
  TRENDING_UP = 'TRENDING_UP',
  TRENDING_DOWN = 'TRENDING_DOWN',
  RANGING = 'RANGING',
  VOLATILE = 'VOLATILE',
  TRANSITIONAL = 'TRANSITIONAL',
}

export interface RegimeDetection {
  regime: MarketRegime;
  confidence: number; // 0-100
  indicators: {
    trendStrength: number;
    volatilityLevel: string;
    emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED';
    bbBandwidth: number;
    adxProxy: number;
    momentumDirection: 'UP' | 'DOWN' | 'FLAT';
  };
  recommendedStrategies: StrategyType[];
  timestamp: Date;
}

export interface StrategyScore {
  strategy: StrategyType;
  score: number; // 0-100
  regimeMatch: number; // 0-100
  recentPerformance: number; // 0-100
  drawdownPenalty: number; // 0-100
  winRateTrend: number; // 0-100
  reason: string;
}

export enum StrategySignal {
  STRONG_BUY = 'STRONG_BUY',
  BUY = 'BUY',
  NEUTRAL = 'NEUTRAL',
  SELL = 'SELL',
  STRONG_SELL = 'STRONG_SELL',
}

// ── Agent Configuration ──

export interface AgentConfig {
  userId: string;
  strategy: StrategyType;
  enabled: boolean;

  // Risk Parameters
  maxPositionSizePercent: number; // Max % of portfolio per position (1-2%)
  maxDailyLossPercent: number; // Max daily loss % (default: 5%)
  maxOpenPositions: number; // Max concurrent open positions (default: 5)
  riskPerTradePercent: number; // Risk per trade as % of capital

  // Strategy-specific params
  strategyParams: StrategyParams;

  // Symbols to trade
  symbols: string[];

  // Exchange credential to use
  credentialId: string;

  // Paper trading mode (no real exchange connection — simulated locally)
  isPaperTrading?: boolean;

  // V135: Testnet mode (real exchange API but testnet/sandbox environment)
  // This is DIFFERENT from isPaperTrading:
  //   - isPaperTrading = true → no real exchange, simulated locally (exchange='paper-trading')
  //   - isTestnet = true → real exchange connection, but using testnet/sandbox funds
  //   - Both false → live/real trading with real funds
  isTestnet?: boolean;

  // V135: Exchange name for display (e.g., 'binance', 'alpaca', 'paper-trading')
  exchangeName?: string;

  // Auto-generated
  createdAt: Date;
  updatedAt: Date;
}

export interface StrategyParams {
  // Scalping
  scalpingTimeframe?: string; // e.g., '1m', '5m'
  scalpingTakeProfitPips?: number;
  scalpingStopLossPips?: number;
  scalpingMaxSpread?: number;

  // Swing
  swingTimeframe?: string; // e.g., '1h', '4h'
  swingHoldingPeriodHours?: number;
  swingTrendLookback?: number;

  // Grid
  gridLevels?: number;
  gridSpacingPercent?: number;
  gridQuantityPerLevel?: number;
  gridUpperBound?: number;
  gridLowerBound?: number;

  // Mean Reversion
  meanReversionRsiOversold?: number;
  meanReversionRsiOverbought?: number;
  meanReversionBbLower?: number;
  meanReversionBbUpper?: number;
  meanReversionDeviation?: number;

  // Momentum Breakout
  momentumBreakoutAtrMultiplier?: number;
  momentumBreakoutVolumeThreshold?: number;

  // DCA
  dcaBaseMultiplier?: number;
  dcaDiscountRsi?: number;
  dcaSkipRsi?: number;

  // VWAP + RSI
  vwapRsiBuyMin?: number;
  vwapRsiBuyMax?: number;
  vwapRsiSellMin?: number;
  vwapRsiSellMax?: number;
}

// ── Market Analysis ──

/**
 * V-PHASE3: Multi-Timeframe Context
 *
 * Provides higher-timeframe trend and indicator data so strategies
 * can confirm their signals against the "big picture".
 *
 * Strategy-to-Timeframe Mapping:
 * ┌──────────────────────┬──────────────┬────────────────────────────┐
 * │ Strategy             │ Primary TF   │ Confirmation TFs           │
 * ├──────────────────────┼──────────────┼────────────────────────────┤
 * │ SCALPING             │ M5           │ M15, H1                    │
 * │ SWING                │ H4           │ D1 (daily confirmation)    │
 * │ MOMENTUM_BREAKOUT    │ M15          │ H1, H4                     │
 * │ MEAN_REVERSION       │ M15          │ H1                         │
 * │ GRID                 │ H1           │ H4                         │
 * │ DCA                  │ H4           │ D1                         │
 * │ VWAP_RSI             │ M15          │ H1                         │
 * └──────────────────────┴──────────────┴────────────────────────────┘
 */
export interface HigherTimeframeData {
  /** Timeframe label (e.g., 'M15', 'H1', 'H4', 'D1') */
  timeframe: string;
  /** Trend direction on this timeframe */
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  /** RSI value on this timeframe */
  rsi: number;
  /** MACD signal direction */
  macdSignal: 'BULLISH' | 'BEARISH' | 'NONE';
  /** EMA alignment (9 > 21 > 50 = BULLISH, etc.) */
  emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED';
  /** Trend strength 0-100 */
  trendStrength: number;
}

export interface HigherTimeframeContext {
  /** The strategy's primary timeframe (e.g., 'M5' for scalping, 'H4' for swing) */
  primaryTimeframe: string;
  /** Data for each higher/confirmation timeframe */
  higherTimeframes: HigherTimeframeData[];
  /** Overall multi-timeframe alignment verdict */
  mtfAlignment: 'ALIGNED_BULLISH' | 'ALIGNED_BEARISH' | 'MIXED' | 'NEUTRAL';
  /** Alignment strength 0-100 (100 = all timeframes agree perfectly) */
  mtfAlignmentScore: number;
}

export interface MarketAnalysis {
  symbol: string;
  timestamp: Date;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;

  // Technical Indicators (computed on the primary timeframe)
  rsi: number;
  macd: MACDResult;
  bollingerBands: BollingerBandsResult;
  ema: EMAResult;
  atr: number; // Average True Range

  // Market Sentiment
  volatility: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  trendStrength: number; // 0-100

  // AI Enhancement
  aiConfidence: number; // 0-100
  aiSignal: StrategySignal;
  aiReasoning: string;

  // V-PHASE3: Multi-Timeframe Context
  // Null when MTF analysis is unavailable (e.g., insufficient data for higher TFs)
  mtfContext?: HigherTimeframeContext | null;
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  crossover: 'BULLISH' | 'BEARISH' | 'NONE';
}

export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number; // Position within bands (0-1)
}

export interface EMAResult {
  ema9: number;
  ema21: number;
  ema50: number;
  ema200?: number;
}

// ── Signal Evaluation ──

export interface EvaluatedSignal {
  id: string;
  symbol: string;
  action: OrderSide;
  type: OrderType;
  confidence: number; // 0-100
  strategy: StrategyType;
  entryPrice: number;
  stopLoss: number; // MANDATORY
  takeProfit: number;
  quantity: number;
  reasoning: string;
  riskRewardRatio: number;
  riskScore: number; // 0-100
  timestamp: Date;
  metadata: Record<string, any>;
  /** V132: Timeframe of the signal — used for smart idempotency TTL */
  timeframe?: string;
}

// ── Risk Calculation ──

export interface RiskAssessment {
  canTrade: boolean;
  reason?: string;
  positionSize: number; // RAW UNITS — for internal risk checks (margin, notional, % portfolio)
  lots: number;         // LOTS — what gets sent to OrderDispatcher (DB stores this directly)
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  riskScore: number; // 0-100
  dailyPnL: number;
  dailyLossPercent: number;
  openPositionsCount: number;
  portfolioValue: number;
}

// ── Trade Execution ──

export interface TradeExecution {
  success: boolean;
  orderId?: string;
  exchangeOrderId?: string;
  filledQuantity?: number;
  averagePrice?: number;
  fee?: number;
  feeCurrency?: string;
  slippage?: number;
  error?: string;
  executionTimeMs: number;
}

// ── Performance Tracking ──

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // percentage
  totalPnL: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  averageHoldingTime: number; // in minutes
  bestTrade: number;
  worstTrade: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  startDate: Date;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME';
}

// ── Audit Trail ──

export interface AgentDecision {
  id: string;
  userId: string;
  timestamp: Date;
  decisionType: 'ANALYSIS' | 'SIGNAL_GENERATED' | 'ORDER_PLACED' | 'ORDER_CANCELLED' | 'STOP_LOSS_HIT' | 'TAKE_PROFIT_HIT' | 'RISK_REJECTED' | 'DAILY_LIMIT_REACHED' | 'STRATEGY_CHANGED' | 'AGENT_STOPPED';
  symbol?: string;
  details: string; // JSON stringified details
  confidence?: number;
  riskScore?: number;
  pnl?: number;
}

// ── Agent State (stored in Redis) ──

export interface AgentState {
  status: AgentStatus;
  config: AgentConfig;
  startedAt?: Date;
  lastCycleAt?: Date;
  lastSignalAt?: Date;
  dailyPnL: number;
  dailyTradesCount: number;
  dailyResetAt?: Date; // When daily stats were last reset
  consecutiveLosses: number;
  totalCycles: number;
  lastError?: string;
}

// ── API DTOs ──

import {
  IsOptional, IsString, IsIn, IsArray,
  IsNumber, Min, Max, ValidateNested, IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StrategyParamsDto implements StrategyParams {
  // Scalping
  @IsOptional() @IsString() scalpingTimeframe?: string;
  @IsOptional() @IsNumber() @Type(() => Number) scalpingTakeProfitPips?: number;
  @IsOptional() @IsNumber() @Type(() => Number) scalpingStopLossPips?: number;
  @IsOptional() @IsNumber() @Type(() => Number) scalpingMaxSpread?: number;

  // Swing
  @IsOptional() @IsString() swingTimeframe?: string;
  @IsOptional() @IsNumber() @Type(() => Number) swingHoldingPeriodHours?: number;
  @IsOptional() @IsNumber() @Type(() => Number) swingTrendLookback?: number;

  // Grid
  @IsOptional() @IsNumber() @Type(() => Number) gridLevels?: number;
  @IsOptional() @IsNumber() @Type(() => Number) gridSpacingPercent?: number;
  @IsOptional() @IsNumber() @Type(() => Number) gridQuantityPerLevel?: number;
  @IsOptional() @IsNumber() @Type(() => Number) gridUpperBound?: number;
  @IsOptional() @IsNumber() @Type(() => Number) gridLowerBound?: number;
}

export class StartAgentDto {
  // FIX: SCALPING removed — it belongs to the Smart Executor, not the Agent.
  // The Agent handles M30+ timeframes (short/medium/long-term trades).
  @IsIn(['AUTO', 'SWING', 'GRID', 'MEAN_REVERSION', 'MOMENTUM_BREAKOUT', 'DCA', 'VWAP_RSI'])
  strategy: StrategyType;

  @IsOptional()
  @IsString()
  credentialId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symbols?: string[];

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1) @Max(100)
  maxPositionSizePercent?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1) @Max(100)
  maxDailyLossPercent?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1) @Max(50)
  maxOpenPositions?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1) @Max(10)
  riskPerTradePercent?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => StrategyParamsDto)
  strategyParams?: StrategyParams;
}

export class ChangeStrategyDto {
  // FIX: SCALPING removed — it belongs to the Smart Executor, not the Agent.
  @IsIn(['AUTO', 'SWING', 'GRID', 'MEAN_REVERSION', 'MOMENTUM_BREAKOUT', 'DCA', 'VWAP_RSI'])
  strategy: StrategyType;

  @IsOptional()
  @ValidateNested()
  @Type(() => StrategyParamsDto)
  strategyParams?: StrategyParams;
}

export class UpdateRiskParamsDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1) @Max(100)
  maxPositionSizePercent?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1) @Max(100)
  maxDailyLossPercent?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1) @Max(50)
  maxOpenPositions?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1) @Max(10)
  riskPerTradePercent?: number;
}

// ── Agent Settings DTO (Full Settings Management) ──

export class UpdateAgentSettingsDto {
  // Trading Mode
  @IsOptional()
  autoTradingEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(100) @Max(1000000)
  paperBalance?: number;

  // V153: Paper Trading Leverage (user-configurable)
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1) @Max(1000)
  paperForexLeverage?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1) @Max(500)
  paperGoldLeverage?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1) @Max(200)
  paperCryptoLeverage?: number;

  // Risk Parameters
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1) @Max(100)
  maxPositionSizePercent?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1) @Max(100)
  maxDailyLossPercent?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1) @Max(50)
  maxOpenPositions?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1) @Max(10)
  riskPerTradePercent?: number;

  // Default Strategy
  // FIX: SCALPING removed — it belongs to the Smart Executor, not the Agent.
  @IsOptional()
  @IsIn(['AUTO', 'SWING', 'GRID', 'MEAN_REVERSION', 'MOMENTUM_BREAKOUT', 'DCA', 'VWAP_RSI'])
  defaultStrategy?: string;

  // Scalping Params
  @IsOptional() @IsString() scalpingTimeframe?: string;
  @IsOptional() @IsNumber() @Type(() => Number) @Min(1) @Max(100) scalpingTakeProfitPips?: number;
  @IsOptional() @IsNumber() @Type(() => Number) @Min(1) @Max(100) scalpingStopLossPips?: number;
  @IsOptional() @IsNumber() @Type(() => Number) @Min(1) @Max(50) scalpingMaxSpread?: number;

  // Swing Params
  @IsOptional() @IsString() swingTimeframe?: string;
  @IsOptional() @IsNumber() @Type(() => Number) @Min(1) @Max(720) swingHoldingPeriodHours?: number;
  @IsOptional() @IsNumber() @Type(() => Number) @Min(5) @Max(200) swingTrendLookback?: number;

  // Grid Params
  @IsOptional() @IsNumber() @Type(() => Number) @Min(2) @Max(50) gridLevels?: number;
  @IsOptional() @IsNumber() @Type(() => Number) @Min(0.1) @Max(10) gridSpacingPercent?: number;
  @IsOptional() @IsNumber() @Type(() => Number) @Min(0) gridQuantityPerLevel?: number;

  // Default Symbols
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  defaultSymbols?: string[];
}
