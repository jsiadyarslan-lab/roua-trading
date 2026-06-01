export declare class AggregatedQuoteDto {
    symbol: string;
    name: string;
    currency: string;
    price: number;
    change: number;
    changePercent: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    marketCap: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    sources: string[];
    primarySource: string;
    timestamp: Date;
}
export declare class AggregatedCandleDto {
    symbol: string;
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    sources: string[];
    primarySource: string;
}
export declare class IndicatorValueDto {
    name: string;
    value: number | number[];
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    timestamp: Date;
}
export declare class SmaResult {
    period: number;
    values: number[];
}
export declare class EmaResult {
    period: number;
    values: number[];
}
export declare class RsiResult {
    period: number;
    values: number[];
    interpretation: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
}
export declare class MacdResult {
    macd: number[];
    signal: number[];
    histogram: number[];
    crossover: 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'NONE';
}
export declare class BollingerBandsResult {
    upper: number[];
    middle: number[];
    lower: number[];
    bandwidth: number[];
    position: 'ABOVE_UPPER' | 'BELOW_LOWER' | 'WITHIN';
}
export declare class AtrResult {
    period: number;
    values: number[];
    volatilityLevel: 'LOW' | 'NORMAL' | 'HIGH';
}
export declare class TechnicalAnalysisDto {
    symbol: string;
    interval: string;
    candleCount: number;
    timestamp: Date;
    sma: SmaResult[];
    ema: EmaResult[];
    rsi: RsiResult | null;
    macd: MacdResult | null;
    bollingerBands: BollingerBandsResult | null;
    atr: AtrResult | null;
    technicalScore: number;
    summary: string;
}
export declare class AnalysisCardDto {
    symbol: string;
    timestamp: Date;
    quote: AggregatedQuoteDto | null;
    technical: TechnicalAnalysisDto | null;
    aiAnalysis: string;
    aiModel: string;
    sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';
    confidence: number;
    keyFactors: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}
export declare enum SignalAction {
    BUY = "BUY",
    SELL = "SELL",
    WAIT = "WAIT"
}
export declare class GeneratedSignalDto {
    symbol: string;
    action: SignalAction;
    confidence: number;
    stopLoss: number;
    takeProfit: number | null;
    entryPrice: number | null;
    reason: string;
    supportingIndicators: string[];
    riskRewardRatio: number | null;
    expiresAt: Date;
    id: string;
}
export declare enum DataSource {
    TWELVE_DATA = "TwelveData",
    BINANCE_CCXT = "Binance",
    FINNHUB = "Finnhub"
}
export declare class FinnhubQuoteDto {
    symbol: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
    timestamp: number;
}
