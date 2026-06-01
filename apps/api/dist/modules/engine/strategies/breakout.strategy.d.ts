import { BotBaseStrategy } from './bot-base-strategy';
import { BotStrategyType, BotMarketData, BotStrategyAnalysis } from './bot-strategy.types';
export declare class BreakoutBotStrategy extends BotBaseStrategy {
    readonly type = BotStrategyType.BREAKOUT;
    readonly name = "\u0627\u0644\u0627\u062E\u062A\u0631\u0627\u0642";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u0627\u062E\u062A\u0631\u0627\u0642 \u2014 \u0627\u0644\u062F\u062E\u0648\u0644 \u0639\u0646\u062F \u0643\u0633\u0631 \u0645\u0633\u062A\u0648\u064A\u0627\u062A \u0627\u0644\u062F\u0639\u0645 \u0648\u0627\u0644\u0645\u0642\u0627\u0648\u0645\u0629 \u0645\u0639 \u0632\u062E\u0645 \u0642\u0648\u064A";
    constructor(params?: Record<string, any>);
    protected analyze(market: BotMarketData): BotStrategyAnalysis;
    private _calculateBreakoutStrength;
    private _buildReasoning;
}
