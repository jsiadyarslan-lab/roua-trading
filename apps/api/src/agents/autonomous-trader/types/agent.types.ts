// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Autonomous Trader Agent Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { OrderSide, OrderType } from '../../../modules/trading/trading.types';

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
  SCALPING = 'SCALPING',
  SWING = 'SWING',
  GRID = 'GRID',
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
}

// ── Market Analysis ──

export interface MarketAnalysis {
  symbol: string;
  timestamp: Date;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;

  // Technical Indicators
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
}

// ── Risk Calculation ──

export interface RiskAssessment {
  canTrade: boolean;
  reason?: string;
  positionSize: number;
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

export class StartAgentDto {
  strategy: StrategyType;
  credentialId: string;
  symbols?: string[];
  maxPositionSizePercent?: number;
  maxDailyLossPercent?: number;
  maxOpenPositions?: number;
  riskPerTradePercent?: number;
  strategyParams?: StrategyParams;
}

export class ChangeStrategyDto {
  strategy: StrategyType;
  strategyParams?: StrategyParams;
}

export class UpdateRiskParamsDto {
  maxPositionSizePercent?: number;
  maxDailyLossPercent?: number;
  maxOpenPositions?: number;
  riskPerTradePercent?: number;
}
