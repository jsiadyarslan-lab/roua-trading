"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var BinanceAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../../../common/redis/redis.service");
const ccxt = __importStar(require("ccxt"));
let BinanceAdapter = BinanceAdapter_1 = class BinanceAdapter {
    constructor(configService, redisService) {
        this.configService = configService;
        this.redisService = redisService;
        this.name = 'Binance';
        this.logger = new common_1.Logger(BinanceAdapter_1.name);
        this.QUOTE_CACHE_TTL = 3_000;
        this.HISTORY_CACHE_TTL = 60_000;
        this.RATE_LIMIT_WINDOW = 60_000;
        this.RATE_LIMIT_MAX = 100;
        this.exchange = new ccxt.binance({
            enableRateLimit: true,
            options: { defaultType: 'spot' },
        });
        this.logger.log('💱 Binance Adapter initialized via CCXT');
    }
    async fetchQuote(symbol) {
        const cacheKey = `binance:quote:${symbol}`;
        try {
            return await this.redisService.cacheOrGet(cacheKey, () => this._fetchQuoteFromExchange(symbol), this.QUOTE_CACHE_TTL);
        }
        catch (error) {
            this.logger.error(`Failed to fetch Binance quote for ${symbol}: ${error.message}`);
            throw new common_1.HttpException(`فشل في جلب بيانات ${symbol} من Binance: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async fetchHistoricalData(symbol, interval, start, end) {
        const cacheKey = `binance:history:${symbol}:${interval}:${start.toISOString().split('T')[0]}:${end.toISOString().split('T')[0]}`;
        try {
            return await this.redisService.cacheOrGet(cacheKey, () => this._fetchHistoricalFromExchange(symbol, interval, start, end), this.HISTORY_CACHE_TTL);
        }
        catch (error) {
            this.logger.error(`Failed to fetch Binance history for ${symbol}: ${error.message}`);
            throw new common_1.HttpException(`فشل في جلب البيانات التاريخية لـ ${symbol} من Binance: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async _fetchQuoteFromExchange(symbol) {
        await this._checkRateLimit();
        this.logger.debug(`💱 Fetching Binance quote: ${symbol}`);
        const normalizedSymbol = this._normalizeSymbol(symbol);
        let ticker;
        try {
            ticker = await this.exchange.fetchTicker(normalizedSymbol);
        }
        catch (error) {
            if (normalizedSymbol.endsWith('/USD') && error?.message?.includes('does not have market symbol')) {
                const usdtSymbol = normalizedSymbol.replace('/USD', '/USDT');
                this.logger.warn(`💱 ${normalizedSymbol} not found on Binance, trying ${usdtSymbol}`);
                ticker = await this.exchange.fetchTicker(usdtSymbol);
            }
            else {
                throw error;
            }
        }
        return {
            symbol,
            name: symbol.replace('/', ' → '),
            exchange: 'Binance',
            currency: symbol.split('/')[1] || 'USDT',
            price: ticker.last ?? 0,
            change: ticker.change ?? 0,
            changePercent: ticker.percentage ?? 0,
            open: ticker.open ?? 0,
            high: ticker.high ?? 0,
            low: ticker.low ?? 0,
            close: ticker.last ?? 0,
            volume: ticker.baseVolume ?? 0,
            marketCap: null,
            fiftyTwoWeekHigh: null,
            fiftyTwoWeekLow: null,
            timestamp: new Date(ticker.timestamp ?? Date.now()),
            source: this.name,
        };
    }
    async _fetchHistoricalFromExchange(symbol, interval, start, end) {
        await this._checkRateLimit();
        this.logger.debug(`💱 Fetching Binance history: ${symbol} (${interval})`);
        const timeframe = this._mapInterval(interval);
        const normalizedSymbol = this._normalizeSymbol(symbol);
        let ohlcv;
        try {
            ohlcv = await this.exchange.fetchOHLCV(normalizedSymbol, timeframe, start.getTime(), undefined, end.getTime());
        }
        catch (error) {
            if (normalizedSymbol.endsWith('/USD') && error?.message?.includes('does not have market symbol')) {
                const usdtSymbol = normalizedSymbol.replace('/USD', '/USDT');
                this.logger.warn(`💱 ${normalizedSymbol} not found on Binance history, trying ${usdtSymbol}`);
                ohlcv = await this.exchange.fetchOHLCV(usdtSymbol, timeframe, start.getTime(), undefined, end.getTime());
            }
            else {
                throw error;
            }
        }
        return ohlcv.map((candle) => ({
            symbol,
            timestamp: new Date(candle[0]),
            open: candle[1],
            high: candle[2],
            low: candle[3],
            close: candle[4],
            volume: candle[5],
            source: this.name,
        }));
    }
    async _checkRateLimit() {
        const key = 'ratelimit:binance';
        const result = await this.redisService.checkRateLimit(key, this.RATE_LIMIT_MAX, this.RATE_LIMIT_WINDOW);
        if (!result.allowed) {
            this.logger.warn(`⚠️ Rate limit exceeded for Binance. Reset in ${result.resetIn}ms`);
            throw new common_1.HttpException(`تم تجاوز حد الطلبات لـ Binance. يرجى المحاولة بعد ${Math.ceil((result.resetIn || 60000) / 1000)} ثوانٍ`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    _normalizeSymbol(symbol) {
        return symbol;
    }
    _mapInterval(interval) {
        const mapping = {
            '1min': '1m',
            '5min': '5m',
            '15min': '15m',
            '30min': '30m',
            '1h': '1h',
            '2h': '2h',
            '4h': '4h',
            '1day': '1d',
            '1week': '1w',
            '1month': '1M',
            '1m': '1m',
            '3m': '3m',
            '5m': '5m',
            '15m': '15m',
            '30m': '30m',
            '1d': '1d',
            '1w': '1w',
            '1M': '1M',
        };
        return mapping[interval] || '1d';
    }
};
exports.BinanceAdapter = BinanceAdapter;
exports.BinanceAdapter = BinanceAdapter = BinanceAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        redis_service_1.RedisService])
], BinanceAdapter);
//# sourceMappingURL=binance.adapter.js.map