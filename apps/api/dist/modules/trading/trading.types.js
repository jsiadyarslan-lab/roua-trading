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
exports.ClosePositionDto = exports.PlaceOrderDto = exports.TradeType = exports.PositionStatus = exports.OrderEventType = exports.OrderStatus = exports.OrderType = exports.OrderSide = void 0;
const class_validator_1 = require("class-validator");
var OrderSide;
(function (OrderSide) {
    OrderSide["BUY"] = "BUY";
    OrderSide["SELL"] = "SELL";
})(OrderSide || (exports.OrderSide = OrderSide = {}));
var OrderType;
(function (OrderType) {
    OrderType["MARKET"] = "MARKET";
    OrderType["LIMIT"] = "LIMIT";
})(OrderType || (exports.OrderType = OrderType = {}));
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["PENDING"] = "PENDING";
    OrderStatus["ACCEPTED"] = "ACCEPTED";
    OrderStatus["PARTIALLY_FILLED"] = "PARTIALLY_FILLED";
    OrderStatus["FILLED"] = "FILLED";
    OrderStatus["CANCELLED"] = "CANCELLED";
    OrderStatus["REJECTED"] = "REJECTED";
})(OrderStatus || (exports.OrderStatus = OrderStatus = {}));
var OrderEventType;
(function (OrderEventType) {
    OrderEventType["CREATED"] = "CREATED";
    OrderEventType["ACCEPTED"] = "ACCEPTED";
    OrderEventType["RISK_REJECTED"] = "RISK_REJECTED";
    OrderEventType["SENT_TO_EXCHANGE"] = "SENT_TO_EXCHANGE";
    OrderEventType["FILLED"] = "FILLED";
    OrderEventType["CANCELLED"] = "CANCELLED";
})(OrderEventType || (exports.OrderEventType = OrderEventType = {}));
var PositionStatus;
(function (PositionStatus) {
    PositionStatus["OPEN"] = "OPEN";
    PositionStatus["CLOSED"] = "CLOSED";
    PositionStatus["LIQUIDATED"] = "LIQUIDATED";
})(PositionStatus || (exports.PositionStatus = PositionStatus = {}));
var TradeType;
(function (TradeType) {
    TradeType["ENTRY"] = "ENTRY";
    TradeType["EXIT"] = "EXIT";
    TradeType["PARTIAL_EXIT"] = "PARTIAL_EXIT";
})(TradeType || (exports.TradeType = TradeType = {}));
class PlaceOrderDto {
}
exports.PlaceOrderDto = PlaceOrderDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlaceOrderDto.prototype, "credentialId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlaceOrderDto.prototype, "symbol", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(OrderSide),
    __metadata("design:type", String)
], PlaceOrderDto.prototype, "side", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(OrderType),
    __metadata("design:type", String)
], PlaceOrderDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.00001),
    __metadata("design:type", Number)
], PlaceOrderDto.prototype, "quantity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PlaceOrderDto.prototype, "price", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PlaceOrderDto.prototype, "stopLoss", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PlaceOrderDto.prototype, "takeProfit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlaceOrderDto.prototype, "signalId", void 0);
class ClosePositionDto {
}
exports.ClosePositionDto = ClosePositionDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ClosePositionDto.prototype, "positionId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.00001),
    __metadata("design:type", Number)
], ClosePositionDto.prototype, "quantity", void 0);
//# sourceMappingURL=trading.types.js.map