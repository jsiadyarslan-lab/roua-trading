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

export interface BacktestRequest {
  symbol: string;
  strategy: BacktestStrategy;
  periodStart: string; // ISO date
  periodEnd: string;   // ISO date
  initialCapital?: number;
  positionSize?: number; // percentage
  stopLoss?: number;     // percentage
  takeProfit?: number;   // percentage
}

export interface NeuralTrainRequest {
  symbol: string;
  architecture: NeuralArchitecture;
  horizon: PredictionHorizon;
  lookbackDays?: number;  // how many days of history to train on
  epochs?: number;
}

export interface NeuralPredictRequest {
  symbol: string;
  steps: number;          // number of future steps to predict
  horizon: PredictionHorizon;
  includeConfidence?: boolean;
}

export interface SwarmStartRequest {
  agents: number;         // number of agents (1-10)
  symbols: string[];      // symbols to monitor
  strategy: BacktestStrategy;
  riskTolerance: number;  // 0-100
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
