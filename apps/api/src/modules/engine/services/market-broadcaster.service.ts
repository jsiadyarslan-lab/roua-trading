// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Market Broadcaster Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { ExchangeGateway } from '../../exchange/gateway/exchange.gateway';

/**
 * Market Broadcaster Service — Real-Time Market Data Streamer
 *
 * Continuously fetches market data for tracked symbols and
 * broadcasts updates via:
 * 1. WebSocket Gateway (for connected clients)
 * 2. Redis pub/sub (for distributed consumers)
 * 3. In-memory cache (for fast API responses)
 *
 * Broadcast Strategy:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Fetch aggregated quotes for all tracked symbols         │
 * │ 2. Detect significant price changes (> 0.5%)               │
 * │ 3. Broadcast to WebSocket clients                          │
 * │ 4. Update Redis cache for API consumption                  │
 * │ 5. Publish to Redis pub/sub for microservices              │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Frequency: Every 5 seconds
 */
@Injectable()
export class MarketBroadcasterService {
  private readonly logger = new Logger(MarketBroadcasterService.name);

  /** Symbols currently being tracked */
  private trackedSymbols: Set<string> = new Set([
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
    'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL',
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD',
  ]);

  /** Minimum price change % to broadcast */
  private readonly BROADCAST_THRESHOLD = 0.5;

  /** Last known prices for change detection */
  private lastPrices: Map<string, number> = new Map();

  /** Is broadcaster currently running */
  private isBroadcasting = false;

  constructor(
    private readonly redis: RedisService,
    private readonly aggregator: MarketDataAggregatorService,
    private readonly exchangeGateway: ExchangeGateway,
  ) {
    this.logger.log('📡 Market Broadcaster initialized — streaming active');
  }

  /**
   * Main broadcast cycle — runs every 5 seconds
   *
   * Fetches quotes and broadcasts updates to all channels.
   */
  @Interval(5000)
  async broadcastMarketData(): Promise<void> {
    if (this.isBroadcasting) {
      return;
    }

    this.isBroadcasting = true;

    try {
      const symbols = Array.from(this.trackedSymbols);
      const updates: MarketUpdate[] = [];

      for (const symbol of symbols) {
        try {
          const quote = await this.aggregator.getAggregatedQuote(symbol);

          if (!quote || quote.price === 0) {
            continue;
          }

          // Check for significant price change
          const lastPrice = this.lastPrices.get(symbol);
          const priceChange = lastPrice
            ? Math.abs((quote.price - lastPrice) / lastPrice) * 100
            : 0;

          // Always update cache, but only broadcast if significant change
          await this.redis.set(
            `market:quote:${symbol}`,
            JSON.stringify({
              symbol,
              price: quote.price,
              change: quote.change,
              changePercent: quote.changePercent,
              high: quote.high,
              low: quote.low,
              volume: quote.volume,
              timestamp: new Date().toISOString(),
            }),
            30000, // 30 sec TTL
          );

          // Update last price
          this.lastPrices.set(symbol, quote.price);

          // Broadcast if significant change or first time
          if (!lastPrice || priceChange >= this.BROADCAST_THRESHOLD) {
            const update: MarketUpdate = {
              symbol,
              price: quote.price,
              change: quote.change,
              changePercent: quote.changePercent,
              high: quote.high,
              low: quote.low,
              volume: quote.volume,
              timestamp: new Date().toISOString(),
              isSignificant: priceChange >= this.BROADCAST_THRESHOLD,
            };

            updates.push(update);

            // Publish to Redis pub/sub
            await this.redis['client'].publish(
              'market:updates',
              JSON.stringify(update),
            );
          }
        } catch (error: any) {
          this.logger.debug(`📡 Broadcast error for ${symbol}: ${error.message}`);
        }
      }

      // Batch broadcast via WebSocket if there are updates
      if (updates.length > 0) {
        this._broadcastViaWebSocket(updates);
      }
    } catch (error: any) {
      this.logger.error(`📡 Broadcast cycle failed: ${error.message}`);
    } finally {
      this.isBroadcasting = false;
    }
  }

  /**
   * Add a symbol to tracking
   */
  trackSymbol(symbol: string): void {
    this.trackedSymbols.add(symbol);
    this.logger.log(`📡 Now tracking: ${symbol}`);
  }

  /**
   * Remove a symbol from tracking
   */
  untrackSymbol(symbol: string): void {
    this.trackedSymbols.delete(symbol);
    this.lastPrices.delete(symbol);
    this.logger.log(`📡 Stopped tracking: ${symbol}`);
  }

  /**
   * Get currently tracked symbols
   */
  getTrackedSymbols(): string[] {
    return Array.from(this.trackedSymbols);
  }

  /**
   * Get cached quote for a symbol
   */
  async getCachedQuote(symbol: string): Promise<MarketUpdate | null> {
    const cached = await this.redis.get(`market:quote:${symbol}`);
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Get all cached quotes
   */
  async getAllCachedQuotes(): Promise<MarketUpdate[]> {
    const symbols = Array.from(this.trackedSymbols);
    const quotes: MarketUpdate[] = [];

    for (const symbol of symbols) {
      const quote = await this.getCachedQuote(symbol);
      if (quote) {
        quotes.push(quote);
      }
    }

    return quotes;
  }

  // ── Private: WebSocket Broadcast ──

  private _broadcastViaWebSocket(updates: MarketUpdate[]): void {
    try {
      // Send to all connected WebSocket clients
      this.exchangeGateway.broadcast('market:update', {
        type: 'market_update',
        data: updates,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(`📡 WebSocket broadcast: ${updates.length} updates`);
    } catch (error: any) {
      this.logger.debug(`📡 WebSocket broadcast error: ${error.message}`);
    }
  }
}

// ── Types ──

export interface MarketUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  timestamp: string;
  isSignificant: boolean;
}
