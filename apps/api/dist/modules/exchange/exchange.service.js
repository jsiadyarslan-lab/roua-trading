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
var ExchangeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let ExchangeService = ExchangeService_1 = class ExchangeService {
    constructor(adapters, configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(ExchangeService_1.name);
        this.quoteCache = new Map();
        this.QUOTE_CACHE_TTL_MS = 5_000;
        this.QUOTE_CACHE_MAX_SIZE = 200;
        this.adapters = adapters;
        this.disableTwelveData = this.configService.get('DISABLE_TWELVE_DATA', 'false') === 'true';
        const twelveKey = this.configService.get('TWELVE_DATA_API_KEY', '');
        const noKey = !twelveKey || !twelveKey.trim();
        if (this.disableTwelveData || noKey) {
            this.logger.warn(`⚠️ TwelveData is DISABLED (${this.disableTwelveData ? 'via DISABLE_TWELVE_DATA' : 'no API key'}). Using FreeFallback for all non-crypto symbols.`);
        }
        this.logger.log(`📊 Exchange Service initialized with adapters: ${Object.keys(adapters).join(', ')}`);
    }
    async getQuote(symbol, source) {
        const cacheKey = `${symbol}:${source || 'auto'}`;
        const cached = this.quoteCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.QUOTE_CACHE_TTL_MS) {
            return cached.data;
        }
        const adapterOrder = [];
        const primaryAdapter = this._selectAdapter(symbol, source);
        adapterOrder.push(primaryAdapter);
        if (primaryAdapter.name !== 'FreeFallback' && this.adapters['FreeFallback']) {
            adapterOrder.push(this.adapters['FreeFallback']);
        }
        let lastError;
        for (const adapter of adapterOrder) {
            try {
                const quote = await adapter.fetchQuote(symbol);
                const sanity = ExchangeService_1.PRICE_SANITY[symbol] || ExchangeService_1.PRICE_SANITY[symbol.replace('USD', 'USDT')];
                if (sanity && (quote.price < sanity.min || quote.price > sanity.max)) {
                    this.logger.warn(`⚠️ Price sanity check FAILED for ${symbol}: ${quote.price} outside [${sanity.min}, ${sanity.max}] — rejecting and trying next adapter`);
                    continue;
                }
                this._setQuoteCache(cacheKey, quote);
                return quote;
            }
            catch (error) {
                lastError = error;
                this.logger.warn(`⚠️ ${adapter.name} failed for ${symbol}: ${error.message}. Trying next...`);
            }
        }
        throw lastError || new Error(`All adapters failed sanity checks for ${symbol}`);
    }
    _setQuoteCache(key, data) {
        if (this.quoteCache.size >= this.QUOTE_CACHE_MAX_SIZE) {
            const oldestKey = this.quoteCache.keys().next().value;
            if (oldestKey)
                this.quoteCache.delete(oldestKey);
        }
        this.quoteCache.set(key, { data, timestamp: Date.now() });
    }
    async getHistoricalData(symbol, interval = '1day', start, end, source) {
        const adapter = this._selectAdapter(symbol, source);
        const endDate = end || new Date();
        const startDate = start || new Date(endDate.getTime() - 60 * 24 * 60 * 60 * 1000);
        try {
            const candles = await adapter.fetchHistoricalData(symbol, interval, startDate, endDate);
            if (candles.length > 0)
                return candles;
        }
        catch (error) {
            this.logger.warn(`⚠️ ${adapter.name} history failed for ${symbol}: ${error.message}`);
        }
        if (adapter.name !== 'FreeFallback' && this.adapters['FreeFallback']) {
            try {
                const fallbackCandles = await this.adapters['FreeFallback'].fetchHistoricalData(symbol, interval, startDate, endDate);
                if (fallbackCandles.length > 0)
                    return fallbackCandles;
            }
            catch (fallbackError) {
                this.logger.warn(`FreeFallback history also failed for ${symbol}: ${fallbackError.message}`);
            }
        }
        return [];
    }
    getAdapters() {
        return Object.keys(this.adapters);
    }
    _selectAdapter(symbol, source) {
        if (source && this.adapters[source]) {
            return this.adapters[source];
        }
        if (this._isCryptoSymbol(symbol)) {
            if (this.adapters['Binance']) {
                return this.adapters['Binance'];
            }
        }
        const twelveKey = this.configService.get('TWELVE_DATA_API_KEY', '');
        const noKey = !twelveKey || !twelveKey.trim();
        if (this.disableTwelveData || noKey) {
            if (this.adapters['FreeFallback']) {
                return this.adapters['FreeFallback'];
            }
        }
        if (this.adapters['TwelveData']) {
            return this.adapters['TwelveData'];
        }
        if (this.adapters['FreeFallback']) {
            return this.adapters['FreeFallback'];
        }
        const firstKey = Object.keys(this.adapters)[0];
        if (firstKey) {
            return this.adapters[firstKey];
        }
        throw new Error('No exchange adapters available');
    }
    _isCryptoSymbol(symbol) {
        if (!symbol.includes('/')) {
            const base = symbol.replace(/USDT?$/i, '');
            return ExchangeService_1.CRYPTO_BASES.has(base.toUpperCase());
        }
        const [base, quote] = symbol.split('/');
        const fiatCurrencies = new Set([
            'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK',
            'DKK', 'ZAR', 'HKD', 'SGD', 'MXN', 'PLN', 'CZK', 'HUF', 'TRY', 'KRW',
        ]);
        const commodityBases = new Set(['XAU', 'XAG', 'XPT', 'XPD', 'CL', 'NG', 'HG']);
        if (commodityBases.has(base))
            return false;
        if (fiatCurrencies.has(base))
            return false;
        const isCryptoBase = ExchangeService_1.CRYPTO_BASE_CURRENCIES.has(base);
        const isCryptoQuote = ExchangeService_1.CRYPTO_QUOTE_CURRENCIES.has(quote);
        return isCryptoBase && isCryptoQuote;
    }
};
exports.ExchangeService = ExchangeService;
ExchangeService.PRICE_SANITY = {
    'BTC/USDT': { min: 20000, max: 200000 },
    'BTC/USD': { min: 20000, max: 200000 },
    'ETH/USDT': { min: 1000, max: 20000 },
    'ETH/USD': { min: 1000, max: 20000 },
    'BNB/USDT': { min: 100, max: 5000 },
    'BNB/USD': { min: 100, max: 5000 },
    'SOL/USDT': { min: 10, max: 1000 },
    'SOL/USD': { min: 10, max: 1000 },
    'XRP/USDT': { min: 0.1, max: 100 },
    'XRP/USD': { min: 0.1, max: 100 },
    'ADA/USDT': { min: 0.05, max: 50 },
    'ADA/USD': { min: 0.05, max: 50 },
    'DOGE/USDT': { min: 0.01, max: 10 },
    'DOGE/USD': { min: 0.01, max: 10 },
    'XAU/USD': { min: 1000, max: 5000 },
};
ExchangeService.CRYPTO_BASES = new Set([
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'LTC', 'DOT', 'AVAX',
    'MATIC', 'SHIB', 'LINK', 'UNI', 'ATOM',
]);
ExchangeService.CRYPTO_QUOTE_CURRENCIES = new Set([
    'USDT', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB', 'DAI', 'TUSD', 'FDUSD', 'USDC',
]);
ExchangeService.CRYPTO_BASE_CURRENCIES = new Set([
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'LTC',
    'AVAX', 'LINK', 'UNI', 'ATOM', 'ETC', 'XLM', 'BCH', 'ALGO', 'VET', 'ICP',
    'FIL', 'TRX', 'NEAR', 'FTM', 'AAVE', 'GRT', 'EOS', 'AXS', 'SAND', 'MANA',
    'SHIB', 'APE', 'CRV', 'MKR', 'COMP', 'SNX', 'DYDX', 'OP', 'ARB', 'PEPE',
    'WIF', 'SUI', 'SEI', 'TIA', 'INJ', 'STX', 'IMX', 'RUNE', 'KAVA', '1INCH',
]);
exports.ExchangeService = ExchangeService = ExchangeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('EXCHANGE_ADAPTERS')),
    __metadata("design:paramtypes", [Object, config_1.ConfigService])
], ExchangeService);
//# sourceMappingURL=exchange.service.js.map