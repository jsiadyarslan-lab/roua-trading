import { BotBaseStrategy } from './bot-base-strategy';
import { BotStrategyType, BotMarketData, BotStrategyAnalysis } from './bot-strategy.types';
export declare class MeanReversionBotStrategy extends BotBaseStrategy {
    readonly type = BotStrategyType.MEAN_REVERSION;
    readonly name = "\u0639\u0648\u062F\u0629 \u0644\u0644\u0645\u062A\u0648\u0633\u0637";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0639\u0648\u062F\u0629 \u0627\u0644\u0633\u0639\u0631 \u0644\u0645\u062A\u0648\u0633\u0637\u0647 \u2014 \u0635\u0641\u0642\u0627\u062A \u0639\u0643\u0633\u064A\u0629 \u0639\u0646\u062F \u0627\u0644\u0627\u0646\u062D\u0631\u0627\u0641\u0627\u062A \u0627\u0644\u0643\u0628\u064A\u0631\u0629";
    private readonly rsiOversold;
    private readonly rsiOverbought;
    private readonly bbLowerThreshold;
    private readonly bbUpperThreshold;
    private readonly deviationMultiplier;
    constructor(params?: Record<string, any>);
    protected analyze(market: BotMarketData): BotStrategyAnalysis;
    private _calculateReversionStrength;
    private _buildReasoning;
}
