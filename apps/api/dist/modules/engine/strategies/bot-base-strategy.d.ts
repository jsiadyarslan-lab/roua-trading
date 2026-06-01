import { BotStrategyType, BotMarketData, BotStrategyAnalysis } from './bot-strategy.types';
export declare abstract class BotBaseStrategy {
    abstract readonly type: BotStrategyType;
    abstract readonly name: string;
    abstract readonly description: string;
    protected minRiskRewardRatio: number;
    protected minConfidence: number;
    protected params: Record<string, any>;
    constructor(params?: Record<string, any>);
    evaluate(market: BotMarketData): Promise<BotStrategyAnalysis | null>;
    protected abstract analyze(market: BotMarketData): BotStrategyAnalysis;
    protected validateEntry(market: BotMarketData, analysis: BotStrategyAnalysis): {
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
        signalAgreement?: boolean;
        rsi?: number;
        macdCrossover?: 'BULLISH' | 'BEARISH' | 'NONE';
    }): number;
    updateParams(params: Partial<Record<string, any>>): void;
}
