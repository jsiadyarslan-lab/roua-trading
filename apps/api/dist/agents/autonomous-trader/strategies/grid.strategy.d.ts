import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategyParams } from '../types/agent.types';
export declare class GridStrategy extends BaseStrategy {
    readonly type = StrategyType.GRID;
    readonly name = "\u0634\u0628\u0643\u064A";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u0634\u0628\u0643\u0629 \u2014 \u062A\u062F\u0627\u0648\u0644 \u0641\u064A \u0646\u0637\u0627\u0642 \u0633\u0639\u0631\u064A \u0628\u0623\u0648\u0627\u0645\u0631 \u0634\u0631\u0627\u0621 \u0648\u0628\u064A\u0639 \u0645\u062A\u062F\u0631\u062C\u0629";
    private readonly gridLevels;
    private readonly gridSpacingPercent;
    private readonly gridQuantityPerLevel;
    constructor(params: StrategyParams);
    protected analyze(market: MarketAnalysis): StrategyAnalysis;
    protected generateSignal(market: MarketAnalysis, analysis: StrategyAnalysis): EvaluatedSignal;
    protected validateEntry(market: MarketAnalysis, analysis: StrategyAnalysis): {
        valid: boolean;
        reason?: string;
    };
    private _calculateGridRange;
    private _generateGridLevels;
    private _calculateGridStrength;
    private _buildReasoning;
}
