"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionMarketModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../../common/prisma/prisma.module");
const redis_module_1 = require("../../common/redis/redis.module");
const ai_module_1 = require("../ai/ai.module");
const prediction_market_controller_1 = require("./prediction-market.controller");
const prediction_market_service_1 = require("./prediction-market.service");
const polymarket_adapter_1 = require("./adapters/polymarket.adapter");
let PredictionMarketModule = class PredictionMarketModule {
};
exports.PredictionMarketModule = PredictionMarketModule;
exports.PredictionMarketModule = PredictionMarketModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule,
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            ai_module_1.AiModule,
        ],
        controllers: [prediction_market_controller_1.PredictionMarketController],
        providers: [
            polymarket_adapter_1.PolymarketAdapter,
            prediction_market_service_1.PredictionMarketService,
        ],
        exports: [prediction_market_service_1.PredictionMarketService],
    })
], PredictionMarketModule);
//# sourceMappingURL=prediction-market.module.js.map