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
var PolymarketAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolymarketAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const POLYMARKET_API_BASE = 'https://gamma-api.polymarket.com';
const MIN_VOLUME_USD = 50_000;
const REQUEST_TIMEOUT_MS = 15_000;
const CATEGORY_KEYWORDS = {
    crypto: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'defi', 'nft', 'solana', 'binance'],
    economics: ['fed', 'interest rate', 'inflation', 'gdp', 'recession', 'unemployment', 'cpi'],
    politics: ['election', 'president', 'congress', 'senate', 'trump', 'biden', 'vote'],
    geopolitics: ['war', 'conflict', 'sanctions', 'treaty', 'ukraine', 'china', 'tariff'],
    stocks: ['s&p', 'nasdaq', 'dow', 'apple', 'tesla', 'nvidia', 'stock market'],
};
const SYMBOL_PATTERNS = [
    { pattern: /\bBTC\b|\bBitcoin\b/i, symbol: 'BTC' },
    { pattern: /\bETH\b|\bEthereum\b/i, symbol: 'ETH' },
    { pattern: /\bSOL\b|\bSolana\b/i, symbol: 'SOL' },
    { pattern: /\bS&P\s*500\b|\bSPX\b/i, symbol: 'SPY' },
    { pattern: /\bNASDAQ\b|\bNDX\b/i, symbol: 'QQQ' },
    { pattern: /\bAAPL\b|\bApple\b/i, symbol: 'AAPL' },
    { pattern: /\bTSLA\b|\bTesla\b/i, symbol: 'TSLA' },
    { pattern: /\bNVDA\b|\bNvidia\b/i, symbol: 'NVDA' },
    { pattern: /\bDXY\b|\bDollar Index\b/i, symbol: 'DXY' },
    { pattern: /\bGold\b|\bXAU\b/i, symbol: 'XAU' },
    { pattern: /\bOil\b|\bCrude\b|\bWTI\b/i, symbol: 'CL' },
    { pattern: /\bBNB\b|\bBinance Coin\b/i, symbol: 'BNB' },
    { pattern: /\bXRP\b/i, symbol: 'XRP' },
    { pattern: /\bDOGE\b|\bDogecoin\b/i, symbol: 'DOGE' },
];
let PolymarketAdapter = PolymarketAdapter_1 = class PolymarketAdapter {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(PolymarketAdapter_1.name);
        this.name = 'Polymarket';
    }
    async fetchActiveEvents(limit = 50, offset = 0) {
        try {
            const url = new URL(`${POLYMARKET_API_BASE}/events`);
            url.searchParams.set('active', 'true');
            url.searchParams.set('closed', 'false');
            url.searchParams.set('archived', 'false');
            url.searchParams.set('limit', String(limit));
            url.searchParams.set('offset', String(offset));
            url.searchParams.set('order', 'volume24hr');
            url.searchParams.set('ascending', 'false');
            const response = await this._fetchWithTimeout(url.toString());
            if (!response.ok) {
                this.logger.warn(`Polymarket API returned ${response.status}: ${response.statusText}`);
                return [];
            }
            const events = await response.json();
            const unified = [];
            for (const event of events) {
                if (!event.markets || event.markets.length === 0)
                    continue;
                const primaryMarket = event.markets[0];
                const marketProbability = this._parseProbability(primaryMarket);
                if (marketProbability === null)
                    continue;
                const totalVolume = event.volume || primaryMarket.volume || 0;
                const totalLiquidity = event.liquidity || primaryMarket.liquidity || 0;
                if (totalVolume < MIN_VOLUME_USD)
                    continue;
                const relatedSymbols = this._extractSymbols(`${event.title} ${event.description || ''} ${primaryMarket.question || ''}`);
                const category = this._detectCategory(`${event.title} ${event.description || ''}`);
                unified.push({
                    sourceId: event.slug || event.id,
                    source: 'polymarket',
                    title: event.title,
                    description: event.description || primaryMarket.question,
                    category,
                    relatedSymbols,
                    marketProbability,
                    volume24h: totalVolume,
                    liquidity: totalLiquidity,
                    endDate: event.endDate ? new Date(event.endDate) : undefined,
                    active: event.active && !event.closed,
                    raw: event,
                });
            }
            this.logger.log(`📊 Polymarket: Fetched ${unified.length} active events (from ${events.length} total)`);
            return unified;
        }
        catch (error) {
            this.logger.error(`Failed to fetch Polymarket events: ${error.message}`);
            return [];
        }
    }
    async fetchEventDetails(eventId) {
        try {
            const url = `${POLYMARKET_API_BASE}/events/${eventId}`;
            const response = await this._fetchWithTimeout(url);
            if (!response.ok) {
                if (response.status === 404) {
                    this.logger.debug(`Polymarket event not found: ${eventId}`);
                    return null;
                }
                this.logger.warn(`Polymarket API returned ${response.status} for event ${eventId}`);
                return null;
            }
            const event = await response.json();
            if (!event.markets || event.markets.length === 0)
                return null;
            const primaryMarket = event.markets[0];
            const marketProbability = this._parseProbability(primaryMarket);
            if (marketProbability === null)
                return null;
            const relatedSymbols = this._extractSymbols(`${event.title} ${event.description || ''} ${primaryMarket.question || ''}`);
            const category = this._detectCategory(`${event.title} ${event.description || ''}`);
            return {
                sourceId: event.slug || event.id,
                source: 'polymarket',
                title: event.title,
                description: event.description || primaryMarket.question,
                category,
                relatedSymbols,
                marketProbability,
                volume24h: event.volume || primaryMarket.volume || 0,
                liquidity: event.liquidity || primaryMarket.liquidity || 0,
                endDate: event.endDate ? new Date(event.endDate) : undefined,
                active: event.active && !event.closed,
                raw: event,
            };
        }
        catch (error) {
            this.logger.error(`Failed to fetch Polymarket event ${eventId}: ${error.message}`);
            return null;
        }
    }
    async fetchEventsByCategory(category) {
        const allEvents = await this.fetchActiveEvents(100);
        const keywords = CATEGORY_KEYWORDS[category.toLowerCase()] || [category.toLowerCase()];
        return allEvents.filter(event => {
            const text = `${event.title} ${event.description || ''} ${event.category || ''}`.toLowerCase();
            return keywords.some(kw => text.includes(kw));
        });
    }
    _parseProbability(market) {
        if (!market.outcomePrices || market.outcomePrices.length === 0)
            return null;
        const yesPrice = parseFloat(market.outcomePrices[0]);
        if (isNaN(yesPrice))
            return null;
        return Math.max(0.05, Math.min(0.95, yesPrice));
    }
    _extractSymbols(text) {
        const symbols = new Set();
        for (const { pattern, symbol } of SYMBOL_PATTERNS) {
            if (pattern.test(text)) {
                symbols.add(symbol);
            }
        }
        return Array.from(symbols);
    }
    _detectCategory(text) {
        const lowerText = text.toLowerCase();
        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            if (keywords.some(kw => lowerText.includes(kw))) {
                return category;
            }
        }
        return 'other';
    }
    async _fetchWithTimeout(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'RouaTrading/1.0',
                },
            });
        }
        finally {
            clearTimeout(timeout);
        }
    }
};
exports.PolymarketAdapter = PolymarketAdapter;
exports.PolymarketAdapter = PolymarketAdapter = PolymarketAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PolymarketAdapter);
//# sourceMappingURL=polymarket.adapter.js.map