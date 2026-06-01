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
var FreeFallbackAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FreeFallbackAdapter = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../../common/redis/redis.service");
const axios_1 = __importDefault(require("axios"));
let FreeFallbackAdapter = FreeFallbackAdapter_1 = class FreeFallbackAdapter {
    constructor(redisService) {
        this.redisService = redisService;
        this.name = 'FreeFallback';
        this.logger = new common_1.Logger(FreeFallbackAdapter_1.name);
        this.QUOTE_CACHE_TTL = 300_000;
        this.HISTORY_CACHE_TTL = 3_600_000;
        this.logger.log('🆓 Free Fallback Adapter initialized (no API key required)');
    }
    async fetchQuote(symbol) {
        const cacheKey = `fallback:quote:${symbol}`;
        try {
            return await this.redisService.cacheOrGet(cacheKey, () => this._fetchQuoteFromFreeSource(symbol), this.QUOTE_CACHE_TTL);
        }
        catch (error) {
            this.logger.error(`Fallback quote failed for ${symbol}: ${error.message}`);
            const lastKnownPrice = await this._getLastKnownPrice(symbol);
            if (lastKnownPrice) {
                this.logger.warn(`Returning last known price for ${symbol} from cache`);
                return lastKnownPrice;
            }
            throw error;
        }
    }
    async fetchHistoricalData(symbol, interval, start, end) {
        const cacheKey = `fallback:history:${symbol}:${interval}:${start.toISOString().split('T')[0]}:${end.toISOString().split('T')[0]}`;
        try {
            return await this.redisService.cacheOrGet(cacheKey, () => this._fetchHistoricalFromFreeSource(symbol, interval, start, end), this.HISTORY_CACHE_TTL);
        }
        catch (error) {
            this.logger.error(`Fallback history failed for ${symbol}: ${error.message}`);
            return [];
        }
    }
    async _fetchQuoteFromFreeSource(symbol) {
        const [base, quote] = symbol.includes('/') ? symbol.split('/') : [symbol, 'USD'];
        if (base === 'XAU') {
            return this._fetchGoldQuote(symbol);
        }
        if (base === 'XAG') {
            return this._fetchSilverQuote(symbol);
        }
        const cryptoBases = new Set([
            'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'LTC',
            'AVAX', 'LINK', 'UNI', 'ATOM', 'ETC', 'XLM', 'BCH', 'ALGO', 'VET', 'ICP',
            'FIL', 'TRX', 'NEAR', 'FTM', 'AAVE', 'SHIB', 'SUI', 'SEI', 'TIA', 'INJ',
            'STX', 'IMX', 'RUNE', 'PEPE', 'WIF', 'ARB', 'OP',
        ]);
        const cryptoQuotes = new Set(['USDT', 'USD', 'BUSD', 'USDC', 'DAI', 'TUSD']);
        if (cryptoBases.has(base) && cryptoQuotes.has(quote)) {
            return this._fetchCryptoQuote(symbol, base, quote);
        }
        const fiatCurrencies = new Set([
            'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK',
        ]);
        if (fiatCurrencies.has(base) && fiatCurrencies.has(quote)) {
            return this._fetchForexQuote(symbol, base, quote);
        }
        return this._fetchStockQuote(symbol);
    }
    async _fetchStockQuote(symbol) {
        try {
            const yahooSymbol = symbol.replace('/', '-');
            const response = await axios_1.default.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
                params: {
                    range: '1d',
                    interval: '1d',
                },
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
            });
            if (response.data?.chart?.result?.[0]?.meta) {
                const meta = response.data.chart.result[0].meta;
                const price = meta.regularMarketPrice ?? 0;
                const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
                if (price > 0) {
                    const change = price - prevClose;
                    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
                    const result = {
                        symbol,
                        name: meta.shortName || symbol,
                        exchange: meta.exchangeName || 'Yahoo Finance',
                        currency: meta.currency || 'USD',
                        price,
                        change,
                        changePercent,
                        open: meta.regularMarketDayOpen ?? price,
                        high: meta.regularMarketDayHigh ?? price,
                        low: meta.regularMarketDayLow ?? price,
                        close: price,
                        volume: meta.regularMarketVolume ?? 0,
                        marketCap: null,
                        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
                        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
                        timestamp: new Date(meta.regularMarketTime * 1000 || Date.now()),
                        source: 'Yahoo Finance',
                    };
                    await this._saveLastKnownPrice(symbol, result);
                    return result;
                }
            }
        }
        catch (error) {
            this.logger.warn(`Yahoo Finance failed for ${symbol}: ${error.message}`);
        }
        const lastKnown = await this._getLastKnownPrice(symbol);
        if (lastKnown) {
            this.logger.warn(`Returning cached price for stock ${symbol}`);
            return lastKnown;
        }
        throw new Error(`All free sources failed for stock (${symbol})`);
    }
    async _fetchGoldQuote(symbol) {
        try {
            const response = await axios_1.default.get('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF', {
                params: { range: '1d', interval: '1d' },
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
            });
            if (response.data?.chart?.result?.[0]?.meta) {
                const meta = response.data.chart.result[0].meta;
                const price = meta.regularMarketPrice ?? 0;
                if (price > 0) {
                    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
                    const change = price - prevClose;
                    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
                    const result = {
                        symbol,
                        name: 'Gold/US Dollar',
                        exchange: 'Yahoo Finance',
                        currency: 'USD',
                        price,
                        change,
                        changePercent,
                        open: meta.regularMarketDayOpen ?? price,
                        high: meta.regularMarketDayHigh ?? price,
                        low: meta.regularMarketDayLow ?? price,
                        close: price,
                        volume: meta.regularMarketVolume ?? 0,
                        marketCap: null,
                        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
                        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
                        timestamp: new Date(meta.regularMarketTime * 1000 || Date.now()),
                        source: 'Yahoo Finance',
                    };
                    await this._saveLastKnownPrice(symbol, result);
                    return result;
                }
            }
        }
        catch (error) {
            this.logger.warn(`Yahoo Finance gold failed: ${error.message}`);
        }
        try {
            const response = await axios_1.default.get('https://api.metals.dev/v1/latest', {
                params: {
                    api_key: 'FREE',
                    currency: 'USD',
                    unit: 'toz',
                },
                timeout: 10000,
            });
            if (response.data && response.data.metals && response.data.metals.gold) {
                const price = parseFloat(response.data.metals.gold);
                if (price > 0) {
                    const result = {
                        symbol,
                        name: 'Gold/US Dollar',
                        exchange: 'Metals.dev',
                        currency: 'USD',
                        price,
                        change: 0,
                        changePercent: 0,
                        open: price,
                        high: price,
                        low: price,
                        close: price,
                        volume: 0,
                        marketCap: null,
                        fiftyTwoWeekHigh: null,
                        fiftyTwoWeekLow: null,
                        timestamp: new Date(),
                        source: 'Metals.dev',
                    };
                    await this._saveLastKnownPrice(symbol, result);
                    return result;
                }
            }
        }
        catch (error) {
            this.logger.warn(`metals.dev failed for gold: ${error.message}`);
        }
        const lastKnown = await this._getLastKnownPrice(symbol);
        if (lastKnown) {
            this.logger.warn(`Returning cached price for gold ${symbol}`);
            return lastKnown;
        }
        throw new Error(`All free sources failed for gold (${symbol})`);
    }
    async _fetchSilverQuote(symbol) {
        try {
            const response = await axios_1.default.get('https://query1.finance.yahoo.com/v8/finance/chart/SI%3DF', {
                params: { range: '1d', interval: '1d' },
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
            });
            if (response.data?.chart?.result?.[0]?.meta) {
                const meta = response.data.chart.result[0].meta;
                const price = meta.regularMarketPrice ?? 0;
                if (price > 0) {
                    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
                    const change = price - prevClose;
                    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
                    const result = {
                        symbol,
                        name: 'Silver/US Dollar',
                        exchange: 'Yahoo Finance',
                        currency: 'USD',
                        price,
                        change,
                        changePercent,
                        open: meta.regularMarketDayOpen ?? price,
                        high: meta.regularMarketDayHigh ?? price,
                        low: meta.regularMarketDayLow ?? price,
                        close: price,
                        volume: meta.regularMarketVolume ?? 0,
                        marketCap: null,
                        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
                        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
                        timestamp: new Date(meta.regularMarketTime * 1000 || Date.now()),
                        source: 'Yahoo Finance',
                    };
                    await this._saveLastKnownPrice(symbol, result);
                    return result;
                }
            }
        }
        catch (error) {
            this.logger.warn(`Yahoo Finance silver failed: ${error.message}`);
        }
        try {
            const response = await axios_1.default.get('https://api.metals.dev/v1/latest', {
                params: {
                    api_key: 'FREE',
                    currency: 'USD',
                    unit: 'toz',
                },
                timeout: 10000,
            });
            if (response.data && response.data.metals && response.data.metals.silver) {
                const price = parseFloat(response.data.metals.silver);
                if (price > 0) {
                    const result = {
                        symbol,
                        name: 'Silver/US Dollar',
                        exchange: 'Metals.dev',
                        currency: 'USD',
                        price,
                        change: 0,
                        changePercent: 0,
                        open: price,
                        high: price,
                        low: price,
                        close: price,
                        volume: 0,
                        marketCap: null,
                        fiftyTwoWeekHigh: null,
                        fiftyTwoWeekLow: null,
                        timestamp: new Date(),
                        source: 'Metals.dev',
                    };
                    await this._saveLastKnownPrice(symbol, result);
                    return result;
                }
            }
        }
        catch (error) {
            this.logger.warn(`metals.dev failed for silver: ${error.message}`);
        }
        throw new Error(`All free sources failed for silver (${symbol})`);
    }
    async _fetchForexQuote(symbol, base, quote) {
        try {
            const response = await axios_1.default.get(`https://open.er-api.com/v6/latest/${base}`, {
                timeout: 10000,
            });
            if (response.data && response.data.result === 'success' && response.data.rates) {
                const price = parseFloat(response.data.rates[quote]);
                if (price > 0) {
                    const result = {
                        symbol,
                        name: `${base}/${quote}`,
                        exchange: 'ExchangeRate-API',
                        currency: quote,
                        price,
                        change: 0,
                        changePercent: 0,
                        open: price,
                        high: price,
                        low: price,
                        close: price,
                        volume: 0,
                        marketCap: null,
                        fiftyTwoWeekHigh: null,
                        fiftyTwoWeekLow: null,
                        timestamp: new Date(response.data.time_last_update_unix * 1000 || Date.now()),
                        source: 'ExchangeRate-API',
                    };
                    await this._saveLastKnownPrice(symbol, result);
                    return result;
                }
            }
        }
        catch (error) {
            this.logger.warn(`ExchangeRate-API failed for ${symbol}: ${error.message}`);
        }
        try {
            const response = await axios_1.default.get(`https://api.frankfurter.dev/v1/latest`, {
                params: {
                    from: base,
                    to: quote,
                },
                timeout: 10000,
            });
            if (response.data && response.data.rates && response.data.rates[quote]) {
                const price = parseFloat(response.data.rates[quote]);
                if (price > 0) {
                    const result = {
                        symbol,
                        name: `${base}/${quote}`,
                        exchange: 'ECB/Frankfurter',
                        currency: quote,
                        price,
                        change: 0,
                        changePercent: 0,
                        open: price,
                        high: price,
                        low: price,
                        close: price,
                        volume: 0,
                        marketCap: null,
                        fiftyTwoWeekHigh: null,
                        fiftyTwoWeekLow: null,
                        timestamp: new Date(),
                        source: 'ECB/Frankfurter',
                    };
                    await this._saveLastKnownPrice(symbol, result);
                    return result;
                }
            }
        }
        catch (error) {
            this.logger.warn(`Frankfurter forex failed for ${symbol}: ${error.message}`);
        }
        throw new Error(`Free forex source failed for ${symbol}`);
    }
    async _fetchHistoricalFromFreeSource(symbol, interval, start, end) {
        const [base, quote] = symbol.includes('/') ? symbol.split('/') : [symbol, 'USD'];
        const cryptoBases = new Set([
            'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'LTC',
            'AVAX', 'LINK', 'UNI', 'ATOM', 'ETC', 'XLM', 'BCH', 'ALGO', 'VET', 'ICP',
            'FIL', 'TRX', 'NEAR', 'FTM', 'AAVE', 'SHIB', 'SUI', 'SEI', 'TIA', 'INJ',
            'STX', 'IMX', 'RUNE', 'PEPE', 'WIF', 'ARB', 'OP',
        ]);
        const cryptoQuotes = new Set(['USDT', 'USD', 'BUSD', 'USDC', 'DAI', 'TUSD']);
        if (cryptoBases.has(base) && cryptoQuotes.has(quote)) {
            const coinId = FreeFallbackAdapter_1.COINGECKO_IDS[base];
            const coincapId = FreeFallbackAdapter_1.COINCAP_IDS[base];
            const vsCurrency = quote.toLowerCase() === 'usdt' ? 'usd' : quote.toLowerCase();
            const days = Math.max(1, Math.min(90, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))));
            try {
                const binanceSymbol = `${base}${quote === 'USDT' ? 'USDT' : quote}`;
                const intervalMap = {
                    '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m',
                    '1h': '1h', '2h': '2h', '4h': '4h', '1day': '1d', '1week': '1w',
                };
                const binanceInterval = intervalMap[interval] || '1h';
                const response = await axios_1.default.get('https://api.binance.com/api/v3/klines', {
                    params: {
                        symbol: binanceSymbol,
                        interval: binanceInterval,
                        startTime: start.getTime(),
                        endTime: end.getTime(),
                        limit: 1000,
                    },
                    timeout: 15000,
                });
                if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                    const candles = [];
                    for (const kline of response.data) {
                        const candle = {
                            symbol,
                            timestamp: new Date(kline[0]),
                            open: parseFloat(kline[1]),
                            high: parseFloat(kline[2]),
                            low: parseFloat(kline[3]),
                            close: parseFloat(kline[4]),
                            volume: parseFloat(kline[5]),
                            source: 'Binance (direct)',
                        };
                        if (candle.close > 0) {
                            candles.push(candle);
                        }
                    }
                    if (candles.length > 0) {
                        this.logger.log(`Binance direct klines: ${candles.length} candles for ${symbol} (real OHLCV)`);
                        return candles;
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Binance direct klines failed for ${symbol}: ${error.message}`);
            }
            if (coinId) {
                try {
                    const ohlcResponse = await axios_1.default.get(`https://api.coingecko.com/api/v3/coins/${coinId}/ohlc`, {
                        params: {
                            vs_currency: vsCurrency,
                            days: days.toString(),
                        },
                        timeout: 15000,
                    });
                    if (ohlcResponse.data && Array.isArray(ohlcResponse.data) && ohlcResponse.data.length > 0) {
                        const volumeMap = new Map();
                        try {
                            const mcResponse = await axios_1.default.get(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`, {
                                params: {
                                    vs_currency: vsCurrency,
                                    days: days.toString(),
                                    interval: 'daily',
                                },
                                timeout: 10000,
                            });
                            if (mcResponse.data?.total_volumes) {
                                for (const [ts, vol] of mcResponse.data.total_volumes) {
                                    const dayKey = new Date(ts).toISOString().split('T')[0];
                                    volumeMap.set(new Date(dayKey).getTime(), vol);
                                }
                            }
                        }
                        catch {
                        }
                        const candles = [];
                        for (const ohlc of ohlcResponse.data) {
                            const [timestamp, open, high, low, close] = ohlc;
                            const ts = new Date(timestamp);
                            if (ts >= start && ts <= end && close > 0) {
                                const dayKey = new Date(timestamp).toISOString().split('T')[0];
                                const vol = volumeMap.get(new Date(dayKey).getTime()) ?? 0;
                                candles.push({
                                    symbol,
                                    timestamp: ts,
                                    open,
                                    high,
                                    low,
                                    close,
                                    volume: vol,
                                    source: 'CoinGecko',
                                });
                            }
                        }
                        if (candles.length > 0) {
                            this.logger.log(`CoinGecko OHLC: ${candles.length} candles for ${symbol} (real OHLC, not flat)`);
                            return candles;
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`CoinGecko OHLC endpoint failed for ${symbol}: ${error.message}, falling back to market_chart aggregation`);
                }
                try {
                    const mcResponse = await axios_1.default.get(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`, {
                        params: {
                            vs_currency: vsCurrency,
                            days: days.toString(),
                            interval: 'hourly',
                        },
                        timeout: 15000,
                    });
                    if (mcResponse.data?.prices && mcResponse.data.prices.length > 0) {
                        const prices = mcResponse.data.prices;
                        const volumes = (mcResponse.data.total_volumes || []);
                        const filteredPrices = [];
                        for (let i = 0; i < prices.length; i++) {
                            const [timestamp, price] = prices[i];
                            const tsDate = new Date(timestamp);
                            if (tsDate >= start && tsDate <= end && price > 0) {
                                const vol = volumes[i] ? volumes[i][1] : 0;
                                filteredPrices.push({ ts: timestamp, price, vol });
                            }
                        }
                        if (filteredPrices.length === 0)
                            return [];
                        const candleMap = new Map();
                        for (const point of filteredPrices) {
                            const dt = new Date(point.ts);
                            const hourKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}T${String(dt.getUTCHours()).padStart(2, '0')}:00:00Z`;
                            const existing = candleMap.get(hourKey);
                            if (!existing) {
                                candleMap.set(hourKey, {
                                    open: point.price,
                                    close: point.price,
                                    high: point.price,
                                    low: point.price,
                                    volume: point.vol,
                                    ts: point.ts,
                                });
                            }
                            else {
                                existing.close = point.price;
                                existing.high = Math.max(existing.high, point.price);
                                existing.low = Math.min(existing.low, point.price);
                                existing.volume += point.vol;
                            }
                        }
                        const candles = [];
                        for (const [hourKey, data] of candleMap) {
                            candles.push({
                                symbol,
                                timestamp: new Date(hourKey),
                                open: data.open,
                                high: data.high,
                                low: data.low,
                                close: data.close,
                                volume: data.volume,
                                source: 'CoinGecko',
                            });
                        }
                        candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                        if (candles.length > 0) {
                            this.logger.log(`CoinGecko market_chart aggregation: ${candles.length} candles for ${symbol} (OHLC aggregated from hourly points)`);
                            return candles;
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`CoinGecko market_chart aggregation failed for ${symbol}: ${error.message}`);
                }
            }
            if (coincapId) {
                try {
                    const coincapIntervalMap = {
                        '1min': 'm1', '5min': 'm5', '15min': 'm15', '30min': 'm30',
                        '1h': 'h1', '2h': 'h2', '4h': 'h6', '1day': 'd1',
                    };
                    const coincapInterval = coincapIntervalMap[interval] || 'h1';
                    const response = await axios_1.default.get(`https://api.coincap.io/v2/assets/${coincapId}/history`, {
                        params: {
                            interval: coincapInterval,
                            start: start.getTime(),
                            end: end.getTime(),
                        },
                        timeout: 15000,
                    });
                    if (response.data?.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
                        const points = response.data.data;
                        const candleMap = new Map();
                        for (const point of points) {
                            const price = parseFloat(point.priceUsd ?? '0');
                            if (price <= 0)
                                continue;
                            const dt = new Date(point.time);
                            let candleKey;
                            if (coincapInterval.startsWith('m') || coincapInterval === 'h1' || coincapInterval === 'h2') {
                                candleKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}T${String(dt.getUTCHours()).padStart(2, '0')}:00:00Z`;
                            }
                            else {
                                candleKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}T00:00:00Z`;
                            }
                            const existing = candleMap.get(candleKey);
                            if (!existing) {
                                candleMap.set(candleKey, {
                                    open: price,
                                    close: price,
                                    high: price,
                                    low: price,
                                    volume: 0,
                                    ts: point.time,
                                });
                            }
                            else {
                                existing.close = price;
                                existing.high = Math.max(existing.high, price);
                                existing.low = Math.min(existing.low, price);
                            }
                        }
                        const candles = [];
                        for (const [candleKey, data] of candleMap) {
                            candles.push({
                                symbol,
                                timestamp: new Date(candleKey),
                                open: data.open,
                                high: data.high,
                                low: data.low,
                                close: data.close,
                                volume: data.volume,
                                source: 'CoinCap',
                            });
                        }
                        candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                        if (candles.length > 0) {
                            this.logger.log(`CoinCap history: ${candles.length} candles for ${symbol}`);
                            return candles;
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`CoinCap history failed for ${symbol}: ${error.message}`);
                }
            }
        }
        const fiatCurrencies = new Set([
            'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK',
        ]);
        if (fiatCurrencies.has(base) && fiatCurrencies.has(quote)) {
            try {
                const startDate = start.toISOString().split('T')[0];
                const endDate = end.toISOString().split('T')[0];
                const response = await axios_1.default.get(`https://api.frankfurter.dev/v1/${startDate}..${endDate}`, {
                    params: { from: base, to: quote },
                    timeout: 15000,
                });
                if (response.data && response.data.rates) {
                    const candles = [];
                    for (const [dateStr, rates] of Object.entries(response.data.rates)) {
                        const price = parseFloat(rates[quote] || '0');
                        if (price > 0) {
                            candles.push({
                                symbol,
                                timestamp: new Date(dateStr),
                                open: price,
                                high: price,
                                low: price,
                                close: price,
                                volume: 0,
                                source: 'ECB/Frankfurter',
                            });
                        }
                    }
                    return candles;
                }
            }
            catch (error) {
                this.logger.warn(`Frankfurter history failed for ${symbol}: ${error.message}`);
            }
        }
        return [];
    }
    async _fetchCryptoQuote(symbol, base, quote) {
        const coinId = FreeFallbackAdapter_1.COINGECKO_IDS[base];
        const coincapId = FreeFallbackAdapter_1.COINCAP_IDS[base];
        const vsCurrency = quote.toLowerCase() === 'usdt' ? 'usd' : quote.toLowerCase();
        if (coinId) {
            try {
                const response = await axios_1.default.get('https://api.coingecko.com/api/v3/simple/price', {
                    params: {
                        ids: coinId,
                        vs_currencies: vsCurrency,
                        include_24hr_change: 'true',
                        include_24hr_vol: 'true',
                        include_market_cap: 'true',
                    },
                    timeout: 10000,
                });
                if (response.data && response.data[coinId]) {
                    const data = response.data[coinId];
                    const price = data[vsCurrency] ?? 0;
                    if (price > 0) {
                        const changePercent = data[`${vsCurrency}_24h_change`] ?? 0;
                        const change = price * (changePercent / 100);
                        const volume = data[`${vsCurrency}_24h_vol`] ?? 0;
                        const marketCap = data[`${vsCurrency}_market_cap`] ?? null;
                        const result = {
                            symbol,
                            name: `${base}/${quote}`,
                            exchange: 'CoinGecko',
                            currency: quote,
                            price,
                            change,
                            changePercent,
                            open: price - change,
                            high: price * 1.01,
                            low: price * 0.99,
                            close: price,
                            volume,
                            marketCap,
                            fiftyTwoWeekHigh: null,
                            fiftyTwoWeekLow: null,
                            timestamp: new Date(),
                            source: 'CoinGecko',
                        };
                        await this._saveLastKnownPrice(symbol, result);
                        return result;
                    }
                }
            }
            catch (error) {
                this.logger.warn(`CoinGecko failed for ${symbol}: ${error.message}`);
            }
        }
        if (coincapId) {
            try {
                const response = await axios_1.default.get(`https://api.coincap.io/v2/assets/${coincapId}`, {
                    timeout: 10000,
                });
                if (response.data?.data) {
                    const data = response.data.data;
                    const price = parseFloat(data.priceUsd ?? '0');
                    if (price > 0) {
                        const changePercent = parseFloat(data.changePercent24Hr ?? '0');
                        const change = price * (changePercent / 100);
                        const volume = parseFloat(data.volumeUsd24Hr ?? '0');
                        const marketCap = parseFloat(data.marketCapUsd ?? '0') || null;
                        let adjustedPrice = price;
                        if (quote !== 'USD' && quote !== 'USDT') {
                        }
                        const result = {
                            symbol,
                            name: `${base}/${quote}`,
                            exchange: 'CoinCap',
                            currency: quote,
                            price: adjustedPrice,
                            change,
                            changePercent,
                            open: adjustedPrice - change,
                            high: adjustedPrice * 1.01,
                            low: adjustedPrice * 0.99,
                            close: adjustedPrice,
                            volume,
                            marketCap,
                            fiftyTwoWeekHigh: null,
                            fiftyTwoWeekLow: null,
                            timestamp: new Date(),
                            source: 'CoinCap',
                        };
                        await this._saveLastKnownPrice(symbol, result);
                        return result;
                    }
                }
            }
            catch (error) {
                this.logger.warn(`CoinCap failed for ${symbol}: ${error.message}`);
            }
        }
        try {
            const binanceSymbol = `${base}${quote === 'USDT' ? 'USDT' : quote}`;
            const response = await axios_1.default.get(`https://api.binance.com/api/v3/ticker/24hr`, {
                params: { symbol: binanceSymbol },
                timeout: 10000,
            });
            if (response.data) {
                const data = response.data;
                const price = parseFloat(data.lastPrice ?? '0');
                if (price > 0) {
                    const changePercent = parseFloat(data.priceChangePercent ?? '0');
                    const change = parseFloat(data.priceChange ?? '0');
                    const volume = parseFloat(data.volume ?? '0');
                    const quoteVolume = parseFloat(data.quoteVolume ?? '0');
                    const result = {
                        symbol,
                        name: `${base}/${quote}`,
                        exchange: 'Binance',
                        currency: quote,
                        price,
                        change,
                        changePercent,
                        open: parseFloat(data.openPrice ?? String(price)),
                        high: parseFloat(data.highPrice ?? String(price * 1.01)),
                        low: parseFloat(data.lowPrice ?? String(price * 0.99)),
                        close: price,
                        volume,
                        marketCap: null,
                        fiftyTwoWeekHigh: null,
                        fiftyTwoWeekLow: null,
                        timestamp: new Date(data.closeTime ?? Date.now()),
                        source: 'Binance (direct)',
                    };
                    await this._saveLastKnownPrice(symbol, result);
                    return result;
                }
            }
        }
        catch (error) {
            this.logger.warn(`Binance direct API failed for ${symbol}: ${error.message}`);
        }
        try {
            const yahooSymbol = `${base}-USD`;
            const response = await axios_1.default.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
                params: { range: '1d', interval: '1d' },
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
            });
            if (response.data?.chart?.result?.[0]?.meta) {
                const meta = response.data.chart.result[0].meta;
                const price = meta.regularMarketPrice ?? 0;
                if (price > 0) {
                    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
                    const change = price - prevClose;
                    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
                    const result = {
                        symbol,
                        name: `${base}/${quote}`,
                        exchange: 'Yahoo Finance',
                        currency: quote,
                        price,
                        change,
                        changePercent,
                        open: meta.regularMarketDayOpen ?? price,
                        high: meta.regularMarketDayHigh ?? price,
                        low: meta.regularMarketDayLow ?? price,
                        close: price,
                        volume: meta.regularMarketVolume ?? 0,
                        marketCap: null,
                        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
                        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
                        timestamp: new Date(meta.regularMarketTime * 1000 || Date.now()),
                        source: 'Yahoo Finance',
                    };
                    await this._saveLastKnownPrice(symbol, result);
                    return result;
                }
            }
        }
        catch (error) {
            this.logger.warn(`Yahoo Finance crypto failed for ${symbol}: ${error.message}`);
        }
        const lastKnown = await this._getLastKnownPrice(symbol);
        if (lastKnown) {
            this.logger.warn(`Returning cached price for crypto ${symbol}`);
            return lastKnown;
        }
        throw new Error(`All free crypto sources failed for ${symbol}`);
    }
    async _saveLastKnownPrice(symbol, quote) {
        try {
            const key = `fallback:lastprice:${symbol}`;
            await this.redisService.set(key, JSON.stringify({ ...quote, timestamp: quote.timestamp.toISOString() }), 86_400_000);
        }
        catch {
        }
    }
    async _getLastKnownPrice(symbol) {
        try {
            const key = `fallback:lastprice:${symbol}`;
            const cached = await this.redisService.get(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                parsed.timestamp = new Date(parsed.timestamp);
                parsed.source = `${parsed.source} (مخزّن)`;
                return parsed;
            }
        }
        catch {
        }
        return null;
    }
};
exports.FreeFallbackAdapter = FreeFallbackAdapter;
FreeFallbackAdapter.COINGECKO_IDS = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    BNB: 'binancecoin',
    XRP: 'ripple',
    ADA: 'cardano',
    DOGE: 'dogecoin',
    DOT: 'polkadot',
    MATIC: 'matic-network',
    LTC: 'litecoin',
    AVAX: 'avalanche-2',
    LINK: 'chainlink',
    UNI: 'uniswap',
    ATOM: 'cosmos',
    ETC: 'ethereum-classic',
    XLM: 'stellar',
    BCH: 'bitcoin-cash',
    ALGO: 'algorand',
    VET: 'vechain',
    ICP: 'internet-computer',
    FIL: 'filecoin',
    TRX: 'tron',
    NEAR: 'near',
    FTM: 'fantom',
    AAVE: 'aave',
    SHIB: 'shiba-inu',
    SUI: 'sui',
    SEI: 'sei-network',
    TIA: 'celestia',
    INJ: 'injective-protocol',
    STX: 'blockstack',
    IMX: 'immutable-x',
    RUNE: 'thorchain',
    PEPE: 'pepe',
    WIF: 'dogwifcoin',
    ARB: 'arbitrum',
    OP: 'optimism',
};
FreeFallbackAdapter.COINCAP_IDS = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    BNB: 'binance-coin',
    XRP: 'xrp',
    ADA: 'cardano',
    DOGE: 'dogecoin',
    DOT: 'polkadot',
    MATIC: 'polygon',
    LTC: 'litecoin',
    AVAX: 'avalanche',
    LINK: 'chainlink',
    UNI: 'uniswap',
    ATOM: 'cosmos',
    ETC: 'ethereum-classic',
    XLM: 'stellar',
    BCH: 'bitcoin-cash',
    ALGO: 'algorand',
    VET: 'vechain',
    ICP: 'internet-computer',
    FIL: 'filecoin',
    TRX: 'tron',
    NEAR: 'near-protocol',
    FTM: 'fantom',
    AAVE: 'aave',
    SHIB: 'shiba-inu',
    SUI: 'sui',
    SEI: 'sei-network',
    TIA: 'celestia',
    INJ: 'injective-protocol',
    STX: 'blockstack',
    IMX: 'immutable-x',
    RUNE: 'thorchain',
    PEPE: 'pepe',
    WIF: 'dogwifcoin',
    ARB: 'arbitrum',
    OP: 'optimism',
};
exports.FreeFallbackAdapter = FreeFallbackAdapter = FreeFallbackAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], FreeFallbackAdapter);
//# sourceMappingURL=free-fallback.adapter.js.map