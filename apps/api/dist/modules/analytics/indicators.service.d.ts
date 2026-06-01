import { TechnicalAnalysisDto, RsiResult, MacdResult, BollingerBandsResult, AtrResult } from './analytics.types';
import { AggregatedCandleDto } from './analytics.types';
export declare class TechnicalIndicatorService {
    private readonly logger;
    constructor();
    analyze(candles: AggregatedCandleDto[], symbol: string, interval?: string): Promise<TechnicalAnalysisDto>;
    sma(data: number[], period: number): number[];
    ema(data: number[], period: number): number[];
    rsi(data: number[], period?: number): RsiResult | null;
    macd(data: number[], fastPeriod?: number, slowPeriod?: number, signalPeriod?: number): MacdResult | null;
    bollingerBands(data: number[], period?: number, multiplier?: number): BollingerBandsResult | null;
    atr(highs: number[], lows: number[], closes: number[], period?: number): AtrResult | null;
    private _calculateTechnicalScore;
    private _generateSummary;
}
