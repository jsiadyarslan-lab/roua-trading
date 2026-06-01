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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var FinnhubAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinnhubAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../../common/redis/redis.service");
const axios_1 = __importDefault(require("axios"));
const ws_1 = __importDefault(require("ws"));
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
let FinnhubAdapter = FinnhubAdapter_1 = class FinnhubAdapter {
    constructor(configService, redisService) {
        this.configService = configService;
        this.redisService = redisService;
        this.name = 'Finnhub';
        this.logger = new common_1.Logger(FinnhubAdapter_1.name);
        this.baseUrl = 'https://finnhub.io/api/v1';
        this.QUOTE_CACHE_TTL = 10_000;
        this.HISTORY_CACHE_TTL = 300_000;
        this.RATE_LIMIT_WINDOW = 60_000;
        this.RATE_LIMIT_MAX = 55;
        this.authFailureCount = 0;
        this.authDisabledUntil = 0;
        this.wsConnection = null;
        this.priceSubject = new rxjs_1.Subject();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.baseReconnectDelay = 5000;
        this.reconnectTimer = null;
        this.apiKey = this.configService.get('FINNHUB_API_KEY', '')?.trim() || '';
        if (!this.apiKey) {
            this.logger.warn('⚠️ FINNHUB_API_KEY is not set — Finnhub data will not be available');
        }
        else {
            this._initWebSocket();
        }
    }
    async fetchQuote(symbol) {
        const cacheKey = `finnhub:quote:${symbol}`;
        try {
            return await this.redisService.cacheOrGet(cacheKey, () => this._fetchQuoteFromApi(symbol), this.QUOTE_CACHE_TTL);
        }
        catch (error) {
            this.logger.error(`Failed to fetch Finnhub quote for ${symbol}: ${error.message}`);
            throw new common_1.HttpException(`فشل في جلب بيانات ${symbol} من Finnhub: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async fetchHistoricalData(symbol, interval, start, end) {
        const cacheKey = `finnhub:history:${symbol}:${interval}:${start.toISOString().split('T')[0]}:${end.toISOString().split('T')[0]}`;
        try {
            return await this.redisService.cacheOrGet(cacheKey, () => this._fetchCandlesFromApi(symbol, interval, start, end), this.HISTORY_CACHE_TTL);
        }
        catch (error) {
            this.logger.error(`Failed to fetch Finnhub candles for ${symbol}: ${error.message}`);
            throw new common_1.HttpException(`فشل في جلب البيانات التاريخية لـ ${symbol} من Finnhub: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    getPriceStream(symbol) {
        const finnhubSymbol = this._convertSymbol(symbol);
        return this.priceSubject.asObservable().pipe((0, operators_1.filter)((quote) => quote.symbol === finnhubSymbol));
    }
    async getCompanyNews(symbol, days = 7) {
        if (!this.apiKey)
            return [];
        try {
            await this._checkRateLimit();
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
            const response = await axios_1.default.get(`${this.baseUrl}/company-news`, {
                params: {
                    symbol,
                    from: startDate.toISOString().split('T')[0],
                    to: endDate.toISOString().split('T')[0],
                    token: this.apiKey,
                },
                timeout: 10000,
            });
            return Array.isArray(response.data) ? response.data : [];
        }
        catch (error) {
            this.logger.warn(`Failed to fetch news for ${symbol}: ${error.message}`);
            return [];
        }
    }
    async getPeers(symbol) {
        if (!this.apiKey)
            return [];
        try {
            await this._checkRateLimit();
            const response = await axios_1.default.get(`${this.baseUrl}/stock/peers`, {
                params: { symbol, token: this.apiKey },
                timeout: 10000,
            });
            return Array.isArray(response.data) ? response.data : [];
        }
        catch (error) {
            this.logger.warn(`Failed to fetch peers for ${symbol}: ${error.message}`);
            return [];
        }
    }
    isAvailable() {
        if (!this.apiKey)
            return false;
        if (Date.now() < this.authDisabledUntil)
            return false;
        return true;
    }
    async _fetchQuoteFromApi(symbol) {
        if (Date.now() < this.authDisabledUntil) {
            throw new common_1.HttpException('Finnhub auth circuit breaker active (invalid API key)', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        await this._checkRateLimit();
        this.logger.debug(`📡 Fetching Finnhub quote: ${symbol}`);
        const finnhubSymbol = this._convertSymbol(symbol);
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/quote`, {
                params: { symbol: finnhubSymbol, token: this.apiKey },
                timeout: 10000,
            });
            this.authFailureCount = 0;
            const data = response.data;
            if (!data || data.c === 0 && data.h === 0 && data.l === 0) {
                throw new Error(`No data available for ${symbol}`);
            }
            return {
                symbol,
                name: symbol,
                exchange: 'Finnhub',
                currency: 'USD',
                price: data.c ?? 0,
                change: data.d ?? 0,
                changePercent: data.dp ?? 0,
                open: data.o ?? 0,
                high: data.h ?? 0,
                low: data.l ?? 0,
                close: data.c ?? 0,
                volume: 0,
                marketCap: null,
                fiftyTwoWeekHigh: null,
                fiftyTwoWeekLow: null,
                timestamp: new Date(),
                source: this.name,
            };
        }
        catch (error) {
            if (error.response?.status === 401) {
                this.authFailureCount++;
                if (this.authFailureCount >= 3) {
                    this.authDisabledUntil = Date.now() + 60 * 60 * 1000;
                    this.logger.error(`🚫 Finnhub API key invalid (401) — circuit breaker activated for 1 hour. ` +
                        `Check your FINNHUB_API_KEY in Railway env vars.`);
                }
            }
            throw error;
        }
    }
    async _fetchCandlesFromApi(symbol, interval, start, end) {
        if (Date.now() < this.authDisabledUntil) {
            throw new common_1.HttpException('Finnhub auth circuit breaker active', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        await this._checkRateLimit();
        this.logger.debug(`📡 Fetching Finnhub candles: ${symbol} (${interval})`);
        const finnhubSymbol = this._convertSymbol(symbol);
        const resolution = this._mapResolution(interval);
        const response = await axios_1.default.get(`${this.baseUrl}/stock/candle`, {
            params: {
                symbol: finnhubSymbol,
                resolution,
                from: Math.floor(start.getTime() / 1000),
                to: Math.floor(end.getTime() / 1000),
                token: this.apiKey,
            },
            timeout: 15000,
        });
        const data = response.data;
        if (data.s !== 'ok' || !data.t || !data.c) {
            return [];
        }
        const candles = [];
        for (let i = 0; i < data.t.length; i++) {
            candles.push({
                symbol,
                timestamp: new Date(data.t[i] * 1000),
                open: data.o[i],
                high: data.h[i],
                low: data.l[i],
                close: data.c[i],
                volume: data.v?.[i] ?? 0,
                source: this.name,
            });
        }
        return candles;
    }
    _initWebSocket() {
        try {
            this.wsConnection = new ws_1.default(`wss://ws.finnhub.io?token=${this.apiKey}`);
            this.wsConnection.on('open', () => {
                this.reconnectAttempts = 0;
                this.logger.log('🔌 Finnhub WebSocket connected');
            });
            this.wsConnection.on('message', (data) => {
                try {
                    const parsed = JSON.parse(data.toString());
                    if (parsed.type === 'trade' && parsed.data) {
                        for (const trade of parsed.data) {
                            this.priceSubject.next({
                                symbol: trade.s,
                                currentPrice: trade.p,
                                change: 0,
                                changePercent: 0,
                                high: trade.p,
                                low: trade.p,
                                open: trade.p,
                                previousClose: trade.p,
                                timestamp: trade.t,
                            });
                        }
                    }
                }
                catch (error) {
                }
            });
            this.wsConnection.on('error', (error) => {
                this.logger.warn(`Finnhub WebSocket error: ${error.message}`);
            });
            this.wsConnection.on('close', () => {
                this.logger.warn('🔌 Finnhub WebSocket closed');
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    const delay = Math.min(this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts), 60000);
                    this.reconnectAttempts++;
                    this.logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    this.reconnectTimer = setTimeout(() => this._initWebSocket(), delay);
                }
                else {
                    this.logger.error('Max Finnhub WebSocket reconnect attempts reached');
                }
            });
        }
        catch (error) {
            this.logger.warn(`Finnhub WebSocket unavailable: ${error.message}`);
        }
    }
    onModuleDestroy() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.wsConnection) {
            try {
                this.wsConnection.close();
            }
            catch {
            }
            this.wsConnection = null;
        }
        this.priceSubject.complete();
    }
    async _checkRateLimit() {
        const key = 'ratelimit:finnhub';
        const result = await this.redisService.checkRateLimit(key, this.RATE_LIMIT_MAX, this.RATE_LIMIT_WINDOW);
        if (!result.allowed) {
            throw new common_1.HttpException(`تم تجاوز حد الطلبات لـ Finnhub. يرجى المحاولة بعد ${Math.ceil((result.resetIn || 60000) / 1000)} ثوانٍ`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    _convertSymbol(symbol) {
        const CRYPTO_BASES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI', 'LTC', 'SHIB', 'ATOM'];
        if (symbol.includes('/')) {
            const base = symbol.split('/')[0].toUpperCase();
            if (CRYPTO_BASES.includes(base)) {
                const parts = symbol.split('/');
                return `BINANCE:${parts[0]}${parts[1]}`;
            }
        }
        if (symbol.includes('/')) {
            const parts = symbol.split('/');
            return `OANDA:${parts[0]}_${parts[1]}`;
        }
        return symbol;
    }
    _mapResolution(interval) {
        const mapping = {
            '1min': '1',
            '5min': '5',
            '15min': '15',
            '30min': '30',
            '1h': '60',
            '2h': '60',
            '4h': '60',
            '1day': 'D',
            '1week': 'W',
            '1month': 'M',
        };
        return mapping[interval] || 'D';
    }
};
exports.FinnhubAdapter = FinnhubAdapter;
exports.FinnhubAdapter = FinnhubAdapter = FinnhubAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        redis_service_1.RedisService])
], FinnhubAdapter);
//# sourceMappingURL=finnhub.adapter.js.map