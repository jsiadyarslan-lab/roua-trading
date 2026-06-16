// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Order Book Analysis Service (Level 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V-PHASE4: تحليل دفتر الأوامر (Level 2 Data)
//
// يجلب بيانات دفتر الأوامر من البورصة ويحللها ل:
// - حساب السيولة المتاحة عند مستويات سعرية مختلفة
// - تقدير الانزلاق السعري المتوقع (slippage estimation)
// - تحديد حجم الصفقة الأمثل (optimal order sizing)
// - اكتشاف جدران البيع/الشراء (support/resistance from order book)
// - تقييم جودة السوق (spread, depth, imbalance)
//
// البيانات تأتي من CCXT fetchOrderBook() الذي يدعم:
// - Binance: GET /api/v3/depth (حتى 5000 مستوى)
// - Bybit: GET /v5/market/orderbook (حتى 500 مستوى)
// - Alpaca: GET /v2/stocks/{symbol}/book (Level 2)

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

// ── Types ──

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookData {
  symbol: string;
  bids: OrderBookLevel[]; // Sorted high → low
  asks: OrderBookLevel[]; // Sorted low → high
  timestamp: Date;
  spread: number;           // ask[0] - bid[0]
  spreadBps: number;        // spread / midPrice * 10000
  midPrice: number;
  bestBid: number;
  bestAsk: number;
}

export interface LiquidityAnalysis {
  symbol: string;
  /** How much quantity is available within 0.5% of mid price */
  liquidityNearMid: number;
  /** How much quantity is available within 1% of mid price */
  liquidityWithin1Pct: number;
  /** How much quantity is available within 2% of mid price */
  liquidityWithin2Pct: number;
  /** Bid/ask volume imbalance (-1 = all asks, +1 = all bids) */
  volumeImbalance: number;
  /** Estimated slippage for a given order size (in basis points) */
  estimatedSlippageBps: number;
  /** Maximum order size before slippage exceeds 10bps */
  maxOrderBeforeSlippage: number;
  /** Market quality assessment */
  marketQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'ILLIQUID';
}

export interface OrderBookWall {
  price: number;
  side: 'BID' | 'ASK';
  quantity: number;
  /** How many times larger than average level */
  relativeSize: number;
}

@Injectable()
export class OrderBookAnalysisService {
  private readonly logger = new Logger(OrderBookAnalysisService.name);
  private readonly CACHE_TTL = 5_000; // 5 seconds — order book changes rapidly

  constructor(
    @Optional() private readonly redis?: RedisService,
  ) {
    this.logger.log('📖 Order Book Analysis Service initialized (Level 2)');
  }

  // ── Public API ──

