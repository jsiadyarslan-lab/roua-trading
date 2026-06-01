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
exports.SwarmStartRequest = exports.NeuralPredictRequest = exports.NeuralTrainRequest = exports.BacktestRequest = exports.PredictionHorizon = exports.SwarmAgentStatus = exports.BacktestStrategy = exports.NeuralArchitecture = void 0;
var NeuralArchitecture;
(function (NeuralArchitecture) {
    NeuralArchitecture["LSTM"] = "LSTM";
    NeuralArchitecture["GRU"] = "GRU";
    NeuralArchitecture["TRANSFORMER"] = "TRANSFORMER";
    NeuralArchitecture["ENSEMBLE"] = "ENSEMBLE";
})(NeuralArchitecture || (exports.NeuralArchitecture = NeuralArchitecture = {}));
var BacktestStrategy;
(function (BacktestStrategy) {
    BacktestStrategy["MOMENTUM"] = "MOMENTUM";
    BacktestStrategy["MEAN_REVERSION"] = "MEAN_REVERSION";
    BacktestStrategy["BREAKOUT"] = "BREAKOUT";
    BacktestStrategy["SCALPING"] = "SCALPING";
    BacktestStrategy["SWING"] = "SWING";
    BacktestStrategy["AI_COUNCIL"] = "AI_COUNCIL";
})(BacktestStrategy || (exports.BacktestStrategy = BacktestStrategy = {}));
var SwarmAgentStatus;
(function (SwarmAgentStatus) {
    SwarmAgentStatus["IDLE"] = "IDLE";
    SwarmAgentStatus["RUNNING"] = "RUNNING";
    SwarmAgentStatus["COMPLETED"] = "COMPLETED";
    SwarmAgentStatus["FAILED"] = "FAILED";
})(SwarmAgentStatus || (exports.SwarmAgentStatus = SwarmAgentStatus = {}));
var PredictionHorizon;
(function (PredictionHorizon) {
    PredictionHorizon["SHORT"] = "1h";
    PredictionHorizon["MEDIUM"] = "4h";
    PredictionHorizon["LONG"] = "1d";
    PredictionHorizon["EXTENDED"] = "7d";
})(PredictionHorizon || (exports.PredictionHorizon = PredictionHorizon = {}));
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class BacktestRequest {
}
exports.BacktestRequest = BacktestRequest;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BacktestRequest.prototype, "symbol", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(BacktestStrategy),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BacktestRequest.prototype, "strategy", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BacktestRequest.prototype, "periodStart", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BacktestRequest.prototype, "periodEnd", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], BacktestRequest.prototype, "initialCapital", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.01),
    (0, class_validator_1.Max)(1),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], BacktestRequest.prototype, "positionSize", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.001),
    (0, class_validator_1.Max)(0.5),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], BacktestRequest.prototype, "stopLoss", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.001),
    (0, class_validator_1.Max)(1),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], BacktestRequest.prototype, "takeProfit", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BacktestRequest.prototype, "language", void 0);
class NeuralTrainRequest {
}
exports.NeuralTrainRequest = NeuralTrainRequest;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], NeuralTrainRequest.prototype, "symbol", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(NeuralArchitecture),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], NeuralTrainRequest.prototype, "architecture", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(PredictionHorizon),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], NeuralTrainRequest.prototype, "horizon", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(365),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], NeuralTrainRequest.prototype, "lookbackDays", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], NeuralTrainRequest.prototype, "epochs", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], NeuralTrainRequest.prototype, "language", void 0);
class NeuralPredictRequest {
}
exports.NeuralPredictRequest = NeuralPredictRequest;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], NeuralPredictRequest.prototype, "symbol", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], NeuralPredictRequest.prototype, "steps", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(PredictionHorizon),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], NeuralPredictRequest.prototype, "horizon", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], NeuralPredictRequest.prototype, "includeConfidence", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], NeuralPredictRequest.prototype, "language", void 0);
class SwarmStartRequest {
}
exports.SwarmStartRequest = SwarmStartRequest;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(10),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], SwarmStartRequest.prototype, "agents", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], SwarmStartRequest.prototype, "symbols", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(BacktestStrategy),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SwarmStartRequest.prototype, "strategy", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], SwarmStartRequest.prototype, "riskTolerance", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SwarmStartRequest.prototype, "language", void 0);
//# sourceMappingURL=neural.types.js.map