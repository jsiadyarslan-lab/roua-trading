export declare enum NeuralArchitecture {
    LSTM = "LSTM",
    GRU = "GRU",
    TRANSFORMER = "TRANSFORMER",
    ENSEMBLE = "ENSEMBLE"
}
export declare enum BacktestStrategy {
    MOMENTUM = "MOMENTUM",
    MEAN_REVERSION = "MEAN_REVERSION",
    BREAKOUT = "BREAKOUT",
    SCALPING = "SCALPING",
    SWING = "SWING",
    AI_COUNCIL = "AI_COUNCIL"
}
export declare enum SwarmAgentStatus {
    IDLE = "IDLE",
    RUNNING = "RUNNING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}
export declare enum PredictionHorizon {
    SHORT = "1h",
    MEDIUM = "4h",
    LONG = "1d",
    EXTENDED = "7d"
}
export declare class BacktestRequest {
    symbol: string;
    strategy: BacktestStrategy;
    periodStart: string;
    periodEnd: string;
    initialCapital?: number;
    positionSize?: number;
    stopLoss?: number;
    takeProfit?: number;
    language?: string;
}
export declare class NeuralTrainRequest {
    symbol: string;
    architecture: NeuralArchitecture;
    horizon: PredictionHorizon;
    lookbackDays?: number;
    epochs?: number;
    language?: string;
}
export declare class NeuralPredictRequest {
    symbol: string;
    steps: number;
    horizon: PredictionHorizon;
    includeConfidence?: boolean;
    language?: string;
}
export declare class SwarmStartRequest {
    agents: number;
    symbols: string[];
    strategy: BacktestStrategy;
    riskTolerance: number;
    language?: string;
}
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
    period: {
        start: string;
        end: string;
    };
    totalTrades: number;
    winRate: number;
    totalReturn: number;
    annualizedReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    profitFactor: number;
    avgTradeDuration: string;
    bestTrade: {
        pnl: number;
        pnlPercent: number;
    };
    worstTrade: {
        pnl: number;
        pnlPercent: number;
    };
    finalCapital: number;
    trades: BacktestTrade[];
    equityCurve: {
        date: string;
        value: number;
    }[];
    aiInsights: string;
}
export interface NeuralModelInfo {
    id: string;
    symbol: string;
    architecture: NeuralArchitecture;
    horizon: PredictionHorizon;
    trainedAt: string;
    accuracy: number;
    loss: number;
    sampleCount: number;
}
export interface PricePrediction {
    timestamp: string;
    predictedPrice: number;
    lowerBound: number;
    upperBound: number;
    confidence: number;
}
export interface NeuralPredictResult {
    symbol: string;
    currentPrice: number;
    predictions: PricePrediction[];
    consensusScore: number;
    aiAnalysis: string;
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
        agreement: number;
    };
    performance: {
        totalPnl: number;
        winRate: number;
        activeAgents: number;
    };
    startedAt: string;
}