  /**
   * Fetch order book data from an exchange
   *
   * Uses the CCXT fetchOrderBook() method which is available
   * for Binance, Bybit, and most major exchanges.
   *
   * @param exchange CCXT exchange instance (must be initialized)
   * @param symbol Trading pair (e.g., 'BTC/USDT')
   * @param limit Number of order book levels (default: 20)
   */
  async fetchOrderBook(
    exchange: any,
    symbol: string,
    limit: number = 20,
  ): Promise<OrderBookData | null> {
    try {
      // Check cache
      const cacheKey = `orderbook:${symbol}:${limit}`;
      if (this.redis) {
        try {
          const cached = await this.redis.get(cacheKey);
          if (cached) return JSON.parse(cached);
        } catch { /* miss */ }
      }

      // Fetch from exchange via CCXT
      const ob = await exchange.fetchOrderBook(symbol, limit);

      if (!ob || !ob.bids?.length || !ob.asks?.length) {
        this.logger.warn(`📖 No order book data for ${symbol}`);
        return null;
      }

      const bids: OrderBookLevel[] = ob.bids.map((b: number[]) => ({
        price: b[0],
        quantity: b[1],
      }));

      const asks: OrderBookLevel[] = ob.asks.map((a: number[]) => ({
        price: a[0],
        quantity: a[1],
      }));

      const bestBid = bids[0]?.price || 0;
      const bestAsk = asks[0]?.price || 0;
      const midPrice = (bestBid + bestAsk) / 2;
      const spread = bestAsk - bestBid;
      const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : 0;

      const data: OrderBookData = {
        symbol,
        bids,
        asks,
        timestamp: new Date(ob.timestamp || Date.now()),
        spread,
        spreadBps,
        midPrice,
        bestBid,
        bestAsk,
      };

      // Cache briefly
      if (this.redis) {
        try {
          await this.redis.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
        } catch { /* non-critical */ }
      }

      return data;
    } catch (error: any) {
      this.logger.warn(`📖 Failed to fetch order book for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze order book liquidity for a given symbol
   *
   * Calculates:
   * - Available liquidity at various distance from mid price
   * - Bid/ask volume imbalance (buying vs selling pressure)
   * - Estimated slippage for a given order size
   * - Market quality assessment
   */
  analyzeLiquidity(
    orderBook: OrderBookData,
    orderSize: number = 0,
    side: 'BUY' | 'SELL' = 'BUY',
  ): LiquidityAnalysis {
    const { bids, asks, midPrice } = orderBook;

    // Calculate liquidity at various price levels
    let liquidityNearMid = 0;  // Within 0.5%
    let liquidityWithin1Pct = 0;
    let liquidityWithin2Pct = 0;

    for (const level of bids) {
      const distance = Math.abs(level.price - midPrice) / midPrice;
      if (distance <= 0.005) liquidityNearMid += level.quantity;
      if (distance <= 0.01) liquidityWithin1Pct += level.quantity;
      if (distance <= 0.02) liquidityWithin2Pct += level.quantity;
    }

    for (const level of asks) {
      const distance = Math.abs(level.price - midPrice) / midPrice;
      if (distance <= 0.005) liquidityNearMid += level.quantity;
      if (distance <= 0.01) liquidityWithin1Pct += level.quantity;
      if (distance <= 0.02) liquidityWithin2Pct += level.quantity;
    }

    // Calculate volume imbalance (-1 to +1)
    const totalBidVolume = bids.reduce((sum, b) => sum + b.quantity, 0);
    const totalAskVolume = asks.reduce((sum, a) => sum + a.quantity, 0);
    const totalVolume = totalBidVolume + totalAskVolume;
    const volumeImbalance = totalVolume > 0
      ? (totalBidVolume - totalAskVolume) / totalVolume
      : 0;

    // Estimate slippage for the given order size
    let estimatedSlippageBps = 0;
    const book = side === 'BUY' ? asks : bids;

    if (orderSize > 0 && book.length > 0) {
      let remaining = orderSize;
      let totalCost = 0;

      for (const level of book) {
        const fillQty = Math.min(remaining, level.quantity);
        totalCost += fillQty * level.price;
        remaining -= fillQty;
        if (remaining <= 0) break;
      }

      const avgPrice = orderSize > remaining ? totalCost / (orderSize - remaining) : midPrice;
      estimatedSlippageBps = midPrice > 0
        ? Math.abs((avgPrice - midPrice) / midPrice) * 10000
        : 0;
    }

    // Calculate max order before slippage exceeds 10bps
    let maxOrderBeforeSlippage = 0;
    const maxSlippageTarget = 10; // 10 bps = 0.1%
    const targetBook = side === 'BUY' ? asks : bids;

    if (targetBook.length > 0) {
      let accumulatedQty = 0;
      for (const level of targetBook) {
        const slippageAtLevel = midPrice > 0
          ? Math.abs((level.price - midPrice) / midPrice) * 10000
          : 0;
        if (slippageAtLevel > maxSlippageTarget) break;
        accumulatedQty += level.quantity;
      }
      maxOrderBeforeSlippage = accumulatedQty;
    }

    // Market quality assessment
    let marketQuality: LiquidityAnalysis['marketQuality'];
    if (orderBook.spreadBps < 2 && liquidityWithin1Pct > 100000) {
      marketQuality = 'EXCELLENT'; // Tight spread + deep book
    } else if (orderBook.spreadBps < 5 && liquidityWithin1Pct > 50000) {
      marketQuality = 'GOOD';
    } else if (orderBook.spreadBps < 10 && liquidityWithin1Pct > 10000) {
      marketQuality = 'FAIR';
    } else if (orderBook.spreadBps < 50) {
      marketQuality = 'POOR';
    } else {
      marketQuality = 'ILLIQUID';
    }

    return {
      symbol: orderBook.symbol,
      liquidityNearMid,
      liquidityWithin1Pct,
      liquidityWithin2Pct,
      volumeImbalance,
      estimatedSlippageBps,
      maxOrderBeforeSlippage,
      marketQuality,
    };
  }

  /**
   * Detect large order walls in the book
   *
   * A wall is a level that is significantly larger than average,
   * indicating strong support/resistance or a large pending order.
   */
  detectWalls(orderBook: OrderBookData, minRelativeSize: number = 3): OrderBookWall[] {
    const walls: OrderBookWall[] = [];

    const avgBidSize = orderBook.bids.reduce((s, b) => s + b.quantity, 0) / (orderBook.bids.length || 1);
    const avgAskSize = orderBook.asks.reduce((s, a) => s + a.quantity, 0) / (orderBook.asks.length || 1);

    for (const bid of orderBook.bids) {
      if (bid.quantity >= avgBidSize * minRelativeSize) {
        walls.push({
          price: bid.price,
          side: 'BID',
          quantity: bid.quantity,
          relativeSize: bid.quantity / avgBidSize,
        });
      }
    }

    for (const ask of orderBook.asks) {
      if (ask.quantity >= avgAskSize * minRelativeSize) {
        walls.push({
          price: ask.price,
          side: 'ASK',
          quantity: ask.quantity,
          relativeSize: ask.quantity / avgAskSize,
        });
      }
    }

    return walls.sort((a, b) => b.relativeSize - a.relativeSize);
  }
}
