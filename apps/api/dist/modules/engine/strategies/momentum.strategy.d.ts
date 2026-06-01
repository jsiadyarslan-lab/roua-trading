import { BotBaseStrategy } from './bot-base-strategy';
import { BotStrategyType, BotMarketData, BotStrategyAnalysis } from './bot-strategy.types';
export declare class MomentumBotStrategy extends BotBaseStrategy {
    readonly type = BotStrategyType.MOMENTUM;
    readonly name = "\u0627\u0644\u0632\u062E\u0645";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u0632\u062E\u0645 \u2014 \u062A\u062F\u0627\u0648\u0644 \u0645\u0639 \u0627\u062A\u062C\u0627\u0647 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0642\u0648\u064A \u0628\u0646\u0627\u0621\u064B \u0639\u0644\u0649 \u0645\u0639\u062F\u0644 \u0627\u0644\u062A\u063A\u064A\u064A\u0631";
    private readonly minChangePercent;
    private readonly rsiBullishMin;
    private readonly rsiBullishMax;
    private readonly rsiBearishMin;
    private readonly rsiBearishMax;
    constructor(params?: Record<string, any>);
    protected analyze(market: BotMarketData): BotStrategyAnalysis;
    private _calculateMomentumStrength;
    private _buildReasoning;
}
