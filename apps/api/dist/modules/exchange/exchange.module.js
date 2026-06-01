"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const exchange_controller_1 = require("./exchange.controller");
const exchange_service_1 = require("./exchange.service");
const exchange_gateway_1 = require("./gateway/exchange.gateway");
const twelve_data_adapter_1 = require("./adapters/twelve-data.adapter");
const binance_adapter_1 = require("./adapters/binance.adapter");
const free_fallback_adapter_1 = require("./adapters/free-fallback.adapter");
let ExchangeModule = class ExchangeModule {
};
exports.ExchangeModule = ExchangeModule;
exports.ExchangeModule = ExchangeModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        controllers: [exchange_controller_1.ExchangeController],
        providers: [
            exchange_service_1.ExchangeService,
            exchange_gateway_1.ExchangeGateway,
            twelve_data_adapter_1.TwelveDataAdapter,
            binance_adapter_1.BinanceAdapter,
            free_fallback_adapter_1.FreeFallbackAdapter,
            {
                provide: 'EXCHANGE_ADAPTERS',
                useFactory: (twelveData, binance, freeFallback) => {
                    const adapters = {};
                    adapters[twelveData.name] = twelveData;
                    adapters[binance.name] = binance;
                    adapters[freeFallback.name] = freeFallback;
                    return adapters;
                },
                inject: [twelve_data_adapter_1.TwelveDataAdapter, binance_adapter_1.BinanceAdapter, free_fallback_adapter_1.FreeFallbackAdapter],
            },
        ],
        exports: [exchange_service_1.ExchangeService, exchange_gateway_1.ExchangeGateway],
    })
], ExchangeModule);
//# sourceMappingURL=exchange.module.js.map