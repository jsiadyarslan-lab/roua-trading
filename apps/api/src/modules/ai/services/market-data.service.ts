import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calcRsiLatest, calcMacdScalar } from '../../../common/utils/indicator-algorithms.util';
import { RedisService } from '../../../common/redis/redis.service';
import axios from 'axios';

/**
 * MarketDataService — Dedicated service for fetching and cross-validating market data.
 *
 * Extracted from AIOrchestratorService (#19: Break up the AIOrchestrator monolith).
 * Encapsulates ALL price fetching logic from 9 sources with cross-validation,
 * RSI/MACD calculation, and last-known-good price caching.
 *
 * Public API:
 *   fetchQuickMarketData(symbol) → { price, rsi, macd, change24h? }
 */

/** Price sanity ranges — reject absurd prices BEFORE they reach the executor. */
const PRICE_SANITY: Record<string, { min: number; max: number }> = {
  'BTC/USDT': { min: 20000, max: 250000 }, 'BTC/USD': { min: 20000, max: 250000 },
  'ETH/USDT': { min: 500, max: 15000 }, 'ETH/USD': { min: 500, max: 15000 },
  'SOL/USDT': { min: 5, max: 1000 }, 'SOL/USD': { min: 5, max: 1000 },
  'BNB/USDT': { min: 100, max: 3000 }, 'BNB/USD': { min: 100, max: 3000 },
  'XRP/USDT': { min: 0.1, max: 10 }, 'XRP/USD': { min: 0.1, max: 10 },
  'ADA/USDT': { min: 0.05, max: 5 }, 'ADA/USD': { min: 0.05, max: 5 },
  'DOGE/USDT': { min: 0.01, max: 2 }, 'DOGE/USD': { min: 0.01, max: 2 },
  'DOT/USDT': { min: 1, max: 50 }, 'DOT/USD': { min: 1, max: 50 },
  'AVAX/USDT': { min: 5, max: 200 }, 'AVAX/USD': { min: 5, max: 200 },
  'LINK/USDT': { min: 2, max: 50 }, 'LINK/USD': { min: 2, max: 50 },
  'MATIC/USDT': { min: 0.1, max: 5 }, 'MATIC/USD': { min: 0.1, max: 5 },
  'EUR/USD': { min: 0.8, max: 1.5 }, 'GBP/USD': { min: 1.0, max: 1.8 },
  'USD/JPY': { min: 100, max: 200 }, 'XAU/USD': { min: 1000, max: 5000 },
  'AAPL': { min: 100, max: 400 }, 'MSFT': { min: 200, max: 600 },
  'GOOGL': { min: 100, max: 300 }, 'TSLA': { min: 100, max: 500 },
};

/** Reference prices — used as fallback when all live sources fail or return insane prices.
 *  Updated 2026-07-12 with live Binance prices.
 *  V1182: Previous prices were from May 2026 and caused 736% deviation on DOT/USDT
 *  (reference=$7.00 vs actual=$0.84). This created phantom trades at wrong prices.
 */
const REFERENCE_PRICES: Record<string, number> = {
  'BTC/USDT': 64032, 'BTC/USD': 64032,
  'ETH/USDT': 1817, 'ETH/USD': 1817,
  'SOL/USDT': 77.3, 'SOL/USD': 77.3,
  'BNB/USDT': 579, 'BNB/USD': 579,
  'XRP/USDT': 1.10, 'XRP/USD': 1.10,
  'ADA/USDT': 0.164, 'ADA/USD': 0.164,
  'DOGE/USDT': 0.0734, 'DOGE/USD': 0.0734,
  'DOT/USDT': 0.84, 'DOT/USD': 0.84,
  'AVAX/USDT': 6.42, 'AVAX/USD': 6.42,
  'LINK/USDT': 8.03, 'LINK/USD': 8.03,
  'MATIC/USDT': 0.379, 'MATIC/USD': 0.379,
  'UNI/USDT': 3.66, 'UNI/USD': 3.66,
  'EUR/USD': 1.10, 'GBP/USD': 1.34, 'USD/JPY': 157,
  'XAU/USD': 3250,
  'AAPL': 210, 'MSFT': 440, 'GOOGL': 168, 'TSLA': 280,
};

/** CoinCap ID mapping — CoinCap requires full lowercase IDs, not ticker symbols.
 *  e.g., "bitcoin" not "btc". Without this, /assets/btc returns wrong data or 404.
 */
