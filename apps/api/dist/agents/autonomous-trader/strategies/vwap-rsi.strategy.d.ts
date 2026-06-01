import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType } from '../types/agent.types';
export declare class VWAPRSIStrategy extends BaseStrategy {
    readonly type = StrategyType.VWAP_RSI;
    readonly name = "VWAP + RSI";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 VWAP \u0645\u0639 RSI \u2014 \u0625\u062F\u062E\u0627\u0644\u0627\u062A \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0627\u062D\u062A\u0645\u0627\u0644\u064A\u0629 \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0645\u0631\u062C\u062D \u0628\u0627\u0644\u062D\u062C\u0645 \u0648\u0645\u0624\u0634\u0631 \u0627\u0644\u0642\u0648\u0629 \u0627\u0644\u0646\u0633\u0628\u064A\u0629";
    private readonly rsiBuyMin;
    private readonly rsiBuyMax;
    private readonly rsiSellMin;
    private readonly rsiSellMax;
    constructor(params: any);
    protected analyze(market: MarketAnalysis): StrategyAnalysis;
    protected generateSignal(market: MarketAnalysis, analysis: StrategyAnalysis): EvaluatedSignal;
    private _calculateVWAPStrength;
    private _buildReasoning;
}
