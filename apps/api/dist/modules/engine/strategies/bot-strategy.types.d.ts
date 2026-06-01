export declare enum BotStrategyType {
    TREND_FOLLOWING = "TREND_FOLLOWING",
    MEAN_REVERSION = "MEAN_REVERSION",
    BREAKOUT = "BREAKOUT",
    MOMENTUM = "MOMENTUM",
    AUTO = "AUTO"
}
export declare enum BotStrategySignal {
    STRONG_BUY = "STRONG_BUY",
    BUY = "BUY",
    NEUTRAL = "NEUTRAL",
    SELL = "SELL",
    STRONG_SELL = "STRONG_SELL"
}
export interface BotMarketData {
    symbol: string;
    price: number;
    change24h: number;
    changePercent24h: number;
    volume24h: number;
    high24h: number;
    low24h: number;
    rsi: number;
    macdHistogram: number;
    macdCrossover: 'BULLISH' | 'BEARISH' | 'NONE';
    bbPercentB: number;
    bbBandwidth: number;
    bbUpper: number;
    bbMiddle: number;
    bbLower: number;
    ema9: number;
    ema21: number;
    ema50: number;
    atr: number;
    volatility: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
    trendStrength: number;
    signalAction?: 'BUY' | 'SELL' | 'WAIT';
    signalConfidence?: number;
    timestamp: Date;
}
export interface BotStrategyAnalysis {
    hasOpportunity: boolean;
    direction: 'BUY' | 'SELL' | 'NEUTRAL';
    strength: number;
    confidence: number;
    reasoning: string;
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
    metadata: Record<string, any>;
}
export interface BotStrategyConfig {
    strategy: BotStrategyType;
    minConfidence: number;
    minRiskRewardRatio: number;
    maxConcurrentPositions: number;
    riskPerTrade: number;
    symbols: string[];
    params: Record<string, any>;
}
export declare enum BotMarketRegime {
    TRENDING_UP = "TRENDING_UP",
    TRENDING_DOWN = "TRENDING_DOWN",
    RANGING = "RANGING",
    VOLATILE = "VOLATILE",
    TRANSITIONAL = "TRANSITIONAL"
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
