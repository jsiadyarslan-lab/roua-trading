"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotMarketRegime = exports.BotStrategySignal = exports.BotStrategyType = void 0;
var BotStrategyType;
(function (BotStrategyType) {
    BotStrategyType["TREND_FOLLOWING"] = "TREND_FOLLOWING";
    BotStrategyType["MEAN_REVERSION"] = "MEAN_REVERSION";
    BotStrategyType["BREAKOUT"] = "BREAKOUT";
    BotStrategyType["MOMENTUM"] = "MOMENTUM";
    BotStrategyType["AUTO"] = "AUTO";
})(BotStrategyType || (exports.BotStrategyType = BotStrategyType = {}));
var BotStrategySignal;
(function (BotStrategySignal) {
    BotStrategySignal["STRONG_BUY"] = "STRONG_BUY";
    BotStrategySignal["BUY"] = "BUY";
    BotStrategySignal["NEUTRAL"] = "NEUTRAL";
    BotStrategySignal["SELL"] = "SELL";
    BotStrategySignal["STRONG_SELL"] = "STRONG_SELL";
})(BotStrategySignal || (exports.BotStrategySignal = BotStrategySignal = {}));
var BotMarketRegime;
(function (BotMarketRegime) {
    BotMarketRegime["TRENDING_UP"] = "TRENDING_UP";
    BotMarketRegime["TRENDING_DOWN"] = "TRENDING_DOWN";
    BotMarketRegime["RANGING"] = "RANGING";
    BotMarketRegime["VOLATILE"] = "VOLATILE";
    BotMarketRegime["TRANSITIONAL"] = "TRANSITIONAL";
})(BotMarketRegime || (exports.BotMarketRegime = BotMarketRegime = {}));
//# sourceMappingURL=bot-strategy.types.js.map