const COINCAP_IDS: Record<string, string> = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana',
  'BNB': 'binance-coin', 'XRP': 'xrp', 'ADA': 'cardano',
  'DOGE': 'dogecoin', 'DOT': 'polkadot', 'LTC': 'litecoin',
  'AVAX': 'avalanche', 'LINK': 'chainlink', 'UNI': 'uniswap',
  'ATOM': 'cosmos', 'MATIC': 'polygon', 'SHIB': 'shiba-inu',
  'SUI': 'sui', 'ARB': 'arbitrum', 'OP': 'optimism',
  'PEPE': 'pepe', 'WIF': 'dogwifcoin', 'INJ': 'injective-protocol',
  'NEAR': 'near-protocol', 'FTM': 'fantom', 'AAVE': 'aave',
  'ETC': 'ethereum-classic', 'XLM': 'stellar', 'BCH': 'bitcoin-cash',
};

/** Return type for fetchQuickMarketData */
export interface QuickMarketData {
  price: number;
  rsi: number;
  macd: string;
  change24h?: number;
}

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  /** Last-known-good price cache — prevents hallucination when all sources fail */
  private readonly lastKnownPriceCache = new Map<string, { price: number; rsi: number; macd: string; timestamp: number }>();
  private readonly PRICE_CACHE_MAX_AGE = 30 * 60 * 1000; // 30 minutes — stale price > no price

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {
    this.logger.log('📊 MarketDataService initialized — 9 price sources with cross-validation');
  }

  /**
   * Public method: Fetch quick market data (price, RSI, MACD) for a symbol.
   * Used by AIOrchestratorService, Strategic Council, Smart Executor, and other consumers.
   * Uses multiple parallel price sources (Binance, CoinGecko, CoinCap, Bybit, TwelveData, etc.)
   * and works reliably on Railway/cloud platforms where individual sources may be blocked.
   */
  async fetchQuickMarketData(symbol: string): Promise<QuickMarketData> {
    return this._fetchQuickMarketData(symbol);
  }

  /**
   * Core implementation — fetches prices from 9 sources with cross-validation,
   * then computes RSI/MACD from available kline data.
   */
  private async _fetchQuickMarketData(symbol: string): Promise<QuickMarketData> {
    // FIX: Normalize symbol for Binance — handle both /USD and /USDT pairs correctly.
    const stripped = symbol.replace(/[\/\-]/g, '').toUpperCase();
    const binanceSymbol = stripped.endsWith('USDT') ? stripped : stripped.replace('USD', 'USDT');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CRITICAL FIX: Use Promise.allSettled() instead of Promise.any()
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // OLD BUG: Promise.any() returned the FIRST valid price (> 0), even if wrong.
    // Example: CoinCap with wrong ID "/assets/btc" returns $34.98 for a different
    // asset → Promise.any() accepts it → BTC trades at wrong price → all downstream fails.
    //
    // NEW APPROACH: Gather ALL results, then:
    // 1. Filter by price sanity ranges (reject BTC at $34.98)
    // 2. Cross-validate — if multiple sources agree (within 5%), use median
    // 3. If only one source passes sanity, use it
    // 4. If none pass, use reference price as last resort
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const sanity = PRICE_SANITY[symbol];
    const refPrice = REFERENCE_PRICES[symbol];

    // Run ALL sources in parallel — no early termination
    const allResults = await Promise.allSettled([
      // Source 1: Binance (most accurate, but often blocked on Railway)
      (async () => {
        const res = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`, { timeout: 4000 });
        const price = parseFloat(res.data?.lastPrice || '0');
        if (price <= 0) throw new Error('Binance price=0');
        const change24h = parseFloat(res.data?.priceChangePercent || '0');
        return { price, source: 'binance', change24h };
      })(),
      // Source 2: CoinGecko (reliable, free, no auth)
      (async () => {
        const coingeckoId = this._symbolToCoingeckoId(symbol);
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`, { timeout: 5000 });
        const price = res.data?.[coingeckoId]?.usd;
        if (!price || price <= 0) throw new Error('CoinGecko no price');
        const change24h = res.data?.[coingeckoId]?.usd_24h_change;
        return { price, source: 'coingecko', change24h };
      })(),
      // Source 3: CoinCap — REMOVED V1182
      // DNS resolution for api.coincap.io fails on Railway (getaddrinfo ENOTFOUND).
      // This source was causing 5s timeout delays on every fetchQuickMarketData call.
      // Binance + Bybit + Yahoo Finance provide sufficient cross-validation.
      // Source 4: Bybit (alternative exchange, works on cloud)
      (async () => {
        const bybitSymbol = symbol.replace(/[\/\-]/g, '').toUpperCase();
        const res = await axios.get(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${bybitSymbol}`, { timeout: 4000 });
        const price = parseFloat(res.data?.result?.list?.[0]?.lastPrice || '0');
        if (price <= 0) throw new Error('Bybit price=0');
        const change24h = parseFloat(res.data?.result?.list?.[0]?.price24hPcnt || '0') * 100;
        return { price, source: 'bybit', change24h };
      })(),
      // Source 5: TwelveData (API key available, reliable on cloud)
      (async () => {
        const tdApiKey = this.configService.get<string>('TWELVE_DATA_API_KEY', '');
        if (!tdApiKey) throw new Error('No TwelveData key');
        const tdSymbol = symbol.replace(/[\/\-]/g, '');
        const res = await axios.get(`https://api.twelvedata.com/price?symbol=${tdSymbol}&apikey=${tdApiKey}`, { timeout: 5000 });
        const price = parseFloat(res.data?.price || '0');
        if (price <= 0) throw new Error('TwelveData price=0');
        return { price, source: 'twelvedata', change24h: undefined };
      })(),
      // Source 6: Yahoo Finance (FREE, no API key, works for Forex/Stocks/Commodities on cloud)
      (async () => {
        let yahooSymbol: string;
        const base = symbol.split('/')[0].toUpperCase();
        const quote = symbol.split('/')[1]?.toUpperCase();

        if (quote && ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'].includes(base) &&
            ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'].includes(quote)) {
          yahooSymbol = `${base}${quote}=X`;
        } else if (base === 'XAU' || base === 'XAG' || base === 'XPT') {
          yahooSymbol = `${base}${quote}=X`;
        } else if (!quote || quote === 'USD' || quote === 'USDT') {
          yahooSymbol = `${base}-USD`;  // FIX: "BTC" → stock price ($34.98), "BTC-USD" → crypto price (~$79K)
        } else {
          yahooSymbol = `${base}-${quote}`;
        }

        const res = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`,
          {
            timeout: 6000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          },
        );
        const result = res.data?.chart?.result?.[0];
        const meta = result?.meta;
        const price = meta?.regularMarketPrice;
        if (!price || price <= 0) throw new Error('Yahoo Finance price=0');
        let change24h: number | undefined;
        const closes: number[] = result?.indicators?.quote?.[0]?.close?.filter((v: number) => v != null) || [];
        if (closes.length >= 2) {
          const prevClose = closes[closes.length - 2];
          const latestClose = closes[closes.length - 1];
          if (prevClose > 0) {
            change24h = ((latestClose - prevClose) / prevClose) * 100;
          }
        }
        return { price, source: 'yahoo-finance', change24h };
      })(),
      // Source 7: ExchangeRate API (FREE, no API key, Forex-only)
      (async () => {
        const base = symbol.split('/')[0].toUpperCase();
        const quote = symbol.split('/')[1]?.toUpperCase();
        const fiatCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'SGD', 'HKD'];
        if (!fiatCurrencies.includes(base) || !fiatCurrencies.includes(quote)) {
          throw new Error('Not a fiat pair');
        }
        const res = await axios.get(`https://api.exchangerate-api.com/v4/latest/${base}`, { timeout: 5000 });
        const rate = res.data?.rates?.[quote];
        if (!rate || rate <= 0) throw new Error('ExchangeRate no rate');
        return { price: rate, source: 'exchangerate-api', change24h: undefined };
      })(),
      // Source 8: Alpha Vantage (FREE tier: 25 req/day, Forex + Stocks + Commodities)
      (async () => {
        const avApiKey = this.configService.get<string>('ALPHA_VANTAGE_API_KEY', 'demo');
        if (!avApiKey || avApiKey === 'disabled') throw new Error('No Alpha Vantage key');
        const base = symbol.split('/')[0].toUpperCase();
        const quote = symbol.split('/')[1]?.toUpperCase();
        const fiatCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];

        if (fiatCurrencies.includes(base) && fiatCurrencies.includes(quote)) {
          const res = await axios.get(
            `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote}&apikey=${avApiKey}`,
            { timeout: 6000 },
          );
          const rate = parseFloat(res.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'] || '0');
          if (rate <= 0) throw new Error('Alpha Vantage forex rate=0');
          return { price: rate, source: 'alpha-vantage-forex', change24h: undefined };
        } else if (base === 'XAU' || base === 'XAG') {
          const res = await axios.get(
            `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote || 'USD'}&apikey=${avApiKey}`,
            { timeout: 6000 },
          );
          const rate = parseFloat(res.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'] || '0');
          if (rate <= 0) throw new Error('Alpha Vantage commodity rate=0');
          return { price: rate, source: 'alpha-vantage-commodity', change24h: undefined };
        } else {
          const res = await axios.get(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${base}&apikey=${avApiKey}`,
            { timeout: 6000 },
          );
          const price = parseFloat(res.data?.['Global Quote']?.['05. price'] || '0');
          if (price <= 0) throw new Error('Alpha Vantage stock price=0');
          const prevClose = parseFloat(res.data?.['Global Quote']?.['08. previous close'] || '0');
          let change24h: number | undefined;
          if (prevClose > 0) {
            change24h = ((price - prevClose) / prevClose) * 100;
          }
          return { price, source: 'alpha-vantage-stock', change24h };
        }
      })(),
    ]);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 2: Extract successful results and filter by sanity ranges
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const validPrices: { price: number; source: string; change24h?: number }[] = [];
    const rejectedPrices: { price: number; source: string; reason: string }[] = [];

    for (const result of allResults) {
      if (result.status === 'fulfilled' && result.value?.price > 0) {
        const { price, source, change24h: srcChange24h } = result.value;

        // Sanity check: reject prices outside expected range
        if (sanity && (price < sanity.min || price > sanity.max)) {
          rejectedPrices.push({ price, source, reason: `outside [${sanity.min}, ${sanity.max}]` });
          this.logger.warn(
            `📊 PRICE SANITY REJECTED ${symbol}: $${price} from ${source} — outside range [$${sanity.min}, $${sanity.max}]`
          );
          continue;
        }

        validPrices.push({ price, source, change24h: srcChange24h });
      }
    }

    // Log rejected prices for debugging
    if (rejectedPrices.length > 0) {
      this.logger.warn(
        `📊 ${symbol}: ${rejectedPrices.length} source(s) rejected by sanity check: ` +
        rejectedPrices.map(r => `${r.source}=$${r.price} (${r.reason})`).join(', ')
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 3: Select the best price using cross-validation
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let finalPrice = 0;
    let finalSource = 'none';
    let change24h: number | undefined;

    if (validPrices.length >= 2) {
      // Multiple sources — cross-validate: if prices agree within 5%, use median
      const prices = validPrices.map(v => v.price).sort((a, b) => a - b);
      const medianPrice = prices.length % 2 === 0
        ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
        : prices[Math.floor(prices.length / 2)];

      // Check if most sources agree (within 5% of median)
      const agreeing = validPrices.filter(v => {
        const deviation = Math.abs(v.price - medianPrice) / medianPrice;
        return deviation < 0.05; // 5% tolerance
      });

      if (agreeing.length >= 2) {
        // Use the median of agreeing sources
        const agreeingPrices = agreeing.map(v => v.price).sort((a, b) => a - b);
        finalPrice = agreeingPrices.length % 2 === 0
          ? (agreeingPrices[agreeingPrices.length / 2 - 1] + agreeingPrices[agreeingPrices.length / 2]) / 2
          : agreeingPrices[Math.floor(agreeingPrices.length / 2)];
        finalSource = agreeing.map(v => v.source).join('+');
        change24h = agreeing[0].change24h;
        this.logger.debug(
          `📊 ${symbol}: Cross-validated price $${finalPrice} from ${agreeing.length} agreeing sources (${finalSource})`
        );
      } else {
        // Sources disagree — use the most reliable single source
        // Priority: binance > coingecko > bybit > coincap > yahoo > others
        const sourcePriority = ['binance', 'coingecko', 'bybit', 'coincap', 'yahoo-finance', 'twelvedata', 'exchangerate-api', 'alpha-vantage'];
        const sorted = [...validPrices].sort((a, b) => {
          const aIdx = sourcePriority.indexOf(a.source);
          const bIdx = sourcePriority.indexOf(b.source);
          return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
        });
        finalPrice = sorted[0].price;
        finalSource = sorted[0].source + ' (disputed)';
        change24h = sorted[0].change24h;
        this.logger.warn(
          `📊 ${symbol}: Sources disagree — using most reliable: $${finalPrice} from ${finalSource}`
        );
      }
    } else if (validPrices.length === 1) {
      // Only one source — use it (already passed sanity check)
      finalPrice = validPrices[0].price;
      finalSource = validPrices[0].source;
      change24h = validPrices[0].change24h;
      this.logger.debug(`📊 ${symbol}: Single source price $${finalPrice} from ${finalSource}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 4: Fallback chain if no valid price found
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (!finalPrice || finalPrice <= 0) {
      // Try reference price
      if (refPrice && refPrice > 0) {
        finalPrice = refPrice;
        finalSource = 'reference-table';
        this.logger.warn(`📊 ${symbol}: ALL live sources failed/insane — using reference price $${refPrice}`);
      } else {
        // Try last-known-good cache
        const cachedPrice = this.lastKnownPriceCache.get(symbol);
        if (cachedPrice && (Date.now() - cachedPrice.timestamp) < this.PRICE_CACHE_MAX_AGE) {
          finalPrice = cachedPrice.price;
          finalSource = `cache (${Math.round((Date.now() - cachedPrice.timestamp) / 1000)}s old)`;
          this.logger.warn(`📊 ${symbol}: Using cached price $${finalPrice} (${finalSource})`);
        } else {
          this.logger.error(`📊 ALL price sources FAILED for ${symbol} — no reference price, no cache`);
          return { price: 0, rsi: 50, macd: 'غير متوفر', change24h: 0 };
        }
      }
    }

    // Also try to get klines for RSI/MACD (Binance only)
    let rsi = 50;
    let macd = 'غير متوفر';
    try {
      const klinesRes = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=30`, { timeout: 4000 });
      const closes: number[] = (klinesRes.data || []).map((k: any) => parseFloat(k[4])).filter((v: number) => !isNaN(v));
      if (closes.length > 14) {
        rsi = calcRsiLatest(closes);
        macd = this._formatMacd(closes);
      }
    } catch {
      // Klines unavailable — use defaults
    }

    // Try Bybit klines as fallback for RSI/MACD when Binance is blocked
    if (rsi === 50) {
      try {
        const bybitSymbol = symbol.replace(/[\/\-]/g, '').toUpperCase();
        const bybitKlinesRes = await axios.get(
          `https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=60&limit=30`,
          { timeout: 4000 },
        );
        const closes: number[] = (bybitKlinesRes.data?.result?.list || [])
          .map((k: any) => parseFloat(k[4]))
          .filter((v: number) => !isNaN(v))
          .reverse();
        if (closes.length > 14) {
          rsi = calcRsiLatest(closes);
          macd = this._formatMacd(closes);
        }
      } catch {
        // Bybit klines also unavailable
      }
    }

    // Try Yahoo Finance klines as fallback for Forex/Stock/Commodity RSI/MACD
    if (rsi === 50) {
      try {
        let yahooKlineSymbol: string;
        const base = symbol.split('/')[0].toUpperCase();
        const quote = symbol.split('/')[1]?.toUpperCase();
        const fiatCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];

        if (fiatCurrencies.includes(base) && fiatCurrencies.includes(quote)) {
          yahooKlineSymbol = `${base}${quote}=X`;
        } else if (base === 'XAU' || base === 'XAG' || base === 'XPT') {
          yahooKlineSymbol = `${base}${quote}=X`;
        } else if (!quote || quote === 'USD' || quote === 'USDT') {
          yahooKlineSymbol = base;
        } else {
          yahooKlineSymbol = `${base}-${quote}`;
        }

        const yfKlineRes = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooKlineSymbol)}?interval=1h&range=5d`,
          {
            timeout: 6000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          },
        );
        const yfCloses: number[] = (yfKlineRes.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [])
          .filter((v: number) => v != null && v > 0);
        if (yfCloses.length > 14) {
          rsi = calcRsiLatest(yfCloses);
          macd = this._formatMacd(yfCloses);
        }
      } catch {
        // Yahoo Finance klines also unavailable
      }
    }

    // Save to last-known-good cache
    this.lastKnownPriceCache.set(symbol, { price: finalPrice, rsi, macd, timestamp: Date.now() });
    if (this.lastKnownPriceCache.size > 50) {
      const now = Date.now();
      for (const [key, entry] of this.lastKnownPriceCache) {
        if (now - entry.timestamp > this.PRICE_CACHE_MAX_AGE) this.lastKnownPriceCache.delete(key);
      }
    }

    this.logger.log(
      `📊 ${symbol}: price=$${finalPrice} from ${finalSource}, RSI=${rsi}, MACD=${macd}, 24h=${change24h?.toFixed(2) || 'N/A'}%` +
      (validPrices.length > 0 ? ` (${validPrices.length}/${allResults.length} sources valid)` : ' (fallback)')
    );
    return { price: finalPrice, rsi, macd, change24h };
  }

  /**
   * Map trading symbol to CoinGecko asset ID.
   * CoinGecko uses different IDs than Binance (e.g., BTC/USD → bitcoin).
   */
  private _symbolToCoingeckoId(symbol: string): string {
    const map: Record<string, string> = {
      'BTC/USD': 'bitcoin', 'BTC/USDT': 'bitcoin', 'BTCUSDT': 'bitcoin',
      'ETH/USD': 'ethereum', 'ETH/USDT': 'ethereum', 'ETHUSDT': 'ethereum',
      'SOL/USD': 'solana', 'SOL/USDT': 'solana', 'SOLUSDT': 'solana',
      'XRP/USD': 'ripple', 'XRP/USDT': 'ripple', 'XRPUSDT': 'ripple',
      'BNB/USD': 'binancecoin', 'BNB/USDT': 'binancecoin', 'BNBUSDT': 'binancecoin',
      'ADA/USD': 'cardano', 'ADA/USDT': 'cardano', 'ADAUSDT': 'cardano',
      'DOGE/USD': 'dogecoin', 'DOGE/USDT': 'dogecoin', 'DOGEUSDT': 'dogecoin',
      'DOT/USD': 'polkadot', 'DOT/USDT': 'polkadot', 'DOTUSDT': 'polkadot',
      'AVAX/USD': 'avalanche-2', 'AVAX/USDT': 'avalanche-2', 'AVAXUSDT': 'avalanche-2',
      'MATIC/USD': 'matic-network', 'MATIC/USDT': 'matic-network', 'MATICUSDT': 'matic-network',
      'LINK/USD': 'chainlink', 'LINK/USDT': 'chainlink', 'LINKUSDT': 'chainlink',
    };
    const normalized = symbol.replace(/[\/\-]/g, '').replace('USD', 'USDT').toUpperCase();
    // Try direct match first
    for (const [key, id] of Object.entries(map)) {
      if (key.toUpperCase() === normalized || key.toUpperCase() === symbol.toUpperCase()) return id;
    }
    // Fallback: extract base currency
    const base = symbol.split('/')[0].toUpperCase();
    for (const [key, id] of Object.entries(map)) {
      if (key.startsWith(base)) return id;
    }
    return base.toLowerCase();
  }

  /**
   * CoinGecko fallback for when Binance is blocked/unreachable (common on Railway).
   * Free, no auth required, works on cloud platforms.
   */
  private async _fetchCoinGeckoFallback(symbol: string): Promise<{ price: number; rsi: number; macd: string }> {
    try {
      const coingeckoId = this._symbolToCoingeckoId(symbol);
      const cgUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`;
      const cgRes = await axios.get(cgUrl, { timeout: 5000 });
      const cgPrice = cgRes.data?.[coingeckoId]?.usd;
      if (cgPrice && cgPrice > 0) {
        this.logger.debug(`📊 CoinGecko fallback for ${symbol}: price=${cgPrice}`);
        return { price: cgPrice, rsi: 50, macd: 'غير متوفر' };
      }
    } catch (error: any) {
      this.logger.debug(`📊 CoinGecko fallback also failed for ${symbol}: ${error.message}`);
    }
    return { price: 0, rsi: 50, macd: 'غير متوفر' };
  }

  /**
   * Format MACD summary from closing prices using the shared calcMacdScalar utility.
   * Returns an Arabic string for backward compatibility with AI prompts.
   */
  private _formatMacd(closes: number[]): string {
    if (closes.length < 26) return 'غير متوفر (بيانات غير كافية)';
    const result = calcMacdScalar(closes);
    const direction = result.macd > 0 ? 'صاعد' : 'هبوطي';
    return `${direction} (القيمة: ${result.macd.toFixed(2)})`;
  }
}
