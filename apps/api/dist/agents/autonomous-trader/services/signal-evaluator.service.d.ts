import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategyParams } from '../types/agent.types';
import { AdaptiveStrategySelectorService } from './adaptive-strategy-selector.service';
export declare class SignalEvaluatorService {
    private readonly adaptiveSelector;
    private readonly logger;
    private readonly strategies;
    private readonly lastAutoSelection;
    constructor(adaptiveSelector: AdaptiveStrategySelectorService);
    evaluate(market: MarketAnalysis, strategyType: StrategyType, strategyParams: StrategyParams, userId: string): Promise<EvaluatedSignal | null>;
    evaluateAll(market: MarketAnalysis, strategyParams: StrategyParams, userId: string): Promise<EvaluatedSignal | null>;
    getAutoRegimeInfo(userId: string, market: MarketAnalysis): Promise<{
        regime: import("../types/agent.types").MarketRegime;
        confidence: number;
        indicators: {
            trendStrength: number;
            volatilityLevel: string;
            emaAlignment: "BULLISH" | "BEARISH" | "MIXED";
            bbBandwidth: number;
            adxProxy: number;
            momentumDirection: "UP" | "DOWN" | "FLAT";
        };
        recommendedStrategies: StrategyType[];
        currentStrategy: StrategyType | null;
        strategyScores: {
            strategy: StrategyType;
            score: number;
            reason: string;
        }[];
    } | null>;
    updateStrategy(userId: string, strategyType: StrategyType, params: StrategyParams): void;
    clearUserStrategies(userId: string): void;
    private _getOrCreateStrategy;
}
