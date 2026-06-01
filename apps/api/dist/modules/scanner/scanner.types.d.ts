export declare enum MarketCategory {
    ALL = "ALL",
    CRYPTO = "CRYPTO",
    FOREX = "FOREX",
    STOCK = "STOCK",
    COMMODITY = "COMMODITY"
}
export declare enum SignalDirection {
    STRONG_BUY = "STRONG_BUY",
    BUY = "BUY",
    NEUTRAL = "NEUTRAL",
    SELL = "SELL",
    STRONG_SELL = "STRONG_SELL"
}
export declare enum SignalClass {
    TREND = "TREND",
    REVERSION = "REVERSION",
    BREAKOUT = "BREAKOUT",
    CONSOLIDATION = "CONSOLIDATION",
    WATCH = "WATCH"
}
export declare enum TimeFrame {
    M15 = "15min",
    H1 = "1h",
    H4 = "4h",
    D1 = "1day"
}
export declare class StochResult {
    k: number;
    d: number;
    interpretation: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
}
export declare class AdxResult {
    adx: number;
    plusDi: number;
    minusDi: number;
    trendStrength: 'NO_TREND' | 'WEAK' | 'STRONG' | 'VERY_STRONG';
    trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}
export declare class VwapResult {
    value: number;
    deviation: number;
    position: 'ABOVE' | 'BELOW' | 'AT';
}
export declare class SupportResistanceLevel {
    price: number;
    type: 'SUPPORT' | 'RESISTANCE';
    strength: 'WEAK' | 'MODERATE' | 'STRONG';
    touches: number;
}
export declare class PatternDetection {
    name: string;
    nameAr: string;
    type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    description: string;
    descriptionAr: string;
}
export interface SmartScore {
    trendScore: number;
    momentumScore: number;
    volatilityScore: number;
    volumeScore: number;
    compositeScore: number;
    signalType: 'STRONG_TREND' | 'REVERSAL' | 'BREAKOUT' | 'CONSOLIDATION' | 'DIVERGENCE';
    confidence: number;
    action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
    tradeTimeframe: 'SCALP' | 'DAY' | 'SWING' | 'POSITION';
}
export declare class IchimokuResult {
    tenkanSen: number;
    kijunSen: number;
    senkouSpanA: number;
    senkouSpanB: number;
    chikouSpan: number;
    cloudColor: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    priceVsCloud: 'ABOVE' | 'BELOW' | 'INSIDE';
    tkCross: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}
export declare class ObvResult {
    values: number[];
    trend: 'RISING' | 'FALLING' | 'FLAT';
    divergence: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'NONE';
}
export declare class CciResult {
    value: number;
    interpretation: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
}
export declare class ParabolicSarResult {
    value: number;
    trend: 'RISING' | 'FALLING';
    accelerationFactor: number;
}
export declare class FibonacciLevel {
    level: number;
    price: number;
    label: string;
    labelAr: string;
}
export declare class DivergenceResult {
    type: 'BULLISH' | 'BEARISH' | 'HIDDEN_BULLISH' | 'HIDDEN_BEARISH' | 'NONE';
    indicator: string;
    description: string;
    descriptionAr: string;
    strength: 'WEAK' | 'MODERATE' | 'STRONG';
}
export declare class VolumeProfileLevel {
    priceStart: number;
    priceEnd: number;
    volume: number;
    percentage: number;
}
export declare class VolumeProfileResult {
    levels: VolumeProfileLevel[];
    poc: number;
    valueAreaHigh: number;
    valueAreaLow: number;
}
export declare class CandlePattern {
    name: string;
    nameAr: string;
    type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    description: string;
    descriptionAr: string;
}
export declare class ScannerItemDto {
    symbol: string;
    name: string;
    category: MarketCategory;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    high: number;
    low: number;
    rsi: number | null;
    macdSignal: 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'NONE' | null;
    macdHistogram: number | null;
    bollingerPosition: 'ABOVE_UPPER' | 'BELOW_LOWER' | 'WITHIN' | null;
    stochK: number | null;
    stochD: number | null;
    adx: number | null;
    atr: number | null;
    atrVolatility: 'LOW' | 'NORMAL' | 'HIGH' | null;
    direction: SignalDirection;
    signalClass: SignalClass;
    technicalScore: number;
    confidence: number;
    smartScore: SmartScore | null;
    aiOpinion: string | null;
    sparkline: number[];
    reasons: string[];
    reasonsAr: string[];
    marketOpen: boolean;
    source: string;
    timestamp: Date;
}
export declare class HeatmapItemDto {
    symbol: string;
    name: string;
    category: MarketCategory;
    price: number;
    changePercent: number;
    volume: number;
    direction: SignalDirection;
    technicalScore: number;
    marketCap: number | null;
}
export declare class TimeframeAnalysisDto {
    timeframe: string;
    direction: SignalDirection;
    technicalScore: number;
    rsi: number | null;
    macdSignal: string | null;
    adx: number | null;
    bollingerPosition: string | null;
    confidence: number;
    summary: string;
}
export declare class MultiTfResultDto {
    symbol: string;
    timeframes: TimeframeAnalysisDto[];
    alignment: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
    alignmentScore: number;
    executionHint: string;
    executionHintAr: string;
    confidence: number;
    timestamp: Date;
}
export declare class DeepAnalysisDto {
    symbol: string;
    name: string;
    category: MarketCategory;
    quote: {
        price: number;
        change: number;
        changePercent: number;
        open: number;
        high: number;
        low: number;
        volume: number;
        marketCap: number | null;
        fiftyTwoWeekHigh: number | null;
        fiftyTwoWeekLow: number | null;
    };
    technical: {
        rsi: number | null;
        rsiInterpretation: string | null;
        macdSignal: string | null;
        macdHistogram: number | null;
        bollingerPosition: string | null;
        bollingerBandwidth: number | null;
        stochK: number | null;
        stochD: number | null;
        adx: number | null;
        adxTrend: string | null;
        atr: number | null;
        atrVolatility: string | null;
        vwapPosition: string | null;
        technicalScore: number;
        summary: string;
    };
    smartScore: SmartScore | null;
    ichimoku: IchimokuResult | null;
    obv: ObvResult | null;
    cci: CciResult | null;
    sar: ParabolicSarResult | null;
    fibonacci: FibonacciLevel[] | null;
    divergence: DivergenceResult | null;
    volumeProfile: VolumeProfileResult | null;
    candlePatterns: CandlePattern[];
    supportResistance: SupportResistanceLevel[];
    patterns: PatternDetection[];
    signal: {
        direction: SignalDirection;
        signalClass: SignalClass;
        confidence: number;
        entryPrice: number | null;
        takeProfit: number | null;
        stopLoss: number | null;
        riskRewardRatio: number | null;
        reasons: string[];
        reasonsAr: string[];
    };
    aiAnalysis: string | null;
    aiModel: string | null;
    aiSentiment: string | null;
    riskLevel: string | null;
    marketOpen: boolean;
    source: string;
    timestamp: Date;
}
export declare class ScannerScanResponseDto {
    items: ScannerItemDto[];
    meta: {
        timeframe: string;
        category: string;
        symbolsScanned: number;
        source: string;
        timestamp: Date;
        nextScanInSeconds: number;
    };
}
export declare class MarketOverviewDto {
    totalScanned: number;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    topGainers: HeatmapItemDto[];
    topLosers: HeatmapItemDto[];
    strongestSignals: ScannerItemDto[];
    marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    sentimentScore: number;
    timestamp: Date;
}
export declare const SCANNER_SYMBOLS: {
    symbol: string;
    name: string;
    category: MarketCategory;
}[];
