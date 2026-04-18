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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ExchangeController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeController = void 0;
const common_1 = require("@nestjs/common");
const exchange_service_1 = require("./exchange.service");
const auth_guard_1 = require("../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
let ExchangeController = ExchangeController_1 = class ExchangeController {
    constructor(exchangeService) {
        this.exchangeService = exchangeService;
        this.logger = new common_1.Logger(ExchangeController_1.name);
    }
    async getQuote(symbol) {
        this.logger.debug(`Quote request: ${symbol}`);
        const quote = await this.exchangeService.getQuote(symbol);
        return { success: true, data: quote };
    }
    async getHistoricalData(symbol, interval = '1day', startDate, endDate) {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const data = await this.exchangeService.getHistoricalData(symbol, interval, start, end);
        return { success: true, data };
    }
};
exports.ExchangeController = ExchangeController;
__decorate([
    (0, common_1.Get)('quote/:symbol'),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    __param(0, (0, common_1.Param)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ExchangeController.prototype, "getQuote", null);
__decorate([
    (0, common_1.Get)('history/:symbol'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Param)('symbol')),
    __param(1, (0, common_1.Query)('interval')),
    __param(2, (0, common_1.Query)('startDate')),
    __param(3, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], ExchangeController.prototype, "getHistoricalData", null);
exports.ExchangeController = ExchangeController = ExchangeController_1 = __decorate([
    (0, common_1.Controller)('exchange'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [exchange_service_1.ExchangeService])
], ExchangeController);
//# sourceMappingURL=exchange.controller.js.map