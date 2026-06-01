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
exports.PlaceOrderDto = void 0;
const class_validator_1 = require("class-validator");
const trading_types_1 = require("../../trading.types");
class PlaceOrderDto {
}
exports.PlaceOrderDto = PlaceOrderDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlaceOrderDto.prototype, "exchangeCredentialId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    (0, class_validator_1.Matches)(/^[A-Za-z0-9\/\.\-_]+$/, { message: 'رمز التداول غير صالح — أحرف وأرقام و / . - _ فقط' }),
    __metadata("design:type", String)
], PlaceOrderDto.prototype, "symbol", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(trading_types_1.OrderSide),
    __metadata("design:type", String)
], PlaceOrderDto.prototype, "side", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(trading_types_1.OrderType),
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
    (0, class_validator_1.Min)(0.00001),
    __metadata("design:type", Number)
], PlaceOrderDto.prototype, "price", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.00001),
    __metadata("design:type", Number)
], PlaceOrderDto.prototype, "stopLoss", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.00001),
    __metadata("design:type", Number)
], PlaceOrderDto.prototype, "takeProfit", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], PlaceOrderDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], PlaceOrderDto.prototype, "clientOrderId", void 0);
//# sourceMappingURL=place-order.dto.js.map