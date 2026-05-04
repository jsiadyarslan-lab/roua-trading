// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Neural Trading Lab Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Neural network architecture types */
export enum NeuralArchitecture {
  LSTM = 'LSTM',
  GRU = 'GRU',
  TRANSFORMER = 'TRANSFORMER',
  ENSEMBLE = 'ENSEMBLE',
}

/** Backtest strategy identifiers */
export enum BacktestStrategy {
  MOMENTUM = 'MOMENTUM',
  MEAN_REVERSION = 'MEAN_REVERSION',
  BREAKOUT = 'BREAKOUT',
  SCALPING = 'SCALPING',
  SWING = 'SWING',
  AI_COUNCIL = 'AI_COUNCIL',
}

/** Swarm agent status */
export enum SwarmAgentStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/** Prediction time horizon */
export enum PredictionHorizon {
  SHORT = '1h',    // 1 hour
  MEDIUM = '4h',   // 4 hours
  LONG = '1d',     // 1 day
  EXTENDED = '7d', // 1 week
}

// ── Request DTOs ──

import { IsString, IsNumber, IsOptional, IsArray, IsEnum, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class BacktestRequest {
  @IsString()
  symbol: string;

  @IsEnum(BacktestStrategy)
  @IsOptional()
  strategy: BacktestStrategy;

  @IsString()
  periodStart: string;

  @IsString()
  periodEnd: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  initialCapital?: number;

  @IsNumber()
  @Min(0.01)
  @Max(1)
  @IsOptional()
  @Type(() => Number)
  positionSize?: number;

  @IsNumber()
  @Min(0.001)
  @Max(0.5)
  @IsOptional()
  @Type(() => Number)
  stopLoss?: number;

  @IsNumber()
  @Min(0.001)
  @Max(1)
  @IsOptional()
  @Type(() => Number)
  takeProfit?: number;
}

export class NeuralTrainRequest {
  @IsString()
  symbol: string;

  @IsEnum(NeuralArchitecture)
  @IsOptional()
  architecture: NeuralArchitecture;

  @IsEnum(PredictionHorizon)
  @IsOptional()
  horizon: PredictionHorizon;

  @IsNumber()
  @Min(1)
  @Max(365)
  @IsOptional()
  @Type(() => Number)
  lookbackDays?: number;

  @IsNumber()
  @Min(1)
  @Max(1000)
  @IsOptional()
  @Type(() => Number)
  epochs?: number;
}

export class NeuralPredictRequest {
  @IsString()
  symbol: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  steps: number;

  @IsEnum(PredictionHorizon)
  @IsOptional()
  horizon: PredictionHorizon;

  @IsBoolean()
  @IsOptional()
  includeConfidence?: boolean;
}

export class SwarmStartRequest {
  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  @Type(() => Number)
  agents: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  symbols: string[];

  @IsEnum(BacktestStrategy)
  @IsOptional()
  strategy: BacktestStrategy;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  riskTolerance: number;
}

// ── Response DTOs ──

export interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  holdDuration: string;
  stopLoss: number;
  takeProfit: number;
}

export interface BacktestResult {
  symbol: string;
  strategy: string;
  period: { start: string; end: string };
  totalTrades: number;
  winRate: number;            // percentage
  totalReturn: number;        // percentage
  annualizedReturn: number;   // percentage
  maxDrawdown: number;        // percentage
  sharpeRatio: number;
  profitFactor: number;
  avgTradeDuration: string;
  bestTrade: { pnl: number; pnlPercent: number };
  worstTrade: { pnl: number; pnlPercent: number };
  finalCapital: number;
  trades: BacktestTrade[];
  equityCurve: { date: string; value: number }[];
  aiInsights: string;         // Arabic analysis from AI Council
}

export interface NeuralModelInfo {
  id: string;
  symbol: string;
  architecture: NeuralArchitecture;
  horizon: PredictionHorizon;
  trainedAt: string;
  accuracy: number;           // 0-100
  loss: number;
  sampleCount: number;
}

export interface PricePrediction {
  timestamp: string;
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;         // 0-100
}

export interface NeuralPredictResult {
  symbol: string;
  currentPrice: number;
  predictions: PricePrediction[];
  consensusScore: number;     // AI Council agreement 0-100
  aiAnalysis: string;         // Arabic analysis
  modelInfo: {
    architecture: NeuralArchitecture;
    horizon: PredictionHorizon;
    accuracy: number;
  };
}

export interface SwarmAgent {
  id: string;
  symbol: string;
  status: SwarmAgentStatus;
  signal: 'BUY' | 'SELL' | 'WAIT' | null;
  confidence: number;
  pnl: number;
  trades: number;
}

export interface SwarmResult {
  swarmId: string;
  status: 'ACTIVE' | 'STOPPED';
  agents: SwarmAgent[];
  consensus: {
    action: 'BUY' | 'SELL' | 'WAIT';
    confidence: number;
    agreement: number;  // 0-100% of agents agree
  };
  performance: {
    totalPnl: number;
    winRate: number;
    activeAgents: number;
  };
  startedAt: string;
}
