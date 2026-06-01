import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType } from '../types/agent.types';
export declare class ScalpingStrategy extends BaseStrategy {
    readonly type = StrategyType.SCALPING;
    readonly name = "\u0645\u0636\u0627\u0631\u0628\u0629 \u0633\u0631\u064A\u0639\u0629";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u0645\u0636\u0627\u0631\u0628\u0629 \u0627\u0644\u0633\u0631\u064A\u0639\u0629 \u2014 \u0635\u0641\u0642\u0627\u062A \u0642\u0635\u064A\u0631\u0629 \u0627\u0644\u0623\u062C\u0644 \u0628\u0623\u0631\u0628\u0627\u062D \u0635\u063A\u064A\u0631\u0629 \u0645\u062A\u0643\u0631\u0631\u0629";
    private readonly maxSpreadPips;
    private readonly rsiOversold;
    private readonly rsiOverbought;
    constructor(params: any);
    protected analyze(market: MarketAnalysis): StrategyAnalysis;
    protected generateSignal(market: MarketAnalysis, analysis: StrategyAnalysis): EvaluatedSignal;
    private _calculateScalpStrength;
    private _buildReasoning;
}
