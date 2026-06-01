"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateAgentSettingsDto = exports.UpdateRiskParamsDto = exports.ChangeStrategyDto = exports.StartAgentDto = exports.StrategyParamsDto = exports.StrategySignal = exports.MarketRegime = exports.StrategyType = exports.AgentStatus = exports.OrderType = exports.OrderSide = void 0;
const trading_types_1 = require("../../../modules/trading/trading.types");
Object.defineProperty(exports, "OrderSide", { enumerable: true, get: function () { return trading_types_1.OrderSide; } });
Object.defineProperty(exports, "OrderType", { enumerable: true, get: function () { return trading_types_1.OrderType; } });
var AgentStatus;
(function (AgentStatus) {
    AgentStatus["IDLE"] = "IDLE";
    AgentStatus["RUNNING"] = "RUNNING";
    AgentStatus["PAUSED"] = "PAUSED";
    AgentStatus["STOPPED"] = "STOPPED";
    AgentStatus["EMERGENCY_STOP"] = "EMERGENCY_STOP";
    AgentStatus["DAILY_LIMIT_REACHED"] = "DAILY_LIMIT_REACHED";
})(AgentStatus || (exports.AgentStatus = AgentStatus = {}));
var StrategyType;
(function (StrategyType) {
    StrategyType["AUTO"] = "AUTO";
    StrategyType["SCALPING"] = "SCALPING";
    StrategyType["SWING"] = "SWING";
    StrategyType["GRID"] = "GRID";
    StrategyType["MEAN_REVERSION"] = "MEAN_REVERSION";
    StrategyType["MOMENTUM_BREAKOUT"] = "MOMENTUM_BREAKOUT";
    StrategyType["DCA"] = "DCA";
    StrategyType["VWAP_RSI"] = "VWAP_RSI";
})(StrategyType || (exports.StrategyType = StrategyType = {}));
var MarketRegime;
(function (MarketRegime) {
    MarketRegime["TRENDING_UP"] = "TRENDING_UP";
    MarketRegime["TRENDING_DOWN"] = "TRENDING_DOWN";
    MarketRegime["RANGING"] = "RANGING";
    MarketRegime["VOLATILE"] = "VOLATILE";
    MarketRegime["TRANSITIONAL"] = "TRANSITIONAL";
})(MarketRegime || (exports.MarketRegime = MarketRegime = {}));
var StrategySignal;
(function (StrategySignal) {
    StrategySignal["STRONG_BUY"] = "STRONG_BUY";
    StrategySignal["BUY"] = "BUY";
    StrategySignal["NEUTRAL"] = "NEUTRAL";
    StrategySignal["SELL"] = "SELL";
    StrategySignal["STRONG_SELL"] = "STRONG_SELL";
})(StrategySignal || (exports.StrategySignal = StrategySignal = {}));
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class StrategyParamsDto {
}
exports.StrategyParamsDto = StrategyParamsDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], StrategyParamsDto.prototype, "scalpingTimeframe", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], StrategyParamsDto.prototype, "scalpingTakeProfitPips", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], StrategyParamsDto.prototype, "scalpingStopLossPips", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], StrategyParamsDto.prototype, "scalpingMaxSpread", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], StrategyParamsDto.prototype, "swingTimeframe", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], StrategyParamsDto.prototype, "swingHoldingPeriodHours", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], StrategyParamsDto.prototype, "swingTrendLookback", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], StrategyParamsDto.prototype, "gridLevels", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], StrategyParamsDto.prototype, "gridSpacingPercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], StrategyParamsDto.prototype, "gridQuantityPerLevel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], StrategyParamsDto.prototype, "gridUpperBound", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], StrategyParamsDto.prototype, "gridLowerBound", void 0);
class StartAgentDto {
}
exports.StartAgentDto = StartAgentDto;
__decorate([
    (0, class_validator_1.IsIn)(['AUTO', 'SWING', 'GRID', 'MEAN_REVERSION', 'MOMENTUM_BREAKOUT', 'DCA', 'VWAP_RSI']),
    __metadata("design:type", String)
], StartAgentDto.prototype, "strategy", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], StartAgentDto.prototype, "credentialId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], StartAgentDto.prototype, "symbols", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], StartAgentDto.prototype, "maxPositionSizePercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], StartAgentDto.prototype, "maxDailyLossPercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], StartAgentDto.prototype, "maxOpenPositions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(10),
    __metadata("design:type", Number)
], StartAgentDto.prototype, "riskPerTradePercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StrategyParamsDto),
    __metadata("design:type", Object)
], StartAgentDto.prototype, "strategyParams", void 0);
class ChangeStrategyDto {
}
exports.ChangeStrategyDto = ChangeStrategyDto;
__decorate([
    (0, class_validator_1.IsIn)(['AUTO', 'SWING', 'GRID', 'MEAN_REVERSION', 'MOMENTUM_BREAKOUT', 'DCA', 'VWAP_RSI']),
    __metadata("design:type", String)
], ChangeStrategyDto.prototype, "strategy", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StrategyParamsDto),
    __metadata("design:type", Object)
], ChangeStrategyDto.prototype, "strategyParams", void 0);
class UpdateRiskParamsDto {
}
exports.UpdateRiskParamsDto = UpdateRiskParamsDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], UpdateRiskParamsDto.prototype, "maxPositionSizePercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], UpdateRiskParamsDto.prototype, "maxDailyLossPercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], UpdateRiskParamsDto.prototype, "maxOpenPositions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(10),
    __metadata("design:type", Number)
], UpdateRiskParamsDto.prototype, "riskPerTradePercent", void 0);
class UpdateAgentSettingsDto {
}
exports.UpdateAgentSettingsDto = UpdateAgentSettingsDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UpdateAgentSettingsDto.prototype, "autoTradingEnabled", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(100),
    (0, class_validator_1.Max)(1000000),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "paperBalance", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "paperForexLeverage", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(500),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "paperGoldLeverage", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(200),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "paperCryptoLeverage", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "maxPositionSizePercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "maxDailyLossPercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "maxOpenPositions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(10),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "riskPerTradePercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['AUTO', 'SWING', 'GRID', 'MEAN_REVERSION', 'MOMENTUM_BREAKOUT', 'DCA', 'VWAP_RSI']),
    __metadata("design:type", String)
], UpdateAgentSettingsDto.prototype, "defaultStrategy", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateAgentSettingsDto.prototype, "scalpingTimeframe", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "scalpingTakeProfitPips", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "scalpingStopLossPips", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "scalpingMaxSpread", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateAgentSettingsDto.prototype, "swingTimeframe", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(720),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "swingHoldingPeriodHours", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(5),
    (0, class_validator_1.Max)(200),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "swingTrendLookback", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(2),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "gridLevels", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(10),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "gridSpacingPercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateAgentSettingsDto.prototype, "gridQuantityPerLevel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateAgentSettingsDto.prototype, "defaultSymbols", void 0);
//# sourceMappingURL=agent.types.js.map