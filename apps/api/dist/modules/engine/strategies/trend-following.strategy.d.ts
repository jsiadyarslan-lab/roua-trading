import { BotBaseStrategy } from './bot-base-strategy';
import { BotStrategyType, BotMarketData, BotStrategyAnalysis } from './bot-strategy.types';
export declare class TrendFollowingStrategy extends BotBaseStrategy {
    readonly type = BotStrategyType.TREND_FOLLOWING;
    readonly name = "\u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u0627\u062A\u062C\u0627\u0647";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u0627\u062A\u062C\u0627\u0647 \u2014 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0639 \u0627\u0644\u0627\u062A\u062C\u0627\u0647 \u0627\u0644\u0642\u0648\u064A \u0648\u0627\u0644\u0628\u0642\u0627\u0621 \u062D\u062A\u0649 \u0627\u0644\u0627\u0646\u0639\u0643\u0627\u0633";
    constructor(params?: Record<string, any>);
    protected analyze(market: BotMarketData): BotStrategyAnalysis;
    private _calculateTrendStrength;
    private _buildReasoning;
}
