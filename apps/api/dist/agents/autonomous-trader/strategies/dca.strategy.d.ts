import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType } from '../types/agent.types';
export declare class DCAStrategy extends BaseStrategy {
    readonly type = StrategyType.DCA;
    readonly name = "\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u062A\u0643\u0644\u0641\u0629";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062A\u0631\u0627\u0643\u0645 \u0627\u0644\u0645\u0646\u062A\u0638\u0645 \u2014 \u0634\u0631\u0627\u0621 \u062F\u0648\u0631\u064A \u0645\u0639 \u062A\u0639\u0632\u064A\u0632 \u0627\u0644\u062A\u0648\u0642\u064A\u062A \u062D\u0633\u0628 \u0638\u0631\u0648\u0641 \u0627\u0644\u0633\u0648\u0642";
    private readonly baseBuyMultiplier;
    private readonly discountThreshold;
    private readonly skipThreshold;
    constructor(params: any);
    protected analyze(market: MarketAnalysis): StrategyAnalysis;
    protected generateSignal(market: MarketAnalysis, analysis: StrategyAnalysis): EvaluatedSignal;
    private _buildReasoning;
}
