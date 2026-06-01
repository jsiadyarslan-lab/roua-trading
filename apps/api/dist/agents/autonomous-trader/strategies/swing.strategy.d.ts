import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType } from '../types/agent.types';
export declare class SwingStrategy extends BaseStrategy {
    readonly type = StrategyType.SWING;
    readonly name = "\u062A\u062F\u0627\u0648\u0644 \u0633\u0648\u064A\u0646\u063A";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u0633\u0648\u064A\u0646\u063A \u2014 \u0635\u0641\u0642\u0627\u062A \u0645\u062A\u0648\u0633\u0637\u0629 \u0627\u0644\u0623\u062C\u0644 \u062A\u0639\u062A\u0645\u062F \u0639\u0644\u0649 \u0627\u0644\u0627\u062A\u062C\u0627\u0647 \u0648\u0627\u0644\u0632\u062E\u0645";
    private readonly holdingPeriodHours;
    constructor(params: any);
    protected analyze(market: MarketAnalysis): StrategyAnalysis;
    protected generateSignal(market: MarketAnalysis, analysis: StrategyAnalysis): EvaluatedSignal;
    private _calculateSwingStrength;
    private _buildReasoning;
}
