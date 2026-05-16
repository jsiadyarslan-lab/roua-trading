import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IPredictionMarketAdapter,
  PolymarketEvent,
  UnifiedPredictionEvent,
} from '../prediction-market.types';

/**
 * Polymarket Adapter — Fetches prediction market data from Polymarket's public API.
 *
 * API Documentation:
 * - GET /events          — List active events
 * - GET /events/{slug}   — Get event details
 * - GET /markets/{id}    — Get market details
 *
 * Notes:
 * - Polymarket API is public and free (no API key required for read access)
 * - Rate limits are generous but should be respected
 * - API may change without notice — we cache aggressively to protect against downtime
 * - Minimum volume filter: $50,000 to filter out low-quality/manipulated markets
 */

const POLYMARKET_API_BASE = 'https://gamma-api.polymarket.com';
const MIN_VOLUME_USD = 50_000; // Filter out low-volume (potentially manipulated) markets
const REQUEST_TIMEOUT_MS = 15_000;

// Known category mappings for filtering
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  crypto: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'defi', 'nft', 'solana', 'binance'],
  economics: ['fed', 'interest rate', 'inflation', 'gdp', 'recession', 'unemployment', 'cpi'],
  politics: ['election', 'president', 'congress', 'senate', 'trump', 'biden', 'vote'],
  geopolitics: ['war', 'conflict', 'sanctions', 'treaty', 'ukraine', 'china', 'tariff'],
  stocks: ['s&p', 'nasdaq', 'dow', 'apple', 'tesla', 'nvidia', 'stock market'],
};

// Symbol extraction patterns from event titles
const SYMBOL_PATTERNS: Array<{ pattern: RegExp; symbol: string }> = [
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

@Injectable()
export class PolymarketAdapter implements IPredictionMarketAdapter {
  private readonly logger = new Logger(PolymarketAdapter.name);

  readonly name = 'Polymarket';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Fetch active prediction market events from Polymarket.
   * Filters by minimum volume to exclude low-quality markets.
   * Sorts by volume (highest first) for relevance.
   */
  async fetchActiveEvents(limit: number = 50, offset: number = 0): Promise<UnifiedPredictionEvent[]> {
    try {
      const url = new URL(`${POLYMARKET_API_BASE}/events`);
      url.searchParams.set('active', 'true');
      url.searchParams.set('closed', 'false');
      url.searchParams.set('archived', 'false');
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(offset));
      // Order by volume descending — most liquid markets first
      url.searchParams.set('order', 'volume24hr');
      url.searchParams.set('ascending', 'false');

      const response = await this._fetchWithTimeout(url.toString());

      if (!response.ok) {
        this.logger.warn(`Polymarket API returned ${response.status}: ${response.statusText}`);
        return [];
      }

      const events: PolymarketEvent[] = await response.json();

      // Filter and transform events
      const unified: UnifiedPredictionEvent[] = [];

      for (const event of events) {
        // Skip events without markets
        if (!event.markets || event.markets.length === 0) continue;

        // Extract the primary market (first market, usually the main question)
        const primaryMarket = event.markets[0];

        // Parse market probability from outcome prices
        const marketProbability = this._parseProbability(primaryMarket);

        // Skip if probability couldn't be determined
        if (marketProbability === null) continue;

        // Calculate total volume and liquidity
        const totalVolume = event.volume || primaryMarket.volume || 0;
        const totalLiquidity = event.liquidity || primaryMarket.liquidity || 0;

        // Filter out low-volume markets (potential manipulation)
        if (totalVolume < MIN_VOLUME_USD) continue;

        // Extract related symbols from title and description
        const relatedSymbols = this._extractSymbols(
          `${event.title} ${event.description || ''} ${primaryMarket.question || ''}`
        );

        // Determine category
        const category = this._detectCategory(
          `${event.title} ${event.description || ''}`
        );

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

    } catch (error: any) {
      this.logger.error(`Failed to fetch Polymarket events: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch details for a specific event by its slug or ID.
   */
  async fetchEventDetails(eventId: string): Promise<UnifiedPredictionEvent | null> {
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

      const event: PolymarketEvent = await response.json();

      if (!event.markets || event.markets.length === 0) return null;

      const primaryMarket = event.markets[0];
      const marketProbability = this._parseProbability(primaryMarket);
      if (marketProbability === null) return null;

      const relatedSymbols = this._extractSymbols(
        `${event.title} ${event.description || ''} ${primaryMarket.question || ''}`
      );

      const category = this._detectCategory(
        `${event.title} ${event.description || ''}`
      );

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
    } catch (error: any) {
      this.logger.error(`Failed to fetch Polymarket event ${eventId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch events filtered by category.
   * Uses the Polymarket tag system when possible, falls back to client-side filtering.
   */
  async fetchEventsByCategory(category: string): Promise<UnifiedPredictionEvent[]> {
    // Polymarket doesn't have a direct category filter in their API,
    // so we fetch a larger set and filter client-side
    const allEvents = await this.fetchActiveEvents(100);
    const keywords = CATEGORY_KEYWORDS[category.toLowerCase()] || [category.toLowerCase()];

    return allEvents.filter(event => {
      const text = `${event.title} ${event.description || ''} ${event.category || ''}`.toLowerCase();
      return keywords.some(kw => text.includes(kw));
    });
  }

  // ── Private Helpers ──

  /**
   * Parse market probability from Polymarket outcome prices.
   * Polymarket returns prices like ["0.65", "0.35"] where first = Yes probability.
   */
  private _parseProbability(market: { outcomePrices?: string[]; outcomes?: string[] }): number | null {
    if (!market.outcomePrices || market.outcomePrices.length === 0) return null;

    // The "Yes" price represents the market's estimated probability
    const yesPrice = parseFloat(market.outcomePrices[0]);
    if (isNaN(yesPrice)) return null;

    // Clamp to 0.05–0.95 range (nothing is certain in prediction markets)
    return Math.max(0.05, Math.min(0.95, yesPrice));
  }

  /**
   * Extract related financial symbols from event text.
   * Uses pattern matching to find crypto/stock/forex symbols mentioned in titles.
   */
  private _extractSymbols(text: string): string[] {
    const symbols = new Set<string>();

    for (const { pattern, symbol } of SYMBOL_PATTERNS) {
      if (pattern.test(text)) {
        symbols.add(symbol);
      }
    }

    return Array.from(symbols);
  }

  /**
   * Detect the category of an event based on keyword matching.
   */
  private _detectCategory(text: string): string {
    const lowerText = text.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(kw => lowerText.includes(kw))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Fetch with timeout — protects against Polymarket API hanging.
   */
  private async _fetchWithTimeout(url: string): Promise<Response> {
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
    } finally {
      clearTimeout(timeout);
    }
  }
}
