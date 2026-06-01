import { OrderSide, OrderType } from '../../../modules/trading/trading.types';
export { OrderSide, OrderType };
export declare enum AgentStatus {
    IDLE = "IDLE",
    RUNNING = "RUNNING",
    PAUSED = "PAUSED",
    STOPPED = "STOPPED",
    EMERGENCY_STOP = "EMERGENCY_STOP",
    DAILY_LIMIT_REACHED = "DAILY_LIMIT_REACHED"
}
export declare enum StrategyType {
    AUTO = "AUTO",
    SCALPING = "SCALPING",
    SWING = "SWING",
    GRID = "GRID",
    MEAN_REVERSION = "MEAN_REVERSION",
    MOMENTUM_BREAKOUT = "MOMENTUM_BREAKOUT",
    DCA = "DCA",
    VWAP_RSI = "VWAP_RSI"
}
export declare enum MarketRegime {
    TRENDING_UP = "TRENDING_UP",
    TRENDING_DOWN = "TRENDING_DOWN",
    RANGING = "RANGING",
    VOLATILE = "VOLATILE",
    TRANSITIONAL = "TRANSITIONAL"
}
export interface RegimeDetection {
    regime: MarketRegime;
    confidence: number;
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
    score: number;
    regimeMatch: number;
    recentPerformance: number;
    drawdownPenalty: number;
    winRateTrend: number;
    reason: string;
}
export declare enum StrategySignal {
    STRONG_BUY = "STRONG_BUY",
    BUY = "BUY",
    NEUTRAL = "NEUTRAL",
    SELL = "SELL",
    STRONG_SELL = "STRONG_SELL"
}
export interface AgentConfig {
    userId: string;
    strategy: StrategyType;
    enabled: boolean;
    maxPositionSizePercent: number;
    maxDailyLossPercent: number;
    maxOpenPositions: number;
    riskPerTradePercent: number;
    strategyParams: StrategyParams;
    symbols: string[];
    credentialId: string;
    isPaperTrading?: boolean;
    isTestnet?: boolean;
    exchangeName?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface StrategyParams {
    scalpingTimeframe?: string;
    scalpingTakeProfitPips?: number;
    scalpingStopLossPips?: number;
    scalpingMaxSpread?: number;
    swingTimeframe?: string;
    swingHoldingPeriodHours?: number;
    swingTrendLookback?: number;
    gridLevels?: number;
    gridSpacingPercent?: number;
    gridQuantityPerLevel?: number;
    gridUpperBound?: number;
    gridLowerBound?: number;
    meanReversionRsiOversold?: number;
    meanReversionRsiOverbought?: number;
    meanReversionBbLower?: number;
    meanReversionBbUpper?: number;
    meanReversionDeviation?: number;
    momentumBreakoutAtrMultiplier?: number;
    momentumBreakoutVolumeThreshold?: number;
    dcaBaseMultiplier?: number;
    dcaDiscountRsi?: number;
    dcaSkipRsi?: number;
    vwapRsiBuyMin?: number;
    vwapRsiBuyMax?: number;
    vwapRsiSellMin?: number;
    vwapRsiSellMax?: number;
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
    rsi: number;
    macd: MACDResult;
    bollingerBands: BollingerBandsResult;
    ema: EMAResult;
    atr: number;
    volatility: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
    trendStrength: number;
    aiConfidence: number;
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
    percentB: number;
}
export interface EMAResult {
    ema9: number;
    ema21: number;
    ema50: number;
    ema200?: number;
}
export interface EvaluatedSignal {
    id: string;
    symbol: string;
    action: OrderSide;
    type: OrderType;
    confidence: number;
    strategy: StrategyType;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    quantity: number;
    reasoning: string;
    riskRewardRatio: number;
    riskScore: number;
    timestamp: Date;
    metadata: Record<string, any>;
    timeframe?: string;
}
export interface RiskAssessment {
    canTrade: boolean;
    reason?: string;
    positionSize: number;
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
    riskScore: number;
    dailyPnL: number;
    dailyLossPercent: number;
    openPositionsCount: number;
    portfolioValue: number;
}
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
export interface PerformanceMetrics {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    averageWin: number;
    averageLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    averageHoldingTime: number;
    bestTrade: number;
    worstTrade: number;
    consecutiveWins: number;
    consecutiveLosses: number;
    startDate: Date;
    period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME';
}
export interface AgentDecision {
    id: string;
    userId: string;
    timestamp: Date;
    decisionType: 'ANALYSIS' | 'SIGNAL_GENERATED' | 'ORDER_PLACED' | 'ORDER_CANCELLED' | 'STOP_LOSS_HIT' | 'TAKE_PROFIT_HIT' | 'RISK_REJECTED' | 'DAILY_LIMIT_REACHED' | 'STRATEGY_CHANGED' | 'AGENT_STOPPED';
    symbol?: string;
    details: string;
    confidence?: number;
    riskScore?: number;
    pnl?: number;
}
export interface AgentState {
    status: AgentStatus;
    config: AgentConfig;
    startedAt?: Date;
    lastCycleAt?: Date;
    lastSignalAt?: Date;
    dailyPnL: number;
    dailyTradesCount: number;
    dailyResetAt?: Date;
    consecutiveLosses: number;
    totalCycles: number;
    lastError?: string;
}
export declare class StrategyParamsDto implements StrategyParams {
    scalpingTimeframe?: string;
    scalpingTakeProfitPips?: number;
    scalpingStopLossPips?: number;
    scalpingMaxSpread?: number;
    swingTimeframe?: string;
    swingHoldingPeriodHours?: number;
    swingTrendLookback?: number;
    gridLevels?: number;
    gridSpacingPercent?: number;
    gridQuantityPerLevel?: number;
    gridUpperBound?: number;
    gridLowerBound?: number;
}
export declare class StartAgentDto {
    strategy: StrategyType;
    credentialId?: string;
    symbols?: string[];
    maxPositionSizePercent?: number;
    maxDailyLossPercent?: number;
    maxOpenPositions?: number;
    riskPerTradePercent?: number;
    strategyParams?: StrategyParams;
}
export declare class ChangeStrategyDto {
    strategy: StrategyType;
    strategyParams?: StrategyParams;
}
export declare class UpdateRiskParamsDto {
    maxPositionSizePercent?: number;
    maxDailyLossPercent?: number;
    maxOpenPositions?: number;
    riskPerTradePercent?: number;
}
export declare class UpdateAgentSettingsDto {
    autoTradingEnabled?: boolean;
    paperBalance?: number;
    paperForexLeverage?: number;
    paperGoldLeverage?: number;
    paperCryptoLeverage?: number;
    maxPositionSizePercent?: number;
    maxDailyLossPercent?: number;
    maxOpenPositions?: number;
    riskPerTradePercent?: number;
    defaultStrategy?: string;
    scalpingTimeframe?: string;
    scalpingTakeProfitPips?: number;
    scalpingStopLossPips?: number;
    scalpingMaxSpread?: number;
    swingTimeframe?: string;
    swingHoldingPeriodHours?: number;
    swingTrendLookback?: number;
    gridLevels?: number;
    gridSpacingPercent?: number;
    gridQuantityPerLevel?: number;
    defaultSymbols?: string[];
}
