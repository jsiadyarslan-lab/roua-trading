import { BotBaseStrategy } from './bot-base-strategy';
import { BotStrategyType, BotMarketData, BotStrategyAnalysis } from './bot-strategy.types';
export declare class AutoBotStrategy extends BotBaseStrategy {
    readonly type = BotStrategyType.AUTO;
    readonly name = "\u062A\u0644\u0642\u0627\u0626\u064A (AUTO)";
    readonly description = "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u062A\u0644\u0642\u0627\u0626\u064A\u0629 \u2014 \u062A\u062E\u062A\u0627\u0631 \u0623\u0641\u0636\u0644 \u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u062D\u0633\u0628 \u0638\u0631\u0648\u0641 \u0627\u0644\u0633\u0648\u0642 \u0648\u0648\u0642\u062A \u0627\u0644\u062A\u062F\u0627\u0648\u0644";
    private readonly regimeHistory;
    private readonly REGIME_CONFIRMATION_BARS;
    private readonly lastSwitchTime;
    private readonly COOLDOWN_MS;
    private readonly trendFollowing;
    private readonly meanReversion;
    private readonly breakout;
    private readonly momentum;
    constructor(params?: Record<string, any>);
    evaluate(market: BotMarketData): Promise<BotStrategyAnalysis | null>;
    protected analyze(market: BotMarketData): BotStrategyAnalysis;
    private _detectRegime;
    private _mapRegimeToStrategy;
    private _selectStrategyForRegime;
    private _calculateADXProxy;
    private _applyConfirmation;
    private _getStrategyTypeName;
}
