import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType } from '../types/agent.types';
export declare class MomentumBreakoutStrategy extends BaseStrategy {
    readonly type = StrategyType.MOMENTUM_BREAKOUT;
    readonly name = "\u0627\u062E\u062A\u0631\u0627\u0642 \u0627\u0644\u0632\u062E\u0645";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u062E\u062A\u0631\u0627\u0642 \u0627\u0644\u0632\u062E\u0645 \u2014 \u0627\u0644\u062F\u062E\u0648\u0644 \u0639\u0646\u062F \u0643\u0633\u0648\u0631 \u0627\u0644\u0645\u0633\u062A\u0648\u064A\u0627\u062A \u0645\u0639 \u0632\u062E\u0645 \u0642\u0648\u064A";
    constructor(params: any);
    protected analyze(market: MarketAnalysis): StrategyAnalysis;
    protected generateSignal(market: MarketAnalysis, analysis: StrategyAnalysis): EvaluatedSignal;
    private _calculateBreakoutStrength;
    private _buildReasoning;
}
