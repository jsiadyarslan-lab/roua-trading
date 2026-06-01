import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategySignal, StrategyParams } from '../types/agent.types';
export declare abstract class BaseStrategy {
    abstract readonly type: StrategyType;
    abstract readonly name: string;
    abstract readonly description: string;
    protected params: StrategyParams;
    protected minRiskRewardRatio: number;
    protected minConfidence: number;
    constructor(params: StrategyParams);
    evaluate(market: MarketAnalysis): Promise<EvaluatedSignal | null>;
    protected abstract analyze(market: MarketAnalysis): StrategyAnalysis;
    protected abstract generateSignal(market: MarketAnalysis, analysis: StrategyAnalysis): EvaluatedSignal;
    protected validateEntry(market: MarketAnalysis, analysis: StrategyAnalysis): {
        valid: boolean;
        reason?: string;
    };
    protected calculateLevels(entryPrice: number, side: 'BUY' | 'SELL', atr: number, slMultiplier?: number, tpMultiplier?: number): {
        stopLoss: number;
        takeProfit: number;
        riskRewardRatio: number;
    };
    protected calculateConfidence(factors: {
        trendAlignment: boolean;
        indicatorStrength: number;
        volumeConfirmation: boolean;
        aiSignal?: StrategySignal;
        rsi?: number;
        macdCrossover?: 'BULLISH' | 'BEARISH' | 'NONE';
    }): number;
    updateParams(params: Partial<StrategyParams>): void;
    getParams(): StrategyParams;
}
export interface StrategyAnalysis {
    hasOpportunity: boolean;
    direction: 'BUY' | 'SELL' | 'NEUTRAL';
    strength: number;
    requiresTrend: boolean;
    spreadTooWide: boolean;
    indicators: {
        trendAlignment: boolean;
        indicatorStrength: number;
        volumeConfirmation: boolean;
        rsi?: number;
        macdCrossover?: 'BULLISH' | 'BEARISH' | 'NONE';
    };
    reasoning: string;
    metadata: Record<string, any>;
}
